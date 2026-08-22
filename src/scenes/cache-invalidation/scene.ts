import gsap from 'gsap';
import {
  BUS,
  LANE_X,
  SCENE_DURATION,
  TTL_SECONDS,
  TTL_SECONDS_VERSIONED,
  TTL_WIDTH,
  Y_CACHE,
} from './stage';
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
 * Cache Invalidation scene: a 24 second, four step timeline.
 *
 * Same two rules as the other scenes: every tween sits at an absolute position,
 * and every discrete change is a zero-duration tween on a `data-*` attribute
 * that GSAP reverts when the playhead moves back past it.
 *
 * Nothing about the three instances is authored. The simulation below walks the
 * scene in time order, keeping each instance's key, value and expiry, and asks
 * it what it holds at the instant a read arrives. Staleness is derived rather
 * than declared: an entry is stale exactly when its value differs from the one
 * the database holds at that moment. That is what makes step 3 work, where a
 * slow read refills an instance with a value the database has already replaced.
 */

const ID = 'cache-invalidation';

/** Resting y of a request inside the client box. */
const Y_CLIENT = 620;
/** y a request reaches inside the database box, above the value chips. */
const Y_DB = 1610;

/** How many instances the node holds. */
const INSTANCES = 3;

type Value = 'v1' | 'v2' | 'v3' | 'v4' | 'v5';
type EntryState = 'empty' | 'fresh' | 'stale';
type KeyName = 'plain' | 'v4' | 'v5';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

interface ReadPlan {
  start: number;
  inst: number;
  toCache: number;
  /** Legs used only when the read misses. */
  toDb: number;
  dwell: number;
  upToCache: number;
  toClient: number;
  /** Leg used only when the read hits. */
  hitBack: number;
}

const read = (start: number, inst: number, legs: Partial<ReadPlan> = {}): ReadPlan => ({
  start,
  inst,
  toCache: 0.4,
  toDb: 0.45,
  dwell: 0.05,
  upToCache: 0.45,
  toClient: 0.4,
  hitBack: 0.4,
  ...legs,
});

const READS: ReadPlan[] = [
  // Step 1: three reads served the value the write already replaced.
  read(1.8, 0, { toCache: 0.5, hitBack: 0.5 }),
  read(2.6, 1, { toCache: 0.5, hitBack: 0.5 }),
  read(3.4, 2, { toCache: 0.5, hitBack: 0.5 }),
  // Step 1: after the TTL expires, one read refills from the database.
  read(4.8, 1, { toCache: 0.25, toDb: 0.3, upToCache: 0.3, toClient: 0.2 }),
  // Step 2: this read beats the invalidate message to its instance.
  read(7.2, 1, { toCache: 0.5, hitBack: 0.5 }),
  // Step 2: three reads refill what the messages emptied.
  read(8.6, 0),
  read(9.4, 1),
  read(10.2, 2),
  // Step 3: a deliberately slow read, the one that loses the race.
  read(12.3, 0, { toDb: 0.4, dwell: 0.4, upToCache: 0.7 }),
  // Step 3: two reads served the value that slow read put back.
  read(14.8, 0),
  read(15.6, 0),
  // Step 3: the short TTL expires and this read repairs the instance.
  read(16.8, 0, { toCache: 0.3, toDb: 0.35, upToCache: 0.35, toClient: 0.1 }),
  // Step 4: the version bumped, so every instance misses on the new key.
  read(19.8, 0),
  read(20.6, 1),
  read(21.4, 2),
];

interface WritePlan {
  start: number;
  toDb: number;
  toClient: number;
  value: Value;
  /** When the writer publishes an invalidate on the bus, if it does. */
  publishAt?: number;
}

const WRITES: WritePlan[] = [
  { start: 0.6, toDb: 0.8, toClient: 0.6, value: 'v2' },
  { start: 6.5, toDb: 0.8, toClient: 0.6, value: 'v3', publishAt: 7.4 },
  { start: 13.0, toDb: 0.8, toClient: 0.6, value: 'v4', publishAt: 13.7 },
  { start: 18.6, toDb: 0.8, toClient: 0.6, value: 'v5' },
];

