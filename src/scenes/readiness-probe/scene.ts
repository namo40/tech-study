import {
  FAILURE_THRESHOLD,
  LANE_X,
  POD_COUNT,
  POD_Y,
  RING_CIRCUMFERENCE,
  ROUTER_BOTTOM,
  SCENE_DURATION,
  STAGE_STATE,
  probeTimes,
} from './stage';
import { q } from '../shared/dom';
import {
  hideRequest,
  markRequest,
  mountRequests,
  moveRequest,
  parkRequest,
  showRequest,
} from '../shared/request';
import { collapseAtInstant, createScheduler } from '../shared/simulation';
import { attr, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Readiness Probe scene: a 24 second, four step timeline.
 *
 * Same two rules as the other scenes: every tween sits at an absolute position,
 * and every discrete change is a zero-duration tween on a `data-*` attribute
 * that GSAP reverts when the playhead moves back past it.
 *
 * Nothing the reader counts is authored. The scene is told how often the
 * kubelet asks and how many answers in a row it acts on, when the third pod
 * finishes warming up, when the second pod's dependency wobbles, when the third
 * pod's process hangs, how long a container takes to come back, when the
 * database goes and returns, when the wire between the probes and the database
 * is drawn and when it is moved, and how often a request arrives.
 *
 * Everything else falls out of one pass over the whole 24 seconds. Every probe
 * time is evaluated in order: a readiness answer decides whether the pod is in
 * the endpoints, and only after `failureThreshold` refusals in a row is it
 * taken out, so the pod keeps serving through the first two. A liveness answer
 * decides whether the container survives, and the same three-in-a-row is what
 * the kubelet acts on. Which pod a request lands on is whichever lit endpoint
 * the rotation is pointing at when it arrives, so the traffic reroutes because
 * the endpoints list changed rather than because anything drew it that way, and
 * a request that arrives with the list empty has nowhere to go.
 *
 * The one thing the fourth step changes is what the two probes look at. While
 * the wire runs to liveness, a database that stops answering makes every
 * container fail its liveness check and restart; once the wire is moved to
 * readiness, the very same outage takes the pods out of rotation and leaves
 * them running, and they come back the moment the database does.
 */

const ID = 'readiness-probe';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- what the scene is told -----------------------------------------------

/** When the third pod's process has finished warming up, at the very start. */
const POD_C_READY_AT = 3.8;
/** The window the second pod's dependency is unreachable in. */
const DEP_BLIP: [number, number] = [6.3, 9.9];
/** When the third pod's process stops answering anything at all. */
const HANG_FROM = 12.3;
/** How long the kubelet takes to kill a container after it has decided to. */
const KILL_DELAY = 0.25;
/** How long a container takes to come back. */
const RESTART_MS = 0.7;
/** How long the process inside takes to be able to serve, once it is running. */
const WARMUP = 0.5;
/** When the database appears, wired to whatever liveness was told to check. */
const DB_CHIP_AT = 18.2;
/** The window the database is unreachable in. */
const DB_BLIP: [number, number] = [18.3, 22.2];
/** When the wire is moved off liveness and onto readiness. */
const WIRE_FIX_AT = 21.2;
/** When the two sentences that tell the probes apart are written. */
const SPLIT_AT = 14.8;

/** When the first request arrives, how often another does, and the last one. */
const REQ_FROM = 0.3;
const REQ_EVERY = 0.6;
const REQ_LAST = 22.5;

/** One speed for every leg any traveller takes, in pixels per second. */
const SPEED = 2000;
/** The lane: the bottom edge of the Router to the top edge of a pod. */
const TRIP = round((POD_Y - ROUTER_BOTTOM) / SPEED);
/** How long a request with nowhere to go waits before it is refused. */
const REFUSE_AFTER = 0.12;
/** How long a marker stays before the request carrying it goes. */
const FADE = 0.16;

/** The shortest gap between any two cues, and between two sampled ones. */
const CUE_GAP = 0.2;
const STATE_SAMPLE = 2.2;
/** Which cue wins when two land close enough together that only one can. */
const CUE_RANK: Record<SceneCue, number> = { failure: 0, trip: 1, success: 2, state: 3 };

// --- what the simulation produces -----------------------------------------

interface AttrChange {
  at: number;
  target: string;
  name: string;
  value: string;
}

/**
 * A request: the lane it took, whether the endpoints list had a pod on it at
 * all, and whether the pod it was sent to was in any state to answer. The last
 * two are not the same thing, which is the point of a threshold: a pod that has
 * stopped answering is still in the list until readiness has been refused three
 * times, and every request routed in between is one the reader can see land on
 * a pod that cannot serve it.
 */
interface Arrival {
  at: number;
  lane: number;
  routed: boolean;
  served: boolean;
}

/** A ring either sweeps a window or is set to one of the four levels. */
interface RingSweep {
  pod: number;
  from: number;
  to: number;
}

interface RingStep {
  pod: number;
  at: number;
  level: number;
}

interface Simulation {
  attrs: AttrChange[];
  arrivals: Arrival[];
  sweeps: RingSweep[];
  steps: RingStep[];
  cues: [number, SceneCue][];
}

// --- the simulation -------------------------------------------------------

/** What the kubelet is looking at when it asks, which step four changes. */
type Wire = 'none' | 'liveness' | 'readiness';

/** Everything the pass has to remember about one pod. */
interface Pod {
  /** When the process inside can serve, which a restart pushes forward. */
  appReadyAt: number;
  /** The process is running but answers nothing. */
  hung: boolean;
  /** The container is being replaced, so no probe reaches it. */
  restarting: boolean;
  inEndpoints: boolean;
  restarts: number;
  /** Answers refused in a row, per probe. */
  rFails: number;
  lFails: number;
  badge: string;
  ring: string;
  ringLevel: number;
  r: string;
  l: string;
}

function simulate(): Simulation {
  const raw: AttrChange[] = [];
  const arrivals: Arrival[] = [];
  const sweeps: RingSweep[] = [];
  const ringSteps: RingStep[] = [];
  const candidates: [number, SceneCue][] = [];
  /** Every probe instant, thinned to a sample once the pass is over. */
  const tickAt: number[] = [];

  const setAttr = (at: number, target: string, name: string, value: string): void => {
    raw.push({ at: round(at), target, name, value });
  };
  const cue = (at: number, name: SceneCue): void => {
    candidates.push([round(at), name]);
  };

  const pods: Pod[] = Array.from({ length: POD_COUNT }, (_value, index) => ({
    appReadyAt: index === 2 ? POD_C_READY_AT : 0,
    hung: false,
    restarting: false,
    inEndpoints: index !== 2,
    restarts: 0,
    rFails: 0,
    lFails: 0,
    badge: index === 2 ? 'starting' : 'ready',
    ring: index === 2 ? 'delay' : 'off',
    ringLevel: 0,
    r: index === 2 ? 'fail' : 'ok',
    l: 'ok',
  }));

  let readyCount = pods.filter((pod) => pod.inEndpoints).length;
  let restartTotal = 0;
  /** Where the rotation is pointing, which is the only thing routing reads. */
  let cursor = 0;

  const wireAt = (at: number): Wire =>
    at < DB_CHIP_AT ? 'none' : at < WIRE_FIX_AT ? 'liveness' : 'readiness';
  const dbUp = (at: number): boolean => at < DB_BLIP[0] || at >= DB_BLIP[1];
  const depDown = (at: number): boolean => at >= DEP_BLIP[0] && at < DEP_BLIP[1];

  const setBadge = (at: number, index: number, value: string): void => {
    const pod = pods[index];
    if (!pod || pod.badge === value) return;
    pod.badge = value;
    setAttr(at, `pod-${index}`, 'data-rp-pod', value);
  };

  const setChip = (at: number, index: number, kind: 'r' | 'l', ok: boolean): void => {
    const pod = pods[index];
    if (!pod) return;
    const value = ok ? 'ok' : 'fail';
    if (pod[kind] === value) return;
    pod[kind] = value;
    setAttr(at, `pod-${index}`, `data-rp-${kind}`, value);
  };

  /**
   * The ring says whatever the pod is currently counting: a warm-up it is
   * inside, or a run of refusals that is on its way to a decision. A refusal
   * only counts when it can still change something, so readiness stops filling
   * the ring the moment the pod is out of the endpoints.
   */
  const refreshRing = (at: number, index: number): void => {
    const pod = pods[index];
    if (!pod) return;
    let next = 'off';
    let level = 0;
    if (pod.badge === 'starting') {
      next = 'delay';
    } else if (!pod.restarting) {
      const counting = Math.max(pod.inEndpoints ? pod.rFails : 0, pod.lFails);
      level = Math.min(FAILURE_THRESHOLD, counting);
      if (level > 0) next = 'fail';
    }
    if (next !== pod.ring) {
      pod.ring = next;
      setAttr(at, `pod-${index}`, 'data-rp-ring', next);
    }
    if (next === 'fail') {
      if (level !== pod.ringLevel) {
        ringSteps.push({ pod: index, at: round(at), level });
        pod.ringLevel = level;
      }
    } else {
      pod.ringLevel = 0;
    }
  };

  const setReady = (at: number): void => {
    setAttr(at, 'stage', 'data-rp-ready', String(readyCount));
  };

  const join = (at: number, index: number): void => {
    const pod = pods[index];
    if (!pod || pod.inEndpoints) return;
    pod.inEndpoints = true;
    readyCount += 1;
    setAttr(at, `ep-${index}`, 'data-rp-ep', 'on');
    setReady(at);
    setBadge(at, index, 'ready');
    cue(at, 'success');
  };

  const leave = (at: number, index: number): void => {
    const pod = pods[index];
    if (!pod || !pod.inEndpoints) return;
    pod.inEndpoints = false;
    readyCount -= 1;
    setAttr(at, `ep-${index}`, 'data-rp-ep', 'off');
    setReady(at);
  };

  const { schedule, drain } = createScheduler();

  /**
   * A container the kubelet has given up on. It goes dark, comes back, warms
   * up, and only then can readiness let traffic near it again.
   */
  const kill = (at: number, index: number): void => {
    const pod = pods[index];
    if (!pod) return;
    pod.restarting = true;
    pod.hung = false;
    pod.rFails = 0;
    pod.lFails = 0;
    pod.restarts += 1;
    restartTotal += 1;
    leave(at, index);
    setAttr(at, `pod-${index}`, 'data-rp-restarts', String(pod.restarts));
    setAttr(at, 'stage', 'data-rp-total', String(restartTotal));
    setChip(at, index, 'r', false);
    setChip(at, index, 'l', false);
    setBadge(at, index, 'restarting');
    refreshRing(at, index);
    cue(at, 'failure');

    const back = round(at + RESTART_MS);
    schedule(back, () => {
      pod.restarting = false;
      pod.appReadyAt = round(back + WARMUP);
      setBadge(back, index, 'starting');
      sweeps.push({ pod: index, from: back, to: pod.appReadyAt });
      refreshRing(back, index);
      schedule(pod.appReadyAt, () => {
        if (!pod.inEndpoints && !pod.restarting) setBadge(pod.appReadyAt, index, 'notready');
        refreshRing(pod.appReadyAt, index);
      });
    });
  };

  /**
   * One probe instant. Both probes of a pod are asked together, both answers
   * are stamped on the timeline, and each answer is counted against its own
   * threshold. A container that is being replaced is not asked at all.
   */
  const probe = (at: number, index: number, tick: number): void => {
    const pod = pods[index];
    if (!pod || pod.restarting) return;
    tickAt.push(at);

    const wire = wireAt(at);
    const alive = !pod.hung;
    const readinessOk =
      alive &&
      at >= pod.appReadyAt &&
      !(index === 1 && depDown(at)) &&
      !(wire === 'readiness' && !dbUp(at));
    const livenessOk = alive && !(wire === 'liveness' && !dbUp(at));

    setAttr(at, `tick-${index}-r-${tick}`, 'data-rp-tick', readinessOk ? 'ok' : 'fail');
    setAttr(at, `tick-${index}-l-${tick}`, 'data-rp-tick', livenessOk ? 'ok' : 'fail');
    setChip(at, index, 'r', readinessOk);
    setChip(at, index, 'l', livenessOk);

    if (readinessOk) {
      pod.rFails = 0;
      join(at, index);
    } else {
      pod.rFails += 1;
      if (pod.inEndpoints && pod.rFails === FAILURE_THRESHOLD) {
        leave(at, index);
        setBadge(at, index, 'notready');
        cue(at, 'trip');
      }
    }

    if (livenessOk) {
      pod.lFails = 0;
    } else {
      pod.lFails += 1;
      if (pod.lFails === FAILURE_THRESHOLD) {
        cue(at, 'trip');
        const killAt = round(at + KILL_DELAY);
        schedule(killAt, () => kill(killAt, index));
      }
    }

    refreshRing(at, index);
  };

  /** A request takes the next lit endpoint the rotation reaches, or none. */
  const arrive = (at: number): void => {
    for (let step = 0; step < POD_COUNT; step += 1) {
      const index = (cursor + step) % POD_COUNT;
      const pod = pods[index];
      if (pod?.inEndpoints) {
        cursor = (index + 1) % POD_COUNT;
        arrivals.push({ at, lane: index, routed: true, served: !pod.hung });
        return;
      }
    }
    arrivals.push({ at, lane: 1, routed: false, served: false });
  };

  // --- everything the scene is told, booked in one queue -------------------

  schedule(HANG_FROM, () => {
    const pod = pods[2];
    if (pod) pod.hung = true;
  });
  schedule(DB_CHIP_AT, () => {
    setAttr(DB_CHIP_AT, 'stage', 'data-rp-db', 'ok');
    setAttr(DB_CHIP_AT, 'stage', 'data-rp-wire', 'liveness');
    cue(DB_CHIP_AT, 'state');
  });
  schedule(DB_BLIP[0], () => {
    setAttr(DB_BLIP[0], 'stage', 'data-rp-db', 'fail');
    cue(DB_BLIP[0], 'state');
  });
  schedule(DB_BLIP[1], () => {
    setAttr(DB_BLIP[1], 'stage', 'data-rp-db', 'ok');
    cue(DB_BLIP[1], 'state');
  });
  schedule(WIRE_FIX_AT, () => {
    setAttr(WIRE_FIX_AT, 'stage', 'data-rp-wire', 'readiness');
    cue(WIRE_FIX_AT, 'trip');
  });
  schedule(SPLIT_AT, () => setAttr(SPLIT_AT, 'stage', 'data-rp-split', 'on'));

  // The third pod is already warming up when the scene opens, so its ring is
  // sweeping from the first frame and the word it says changes when it is done.
  const podC = pods[2];
  if (podC) {
    sweeps.push({ pod: 2, from: 0, to: POD_C_READY_AT });
    schedule(POD_C_READY_AT, () => {
      if (!podC.inEndpoints && !podC.restarting) setBadge(POD_C_READY_AT, 2, 'notready');
      refreshRing(POD_C_READY_AT, 2);
    });
  }

  for (let index = 0; index < POD_COUNT; index += 1) {
    probeTimes(index).forEach((at, tick) => schedule(at, () => probe(at, index, tick)));
  }

  for (let at = REQ_FROM; at <= REQ_LAST + 1e-6; at = round(at + REQ_EVERY)) {
    const when = round(at);
    schedule(when, () => arrive(when));
  }

  drain();

  // --- the cues, sampled and then thinned ---------------------------------

  // Thirty-six probe instants a row is too many to sound, so the probe cue is
  // a sample of the rhythm rather than a count of it.
  tickAt.sort((left, right) => left - right);
  let lastSample = -Infinity;
  for (const at of tickAt) {
    if (at - lastSample < STATE_SAMPLE) continue;
    lastSample = at;
    candidates.push([at, 'state']);
  }

  // What is left is ranked, so where two things land close enough together
  // that only one can be heard, it is the louder one that survives.
  candidates.sort(
    (left, right) => CUE_RANK[left[1]] - CUE_RANK[right[1]] || left[0] - right[0],
  );
  const cues: [number, SceneCue][] = [];
  for (const candidate of candidates) {
    const clash = cues.some(([at]) => Math.abs(at - candidate[0]) + 1e-9 < CUE_GAP);
    if (!clash) cues.push(candidate);
  }
  cues.sort((left, right) => left[0] - right[0]);

  // --- put the discrete changes in time order -----------------------------

  const inTimeOrder = raw
    .map((entry, order) => ({ entry, order }))
    .sort((left, right) => left.entry.at - right.entry.at || left.order - right.order)
    .map(({ entry }) => entry);

  const folded: AttrChange[] = [];
  for (const entry of inTimeOrder) {
    collapseAtInstant(folded, entry, (change) => `${change.target}@${change.name}`);
  }

  const seen = new Map<string, string>(Object.entries(STAGE_STATE));
  const attrs: AttrChange[] = [];
  for (const change of folded) {
    const key = `${change.target}@${change.name}`;
    if (seen.get(key) === change.value) continue;
    seen.set(key, change.value);
    attrs.push(change);
  }

  ringSteps.sort((left, right) => left.at - right.at);
  sweeps.sort((left, right) => left.from - right.from);

  return { attrs, arrivals, sweeps, steps: ringSteps, cues };
}

// --- the timeline ---------------------------------------------------------

/** Sweeps a ring from empty to full over the window it measures. */
function sweepRing(
  tl: gsap.core.Timeline,
  element: SVGCircleElement,
  from: number,
  to: number,
): void {
  if (to <= from) return;
  tl.fromTo(
    element,
    { attr: { 'stroke-dashoffset': RING_CIRCUMFERENCE } },
    {
      attr: { 'stroke-dashoffset': 0 },
      duration: to - from,
      ease: 'none',
      immediateRender: false,
    },
    from,
  );
}

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const targets: Record<string, Element> = { stage };
  const rings: SVGCircleElement[] = [];
  for (let pod = 0; pod < POD_COUNT; pod += 1) {
    targets[`pod-${pod}`] = q<SVGGElement>(stage, `.rp-pod--${pod}`, ID);
    targets[`ep-${pod}`] = q<SVGGElement>(stage, `.rp-ep--${pod}`, ID);
    rings.push(q<SVGCircleElement>(stage, `.rp-ring--${pod} .rp-ring-progress`, ID));
    for (const kind of ['r', 'l'] as const) {
      probeTimes(pod).forEach((_at, tick) => {
        targets[`tick-${pod}-${kind}-${tick}`] = q<SVGGElement>(
          stage,
          `.rp-tick--${pod}-${kind}-${tick}`,
          ID,
        );
      });
    }
  }

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);
  const sim = simulate();
  const parts = mountRequests(layer, sim.arrivals.length, ID);

  const tl = createSceneTimeline();

  // --- discrete state -----------------------------------------------------

  for (const change of sim.attrs) {
    const target = targets[change.target];
    if (target) attr(tl, target, change.name, change.value, change.at);
  }

  // --- the rings ----------------------------------------------------------

  for (const sweep of sim.sweeps) {
    const ring = rings[sweep.pod];
    if (ring) sweepRing(tl, ring, sweep.from, sweep.to);
  }
  for (const step of sim.steps) {
    const ring = rings[step.pod];
    if (!ring) continue;
    const offset = Number(
      (RING_CIRCUMFERENCE * (1 - step.level / FAILURE_THRESHOLD)).toFixed(2),
    );
    tl.set(ring, { attr: { 'stroke-dashoffset': offset }, immediateRender: false }, step.at);
  }

  // --- what travels -------------------------------------------------------

  sim.arrivals.forEach((arrival, index) => {
    const request = parts[index];
    if (!request) return;
    const lane = LANE_X[arrival.lane] ?? 0;
    parkRequest(request, lane, ROUTER_BOTTOM);
    showRequest(tl, request, arrival.at);

    if (!arrival.routed) {
      const at = round(arrival.at + REFUSE_AFTER);
      markRequest(tl, request, 'fail', at);
      hideRequest(tl, request, at, FADE);
      return;
    }

    const at = round(arrival.at + TRIP);
    moveRequest(tl, request, POD_Y, TRIP, arrival.at);
    markRequest(tl, request, arrival.served ? 'ok' : 'fail', at);
    hideRequest(tl, request, at, FADE);
  });

  // --- sound --------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels --------------------------------------------------------

  // The stage is complete on the first frame: the Router lists two endpoints
  // of three, the third pod is warming up, the timeline is empty and every
  // readout is at its opening value.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
