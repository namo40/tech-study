import {
  GAUGE_W,
  LIMIT_MI,
  STAGE_STATE,
  OPENING_USED,
  SCENE_DURATION,
  X_LANE,
  Y_APP_BOTTOM,
  Y_HEAP_TOP,
  gaugeWidth,
  gcIndex,
  pauseIndex,
  usedIndex,
} from './stage';
import type { ContainerState, Lamp, Level, Pooled } from './stage';
import { q } from '../shared/dom';
import {
  hideRequest,
  mountRequests,
  moveRequest,
  parkRequest,
  showRequest,
} from '../shared/request';
import { createScheduler } from '../shared/simulation';
import { attr, fadeAt, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Memory Pressure scene: a 24 second, four step timeline.
 *
 * The two standing rules apply here as everywhere: every tween sits at an
 * absolute position, and every discrete change is a zero-duration tween on a
 * `data-*` attribute that GSAP reverts when the playhead moves back past it.
 * The gauge is the one exception and is drawn rather than written — a width
 * tween with `ease: 'none'`, which is a quantity and reverses exactly.
 *
 * Nothing on this stage is placed by hand. The scene is told six things and one
 * pass over the whole 24 seconds derives the rest:
 *
 *   1. the allocation plan — how many megabytes a second the workload asks for,
 *      and when that changes. This is the only lever the scene has, and the
 *      fourth step is what happens when you pull it;
 *   2. the gen0 budget, which decides when a collection runs. It shrinks as the
 *      heap fills, because a collector with less room to work in gets called
 *      sooner — that is where "the same thing, more often" comes from;
 *   3. how long the working set takes to go cold. A collection reclaims the
 *      share of the heap's garbage that has actually stopped being referenced
 *      by the time the collector arrives, so a faster allocation rate means a
 *      shorter cycle, a colder-looking heap and less reclaimed. This is
 *      premature promotion, and it is the whole mechanism of the second step;
 *   4. how much of that reclaim is left once the heap is near its ceiling —
 *      the headroom term, which is why the last stretch runs away;
 *   5. what a collection costs, in the milliseconds `pause n ms` is labelled
 *      with, and the occupancy above which every collection is a full one;
 *   6. the container's memory limit, and how long the kernel takes to restart a
 *      container it has killed.
 *
 * Everything the reader counts falls out of walking that: the level of the
 * gauge at every instant, when each collection runs, the `gc n/min` and
 * `pause n ms` readings, the moment the warning band is entered, the kill, the
 * restart, and `restarts n`. In particular **the kill is not a timestamp**. The
 * container dies at the instant the derived reading reaches 512 Mi, and the
 * only way to move it is to change what the workload allocates. Drop the third
 * step's rate to the first step's and there is no kill at all — which is the
 * argument the fourth step makes, made by the model rather than asserted.
 *
 * Two compressions, both declared, neither of which touches a label.
 *
 * **The clock.** A heap that collects four times a minute cannot be shown at
 * one to one in a six second step, so one second of the scene stands for
 * `TIME_SCALE` real seconds. Every figure on the stage is the real one — 20
 * MB/s is 20 MB/s, `gc 4/min` is four collections a minute, `pause 2 ms` is two
 * milliseconds — and only the playback rate is compressed. A two millisecond
 * pause is likewise invisible, so the `GC` lamp is held for a fixed
 * `COLLECT_WINDOW` while the reading carries the real figure, and the gauge
 * walks down across that window rather than dropping through it, because the
 * collector is sweeping for the whole of it.
 *
 * **The stream.** One dot stands for `MB_PER_DOT` megabytes of allocation, so
 * the stream thickens with the rate rather than being drawn per object: two
 * dots a second at 20 MB/s and six at 60. Launching is suppressed for
 * `QUIET_BEFORE` seconds ahead of a step boundary and `QUIET_AFTER` after it,
 * so nothing is ever in flight when the reader arrives at one; the model keeps
 * allocating through those windows, so the dots either side of a boundary stand
 * for proportionally more. Nothing else about the diagram is sampled.
 */

const ID = 'memory-pressure';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

const BOUNDARIES = [0, 6, 12, 18, 24];

// --- the clock -------------------------------------------------------------

/** Real seconds one second of the scene stands for. */
const TIME_SCALE = 10;

/** How finely the heap is integrated, and how often the readouts are sampled. */
const DT = 0.025;
const SAMPLE = 0.05;

/** Megabytes in a mebibyte, because the two units are both on the stage. */
const MB_PER_MI = 1.048576;

// --- what the scene is told: the workload ----------------------------------

interface RatePlan {
  /** When the workload starts asking for this. */
  at: number;
  /** Megabytes a second it allocates. */
  rate: number;
}

/**
 * The allocation plan. Twenty is a service nobody is worried about; sixty is
 * the same service after a release that buffers whole responses; fifteen is
 * that release with its big buffers rented from a pool instead of allocated.
 * Nothing else changes — not the limit, not the collector, not the code path.
 */
const RATES: RatePlan[] = [
  { at: 0, rate: 20 },
  { at: 6.4, rate: 60 },
  { at: 18.8, rate: 15 },
];

/** When the pool is switched on, which is what makes the third rate possible. */
const POOLED_AT = 18.4;

/**
 * After this the run is over: nothing is allocated and nothing is collected, so
 * the closing frame is a settled heap with no dot in the air and no collection
 * in flight. The rate readout keeps the workload's figure, because the workload
 * did not change — the scene simply ends.
 */
const QUIET_FROM = 22.6;

// --- what the scene is told: the collector ---------------------------------

/**
 * The gen0 budget: the megabytes of allocation that fill the nursery and
 * therefore schedule every collection in the scene. It shrinks as the heap
 * fills, because a runtime near its hard limit gives the nursery less room —
 * which is why the collector runs more often under pressure without anybody
 * asking it to.
 */
const BUDGET_MB = 531;
const BUDGET_PRESSURE = 0.87;
const BUDGET_FLOOR_MB = 40;

/** The share of allocated bytes that is still on the heap at all. */
const HEAP_SHARE = 0.3415;

/** What the process holds for good: caches, singletons, the request pipeline. */
const LIVE_SET_MI = 150;

/**
 * How long the working set takes to go cold, in real seconds. A collection
 * reclaims the share of the heap's garbage that has stopped being referenced by
 * the time the collector arrives, so a short cycle finds most of it still warm
 * and promotes it instead. Triple the allocation rate and the cycle is a third
 * as long, which is why the same collector suddenly frees far less.
 */
const RETIRE_SECONDS = 7.5;

/**
 * How much of that is left once the heap is near its ceiling. Below
 * `HEADROOM_FROM` there is no penalty; above it the collector is working in a
 * space it cannot get out of, and the reclaim falls away. This is the term that
 * turns a heap living near its limit into a heap that reaches it.
 */
const HEADROOM_FROM = 0.6;
const HEADROOM_EXP = 0.8;

/** What one collection costs: the live set it walks, and the price of a full one. */
const PAUSE_PER_MI = 0.01275;
const FULL_AT = 0.75;
const FULL_COST = 2.4;

/** How long the lamp is held, and the gauge takes to walk down, for one collection. */
const COLLECT_WINDOW = 0.075;

// --- what the scene is told: the container ---------------------------------

/** The band the gauge reads as a warning, and the level it leaves it at. */
const WARN_AT = 0.8;
const WARN_CLEAR = 0.7;

/** How long the kernel leaves a killed container dead, and until it is running. */
const DEAD_FOR = 0.8;
const RESTART_AFTER = 1.6;

// --- what the scene is told: the stream ------------------------------------

/** Megabytes of allocation one drawn dot stands for. */
const MB_PER_DOT = 100;
/** The most dots a second the stream is ever drawn at. */
const DOT_MAX = 6;
/** Pixels a second a dot travels, and how long it takes to fade once absorbed. */
const DOT_SPEED = 1000;
const DOT_FADE = 0.1;
/** How fast a dot goes when the process it belonged to was taken away. */
const LOST_FADE = 0.01;
/** The first and last dot, so neither the opening nor the closing frame has one. */
const DOT_FROM = 0.4;
const DOT_UNTIL = 22.3;
/** The clear air a step boundary is given, so nothing is in flight at one. */
const QUIET_BEFORE = 1.1;
const QUIET_AFTER = 0.4;

// --- what the scene is told: the sound -------------------------------------

/** Seconds between two sampled cues, so a walking number is not a rattle. */
const STATE_CUE_GAP = 1.15;
const SUCCESS_CUE_GAP = 1.6;
/** How much a collection has to give back before it is worth hearing. */
const CALM_DROP_MI = 24;
/** How close any cue may fall to another, and to a step boundary. */
const MIN_CUE_GAP = 0.2;
const BOUNDARY_GAP = 0.3;
/** When the settled heap is confirmed, which is the last thing the scene says. */
const SETTLED_AT = 23.4;

/** Times are rounded to milliseconds, so a gap of exactly the minimum is one. */
const EPS = 1e-6;

// --- what one pass over the scene produces ---------------------------------

interface Change {
  at: number;
  name: string;
  value: string;
}

interface BarStep {
  at: number;
  width: number;
  duration: number;
  /** A step the reading jumped to rather than walked to: written, not tweened. */
  snap?: boolean;
}

interface Mover {
  start: number;
  /** When it reaches the Heap's edge. */
  land: number;
  /** When it goes. The same, unless the process it belonged to was killed. */
  hideAt: number;
  fade: number;
}

interface Collection {
  at: number;
  before: number;
  after: number;
  gcPerMin: number;
  pauseMs: number;
  full: boolean;
}

interface Simulation {
  changes: Change[];
  gauge: BarStep[];
  movers: Mover[];
  cues: [number, SceneCue][];
  /** Read back by the build, so a drift in the derivation fails loudly. */
  collections: Collection[];
  killAt: number | null;
  restarts: number;
  warnAt: number | null;
  finalUsed: number;
}

// --- reading the plan ------------------------------------------------------

const rateAt = (t: number): number => {
  let rate = 0;
  for (const plan of RATES) if (plan.at <= t + EPS) rate = plan.rate;
  return rate;
};

/** The gen0 budget at a given heap reading, in megabytes. */
const budgetAt = (used: number): number =>
  Math.max(BUDGET_FLOOR_MB, BUDGET_MB * (1 - (BUDGET_PRESSURE * used) / LIMIT_MI));

/** What is left of the collector's reach once the heap is near its ceiling. */
const headroomAt = (used: number): number =>
  Math.min(1, Math.pow(Math.max(0, 1 - used / LIMIT_MI) / (1 - HEADROOM_FROM), HEADROOM_EXP));

/** The share of the heap's garbage one collection actually gets back. */
const reclaimAt = (used: number, rate: number): number => {
  const cycleReal = budgetAt(used) / rate;
  return (1 - Math.exp(-cycleReal / RETIRE_SECONDS)) * headroomAt(used);
};

/** Whether a dot may be launched at `t`, which is a drawing rule, not a model one. */
const streamOpen = (t: number): boolean => {
  if (t < DOT_FROM - EPS || t > DOT_UNTIL + EPS) return false;
  return !BOUNDARIES.some((edge) => t > edge - QUIET_BEFORE - EPS && t < edge + QUIET_AFTER - EPS);
};

// --- the simulation --------------------------------------------------------

/** Ticks one collection's sweep is spread over, so the gauge walks down it. */
const DROP_TICKS = Math.round(COLLECT_WINDOW / DT);
/** Ticks between two readings, and how long the gauge takes to follow one. */
const SAMPLE_TICKS = Math.round(SAMPLE / DT);


/**
 * Walks the whole scene in time order.
 *
 * One `createScheduler` pass runs it: each tick books the next, and everything
 * a tick works out books itself from inside that tick — the lamp going out at
 * the end of a sweep, the container coming back after it was killed, the pool
 * being switched on. Booked events run earliest first, so a restart booked at
 * the moment of the kill lands before the tick that would otherwise have kept
 * allocating into a process that is not there.
 *
 * The heap is the only thing integrated. Everything else is read off it: a
 * collection when the nursery is full, a reading when the sample comes round, a
 * warning when the level crosses the band, and a kill when the reading reaches
 * the limit. No occupancy, no frequency, no pause and no kill time is written
 * down anywhere in this file.
 */
function simulate(): Simulation {
  const { schedule, drain } = createScheduler();

  const changes: Change[] = [];
  const held: Record<string, string> = { ...STAGE_STATE };
  const write = (at: number, name: string, value: string): void => {
    if (held[name] === value) return;
    held[name] = value;
    changes.push({ at: round(at), name, value });
  };
  // `held` starts at what the markup carries, so the pass writes only what the
  // static stage does not already say.

  const gauge: BarStep[] = [];
  /**
   * The gauge follows the reading, and it walks unless the reading jumped. It
   * jumps exactly twice, and both times because a process stopped existing:
   * once when the kernel takes it away at the limit, and once when what comes
   * back is a new process with an empty heap.
   */
  const snapGauge = (at: number, mi: number): void => {
    const width = gaugeWidth(mi);
    gauge.push({ at: round(at), width, duration: 0, snap: true });
    gaugeWas = width;
    gaugeFrom = round(at);
  };
  /** The width the fill was last sent to, and the earliest it may start again. */
  let gaugeWas = gaugeWidth(OPENING_USED);
  let gaugeFrom = 0;
  const movers: Mover[] = [];
  const collections: Collection[] = [];
  const anchors: { at: number; name: SceneCue }[] = [];
  const samples: { at: number; name: SceneCue }[] = [];
  const anchor = (at: number, name: SceneCue): void => {
    anchors.push({ at: round(at), name });
  };
  const sampleCue = (at: number, name: SceneCue): void => {
    samples.push({ at: round(at), name });
  };

  // --- what the diagram is holding -----------------------------------------

  /** The heap reading, in mebibytes. This is the only integrated quantity. */
  let used = OPENING_USED;
  /** Megabytes allocated since the last collection, which is the nursery. */
  let since = 0;
  let container: ContainerState = 'running';
  let level: Level = 'calm';
  let restarts = 0;
  let killAt: number | null = null;
  let warnAt: number | null = null;

  /**
   * The sweep in progress. A collection does not drop the reading in one frame:
   * the collector walks the heap for the whole of `COLLECT_WINDOW`, so the
   * bytes it frees come off across that window and the gauge walks down it.
   */
  let sweepUntil = -1;
  let sweepTicks = 0;
  let sweepPerTick = 0;

  /** The two readings a collection leaves behind, held until the next one. */
  let gcPerMin = Number(STAGE_STATE['data-mp-gc']);
  let pauseMs = Number(STAGE_STATE['data-mp-pause']);

  /** The stream's own clock, and the pacing of the two sampled cues. */
  let nextDot = DOT_FROM;
  let lastStateCue = -STATE_CUE_GAP;
  let lastSuccessCue = -SUCCESS_CUE_GAP;

  // --- a collection ---------------------------------------------------------

  /**
   * The collector runs because the nursery filled, and everything it does falls
   * out of where the heap already was: how much of the garbage has gone cold,
   * how much headroom it has to work in, how long it stops the world for, and
   * how soon it is going to have to do this again.
   */
  const collect = (at: number, rate: number): void => {
    const before = used;
    const cycleReal = budgetAt(before) / rate;
    const garbage = Math.max(0, before - LIVE_SET_MI);
    const freed = reclaimAt(before, rate) * garbage;
    const after = before - freed;
    const full = before / LIMIT_MI >= FULL_AT;

    gcPerMin = 60 / cycleReal;
    pauseMs = PAUSE_PER_MI * after * (full ? FULL_COST : 1);
    since = 0;
    sweepUntil = round(at + COLLECT_WINDOW);
    sweepTicks = DROP_TICKS;
    sweepPerTick = freed / DROP_TICKS;
    collections.push({ at: round(at), before, after, gcPerMin, pauseMs, full });

    write(at, 'data-mp-lamp', 'on' satisfies Lamp);
    write(at, 'data-mp-gc', String(gcIndex(gcPerMin)));
    write(at, 'data-mp-pause', String(pauseIndex(pauseMs)));

    const offAt = sweepUntil;
    schedule(offAt, () => write(offAt, 'data-mp-lamp', 'off' satisfies Lamp));

    // A collection that hands real memory back while the heap is nowhere near
    // its ceiling is the sound of a healthy process. It is sampled rather than
    // played every time, because at four a minute it is background noise.
    if (level === 'calm' && freed >= CALM_DROP_MI && at - lastSuccessCue >= SUCCESS_CUE_GAP - EPS) {
      lastSuccessCue = at;
      sampleCue(at, 'success');
    }
  };

  // --- the kill -------------------------------------------------------------

  /**
   * There is nothing to catch here. The reading reached the limit, so the
   * kernel took the process away: the heap stops where it is, the collector
   * stops reporting because there is no collector, and the container comes back
   * as a new process with an empty heap and exactly the same code.
   */
  const kill = (at: number): void => {
    // Whatever was in the air belonged to a process that no longer exists, so
    // it does not land: the kernel takes the container mid-request, and this is
    // the one place on the stage where that is drawn rather than described.
    for (const mover of movers) {
      if (mover.start < at && mover.hideAt > at) {
        mover.hideAt = round(at);
        mover.fade = LOST_FADE;
      }
    }
    used = LIMIT_MI;
    killAt = round(at);
    container = 'oomkilled';
    level = 'limit';
    sweepTicks = 0;
    sweepUntil = -1;
    gcPerMin = 0;
    pauseMs = 0;

    write(at, 'data-mp-container', 'oomkilled' satisfies ContainerState);
    write(at, 'data-mp-level', 'limit' satisfies Level);
    write(at, 'data-mp-lamp', 'off' satisfies Lamp);
    write(at, 'data-mp-used', String(usedIndex(LIMIT_MI)));
    snapGauge(at, LIMIT_MI);
    write(at, 'data-mp-gc', '0');
    write(at, 'data-mp-pause', '0');
    write(at, 'data-mp-alloc', '0');
    anchor(at, 'failure');

    const restartingAt = round(at + DEAD_FOR);
    schedule(restartingAt, () => {
      container = 'restarting';
      write(restartingAt, 'data-mp-container', 'restarting' satisfies ContainerState);
      anchor(restartingAt, 'state');
    });

    const runningAt = round(at + RESTART_AFTER);
    schedule(runningAt, () => {
      container = 'running';
      restarts += 1;
      used = 0;
      since = 0;
      level = 'calm';
      write(runningAt, 'data-mp-container', 'running' satisfies ContainerState);
      write(runningAt, 'data-mp-restarts', String(restarts));
      write(runningAt, 'data-mp-level', 'calm' satisfies Level);
      write(runningAt, 'data-mp-used', String(usedIndex(0)));
      snapGauge(runningAt, 0);
      write(runningAt, 'data-mp-alloc', String(rateAt(runningAt)));
      anchor(runningAt, 'state');
    });
  };

  // --- one tick -------------------------------------------------------------

  const tick = (at: number, index: number): void => {
    const running = container === 'running';
    const plan = running ? rateAt(at) : 0;
    write(at, 'data-mp-alloc', String(plan));

    // The sweep first, because the collector started it on an earlier tick and
    // is still walking; then whatever the workload has allocated since.
    if (sweepTicks > 0) {
      used = Math.max(0, used - sweepPerTick);
      sweepTicks -= 1;
    }
    const allocating = running && at < QUIET_FROM - EPS ? plan : 0;
    if (allocating > 0) {
      const real = DT * TIME_SCALE;
      used += (allocating * HEAP_SHARE * real) / MB_PER_MI;
      since += allocating * real;
    }

    if (running && used >= LIMIT_MI) {
      kill(at);
    } else {
      if (allocating > 0 && sweepTicks === 0 && at > sweepUntil + EPS && since >= budgetAt(used)) {
        collect(at, allocating);
      }
      // The warning band, which is a colour rather than a word: the number
      // under the gauge already says how much of the limit is in use.
      if (running && level !== 'limit') {
        const share = used / LIMIT_MI;
        if (level === 'calm' && share >= WARN_AT) {
          level = 'warn';
          if (warnAt === null) warnAt = round(at);
          write(at, 'data-mp-level', 'warn' satisfies Level);
          anchor(at, 'failure');
        } else if (level === 'warn' && share < WARN_CLEAR) {
          level = 'calm';
          write(at, 'data-mp-level', 'calm' satisfies Level);
        }
      }
    }

    // The stream, which is drawn from the rate rather than from the model. The
    // container is read again here rather than reused from the top of the tick,
    // because the kill may have happened in between and a process that is gone
    // does not release one more allocation.
    if (container !== 'running') {
      nextDot = round(at + DT);
    } else if (at >= nextDot - EPS) {
      if (streamOpen(at)) {
        const land = round(at + (Y_HEAP_TOP - Y_APP_BOTTOM) / DOT_SPEED);
        movers.push({ start: round(at), land, hideAt: land, fade: DOT_FADE });
        const perSecond = Math.min(DOT_MAX, (plan * TIME_SCALE) / MB_PER_DOT);
        nextDot = perSecond > 0 ? round(at + 1 / perSecond) : round(at + DT);
      } else {
        nextDot = round(at + DT);
      }
    }

    // The readings, sampled rather than written every tick, so a number walks
    // at a readable pace instead of flickering.
    if (index % SAMPLE_TICKS === 0) {
      // The reading is written at the sample and the gauge is sent to the same
      // quantity over the interval that ends there, so the bar arrives when the
      // number does instead of trailing it by one sample.
      write(at, 'data-mp-used', String(usedIndex(used)));
      const width = gaugeWidth(used);
      if (
        at > 0 &&
        at < SCENE_DURATION &&
        at > gaugeFrom + EPS &&
        Math.abs(gaugeWas - width) >= 0.5
      ) {
        gauge.push({ at: gaugeFrom, width, duration: round(at - gaugeFrom) });
        gaugeWas = width;
      }
      gaugeFrom = Math.max(gaugeFrom, at);
      if (
        container === 'running' &&
        at > 0.5 &&
        at < SETTLED_AT &&
        at - lastStateCue >= STATE_CUE_GAP - EPS
      ) {
        lastStateCue = at;
        sampleCue(at, 'state');
      }
    }

    const next = round(at + DT);
    if (next <= SCENE_DURATION + EPS) schedule(next, () => tick(next, index + 1));
  };

  // --- the things that are switched on rather than derived -----------------

  for (const plan of RATES) {
    if (plan.at <= 0) continue;
    schedule(plan.at, () => anchor(plan.at, 'state'));
  }

  schedule(POOLED_AT, () => {
    write(POOLED_AT, 'data-mp-pooled', 'on' satisfies Pooled);
    anchor(POOLED_AT, 'trip');
  });

  schedule(SETTLED_AT, () => anchor(SETTLED_AT, 'success'));

  schedule(0, () => tick(0, 0));
  drain();

  // --- what the walk has to have produced ----------------------------------

  if (killAt === null) {
    throw new Error(`${ID} scene: the heap never reached the limit, so nothing was killed`);
  }
  if (restarts !== 1) throw new Error(`${ID} scene: ${restarts} restarts, want 1`);
  if (warnAt === null || warnAt >= killAt) {
    throw new Error(`${ID} scene: the warning band was not entered before the kill`);
  }
  if (container !== 'running') {
    throw new Error(`${ID} scene: the scene ended with the container ${container}`);
  }
  if (used >= WARN_AT * LIMIT_MI) {
    throw new Error(`${ID} scene: it settled at ${used.toFixed(1)} Mi, still in the warning band`);
  }
  const perStep = [0, 6, 12, 18].map(
    (from) => collections.filter((item) => item.at >= from && item.at < from + 6).length,
  );
  if (perStep.some((count) => count === 0)) {
    throw new Error(`${ID} scene: collections per step are ${perStep.join('/')}`);
  }
  const first = collections[0];
  if (!first) throw new Error(`${ID} scene: nothing was ever collected`);
  // The opening frame claims a warm process mid-breath. The first collection
  // the model runs has to agree with it, or the static stage is a fiction.
  if (
    String(gcIndex(first.gcPerMin)) !== STAGE_STATE['data-mp-gc'] ||
    String(pauseIndex(first.pauseMs)) !== STAGE_STATE['data-mp-pause']
  ) {
    throw new Error(
      `${ID} scene: the opening readings say gc ${STAGE_STATE['data-mp-gc']} and pause ` +
        `${STAGE_STATE['data-mp-pause']}, the first collection says ${gcIndex(first.gcPerMin)} ` +
        `and ${pauseIndex(first.pauseMs)}`,
    );
  }
  for (const entry of gauge) {
    if (entry.width < 0 || entry.width > GAUGE_W) {
      throw new Error(`${ID} scene: the gauge left the track at ${entry.at}`);
    }
  }

  // --- the changes, collapsed at each instant ------------------------------

  // Two changes to one attribute at one instant would render in insertion order
  // forwards and in reverse backwards, so that single frame would depend on
  // which way the reader scrubbed. Only the one that ends up applying is kept.
  const ordered: Change[] = [];
  for (const entry of changes) {
    const previous = ordered[ordered.length - 1];
    if (previous && previous.at === entry.at && previous.name === entry.name) {
      previous.value = entry.value;
      continue;
    }
    let replaced = false;
    for (let i = ordered.length - 1; i >= 0; i -= 1) {
      const candidate = ordered[i];
      if (!candidate || candidate.at !== entry.at) break;
      if (candidate.name === entry.name) {
        candidate.value = entry.value;
        replaced = true;
        break;
      }
    }
    if (!replaced) ordered.push(entry);
  }

  // --- the sound ------------------------------------------------------------

  // The anchors are the things the scene is about and are placed first: the two
  // rate changes, the pool, the warning, the kill and the restart. The sampled
  // cues fill in around them and are dropped wherever they would crowd one.
  const byTime = (left: { at: number }, right: { at: number }): number => left.at - right.at;
  const kept: number[] = [];
  const cues: [number, SceneCue][] = [];
  const clear = (at: number): boolean =>
    !BOUNDARIES.some((edge) => Math.abs(at - edge) < BOUNDARY_GAP - EPS) &&
    kept.every((other) => Math.abs(at - other) >= MIN_CUE_GAP - EPS);
  for (const entry of [...anchors].sort(byTime)) {
    if (!clear(entry.at)) continue;
    kept.push(entry.at);
    cues.push([entry.at, entry.name]);
  }
  for (const entry of [...samples].sort(byTime)) {
    if (!clear(entry.at)) continue;
    kept.push(entry.at);
    cues.push([entry.at, entry.name]);
  }
  cues.sort((left, right) => left[0] - right[0]);

  return {
    changes: ordered,
    gauge,
    movers,
    cues,
    collections,
    killAt,
    restarts,
    warnAt,
    finalUsed: used,
  };
}

// --- the timeline ----------------------------------------------------------

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);
  const fill = q<SVGRectElement>(stage, '.mp-gauge-fill', ID);

  const sim = simulate();

  // The captions name three derived moments and the steps they belong to.
  // Nothing here places them: if the allocation plan is changed, this is what
  // says the captions have stopped describing the scene.
  const { killAt, warnAt } = sim;
  if (warnAt === null || warnAt <= 6 || warnAt >= 12) {
    throw new Error(`${ID} scene: the warning band was entered at ${warnAt}, not inside step 2`);
  }
  if (killAt === null || killAt <= 12 || killAt >= 18) {
    throw new Error(`${ID} scene: the container was killed at ${killAt}, not inside step 3`);
  }
  if (sim.restarts !== 1 || sim.collections.length < 8) {
    throw new Error(
      `${ID} scene: ${sim.restarts} restarts and ${sim.collections.length} collections`,
    );
  }
  if (sim.finalUsed >= WARN_AT * LIMIT_MI) {
    throw new Error(`${ID} scene: it settled at ${sim.finalUsed.toFixed(1)} Mi`);
  }

  const parts = mountRequests(layer, sim.movers.length, ID);

  const tl = createSceneTimeline();

  // --- everything the stage says about itself ------------------------------

  for (const change of sim.changes) attr(tl, stage, change.name, change.value, change.at);

  /** Nothing may run past the end of the scene: a tween that would is cut at it. */
  const fit = (at: number, duration: number): number =>
    Math.max(0.01, Math.min(duration, SCENE_DURATION - at));

  // --- the gauge, which walks rather than steps ----------------------------

  for (const entry of sim.gauge) {
    // A jump is written the way every other discrete change on this stage is
    // written: a zero-duration set, which reverses exactly and leaves no frame
    // in between for a scrub to land on.
    if (entry.snap) {
      tl.set(fill, { attr: { width: entry.width }, immediateRender: false }, entry.at);
      continue;
    }
    tl.to(
      fill,
      {
        attr: { width: entry.width },
        duration: fit(entry.at, entry.duration),
        ease: 'none',
        immediateRender: false,
      },
      entry.at,
    );
  }

  // --- the stream ----------------------------------------------------------

  sim.movers.forEach((mover, index) => {
    const item = parts[index];
    if (!item) return;
    parkRequest(item, X_LANE, Y_APP_BOTTOM);
    showRequest(tl, item, mover.start);
    moveRequest(tl, item, Y_HEAP_TOP, round(mover.land - mover.start), mover.start);
    hideRequest(tl, item, mover.hideAt, Math.min(mover.fade, fadeAt(mover.hideAt, SCENE_DURATION)));
  });

  // --- sound ---------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels ---------------------------------------------------------

  // The stage is complete on the first frame: a running container, a heap a
  // third of the way into its limit and already breathing, a collector reading
  // four a minute and two milliseconds, and nothing in the air.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