/** When each published message reaches each instance. */
const MESSAGE_ARRIVALS = [
  [7.6, 7.9, 8.2],
  [13.9, 14.2, 14.5],
];

const round = (value: number): number => Number(value.toFixed(3));
const fadeAt = (home: number): number => Math.max(0.05, Math.min(0.15, SCENE_DURATION - home));

interface Change<T> {
  at: number;
  inst: number;
  value: T;
}

interface TtlSegment {
  inst: number;
  from: number;
  to: number;
  startWidth: number;
  endWidth: number;
}

interface Simulation {
  /** Per read: whether the instance had an entry when it arrived. */
  hit: boolean[];
  /** Per read: whether the value it returned was already out of date. */
  stale: boolean[];
  /** Per read: the value it carried up from the database, if it went there. */
  carried: (Value | null)[];
  entry: Change<EntryState>[];
  value: Change<Value>[];
  key: Change<KeyName>[];
  old: Change<'off' | 'v4'>[];
  ttl: TtlSegment[];
  ttlClears: { at: number; inst: number }[];
  db: [number, Value][];
  version: [number, string][];
  staleReads: [number, number][];
}

interface Slot {
  state: EntryState;
  value: Value;
  key: KeyName;
  /** Generation, so a superseded expiry is ignored when it comes round. */
  generation: number;
}

/**
 * Walks the scene in time order. Reads ask their instance what it holds at the
 * instant they arrive, so hit, miss and staleness are all results.
 */
