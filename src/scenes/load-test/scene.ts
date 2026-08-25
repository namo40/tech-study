import {
  CHART_X0,
  ERRORS_MAX,
  GAUGE_W,
  MEM_BASE_PCT,
  METER_W,
  P95_MAX,
  P95_STEP,
  PCT_STEP,
  RPS_MAX,
  RPS_STEP,
  SCENE_DURATION,
  SLO_P95_MS,
  STAGE_STATE,
  THINK_MS,
  VUS_MAX,
  VUS_STEP,
  WAIT_MAX,
  WAIT_STEP,
  X_DOWN,
  X_UP,
  Y_GEN,
  Y_NODE_TOP,
  fmt,
  xOfVus,
  yOfP95,
  yOfRps,
} from './stage';
import { q } from '../shared/dom';
import { hideRequest, markRequest, mountRequests, parkRequest, showRequest } from '../shared/request';
import type { RequestParts } from '../shared/request';
import { collapseAtInstant, createScheduler } from '../shared/simulation';
import { attr, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Load Test scene: a 24 second, four step timeline.
 *
 * Same two rules as the other scenes: every tween sits at an absolute position,
 * and every discrete change is a zero-duration tween on a `data-*` attribute
 * that GSAP reverts when the playhead moves back past it.
 *
 * Nothing the reader reads off this stage is drawn by hand. The scene is told
 * five things — the ramp plan, the capacity model, the objective, the data
 * cardinality, and the two arrival models — and one pass of `createScheduler`
 * over the whole 24 seconds produces the rest. Every 100 ms it solves the
 * closed model for the load it is under, and throughput, p95, the error rate,
 * the two curves, every marker, the pool, thread and memory meters, and the
 * step 4 comparison all fall out of that one solution. Move `DB_RPS` and the
 * knee moves, the sustainable marker moves, and the labels that name them
 * change with it.
 *
 * The model. A request is answered from the cache or, when it misses, from the
 * database; the database is the scarce thing, so a cache hit ratio `h` leaves
 * the service a capacity of `DB_RPS / (1 - h)`. Response time is the warm floor
 * plus a queueing term that grows as utilisation approaches one, and p95 is a
 * fixed multiple of the mean, which is what an exponential-ish distribution
 * gives. Throughput is then the fixed point of Little's law for a closed model:
 * `X = N / (R(X) + Z)`, solved by bisection. That coupling is the whole point
 * of step 4 — a closed model with think time cannot offer more load than the
 * server lets it, so a slow server quietly throttles its own test.
 *
 * Two compressions of time, and they are not the same scale. One scene second
 * is thirty real seconds while the load is being moved, and two thousand four
 * hundred during the soak, so the two hour hold fits in three seconds. The leak
 * accrues per request served, so it is integrated against real seconds rather
 * than scene seconds, which is why the heap barely moves in steps 1 and 2 and
 * climbs visibly in step 3. Every label keeps the real value.
 *
 * The dots are a sample of the traffic, not every request: the arrival rate
 * they are drawn at is proportional to the virtual user count, and they travel
 * at a fixed speed down one lane and back up the other so that no two of them
 * ever occupy the same point. What the queue is doing is read off `waiting n`
 * rather than off a pile of dots.
 */

const ID = 'load-test';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- the capacity model ----------------------------------------------------

/** Requests per second the database itself can answer. The scarce resource. */
const DB_RPS = 480;
/** Ceiling the application hits when the database is out of the path. */
const APP_RPS = 4000;
/** Connections in the pool, and therefore how long one request may hold one. */
const POOL_SIZE = 10;
const POOL_HOLD_MS = (1000 * POOL_SIZE) / DB_RPS;

/** Milliseconds a cache hit costs, and what a miss adds on top of it. */
const D_CACHE_MS = 5;
const D_DB_MS = 10;
/** How hard the queue bites as utilisation approaches one. */
const QUEUE_MS = 26;
/** What a cold runtime adds before the JIT, the caches and the pool warm up. */
const COLD_MS = 40;
/** Scene seconds the cold term decays over, as a time constant. */
const WARM_TAU = 0.26;

/** p95 over the mean, which is what an exponential-ish distribution gives. */
const TAIL = 3;
/** How long the generator waits for an answer before it counts a failure. */
const TIMEOUT_MS = 550;

/** Requests per second one core answers, and how many there are. */
const CPU_MS = 2.2;
const CORES = 4;

/** The heap the service runs in, and what one request never gives back. */
const HEAP_MB = 2048;
const LEAK_BYTES_PER_REQUEST = 88;

/** Share of requests the cache answers, with realistic ids and with one. */
const CACHE_REAL = 0.6;
const CACHE_HOT = 1;

/** Real seconds one scene second stands for, outside the soak and inside it. */
const REAL_PER_SECOND = 30;
const SOAK_REAL_PER_SECOND = 2400;
const SOAK_FROM = 14;
const SOAK_TO = 17;

const capacityOf = (hit: number): number => Math.min(APP_RPS, DB_RPS / Math.max(1e-6, 1 - hit));
const floorOf = (hit: number): number => D_CACHE_MS + (1 - hit) * D_DB_MS;

/** Mean response time at a throughput, which is the floor plus the queue. */
function responseMs(rps: number, hit: number, cold: number): number {
  const u = Math.min(0.995, Math.max(0, rps / capacityOf(hit)));
  return floorOf(hit) + cold + (QUEUE_MS * u * u) / (1 - u);
}

/** The fixed point of Little's law for `vus` closed-loop users. */
function closedThroughput(vus: number, hit: number, cold: number): number {
  if (vus <= 0) return 0;
  let low = 0;
  let high = capacityOf(hit);
  for (let i = 0; i < 60; i += 1) {
    const mid = (low + high) / 2;
    const offered = (vus * 1000) / (responseMs(mid, hit, cold) + THINK_MS);
    if (offered > mid) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/** Erlang B, and from it the chance an arrival finds every connection busy. */
function erlangC(servers: number, offered: number): number {
  let b = 1;
  for (let n = 1; n <= servers; n += 1) b = (offered * b) / (n + offered * b);
  const rho = offered / servers;
  if (rho >= 1) return 1;
  return b / (1 - rho * (1 - b));
}

// --- what the scene is told to do -----------------------------------------

/** One leg of the ramp plan. `to` is resolved when the leg starts. */
interface RampLeg {
  from: number;
  to: number;
  start: number;
  end: number;
  /** Word the generator shows while this leg runs. */
  stage: 'idle' | 'ramp' | 'hold' | 'soak';
  /** Back off to whatever the run has certified rather than to a number. */
  target?: 'sustainable';
}

const WARM_VUS = 50;
const HOLD_VUS = 100;
const PEAK_VUS = 400;

const PLAN: RampLeg[] = [
  { from: 0, to: 0, start: 0, end: 0.4, stage: 'idle' },
  { from: 0, to: WARM_VUS, start: 0.4, end: 1.6, stage: 'ramp' },
  { from: WARM_VUS, to: HOLD_VUS, start: 1.6, end: 2.2, stage: 'ramp' },
  { from: HOLD_VUS, to: HOLD_VUS, start: 2.2, end: 6.3, stage: 'hold' },
  { from: HOLD_VUS, to: PEAK_VUS, start: 6.3, end: 9, stage: 'ramp' },
  { from: PEAK_VUS, to: PEAK_VUS, start: 9, end: 12.4, stage: 'hold' },
  { from: PEAK_VUS, to: 0, start: 12.4, end: 13.6, stage: 'ramp', target: 'sustainable' },
  { from: 0, to: 0, start: 13.6, end: 14, stage: 'hold', target: 'sustainable' },
  { from: 0, to: 0, start: 14, end: SOAK_TO, stage: 'soak', target: 'sustainable' },
  { from: 0, to: 0, start: SOAK_TO, end: SCENE_DURATION, stage: 'hold', target: 'sustainable' },
];

/** When the data the test sends stops being one hot id and starts being real. */
const HOT_FROM = 18.6;
const HOT_TO = 20.4;
const REAL_FROM = 20.8;
/** When the panels replace the dependency row, and when each of them lights. */
const PANELS_AT = 18.3;
const LIT_HOT = 18.7;
const LIT_REAL = 21;
/** When the generator shows the two arrival models, and switches to the open one. */
const MODEL_AT = 22.6;
const OPEN_AT = 23.2;
const OPEN_SETTLED = 23.7;

/** When the objective is drawn on the chart, and when the back-off is read off. */
const SLO_AT = 12.3;
const SUSTAINABLE_AT = 13.7;

/** Seconds between two samples of the run. */
const TICK = 0.1;
/** Dots per second at rest, and how many more the peak load adds. */
const DOT_BASE = 1;
const DOT_PER_LOAD = 6;
const DOT_FROM = 0.5;
const DOT_UNTIL = 22.5;

/** Seconds one leg of a dot's journey takes. */
const LEG_V = 0.28;
const LEG_H = 0.17;

/** How long a dot takes to go, which is short enough to keep the lane clear. */
const FADE = 0.05;

/** One success in this many landed dots is heard, because they all land. */
const SUCCESS_EVERY = 8;
/** Seconds between two readout cues, so a walking number is not a rattle. */
const STATE_EVERY = 1.3;

// --- what the run produces -------------------------------------------------

interface AttrChange {
  at: number;
  name: string;
  value: string;
}

interface WidthRun {
  at: number;
  duration: number;
  to: number;
}

interface MarkerShow {
  at: number;
  marker: 'warmup' | 'knee' | 'max' | 'sustainable';
  x: number;
  label: string;
}

interface DotRun {
  start: number;
  failed: boolean;
}

interface Sample {
  at: number;
  vus: number;
  rps: number;
  p95: number;
}

interface Run {
  attrs: AttrChange[];
  gauge: WidthRun[];
  pool: WidthRun[];
  cpu: WidthRun[];
  mem: WidthRun[];
  clip: WidthRun[];
  markers: MarkerShow[];
  dots: DotRun[];
  warmCurve: Sample[];
  mainCurve: Sample[];
  cues: [number, SceneCue][];
  /** Numbers the labels that are written once are formatted from. */
  labels: { max: string; sustainable: string; open: string; hot: string[]; real: string[] };
}

// --- the run ---------------------------------------------------------------

function simulate(): Run {
  const rawAttrs: AttrChange[] = [];
  const gauge: WidthRun[] = [];
  const pool: WidthRun[] = [];
  const cpu: WidthRun[] = [];
  const mem: WidthRun[] = [];
  const clip: WidthRun[] = [];
  const markers: MarkerShow[] = [];
  const dots: DotRun[] = [];
  const warmCurve: Sample[] = [];
  const mainCurve: Sample[] = [];
  const cues: [number, SceneCue][] = [];

  const cue = (at: number, name: SceneCue): void => {
    cues.push([round(at), name]);
  };
  const setAttr = (at: number, name: string, value: string): void => {
    rawAttrs.push({ at: round(at), name, value });
  };

  /** A bar that walks from where it was to where it is now. */
  const walk = (series: WidthRun[], at: number, to: number): void => {
    const last = series[series.length - 1];
    const from = last ? last.to : 0;
    if (Math.abs(to - from) < 0.5) return;
    const startedAt = last ? last.at + last.duration : 0;
    series.push({ at: round(Math.max(startedAt, at - TICK)), duration: TICK, to: round(to) });
  };

  // --- the state the pass carries -----------------------------------------

  let sustainableVus = 0;
  let sustainableRps = 0;
  let sustainableX = xOfVus(0);
  let maxRps = 0;
  let maxVus = 0;
  let maxSince = 0;
  let maxFound = false;
  let kneeFound = false;
  let bestSlope = 0;
  let previousRps = 0;
  let previousVus = 0;
  let warmShown = false;
  let poolFlagged = false;
  let leakFlagged = false;
  let cumulativeRequests = 0;
  let clipTo = 0;
  let lastStage = 'idle';
  let lastCue = -STATE_EVERY;
  let errorDebt = 0;
  let landedOk = 0;

  const vusAt = (t: number): number => {
    for (const leg of PLAN) {
      if (t < leg.start || t > leg.end) continue;
      const from = leg.target ? (leg.start >= 13.6 ? sustainableVus : leg.from) : leg.from;
      const to = leg.target ? sustainableVus : leg.to;
      if (leg.end === leg.start) return to;
      const k = (t - leg.start) / (leg.end - leg.start);
      return from + (to - from) * k;
    }
    return 0;
  };

  const stageAt = (t: number): string => {
    for (const leg of PLAN) if (t >= leg.start && t < leg.end) return leg.stage;
    return 'hold';
  };

  /** Cache hit ratio: realistic ids, except while step 4 sends one hot id. */
  const hitAt = (t: number): number => {
    if (t < HOT_FROM) return CACHE_REAL;
    if (t < HOT_FROM + 0.4) return CACHE_REAL + (CACHE_HOT - CACHE_REAL) * ((t - HOT_FROM) / 0.4);
    if (t < HOT_TO) return CACHE_HOT;
    if (t < REAL_FROM) return CACHE_HOT - (CACHE_HOT - CACHE_REAL) * ((t - HOT_TO) / (REAL_FROM - HOT_TO));
    return CACHE_REAL;
  };

  const coldAt = (t: number): number => (t < 0.4 ? COLD_MS : COLD_MS * Math.exp(-(t - 0.4) / WARM_TAU));

  /** Real seconds one scene second stands for at `t`. */
  const realRate = (t: number): number =>
    t >= SOAK_FROM && t < SOAK_TO ? SOAK_REAL_PER_SECOND : REAL_PER_SECOND;

  const step = (n: number, size: number, max: number): number =>
    Math.max(0, Math.min(max / size, Math.round(n / size)));

  const scheduler = createScheduler();

  // --- one sample of the run ----------------------------------------------

  const sample = (t: number): void => {
    const vus = vusAt(t);
    const hit = hitAt(t);
    const cold = coldAt(t);

    const open = t >= OPEN_AT;
    const closedRps = closedThroughput(vus, hit, cold);
    const wanted = open ? Math.max(closedRps, maxRps) : closedRps;
    const eased = open && t < OPEN_SETTLED ? closedRps + (wanted - closedRps) * ((t - OPEN_AT) / (OPEN_SETTLED - OPEN_AT)) : wanted;
    const rps = Math.min(eased, capacityOf(hit));
    const responded = responseMs(rps, hit, cold);
    const p95 = vus <= 0 ? 0 : Math.min(P95_MAX, TAIL * responded);
    const errors = vus <= 0 ? 0 : Math.min(ERRORS_MAX, 100 * Math.exp(-TIMEOUT_MS / Math.max(1, responded)));

    cumulativeRequests += rps * realRate(t) * TICK;

    // Pool occupancy: an arrival that finds every connection busy waits, and a
    // non-empty queue means all ten are held, so the meter reads full.
    const offered = (rps * (1 - hit) * POOL_HOLD_MS) / 1000;
    const busy = erlangC(POOL_SIZE, offered) > 0.5 ? POOL_SIZE : Math.round(offered);
    const waiting = Math.min(WAIT_MAX, (rps * (responded - floorOf(hit) - cold)) / 1000);
    const cpuPct = Math.min(100, (rps * CPU_MS) / (CORES * 10));
    const memPct = Math.min(
      100,
      MEM_BASE_PCT + (cumulativeRequests * LEAK_BYTES_PER_REQUEST) / (HEAP_MB * 1024 * 1024) * 100,
    );

    // --- readouts, which walk rather than jump ----------------------------
    setAttr(t, 'data-vus', String(step(vus, VUS_STEP, VUS_MAX)));
    setAttr(t, 'data-rps', String(step(rps, RPS_STEP, RPS_MAX)));
    setAttr(t, 'data-p95', vus <= 0 ? 'none' : 'live');
    if (vus > 0) setAttr(t, 'data-p95v', String(step(p95, P95_STEP, P95_MAX)));
    setAttr(t, 'data-errors', String(Math.min(ERRORS_MAX, Math.round(errors))));
    setAttr(t, 'data-pool', String(busy));
    setAttr(t, 'data-waiting', String(step(waiting, WAIT_STEP, WAIT_MAX)));
    setAttr(t, 'data-cpu', String(step(cpuPct, PCT_STEP, 100)));
    setAttr(t, 'data-mem', String(step(memPct, PCT_STEP, 100)));

    walk(gauge, t, (GAUGE_W * Math.min(vus, VUS_MAX)) / VUS_MAX);
    walk(pool, t, (METER_W * busy) / POOL_SIZE);
    walk(cpu, t, (METER_W * cpuPct) / 100);
    walk(mem, t, (METER_W * memPct) / 100);

    // --- the stage word the generator is in -------------------------------
    const stage = stageAt(t);
    if (stage !== lastStage) {
      setAttr(t, 'data-stage', stage);
      cue(t, 'trip');
      lastStage = stage;
    }

    // --- the curves, which only grow while the load is being raised --------
    if (vus > 0 && t <= 9.05) {
      const point = { at: round(t), vus, rps, p95 };
      if (cold > COLD_MS * 0.05) warmCurve.push(point);
      else {
        if (mainCurve.length === 0 && warmCurve.length > 0) {
          const join = warmCurve[warmCurve.length - 1];
          if (join) mainCurve.push(join);
        }
        mainCurve.push(point);
      }
      const width = xOfVus(vus) - CHART_X0;
      if (width > clipTo + 0.5) {
        clip.push({ at: round(t - TICK), duration: TICK, to: round(width) });
        clipTo = width;
      }
    }

    // --- what the run works out about itself ------------------------------
    if (!warmShown && cold <= COLD_MS * 0.05 && vus > 0) {
      warmShown = true;
      markers.push({ at: round(t), marker: 'warmup', x: xOfVus(vus), label: 'warm-up' });
    }

    if (vus > previousVus + 1e-6) {
      const slope = (rps - previousRps) / (vus - previousVus);
      if (slope > bestSlope) bestSlope = slope;
      if (!kneeFound && bestSlope > 0 && slope < bestSlope * 0.25 && t > 6.3) {
        kneeFound = true;
        markers.push({ at: round(t), marker: 'knee', x: xOfVus(vus), label: 'knee' });
        cue(t, 'trip');
      }
    }

    if (t <= 12.4 && rps > maxRps + 0.5) {
      maxRps = rps;
      maxVus = vus;
      maxSince = t;
    } else if (!maxFound && maxRps > 0 && t - maxSince >= 0.6 && t > 6.3) {
      maxFound = true;
      markers.push({
        at: round(t),
        marker: 'max',
        x: xOfVus(maxVus),
        label: `max ${fmt(Math.round(maxRps / 10) * 10)} rps`,
      });
      cue(t, 'trip');
    }

    if (p95 > 0 && p95 <= SLO_P95_MS && rps > sustainableRps && t <= 12.4) {
      sustainableRps = rps;
      sustainableVus = Math.round(vus);
      sustainableX = xOfVus(vus);
    }

    if (!poolFlagged && busy >= POOL_SIZE) {
      poolFlagged = true;
      cue(t, 'trip');
    }
    setAttr(t, `meter@pool`, busy >= POOL_SIZE ? 'full' : busy >= POOL_SIZE * 0.7 ? 'warn' : 'calm');
    setAttr(t, `meter@cpu`, cpuPct >= 85 ? 'full' : cpuPct >= 60 ? 'warn' : 'calm');
    setAttr(t, `meter@mem`, memPct >= 65 ? 'warn' : 'calm');

    if (!leakFlagged && memPct >= 65) {
      leakFlagged = true;
      cue(t, 'trip');
    }

    previousRps = rps;
    previousVus = vus;

    // A readout cue never lands on a step boundary, because a boundary is
    // meant to be quiet in the ear as well as on the stage.
    const onBoundary = STEPS.some((entry) => Math.abs(t - entry.time) < 0.15);
    if (t - lastCue >= STATE_EVERY && t < DOT_UNTIL && vus > 0 && !onBoundary) {
      lastCue = t;
      cue(t, 'state');
    }

    if (t + TICK <= SCENE_DURATION) scheduler.schedule(t + TICK, () => sample(round(t + TICK)));
  };

  /** One sampled request, which books the next one from the rate it sees. */
  const emit = (at: number): void => {
    const vus = vusAt(at);
    const hit = hitAt(at);
    const cold = coldAt(at);
    const rps = closedThroughput(vus, hit, cold);
    const responded = responseMs(rps, hit, cold);
    const errors = 100 * Math.exp(-TIMEOUT_MS / Math.max(1, responded));

    errorDebt += errors / 100;
    const failed = errorDebt >= 1;
    if (failed) errorDebt -= 1;

    dots.push({ start: round(at), failed });
    const home = round(at + LEG_V + LEG_H + LEG_V);
    if (failed) cue(round(at + LEG_V + LEG_H), 'failure');
    else {
      landedOk += 1;
      if (landedOk % SUCCESS_EVERY === 0) cue(home, 'success');
    }

    const next = round(at + 1 / (DOT_BASE + (DOT_PER_LOAD * Math.min(vus, VUS_MAX)) / VUS_MAX));
    if (next < DOT_UNTIL) scheduler.schedule(next, () => emit(next));
  };

  scheduler.schedule(0, () => sample(0));
  scheduler.schedule(DOT_FROM, () => emit(DOT_FROM));
  scheduler.drain();

  // --- what the run decided, written once ---------------------------------

  markers.push({
    at: SUSTAINABLE_AT,
    marker: 'sustainable',
    x: sustainableX,
    label: `sustainable ${fmt(Math.round(sustainableRps / 10) * 10)} rps`,
  });
  cue(SUSTAINABLE_AT, 'success');

  setAttr(SLO_AT, 'data-slo', 'on');
  cue(SLO_AT, 'trip');

  setAttr(PANELS_AT, 'data-panels', 'on');
  cue(PANELS_AT, 'trip');
  setAttr(LIT_HOT, 'data-lit', 'hot');
  cue(LIT_HOT, 'trip');
  setAttr(LIT_REAL, 'data-lit', 'real');
  cue(LIT_REAL, 'success');

  setAttr(MODEL_AT, 'data-model', 'closed');
  cue(MODEL_AT, 'trip');
  setAttr(OPEN_AT, 'data-model', 'open');
  cue(OPEN_AT, 'trip');

  const panelAt = (t: number): string[] => {
    const hit = hitAt(t);
    const cold = coldAt(t);
    const rps = closedThroughput(vusAt(t), hit, cold);
    return [`rps ${fmt(rps)}`, `p95 ${fmt(TAIL * responseMs(rps, hit, cold))} ms`];
  };

  // --- put the discrete changes in time order -----------------------------

  const inTimeOrder = <T extends { at: number }>(series: readonly T[]): T[] =>
    series
      .map((entry, index) => ({ entry, index }))
      .sort((left, right) => left.entry.at - right.entry.at || left.index - right.index)
      .map(({ entry }) => entry);

  const collapsed: AttrChange[] = [];
  for (const entry of inTimeOrder(rawAttrs)) {
    collapseAtInstant(collapsed, entry, (change) => change.name);
  }

  // The meters carry their own `data-meter`, so their resting values join the
  // stage's before anything is compared against them.
  const seen = new Map<string, string>([
    ...Object.entries(STAGE_STATE),
    ['meter@pool', 'calm'],
    ['meter@cpu', 'calm'],
    ['meter@mem', 'calm'],
  ]);
  const attrs: AttrChange[] = [];
  for (const change of collapsed) {
    if (seen.get(change.name) === change.value) continue;
    seen.set(change.name, change.value);
    attrs.push(change);
  }

  cues.sort((left, right) => left[0] - right[0]);

  return {
    attrs,
    gauge,
    pool,
    cpu,
    mem,
    clip,
    markers: inTimeOrder(markers),
    dots,
    warmCurve,
    mainCurve,
    cues,
    labels: {
      max: `max ${fmt(Math.round(maxRps / 10) * 10)} rps`,
      sustainable: `sustainable ${fmt(Math.round(sustainableRps / 10) * 10)} rps`,
      open: `arrival rate ${fmt(Math.round(maxRps / 10) * 10)} rps`,
      hot: panelAt(HOT_TO - 0.1),
      real: panelAt(REAL_FROM + 1),
    },
  };
}

// --- the timeline ----------------------------------------------------------

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const run = simulate();

  const gaugeFill = q<SVGRectElement>(stage, '.lt-gauge-fill', ID);
  const poolFill = q<SVGRectElement>(stage, '.lt-pool-fill', ID);
  const cpuFill = q<SVGRectElement>(stage, '.lt-cpu-fill', ID);
  const memFill = q<SVGRectElement>(stage, '.lt-mem-fill', ID);
  const clipRect = q<SVGRectElement>(stage, '.lt-clip', ID);
  const meterEls: Record<string, SVGGElement> = {
    pool: q<SVGGElement>(stage, '.lt-meter--pool', ID),
    cpu: q<SVGGElement>(stage, '.lt-meter--cpu', ID),
    mem: q<SVGGElement>(stage, '.lt-meter--mem', ID),
  };
  const markerEls: Record<string, SVGGElement> = {
    warmup: q<SVGGElement>(stage, '.lt-marker--warmup', ID),
    knee: q<SVGGElement>(stage, '.lt-marker--knee', ID),
    max: q<SVGGElement>(stage, '.lt-marker--max', ID),
    sustainable: q<SVGGElement>(stage, '.lt-marker--sustainable', ID),
  };
  const layer = q<SVGGElement>(stage, '.scene-requests', ID);

  // --- what the run decided, written into the markup once ------------------

  const points = (samples: Sample[], y: (value: number) => number, key: 'rps' | 'p95'): string =>
    samples.map((s) => `${round(xOfVus(s.vus))},${round(y(s[key]))}`).join(' ');

  q<SVGPolylineElement>(stage, '.lt-curve--tp-warm', ID).setAttribute(
    'points',
    points(run.warmCurve, yOfRps, 'rps'),
  );
  q<SVGPolylineElement>(stage, '.lt-curve--p95-warm', ID).setAttribute(
    'points',
    points(run.warmCurve, yOfP95, 'p95'),
  );
  q<SVGPolylineElement>(stage, '.lt-curve--tp', ID).setAttribute(
    'points',
    points(run.mainCurve, yOfRps, 'rps'),
  );
  q<SVGPolylineElement>(stage, '.lt-curve--p95', ID).setAttribute(
    'points',
    points(run.mainCurve, yOfP95, 'p95'),
  );

  q<SVGTextElement>(stage, '.lt-marker-label--max', ID).textContent = run.labels.max;
  q<SVGTextElement>(stage, '.lt-marker-label--sustainable', ID).textContent = run.labels.sustainable;
  q<SVGTextElement>(stage, '.lt-model--open', ID).textContent = run.labels.open;
  q<SVGTextElement>(stage, '.lt-panel-rps--hot', ID).textContent = run.labels.hot[0] ?? '';
  q<SVGTextElement>(stage, '.lt-panel-p95--hot', ID).textContent = run.labels.hot[1] ?? '';
  q<SVGTextElement>(stage, '.lt-panel-rps--real', ID).textContent = run.labels.real[0] ?? '';
  q<SVGTextElement>(stage, '.lt-panel-p95--real', ID).textContent = run.labels.real[1] ?? '';

  const requests = mountRequests(layer, run.dots.length, ID);

  const tl = createSceneTimeline();

  // --- discrete state ------------------------------------------------------

  for (const change of run.attrs) {
    const meter = change.name.startsWith('meter@') ? meterEls[change.name.slice(6)] : undefined;
    if (meter) attr(tl, meter, 'data-meter', change.value, change.at);
    else attr(tl, stage, change.name, change.value, change.at);
  }

  // --- bars, which walk ----------------------------------------------------

  const walkBar = (element: SVGRectElement, series: { at: number; duration: number; to: number }[]): void => {
    for (const runStep of series) {
      tl.to(
        element,
        { attr: { width: runStep.to }, duration: runStep.duration, ease: 'none', immediateRender: false },
        runStep.at,
      );
    }
  };

  walkBar(gaugeFill, run.gauge);
  walkBar(poolFill, run.pool);
  walkBar(cpuFill, run.cpu);
  walkBar(memFill, run.mem);
  walkBar(clipRect, run.clip);

  // --- the markers the run worked out -------------------------------------

  for (const marker of run.markers) {
    const element = markerEls[marker.marker];
    if (!element) continue;
    tl.set(
      element,
      { x: marker.x, attr: { 'data-shown': '1' }, immediateRender: false },
      marker.at,
    );
  }
  attr(tl, q<SVGGElement>(stage, '.lt-marker--max', ID), 'data-shown', '2', SUSTAINABLE_AT);

  // --- the traffic ---------------------------------------------------------

  run.dots.forEach((dot, index) => {
    const parts = requests[index] as RequestParts | undefined;
    if (!parts) return;
    parkRequest(parts, X_DOWN, Y_GEN);
    showRequest(tl, parts, dot.start);
    tl.to(parts.group, { y: Y_NODE_TOP, duration: LEG_V, ease: 'none' }, dot.start);
    tl.to(parts.group, { x: X_UP, duration: LEG_H, ease: 'none' }, dot.start + LEG_V);
    const turn = round(dot.start + LEG_V + LEG_H);
    markRequest(tl, parts, dot.failed ? 'fail' : 'ok', turn);
    tl.to(parts.group, { y: Y_GEN, duration: LEG_V, ease: 'none' }, turn);
    hideRequest(tl, parts, round(turn + LEG_V), FADE);
  });

  // --- sound ---------------------------------------------------------------

  for (const [at, name] of run.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels ---------------------------------------------------------

  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
