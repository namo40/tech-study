import {
  LOAD_WIDTH,
  SCENE_DURATION,
  STAGE_STATE,
  X_INST,
  X_USER,
  Y_CLIENT,
  Y_DECIDE,
  Y_INST,
  Y_LANE,
} from './stage';
import { q, qa } from '../shared/dom';
import { hideRequest, markRequest, mountRequests, parkRequest, showRequest } from '../shared/request';
import type { RequestParts, RequestResult } from '../shared/request';
import { collapseAtInstant, createScheduler } from '../shared/simulation';
import { attr, fadeAt, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Sticky Session scene: a 24 second, four step timeline.
 *
 * Same two rules as the other scenes: every tween sits at an absolute position,
 * and every discrete change is a zero-duration tween on a `data-*` attribute
 * that GSAP reverts when the playhead moves back past it.
 *
 * Nothing about the routing is authored. Each request says only when it leaves,
 * who sent it, and whether it is a login; the load balancer works out where it
 * goes from the affinity cookie it holds, whether that instance is still up,
 * and where its own rotation had got to. Which requests are rejected, which
 * instance ends up carrying the busy user, which cookie goes stale and when,
 * and how far each load meter is filled all fall out of that one pass. The
 * meters in particular are a single continuous curve per instance: every hit
 * adds to it, it drains at a constant rate the rest of the time, and a restart
 * empties it, so no frame of a meter is placed by hand.
 */

const ID = 'sticky-session';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- how long a request takes -------------------------------------------

/** Down: to the load balancer, across to a lane, then down to the instance. */
const LEG_TO_LB = 0.3;
const LEG_TO_LANE = 0.08;
const LEG_TO_INST = 0.22;
/** Time the instance spends answering, which is when the slot is read. */
const DWELL = 0.1;
/** Up: back along the lane, back to the user's own lane, then home. */
const LEG_UP_LANE = 0.2;
const LEG_UP_LB = 0.05;
const LEG_UP_HOME = 0.15;

const DOWN_TIME = LEG_TO_LB + LEG_TO_LANE + LEG_TO_INST;
const UP_TIME = LEG_UP_LANE + LEG_UP_LB + LEG_UP_HOME;

/** How long `no session` stays up, and how long a store lookup is drawn. */
const MISS_FLASH = 0.6;
const LOOKUP_FLASH = 0.35;

// --- how the load meters move --------------------------------------------

/** Share of a meter one request adds, and how long the rise takes to draw. */
const LOAD_STEP = 0.16;
const LOAD_RISE = 0.12;
/** Share a meter loses per second while nothing is arriving. */
const LOAD_DECAY = 0.062;
/** How long a restarting instance takes to drop to nothing. */
const LOAD_DROP = 0.15;
/** Where a meter counts as an imbalance rather than ordinary traffic. */
const LOAD_HOT = 0.7;

// --- what the users do ----------------------------------------------------

type UserKey = 'a' | 'b';
type Affinity = 'off' | 'on' | 'optional';
type SessionValue = 'none' | UserKey;

interface RequestPlan {
  start: number;
  user: UserKey;
  /** A login creates the session it did not find. Everything else needs one. */
  login: boolean;
}

const REQUESTS: RequestPlan[] = [
  // Step 1: the session is in memory and the rotation ignores it.
  { start: 0.5, user: 'a', login: true },
  { start: 1.8, user: 'a', login: false },
  { start: 3.2, user: 'b', login: true },
  { start: 4.4, user: 'b', login: false },
  // Step 2: the same two users, now with affinity on. A is the busy one.
  { start: 6.4, user: 'a', login: true },
  { start: 7.6, user: 'b', login: true },
  { start: 7.8, user: 'a', login: false },
  { start: 8.4, user: 'a', login: false },
  { start: 9.0, user: 'a', login: false },
  { start: 9.6, user: 'a', login: false },
  { start: 10.2, user: 'a', login: false },
  { start: 10.4, user: 'b', login: false },
  // Step 3: a deploy takes the instance A is pinned to.
  { start: 13.2, user: 'a', login: false },
  { start: 14.6, user: 'a', login: true },
  { start: 15.0, user: 'b', login: false },
  // Step 4: the session is in a shared store, so any instance will do.
  { start: 18.5, user: 'a', login: false },
  { start: 19.2, user: 'a', login: false },
  { start: 19.9, user: 'b', login: false },
  { start: 20.8, user: 'a', login: false },
];

/** What happens to the deployment itself, away from any single request. */
interface ScenarioEvent {
  at: number;
  kind: 'affinity' | 'deploy' | 'recover' | 'externalise';
  instance?: number;
}

const SCENARIO: ScenarioEvent[] = [
  // Step 2 restarts the scenario: affinity on, every session dropped, and the
  // rotation back at the first instance.
  { at: 6, kind: 'affinity' },
  // Step 3: the instance A is pinned to is rolled out and comes back empty.
  { at: 12.6, kind: 'deploy', instance: 0 },
  { at: 16, kind: 'recover', instance: 0 },
  // Step 4: the sessions the instances were holding move to a shared store.
  { at: 18, kind: 'externalise' },
  { at: 20.8, kind: 'deploy', instance: 0 },
  { at: 21.8, kind: 'recover', instance: 0 },
];

// --- what the simulation produces ----------------------------------------

interface Outcome {
  /** Instance the load balancer chose, 0 based. */
  instance: number;
  /** When the request reaches the instance, and when the instance answers. */
  atInstance: number;
  resolveAt: number;
  homeAt: number;
  result: RequestResult;
  /** True when the rotation, not a cookie, chose the instance under affinity. */
  repinned: boolean;
}

interface AttrChange {
  at: number;
  /** Which element the timeline writes to: `stage`, `inst-2`, `user-a`, … */
  key: string;
  name: string;
  value: string;
}

interface LoadEvent {
  instance: number;
  at: number;
  kind: 'hit' | 'reset';
}

interface LoadSegment {
  instance: number;
  from: number;
  to: number;
  wFrom: number;
  wTo: number;
}

interface Simulation {
  outcomes: Outcome[];
  attrs: AttrChange[];
  loads: LoadSegment[];
  cues: [number, SceneCue][];
}

// --- the load meters ------------------------------------------------------

interface Ramp {
  from: number;
  to: number;
  vFrom: number;
  vTo: number;
}

/**
 * One instance's load as a continuous piecewise line: a hit ramps it up, time
 * drains it at a constant rate, and a restart empties it. Returning the whole
 * curve rather than a set of key frames is what lets the meter be tweened
 * without any frame of it being placed by hand.
 */
function loadCurve(events: readonly LoadEvent[], end: number): Ramp[] {
  const ramps: Ramp[] = [];
  let at = 0;
  let value = 0;

  const drainTo = (target: number): void => {
    while (at < target) {
      if (value <= 0) {
        ramps.push({ from: at, to: target, vFrom: 0, vTo: 0 });
        at = target;
        value = 0;
        return;
      }
      const empty = at + value / LOAD_DECAY;
      if (empty < target) {
        ramps.push({ from: at, to: empty, vFrom: value, vTo: 0 });
        at = empty;
        value = 0;
      } else {
        const next = value - LOAD_DECAY * (target - at);
        ramps.push({ from: at, to: target, vFrom: value, vTo: next });
        at = target;
        value = next;
      }
    }
  };

  for (const event of events) {
    const start = Math.max(at, event.at);
    drainTo(start);
    if (event.kind === 'hit') {
      const next = Math.min(1, value + LOAD_STEP);
      ramps.push({ from: start, to: start + LOAD_RISE, vFrom: value, vTo: next });
      at = start + LOAD_RISE;
      value = next;
    } else {
      ramps.push({ from: start, to: start + LOAD_DROP, vFrom: value, vTo: 0 });
      at = start + LOAD_DROP;
      value = 0;
    }
  }
  drainTo(end);

  return ramps;
}

// --- the simulation -------------------------------------------------------

function simulate(): Simulation {
  const sessions: SessionValue[] = ['none', 'none', 'none'];
  const up = [true, true, true];
  const pins: Record<UserKey, number> = { a: 0, b: 0 };
  const stored: Record<UserKey, boolean> = { a: false, b: false };
  let affinity: Affinity = 'off';
  let store = false;
  /** The instance the rotation will try next. */
  let cursor = 0;

  const outcomes: Outcome[] = REQUESTS.map(() => ({
    instance: 0,
    atInstance: 0,
    resolveAt: 0,
    homeAt: 0,
    result: 'ok' as RequestResult,
    repinned: false,
  }));
  const raw: AttrChange[] = [];
  const loadEvents: LoadEvent[] = [];
  const cues: [number, SceneCue][] = [];

  const setAttr = (at: number, key: string, name: string, value: string): void => {
    raw.push({ at: round(at), key, name, value });
  };
  const cue = (at: number, name: SceneCue): void => {
    cues.push([round(at), name]);
  };

  /**
   * The cookie a user is holding, read off the state rather than scripted: it
   * exists while the load balancer is pinning, and it is stale the moment the
   * instance it names stops holding that user's session.
   */
  const cookieOf = (user: UserKey): string => {
    if (affinity !== 'on') return 'none';
    const pin = pins[user];
    if (pin === 0) return 'none';
    return sessions[pin - 1] === user ? 'fresh' : 'stale';
  };
  /** A browser only learns about its cookie when a response arrives. */
  const writeCookie = (at: number, user: UserKey): void => {
    setAttr(at, `user-${user}`, 'data-cookie', cookieOf(user));
  };

  const clearSessions = (at: number, keep: (value: SessionValue) => void): void => {
    for (let index = 0; index < sessions.length; index += 1) {
      keep(sessions[index] ?? 'none');
      sessions[index] = 'none';
      setAttr(at, `inst-${index + 1}`, 'data-session', 'none');
    }
  };

  const clearPins = (at: number): void => {
    pins.a = 0;
    pins.b = 0;
    setAttr(at, 'pin-a', 'data-pin', 'none');
    setAttr(at, 'pin-b', 'data-pin', 'none');
  };

  const { schedule, drain } = createScheduler();

  // --- the deployment itself ----------------------------------------------

  for (const event of SCENARIO) {
    const index = event.instance ?? 0;
    const at = event.at;
    schedule(at, () => {
      if (event.kind === 'affinity') {
        affinity = 'on';
        setAttr(at, 'stage', 'data-affinity', 'on');
        clearSessions(at, () => undefined);
        clearPins(at);
        cursor = 0;
        writeCookie(at, 'a');
        writeCookie(at, 'b');
        cue(at, 'state');
        return;
      }
      if (event.kind === 'deploy') {
        up[index] = false;
        sessions[index] = 'none';
        setAttr(at, `inst-${index + 1}`, 'data-inst-state', 'down');
        setAttr(at, `inst-${index + 1}`, 'data-session', 'none');
        // A restarted instance is not carrying anything, whatever its meter
        // had climbed to a moment earlier.
        setAttr(at, `inst-${index + 1}`, 'data-load-state', 'calm');
        loadEvents.push({ instance: index, at, kind: 'reset' });
        cue(at, 'trip');
        return;
      }
      if (event.kind === 'recover') {
        up[index] = true;
        setAttr(at, `inst-${index + 1}`, 'data-inst-state', 'up');
        cue(at, 'state');
        return;
      }
      // Everything the instances were holding moves to the shared store, and
      // the load balancer stops pinning anyone.
      affinity = 'optional';
      store = true;
      setAttr(at, 'stage', 'data-affinity', 'optional');
      setAttr(at, 'stage', 'data-store', 'on');
      clearSessions(at, (value) => {
        if (value !== 'none') {
          stored[value] = true;
          setAttr(at, 'stage', `data-store-${value}`, 'on');
        }
      });
      clearPins(at);
      writeCookie(at, 'a');
      writeCookie(at, 'b');
      cue(at, 'state');
    });
  }

  // --- one request at a time ----------------------------------------------

  REQUESTS.forEach((plan, index) => {
    const outcome = outcomes[index];
    if (!outcome) return;

    const decideAt = round(plan.start + LEG_TO_LB);
    const atInstance = round(plan.start + DOWN_TIME);
    const resolveAt = round(atInstance + DWELL);
    const homeAt = round(resolveAt + UP_TIME);
    outcome.atInstance = atInstance;
    outcome.resolveAt = resolveAt;
    outcome.homeAt = homeAt;

    // The load balancer decides when the request reaches it, so an instance
    // that went down a moment ago is already out of the running.
    schedule(decideAt, () => {
      const pin = affinity === 'on' ? pins[plan.user] : 0;
      if (pin > 0 && up[pin - 1] === true) {
        outcome.instance = pin - 1;
        return;
      }
      let target = cursor;
      for (let step = 0; step < up.length; step += 1) {
        const candidate = (cursor + step) % up.length;
        if (up[candidate] === true) {
          target = candidate;
          break;
        }
      }
      cursor = (target + 1) % up.length;
      outcome.instance = target;
      outcome.repinned = affinity === 'on';
    });

    // The instance takes the request: it reads its own memory, or the store.
    schedule(atInstance, () => {
      const target = outcome.instance;
      const key = `inst-${target + 1}`;
      loadEvents.push({ instance: target, at: atInstance, kind: 'hit' });

      if (store) {
        setAttr(atInstance, key, 'data-lookup', 'on');
        setAttr(atInstance + LOOKUP_FLASH, key, 'data-lookup', 'off');
        outcome.result = stored[plan.user] ? 'ok' : 'fail';
        return;
      }
      if (plan.login || sessions[target] === plan.user) {
        outcome.result = 'ok';
        return;
      }
      outcome.result = 'fail';
      setAttr(atInstance, key, 'data-miss', 'on');
      setAttr(atInstance + MISS_FLASH, key, 'data-miss', 'off');
    });

    // The instance answers: a login leaves a session behind, and a rotated
    // request leaves the load balancer's new choice behind.
    schedule(resolveAt, () => {
      const target = outcome.instance;
      if (!store && plan.login) {
        sessions[target] = plan.user;
        setAttr(resolveAt, `inst-${target + 1}`, 'data-session', plan.user);
        cue(resolveAt, 'state');
      }
      if (outcome.repinned) {
        pins[plan.user] = target + 1;
        setAttr(resolveAt, `pin-${plan.user}`, 'data-pin', String(target + 1));
        // A login already sounded for the session it created; this cue is for
        // a re-route that made no session of its own.
        if (!plan.login) cue(resolveAt, 'state');
      }
    });

    // The answer reaches the user, cookie and all.
    schedule(homeAt, () => {
      writeCookie(homeAt, plan.user);
      cue(homeAt, outcome.result === 'ok' ? 'success' : 'failure');
    });
  });

  drain();

  // --- the meters, once every hit is known --------------------------------

  const loads: LoadSegment[] = [];
  for (let index = 0; index < up.length; index += 1) {
    const ramps = loadCurve(
      loadEvents.filter((event) => event.instance === index),
      SCENE_DURATION,
    );
    let hot = false;
    for (const ramp of ramps) {
      loads.push({
        instance: index,
        from: round(ramp.from),
        to: round(ramp.to),
        wFrom: round(ramp.vFrom * LOAD_WIDTH),
        wTo: round(ramp.vTo * LOAD_WIDTH),
      });
      // The imbalance is read off the same curve, so the border and the bar can
      // never disagree about how full the meter is.
      if ((ramp.vFrom >= LOAD_HOT) !== hot) {
        hot = ramp.vFrom >= LOAD_HOT;
        setAttr(ramp.from, `inst-${index + 1}`, 'data-load-state', hot ? 'hot' : 'calm');
      }
      if ((ramp.vTo >= LOAD_HOT) !== hot) {
        hot = ramp.vTo >= LOAD_HOT;
        const span = ramp.to - ramp.from;
        const crossing =
          ramp.vTo === ramp.vFrom
            ? ramp.to
            : ramp.from + (span * (LOAD_HOT - ramp.vFrom)) / (ramp.vTo - ramp.vFrom);
        setAttr(crossing, `inst-${index + 1}`, 'data-load-state', hot ? 'hot' : 'calm');
      }
    }
  }

  // --- put the discrete changes in time order -----------------------------

  /**
   * The changes above are written as they are worked out rather than in time
   * order, and one instant can name the same element twice, so the series is
   * sorted, folded down to the change that ends up applying, and stripped of
   * anything that writes a value the element already holds.
   */
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

  return { outcomes, attrs, loads, cues };
}

// --- the timeline ---------------------------------------------------------

/** One leg of a journey. Requests here change lane, so x moves as well as y. */
function moveTo(
  tl: gsap.core.Timeline,
  parts: RequestParts,
  x: number,
  y: number,
  duration: number,
  at: number,
): void {
  tl.to(parts.group, { x, y, duration, ease: 'none', immediateRender: false }, at);
}

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const targets: Record<string, Element> = {
    stage,
    'user-a': q<SVGGElement>(stage, '.ss-user--a', ID),
    'user-b': q<SVGGElement>(stage, '.ss-user--b', ID),
    'pin-a': q<SVGGElement>(stage, '.ss-pin--a', ID),
    'pin-b': q<SVGGElement>(stage, '.ss-pin--b', ID),
    'inst-1': q<SVGGElement>(stage, '.ss-inst--1', ID),
    'inst-2': q<SVGGElement>(stage, '.ss-inst--2', ID),
    'inst-3': q<SVGGElement>(stage, '.ss-inst--3', ID),
  };
  const meters = qa<SVGRectElement>(stage, '.ss-load-fill');
  const requestLayer = q<SVGGElement>(stage, '.scene-requests', ID);

  const sim = simulate();
  const requests = mountRequests(requestLayer, REQUESTS.length, ID);

  const tl = createSceneTimeline();

  // --- discrete state -----------------------------------------------------

  for (const change of sim.attrs) {
    const element = targets[change.key];
    if (!element) continue;
    attr(tl, element, change.name, change.value, change.at);
  }

  // --- the load meters ----------------------------------------------------

  for (const segment of sim.loads) {
    const element = meters[segment.instance];
    if (!element || segment.to <= segment.from || segment.wFrom === segment.wTo) continue;
    tl.fromTo(
      element,
      { attr: { width: segment.wFrom } },
      {
        attr: { width: segment.wTo },
        duration: segment.to - segment.from,
        ease: 'none',
        immediateRender: false,
      },
      segment.from,
    );
  }

  // --- requests -----------------------------------------------------------

  REQUESTS.forEach((plan, index) => {
    const parts = requests[index];
    const outcome = sim.outcomes[index];
    if (!parts || !outcome) return;

    const lane = X_USER[plan.user];
    const instance = X_INST[outcome.instance] ?? lane;
    // The dot is coloured by who sent it, which never changes, so it is written
    // on the group once rather than tweened.
    parts.group.setAttribute('data-user', plan.user);
    parkRequest(parts, lane, Y_CLIENT);

    showRequest(tl, parts, plan.start);
    moveTo(tl, parts, lane, Y_DECIDE, LEG_TO_LB, plan.start);
    moveTo(tl, parts, instance, Y_LANE, LEG_TO_LANE, round(plan.start + LEG_TO_LB));
    moveTo(tl, parts, instance, Y_INST, LEG_TO_INST, round(plan.start + LEG_TO_LB + LEG_TO_LANE));

    markRequest(tl, parts, outcome.result, outcome.resolveAt);
    moveTo(tl, parts, instance, Y_LANE, LEG_UP_LANE, outcome.resolveAt);
    moveTo(tl, parts, lane, Y_DECIDE, LEG_UP_LB, round(outcome.resolveAt + LEG_UP_LANE));
    moveTo(tl, parts, lane, Y_CLIENT, LEG_UP_HOME, round(outcome.resolveAt + LEG_UP_LANE + LEG_UP_LB));
    hideRequest(tl, parts, outcome.homeAt, fadeAt(outcome.homeAt, SCENE_DURATION));
  });

  // --- sound --------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels --------------------------------------------------------

  // The stage is complete on the first frame: three empty instances, affinity
  // off, and no store, which is exactly where the scene starts.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
