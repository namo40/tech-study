import {
  SCENE_DURATION,
  X_BLUE,
  X_GREEN,
  Y_DB,
  Y_ENV_BOTTOM,
  Y_ENV_TOP,
  Y_ROUTER,
  greenShareOf,
} from './stage';
import type { BlueState, GreenState, Weight } from './stage';
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
 * Blue-Green Deployment scene: a 24 second, four step timeline.
 *
 * The two standing rules apply here as everywhere: every tween sits at an
 * absolute position, and every discrete change is a zero-duration tween on a
 * `data-*` attribute that GSAP reverts when the playhead moves back past it.
 *
 * Nothing the reader watches is placed by hand. The scene is told six things —
 * how often a request leaves the router, when the weight is moved and to what,
 * when the new version is deployed and ready, which build is faulty and how
 * badly, when a fault is fixed, and when the schema is expanded and contracted.
 * One pass over the whole 24 seconds turns that into everything else.
 *
 * Three derivations carry it. **Which environment a dot goes to** is the weight
 * and nothing else: an accumulator takes the green share of every departure and
 * sends the request green when it crosses one, so a 10% dial produces one green
 * dot in ten without anybody counting dots. **Whether a request fails** is the
 * fault rate of the build that answers it, run through the same kind of
 * accumulator, seeded so the first request the fault touches is the one that
 * surfaces it. And **the error readout** is the product of the two: the share of
 * traffic on the faulty side times that side's fault rate. That single line is
 * the whole argument of step 3 — a canary at 10% cannot show more than 10%
 * errors, however broken the build is, because it is only holding a tenth of the
 * traffic. The readout falls again one measurement lag after the product does.
 *
 * The badges follow from the same numbers. An environment holding traffic is
 * `live`; one holding none but still standing is `warm`; one released after the
 * schema contracted is `idle`. Green climbs `idle` → `deploying` → `ready`
 * before it is ever `live`, which is the part of the pattern that costs money
 * and the part that makes the cutover instant.
 */

const ID = 'blue-green-deployment';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

const BOUNDARIES = [0, 6, 12, 18, 24];

// --- how a traveller moves -------------------------------------------------

/** Seconds a request takes from Router to an environment: 200px. */
const OUT_LEG = 0.32;
/** Seconds a write takes from an environment to Database: 230px, same speed. */
const WRITE_LEG = 0.36;
/** Seconds an environment spends on a request before its write leaves. */
const WORK = 0.06;
/** Seconds spent at the far end of a round trip before turning around. */
const DWELL = 0.12;
/** How long a traveller takes to fade once it is absorbed or answered. */
const FADE = 0.06;

/** Departure to gone, for a request that is absorbed, and for one that writes. */
const REQ_LIFE = OUT_LEG + FADE;
const WRITE_LIFE = OUT_LEG + WORK + WRITE_LEG + DWELL + WRITE_LEG + FADE;
/** Departure to the instant a write is back inside the environment that made it. */
const WRITE_HOME = OUT_LEG + WORK + WRITE_LEG + DWELL + WRITE_LEG;

// --- what the scene is told ------------------------------------------------

/** How often a request leaves Router while traffic is flowing. */
const CADENCE = 0.18;

/**
 * When traffic runs, and the instant every traveller has to be gone by. Each
 * step ends on a still stage, so the window is closed early enough that the
 * last round trip lands before the boundary rather than across it.
 */
const WINDOWS = [
  { from: 0.5, clearBy: 5.4 },
  { from: 6.4, clearBy: 11.5 },
  { from: 12.4, clearBy: 17.5 },
  { from: 18.3, clearBy: 22.0 },
];

/** One request in eight writes, counted back from the last one that still fits. */
const WRITE_EVERY = 8;

/** Where the weight is moved to, and what moving it there sounds like. */
const WEIGHT_MOVES: { at: number; weight: Weight; cue: SceneCue }[] = [
  { at: 6.5, weight: '0-100', cue: 'trip' },
  { at: 8.6, weight: '100-0', cue: 'trip' },
  { at: 10.1, weight: '0-100', cue: 'trip' },
  { at: 12.35, weight: '100-0', cue: 'trip' },
  { at: 12.75, weight: '90-10', cue: 'trip' },
  { at: 14.3, weight: '100-0', cue: 'trip' },
  { at: 15.2, weight: '90-10', cue: 'state' },
  { at: 16.4, weight: '50-50', cue: 'state' },
  { at: 17.0, weight: '0-100', cue: 'success' },
];

