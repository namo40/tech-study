import gsap from 'gsap';
import {
  COMPARTMENT_SIZE,
  LANE_X,
  SCENE_DURATION,
  SLOT_COUNT,
  TIMEOUT_CIRCUMFERENCE,
} from './stage';
import { q, qa } from '../shared/dom';
import {
  hideRequest,
  markRequest,
  mountRequests,
  moveRequest,
  parkRequest,
  showRequest,
} from '../shared/request';
import type { SceneBuildOptions, SceneInstance, SceneModule, SceneStep } from '../types';

/**
 * Bulkhead scene: a 24 second, four step timeline.
 *
 * Same two rules as the other scenes: every tween sits at an absolute position,
 * and every discrete change is a zero-duration tween on a `data-*` attribute
 * that GSAP reverts when the playhead moves back past it.
 *
 * Slot occupancy is not authored. A small simulation below plays each request's
 * arrival at the slot row against the pool, taking the lowest free slot in the
 * compartment the wall allows, and everything the viewer sees comes out of its
 * result: which request holds which slot, when a held slot turns `stuck`, which
 * requests find no slot at all, and what the in-flight count is at any moment.
 */

const ID = 'bulkhead';

type Lane = 'a' | 'b';
type SlotState = 'free' | 'busy' | 'stuck' | 'timeout';
type ReleaseReason = 'return' | 'timeout' | 'cut';

/** Resting y of a request inside the client box. */
const Y_CLIENT = 620;
/** y of the slot row. */
const Y_NODE = 1046;
/** y a request reaches inside its service box, above the health dot. */
const Y_SERVICE = 1630;

/** Travel times, in seconds. */
const TO_NODE = 0.5;
/** How long a request rests on the slot row while it takes a slot. */
const SLOT_PAUSE = 0.15;
const TO_SERVICE = 0.4;
const FROM_SERVICE = 0.5;
const NODE_TO_CLIENT = 0.4;
const REJECT_BACK = 0.4;

/** A held slot reads as stuck once the call has been out this long. */
const STUCK_AFTER = 1.5;
/** When the wall drops and the pool becomes two compartments. */
const WALL_AT = 13;
/** When the timeout on the stuck compartment completes. */
const TIMEOUT_AT = 20.5;
/** How long a freed slot shows the dashed timeout outline. */
const TIMEOUT_FLASH = 0.3;

/** A granted request gives its slot back as it passes the node on the way up. */
const RELEASE_AFTER = TO_NODE + SLOT_PAUSE + TO_SERVICE + FROM_SERVICE;

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: WALL_AT },
  { id: 'step-4', label: 'step-4', time: 19 },
];

interface RequestPlan {
  /** Departure from the client. */
  start: number;
  lane: Lane;
  /** The dependency never answers, so the slot stays held. */
  hangs?: boolean;
  /** When a held call is cut loose, and why. */
  endsAt?: number;
  endReason?: Exclude<ReleaseReason, 'return'>;
}

const round = (value: number): number => Number(value.toFixed(3));

const plan = (start: number, lane: Lane, extra: Partial<RequestPlan> = {}): RequestPlan => ({
  start,
  lane,
  ...extra,
});

const REQUESTS: RequestPlan[] = [
  // Step 1: A and B alternate through one shared pool, two or three at a time.
  ...[0.4, 1.3, 2.2, 3.1, 4.0].map((start) => plan(start, 'a')),
  ...[0.7, 1.6, 2.5, 3.4, 4.3].map((start) => plan(start, 'b')),
  // Step 2: B goes slow and its calls never come back, taking every slot.
  ...[6.2, 6.6, 7.0, 7.4, 7.8, 8.2].map((start) =>
    plan(start, 'b', { hangs: true, endsAt: WALL_AT, endReason: 'cut' }),
  ),
  // Step 2: healthy A calls arrive to find nowhere to go.
  ...[9.0, 9.8, 10.6, 11.4].map((start) => plan(start, 'a')),
  // Step 3: B fills its own compartment and hangs there.
  ...[13.3, 13.8, 14.3].map((start) =>
    plan(start, 'b', { hangs: true, endsAt: TIMEOUT_AT, endReason: 'timeout' }),
  ),
  // Step 3: two more B calls fail fast against a full compartment.
  ...[14.8, 15.4].map((start) => plan(start, 'b')),
  // Step 3: A keeps flowing through its own compartment.
  ...[13.6, 14.4, 15.2, 16.0, 16.8].map((start) => plan(start, 'a')),
  // Step 4: the timeout frees B, and both sides run normally again.
  ...[20.4, 21.0, 21.6].map((start) => plan(start, 'a')),
  plan(21.4, 'b'),
];

