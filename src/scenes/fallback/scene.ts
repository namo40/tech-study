import gsap from 'gsap';
import {
  SCENE_DURATION,
  X_DATA,
  X_MAIN,
  X_RECS,
  Y_CLIENTS,
  Y_DEP,
  Y_SERVICE_BOTTOM,
  Y_SERVICE_TOP,
} from './stage';
import type { CoreState, Health, RecsState } from './stage';
import { q } from '../shared/dom';
import {
  attachToRequest,
  haloRequest,
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
 * Fallback scene: a 24 second, four step timeline.
 *
 * The two standing rules apply here as everywhere: every tween sits at an
 * absolute position, and every discrete change is a zero-duration tween on a
 * `data-*` attribute that GSAP reverts when the playhead moves back past it.
 *
 * Nothing the reader watches is placed by hand. The scene is told nine things —
 * the rate the clients offer and when that rate changes, how long each leg of a
 * journey takes, how much of the answer the service has to collect before it can
 * send one, when the recommendation service stops and starts answering, when the
 * limiter and the planned smaller mode are switched on, how much the limiter
 * lets through, how long after the dependency returns the smaller mode is
 * switched off, and the windows each step is allowed to put traffic in. One pass
 * over the whole 24 seconds turns that into everything else.
 *
 * Four derivations carry it. **Whether a request is served or refused** is the
 * token bucket and nothing else: a request that finds an allowance is admitted,
 * one that does not is turned away at the door once shedding is on, so the
 * refusals in step 3 are not scripted — they are the same requests, offered the
 * same way, arriving when the allowance has run out. **What the answer is made
 * of** follows from which calls came back: the core row is whatever the data
 * store returned, and the recommendations row is the live answer when that call
 * succeeded, yesterday's copy when it failed, and nothing at all while the
 * service is running in its smaller shape. **Which calls are made** follows from
 * the same two facts: the service does not call a dependency it has switched off,
 * and while it is throttling it does not spend a call on one it already knows is
 * down. And **when the modes go out again** is derived from the answers, not from
 * a clock: the fallback ends the instant a live recommendation lands, and the
 * limiter is unwound one feature at a time behind it.
 *
 * Fallback is the neighbour of Circuit Breaker and deliberately not a repeat of
 * it. The breaker is about *when* to stop calling something that is failing; this
 * is about *what to say* in the meantime. Nothing here counts failures or opens
 * anything: the recommendation call is still attempted, and what the scene
 * watches is the answer being assembled out of whatever came back.
 *
 * Two readouts describe the offered load rather than the dots on the lane. The
 * lane between the clients and the service is 200px long and a traveller sweeps
 * 26px, so it holds exactly one request at a time; `rps` is the rate the clients
 * are actually offering and `503` counts every request the service turned away,
 * while the lane shows the one request that fits. Everything else on the stage —
 * the rows, the mode chips, the badges — is the state of the single service and
 * is exact at every frame.
 */

const ID = 'fallback';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

const BOUNDARIES = [0, 6, 12, 18, 24];

// --- how a traveller moves -------------------------------------------------

/** Seconds a request takes between the clients and the service: 200px. */
const REQ_LEG = 0.26;
/** Seconds a call takes between the service and a dependency: 230px. */
const CALL_LEG = 0.3;
/** Seconds a dependency spends on a call, whether it answers or refuses. */
const DEP_DWELL = 0.1;
/** Seconds between a request landing and the service placing its calls. */
const COMPOSE_GAP = 0.24;
/** Seconds the service spends collecting each answer it asked for. */
const ANSWER_UNIT = 0.2;
/** How long a traveller takes to fade once it is absorbed. */
const FADE = 0.1;
/** Clear air the lane keeps between one request leaving it and the next. */
const LANE_GAP = 0.08;

// --- what the scene is told ------------------------------------------------

/**
 * The rate the clients offer, in requests per second, and when it changes. It
 * moves one step at a time so the readout never jumps, and the offered stream is
 * generated from it, so the number on the stage and the spacing of the requests
 * behind it are the same thing.
 */
const RATE_STEPS: [number, number][] = [
  [-1.5, 2],
  [12.5, 3],
  [12.85, 4],
  [13.2, 5],
  [16.6, 4],
  [16.8, 3],
  [17.0, 2],
];

/** Where the offered stream starts, early enough that the readout opens steady. */
const OFFER_FROM = 0;

/**
 * The limiter. `CAP` is the allowance refilled every second and `BURST` is how
 * much of it may be saved up, which is one request's worth: the service is
 * already busy when the limiter is switched on, so there is nothing banked.
 */
const CAP = 3;
const BURST = 1;

/**
 * The schedule is rounded to milliseconds, so an allowance that has refilled to
 * within one millisecond of a whole request is a whole request. Without this the
 * limiter would refuse a request that arrived exactly on its own refill.
 */
const TOKEN_EPS = CAP * 0.001;

/** When the limiter is declared, and when the overflow starts being refused. */
const THROTTLE_AT = 13.05;
const SHED_AT = 13.5;

/** When the service is put into its planned smaller shape. */
const CORE_ONLY_AT = 18.35;

/** When the recommendation service stops answering, and when it starts again. */
const RECS_DOWN_AT = 6.5;
const RECS_UP_AT = 20.6;

/** How long after the dependency returns the smaller shape is switched off. */
const RESTORE_DELAY = 0.45;

/** Seconds between one feature being restored and the next. */
const CASCADE = 0.22;

/** How long after the substitution the fallback is admitted to on the chip. */
const FALLBACK_DELAY = 0.2;

/**
 * When a request may be drawn. Each step ends on a still stage, so a request is
 * only put on the lane when the whole of its journey fits inside its window.
 */
const WINDOWS = [
  { from: 0.4, clearBy: 5.2 },
  { from: 6.6, clearBy: 11.6 },
  { from: 12.1, clearBy: 17.5 },
  { from: 18.4, clearBy: 20.5 },
  { from: 20.66, clearBy: 22.8 },
];

/** How close two samples of one repeating thing may sound, how close any sample
    may fall to another cue, and how close any of it may fall to a boundary. */
const SAMPLE_GAP = 1.5;
const MIN_CUE_GAP = 0.2;
const BOUNDARY_GAP = 0.3;

// --- what one pass over the scene produces --------------------------------

interface RequestPlan {
  start: number;
  arrive: number;
  turn: number;
  home: number;
  result: RequestResult;
  /** Rung for the one core round trip that completes while the edge is refusing. */
  halo: boolean;
}

interface CallPlan {
  lane: number;
  start: number;
  arrive: number;
  turn: number;
  home: number;
  result: RequestResult;
}

interface Series<T> {
  at: number;
  value: T;
}

/** A cue that has to sound, and the family it belongs to for spacing. */
interface Fixed {
  at: number;
  family: string | null;
  name: SceneCue;
}

/** One of a repeating family, kept only if it is far enough from everything. */
interface Candidate {
  at: number;
  family: string;
  name: SceneCue;
}

interface Simulation {
  requests: RequestPlan[];
  calls: CallPlan[];
  flags: Record<string, Series<string>[]>;
  cues: [number, SceneCue][];
  /** Reported rather than drawn. */
  offered: number;
  admitted: number;
  refused: number;
  drawnServed: number;
  drawnRefused: number;
  peakRps: number;
}

/**
 * Walks the whole scene in time order.
 *
 * The offered stream is booked first and everything else falls out of it,
 * because the only thing the reader is being asked to watch is what the service
 * answers with when a request arrives.
 */
function simulate(): Simulation {
  const requests: RequestPlan[] = [];
  const calls: CallPlan[] = [];
  const flags: Record<string, Series<string>[]> = {
    rps: [],
    refused: [],
    core: [],
    recs: [],
    fallback: [],
    throttle: [],
    shed: [],
    coreonly: [],
    'dep-data': [],
    'dep-recs': [],
  };
  const fixed: Fixed[] = [];
  const candidates: Candidate[] = [];

  /** The instant the smaller shape is switched off, which is known in advance. */
  const coreOnlyOffAt = round(RECS_UP_AT + RESTORE_DELAY);
  /** The instants the limiter is unwound, which are not known until it is. */
  let throttleOffAt: number | null = null;
  let shedOffAt: number | null = null;

  let core: CoreState = 'empty';
  let recs: RecsState = 'empty';
  let fallbackOn = false;
  let tokens = BURST;
  let bucketAt = THROTTLE_AT;
  let laneFreeAt = -Infinity;
  let recsFailSeen = false;
  let restored = false;

  let offered = 0;
  let admitted = 0;
  let refused = 0;
  let drawnServed = 0;
  let drawnRefused = 0;
  let peakRps = 0;

  const push = (series: Series<string>[], at: number, value: string): void => {
    const last = series[series.length - 1];
    if (last && last.value === value && last.at <= round(at)) return;
    collapseAtInstant(series, { at: round(at), value }, () => 'value');
  };

  const fix = (at: number, name: SceneCue, family: string | null = null): void => {
    if (at < 0 || at > SCENE_DURATION) return;
    fixed.push({ at: round(at), family, name });
  };

  const sample = (at: number, family: string, name: SceneCue): void => {
    if (at < 0 || at > SCENE_DURATION) return;
    candidates.push({ at: round(at), family, name });
  };

  // --- what the modes are doing at any instant -----------------------------

  const rateAt = (t: number): number => {
    let rate = RATE_STEPS[0]?.[1] ?? 2;
    for (const [from, value] of RATE_STEPS) if (t >= from) rate = value;
    return rate;
  };
  const coreOnlyAt = (t: number): boolean => t >= CORE_ONLY_AT && t < coreOnlyOffAt;
  const throttleAt = (t: number): boolean =>
    t >= THROTTLE_AT && (throttleOffAt === null || t < throttleOffAt);
  const shedNow = (t: number): boolean => t >= SHED_AT && (shedOffAt === null || t < shedOffAt);
  const recsUpAt = (t: number): boolean => !(t >= RECS_DOWN_AT && t < RECS_UP_AT);

  const { schedule, drain } = createScheduler();

  // --- the opening state, which is the whole diagram -----------------------

  push(flags.core, 0, core satisfies CoreState);
  push(flags.recs, 0, recs satisfies RecsState);
  push(flags.fallback, 0, 'off');
  push(flags.throttle, 0, 'off');
  push(flags.shed, 0, 'off');
  push(flags.coreonly, 0, 'off');
  push(flags['dep-data'], 0, 'up' satisfies Health);
  push(flags['dep-recs'], 0, 'up' satisfies Health);
  push(flags.refused, 0, '0');

  // --- the rate the clients are offering -----------------------------------

  RATE_STEPS.forEach(([from, value], index) => {
    push(flags.rps, Math.max(0, from), String(value));
    peakRps = Math.max(peakRps, value);
    // The load climbing is what the third step opens on, so the first step of
    // the climb is the one that sounds; the rest of the ramp is silent.
    const previous = RATE_STEPS[index - 1];
    if (previous && value > previous[1] && !fixed.some((entry) => entry.family === 'surge')) {
      fix(from, 'state', 'surge');
    }
  });

  // --- the dependency that stops -------------------------------------------

  schedule(RECS_DOWN_AT, () => {
    push(flags['dep-recs'], RECS_DOWN_AT, 'down' satisfies Health);
    fix(RECS_DOWN_AT, 'failure');
  });

  schedule(RECS_UP_AT, () => {
    push(flags['dep-recs'], RECS_UP_AT, 'up' satisfies Health);
    fix(RECS_UP_AT, 'state');
  });

  // --- the modes that are switched on --------------------------------------

  schedule(THROTTLE_AT, () => {
    push(flags.throttle, THROTTLE_AT, 'on');
    fix(THROTTLE_AT, 'trip');
  });

  schedule(SHED_AT, () => {
    push(flags.shed, SHED_AT, 'on');
    fix(SHED_AT, 'trip');
  });

  schedule(CORE_ONLY_AT, () => {
    push(flags.coreonly, CORE_ONLY_AT, 'on');
    // The extra row is not merely empty, it is switched off: the service is not
    // going to compose it at all until the mode goes out again.
    recs = 'off';
    push(flags.recs, CORE_ONLY_AT, recs);
    fix(CORE_ONLY_AT, 'trip');
  });

  schedule(coreOnlyOffAt, () => {
    push(flags.coreonly, coreOnlyOffAt, 'off');
    // The row comes back holding what it last held, which is the copy. Whether
    // the live answer is available again is the next request's business.
    recs = fallbackOn ? 'cached' : 'empty';
    push(flags.recs, coreOnlyOffAt, recs);
    fix(coreOnlyOffAt, 'state');
  });

  // --- the offered stream --------------------------------------------------

  /**
   * Every request the clients send, at the rate they are sending it. Only some
   * of them go on the lane, because the lane holds one at a time, but all of
   * them are offered, put through the limiter and counted.
   */
  const offers: number[] = [];
  for (let t = OFFER_FROM; t <= SCENE_DURATION; t = round(t + 1 / rateAt(t))) {
    offers.push(round(t));
  }

  for (const offer of offers) {
    schedule(offer, () => {
      offered += 1;

      // The limiter. An allowance is refilled continuously and saved up to the
      // burst; a request that finds one is admitted, and one that does not is
      // refused at the door as soon as shedding is on.
      let served = true;
      if (throttleAt(offer)) {
        tokens = Math.min(BURST, tokens + CAP * (offer - bucketAt));
        bucketAt = offer;
        if (tokens + TOKEN_EPS >= 1) tokens = Math.max(0, tokens - 1);
        else if (shedNow(offer)) served = false;
        // No allowance and nothing shedding yet: the service takes the request
        // anyway and pays for it in latency, which is the cost step 3 is about.
      }

      const door = round(offer + REQ_LEG);
      if (served) {
        admitted += 1;
      } else {
        refused += 1;
        const total = refused;
        schedule(door, () => push(flags.refused, door, String(total)));
      }

      // --- is there room to show this one? ---------------------------------

      const slot = WINDOWS.find((w) => offer >= w.from && offer <= w.clearBy);
      if (!slot || offer < laneFreeAt) return;

      if (!served) {
        const home = round(door + REQ_LEG);
        const clear = round(home + FADE);
        if (clear > slot.clearBy) return;
        laneFreeAt = round(clear + LANE_GAP);
        drawnRefused += 1;
        requests.push({ start: offer, arrive: door, turn: door, home, result: 'fail', halo: false });
        // The refusal is heard where the reader sees it: at the door, not where
        // the limiter worked it out.
        sample(door, '503', 'state');
        return;
      }

      const callsAt = round(door + COMPOSE_GAP);
      // The service does not call a dependency it has switched off, and while it
      // is throttling it does not spend a call on one it already knows is down.
      const useRecs = !coreOnlyAt(callsAt) && !(throttleAt(callsAt) && !recsUpAt(callsAt));
      const callArrive = round(callsAt + CALL_LEG);
      const callTurn = round(callArrive + DEP_DWELL);
      const callHome = round(callTurn + CALL_LEG);
      const respondAt = round(callHome + ANSWER_UNIT * (useRecs ? 2 : 1));
      const home = round(respondAt + REQ_LEG);
      const clear = round(home + FADE);
      if (clear > slot.clearBy) return;

      laneFreeAt = round(clear + LANE_GAP);
      drawnServed += 1;
      const halo = shedNow(home) && home >= 12 && home < 18;
      requests.push({ start: offer, arrive: door, turn: respondAt, home, result: 'ok', halo });

      calls.push({
        lane: X_DATA,
        start: callsAt,
        arrive: callArrive,
        turn: callTurn,
        home: callHome,
        result: 'ok',
      });
      const recsOk = recsUpAt(callArrive);
      if (useRecs) {
        calls.push({
          lane: X_RECS,
          start: callsAt,
          arrive: callArrive,
          turn: callTurn,
          home: callHome,
          result: recsOk ? 'ok' : 'fail',
        });
        if (!recsOk) {
          schedule(callTurn, () => {
            // A dependency saying no is worth hearing once. After that it is the
            // answer that changed, not the news.
            if (recsFailSeen) return;
            recsFailSeen = true;
            fix(callTurn, 'state');
          });
        }
      }

      // --- what the answer turns out to be made of -------------------------

      schedule(callHome, () => {
        const wasCore = core;
        const wasRecs = recs;
        core = 'live';
        if (useRecs) recs = recsOk ? 'live' : 'cached';

        if (core !== wasCore) push(flags.core, callHome, core);
        if (recs !== wasRecs) push(flags.recs, callHome, recs);
        if (core === wasCore && recs === wasRecs) return;

        if (recs === 'cached' && !fallbackOn) {
          // The copy is in the answer. The chip that admits it follows a beat
          // later, because saying so is a separate act from doing it.
          fix(callHome, 'state');
          const chipAt = round(callHome + FALLBACK_DELAY);
          schedule(chipAt, () => {
            fallbackOn = true;
            push(flags.fallback, chipAt, 'on');
            fix(chipAt, 'trip');
          });
          return;
        }

        if (recs === 'live' && fallbackOn) {
          // A live recommendation is the end of the fallback, and the limiter is
          // unwound behind it one feature at a time rather than all at once.
          fallbackOn = false;
          restored = true;
          push(flags.fallback, callHome, 'off');
          fix(callHome, 'state');
          if (throttleAt(callHome)) {
            const at = round(callHome + CASCADE);
            throttleOffAt = at;
            schedule(at, () => {
              push(flags.throttle, at, 'off');
              fix(at, 'state');
            });
          }
          if (shedNow(callHome)) {
            const at = round(callHome + 2 * CASCADE);
            shedOffAt = at;
            schedule(at, () => {
              push(flags.shed, at, 'off');
              fix(at, 'state');
            });
          }
          return;
        }

        fix(callHome, 'state');
      });

      // --- the answer going home -------------------------------------------

      schedule(home, () => sample(home, 'answer', 'success'));
    });
  }

  drain();

  // --- the cues ------------------------------------------------------------

  const accepted: Fixed[] = fixed.slice().sort((left, right) => left.at - right.at);
  const lastOf: Record<string, number> = { answer: -99, '503': -99 };
  candidates.sort((left, right) => left.at - right.at);
  for (const candidate of candidates) {
    let previous = lastOf[candidate.family] ?? -99;
    for (const other of accepted) {
      if (other.family === candidate.family && other.at < candidate.at && other.at > previous) {
        previous = other.at;
      }
    }
    if (candidate.at - previous < SAMPLE_GAP) continue;
    if (BOUNDARIES.some((edge) => Math.abs(candidate.at - edge) < BOUNDARY_GAP)) continue;
    if (accepted.some((other) => Math.abs(other.at - candidate.at) < MIN_CUE_GAP)) continue;
    lastOf[candidate.family] = candidate.at;
    accepted.push({ at: candidate.at, family: candidate.family, name: candidate.name });
    accepted.sort((left, right) => left.at - right.at);
  }

  const cues: [number, SceneCue][] = accepted
    .map((entry) => [entry.at, entry.name] as [number, SceneCue])
    .sort((left, right) => left[0] - right[0]);

  if (!restored) throw new Error(ID + ' scene: the fallback never came back out');

  return {
    requests,
    calls,
    flags,
    cues,
    offered,
    admitted,
    refused,
    drawnServed,
    drawnRefused,
    peakRps,
  };
}

// --- the timeline ----------------------------------------------------------

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);

  const sim = simulate();
  const parts = mountRequests(layer, sim.requests.length + sim.calls.length, ID);
  const requestParts = parts.slice(0, sim.requests.length);
  const callParts = parts.slice(sim.requests.length);

  const tl = createSceneTimeline();

  // --- everything the stage says about itself ------------------------------

  for (const [name, series] of Object.entries(sim.flags)) {
    for (const entry of series) attr(tl, stage, 'data-' + name, entry.value, entry.at);
  }

  // --- what travels --------------------------------------------------------

  // A request is the plain dot: it goes down the one lane the clients have, waits
  // at the door while the answer is put together, and comes back with a verdict.
  sim.requests.forEach((plan, index) => {
    const request = requestParts[index];
    if (!request) return;
    parkRequest(request, X_MAIN, Y_CLIENTS);

    showRequest(tl, request, plan.start);
    moveRequest(tl, request, Y_SERVICE_TOP, REQ_LEG, plan.start);
    markRequest(tl, request, plan.result, plan.turn);
    moveRequest(tl, request, Y_CLIENTS, REQ_LEG, plan.turn);
    hideRequest(tl, request, plan.home, FADE);
    // The one core answer that comes home while the edge is turning requests
    // away is worth pointing at: that is the whole argument for shedding.
    if (plan.halo) haloRequest(tl, request, plan.turn, plan.home, 0.18);
  });

  // A call is a smaller hollow ring, so a request and the calls it caused are
  // never mistaken for each other even though both carry the same markers.
  sim.calls.forEach((plan, index) => {
    const request = callParts[index];
    if (!request) return;
    const ring = attachToRequest(request, 'circle', {
      class: 'scene-req-hollow fb-call',
      r: '12',
      cx: '0',
      cy: '0',
    });
    parkRequest(request, plan.lane, Y_SERVICE_BOTTOM);
    gsap.set(request.dot, { opacity: 0 });
    gsap.set(ring, { opacity: 1 });

    showRequest(tl, request, plan.start);
    moveRequest(tl, request, Y_DEP, CALL_LEG, plan.start);
    tl.set(ring, { opacity: 0, immediateRender: false }, plan.turn);
    markRequest(tl, request, plan.result, plan.turn);
    moveRequest(tl, request, Y_SERVICE_BOTTOM, CALL_LEG, plan.turn);
    hideRequest(tl, request, plan.home, FADE);
  });

  // --- sound ---------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels ---------------------------------------------------------

  // The stage is complete on the first frame: two empty rows, four modes unlit,
  // both dependencies answering, the offered rate the clients opened with, and
  // nothing in flight.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