/** The weight the scene opens on, before anybody has moved anything. */
const FIRST_WEIGHT: Weight = '100-0';

/** When the switch is put away and the dial is picked up. */
const DIAL_AT = 12.35;

/** Green's deploy: the build lands, then it passes its checks. */
const DEPLOY_AT = 1.4;
const READY_AT = 2.6;
/** The synthetic request Green answers before any real one reaches it. */
const SMOKE_AT = 3.4;

/**
 * The faulty builds. A rate is a property of the build, not of the traffic: the
 * first candidate is wrong 3% of the time, the second is simply broken. What
 * either one costs depends entirely on how much traffic it is holding.
 */
const FAULTS = [
  { from: 7.9, to: 9.7, rate: 0.03 },
  { from: 12.75, to: 15.2, rate: 1 },
];

/** When each fault is fixed, which is where each fault window closes. */
const FIXES = [9.7, 15.2];
/** How long a fix stays marked on the environment that took it. */
const FIX_HOLD = 0.6;

/** How long the error readout takes to notice that the errors have stopped. */
const ERR_LAG = 0.6;

/** The moments something already on the stage is held up to be read. A change
    the scene is already pointing at is not sounded twice. */
const MARKS = [
  { from: 4.4, to: 5.0, value: 'weight' },
  { from: 13.2, to: 13.8, value: 'split' },
  { from: 14.6, to: 15.2, value: 'capped' },
  { from: 15.9, to: 16.3, value: 'clear' },
];

/** The schema, changed in the only two moves that keep a rollback possible. */
const EXPAND_AT = 18.5;
const SHARED_AT = 19.2;
const CONTRACT_AT = 21.0;
/** When Blue stops being a rollback target and is released. */
const RETIRE_AT = 20.2;

/**
 * How the routing accumulator stands at every weight change. Half a request in
 * hand spreads the minority side through the window instead of bunching it at
 * one end, which is what a real weighted router does.
 */
const ACC_PHASE = 0.5;

/** How close two traffic samples may sound, and how close a sample may fall to
    any other cue or to a step boundary. A stream of dots is one sound. */
const SAMPLE_GAP = 1.3;
const MIN_CUE_GAP = 0.4;
const BOUNDARY_GAP = 0.3;

// --- what one pass over the scene produces --------------------------------

interface Traveller {
  kind: 'traffic' | 'write' | 'smoke';
  lane: number;
  start: number;
  result: RequestResult;
}

interface Series<T> {
  at: number;
  value: T;
}

interface Simulation {
  travellers: Traveller[];
  flags: Record<string, Series<string>[]>;
  greenHealth: Series<string>[];
  cues: [number, SceneCue][];
  /** Reported rather than drawn: how the traffic actually split. */
  toBlue: number;
  toGreen: number;
  failed: number;
  writes: number;
}

/** The weight in force at `at`, which is a lookup rather than a decision. */
function weightAt(at: number): Weight {
  let weight = FIRST_WEIGHT;
  for (const move of WEIGHT_MOVES) {
    if (move.at > at) break;
    weight = move.weight;
  }
  return weight;
}

/** The fault rate of whatever Green is running at `at`. */
function faultAt(at: number): number {
  for (const fault of FAULTS) {
    if (at >= fault.from && at < fault.to) return fault.rate;
  }
  return 0;
}

/**
 * The error rate the whole system is showing: the share of traffic on the
 * faulty side, times how often that side is wrong.
 */
const errorRateAt = (at: number): number =>
  Math.round(greenShareOf(weightAt(at)) * faultAt(at));

/**
 * Walks the whole scene in time order.
 *
 * Requests are booked first and everything else falls out of them, because the
 * only thing the reader is being asked to watch is where the traffic goes.
 */