interface SimEvent {
  at: number;
  kind: 'release' | 'acquire';
  index: number;
  reason: ReleaseReason;
}

interface SlotChange {
  at: number;
  slot: number;
  state: SlotState;
}

interface Simulation {
  /** Slot index each request holds, or -1 when it found none. */
  slotOf: number[];
  /** Slot state changes, in time order. */
  slots: SlotChange[];
  /** In-flight count changes, as `[time, count]`. */
  inflight: [number, number][];
  /** Arrival times of requests that were turned away. */
  rejectedAt: number[];
}

/**
 * Plays arrivals against the pool. At equal times a release lands before an
 * acquire, so a slot freed at that instant is available to take.
 */
function simulate(requests: RequestPlan[]): Simulation {
  const events: SimEvent[] = [];

  requests.forEach((request, index) => {
    events.push({ at: round(request.start + TO_NODE), kind: 'acquire', index, reason: 'return' });
    if (request.hangs) {
      if (request.endsAt !== undefined) {
        events.push({
          at: request.endsAt,
          kind: 'release',
          index,
          reason: request.endReason ?? 'cut',
        });
      }
      return;
    }
    events.push({
      at: round(request.start + RELEASE_AFTER),
      kind: 'release',
      index,
      reason: 'return',
    });
  });

  events.sort((left, right) => {
    if (left.at !== right.at) return left.at - right.at;
    if (left.kind === right.kind) return left.index - right.index;
    return left.kind === 'release' ? -1 : 1;
  });

  const held: (number | null)[] = Array.from({ length: SLOT_COUNT }, () => null);
  const slotOf: number[] = requests.map(() => -1);
  const acquiredAt: number[] = requests.map(() => -1);
  const slots: SlotChange[] = [];
  const inflight: [number, number][] = [];
  const rejectedAt: number[] = [];

  /*
   * Two changes at one instant would render in insertion order going forwards
   * and in reverse going backwards, so that single frame would depend on which
   * way the reader scrubbed. Collapse them to the value that ends up applying.
   */
  const recordSlot = (at: number, slot: number, state: SlotState): void => {
    const previous = slots[slots.length - 1];
    if (previous && previous.at === at && previous.slot === slot) previous.state = state;
    else slots.push({ at, slot, state });
  };
  const recordInflight = (at: number): void => {
    const count = held.filter((value) => value !== null).length;
    const previous = inflight[inflight.length - 1];
    if (previous && previous[0] === at) previous[1] = count;
    else inflight.push([at, count]);
  };

  for (const event of events) {
    const request = requests[event.index];
    if (!request) continue;

    if (event.kind === 'release') {
      const slot = slotOf[event.index] ?? -1;
      if (slot < 0) continue;
      held[slot] = null;
      if (event.reason === 'timeout') {
        recordSlot(event.at, slot, 'timeout');
        recordSlot(round(event.at + TIMEOUT_FLASH), slot, 'free');
      } else {
        recordSlot(event.at, slot, 'free');
      }
      recordInflight(event.at);
      continue;
    }

    // Before the wall the whole pool is fair game; after it, only one half.
    const first = event.at < WALL_AT ? 0 : request.lane === 'a' ? 0 : COMPARTMENT_SIZE;
    const last = event.at < WALL_AT ? SLOT_COUNT : first + COMPARTMENT_SIZE;
    let chosen = -1;
    for (let slot = first; slot < last; slot += 1) {
      if (held[slot] === null) {
        chosen = slot;
        break;
      }
    }

    if (chosen < 0) {
      rejectedAt.push(event.at);
      continue;
    }

    held[chosen] = event.index;
    slotOf[event.index] = chosen;
    acquiredAt[event.index] = event.at;
    recordSlot(event.at, chosen, 'busy');
    recordInflight(event.at);
  }

  // A slot that is still held after a while reads as stuck rather than busy.
  requests.forEach((request, index) => {
    const slot = slotOf[index];
    const from = acquiredAt[index];
    if (slot === undefined || slot < 0 || from < 0) return;
    const until = request.hangs ? (request.endsAt ?? SCENE_DURATION) : round(request.start + RELEASE_AFTER);
    // Strictly greater, so a release that lands exactly on the mark wins.
    if (until - from <= STUCK_AFTER) return;
    recordSlot(round(from + STUCK_AFTER), slot, 'stuck');
  });

  slots.sort((left, right) => left.at - right.at || left.slot - right.slot);
  return { slotOf, slots, inflight, rejectedAt };
}

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const wall = q<SVGRectElement>(stage, '.bh-wall', ID);
  const highlight = q<SVGRectElement>(stage, '.bh-highlight', ID);
  const requestLayer = q<SVGGElement>(stage, '.scene-requests', ID);
  const slotEls = qa<SVGRectElement>(stage, '.bh-slot');
  const timerEls = qa<SVGGElement>(stage, '.bh-timer');
  const timerProgress = qa<SVGCircleElement>(stage, '.bh-timer-progress');
  const healthB = qa<SVGCircleElement>(stage, '.scene-service--b [data-health-state]');

  const sim = simulate(REQUESTS);
  const requests = mountRequests(requestLayer, REQUESTS.length, ID);

  const tl = gsap.timeline({ paused: true });

  const attr = (name: string, value: string, at: number): void => {
    tl.set(stage, { attr: { [name]: value }, immediateRender: false }, at);
  };

  const setHealth = (dots: SVGCircleElement[], value: string, at: number): void => {
    for (const dot of dots) {
      tl.set(dot, { attr: { 'data-health-state': value }, immediateRender: false }, at);
    }
  };

  // --- slot occupancy and the in-flight count, straight from the simulation

  for (const change of sim.slots) {
    const element = slotEls[change.slot];
    if (!element) continue;
    tl.set(element, { attr: { 'data-slot-state': change.state }, immediateRender: false }, change.at);
  }
  for (const [at, count] of sim.inflight) {
    attr('data-inflight', String(count), at);
  }

  // --- requests, granted or turned away as the simulation decided ---------

  REQUESTS.forEach((request, index) => {
    const parts = requests[index];
    if (!parts) return;
    const lane = LANE_X[request.lane];
    parkRequest(parts, lane, Y_CLIENT);

    const t = request.start;
    const atNode = round(t + TO_NODE);
    showRequest(tl, parts, t);
    moveRequest(tl, parts, Y_NODE, TO_NODE, t);

    if (sim.slotOf[index] === -1) {
      // No slot anywhere it is allowed to look: fail fast from the slot row.
      markRequest(tl, parts, 'fail', atNode, 0.5);
      moveRequest(tl, parts, Y_CLIENT, REJECT_BACK, atNode, 'power1.in');
      tl.call(() => cue('failure'), undefined, atNode);
      hideRequest(tl, parts, round(atNode + REJECT_BACK));
      return;
    }

    const atService = round(atNode + SLOT_PAUSE + TO_SERVICE);
    moveRequest(tl, parts, Y_SERVICE, TO_SERVICE, round(atNode + SLOT_PAUSE));

    if (!request.hangs) {
      const backAtNode = round(atService + FROM_SERVICE);
      const home = round(backAtNode + NODE_TO_CLIENT);
      markRequest(tl, parts, 'ok', atService);
      moveRequest(tl, parts, Y_NODE, FROM_SERVICE, atService);
      moveRequest(tl, parts, Y_CLIENT, NODE_TO_CLIENT, backAtNode);
      tl.call(() => cue('success'), undefined, home);
      hideRequest(tl, parts, home);
      return;
    }

    // A call that never answers sits at the service until something cuts it.
    const endsAt = request.endsAt ?? SCENE_DURATION;
    if (request.endReason === 'timeout') {
      const backAtNode = round(endsAt + FROM_SERVICE);
      const home = round(backAtNode + NODE_TO_CLIENT);
      markRequest(tl, parts, 'fail', endsAt);
      moveRequest(tl, parts, Y_NODE, FROM_SERVICE, endsAt);
      moveRequest(tl, parts, Y_CLIENT, NODE_TO_CLIENT, backAtNode);
      hideRequest(tl, parts, home);
      return;
    }
    hideRequest(tl, parts, endsAt, 0.3);
  });

  // One thud for the whole batch of timed-out calls, not one per slot.
  tl.call(() => cue('failure'), undefined, round(TIMEOUT_AT + FROM_SERVICE + NODE_TO_CLIENT));

  // --- `B full` flashes, only once there is a compartment to fill ---------

  for (const at of sim.rejectedAt) {
    if (at < WALL_AT) continue;
    attr('data-bfull', 'on', at);
    attr('data-bfull', 'off', round(at + 0.3));
  }

  // --- set pieces ----------------------------------------------------------

  // The stage is complete on the first frame: six free slots, both sides green.
  tl.addLabel('step-1', 0);

  tl.addLabel('step-2', 6);
  setHealth(healthB, 'down', 6);
  // Healthy A is blocked by a pool it does not even use.
  tl.fromTo(
    highlight,
    { opacity: 0 },
    { opacity: 0.9, duration: 0.25, repeat: 3, yoyo: true, ease: 'sine.inOut', immediateRender: false },
    11.8,
  );

  tl.addLabel('step-3', WALL_AT);
  attr('data-wall', 'on', WALL_AT);
  tl.call(() => cue('state'), undefined, WALL_AT);
  tl.fromTo(
    wall,
    { scaleY: 0 },
    { scaleY: 1, svgOrigin: '540 960', duration: 0.4, ease: 'power2.out', immediateRender: false },
    WALL_AT,
  );

  tl.addLabel('step-4', 19);
  attr('data-timeout', 'on', 19);
  for (const timer of timerEls) {
    tl.to(timer, { opacity: 1, duration: 0.2, immediateRender: false }, 19);
    tl.to(timer, { opacity: 0, duration: 0.2, immediateRender: false }, round(TIMEOUT_AT + TIMEOUT_FLASH));
  }
  for (const progress of timerProgress) {
    tl.fromTo(
      progress,
      { attr: { 'stroke-dashoffset': TIMEOUT_CIRCUMFERENCE } },
      { attr: { 'stroke-dashoffset': 0 }, duration: TIMEOUT_AT - 19, ease: 'none', immediateRender: false },
      19,
    );
  }
  tl.call(() => cue('trip'), undefined, TIMEOUT_AT);
  attr('data-timeout', 'off', round(TIMEOUT_AT + TIMEOUT_FLASH));

  setHealth(healthB, 'recovering', 21);
  setHealth(healthB, 'ok', 22.5);

  // Pin the total length so the scrub bar covers the closing hold.
  tl.to({}, { duration: 0.01 }, SCENE_DURATION - 0.01);

  // Render once in each direction so every zero-duration tween records its
  // start value before a reader can scrub backwards past it.
  tl.progress(1, true).progress(0, true).pause();

  return { tl, steps: STEPS };
}

const scene: SceneModule = {
  id: ID,
  duration: SCENE_DURATION,
  build,
};

export default scene;
