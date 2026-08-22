import gsap from 'gsap';
import { ROW_Y, SCENE_DURATION, TTL_DURATION, TTL_WIDTH } from './stage';
import { q, qa } from '../shared/dom';
import {
  attachToRequest,
  hideRequest,
  markRequest,
  mountRequests,
  moveRequest,
  parkRequest,
  showRequest,
} from '../shared/request';
import type { SceneBuildOptions, SceneInstance, SceneModule, SceneStep } from '../types';

/**
 * Cache-Aside scene: a 24 second, four step timeline.
 *
 * Same two rules as the other scenes: every tween sits at an absolute position,
 * and every discrete change is a zero-duration tween on a `data-*` attribute
 * that GSAP reverts when the playhead moves back past it.
 *
 * Whether a read hits or misses is never authored. The simulation below walks
 * the events in time order, keeping the state of the `user:42` row, and each
 * read asks the row what it holds at the moment it arrives. Everything the
 * viewer sees comes out of that: the flash word, the path the request takes,
 * the read counter, the value chip, and how much time is left on the bar.
 */

const ID = 'cache-aside';

/** The single lane every request travels along. */
const X = 540;
/** Resting y of a request inside the client box. */
const Y_CLIENT = 620;
/** y of the `user:42` row, where a read learns whether it hit. */
const Y_CACHE = ROW_Y[0] ?? 1015;
/** y a request reaches inside the database box, above the value chip. */
const Y_DB = 1630;

/** How long a flash word stays up. */
const FLASH_HOLD = 0.4;

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

type EntryState = 'empty' | 'fresh' | 'stale';
type Value = 'v1' | 'v2';

interface ReadPlan {
  start: number;
  /** Client to cache. */
  toCache: number;
  /** Cache to database, only travelled on a miss. */
  toDb: number;
  /** Time spent at the database. */
  dwell: number;
  /** Database back up to the cache, where the row is refilled. */
  upToCache: number;
  /** Cache to client after a miss. */
  toClient: number;
  /** Cache to client after a hit. */
  hitBack: number;
}

interface WritePlan {
  start: number;
  /** Client to database; the cache is passed without stopping. */
  toDb: number;
  /** Database up to the cache, when the write invalidates on its way back. */
  upToCache?: number;
  /** Last leg to the client. */
  toClient: number;
}

const read = (
  start: number,
  toCache: number,
  legs: Partial<ReadPlan> = {},
): ReadPlan => ({
  start,
  toCache,
  toDb: 0.6,
  dwell: 0.6,
  upToCache: 0.6,
  toClient: 0.6,
  hitBack: 0.5,
  ...legs,
});

const READS: ReadPlan[] = [
  // Step 1: the first read finds nothing and fills the row on its way back.
  read(0.6, 0.5),
  // Step 2: four reads served straight from the row.
  read(6.3, 0.5),
  read(7.5, 0.5),
  read(8.7, 0.5),
  read(9.9, 0.5),
  // Step 3: the row has expired, so this one misses and refills it.
  read(13.3, 0.5),
  read(16.6, 0.5),
  // Step 4: a hit on a row the writer left behind.
  read(20.0, 0.5),
  // Step 4: the last read, quick so the scene can settle by 24.0.
  read(22.7, 0.35, { toDb: 0.4, dwell: 0.05, upToCache: 0.3, toClient: 0.15 }),
];

const WRITES: WritePlan[] = [
  // Updates the database and leaves the cache holding the old value.
  { start: 18.3, toDb: 1.0, toClient: 0.6 },
  // Updates the database and drops the entry on the way back.
  { start: 21.4, toDb: 0.8, upToCache: 0.4, toClient: 0.4 },
];

/** The write that leaves the row stale, and when the row shows it. */
const STALE_AT = 19.4;

const round = (value: number): number => Number(value.toFixed(3));

/** Fade time for a request that lands, never running past the end of the scene. */
const fadeAt = (home: number): number => Math.max(0.05, Math.min(0.15, SCENE_DURATION - home));

interface Flash {
  at: number;
  word: 'hit' | 'miss' | 'stale' | 'invalidate';
}