function simulate(): Simulation {
  const hit = READS.map(() => false);
  const stale = READS.map(() => false);
  const carried: (Value | null)[] = READS.map(() => null);
  const entry: Change<EntryState>[] = [];
  const value: Change<Value>[] = [];
  const key: Change<KeyName>[] = [];
  const old: Change<'off' | 'v4'>[] = [];
  const fills: { inst: number; at: number; width: number; seconds: number }[] = [];
  const ttlClears: { at: number; inst: number }[] = [];
  const db: [number, Value][] = [];
  const version: [number, string][] = [];
  const staleReads: [number, number][] = [];

  const slots: Slot[] = Array.from({ length: INSTANCES }, () => ({
    state: 'fresh' as EntryState,
    value: 'v1' as Value,
    key: 'plain' as KeyName,
    generation: 0,
  }));
  let dbValue: Value = 'v1';
  let staleCount = 0;

  /*
   * Two changes to the same thing at one instant would render in insertion
   * order going forwards and in reverse going backwards, so that frame would
   * depend on which way the reader scrubbed. Collapse them.
   */
  const push = <T>(series: Change<T>[], at: number, inst: number, next: T): void => {
    // Scan back over everything already recorded at this instant, not just the
    // last entry: the version bump touches all three instances in two passes,
    // so a second change for instance 1 arrives after instance 3's first one.
    for (let i = series.length - 1; i >= 0; i -= 1) {
      const candidate = series[i];
      if (!candidate || candidate.at !== at) break;
      if (candidate.inst === inst) {
        candidate.value = next;
        return;
      }
    }
    series.push({ at, inst, value: next });
  };
  const pushPair = <T>(series: [number, T][], at: number, next: T): void => {
    const previous = series[series.length - 1];
    if (previous && previous[0] === at) previous[1] = next;
    else series.push([at, next]);
  };

  const setDb = (at: number, next: Value): void => {
    if (dbValue === next) return;
    dbValue = next;
    pushPair(db, at, next);
  };

  /** An entry is stale exactly when it disagrees with the database. */
  const refreshStale = (at: number): void => {
    slots.forEach((slot, inst) => {
      if (slot.state === 'empty') return;
      const next: EntryState = slot.value === dbValue ? 'fresh' : 'stale';
      if (slot.state === next) return;
      slot.state = next;
      push(entry, at, inst, next);
    });
  };

  const clear = (at: number, inst: number): void => {
    const slot = slots[inst];
    if (!slot || slot.state === 'empty') return;
    slot.state = 'empty';
    slot.generation += 1;
    push(entry, at, inst, 'empty');
    ttlClears.push({ at, inst });
  };

  const store = (at: number, inst: number, next: Value, width: number, seconds: number): void => {
    const slot = slots[inst];
    if (!slot) return;
    slot.generation += 1;
    slot.value = next;
    slot.state = next === dbValue ? 'fresh' : 'stale';
    push(value, at, inst, next);
    push(entry, at, inst, slot.state);
    fills.push({ inst, at, width, seconds });
  };

  interface Task {
    at: number;
    order: number;
    run: () => void;
  }
  const queue: Task[] = [];
  let order = 0;
  const schedule = (at: number, run: () => void): void => {
    order += 1;
    queue.push({ at: round(at), order, run });
  };

  /** Fills a slot and books the expiry that goes with it. */
  const fill = (at: number, inst: number, next: Value, width: number, seconds: number): void => {
    store(at, inst, next, width, seconds);
    const slot = slots[inst];
    if (!slot) return;
    const mine = slot.generation;
    const expiry = round(at + (width / TTL_WIDTH) * seconds);
    if (expiry > SCENE_DURATION) return;
    schedule(expiry, () => {
      if (slots[inst]?.generation === mine) clear(expiry, inst);
    });
  };

  // The scene opens with all three instances holding v1 on a bar that is
  // already 70% spent, which is what expires at 4.62.
  for (let inst = 0; inst < INSTANCES; inst += 1) {
    fill(0, inst, 'v1', TTL_WIDTH * 0.7, TTL_SECONDS);
  }

  // Step boundaries set up the situation each step is about.
  schedule(6, () => {
    setDb(6, 'v2');
    for (let inst = 0; inst < INSTANCES; inst += 1) fill(6, inst, 'v2', TTL_WIDTH * 0.95, TTL_SECONDS);
  });
  schedule(12, () => {
    setDb(12, 'v3');
    clear(12, 0);
    for (let inst = 1; inst < INSTANCES; inst += 1) fill(12, inst, 'v3', TTL_WIDTH * 0.95, TTL_SECONDS);
  });
  schedule(18, () => {
    setDb(18, 'v4');
    pushPair(version, 18, '4');
    for (let inst = 0; inst < INSTANCES; inst += 1) {
      const slot = slots[inst];
      if (slot) {
        slot.key = 'v4';
        push(key, 18, inst, 'v4');
      }
      fill(18, inst, 'v4', TTL_WIDTH, TTL_SECONDS_VERSIONED);
    }
  });

  WRITES.forEach((plan, index) => {
    const tDb = round(plan.start + plan.toDb);
    schedule(tDb, () => {
      setDb(tDb, plan.value);
      refreshStale(tDb);
      // The last write bumps the version, which orphans every entry at once.
      if (plan.value === 'v5') {
        pushPair(version, tDb, '5');
        for (let inst = 0; inst < INSTANCES; inst += 1) {
          const slot = slots[inst];
          if (!slot) continue;
          clear(tDb, inst);
          slot.key = 'v5';
          push(key, tDb, inst, 'v5');
          push(old, tDb, inst, 'v4');
        }
      }
    });
    if (plan.publishAt === undefined) return;
    const published = WRITES.slice(0, index).filter((other) => other.publishAt !== undefined).length;
    const arrivals = MESSAGE_ARRIVALS[published];
    if (!arrivals) return;
    arrivals.forEach((at, inst) => {
      // A message that lands on a slot which is already empty does nothing.
      schedule(at, () => clear(at, inst));
    });
  });

  // The orphaned entries age out once the new ones are in place.
  schedule(22.8, () => {
    for (let inst = 0; inst < INSTANCES; inst += 1) push(old, 22.8, inst, 'off');
  });

  READS.forEach((plan, index) => {
    const tCache = round(plan.start + plan.toCache);
    schedule(tCache, () => {
      const slot = slots[plan.inst];
      if (!slot) return;
      if (slot.state !== 'empty') {
        hit[index] = true;
        stale[index] = slot.value !== dbValue;
        if (stale[index]) {
          staleCount += 1;
          pushPair(staleReads, tCache, staleCount);
        }
        return;
      }
      const tDb = round(tCache + plan.toDb);
      schedule(tDb, () => {
        // The value is read at this instant, which is what loses step 3's race.
        carried[index] = dbValue;
      });
      const tRefill = round(tDb + plan.dwell + plan.upToCache);
      schedule(tRefill, () => {
        const carriedValue = carried[index] ?? 'v1';
        // Step 3's refill is deliberately given a short life so it self-heals.
        const short = tRefill > 14 && tRefill < 15;
        const versioned = tRefill >= 18;
        fill(
          tRefill,
          plan.inst,
          carriedValue,
          short ? TTL_WIDTH * 0.3636 : TTL_WIDTH,
          versioned ? TTL_SECONDS_VERSIONED : TTL_SECONDS,
        );
      });
    });
  });

  const done = new Set<Task>();
  for (;;) {
    let next: Task | undefined;
    for (const task of queue) {
      if (done.has(task)) continue;
      if (!next || task.at < next.at || (task.at === next.at && task.order < next.order)) next = task;
    }
    if (!next) break;
    done.add(next);
    next.run();
  }

  const ttl: TtlSegment[] = fills.map((entryFill) => {
    const stop = ttlClears
      .filter((clearAt) => clearAt.inst === entryFill.inst && clearAt.at > entryFill.at)
      .map((clearAt) => clearAt.at)
      .sort((a, b) => a - b)[0];
    const natural = round(entryFill.at + (entryFill.width / TTL_WIDTH) * entryFill.seconds);
    const to = Math.min(stop ?? SCENE_DURATION, natural, SCENE_DURATION);
    const rate = TTL_WIDTH / entryFill.seconds;
    return {
      inst: entryFill.inst,
      from: entryFill.at,
      to,
      startWidth: round(entryFill.width),
      endWidth: round(Math.max(0, entryFill.width - rate * (to - entryFill.at))),
    };
  });

  return { hit, stale, carried, entry, value, key, old, ttl, ttlClears, db, version, staleReads };
}

