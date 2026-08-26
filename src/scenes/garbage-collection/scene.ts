import {
  ALLOC_MAX,
  GAUGE_W,
  GEN0_SLOTS,
  GEN1_SLOTS,
  GEN2_SLOTS,
  HATCH_SECONDS,
  HEAP_BASE_MB,
  HEAP_LIMIT_MB,
  LANE_COUNT,
  LANE_W,
  LOH_SLOTS,
  MB_PER_BLOCK,
  MB_PER_SLOT,
  PAUSE_MS,
  POOL_SLOTS,
  SCENE_DURATION,
  SERVER_FOOTPRINT,
  SERVER_PAUSE_FACTOR,
  SPEED,
  STAGE_STATE,
  TICK_SLOTS,
  X_ALLOC,
  X_EVENT,
  Y_ALLOC_OUT,
  Y_EVENT,
  Y_HEAP,
  allocIndex,
  countIndex,
  heapIndex,
  meterWidth,
  p99Index,
  pauseIndex,
  tickSlot,
} from './stage';
import type { LastGc, Mode, Source } from './stage';
import { q } from '../shared/dom';
import { hideRequest, mountRequests, parkRequest, showRequest } from '../shared/request';
import { collapseAtInstant, createScheduler } from '../shared/simulation';
import { attr, fadeAt, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Garbage Collection scene: a 24 second, four step timeline.
 *
 * Same two rules as the other scenes: every tween sits at an absolute position,
 * and every discrete change is a zero-duration tween on a `data-*` attribute
 * that GSAP reverts when the playhead moves back past it.
 *
 * Nothing on this stage is placed by hand. The scene is told six things and one
 * pass of the scheduler derives the rest:
 *
 *   1. an allocation plan — how many megabytes a second the threads allocate,
 *      how many of every twelve objects are still referenced when gen0 fills,
 *      how much of gen2 a full collection keeps, and how often a request wants
 *      a buffer large enough to skip the generations altogether;
 *   2. the gen0 budget, which is the only thing that decides when a collection
 *      runs — the collector runs as often as you fill gen0, and that is the
 *      whole lever the third step is about;
 *   3. the size of each generation and of the large object heap;
 *   4. what a collection costs, in the milliseconds the ticks are labelled with;
 *   5. where the buffer comes from, and which collector mode is running;
 *   6. the container's memory limit, from which the heap hard limit follows.
 *
 * Everything the reader sees falls out of walking that: which square is filled
 * and whether it is still referenced, when a collection runs and which
 * generation it reaches, what gets promoted, how the large object heap
 * fragments, where the ticks land on the event axis, and every one of the four
 * readouts. No occupancy and no reading is written down.
 *
 * Two samplings, declared once. The allocation stream is drawn at no more than
 * eight dots a second, so one dot stands for as many objects as the current
 * rate produces between two dots — at 80 MB/s that is one, at 500 MB/s it is
 * six and a quarter. And a square is a sample of the population a generation
 * holds rather than a fixed object: the byte figure the collector schedules on
 * is the gen0 budget, and the heap reading is summed from `MB_PER_SLOT` and
 * `MB_PER_BLOCK`. Neither sampling touches a label: every millisecond, every
 * megabyte and every percentage on the stage is the value the model holds.
 *
 * One time compression, also declared: a pause of one millisecond cannot be
 * seen, so the hatch over the request lanes is held for a fixed length by
 * generation — a tenth of a second for an ephemeral collection, six tenths for
 * a full one — while the tick keeps the real figure. The heap reading walks
 * across that window rather than dropping through it, because the collector is
 * sweeping for the whole of it.
 *
 * The four steps are one run. Nothing is reset at a boundary and nothing is
 * introduced at one: gen2 and the large object heap already hold the long-lived
 * objects of a warm process on the first frame, the rate changes at 12.2, 15.0,
 * 18.8, 20.2 and 22.6, and the collector mode changes at 18.6. Every one of
 * those instants is inside a step, not on the edge of one.
 */

const ID = 'garbage-collection';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- what the scene is told -----------------------------------------------

/**
 * The allocation plan. Each entry is the value reached `RAMP` seconds after the
 * instant it names, so the gauge and the counter walk between two rates instead
 * of stepping, and no plan change lands on a step boundary.
 */
interface Segment {
  at: number;
  /** Megabytes a second the request threads allocate. */
  rate: number;
  /** How many of every `GEN0_SLOTS` objects are still referenced. */
  survive: number;
  /** Share of gen2 a full collection finds still referenced. */
  gen2Survive: number;
  /** Every n-th sampled batch wants a buffer too large for the generations. */
  bigEvery: number;
}

const SEGMENTS: Segment[] = [
  { at: 0, rate: 80, survive: 3, gen2Survive: 0.25, bigEvery: 0 },
  { at: 12.2, rate: 500, survive: 3, gen2Survive: 0.25, bigEvery: 3 },
  { at: 15, rate: 50, survive: 3, gen2Survive: 0.25, bigEvery: 3 },
  { at: 18.8, rate: 240, survive: 3, gen2Survive: 0.25, bigEvery: 3 },
  { at: 19.8, rate: 240, survive: 10, gen2Survive: 0.92, bigEvery: 3 },
  { at: 22.2, rate: 110, survive: 2, gen2Survive: 0.15, bigEvery: 3 },
];

/** Seconds a plan change takes to arrive, so a readout never teleports. */
const RAMP = 0.6;

/** Where the buffer comes from, and which collector is running. */
const SOURCE_AT: [number, Source][] = [
  [0, 'new'],
  [15, 'pool'],
];
const MODE_AT: [number, Mode][] = [
  [0, 'workstation'],
  [18.6, 'server'],
];

/** When the heap hard limit is drawn on the meter. */
const LIMIT_AT = 20;
/** The one request in the second step that asks for a buffer of its own. */
const BIG_AT = [9];
/**
 * How long after the process is killed the fix lands, and how much of gen2 is
 * still referenced once the long-lived set has been bounded. Both are told to
 * the scene: what the fix is worth is not something the model can derive.
 */
const RECOVER_DELAY = 0.4;
const RECOVERY_KEEP = 0.15;
/**
 * After this the run is over: nothing is deposited and nothing is collected, so
 * the closing frame is a settled heap with no dot in the air and no pause in
 * flight. It is the hold every scene ends on.
 */
const QUIET_FROM = 23.2;

/**
 * The gen0 budget: the megabytes of allocation that fill gen0 and therefore
 * schedule every ephemeral collection in the scene. It is never drawn, because
 * nothing on the stage claims a per-square size.
 */
const GEN0_BUDGET_MB = 120;
/** Megabytes of allocation one gen0 square stands for. */
const MB_PER_ALLOC_SLOT = GEN0_BUDGET_MB / GEN0_SLOTS;

/** How much of a full large object heap survives; the rest is left as holes. */
const LOH_SURVIVE = 0.5;

/** The stream is drawn at no more than this many dots a second. */
const DOT_RATE_MAX = 8;
/** First and last dot, so neither the opening nor the closing frame carries one. */
const FIRST_LAUNCH = 0.2;
const LAST_LAUNCH = 23.1;

/** How long a dot takes to cross each lane. */
const ALLOC_LEG = (Y_HEAP - Y_ALLOC_OUT) / SPEED;
const EVENT_LEG = (Y_EVENT - Y_HEAP) / SPEED;
/**
 * How long a dot takes to disappear once it has been absorbed, and the clear
 * air the dot behind it needs. A stream that lands on one spot would otherwise
 * have two dots on that spot at once, so every fade is clipped to leave the
 * follower an empty halo: what a sampled stream costs is worked out, not
 * guessed at.
 */
const FADE = 0.12;
const CLEARANCE = 0.03;
/**
 * The clear air between two dots on a lane, in seconds of travel. A thread
 * stopped a moment after it let a dot go would otherwise release the next one
 * right behind it when the world starts again, so the first launch after a stop
 * waits until the dot ahead has this much of the lane to itself.
 */
const LANE_CLEAR_TIME = 0.06;

/** What the process is holding on the first frame: a warm service, not a cold one. */
const GEN2_WARM = 8;
const LOH_WARM = 3;

/** The lanes in the Threads box: one request each, over and over. */
const SERVICE_TIME = 1.6;
const LANE_CLEAR = 0.12;
const LANE_GAP = 0.4;
const LANE_STAGGER = 0.5;

/** Readout windows, and the latency a request has before any collector runs. */
const PAUSE_WINDOW = 3;
/**
 * How long a pause keeps showing in the tail. A percentile ages out of its
 * window rather than falling off it, so the contribution decays to nothing
 * over this many seconds and the readout walks back down.
 */
const P99_DECAY = 1.2;
const P99_BASE = 45;
/**
 * How near the hard limit the collector starts trying harder. Above this share
 * of it every collection is a full one, which is what "run close to the limit
 * and collections become constant" means in practice.
 */
const LIMIT_PRESSURE = 0.9;
/** Queueing a high allocation rate adds on its own, before any pause. */
const queueMs = (rate: number): number => Math.max(0, (rate - 100) / 10);

/** How often the readouts are sampled, and how long a bar takes to follow. */
const SAMPLE = 0.05;
const BAR_MOVE = 0.12;

/** Seconds between two readout cues, so a walking number is not a rattle. */
const READOUT_CUE_GAP = 1.2;
/** How near a step boundary a cue may not land. */
const BOUNDARY_CLEAR = 0.25;

// --- what the simulation produces -----------------------------------------

interface AttrChange {
  at: number;
  key: string;
  name: string;
  value: string;
}

interface Flight {
  t0: number;
  y0: number;
  t1: number;
  y1: number;
}

interface Mover {
  x: number;
  showAt: number;
  hideAt: number;
  fade: number;
  legs: Flight[];
  kind: 'alloc' | 'big' | 'event';
}

interface BarStep {
  at: number;
  width: number;
  duration: number;
}

interface LaneLeg {
  lane: number;
  at: number;
  width: number;
  duration: number;
}

interface Simulation {
  attrs: AttrChange[];
  movers: Mover[];
  gauge: BarStep[];
  meter: BarStep[];
  lanes: LaneLeg[];
  cues: [number, SceneCue][];
}

/** What one square of a generation is holding. */
type Cell = 'empty' | 'dead' | 'live';
/** What one block of the large object heap is holding, holes included. */
type Block = 'empty' | 'dead' | 'live' | 'gap';

// --- reading the plan ------------------------------------------------------

const segmentAt = (t: number): number => {
  let index = 0;
  for (let i = 0; i < SEGMENTS.length; i += 1) {
    const segment = SEGMENTS[i];
    if (segment && segment.at <= t) index = i;
  }
  return index;
};

/** A planned value at `t`, walked over `RAMP` seconds from the one before it. */
const planned = (t: number, pick: (segment: Segment) => number): number => {
  const index = segmentAt(t);
  const current = SEGMENTS[index];
  if (!current) return 0;
  const previous = SEGMENTS[index - 1];
  if (!previous || t >= current.at + RAMP) return pick(current);
  const share = (t - current.at) / RAMP;
  return pick(previous) + (pick(current) - pick(previous)) * share;
};

const rateAt = (t: number): number => planned(t, (s) => s.rate);
const surviveAt = (t: number): number => planned(t, (s) => s.survive);
const gen2SurviveAt = (t: number): number => planned(t, (s) => s.gen2Survive);
const bigEveryAt = (t: number): number => SEGMENTS[segmentAt(t)]?.bigEvery ?? 0;

const stepwise = <T>(table: [number, T][], t: number): T => {
  let value = table[0]?.[1] as T;
  for (const [at, entry] of table) if (at <= t) value = entry;
  return value;
};

const sourceAt = (t: number): Source => stepwise(SOURCE_AT, t);

// --- the simulation --------------------------------------------------------

function simulate(): Simulation {
  const raw: AttrChange[] = [];
  const movers: Mover[] = [];
  const cues: [number, SceneCue][] = [];
  /** Every window the request threads are held still, hatch or otherwise. */
  const stops: [number, number][] = [];
  /** Every collection, with the milliseconds it really cost. */
  const pauses: { at: number; ms: number }[] = [];
  /** The heap reading, as a walk rather than a series of jumps. */
  const heap: { at: number; mb: number }[] = [];

  const setAttr = (at: number, key: string, name: string, value: string): void => {
    collapseAtInstant(
      raw,
      { at: round(at), key, name, value },
      (item) => `${item.key}@${item.name}`,
    );
  };
  const cue = (at: number, name: SceneCue): void => {
    cues.push([round(at), name]);
  };

  // --- the heap ------------------------------------------------------------

  const gen0: Cell[] = Array.from({ length: GEN0_SLOTS }, () => 'empty');
  const gen1: Cell[] = Array.from({ length: GEN1_SLOTS }, () => 'empty');
  const gen2: Cell[] = Array.from({ length: GEN2_SLOTS }, () => 'empty');
  const loh: Block[] = Array.from({ length: LOH_SLOTS }, () => 'empty');
  const pool: string[] = Array.from({ length: POOL_SLOTS }, () => 'off');

  for (let i = 0; i < GEN2_WARM; i += 1) gen2[i] = 'live';
  for (let i = 0; i < LOH_WARM; i += 1) loh[i] = 'live';

  const painted = {
    gen0: gen0.map(() => 'empty'),
    gen1: gen1.map(() => 'empty'),
    gen2: gen2.map(() => 'empty'),
    loh: loh.map(() => 'empty'),
    pool: pool.map(() => 'off'),
  };

  const used = (cells: Cell[]): number => cells.filter((cell) => cell !== 'empty').length;
  const liveOf = (cells: Cell[]): number => cells.filter((cell) => cell === 'live').length;
  /** Blocks the heap is holding, holes included: a hole is memory, not space. */
  const lohHeld = (): number => loh.filter((block) => block !== 'empty').length;
  /**
   * Blocks the collector counts against the large object budget. A hole left by
   * a collected block does not count, which is why fragmentation shows up as a
   * heap that stays large rather than as a collection that comes sooner.
   */
  const lohAllocated = (): number =>
    loh.filter((block) => block === 'live' || block === 'dead').length;

  let mode: Mode = 'workstation';

  const heapMb = (): number => {
    const base =
      HEAP_BASE_MB +
      (used(gen0) + used(gen1) + used(gen2)) * MB_PER_SLOT +
      lohHeld() * MB_PER_BLOCK;
    return Number((base * (mode === 'server' ? SERVER_FOOTPRINT : 1)).toFixed(2));
  };

  /** Writes every square that changed, and the reading that follows from them. */
  const paint = (at: number): void => {
    const rows: [string, string[], string[], string][] = [
      ['gen0', gen0 as string[], painted.gen0, 'data-obj'],
      ['gen1', gen1 as string[], painted.gen1, 'data-obj'],
      ['gen2', gen2 as string[], painted.gen2, 'data-obj'],
      ['loh', loh as string[], painted.loh, 'data-block'],
      ['pool', pool, painted.pool, 'data-rent'],
    ];
    for (const [name, cells, last, attrName] of rows) {
      cells.forEach((cell, index) => {
        if (last[index] === cell) return;
        last[index] = cell;
        setAttr(at, `${name}-${index}`, attrName, cell);
      });
    }
    const mb = heapMb();
    const previous = heap[heap.length - 1];
    if (previous && previous.at === round(at)) previous.mb = mb;
    else if (!previous || previous.mb !== mb) heap.push({ at: round(at), mb });
  };

  heap.push({ at: 0, mb: heapMb() });
  paint(0);

  // --- the collector -------------------------------------------------------

  let gcCount = 0;
  let oom: 'off' | 'on' | 'clear' = 'off';
  const tickTaken: boolean[] = Array.from({ length: TICK_SLOTS }, () => false);

  /** The first free square of a generation, filling from the left. */
  const firstFree = (cells: Cell[]): number => cells.indexOf('empty');

  const promote = (from: Cell[], to: Cell[]): number => {
    let moved = 0;
    for (let i = 0; i < from.length; i += 1) {
      if (from[i] !== 'live') continue;
      const slot = firstFree(to);
      if (slot < 0) break;
      to[slot] = 'live';
      moved += 1;
    }
    for (let i = 0; i < from.length; i += 1) from[i] = 'empty';
    return moved;
  };

  /** A full collection compacts, so the survivors close up from the left. */
  const compact = (cells: Cell[]): void => {
    const kept = cells.filter((cell) => cell !== 'empty');
    for (let i = 0; i < cells.length; i += 1) cells[i] = kept[i] ?? 'empty';
  };

  const roomFor = (cells: Cell[], count: number): boolean =>
    cells.filter((cell) => cell === 'empty').length >= count;

  /** Which generation a collection triggered at `t` has to reach. */
  const generationFor = (): number => {
    if (lohAllocated() >= LOH_SLOTS) return 2;
    if (heapMb() > LIMIT_PRESSURE * HEAP_LIMIT_MB) return 2;
    const fromGen0 = liveOf(gen0);
    if (roomFor(gen1, fromGen0)) return 0;
    if (roomFor(gen2, liveOf(gen1))) return 1;
    return 2;
  };

  const collect = (at: number, generation: number, forced = false, keep?: number): void => {
    // The closing hold is not allowed to swallow the collection that answers an
    // OOM, which is the only one the scene books rather than derives.
    if (at > QUIET_FROM && !forced) return;
    const serverFull = mode === 'server' && generation === 2;
    const ms = (PAUSE_MS[generation] ?? 1) * (serverFull ? SERVER_PAUSE_FACTOR : 1);
    const hatch = HATCH_SECONDS[generation] ?? 0.1;
    const done = round(at + hatch);

    pauses.push({ at: round(at), ms });
    gcCount += 1;

    setAttr(at, 'stage', 'data-stw', 'on');
    setAttr(at, 'stage', 'data-gccount', String(countIndex(gcCount)));
    const last: LastGc =
      generation === 2 ? (serverFull ? 'gen2-server' : 'gen2') : generation === 1 ? 'gen1' : 'gen0';
    setAttr(at, 'stage', 'data-lastgc', last);
    cue(at, generation === 2 ? 'failure' : 'trip');

    // The tick lands in the slot its own instant names, or the next one free.
    let slot = tickSlot(at);
    while (slot < TICK_SLOTS && tickTaken[slot]) slot += 1;
    if (slot < TICK_SLOTS) {
      tickTaken[slot] = true;
      // The tick carries the mode it was collected under, so a tick already on
      // the axis keeps its shape when the collector is switched behind it.
      setAttr(
        at,
        `tick-${slot}`,
        'data-gctick',
        `gen${generation}${mode === 'server' ? '-server' : ''}`,
      );
    }

    // The collector writes the event down while it still has the threads.
    movers.push({
      x: X_EVENT,
      showAt: round(at),
      hideAt: round(at + EVENT_LEG),
      fade: FADE,
      legs: [{ t0: round(at), y0: Y_HEAP, t1: round(at + EVENT_LEG), y1: Y_EVENT }],
      kind: 'event',
    });

    if (!forced) stops.push([round(at), done]);

    // The sweep itself, which the reader sees when the world starts again.
    const before = heapMb();
    let moved = 0;
    if (generation === 2) {
      // Only the share of gen2 still referenced is kept; everything the sweep
      // walked past is gone, and the survivors close up from the left.
      const survives = Math.round(liveOf(gen2) * (keep ?? gen2SurviveAt(at)));
      let kept = 0;
      for (let i = 0; i < gen2.length; i += 1) {
        if (gen2[i] === 'live' && kept < survives) kept += 1;
        else gen2[i] = 'empty';
      }
      moved += promote(gen1, gen2);
      moved += promote(gen0, gen1);
      // A large block that dies leaves a hole rather than free space: that is
      // what fragmentation on the large object heap costs.
      const blocks = loh.filter((block) => block === 'live').length;
      const survivors = Math.floor(blocks * LOH_SURVIVE);
      let seen = 0;
      for (let i = 0; i < loh.length; i += 1) {
        if (loh[i] !== 'live') continue;
        seen += 1;
        if (seen > survivors) loh[i] = 'gap';
      }
      compact(gen2);
    } else if (generation === 1) {
      moved += promote(gen1, gen2);
      moved += promote(gen0, gen1);
    } else {
      moved += promote(gen0, gen1);
    }

    heap.push({ at: round(at), mb: before });
    paint(done);
    setAttr(done, 'stage', 'data-stw', oom === 'on' ? 'on' : 'off');

    if (moved > 0) {
      setAttr(round(at + hatch * 0.5), 'stage', 'data-promoted', 'on');
      setAttr(round(done + 0.35), 'stage', 'data-promoted', 'off');
      // A promotion into gen2 is the transition worth hearing: it is how a
      // cheap collection turns into an expensive one later.
      if (generation > 0) cue(round(at + hatch * 0.5), 'state');
    }
  };

  // --- the allocation stream ----------------------------------------------

  const scheduler = createScheduler();
  const { schedule, drain } = scheduler;

  /** The stop covering `t`, if the threads are being held at that instant. */
  const stopAt = (t: number): [number, number] | undefined =>
    stops.find(([start, end]) => t > start && t < end);

  let dotIndex = 0;
  let lastLaunch = -Infinity;
  /** Fractional squares carried between two dots, so no allocation is lost. */
  let slotDebt = 0;
  /** Fractional survivors, so exactly `survive` of every twelve are referenced. */
  let liveDebt = 0;
  const launches: { at: number; kind: 'alloc' | 'big'; dots: number }[] = [];

  const deposit = (at: number, index: number): void => {
    if (at > QUIET_FROM) return;
    const covering = stopAt(at);
    if (covering) {
      schedule(round(covering[1] + (at - covering[0])), () =>
        deposit(round(covering[1] + (at - covering[0])), index),
      );
      return;
    }

    const launch = launches[index];
    if (!launch) return;

    if (launch.kind === 'big') {
      if (sourceAt(launch.at) === 'pool') {
        const free = pool.indexOf('free');
        if (free >= 0) {
          pool[free] = 'rented';
          schedule(round(at + 0.8), () => {
            pool[free] = 'free';
            paint(round(at + 0.8));
          });
        }
      } else {
        const slot = loh.findIndex((block) => block === 'empty' || block === 'gap');
        if (slot >= 0) loh[slot] = 'live';
      }
    }

    // One dot carries whatever the rate produced since the dot before it, so
    // capping how many dots are drawn never changes how fast gen0 fills.
    slotDebt += rateAt(launch.at) / (launch.dots * MB_PER_ALLOC_SLOT);
    const share = surviveAt(launch.at) / GEN0_SLOTS;
    while (slotDebt >= 1) {
      slotDebt -= 1;
      const slot = firstFree(gen0);
      if (slot < 0) break;
      liveDebt += share;
      if (liveDebt >= 1) {
        liveDebt -= 1;
        gen0[slot] = 'live';
      } else gen0[slot] = 'dead';
    }
    paint(at);

    if (oom === 'off' && at >= LIMIT_AT && heapMb() > HEAP_LIMIT_MB) {
      oom = 'on';
      setAttr(at, 'stage', 'data-oom', 'on');
      setAttr(at, 'stage', 'data-stw', 'on');
      cue(at, 'failure');
      const fixAt = round(at + RECOVER_DELAY);
      const until = round(fixAt + (HATCH_SECONDS[2] ?? 0.6));
      stops.push([round(at), until]);
      schedule(fixAt, () => {
        collect(fixAt, 2, true, RECOVERY_KEEP);
        setAttr(until, 'stage', 'data-oom', 'clear');
        setAttr(until, 'stage', 'data-stw', 'off');
        cue(until, 'success');
      });
      return;
    }

    if (firstFree(gen0) < 0 || lohAllocated() >= LOH_SLOTS) collect(at, generationFor());
  };

  const emit = (at: number): void => {
    if (at > LAST_LAUNCH) return;
    const covering = stopAt(at);
    if (covering) {
      // The dot ahead resumes where it froze, so the first one released after a
      // stop waits until that one is a clear halo further down the lane.
      const ahead = Math.max(0, LANE_CLEAR_TIME - (covering[0] - lastLaunch));
      const resume = round(covering[1] + ahead);
      schedule(resume, () => emit(resume));
      return;
    }
    lastLaunch = at;
    const every = bigEveryAt(at);
    const kind: 'alloc' | 'big' = every > 0 && dotIndex % every === 0 ? 'big' : 'alloc';
    const wanted = rateAt(at) / MB_PER_ALLOC_SLOT;
    const dots = Math.min(DOT_RATE_MAX, Math.max(1, wanted));
    const index = launches.length;
    launches.push({ at: round(at), kind, dots });
    dotIndex += 1;

    const arrival = round(at + ALLOC_LEG);
    schedule(arrival, () => deposit(arrival, index));
    schedule(round(at + 1 / dots), () => emit(round(at + 1 / dots)));
  };

  schedule(FIRST_LAUNCH, () => emit(FIRST_LAUNCH));

  // The plan's own instants: the buffer that only the second step asks for, the
  // switch to a pool, the collector mode, and the limit the container gives.
  for (const at of BIG_AT) {
    schedule(at, () => {
      const covering = stopAt(at);
      const when = covering ? covering[1] : at;
      const slot = loh.findIndex((block) => block === 'empty' || block === 'gap');
      if (slot >= 0) loh[slot] = 'live';
      paint(when);
    });
  }

  for (const [at, source] of SOURCE_AT) {
    if (at === 0) continue;
    schedule(at, () => {
      setAttr(at, 'stage', 'data-source', source);
      cue(at, 'trip');
      if (source === 'pool') {
        for (let i = 0; i < pool.length; i += 1) pool[i] = 'free';
        paint(at);
      }
    });
  }

  for (const [at, next] of MODE_AT) {
    if (at === 0) continue;
    schedule(at, () => {
      mode = next;
      setAttr(at, 'stage', 'data-gcmode', next);
      cue(at, 'trip');
      paint(at);
    });
  }

  schedule(LIMIT_AT, () => {
    setAttr(LIMIT_AT, 'stage', 'data-hardlimit', 'on');
    cue(LIMIT_AT, 'trip');
  });

  drain();

  // --- the dots, once every stop is known ---------------------------------

  stops.sort((left, right) => left[0] - right[0]);

  /**
   * How something that takes `duration` seconds of running time to walk from
   * `from` to `to` actually moves, held still for every stop it runs into. It
   * is the one place the scene knows that a stopped thread is a thread that
   * has not finished: the dot in the air and the bar in its lane both freeze.
   */
  const flight = (start: number, duration: number, from: number, to: number): Flight[] => {
    const legs: Flight[] = [];
    const rate = (to - from) / duration;
    let t = start;
    let value = from;
    let left = duration;
    for (const [open, close] of stops) {
      if (close <= t) continue;
      if (open >= t + left) break;
      if (open > t) {
        const run = open - t;
        legs.push({ t0: round(t), y0: value, t1: round(open), y1: value + run * rate });
        value += run * rate;
        left -= run;
        t = open;
      }
      t = Math.max(t, close);
    }
    legs.push({ t0: round(t), y0: value, t1: round(t + left), y1: to });
    return legs;
  };

  launches.forEach((launch) => {
    const legs = flight(launch.at, ALLOC_LEG, Y_ALLOC_OUT, Y_HEAP);
    const arrival = legs[legs.length - 1]?.t1 ?? launch.at;
    movers.push({
      x: X_ALLOC,
      showAt: launch.at,
      hideAt: arrival,
      fade: FADE,
      legs,
      kind: launch.kind,
    });
  });

  // Clip each fade so the dot behind it has a clear halo when it lands on the
  // same spot.
  const byStop = new Map<string, Mover[]>();
  for (const mover of movers) {
    const stop = mover.legs[mover.legs.length - 1]?.y1 ?? 0;
    const key = `${mover.x}@${stop}`;
    const list = byStop.get(key);
    if (list) list.push(mover);
    else byStop.set(key, [mover]);
  }
  for (const list of byStop.values()) {
    list.sort((left, right) => left.hideAt - right.hideAt);
    list.forEach((mover, index) => {
      const next = list[index + 1];
      if (!next) return;
      mover.fade = Math.max(0.02, round(Math.min(mover.fade, next.hideAt - mover.hideAt - CLEARANCE)));
    });
  }

  // A dot that could not finish before the closing hold is not drawn at all,
  // so nothing is mid-flight on the last frame and nothing vanishes mid-lane.
  const finished = movers.filter(
    (mover) => (mover.legs[mover.legs.length - 1]?.t1 ?? mover.hideAt) + FADE <= SCENE_DURATION,
  );
  movers.length = 0;
  movers.push(...finished);
  movers.sort((left, right) => left.showAt - right.showAt || left.x - right.x);

  // --- the request lanes ---------------------------------------------------

  const lanes: LaneLeg[] = [];
  for (let lane = 0; lane < LANE_COUNT; lane += 1) {
    let at = round(0.1 + lane * LANE_STAGGER);
    while (at < SCENE_DURATION) {
      const legs = flight(at, SERVICE_TIME, 0, LANE_W);
      for (const leg of legs) {
        if (leg.t1 <= leg.t0 || leg.t0 >= SCENE_DURATION) continue;
        lanes.push({
          lane,
          at: leg.t0,
          width: Number(leg.y1.toFixed(2)),
          duration: round(leg.t1 - leg.t0),
        });
      }
      const end = legs[legs.length - 1]?.t1 ?? at;
      if (end < SCENE_DURATION) lanes.push({ lane, at: end, width: 0, duration: LANE_CLEAR });
      at = round(end + LANE_CLEAR + LANE_GAP);
    }
  }

  // --- the readouts --------------------------------------------------------

  const gauge: BarStep[] = [];
  const meter: BarStep[] = [];

  heap.sort((left, right) => left.at - right.at);
  const heapAt = (t: number): number => {
    let previous = heap[0];
    if (!previous) return HEAP_BASE_MB;
    for (const entry of heap) {
      if (entry.at > t) {
        const span = entry.at - previous.at;
        if (span <= 0) return entry.mb;
        const share = (t - previous.at) / span;
        return previous.mb + (entry.mb - previous.mb) * share;
      }
      previous = entry;
    }
    return previous.mb;
  };

  const pausePct = (t: number): number => {
    const from = Math.max(0, t - PAUSE_WINDOW);
    const span = (t - from) * 1000;
    if (span <= 0) return 0;
    let total = 0;
    for (const entry of pauses) if (entry.at > from && entry.at <= t) total += entry.ms;
    return (total / span) * 100;
  };

  const p99At = (t: number): number => {
    let worst = 0;
    for (const entry of pauses) {
      if (entry.at > t || entry.at <= t - P99_DECAY) continue;
      worst = Math.max(worst, entry.ms * (1 - (t - entry.at) / P99_DECAY));
    }
    return P99_BASE + worst + queueMs(rateAt(t));
  };

  const held: Record<string, string> = {};
  const write = (t: number, name: string, value: string): void => {
    if (held[name] === value) return;
    held[name] = value;
    setAttr(t, 'stage', name, value);
  };
  for (const [key, value] of Object.entries(STAGE_STATE)) {
    if (key.startsWith('stage@')) held[key.slice('stage@'.length)] = value;
  }
  // `held` starts at what the markup carries, so the first sample writes
  // anything the static stage does not already say.

  let lastReadoutCue = -READOUT_CUE_GAP;
  let calm = false;
  const samples = Math.round(SCENE_DURATION / SAMPLE);
  for (let i = 0; i <= samples; i += 1) {
    const t = round(i * SAMPLE);
    const rate = rateAt(t);
    const mb = heapAt(t);
    const pct = pausePct(t);
    const p99 = p99At(t);

    write(t, 'data-alloc', String(allocIndex(rate)));
    write(t, 'data-heap', String(heapIndex(mb)));
    write(t, 'data-pause', String(pauseIndex(pct)));
    write(t, 'data-tail', String(p99Index(p99)));

    const gaugeWidth = Number(
      ((GAUGE_W * Math.min(rate, ALLOC_MAX)) / ALLOC_MAX).toFixed(2),
    );
    const previousGauge = gauge[gauge.length - 1];
    if (t < SCENE_DURATION && (!previousGauge || Math.abs(previousGauge.width - gaugeWidth) >= 0.5)) {
      gauge.push({ at: t, width: gaugeWidth, duration: BAR_MOVE });
    }
    const meterValue = meterWidth(mb);
    const previousMeter = meter[meter.length - 1];
    if (t < SCENE_DURATION && (!previousMeter || Math.abs(previousMeter.width - meterValue) >= 0.5)) {
      meter.push({ at: t, width: meterValue, duration: BAR_MOVE });
    }

    // A readout cue samples the walk rather than shadowing every step of it,
    // and never lands where a step boundary is about to cut the sound off.
    const nearBoundary = STEPS.some((step) => Math.abs(t - step.time) < BOUNDARY_CLEAR);
    if (!nearBoundary && t - lastReadoutCue >= READOUT_CUE_GAP && t > 0.5 && t < 23.4) {
      lastReadoutCue = t;
      cue(t, 'state');
    }
    // Coming back inside the budget is the milestone worth hearing.
    if (pct > 2) calm = false;
    else if (!calm && pct <= 0.6 && t > 6 && !nearBoundary) {
      calm = true;
      cue(t, 'success');
    }
  }

  for (let i = 0; i < gauge.length; i += 1) {
    const entry = gauge[i];
    const next = gauge[i + 1];
    if (entry && next) entry.duration = Math.min(BAR_MOVE, round(next.at - entry.at));
  }
  for (let i = 0; i < meter.length; i += 1) {
    const entry = meter[i];
    const next = meter[i + 1];
    if (entry && next) entry.duration = Math.min(BAR_MOVE, round(next.at - entry.at));
  }

  // --- ordering ------------------------------------------------------------

  const attrs = raw
    .filter((change) => change.at <= SCENE_DURATION)
    .sort((left, right) => left.at - right.at);

  cues.sort((left, right) => left[0] - right[0]);
  const heard = new Set<string>();
  const deduped: [number, SceneCue][] = [];
  for (const entry of cues) {
    if (entry[0] > SCENE_DURATION) continue;
    const id = `${entry[0]}@${entry[1]}`;
    if (heard.has(id)) continue;
    heard.add(id);
    deduped.push(entry);
  }

  return { attrs, movers, gauge, meter, lanes, cues: deduped };
}

// --- the timeline ---------------------------------------------------------

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const targets: Record<string, Element> = { stage };
  const collect = (name: string, count: number, selector: (i: number) => string): void => {
    for (let index = 0; index < count; index += 1) {
      targets[`${name}-${index}`] = q<Element>(stage, selector(index), ID);
    }
  };
  collect('gen0', GEN0_SLOTS, (i) => `.gc-gen0-obj--${i}`);
  collect('gen1', GEN1_SLOTS, (i) => `.gc-gen1-obj--${i}`);
  collect('gen2', GEN2_SLOTS, (i) => `.gc-gen2-obj--${i}`);
  collect('loh', LOH_SLOTS, (i) => `.gc-block--${i}`);
  collect('pool', POOL_SLOTS, (i) => `.gc-pool--${i}`);
  collect('tick', TICK_SLOTS, (i) => `.gc-tick--${i}`);

  const gaugeFill = q<SVGRectElement>(stage, '.gc-gauge-fill', ID);
  const meterFill = q<SVGRectElement>(stage, '.gc-meter-fill', ID);
  const laneFills = Array.from({ length: LANE_COUNT }, (_value, index) =>
    q<SVGRectElement>(stage, `.gc-lane-fill--${index}`, ID),
  );
  const layer = q<SVGGElement>(stage, '.scene-requests', ID);

  const sim = simulate();
  const parts = mountRequests(layer, sim.movers.length, ID);

  const tl = createSceneTimeline();

  // --- discrete state -----------------------------------------------------

  for (const change of sim.attrs) {
    const element = targets[change.key];
    if (!element) continue;
    attr(tl, element, change.name, change.value, change.at);
  }

  // Nothing may run past the end of the scene, or the timeline would be longer
  // than the contract allows: a tween that would cross 24 is cut at it.
  const fit = (at: number, duration: number): number =>
    Math.max(0.01, Math.min(duration, SCENE_DURATION - at));

  // --- the two bars, which walk rather than step --------------------------

  for (const entry of sim.gauge) {
    tl.to(
      gaugeFill,
      {
        attr: { width: entry.width },
        duration: fit(entry.at, entry.duration),
        ease: 'none',
        immediateRender: false,
      },
      entry.at,
    );
  }
  for (const entry of sim.meter) {
    tl.to(
      meterFill,
      {
        attr: { width: entry.width },
        duration: fit(entry.at, entry.duration),
        ease: 'none',
        immediateRender: false,
      },
      entry.at,
    );
  }

  // --- the request lanes --------------------------------------------------

  for (const leg of sim.lanes) {
    const fill = laneFills[leg.lane];
    if (!fill) continue;
    if (leg.at >= SCENE_DURATION) continue;
    tl.to(
      fill,
      {
        attr: { width: leg.width },
        duration: fit(leg.at, leg.duration),
        ease: 'none',
        immediateRender: false,
      },
      leg.at,
    );
  }

  // --- travellers ---------------------------------------------------------

  sim.movers.forEach((mover, index) => {
    const item = parts[index];
    if (!item) return;
    item.group.classList.add(`gc-req--${mover.kind}`);
    const first = mover.legs[0];
    parkRequest(item, mover.x, first ? first.y0 : Y_ALLOC_OUT);
    showRequest(tl, item, mover.showAt);
    for (const leg of mover.legs) {
      if (leg.t1 <= leg.t0 || leg.t0 >= SCENE_DURATION) continue;
      tl.to(
        item.group,
        { y: leg.y1, duration: fit(leg.t0, leg.t1 - leg.t0), ease: 'none', immediateRender: false },
        leg.t0,
      );
    }
    const hideAt = Math.min(mover.hideAt, SCENE_DURATION - 0.05);
    hideRequest(tl, item, hideAt, Math.min(mover.fade, fadeAt(hideAt, SCENE_DURATION)));
  });

  // --- sound --------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels --------------------------------------------------------

  // The stage is complete on the first frame: a warm process holding its
  // long-lived objects in gen2 and its buffers on the large object heap, an
  // empty gen0 the collector has just swept, and an event axis with nothing on
  // it yet.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