function simulate(): Simulation {
  const travellers: Traveller[] = [];
  const flags: Record<string, Series<string>[]> = {
    weight: [],
    control: [],
    blue: [],
    green: [],
    shape: [],
    shared: [],
    migration: [],
    rate: [],
    focus: [],
    fix: [],
  };
  const greenHealth: Series<string>[] = [];
  const cues: [number, SceneCue][] = [];

  let toBlue = 0;
  let toGreen = 0;
  let failed = 0;
  let writes = 0;

  /** The router's share of a request in hand, and Green's place in its life. */
  let greenAcc = ACC_PHASE;
  let greenReady = false;
  let blueRetired = false;

  /** The fault accumulator, and which window it belongs to. */
  let faultAcc = 0;
  let faultWindow = -1;

  const push = (series: Series<string>[], at: number, value: string): void => {
    const last = series[series.length - 1];
    if (last && last.value === value && last.at <= round(at)) return;
    collapseAtInstant(series, { at: round(at), value }, () => 'value');
  };

  /** Every instant a request landed cleanly, which is where a sample can go. */
  const landings: number[] = [];

  const cue = (at: number, name: SceneCue): void => {
    if (at < 0 || at > SCENE_DURATION) return;
    cues.push([round(at), name]);
  };

  const { schedule, drain } = createScheduler();

  /** Whether the scene is already holding something up for the reader at `at`. */
  const focused = (at: number): boolean =>
    MARKS.some((mark) => at >= mark.from && at < mark.to);

  /**
   * The readout catching up with the fact that the errors have stopped. It only
   * sounds when it actually changes, and not when the scene is already pointing
   * at the thing that changed.
   */
  const clearRate = (at: number): void => {
    if (errorRateAt(at) !== 0) return;
    const before = flags.rate[flags.rate.length - 1]?.value;
    push(flags.rate, at, '0');
    if (before !== '0' && !focused(at)) cue(at, 'state');
  };

  // --- the words each environment says about itself ------------------------

  /** Blue holds traffic, or stands ready to, or has been let go. */
  const blueWord = (share: number): BlueState =>
    blueRetired ? 'idle' : share === 100 ? 'warm' : 'live';

  /** Green is not there, then arriving, then ready, then holding traffic. */
  const greenWord = (share: number): GreenState =>
    !greenReady ? 'idle' : share > 0 ? 'live' : 'ready';

  const writeBadges = (at: number, share: number): void => {
    push(flags.blue, at, blueWord(share));
    if (greenReady) push(flags.green, at, greenWord(share));
  };

  // --- the schedule the scene is given -------------------------------------

  push(flags.weight, 0, FIRST_WEIGHT);
  push(flags.control, 0, 'switch');
  push(flags.blue, 0, 'live');
  push(flags.green, 0, 'idle');
  push(flags.shape, 0, 'name');
  push(flags.shared, 0, 'off');
  push(flags.migration, 0, 'none');
  push(flags.rate, 0, '0');
  push(flags.focus, 0, 'none');
  push(flags.fix, 0, 'off');
  push(greenHealth, 0, 'down');

  schedule(DEPLOY_AT, () => {
    push(flags.green, DEPLOY_AT, 'deploying');
    push(greenHealth, DEPLOY_AT, 'recovering');
    cue(DEPLOY_AT, 'state');
  });

  schedule(READY_AT, () => {
    greenReady = true;
    push(flags.green, READY_AT, 'ready');
    push(greenHealth, READY_AT, 'up');
    cue(READY_AT, 'success');
  });

  schedule(SMOKE_AT, () => {
    travellers.push({ kind: 'smoke', lane: X_GREEN, start: SMOKE_AT, result: 'ok' });
    cue(SMOKE_AT, 'state');
  });

  for (const move of WEIGHT_MOVES) {
    schedule(move.at, () => {
      const share = greenShareOf(move.weight);
      greenAcc = ACC_PHASE;
      push(flags.weight, move.at, move.weight);
      writeBadges(move.at, share);
      cue(move.at, move.cue);
      // Moving the weight can be the thing that stops the errors, and the
      // readout finds that out one measurement later.
      if (errorRateAt(move.at) === 0) {
        const clearAt = round(move.at + ERR_LAG);
        schedule(clearAt, () => clearRate(clearAt));
      }
    });
  }

  schedule(DIAL_AT, () => push(flags.control, DIAL_AT, 'dial'));

  for (const at of FIXES) {
    schedule(at, () => {
      push(flags.fix, at, 'on');
      push(flags.fix, round(at + FIX_HOLD), 'off');
      // The weight moves at 15.2 as well, and one beat is one sound.
      if (!WEIGHT_MOVES.some((move) => move.at === at)) cue(at, 'state');
      schedule(round(at + ERR_LAG), () => clearRate(round(at + ERR_LAG)));
    });
  }

  for (const mark of MARKS) {
    schedule(mark.from, () => {
      push(flags.focus, mark.from, mark.value);
      push(flags.focus, mark.to, 'none');
      cue(mark.from, 'state');
    });
  }

  schedule(EXPAND_AT, () => {
    push(flags.shape, EXPAND_AT, 'both');
    push(flags.migration, EXPAND_AT, 'expand');
    cue(EXPAND_AT, 'trip');
  });

  schedule(SHARED_AT, () => {
    push(flags.shared, SHARED_AT, 'on');
    cue(SHARED_AT, 'state');
  });

  schedule(RETIRE_AT, () => {
    blueRetired = true;
    push(flags.blue, RETIRE_AT, 'idle');
    cue(RETIRE_AT, 'state');
  });

  schedule(CONTRACT_AT, () => {
    push(flags.shape, CONTRACT_AT, 'nickname');
    push(flags.shared, CONTRACT_AT, 'off');
    push(flags.migration, CONTRACT_AT, 'contract');
    cue(CONTRACT_AT, 'trip');
  });

  // --- the traffic ---------------------------------------------------------

  /** Whether this arrival is one the fault gets to spoil. */
  const faultFires = (at: number): boolean => {
    const rate = faultAt(at);
    if (rate <= 0) return false;
    const index = FAULTS.findIndex((fault) => at >= fault.from && at < fault.to);
    if (index !== faultWindow) {
      faultWindow = index;
      faultAcc = 1 - rate;
    }
    faultAcc += rate;
    if (faultAcc < 1 - 1e-9) return false;
    faultAcc -= 1;
    return true;
  };

  for (const window of WINDOWS) {
    const departures: number[] = [];
    for (let n = 0; ; n += 1) {
      const at = round(window.from + n * CADENCE);
      if (at + REQ_LIFE > window.clearBy) break;
      departures.push(at);
    }
    // A write is a round trip, so only a request early enough for the whole trip
    // to land inside the window may make one. Counting back from the last one
    // that fits puts a settled round trip at the end of every step.
    let lastWrite = -1;
    for (let n = 0; n < departures.length; n += 1) {
      if ((departures[n] ?? 0) + WRITE_LIFE <= window.clearBy) lastWrite = n;
    }
    const writeAt = new Set<number>();
    for (let n = lastWrite; n >= 0; n -= WRITE_EVERY) writeAt.add(n);

    departures.forEach((at, index) => {
      schedule(at, () => {
        const share = greenShareOf(weightAt(at));
        greenAcc += share / 100;
        const green = greenAcc >= 1 - 1e-9;
        if (green) greenAcc -= 1;
        if (green) toGreen += 1;
        else toBlue += 1;

        const lane = green ? X_GREEN : X_BLUE;
        const arrives = round(at + OUT_LEG);
        const broke = green && faultFires(arrives);
        travellers.push({
          kind: 'traffic',
          lane,
          start: at,
          result: broke ? 'fail' : 'ok',
        });

        if (broke) {
          failed += 1;
          push(flags.rate, arrives, String(errorRateAt(arrives)));
          cue(arrives, 'failure');
        } else {
          landings.push(arrives);
        }

        if (!writeAt.has(index)) return;
        writes += 1;
        const leaves = round(arrives + WORK);
        travellers.push({ kind: 'write', lane, start: leaves, result: 'ok' });
        if (index !== lastWrite) return;
        // The last write of a step comes home on a still stage: the step has
        // settled, and the round trip is the proof of it.
        const home = round(at + WRITE_HOME);
        schedule(home, () => cue(home, 'success'));
      });
    });
  }

  drain();

  /*
   * The traffic sample, chosen last. Every clean landing is a candidate, and the
   * pass keeps one only when it is far enough from the previous sample, from
   * everything the scene had to say anyway, and from a step boundary. Rejecting
   * a candidate does not spend the interval, so a run of dots still sounds once
   * rather than falling silent because its first dot landed on a switch.
   */
  const spoken = cues.map(([at]) => at);
  let lastSample = -99;
  for (const at of landings.slice().sort((left, right) => left - right)) {
    if (at - lastSample < SAMPLE_GAP) continue;
    if (BOUNDARIES.some((edge) => Math.abs(at - edge) < BOUNDARY_GAP)) continue;
    if (spoken.some((other) => Math.abs(other - at) < MIN_CUE_GAP)) continue;
    lastSample = at;
    cue(at, 'success');
  }

  cues.sort((left, right) => left[0] - right[0]);

  return { travellers, flags, greenHealth, cues, toBlue, toGreen, failed, writes };
}