const MESSAGE_MARKUP = '<path class="ci-msg" d="M 0 -11 L 11 0 L 0 11 L -11 0 Z" />';

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const instances = qa<SVGGElement>(stage, '.ci-inst');
  const ttlFills = qa<SVGRectElement>(stage, '.ci-ttl-fill');
  const messageLayer = q<SVGGElement>(stage, '.ci-messages', ID);
  const requestLayer = q<SVGGElement>(stage, '.scene-requests', ID);

  const sim = simulate();
  const requests = mountRequests(requestLayer, READS.length + WRITES.length, ID);

  const published = WRITES.filter((plan) => plan.publishAt !== undefined);
  messageLayer.innerHTML = published.map(() => MESSAGE_MARKUP).join('');
  const messages = qa<SVGPathElement>(messageLayer, '.ci-msg');

  const tl = gsap.timeline({ paused: true });

  const attr = (name: string, value: string, at: number): void => {
    tl.set(stage, { attr: { [name]: value }, immediateRender: false }, at);
  };
  const instAttr = (inst: number, name: string, value: string, at: number): void => {
    const target = instances[inst];
    if (!target) return;
    tl.set(target, { attr: { [name]: value }, immediateRender: false }, at);
  };

  // --- instance state, database and counters, from the simulation ---------

  for (const change of sim.entry) instAttr(change.inst, 'data-entry', change.value, change.at);
  for (const change of sim.value) instAttr(change.inst, 'data-value', change.value, change.at);
  for (const change of sim.key) instAttr(change.inst, 'data-key', change.value, change.at);
  for (const change of sim.old) instAttr(change.inst, 'data-old', change.value, change.at);
  for (const [at, value] of sim.db) attr('data-db', value, at);
  for (const [at, value] of sim.version) attr('data-version', value, at);
  for (const [at, count] of sim.staleReads) attr('data-stale-reads', String(count), at);

  // --- TTL bars ------------------------------------------------------------

  for (const segment of sim.ttl) {
    const bar = ttlFills[segment.inst];
    if (!bar) continue;
    tl.set(bar, { attr: { width: segment.startWidth }, immediateRender: false }, segment.from);
    tl.to(
      bar,
      {
        attr: { width: segment.endWidth },
        duration: Math.max(segment.to - segment.from, 0.01),
        ease: 'none',
        immediateRender: false,
      },
      segment.from,
    );
  }
  for (const cleared of sim.ttlClears) {
    const bar = ttlFills[cleared.inst];
    if (bar) tl.set(bar, { attr: { width: 0 }, immediateRender: false }, cleared.at);
  }
  // --- invalidate messages along the bus -----------------------------------

  published.forEach((plan, index) => {
    const message = messages[index];
    const arrivals = MESSAGE_ARRIVALS[index];
    if (!message || !arrivals) return;
    const publishAt = plan.publishAt ?? 0;
    gsap.set(message, { x: BUS.from, y: BUS.y, opacity: 0 });
    tl.set(message, { opacity: 1, immediateRender: false }, publishAt);

    let from = publishAt;
    arrivals.forEach((at, inst) => {
      const x = LANE_X[inst] ?? BUS.from;
      tl.to(message, { x, duration: Math.max(at - from, 0.01), ease: 'none' }, from);
      tl.call(() => cue('trip'), undefined, at);
      from = at;
    });
    const last = arrivals[arrivals.length - 1] ?? publishAt;
    tl.to(message, { x: BUS.to, duration: 0.15, ease: 'none' }, last);
    tl.to(message, { opacity: 0, duration: 0.15, immediateRender: false }, last);
  });

  // --- reads ---------------------------------------------------------------

  READS.forEach((plan, index) => {
    const parts = requests[index];
    if (!parts) return;
    const lane = LANE_X[plan.inst] ?? 540;
    parkRequest(parts, lane, Y_CLIENT);

    const tCache = round(plan.start + plan.toCache);
    showRequest(tl, parts, plan.start);
    moveRequest(tl, parts, Y_CACHE, plan.toCache, plan.start);

    if (sim.hit[index]) {
      const home = round(tCache + plan.hitBack);
      markRequest(tl, parts, 'ok', tCache);
      if (sim.stale[index]) {
        // A value the database has already replaced comes back ringed amber.
        tl.set(parts.halo, { opacity: 1, immediateRender: false }, tCache);
        tl.to(parts.halo, { opacity: 0, duration: 0.2, immediateRender: false }, home);
        tl.call(() => cue('failure'), undefined, home);
      } else {
        tl.call(() => cue('success'), undefined, home);
      }
      moveRequest(tl, parts, Y_CLIENT, plan.hitBack, tCache);
      hideRequest(tl, parts, home, fadeAt(home));
      return;
    }

    const tDb = round(tCache + plan.toDb);
    const tUp = round(tDb + plan.dwell);
    const tRefill = round(tUp + plan.upToCache);
    const home = round(tRefill + plan.toClient);

    tl.call(() => cue('state'), undefined, tCache);
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
    parkRequest(parts, LANE_X[1] ?? 540, Y_CLIENT);
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
    const home = round(tDb + plan.toClient);
    showRequest(tl, parts, plan.start);
    tl.set([square, label], { opacity: 1, immediateRender: false }, plan.start);
    moveRequest(tl, parts, Y_DB, plan.toDb, plan.start);
    tl.set([square, label], { opacity: 0, immediateRender: false }, tDb);
    markRequest(tl, parts, 'ok', tDb);
    moveRequest(tl, parts, Y_CLIENT, plan.toClient, tDb);
    hideRequest(tl, parts, home, fadeAt(home));
  });

  // --- set pieces ----------------------------------------------------------

  // The stage is complete on the first frame: three instances on v1 with time
  // left on the bar, the database on v1, and nothing read yet.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

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