interface TtlSegment {
  from: number;
  to: number;
  endWidth: number;
}

interface Simulation {
  /** Per read: whether it was served from the row. */
  hit: boolean[];
  /** Per read: whether the row it hit was already out of date. */
  staleHit: boolean[];
  /** Per read: the value it carried back from the database, if it went there. */
  carried: (Value | null)[];
  entry: [number, EntryState][];
  value: [number, Value][];
  reads: [number, number][];
  db: [number, Value][];
  flashes: Flash[];
  ttl: TtlSegment[];
  /** Times the bar is emptied outright. */
  ttlClears: number[];
}

interface SimEvent {
  at: number;
  order: number;
  run: () => void;
}

/**
 * Walks the scene in time order, keeping the state of the `user:42` row. Reads
 * ask the row what it holds at the instant they arrive, so hit and miss are
 * results rather than decisions.
 */
function simulate(): Simulation {
  const hit: boolean[] = READS.map(() => false);
  const staleHit: boolean[] = READS.map(() => false);
  const carried: (Value | null)[] = READS.map(() => null);
  const entry: [number, EntryState][] = [];
  const value: [number, Value][] = [];
  const reads: [number, number][] = [];
  const db: [number, Value][] = [];
  const flashes: Flash[] = [];
  const fills: number[] = [];
  const ttlClears: number[] = [];

  let state: EntryState = 'empty';
  let dbValue: Value = 'v1';
  let readCount = 0;
  let generation = 0;

  /*
   * Two changes to the same thing at one instant would render in insertion
   * order going forwards and in reverse going backwards, so that frame would
   * depend on which way the reader scrubbed. Collapse them to what applies.
   */
  const push = <T>(series: [number, T][], at: number, next: T): void => {
    const previous = series[series.length - 1];
    if (previous && previous[0] === at) previous[1] = next;
    else series.push([at, next]);
  };

  const setState = (at: number, next: EntryState): void => {
    state = next;
    push(entry, at, next);
    if (next === 'empty') {
      generation += 1;
      ttlClears.push(at);
    }
  };

  const fill = (at: number, next: Value): void => {
    generation += 1;
    state = 'fresh';
    push(entry, at, 'fresh');
    push(value, at, next);
    fills.push(at);
  };

  const queue: SimEvent[] = [];
  let order = 0;
  const schedule = (at: number, run: () => void): void => {
    order += 1;
    queue.push({ at: round(at), order, run });
  };

  READS.forEach((plan, index) => {
    const tCache = round(plan.start + plan.toCache);
    schedule(tCache, () => {
      if (state === 'empty') {
        flashes.push({ at: tCache, word: 'miss' });
        const tDb = round(tCache + plan.toDb);
        schedule(tDb, () => {
          readCount += 1;
          push(reads, tDb, readCount);
          carried[index] = dbValue;
        });
        const tRefill = round(tDb + plan.dwell + plan.upToCache);
        schedule(tRefill, () => {
          fill(tRefill, carried[index] ?? 'v1');
          const mine = generation;
          const expiry = round(tRefill + TTL_DURATION);
          if (expiry <= SCENE_DURATION) {
            schedule(expiry, () => {
              if (generation === mine) setState(expiry, 'empty');
            });
          }
        });
        return;
      }
      hit[index] = true;
      staleHit[index] = state === 'stale';
      flashes.push({ at: tCache, word: 'hit' });
    });
  });

  WRITES.forEach((plan) => {
    const tDb = round(plan.start + plan.toDb);
    schedule(tDb, () => {
      dbValue = 'v2';
      push(db, tDb, 'v2');
    });
    if (plan.upToCache !== undefined) {
      const tCache = round(tDb + plan.upToCache);
      schedule(tCache, () => {
        setState(tCache, 'empty');
        flashes.push({ at: tCache, word: 'invalidate' });
      });
    }
  });

  // The first write leaves the row holding a value the database no longer has.
  schedule(STALE_AT, () => {
    if (state !== 'fresh') return;
    setState(STALE_AT, 'stale');
    flashes.push({ at: STALE_AT, word: 'stale' });
  });

  const done = new Set<SimEvent>();
  for (;;) {
    let next: SimEvent | undefined;
    for (const event of queue) {
      if (done.has(event)) continue;
      if (!next || event.at < next.at || (event.at === next.at && event.order < next.order)) {
        next = event;
      }
    }
    if (!next) break;
    done.add(next);
    next.run();
  }

  // A bar starts full at each refill and drains until the row is emptied or
  // the scene ends, whichever comes first.
  const ttl: TtlSegment[] = fills.map((from) => {
    const clearedAt = ttlClears.find((time) => time > from);
    const to = Math.min(clearedAt ?? SCENE_DURATION, round(from + TTL_DURATION), SCENE_DURATION);
    const endWidth = Math.max(0, TTL_WIDTH * (1 - (to - from) / TTL_DURATION));
    return { from, to, endWidth: round(endWidth) };
  });

  flashes.sort((left, right) => left.at - right.at);
  return { hit, staleHit, carried, entry, value, reads, db, flashes, ttl, ttlClears };
}

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const rows = qa<SVGGElement>(stage, '.ca-row');
  const mainRow = rows[0];
  const ttlFills = qa<SVGRectElement>(stage, '.ca-ttl-fill');
  const dbChip = q<SVGGElement>(stage, '.ca-db-chip', ID);
  const requestLayer = q<SVGGElement>(stage, '.scene-requests', ID);

  const sim = simulate();
  const requests = mountRequests(requestLayer, READS.length + WRITES.length, ID);

  const tl = gsap.timeline({ paused: true });

  const attr = (name: string, value: string, at: number): void => {
    tl.set(stage, { attr: { [name]: value }, immediateRender: false }, at);
  };
  const rowAttr = (name: string, value: string, at: number): void => {
    if (!mainRow) return;
    tl.set(mainRow, { attr: { [name]: value }, immediateRender: false }, at);
  };

  // --- row state, counters and flashes, straight from the simulation ------

  for (const [at, state] of sim.entry) rowAttr('data-entry', state, at);
  for (const [at, value] of sim.value) rowAttr('data-value', value, at);
  for (const [at, count] of sim.reads) attr('data-reads', String(count), at);
  for (const [at, value] of sim.db) attr('data-db', value, at);

  for (const flash of sim.flashes) {
    attr('data-flash', flash.word, flash.at);
    attr('data-flash', 'none', round(flash.at + FLASH_HOLD));
    if (flash.word === 'miss') tl.call(() => cue('state'), undefined, flash.at);
    if (flash.word === 'hit') tl.call(() => cue('success'), undefined, flash.at);
    if (flash.word === 'invalidate') tl.call(() => cue('trip'), undefined, flash.at);
  }

  // --- the TTL bar of the row the scene follows ---------------------------

  const mainFill = ttlFills[0];
  if (mainFill) {
    for (const segment of sim.ttl) {
      tl.set(mainFill, { attr: { width: TTL_WIDTH }, immediateRender: false }, segment.from);
      tl.to(
        mainFill,
        {
          attr: { width: segment.endWidth },
          duration: Math.max(segment.to - segment.from, 0.01),
          ease: 'none',
          immediateRender: false,
        },
        segment.from,
      );
    }
    for (const at of sim.ttlClears) {
      tl.set(mainFill, { attr: { width: 0 }, immediateRender: false }, at);
    }
  }

  // The two background rows never expire; they just tick down all scene.
  for (const fill of ttlFills.slice(1)) {
    tl.to(fill, { attr: { width: TTL_WIDTH * 0.4 }, duration: SCENE_DURATION, ease: 'none' }, 0);
  }

  // --- reads ---------------------------------------------------------------

  READS.forEach((plan, index) => {
    const parts = requests[index];
    if (!parts) return;
    parkRequest(parts, X, Y_CLIENT);

    const tCache = round(plan.start + plan.toCache);
    showRequest(tl, parts, plan.start);
    moveRequest(tl, parts, Y_CACHE, plan.toCache, plan.start);

    if (sim.hit[index]) {
      const home = round(tCache + plan.hitBack);
      markRequest(tl, parts, 'ok', tCache);
      // A hit on a row the writer left behind comes back ringed, not just green.
      if (sim.staleHit[index]) {
        tl.set(parts.halo, { opacity: 1, immediateRender: false }, tCache);
        tl.to(parts.halo, { opacity: 0, duration: 0.2, immediateRender: false }, home);
      }
      moveRequest(tl, parts, Y_CLIENT, plan.hitBack, tCache);
      tl.call(() => cue('success'), undefined, home);
      hideRequest(tl, parts, home);
      return;
    }

    const tDb = round(tCache + plan.toDb);
    const tUp = round(tDb + plan.dwell);
    const tRefill = round(tUp + plan.upToCache);
    const home = round(tRefill + plan.toClient);

    // The value only rides along between the database and the cache.
    const chip = attachToRequest(
      parts,
      'text',
      { class: 'scene-req-chip', x: '32', y: '9' },
      sim.carried[index] ?? 'v1',
    );

    moveRequest(tl, parts, Y_DB, plan.toDb, tCache);
    tl.set(chip, { opacity: 1, immediateRender: false }, tUp);
    moveRequest(tl, parts, Y_CACHE, plan.upToCache, tUp);
    tl.set(chip, { opacity: 0, immediateRender: false }, tRefill);
    markRequest(tl, parts, 'ok', tRefill);
    moveRequest(tl, parts, Y_CLIENT, plan.toClient, tRefill);
    tl.call(() => cue('success'), undefined, home);
    hideRequest(tl, parts, home, fadeAt(home));
  });

  // --- writes --------------------------------------------------------------

  WRITES.forEach((plan, index) => {
    const parts = requests[READS.length + index];
    if (!parts) return;
    parkRequest(parts, X, Y_CLIENT);
    // A write is a square, not a dot, and says so while it is on its way.
    gsap.set(parts.dot, { opacity: 0 });
    const square = attachToRequest(parts, 'rect', {
      class: 'scene-req-square',
      x: '-7',
      y: '-7',
      width: '14',
      height: '14',
      rx: '2',
    });
    const label = attachToRequest(
      parts,
      'text',
      { class: 'scene-req-label', x: '26', y: '8' },
      'write',
    );

    const tDb = round(plan.start + plan.toDb);
    const tCache = plan.upToCache === undefined ? tDb : round(tDb + plan.upToCache);
    const home = round(tCache + plan.toClient);

    showRequest(tl, parts, plan.start);
    tl.set([square, label], { opacity: 1, immediateRender: false }, plan.start);
    moveRequest(tl, parts, Y_DB, plan.toDb, plan.start);
    tl.set([square, label], { opacity: 0, immediateRender: false }, tDb);
    markRequest(tl, parts, 'ok', tDb);
    if (plan.upToCache !== undefined) {
      moveRequest(tl, parts, Y_CACHE, plan.upToCache, tDb);
      moveRequest(tl, parts, Y_CLIENT, plan.toClient, tCache);
    } else {
      moveRequest(tl, parts, Y_CLIENT, plan.toClient, tDb);
    }
    tl.call(() => cue('success'), undefined, home);
    hideRequest(tl, parts, home, fadeAt(home));
  });

  // --- set pieces ----------------------------------------------------------

  // The stage is complete on the first frame: an empty row, two filled rows,
  // the database on v1 and nothing read yet.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  // The database value visibly changes when the first write lands.
  const firstWrite = sim.db[0];
  if (firstWrite) {
    tl.fromTo(
      dbChip,
      { scale: 1 },
      {
        scale: 1.18,
        transformOrigin: '50% 50%',
        duration: 0.2,
        yoyo: true,
        repeat: 1,
        ease: 'sine.out',
        immediateRender: false,
      },
      firstWrite[0],
    );
  }

  // Pin the total length so the scrub bar covers the closing hold.
  tl.to({}, { duration: 0.01 }, SCENE_DURATION - 0.01);

  // Render once in each direction so every zero-duration tween records its
  // start value before a reader can scrub backwards past it.
  tl.progress(1, true).progress(0, true).pause();

  return { tl, steps: STEPS };
}

const scene: SceneModule = {
  id: ID,
  duration: SCENE_DURATION,
  build,
};

export default scene;
