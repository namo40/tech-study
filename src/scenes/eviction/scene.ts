import {
  CAPACITY,
  INITIAL_KEYS,
  INITIAL_STATE,
  NORMALIZED,
  SCENE_DURATION,
  X_LANE,
  Y_APP,
  Y_CACHE_BOTTOM,
  Y_CACHE_TOP,
  Y_ORIGIN,
} from './stage';
import type { CellState, KeyId } from './stage';
import { q, qa } from '../shared/dom';
import {
  hideRequest,
  markRequest,
  mountRequests,
  moveRequest,
  parkRequest,
  showRequest,
} from '../shared/request';
import type { RequestResult } from '../shared/request';
import { collapseAtInstant, createScheduler } from '../shared/simulation';
import { attr, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Eviction scene: a 24 second, four step timeline.
 *
 * Same two rules as the other scenes: every tween sits at an absolute position,
 * and every discrete change is a zero-duration tween on a `data-*` attribute
 * that GSAP reverts when the playhead moves back past it.
 *
 * Nothing the reader watches is placed by hand. The scene is told six things:
 * what the cache already holds, when each read is issued and for which key, how
 * big the cache is, when the policy is adopted, when the key is normalized, and
 * when the hottest entry is pinned. One pass over the whole 24 seconds turns
 * that into everything else — which cell each key lands in, how bright each cell
 * is, which entry the policy chooses when there is no room, how many reads the
 * cache answered and how many the origin had to, and where every sound falls.
 *
 * Three derivations carry the scene, and they are the argument it is making.
 *
 * The victim is never named. `pickVictim` sorts the occupied cells by the time
 * each was last read and takes the last one, so the entry that leaves is
 * whichever entry the reads left alone longest. That is also why the brightness
 * ladder and the choice cannot disagree: both are the same sort, so the cell the
 * policy takes is always the cell the reader could already see was dimmest.
 *
 * A miss sounds like a failure only when it is one. A read for a key the cache
 * has never held is the cache warming up and sounds as a state change; a read
 * for a key the policy pushed out is the bill for that decision arriving, and
 * that is the sound the scene reserves `failure` for. The simulation knows the
 * difference because it remembers what it evicted, so nothing about it is
 * annotated.
 *
 * Pressure is a count, not a mood. Normalizing the key does not free a slot by
 * fiat: the variants resolve to one key, the duplicate cells fold into one, and
 * `size` falls out of that. The read that was already in flight then lands in
 * the freed cell instead of taking someone else's, which is why the third step
 * ends with the cache full again and nobody else pushed out.
 */

const ID = 'eviction';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- how a traveller moves -------------------------------------------------

/** Seconds a hop takes on each lane. Both run at very nearly one speed. */
const LEG_TOP = 0.2;
const LEG_BOTTOM = 0.24;
/** Seconds a box spends handing a traveller from one lane to the other. */
const HOP = 0.08;
/** Seconds the origin spends on a read before the answer is ready. */
const DWELL = 0.3;
/** Headway a lane keeps between one traveller leaving it and the next entering. */
const GAP = 0.1;
/** How long a traveller takes to fade once the box it reached has absorbed it. */
const FADE = 0.06;

// --- what the scene is told ------------------------------------------------

interface Ask {
  /** When the App would like to issue this read. The lane may make it wait. */
  at: number;
  key: KeyId;
}

/**
 * The reads, in the order the App issues them. Every number below is an input;
 * nothing else in this file is.
 *
 * The shape of the run is the argument. The first step only ever asks for keys
 * the cache has or has room for, so nothing is evicted and the ladder is the
 * only thing that moves. The second asks for one key too many and then asks
 * again for the key that lost its slot. The third asks for the same answer
 * under three spellings. The fourth replays the second against a pinned entry.
 */
const ASKS: Ask[] = [
  // Step 1 — two cold reads fill the last two cells, then four reads land in them.
  { at: 0.4, key: 'k5' },
  { at: 1.84, key: 'k6' },
  { at: 3.28, key: 'k4' },
  { at: 3.78, key: 'k6' },
  { at: 4.28, key: 'k2' },
  { at: 4.78, key: 'k4' },
  // Step 2 — a seventh key against six cells, then the key that lost its cell.
  { at: 6.46, key: 'k7' },
  { at: 8.7, key: 'k1' },
  { at: 10.14, key: 'k7' },
  { at: 10.64, key: 'k1' },
  { at: 11.14, key: 'k6' },
  // Step 3 — two spellings of one answer, the honest key they cost, then reads
  // under a spelling that now resolves to the entry the others folded into.
  { at: 12.32, key: 'v-a' },
  { at: 13.76, key: 'v-b' },
  { at: 15.2, key: 'k5' },
  { at: 16.64, key: 'v-c' },
  { at: 17.14, key: 'k1' },
  // Step 4 — the same pressure, once, with the hot entry pinned.
  { at: 18.66, key: 'k3' },
  { at: 20.1, key: 'k1' },
  { at: 20.6, key: 'k8' },
  { at: 21.1, key: 'k1' },
  { at: 21.6, key: 'k1' },
];

/** When the cache first has to choose, and says out loud how it will. */
const POLICY_AT = 6.9;
/** When the App starts normalizing the key before it is used. */
const NORMALIZE_AT = 15.64;
/** How long the cache takes to re-key what it is already holding. */
const COLLAPSE_DELAY = 0.24;
/** When the hottest entry is taken out of the policy's reach. */
const PIN_AT = 18.4;
/** The closing beats: the miss count is held up, and then the stage settles. */
const CONTRAST_AT = 22.06;
const SETTLE_AT = 22.4;

// --- what one pass over the scene produces ---------------------------------

interface Series {
  at: number;
  value: string;
}

/** A value the stage shows, and the entries that change it. */
interface Track {
  series: Series[];
  value: string;
}

/** One leg of one journey. Every leg is a move along one of the two lanes. */
interface Traveller {
  kind: 'read' | 'origin' | 'answer';
  start: number;
  from: number;
  to: number;
  duration: number;
  /** The marker the traveller pops where it turns around, if it pops one. */
  result: RequestResult | null;
  /** Seconds spent at the far end before coming back, if it comes back. */
  dwell: number;
  back: boolean;
}

interface CellTracks {
  state: Track;
  key: Track;
  pin: Track;
}

interface Simulation {
  travellers: Traveller[];
  stage: Record<string, Track>;
  cells: CellTracks[];
  cues: [number, SceneCue][];
}

const track = (initial: string): Track => ({ series: [], value: initial });

/**
 * Walks the whole scene in time order.
 *
 * The cache holds three small pieces of state: what is in each cell, when each
 * of those was last read, and which one entry is out of reach. Every read asks
 * the first — do you have this — and every insertion asks the other two — is
 * there room, and if not, who has waited longest without being pinned. Those
 * are the only questions, and everything the reader sees is an answer to one of
 * them.
 */
function simulate(): Simulation {
  const travellers: Traveller[] = [];
  const cues: [number, SceneCue][] = [];

  const stage: Record<string, Track> = {
    ask: track('none'),
    size: track(String(INITIAL_KEYS.length)),
    hits: track('0'),
    misses: track('0'),
    load: track('0'),
    policy: track('off'),
    norm: track('off'),
    work: track('off'),
    mark: track('off'),
    settled: track('off'),
  };

  const cells: CellTracks[] = Array.from({ length: CAPACITY }, (_value, index) => ({
    state: track(INITIAL_STATE[index] ?? 'empty'),
    key: track(INITIAL_KEYS[index] ?? 'none'),
    pin: track('off'),
  }));

  const set = (target: Track, at: number, next: string): void => {
    if (target.value === next) return;
    target.value = next;
    collapseAtInstant(target.series, { at: round(at), value: next }, () => 'value');
  };

  const cue = (at: number, name: SceneCue): void => {
    if (at < 0 || at > SCENE_DURATION) return;
    cues.push([round(at), name]);
  };

  // --- what the cache currently is -----------------------------------------

  /** What is in each cell, by cell, or nothing. */
  const slots: (KeyId | null)[] = Array.from({ length: CAPACITY }, () => null);
  /** When each resident key was last read. Older than the scene means never. */
  const used = new Map<KeyId, number>();
  /** Keys the policy has taken a slot away from at least once. */
  const evicted = new Set<KeyId>();
  /** The one entry the policy may not choose. */
  let pinned: KeyId | null = null;
  /** The cell the policy has chosen and not yet emptied. */
  let victim: number | null = null;
  /** Whether the App is normalizing the key before it is used. */
  let normalizing = false;

  let hits = 0;
  let misses = 0;
  let loads = 0;

  /** When each lane is next free. One traveller at a time, either way. */
  let topFree = 0;
  let bottomFree = 0;

  /** The read the ask plate is currently naming. */
  let openAsk = 0;
  let askSeq = 0;

  const { schedule, drain } = createScheduler();

  INITIAL_KEYS.forEach((key, index) => {
    slots[index] = key;
    used.set(key, index - INITIAL_KEYS.length);
  });

  const occupied = (): number => slots.filter((key) => key !== null).length;

  /** The key a read is actually for, once the App is normalizing its keys. */
  const resolve = (key: KeyId): KeyId => (normalizing ? (NORMALIZED[key] ?? key) : key);

  /** Resident keys, most recently read first, with the pinned one left out. */
  const rank = (): number[] =>
    slots
      .map((key, index) => ({ key, index }))
      .filter((cell) => cell.key !== null && cell.key !== pinned)
      .sort((left, right) => (used.get(right.key as KeyId) ?? 0) - (used.get(left.key as KeyId) ?? 0))
      .map((cell) => cell.index);

  /**
   * Writes every cell from the ranking, so brightness is never set by hand.
   * The dimmest rung is the end of the ranking, which is the entry the policy
   * would take next; the brightest is the front of it, and the pinned entry
   * sits at the front by definition because the policy cannot reach it.
   */
  const syncCells = (at: number): void => {
    const ranked = rank();
    const total = ranked.length;
    const rungs = new Map<number, CellState>();
    ranked.forEach((index, place) => {
      const rung: CellState =
        place === total - 1 ? 'cold' : place === 0 ? 'hot' : place <= (total - 1) / 2 ? 'warm' : 'cool';
      rungs.set(index, rung);
    });
    slots.forEach((key, index) => {
      const cell = cells[index];
      if (!cell) return;
      const state: CellState =
        index === victim ? 'victim' : key === null ? 'empty' : key === pinned ? 'hot' : (rungs.get(index) ?? 'cold');
      set(cell.state, at, state);
      set(cell.key, at, key ?? 'none');
      set(cell.pin, at, key !== null && key === pinned ? 'on' : 'off');
    });
    set(stage.size as Track, at, String(occupied()));
  };

  // --- the two lanes, one traveller at a time -------------------------------

  /** Reserves the App-to-Cache lane for `span` seconds from the first free moment. */
  const takeTop = (want: number, span: number): number => {
    const start = round(Math.max(want, topFree));
    topFree = round(start + span + GAP);
    return start;
  };

  /** Reserves the Cache-to-Origin lane for a whole round trip. */
  const takeBottom = (want: number): number => {
    const start = round(Math.max(want, bottomFree));
    bottomFree = round(start + 2 * LEG_BOTTOM + DWELL + GAP);
    return start;
  };

  // --- one read, from the moment the App lets it onto the lane --------------

  /**
   * The entry that has waited longest without a reader, once the pinned one is
   * set aside. Nothing else in the file decides who leaves.
   */
  function pickVictim(at: number): void {
    if (occupied() < CAPACITY) return;
    const ranked = rank();
    const choice = ranked[ranked.length - 1];
    if (choice === undefined) return;
    victim = choice;
    syncCells(at);
    cue(at, 'state');
  }

  /** Puts `key` into a cell, taking the chosen one away from whoever had it. */
  function install(key: KeyId, at: number): void {
    const returning = evicted.has(key);
    if (victim !== null && occupied() === CAPACITY) {
      const leaving = slots[victim];
      if (leaving) evicted.add(leaving);
      slots[victim] = null;
    }
    victim = null;
    const free = slots.indexOf(null);
    if (free >= 0) slots[free] = key;
    used.set(key, at);
    evicted.delete(key);
    syncCells(at);
    // A key coming back is the cost of the eviction being paid off; a key
    // arriving for the first time is the cache filling up.
    cue(at, returning ? 'success' : 'state');
  }

  /** The App gets its answer back, and the ask plate goes quiet if it was the last. */
  function deliver(want: number, id: number): void {
    const start = takeTop(want, LEG_TOP);
    travellers.push({
      kind: 'answer',
      start,
      from: Y_CACHE_TOP,
      to: Y_APP,
      duration: LEG_TOP,
      result: null,
      dwell: 0,
      back: false,
    });
    const home = round(start + LEG_TOP);
    schedule(home, () => {
      if (openAsk === id) set(stage.ask as Track, home, 'none');
    });
  }

  /** The round trip a miss pays for, and the insertion it comes home with. */
  function fetch(want: number, key: KeyId, id: number): void {
    const start = takeBottom(want);
    travellers.push({
      kind: 'origin',
      start,
      from: Y_CACHE_BOTTOM,
      to: Y_ORIGIN,
      duration: LEG_BOTTOM,
      result: 'ok',
      dwell: DWELL,
      back: true,
    });
    const reaches = round(start + LEG_BOTTOM);
    schedule(reaches, () => {
      set(stage.work as Track, reaches, 'on');
      loads += 1;
      set(stage.load as Track, reaches, String(loads));
    });
    const leaves = round(reaches + DWELL);
    schedule(leaves, () => {
      set(stage.work as Track, leaves, 'off');
      pickVictim(leaves);
    });
    const back = round(leaves + LEG_BOTTOM);
    schedule(back, () => {
      install(key, back);
      deliver(round(back + HOP), id);
    });
  }

  function ask(want: number, raw: KeyId): void {
    // The lane is reserved for a round trip, because whether this read comes
    // straight back is not known until it arrives.
    const start = takeTop(want, 2 * LEG_TOP);
    const key = resolve(raw);
    const held = slots.includes(key);
    askSeq += 1;
    const id = askSeq;
    openAsk = id;
    set(stage.ask as Track, start, raw);
    // A read that has begun is the most recent thing there is, which is also
    // what keeps the policy from taking the cell out from under it.
    if (held) {
      used.set(key, start);
      syncCells(start);
    }

    travellers.push({
      kind: 'read',
      start,
      from: Y_APP,
      to: Y_CACHE_TOP,
      duration: LEG_TOP,
      result: held ? 'ok' : 'fail',
      dwell: 0,
      back: held,
    });

    const lands = round(start + LEG_TOP);
    if (held) {
      schedule(lands, () => {
        hits += 1;
        set(stage.hits as Track, lands, String(hits));
        used.set(key, lands);
        syncCells(lands);
        cue(lands, 'success');
      });
      const home = round(lands + LEG_TOP);
      schedule(home, () => {
        if (openAsk === id) set(stage.ask as Track, home, 'none');
      });
      return;
    }

    schedule(lands, () => {
      misses += 1;
      set(stage.misses as Track, lands, String(misses));
      // A key the cache never had is the cache warming up. A key the policy
      // pushed out is the bill for that decision, and it is the only miss the
      // scene calls a failure.
      cue(lands, evicted.has(key) ? 'failure' : 'state');
      fetch(round(lands + HOP), key, id);
    });
  }

  // --- the run the scene is given ------------------------------------------

  for (const entry of ASKS) schedule(entry.at, () => ask(entry.at, entry.key));

  schedule(POLICY_AT, () => {
    set(stage.policy as Track, POLICY_AT, 'lru');
    cue(POLICY_AT, 'trip');
  });

  schedule(NORMALIZE_AT, () => {
    normalizing = true;
    set(stage.norm as Track, NORMALIZE_AT, 'on');
    cue(NORMALIZE_AT, 'trip');
  });

  const collapseAt = round(NORMALIZE_AT + COLLAPSE_DELAY);
  schedule(collapseAt, () => {
    // Re-keying what is already held: every variant resolves to one key, so the
    // duplicate cells fold into whichever of them was read most recently.
    const folded = new Map<KeyId, number>();
    let changed = false;
    slots.forEach((key, index) => {
      if (key === null) return;
      const canonical = NORMALIZED[key];
      if (!canonical) return;
      changed = true;
      const seat = folded.get(canonical);
      const when = used.get(key) ?? 0;
      if (seat === undefined) {
        folded.set(canonical, index);
        slots[index] = canonical;
        used.set(canonical, when);
        return;
      }
      if (when > (used.get(canonical) ?? 0)) used.set(canonical, when);
      slots[index] = null;
    });
    if (!changed) return;
    syncCells(collapseAt);
    cue(collapseAt, 'success');
  });

  schedule(PIN_AT, () => {
    const ranked = rank();
    const hottest = ranked[0];
    if (hottest === undefined) return;
    pinned = slots[hottest] ?? null;
    syncCells(PIN_AT);
    cue(PIN_AT, 'trip');
  });

  schedule(CONTRAST_AT, () => {
    set(stage.mark as Track, CONTRAST_AT, 'on');
    cue(CONTRAST_AT, 'state');
  });

  schedule(SETTLE_AT, () => {
    set(stage.settled as Track, SETTLE_AT, 'on');
    cue(SETTLE_AT, 'success');
  });

  drain();
  cues.sort((left, right) => left[0] - right[0]);

  return { travellers, stage, cells, cues };
}

// --- the timeline ----------------------------------------------------------

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const requestLayer = q<SVGGElement>(stage, '.scene-requests', ID);

  const sim = simulate();
  const requests = mountRequests(requestLayer, sim.travellers.length, ID);

  const tl = createSceneTimeline();

  // --- everything the stage says about itself -----------------------------

  for (const [name, value] of Object.entries(sim.stage)) {
    for (const entry of value.series) attr(tl, stage, `data-ev-${name}`, entry.value, entry.at);
  }

  const cellGroups = qa<SVGGElement>(stage, '.ev-cell');
  sim.cells.forEach((cell, index) => {
    const element = cellGroups[index];
    if (!element) return;
    const pairs: [string, Track][] = [
      ['data-ev-cell', cell.state],
      ['data-ev-key', cell.key],
      ['data-ev-pin', cell.pin],
    ];
    for (const [name, value] of pairs) {
      for (const entry of value.series) attr(tl, element, name, entry.value, entry.at);
    }
  });

  // --- the travellers -----------------------------------------------------

  sim.travellers.forEach((traveller, index) => {
    const parts = requests[index];
    if (!parts) return;
    parts.group.classList.add(`ev-req--${traveller.kind}`);

    parkRequest(parts, X_LANE, traveller.from);
    showRequest(tl, parts, traveller.start);
    moveRequest(tl, parts, traveller.to, traveller.duration, traveller.start);

    const lands = round(traveller.start + traveller.duration);
    if (traveller.result) markRequest(tl, parts, traveller.result, lands);
    if (!traveller.back) {
      hideRequest(tl, parts, lands, FADE);
      return;
    }
    const turn = round(lands + traveller.dwell);
    moveRequest(tl, parts, traveller.from, traveller.duration, turn);
    hideRequest(tl, parts, round(turn + traveller.duration), FADE);
  });

  // --- sounds and step labels ---------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // The stage is complete on the first frame: four of the six cells taken, the
  // ladder under them already leaning, and nothing on either lane.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