// --- the timeline ----------------------------------------------------------

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const requestLayer = q<SVGGElement>(stage, '.scene-requests', ID);

  const sim = simulate();
  const requests = mountRequests(requestLayer, sim.travellers.length, ID);

  const tl = createSceneTimeline();

  // --- everything the stage says about itself ------------------------------

  for (const [name, series] of Object.entries(sim.flags)) {
    for (const entry of series) attr(tl, stage, `data-${name}`, entry.value, entry.at);
  }
  const greenDots = qa(stage, '.bgd-env--green circle');
  for (const entry of sim.greenHealth) {
    attr(tl, greenDots, 'data-health-state', entry.value, entry.at);
  }

  // --- the travellers ------------------------------------------------------

  sim.travellers.forEach((traveller, index) => {
    const parts = requests[index];
    if (!parts) return;

    if (traveller.kind === 'write') {
      const reaches = round(traveller.start + WRITE_LEG);
      const answers = round(reaches + DWELL);
      const home = round(answers + WRITE_LEG);
      parkRequest(parts, traveller.lane, Y_ENV_BOTTOM);
      showRequest(tl, parts, traveller.start);
      moveRequest(tl, parts, Y_DB, WRITE_LEG, traveller.start);
      markRequest(tl, parts, 'ok', answers);
      moveRequest(tl, parts, Y_ENV_BOTTOM, WRITE_LEG, answers);
      hideRequest(tl, parts, home, FADE);
      return;
    }

    if (traveller.kind === 'smoke') {
      // A synthetic request, drawn as a hollow dot so it is never mistaken for
      // production traffic: Green answers it before any real caller reaches it.
      parts.group.classList.add('bgd-smoke');
      const reaches = round(traveller.start + OUT_LEG);
      const answers = round(reaches + DWELL);
      const home = round(answers + OUT_LEG);
      parkRequest(parts, traveller.lane, Y_ROUTER);
      showRequest(tl, parts, traveller.start);
      moveRequest(tl, parts, Y_ENV_TOP, OUT_LEG, traveller.start);
      markRequest(tl, parts, 'ok', answers);
      moveRequest(tl, parts, Y_ROUTER, OUT_LEG, answers);
      hideRequest(tl, parts, home, FADE);
      return;
    }

    // Production traffic. The router decides at the top of the lane and the
    // environment absorbs the request at the bottom of it.
    const arrives = round(traveller.start + OUT_LEG);
    parkRequest(parts, traveller.lane, Y_ROUTER);
    showRequest(tl, parts, traveller.start);
    moveRequest(tl, parts, Y_ENV_TOP, OUT_LEG, traveller.start);
    markRequest(tl, parts, traveller.result, arrives);
    hideRequest(tl, parts, arrives, FADE);
  });

  // --- sounds and step labels ---------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // The stage is complete on the first frame: two environments, one of them
  // holding all of the traffic, one database, and nothing in flight.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
