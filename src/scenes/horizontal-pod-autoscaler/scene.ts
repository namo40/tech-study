import {
  CPU_W,
  LAT_BAR_W,
  POD_COUNT,
  POD_X,
  QUEUE_BAR_W,
  QUEUE_MAX,
  QUEUE_STEP,
  SCENE_DURATION,
  STAGE_STATE,
  X_CLIENT,
  Y_ARRIVE,
  Y_CLIENT,
  Y_RAIL,
} from './stage';
import { q, qa } from '../shared/dom';
import { hideRequest, markRequest, mountRequests, parkRequest, showRequest } from '../shared/request';
import type { RequestParts, RequestResult } from '../shared/request';
import { collapseAtInstant, createScheduler } from '../shared/simulation';
import { attr, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Horizontal Pod Autoscaler scene: a 24 second, four step timeline.
 *
 * Same two rules as the other scenes: every tween sits at an absolute position,
 * and every discrete change is a zero-duration tween on a `data-*` attribute
 * that GSAP reverts when the playhead moves back past it.
 *
 * Nothing about the scaling is authored. The scene is told three things and
 * nothing else: the traffic curve, what the autoscaler is configured with, and
 * when the workload stops being CPU bound. One pass over the whole 24 seconds
 * produces everything the reader counts — what each pod's CPU reads, what the
 * autoscaler saw on each of its sixteen ticks, the number its formula came out
 * with, which pods were asked for and when they finished starting, how long the
 * stabilisation window held a scale-in back, how deep the backlog grew, where
 * the latency meter sat, which pod each request was routed to, and which
 * requests came back with a cross because the pods they reached were already
 * past what they could serve.
 *
 * Two compressions of time. One scene second is ten real seconds, which is what
 * makes the fifteen second control loop a tick every 1.5s and the thirty second
 * pod startup a ring that takes three. The stabilisation window is the
 * exception: five real minutes at that rate would be thirty seconds of a
 * twenty-four second scene, so the ring sweeps in 3.5s instead. Both labels
 * keep the real values, because those are the numbers a reader would set.
 *
 * The one rule worth naming, because it is the real one rather than a
 * simplification: a pod that has not finished starting is counted in the
 * replica count but contributes nothing to the average. That is what stops the
 * autoscaler asking for seven pods at 9.4s, when two pods are pinned at 95% and
 * two more are still coming up.
 */

const ID = 'horizontal-pod-autoscaler';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- how time is compressed -----------------------------------------------

/** Real seconds one scene second stands for. */
const REAL_PER_SCENE = 10;
/** The control loop's fifteen seconds, and a pod's thirty second startup. */
const TICK_EVERY = 15 / REAL_PER_SCENE;
const TICK_FIRST = 0.4;
const START_SECONDS = 30 / REAL_PER_SCENE;
/**
 * Five real minutes would be thirty scene seconds, which does not fit. The ring
 * sweeps in 3.5s and the caption keeps saying five minutes.
 */
const WINDOW_SECONDS = 3.5;

// --- what the scene is told -----------------------------------------------

/** The traffic curve, in real requests per second. */
const TRAFFIC: [number, number][] = [
  [0, 20],
  [6.5, 60],
  [12.3, 20],
  [13.8, 45],
  [14.8, 20],
  [18.2, 120],
];

/** When the work stops being CPU bound and starts being spent waiting on I/O. */
const IO_FROM = 18.2;

/** What a request costs a pod, and how many a pod can carry, in each regime. */
const CPU_PER_RPS = 3.5;
const CPU_CAP = 95;
const CPU_POD_RPS = CPU_CAP / CPU_PER_RPS;
const IO_CPU_PER_RPS = 0.5;
const IO_POD_RPS = 50;

/** What the autoscaler is configured with. */
const MIN_REPLICAS = 2;
const MAX_REPLICAS = 8;
const CPU_TARGET = 60;
const QUEUE_TARGET = 100;
/** When the metric it scales on is changed from CPU to queue depth. */
const METRIC_SWITCH_AT = 19.9;

/** How long the node stays lit after a tick, and when the requests note shows. */
const TICK_FLASH = 0.2;
const NOTE_FROM = 20.6;
const NOTE_TO = 22.6;

// --- how a request moves --------------------------------------------------

/**
 * One speed for every leg of every journey, in pixels per second. A fixed speed
 * rather than a fixed duration is what keeps requests off each other: they all
 * leave the same point on the same lane, so two that left `d` seconds apart stay
 * `SPEED * d` apart for as long as they share the route.
 */
const SPEED = 2800;
const DROP_TO_RAIL = (Y_RAIL - Y_CLIENT) / SPEED;
const DROP_TO_POD = (Y_ARRIVE - Y_RAIL) / SPEED;
/** How long a pod holds a request, and how long its result marker stays. */
const DWELL = 0.08;
const FADE = 0.14;

/** How far apart the dots are, which is the traffic rate the reader can count. */
const DOT_GAP_MIN = 0.2;
const DOT_GAP_MAX = 0.35;
const DOT_PER_RPS = 7;
/** The last dot has to land and clear before the scene ends. */
const LAST_START = 23.05;

// --- how the meters read --------------------------------------------------

/** Seconds a meter takes to walk to a new value, so nothing jumps. */
const RAMP = 0.45;
/** Where the latency meter stops reading as fast, and where it reads as full. */
const LAT_SLOW = 0.45;
const LAT_HOT = 0.85;
/** How much a full backlog adds to the latency bar on top of pod utilisation. */
const LAT_QUEUE_SHARE = 0.35;

// --- what the simulation produces -----------------------------------------

type Metric = 'cpu' | 'queue';

interface Outcome {
  pod: number;
  decideAt: number;
  railExitAt: number;
  arriveAt: number;
  markAt: number;
  fadeAt: number;
  result: RequestResult;
}

interface AttrChange {
  at: number;
  key: string;
  name: string;
  value: string;
}

interface Segment {
  from: number;
  to: number;
  vFrom: number;
  vTo: number;
}

interface RingSweep {
  index: number;
  from: number;
  to: number;
}

interface Simulation {
  starts: number[];
  outcomes: Outcome[];
  attrs: AttrChange[];
  cpu: Segment[][];
  latency: Segment[];
  queue: Segment[];
  startRings: RingSweep[];
  windows: [number, number][];
  cues: [number, SceneCue][];
}

// --- the meters as continuous lines ---------------------------------------

/**
 * Turns a series of `[time, value]` targets into the line a meter draws: the
 * value walks towards whatever it has been told, at a fixed number of pixels a
 * second, and stops when it gets there. Chasing rather than jumping is what
 * lets one meter follow another quantity that is itself still moving — the
 * latency bar tracks a backlog that changes every hundredth of a second — while
 * a change that arrives on its own still takes `RAMP` seconds to land. The bar
 * is tweened from the whole line, so no frame is placed by hand and a scrub
 * lands wherever the walk had got to.
 */
function chaseSeries(changes: [number, number][], end: number, span: number): Segment[] {
  const rate = span / RAMP;
  const segments: Segment[] = [];
  let value = changes[0]?.[1] ?? 0;
  let at = 0;
  const hold = (until: number): void => {
    if (until <= at) return;
    segments.push({ from: round(at), to: round(until), vFrom: value, vTo: value });
    at = until;
  };
  for (let index = 0; index < changes.length; index += 1) {
    const entry = changes[index];
    if (!entry) continue;
    const [from, target] = entry;
    const until = Math.min(changes[index + 1]?.[0] ?? end, end);
    if (until <= from) continue;
    hold(from);
    if (value !== target) {
      const need = Math.abs(target - value) / rate;
      const reach = Math.min(at + need, until);
      const settled =
        need <= until - at
          ? target
          : round(value + Math.sign(target - value) * rate * (reach - at));
      segments.push({ from: round(at), to: round(reach), vFrom: value, vTo: settled });
      value = settled;
      at = reach;
    }
    hold(until);
  }
  hold(end);
  return segments;
}

/** The backlog readout, which steps in `QUEUE_STEP` while the bar is continuous. */
const snapQueue = (value: number): number =>
  Math.min(QUEUE_MAX, Math.max(0, Math.round(value / QUEUE_STEP) * QUEUE_STEP));

// --- the simulation -------------------------------------------------------

function simulate(): Simulation {
  const raw: AttrChange[] = [];
  const cues: [number, SceneCue][] = [];
  const setAttr = (at: number, key: string, name: string, value: string): void => {
    raw.push({ at: round(at), key, name, value });
  };
  const cue = (at: number, name: SceneCue): void => {
    cues.push([round(at), name]);
  };

  // --- the pods themselves ------------------------------------------------

  type PodState = 'absent' | 'starting' | 'ready';
  const pods: { state: PodState; busyUntil: number; draining: boolean }[] = POD_X.map(
    (_x, index) => ({
      state: index < MIN_REPLICAS ? ('ready' as PodState) : ('absent' as PodState),
      busyUntil: 0,
      draining: false,
    }),
  );
  const startRings: RingSweep[] = [];
  const windows: [number, number][] = [];

  const readyCount = (): number => pods.filter((p) => p.state === 'ready' && !p.draining).length;
  const replicaCount = (): number =>
    pods.filter((p) => p.state !== 'absent' && !p.draining).length;
  const startingCount = (): number => pods.filter((p) => p.state === 'starting').length;

  // --- what the workload costs -------------------------------------------

  let offered = TRAFFIC[0]?.[1] ?? 20;
  let metric: Metric = 'cpu';
  let queue = 0;
  let queueAt = 0;
  /** Fraction of a request the pods could not take, carried between dots. */
  let shedCredit = 0;

  const regimeAt = (at: number): 'cpu' | 'io' => (at >= IO_FROM ? 'io' : 'cpu');
  const costPerRps = (at: number): number =>
    regimeAt(at) === 'io' ? IO_CPU_PER_RPS : CPU_PER_RPS;
  const podCapacity = (at: number): number => (regimeAt(at) === 'io' ? IO_POD_RPS : CPU_POD_RPS);

  /** CPU of one ready pod, which is the same for all of them under round robin. */
  const cpuOf = (at: number): number => {
    const ready = readyCount();
    if (ready === 0) return 0;
    return Math.min(CPU_CAP, (offered / ready) * costPerRps(at));
  };

  /** How far past what it can carry one pod is being asked to go. */
  const utilisation = (at: number): number => {
    const ready = readyCount();
    if (ready === 0) return 2;
    return offered / ready / podCapacity(at);
  };

  const cpuSeries: [number, number][][] = POD_X.map(() => [[0, 0]]);
  const latencySeries: [number, number][] = [];
  const queueSeries: Segment[] = [];

  let queueHundred = 0;

  const latencyFor = (u: number, backlog: number): number => {
    const base = u >= 1 ? 1 : u < 0.75 ? 0.73 * u : 0.55 + (u - 0.75) * 1.8;
    return Math.min(1, base + LAT_QUEUE_SHARE * (backlog / QUEUE_MAX));
  };

  /**
   * Moves the backlog forward to `to` and draws the line it walked. The backlog
   * only exists in the I/O bound regime: CPU bound work that cannot be served
   * is refused rather than held.
   */
  const advanceQueue = (to: number): void => {
    if (to <= queueAt) return;
    const from = queueAt;
    const before = queue;
    let after = before;
    // Where the backlog stops moving because it ran out or hit its limit, which
    // is a real instant and has to be found rather than rounded past: the whole
    // of the drain in step 4 happens inside one interval.
    let level = to;
    if (regimeAt(from) === 'io') {
      const served = readyCount() * IO_POD_RPS;
      const net = (offered - served) * REAL_PER_SCENE;
      after = before + net * (to - from);
      if (after > QUEUE_MAX) {
        level = from + (QUEUE_MAX - before) / net;
        after = QUEUE_MAX;
      } else if (after < 0) {
        level = from + (0 - before) / net;
        after = 0;
      }
    } else {
      after = 0;
    }
    queueSeries.push({
      from: round(from),
      to: round(level),
      vFrom: round((before / QUEUE_MAX) * QUEUE_BAR_W),
      vTo: round((after / QUEUE_MAX) * QUEUE_BAR_W),
    });
    // The readout steps where the bar crosses each `QUEUE_STEP`, and every one
    // of those instants is also a point the latency meter is read at, because
    // waiting behind a backlog is most of what the latency meter is measuring.
    const crossings: [number, number][] = [];
    const steps = QUEUE_MAX / QUEUE_STEP;
    for (let n = 0; n <= steps; n += 1) {
      const step = n * QUEUE_STEP;
      const crossed = (before < step && after >= step) || (before > step && after <= step);
      if (!crossed || after === before) continue;
      crossings.push([from + ((step - before) / (after - before)) * (level - from), step]);
    }
    crossings.sort((left, right) => left[0] - right[0]);
    queueAt = to;
    for (const [at, step] of crossings) {
      setAttr(at, 'stage', 'data-queue', String(step));
      // A hundred deep is where the backlog is worth a sound of its own.
      if (step % 100 === 0 && step !== queueHundred) {
        queueHundred = step;
        cue(at, 'state');
      }
      queue = step;
      recompute(at);
    }
    setAttr(level, 'stage', 'data-queue', String(snapQueue(after)));
    queue = after;
    recompute(level);
  };

  /** Writes what every meter reads once something about the load has changed. */
  const recompute = (at: number): void => {
    const cpu = cpuOf(at);
    for (let index = 0; index < POD_COUNT; index += 1) {
      const state = pods[index]?.state;
      const value = state === 'ready' ? (cpu / 100) * CPU_W : 0;
      const series = cpuSeries[index];
      if (!series) continue;
      const last = series[series.length - 1];
      if (last && last[0] === round(at)) last[1] = round(value);
      else if (!last || last[1] !== round(value)) series.push([round(at), round(value)]);
    }
    const fill = round(latencyFor(utilisation(at), queue) * LAT_BAR_W);
    const last = latencySeries[latencySeries.length - 1];
    if (last && last[0] === round(at)) last[1] = fill;
    else if (!last || last[1] !== fill) latencySeries.push([round(at), fill]);
  };

  const { schedule, drain } = createScheduler();

  // --- the traffic curve --------------------------------------------------

  for (const [at, rate] of TRAFFIC) {
    if (at === 0) continue;
    schedule(at, () => {
      advanceQueue(at);
      offered = rate;
      setAttr(at, 'stage', 'data-rps', String(rate));
      recompute(at);
    });
  }

  schedule(IO_FROM, () => {
    advanceQueue(IO_FROM);
    recompute(IO_FROM);
  });

  // --- the metric it scales on -------------------------------------------

  schedule(METRIC_SWITCH_AT, () => {
    advanceQueue(METRIC_SWITCH_AT);
    metric = 'queue';
    setAttr(METRIC_SWITCH_AT, 'stage', 'data-metric', 'queue');
    cue(METRIC_SWITCH_AT, 'trip');
  });

  schedule(NOTE_FROM, () => {
    setAttr(NOTE_FROM, 'stage', 'data-request-note', 'on');
    cue(NOTE_FROM, 'state');
  });
  schedule(NOTE_TO, () => {
    setAttr(NOTE_TO, 'stage', 'data-request-note', 'off');
  });

  // --- starting and stopping pods ----------------------------------------

  const startPods = (at: number, count: number): void => {
    let left = count;
    for (let index = 0; index < POD_COUNT && left > 0; index += 1) {
      const pod = pods[index];
      if (!pod || pod.state !== 'absent') continue;
      pod.state = 'starting';
      setAttr(at, `pod-${index + 1}`, 'data-pod', 'starting');
      startRings.push({ index, from: round(at), to: round(at + START_SECONDS) });
      left -= 1;
      const ready = round(at + START_SECONDS);
      schedule(ready, () => {
        const target = pods[index];
        if (!target || target.state !== 'starting') return;
        advanceQueue(ready);
        target.state = 'ready';
        setAttr(ready, `pod-${index + 1}`, 'data-pod', 'ready');
        cue(ready, 'success');
        recompute(ready);
      });
    }
  };

  /** Takes a pod out once whatever it is holding has finished. */
  const stopPod = (at: number, index: number): void => {
    const pod = pods[index];
    if (!pod || pod.state !== 'ready') return;
    pod.draining = true;
    const gone = round(Math.max(at, pod.busyUntil));
    schedule(gone, () => {
      const target = pods[index];
      if (!target) return;
      advanceQueue(gone);
      target.state = 'absent';
      target.draining = false;
      setAttr(gone, `pod-${index + 1}`, 'data-pod', 'absent');
      recompute(gone);
    });
  };

  const stopDownTo = (at: number, wanted: number): void => {
    let running = readyCount();
    for (let index = POD_COUNT - 1; index >= 0 && running > wanted; index -= 1) {
      const pod = pods[index];
      if (!pod || pod.state !== 'ready' || pod.draining) continue;
      stopPod(at, index);
      running -= 1;
    }
  };

  // --- the control loop ---------------------------------------------------

  let desired = MIN_REPLICAS;
  let windowFrom: number | null = null;
  let windowWanted = MIN_REPLICAS;

  const evaluate = (at: number): void => {
    advanceQueue(at);
    setAttr(at, 'stage', 'data-tick', 'on');
    setAttr(at + TICK_FLASH, 'stage', 'data-tick', 'off');
    cue(at, 'state');

    const replicas = replicaCount();
    const ready = readyCount();
    // A pod that has not finished starting counts as a replica and contributes
    // nothing to the average, which is the rule that stops a scale-out from
    // compounding while the pods it asked for are still coming up.
    let average = 0;
    if (metric === 'cpu') {
      average = replicas === 0 ? 0 : Math.round((cpuOf(at) * ready) / replicas);
      setAttr(at, 'stage', 'data-avg', String(Math.min(100, Math.max(0, average))));
    } else {
      average = replicas === 0 ? 0 : snapQueue(snapQueue(queue) / replicas);
      setAttr(at, 'stage', 'data-qavg', String(average));
    }
    setAttr(at, 'stage', 'data-replicas', String(replicas));

    const target = metric === 'cpu' ? CPU_TARGET : QUEUE_TARGET;
    const wanted = Math.min(
      MAX_REPLICAS,
      Math.max(MIN_REPLICAS, Math.ceil((replicas * average) / target)),
    );
    if (wanted !== desired) {
      desired = wanted;
      setAttr(at, 'stage', 'data-desired', String(wanted));
      cue(at, 'state');
    }

    if (wanted > replicas) {
      // Scaling out is eager, but not while the pods already asked for are
      // still starting: they are the answer to the load that is being read.
      if (startingCount() === 0) {
        startPods(at, wanted - replicas);
        cue(at, 'trip');
      }
      if (windowFrom !== null) {
        windows.push([windowFrom, at]);
        windowFrom = null;
        setAttr(at, 'stage', 'data-stabilizing', 'off');
      }
      return;
    }

    if (wanted < replicas) {
      windowWanted = wanted;
      if (windowFrom === null) {
        windowFrom = at;
        setAttr(at, 'stage', 'data-stabilizing', 'on');
        cue(at, 'trip');
        const ends = round(at + WINDOW_SECONDS);
        schedule(ends, () => {
          if (windowFrom === null) return;
          windows.push([windowFrom, ends]);
          windowFrom = null;
          advanceQueue(ends);
          setAttr(ends, 'stage', 'data-stabilizing', 'off');
          stopDownTo(ends, windowWanted);
          cue(ends, 'trip');
        });
      }
      return;
    }

    if (windowFrom !== null) {
      windows.push([windowFrom, at]);
      windowFrom = null;
      setAttr(at, 'stage', 'data-stabilizing', 'off');
    }
  };

  for (let at = TICK_FIRST; at < SCENE_DURATION; at = round(at + TICK_EVERY)) {
    const when = at;
    schedule(when, () => evaluate(when));
  }

  // --- the requests -------------------------------------------------------

  const rateAt = (at: number): number => {
    let value = TRAFFIC[0]?.[1] ?? 20;
    for (const [from, rate] of TRAFFIC) if (at >= from) value = rate;
    return value;
  };
  const gapAt = (at: number): number =>
    Math.min(DOT_GAP_MAX, Math.max(DOT_GAP_MIN, DOT_PER_RPS / rateAt(at)));

  const starts: number[] = [];
  for (let at = 0.4; at <= LAST_START; at = round(at + gapAt(at))) starts.push(round(at));

  const outcomes: Outcome[] = starts.map(() => ({
    pod: 0,
    decideAt: 0,
    railExitAt: 0,
    arriveAt: 0,
    markAt: 0,
    fadeAt: 0,
    result: 'ok' as RequestResult,
  }));

  let cursor = 0;
  /** Round robin over the pods that are ready and not already holding one. */
  const pick = (at: number): number => {
    let fallback = -1;
    let freest = Number.POSITIVE_INFINITY;
    for (let step = 0; step < POD_COUNT; step += 1) {
      const index = (cursor + step) % POD_COUNT;
      const pod = pods[index];
      if (!pod || pod.state !== 'ready' || pod.draining) continue;
      if (pod.busyUntil <= at) {
        cursor = (index + 1) % POD_COUNT;
        return index;
      }
      if (pod.busyUntil < freest) {
        freest = pod.busyUntil;
        fallback = index;
      }
    }
    if (fallback >= 0) cursor = (fallback + 1) % POD_COUNT;
    return fallback;
  };

  starts.forEach((start, index) => {
    const outcome = outcomes[index];
    if (!outcome) return;
    const decideAt = round(start + DROP_TO_RAIL);
    outcome.decideAt = decideAt;
    schedule(decideAt, () => {
      advanceQueue(decideAt);
      const chosen = pick(decideAt);
      if (chosen < 0) return;
      const pod = pods[chosen];
      if (!pod) return;
      const across = Math.abs((POD_X[chosen] ?? 0) - X_CLIENT) / SPEED;
      const railExitAt = round(decideAt + across);
      const arriveAt = round(railExitAt + DROP_TO_POD);
      const markAt = round(arriveAt + DWELL);
      const fadeAt = round(markAt + FADE);

      // Whether this one comes back is not a property of the request. It is the
      // share of the offered load the pods cannot take, carried between dots so
      // a 10% overload refuses one dot in ten rather than none or all of them.
      const u = utilisation(decideAt);
      const full = regimeAt(decideAt) === 'io' && queue >= QUEUE_MAX;
      const refused =
        regimeAt(decideAt) === 'io'
          ? full
            ? Math.max(0, 1 - (readyCount() * IO_POD_RPS) / offered)
            : 0
          : Math.max(0, 1 - 1 / u);
      shedCredit += refused;
      let result: RequestResult = 'ok';
      if (shedCredit >= 1) {
        shedCredit -= 1;
        result = 'fail';
      }

      pod.busyUntil = fadeAt;
      outcome.pod = chosen;
      outcome.railExitAt = railExitAt;
      outcome.arriveAt = arriveAt;
      outcome.markAt = markAt;
      outcome.fadeAt = fadeAt;
      outcome.result = result;
      cue(markAt, result === 'ok' ? 'success' : 'failure');
    });
  });

  schedule(SCENE_DURATION, () => {
    advanceQueue(SCENE_DURATION);
    recompute(SCENE_DURATION);
  });

  recompute(0);
  drain();

  // --- the meters, once every load is known -------------------------------

  const cpu = cpuSeries.map((series) => chaseSeries(series, SCENE_DURATION, CPU_W));
  const latency = chaseSeries(latencySeries, SCENE_DURATION, LAT_BAR_W);

  // The word under the latency bar is read off the bar itself rather than off
  // the value it is walking towards, so the two can never disagree and the
  // meter is seen passing through amber on its way to red.
  const bandOf = (value: number): string =>
    value >= LAT_HOT * LAT_BAR_W ? 'overload' : value >= LAT_SLOW * LAT_BAR_W ? 'slow' : 'fast';
  let band = 'fast';
  for (const segment of latency) {
    if (bandOf(segment.vFrom) !== band) {
      band = bandOf(segment.vFrom);
      setAttr(segment.from, 'stage', 'data-latency', band);
      cue(segment.from, 'state');
    }
    if (segment.vTo === segment.vFrom) continue;
    const edges = [LAT_SLOW, LAT_HOT]
      .map((share) => share * LAT_BAR_W)
      .filter(
        (edge) =>
          (segment.vFrom < edge && segment.vTo >= edge) ||
          (segment.vFrom > edge && segment.vTo <= edge),
      )
      .sort((left, right) => (segment.vTo > segment.vFrom ? left - right : right - left));
    for (const edge of edges) {
      const at =
        segment.from +
        ((edge - segment.vFrom) / (segment.vTo - segment.vFrom)) * (segment.to - segment.from);
      const next = segment.vTo > segment.vFrom ? bandOf(edge) : bandOf(edge - 0.001);
      if (next === band) continue;
      band = next;
      setAttr(at, 'stage', 'data-latency', band);
      cue(at, 'state');
    }
  }

  // --- put the discrete changes in time order -----------------------------

  const inTimeOrder = raw
    .map((entry, order) => ({ entry, order }))
    .sort((left, right) => left.entry.at - right.entry.at || left.order - right.order)
    .map(({ entry }) => entry);

  const folded: AttrChange[] = [];
  for (const entry of inTimeOrder) {
    collapseAtInstant(folded, entry, (change) => `${change.key}@${change.name}`);
  }

  const seen = new Map<string, string>(Object.entries(STAGE_STATE));
  const attrs: AttrChange[] = [];
  for (const change of folded) {
    const id = `${change.key}@${change.name}`;
    if (seen.get(id) === change.value) continue;
    seen.set(id, change.value);
    attrs.push(change);
  }

  cues.sort((left, right) => left[0] - right[0]);
  const deduped: [number, SceneCue][] = [];
  const heard = new Set<string>();
  for (const entry of cues) {
    const id = `${entry[0]}@${entry[1]}`;
    if (heard.has(id)) continue;
    heard.add(id);
    deduped.push(entry);
  }

  return {
    starts,
    outcomes,
    attrs,
    cpu,
    latency,
    queue: queueSeries,
    startRings,
    windows,
    cues: deduped,
  };
}

// --- the timeline ---------------------------------------------------------

/** Tweens a bar's width along the line the simulation walked. */
function drawBar(tl: gsap.core.Timeline, element: Element, segments: Segment[]): void {
  // The markup ships every bar empty, so a meter that is already reading
  // something on the first frame has to be told so before anything moves.
  const first = segments[0];
  if (first && first.vFrom !== 0) {
    tl.set(element, { attr: { width: first.vFrom }, immediateRender: false }, 0);
  }
  for (const segment of segments) {
    if (segment.to <= segment.from || segment.vFrom === segment.vTo) continue;
    tl.fromTo(
      element,
      { attr: { width: segment.vFrom } },
      {
        attr: { width: segment.vTo },
        duration: segment.to - segment.from,
        ease: 'none',
        immediateRender: false,
      },
      segment.from,
    );
  }
}

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const targets: Record<string, Element> = { stage };
  for (let index = 1; index <= POD_COUNT; index += 1) {
    targets[`pod-${index}`] = q<SVGGElement>(stage, `.hpa-pod--${index}`, ID);
  }
  const cpuFills = qa<SVGRectElement>(stage, '.hpa-cpu-fill');
  const startRings = qa<SVGCircleElement>(stage, '.hpa-start-progress');
  const latencyFill = q<SVGRectElement>(stage, '.hpa-lat-fill', ID);
  const queueFill = q<SVGRectElement>(stage, '.hpa-queue-fill', ID);
  const windowRing = q<SVGCircleElement>(stage, '.hpa-window-progress', ID);
  const layer = q<SVGGElement>(stage, '.scene-requests', ID);

  const sim = simulate();
  const requests = mountRequests(layer, sim.starts.length, ID);

  const tl = createSceneTimeline();

  // --- discrete state -----------------------------------------------------

  for (const change of sim.attrs) {
    const element = targets[change.key];
    if (!element) continue;
    attr(tl, element, change.name, change.value, change.at);
  }

  // --- the meters ---------------------------------------------------------

  sim.cpu.forEach((segments, index) => {
    const element = cpuFills[index];
    if (element) drawBar(tl, element, segments);
  });
  drawBar(tl, latencyFill, sim.latency);
  drawBar(tl, queueFill, sim.queue);

  // --- the two countdowns -------------------------------------------------

  for (const sweep of sim.startRings) {
    const element = startRings[sweep.index];
    if (!element) continue;
    const circumference = Number(element.getAttribute('stroke-dasharray') ?? 0);
    tl.fromTo(
      element,
      { attr: { 'stroke-dashoffset': circumference } },
      {
        attr: { 'stroke-dashoffset': 0 },
        duration: sweep.to - sweep.from,
        ease: 'none',
        immediateRender: false,
      },
      sweep.from,
    );
  }

  const windowCircumference = Number(windowRing.getAttribute('stroke-dasharray') ?? 0);
  for (const [from, to] of sim.windows) {
    tl.fromTo(
      windowRing,
      { attr: { 'stroke-dashoffset': windowCircumference } },
      {
        attr: { 'stroke-dashoffset': 0 },
        duration: to - from,
        ease: 'none',
        immediateRender: false,
      },
      from,
    );
  }

  // --- requests -----------------------------------------------------------

  const move = (
    parts: RequestParts,
    vars: gsap.TweenVars,
    duration: number,
    at: number,
  ): void => {
    tl.to(parts.group, { ...vars, duration, ease: 'none', immediateRender: false }, at);
  };

  sim.starts.forEach((start, index) => {
    const parts = requests[index];
    const outcome = sim.outcomes[index];
    if (!parts || !outcome || outcome.fadeAt === 0) return;

    const lane = POD_X[outcome.pod] ?? X_CLIENT;
    parkRequest(parts, X_CLIENT, Y_CLIENT);
    showRequest(tl, parts, start);
    move(parts, { y: Y_RAIL }, DROP_TO_RAIL, start);
    if (lane !== X_CLIENT) {
      move(parts, { x: lane }, outcome.railExitAt - outcome.decideAt, outcome.decideAt);
    }
    move(parts, { y: Y_ARRIVE }, DROP_TO_POD, outcome.railExitAt);
    markRequest(tl, parts, outcome.result, outcome.markAt);
    hideRequest(tl, parts, outcome.markAt, FADE);
  });

  // --- sound --------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels --------------------------------------------------------

  // The stage is complete on the first frame: two pods running at 35% against a
  // 60% target, six empty slots, and a formula that already says two.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
