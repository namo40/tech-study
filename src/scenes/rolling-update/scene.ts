import {
  DRAIN_W,
  LANE_COUNT,
  POD_COUNT,
  PROGRESS_W,
  REPLICAS,
  SCENE_DURATION,
  STAGE_STATE,
  X_CLIENT,
  Y_ARRIVE,
  Y_CLIENT,
  Y_RAIL,
  laneX,
} from './stage';
import { q, qa } from '../shared/dom';
import { hideRequest, markRequest, mountRequests, parkRequest, showRequest } from '../shared/request';
import type { RequestParts, RequestResult } from '../shared/request';
import { collapseAtInstant, createScheduler } from '../shared/simulation';
import { attr, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Rolling Update scene: a 24 second, four step timeline.
 *
 * Same two rules as the other scenes: every tween sits at an absolute position,
 * and every discrete change is a zero-duration tween on a `data-*` attribute
 * that GSAP reverts when the playhead moves back past it.
 *
 * One deployment, running for the whole 24 seconds. There is no state anywhere
 * in this file that says what a step opens with: each step continues from
 * wherever the last one left the fleet, and the step labels only name what the
 * rollout happens to be doing at that point. The scene is told five things and
 * derives the rest: the request stream, when the rollout starts, which two
 * attempts fail their readiness probe, when the stalled rollout is undone, and
 * when the schema changes.
 *
 * The controller is the same one both ways round. It holds a target version,
 * surges one pod towards it, waits for readiness, and only then retires a pod
 * that is not on the target yet. `rollout undo` does not rewind anything: it
 * flips the target from v2 back to v1, and the same machinery walks the fleet
 * back one pod at a time, with the same startup, the same endpoints
 * propagation and the same drain. That is why the readout counts down through
 * the undo instead of jumping.
 *
 * Two compressions of time, both at fifteen real seconds to the scene second: a
 * pod's thirty second startup is a ring that takes two, and the thirty second
 * termination grace period is a two second deadline. Endpoint propagation is
 * 0.4s on the same scale. Every label keeps the real value.
 *
 * The rule worth naming, because it is the real one rather than a
 * simplification: a pod leaves the endpoints list a moment after it is told to
 * stop, not at the same instant. Requests routed inside that window still reach
 * it, it still answers them, and it only exits once it has.
 */

const ID = 'rolling-update';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- how time is compressed -----------------------------------------------

/** Real seconds one scene second stands for. */
const REAL_PER_SCENE = 15;
/** A pod's thirty second startup, and the thirty second grace period. */
const START_SECONDS = 30 / REAL_PER_SCENE;
const GRACE_SECONDS = 30 / REAL_PER_SCENE;
/** How long an endpoints change takes to reach whoever is routing. */
const PROPAGATION = 0.4;
/**
 * A recreated pod reaches the same failing probe sooner than the first one did,
 * because its image is already on the node and there is no cold start left.
 */
const RETRY_SECONDS = 1.2;

// --- what the controller does ---------------------------------------------

/** How soon after a surge pod joins the endpoints an old pod is told to stop. */
const SIGTERM_DELAY = 0.2;
/** The shortest drain the bar draws, and how soon the next surge follows. */
const DRAIN_MIN = 1;
const RESTART_GAP = 0.2;

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
const DWELL = 0.1;
const FADE = 0.16;

/**
 * The steady stream: one request every quarter second, from first to last. The
 * phase matters: it is what decides which dots are in the air when a pod is
 * told to stop, and 0.225 is the offset at which one is routed to a terminating
 * pod inside step 3, in the gap before the endpoints removal has propagated.
 */
const FIRST_START = 0.225;
const REQ_GAP = 0.25;
/** The last dot has to land and clear before the scene ends. */
const LAST_START = 23.15;

// --- what the scene is told ------------------------------------------------

type PodState = 'absent' | 'starting' | 'not-ready' | 'ready' | 'terminating';
type Version = 'v1' | 'v2';
type Rollout = 'idle' | 'running' | 'stalled' | 'rolling-back' | 'undone';
type Schema = 'base' | 'expand' | 'renamed' | 'contract';

/** When the deployment is first told to move to v2. */
const ROLLOUT_START = 0.7;
/** Surges begun at these instants carry a build that never becomes ready. */
const PROBE_FAILS = [4.1, 6.3];
/** When the failed pod is recreated, and when the stalled rollout is undone. */
const RETRY_AT = 6.3;
const UNDO_AT = 7.7;
/** When the fixed build is deployed, which points the target at v2 again. */
const REDEPLOY_AT = 12.2;
/** After this the controller starts nothing new, because it would not finish. */
const ROLLING_UNTIL = 22;
/**
 * The last old pod. Two more startups do not fit before the scene ends, so the
 * rollout is finished in one step rather than left at three quarters.
 */
const PROMOTE_AT = 22.4;

/** What the one table both versions read looks like, and from when. */
const SCHEMA_PLAN: [number, Schema][] = [
  [18.4, 'expand'],
  [20, 'renamed'],
  [21.4, 'expand'],
  [22.8, 'contract'],
];

// --- what the simulation produces -----------------------------------------

interface Outcome {
  pod: number;
  lane: number;
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

interface Sweep {
  index: number;
  from: number;
  to: number;
}

interface BarStep {
  at: number;
  from: number;
  to: number;
}

interface Simulation {
  starts: number[];
  outcomes: Outcome[];
  attrs: AttrChange[];
  rings: Sweep[];
  drains: Sweep[];
  progress: BarStep[];
  cues: [number, SceneCue][];
  skipped: number;
}

interface Pod {
  state: PodState;
  version: Version;
  inEndpoints: boolean;
  /** When each lane frees up, which is when the dot standing on it has faded. */
  lanes: number[];
  /** Bumped by every start, so a probe booked by an earlier one lapses. */
  attempt: number;
}

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

  const rings: Sweep[] = [];
  const drains: Sweep[] = [];
  const progress: [number, number][] = [[0, 0]];

  const pods: Pod[] = Array.from({ length: POD_COUNT }, (_value, index) => ({
    state: index < REPLICAS ? ('ready' as PodState) : ('absent' as PodState),
    version: 'v1' as Version,
    inEndpoints: index < REPLICAS,
    lanes: Array.from({ length: LANE_COUNT }, () => 0),
    attempt: 0,
  }));

  /** The version the deployment is currently moving towards. */
  let target: Version = 'v1';
  let updated = 0;
  let rollout: Rollout = 'idle';
  let schema: Schema = 'base';

  const { schedule, drain } = createScheduler();

  const readyOn = (version: Version): number =>
    pods.filter((pod) => pod.state === 'ready' && pod.version === version).length;

  /**
   * The readout is the number of the four replicas currently serving the new
   * version. Nothing sets it: it is counted after every change, which is what
   * makes the undo walk it back down rather than snap it.
   */
  const syncUpdated = (at: number): void => {
    const value = Math.min(REPLICAS, readyOn('v2'));
    if (value === updated) return;
    updated = value;
    setAttr(at, 'stage', 'data-updated', String(value));
    progress.push([round(at), value]);
    cue(at, 'state');
  };

  const setRollout = (at: number, value: Rollout): void => {
    if (value === rollout) return;
    rollout = value;
    setAttr(at, 'stage', 'data-rollout', value);
  };

  // --- the pods -----------------------------------------------------------

  function start(at: number, index: number, version: Version, seconds: number): void {
    const pod = pods[index];
    if (!pod) return;
    pod.state = 'starting';
    pod.version = version;
    pod.attempt += 1;
    const attempt = pod.attempt;
    setAttr(at, `pod-${index + 1}`, 'data-pod', 'starting');
    setAttr(at, `pod-${index + 1}`, 'data-ver', version);
    rings.push({ index, from: round(at), to: round(at + seconds) });
    const fails = PROBE_FAILS.includes(round(at));
    const decided = round(at + seconds);
    schedule(decided, () => {
      const it = pods[index];
      if (!it || it.attempt !== attempt || it.state !== 'starting') return;
      probe(decided, index, fails);
    });
  }

  /** Puts one more pod on the target version, which is all `maxSurge 1` allows. */
  function surge(at: number): void {
    if (at > ROLLING_UNTIL) return;
    const index = pods.findIndex((pod) => pod.state === 'absent');
    if (index < 0) return;
    // A surge during a roll back is still the same rollout, so the state only
    // moves to `running` when nothing else is already saying what it is doing.
    if (rollout === 'idle' || rollout === 'undone') setRollout(at, 'running');
    cue(at, 'trip');
    start(at, index, target, START_SECONDS);
  }

  function probe(at: number, index: number, fails: boolean): void {
    const pod = pods[index];
    if (!pod) return;
    if (fails) {
      pod.state = 'not-ready';
      setAttr(at, `pod-${index + 1}`, 'data-pod', 'not-ready');
      cue(at, 'failure');
      setRollout(at, 'stalled');
      cue(at, 'state');
      return;
    }
    pod.state = 'ready';
    setAttr(at, `pod-${index + 1}`, 'data-pod', 'ready');
    cue(at, 'success');
    pod.inEndpoints = true;
    setAttr(at, `ep-${index + 1}`, 'data-ep', 'in');
    cue(at, 'state');
    syncUpdated(at);
    const next = round(at + SIGTERM_DELAY);
    schedule(next, () => retireNext(next));
  }

  /** Retires one pod that is not on the target yet, now that the surge is up. */
  function retireNext(at: number): void {
    if (at > ROLLING_UNTIL) return;
    const index = pods.findIndex((pod) => pod.state === 'ready' && pod.version !== target);
    if (index < 0) return;
    sigterm(at, index);
  }

  function sigterm(at: number, index: number): void {
    const pod = pods[index];
    if (!pod || pod.state !== 'ready') return;
    pod.state = 'terminating';
    setAttr(at, `pod-${index + 1}`, 'data-pod', 'terminating');
    setAttr(at, `pod-${index + 1}`, 'data-sig', 'on');
    cue(at, 'trip');
    syncUpdated(at);
    drains.push({ index, from: round(at), to: 0 });

    const propagated = round(at + PROPAGATION);
    schedule(propagated, () => {
      const it = pods[index];
      if (!it || it.state !== 'terminating') return;
      it.inEndpoints = false;
      setAttr(propagated, `ep-${index + 1}`, 'data-ep', 'out');
      cue(propagated, 'state');
    });

    const earliest = round(at + DRAIN_MIN);
    schedule(earliest, () => {
      const it = pods[index];
      if (!it || it.state !== 'terminating') return;
      const busy = Math.max(earliest, ...it.lanes);
      const leaves = round(Math.min(busy, at + GRACE_SECONDS));
      if (leaves <= earliest) exitPod(earliest, index);
      else schedule(leaves, () => exitPod(leaves, index));
    });
  }

  function exitPod(at: number, index: number): void {
    const pod = pods[index];
    if (!pod || pod.state !== 'terminating') return;
    pod.state = 'absent';
    pod.inEndpoints = false;
    setAttr(at, `pod-${index + 1}`, 'data-pod', 'absent');
    setAttr(at, `pod-${index + 1}`, 'data-sig', 'off');
    for (const sweep of drains) if (sweep.index === index && sweep.to === 0) sweep.to = round(at);
    cue(at, 'state');
    syncUpdated(at);

    // The fleet is where it was asked to be when every replica is on the target
    // and nothing is left of the version it came from.
    const arrived =
      readyOn(target) >= REPLICAS &&
      pods.every((it) => it.state === 'absent' || it.version === target);
    if (arrived) {
      if (target === 'v1') {
        setRollout(at, 'undone');
        cue(at, 'state');
      }
      return;
    }
    const next = round(at + RESTART_GAP);
    if (next <= ROLLING_UNTIL) schedule(next, () => surge(next));
  }

  // --- the plan, which is the only thing authored -------------------------

  /** Closes a ring that a decision cut short, so no sweep outlives its pod. */
  const truncate = (index: number, at: number): void => {
    for (const sweep of rings) if (sweep.index === index && sweep.to > at) sweep.to = round(at);
  };

  target = 'v2';
  schedule(ROLLOUT_START, () => surge(ROLLOUT_START));

  schedule(RETRY_AT, () => {
    const index = pods.findIndex((pod) => pod.state === 'not-ready');
    if (index < 0) return;
    start(RETRY_AT, index, target, RETRY_SECONDS);
  });

  schedule(UNDO_AT, () => {
    const index = pods.findIndex(
      (pod) => pod.state === 'not-ready' || pod.state === 'starting',
    );
    if (index < 0) return;
    const pod = pods[index];
    if (!pod) return;
    truncate(index, UNDO_AT);
    pod.state = 'absent';
    pod.inEndpoints = false;
    setAttr(UNDO_AT, `pod-${index + 1}`, 'data-pod', 'absent');
    setAttr(UNDO_AT, `ep-${index + 1}`, 'data-ep', 'out');
    // Undoing is not a rewind. It points the deployment back at the version it
    // came from and lets the same controller walk the fleet there.
    target = 'v1';
    setRollout(UNDO_AT, 'rolling-back');
    cue(UNDO_AT, 'trip');
    const next = round(UNDO_AT + RESTART_GAP);
    schedule(next, () => surge(next));
  });

  schedule(REDEPLOY_AT, () => {
    target = 'v2';
    surge(REDEPLOY_AT);
  });

  schedule(PROMOTE_AT, () => {
    const index = pods.findIndex((pod) => pod.state === 'ready' && pod.version !== target);
    if (index < 0) return;
    const pod = pods[index];
    if (!pod) return;
    pod.version = target;
    setAttr(PROMOTE_AT, `pod-${index + 1}`, 'data-ver', target);
    cue(PROMOTE_AT, 'trip');
    syncUpdated(PROMOTE_AT);
  });

  for (const [at, value] of SCHEMA_PLAN) {
    schedule(at, () => {
      schema = value;
      setAttr(at, 'stage', 'data-schema', value);
      cue(at, value === 'expand' && at > 21 ? 'state' : 'trip');
    });
  }

  // --- the requests -------------------------------------------------------

  const starts: number[] = [];
  for (let at = FIRST_START; at <= LAST_START; at = round(at + REQ_GAP)) starts.push(round(at));

  const outcomes: Outcome[] = starts.map(() => ({
    pod: 0,
    lane: 0,
    decideAt: 0,
    railExitAt: 0,
    arriveAt: 0,
    markAt: 0,
    fadeAt: 0,
    result: 'ok' as RequestResult,
  }));

  let cursor = 0;
  let skipped = 0;

  /**
   * Round robin over the endpoints list, which is the only thing the router
   * knows. A pod that is terminating is still in it until the removal has
   * propagated, so it is still picked; a pod that never passed its probe never
   * entered it, so it never is.
   */
  const pick = (at: number): [number, number] | null => {
    for (let step = 0; step < POD_COUNT; step += 1) {
      const index = (cursor + step) % POD_COUNT;
      const pod = pods[index];
      if (!pod || !pod.inEndpoints) continue;
      const lane = pod.lanes.findIndex((free) => free <= at);
      if (lane < 0) continue;
      cursor = (index + 1) % POD_COUNT;
      return [index, lane];
    }
    return null;
  };

  starts.forEach((start_, order) => {
    const outcome = outcomes[order];
    if (!outcome) return;
    const decideAt = round(start_ + DROP_TO_RAIL);
    schedule(decideAt, () => {
      const chosen = pick(decideAt);
      if (!chosen) {
        skipped += 1;
        return;
      }
      const [index, lane] = chosen;
      const pod = pods[index];
      if (!pod) return;
      const across = Math.abs(laneX(index, lane) - X_CLIENT) / SPEED;
      const railExitAt = round(decideAt + across);
      const arriveAt = round(railExitAt + DROP_TO_POD);
      const markAt = round(arriveAt + DWELL);
      const fadeAt = round(markAt + FADE);
      pod.lanes[lane] = fadeAt;
      outcome.pod = index;
      outcome.lane = lane;
      outcome.decideAt = decideAt;
      outcome.railExitAt = railExitAt;
      outcome.arriveAt = arriveAt;
      outcome.markAt = markAt;
      outcome.fadeAt = fadeAt;

      // What it comes back with is read where it lands, not where it was sent:
      // the pod answers out of the schema that exists when the request reaches
      // it, and a version that can no longer find its column cannot answer.
      schedule(arriveAt, () => {
        const it = pods[index];
        if (!it) return;
        const broken = schema === 'renamed' && it.version === 'v1';
        outcome.result = broken ? 'fail' : 'ok';
        cue(markAt, broken ? 'failure' : 'success');
        if (it.state === 'terminating') {
          schedule(fadeAt, () => cue(fadeAt, 'state'));
        }
      });
    });
  });

  drain();

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

  // --- the rollout bar, read off the count it draws -----------------------

  progress.sort((left, right) => left[0] - right[0]);
  const bar: BarStep[] = [];
  let width = 0;
  for (const [at, value] of progress) {
    const to = round((value / REPLICAS) * PROGRESS_W);
    if (to === width) continue;
    bar.push({ at: round(at), from: width, to });
    width = to;
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

  return { starts, outcomes, attrs, rings, drains, progress: bar, cues: deduped, skipped };
}

// --- the timeline ---------------------------------------------------------

/** Sweeps a countdown ring from empty to full over the window it measures. */
function sweepRing(tl: gsap.core.Timeline, element: SVGCircleElement, from: number, to: number): void {
  if (to <= from) return;
  const circumference = Number(element.getAttribute('stroke-dasharray') ?? 0);
  tl.fromTo(
    element,
    { attr: { 'stroke-dashoffset': circumference } },
    {
      attr: { 'stroke-dashoffset': 0 },
      duration: to - from,
      ease: 'none',
      immediateRender: false,
    },
    from,
  );
}

/** Grows a bar from one width to another, starting at an absolute position. */
function growBar(
  tl: gsap.core.Timeline,
  element: Element,
  from: number,
  to: number,
  at: number,
  duration: number,
): void {
  if (duration <= 0) {
    tl.set(element, { attr: { width: to }, immediateRender: false }, at);
    return;
  }
  tl.fromTo(
    element,
    { attr: { width: from } },
    { attr: { width: to }, duration, ease: 'none', immediateRender: false },
    at,
  );
}

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const targets: Record<string, Element> = { stage };
  for (let index = 1; index <= POD_COUNT; index += 1) {
    targets[`pod-${index}`] = q<SVGGElement>(stage, `.ru-pod--${index}`, ID);
    targets[`ep-${index}`] = q<SVGGElement>(stage, `.ru-ep--${index}`, ID);
  }
  const startRings = qa<SVGCircleElement>(stage, '.ru-start-progress');
  const drainFills = qa<SVGRectElement>(stage, '.ru-drain-fill');
  const progressFill = q<SVGRectElement>(stage, '.ru-progress-fill', ID);
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

  // --- the two countdowns -------------------------------------------------

  for (const sweep of sim.rings) {
    const element = startRings[sweep.index];
    if (element) sweepRing(tl, element, sweep.from, sweep.to);
  }

  for (const sweep of sim.drains) {
    const element = drainFills[sweep.index];
    if (!element || sweep.to <= sweep.from) continue;
    growBar(tl, element, 0, DRAIN_W, sweep.from, sweep.to - sweep.from);
  }

  // --- how far the rollout got --------------------------------------------

  sim.progress.forEach((step, index) => {
    const next = sim.progress[index + 1];
    const room = next ? next.at - step.at : SCENE_DURATION - step.at;
    growBar(tl, progressFill, step.from, step.to, step.at, Math.min(0.25, room));
  });

  // --- requests -----------------------------------------------------------

  const move = (parts: RequestParts, vars: gsap.TweenVars, duration: number, at: number): void => {
    tl.to(parts.group, { ...vars, duration, ease: 'none', immediateRender: false }, at);
  };

  sim.starts.forEach((start, index) => {
    const parts = requests[index];
    const outcome = sim.outcomes[index];
    if (!parts || !outcome || outcome.fadeAt === 0) return;

    const lane = laneX(outcome.pod, outcome.lane);
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

  // The stage is complete on the first frame: four v1 pods ready, four members
  // in the endpoints list, one empty slot for the surge, and a rollout that has
  // not started. Nothing is rebuilt at a label: each step continues from
  // wherever the last one left the fleet.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
