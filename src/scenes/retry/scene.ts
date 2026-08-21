import gsap from 'gsap';
import { BAR_FULL, SCENE_DURATION } from './stage';
import { q, qa } from '../shared/dom';
import {
  addTrip,
  hideRequest,
  mountRequests,
  moveRequest,
  parkRequest,
  type RequestParts,
} from '../shared/request';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneModule, SceneStep } from '../types';

/**
 * Retry scene: a 24 second, four step timeline.
 *
 * Same two rules as the Circuit Breaker scene. Every tween sits at an absolute
 * position, and every discrete change is a zero-duration tween on a `data-*`
 * attribute that GSAP reverts when the playhead moves back past it, so the
 * whole timeline is safe to scrub in either direction.
 *
 * The retry node is where this scene differs: a failed attempt only travels
 * back up as far as the node, the node waits out a backoff, and then sends the
 * call down again. Only a final result continues up to the client.
 */

const ID = 'retry';

/** Horizontal axis a single request travels along. */
const X = 540;
/** Three lanes used when several clients retry at once. */
const STORM_X = [500, 540, 580];

/** Resting y of a request inside the client box. */
const Y_CLIENT = 620;
/** y of the retry node. */
const Y_RETRY = 1045;
/** y a request reaches inside the service box, above the health dot. */
const Y_SERVICE = 1630;

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 13 },
  { id: 'step-4', label: 'step-4', time: 19 },
];

/** How many request groups the stage needs. */
const REQUEST_COUNT = 17;

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const service = q<SVGGElement>(stage, '.scene-service', ID);
  const requestLayer = q<SVGGElement>(stage, '.scene-requests', ID);
  const barFill = q<SVGRectElement>(stage, '.rt-bar-fill', ID);
  const barEnd = q<SVGGElement>(stage, '.rt-bar-end', ID);
  const pills = qa<SVGGElement>(stage, '.rt-pill');
  const scaleTicks = qa<SVGTextElement>(stage, '.rt-scale');

  const requests = mountRequests(requestLayer, REQUEST_COUNT, ID);
  const tl = gsap.timeline({ paused: true });

  // --- small helpers, all writing absolute positions ---------------------

  const attr = (name: string, value: string, at: number): void => {
    tl.set(stage, { attr: { [name]: value }, immediateRender: false }, at);
  };

  const pill = (index: number, state: string, at: number): void => {
    const target = pills[index];
    if (target) tl.set(target, { attr: { 'data-attempt': state }, immediateRender: false }, at);
  };

  const resetPills = (at: number): void => {
    for (let i = 0; i < pills.length; i += 1) pill(i, 'idle', at);
  };

  /** One backoff wait: the bar fills, ticks, and clears. */
  const backoff = (from: number, duration: number, label: string): void => {
    attr('data-wait', label, from);
    tl.to(
      barFill,
      { attr: { width: BAR_FULL }, duration, ease: 'none', immediateRender: false },
      from,
    );
    tl.call(() => cue('trip'), undefined, from + duration);
    tl.set(barFill, { attr: { width: 0 }, immediateRender: false }, from + duration);
    attr('data-wait', 'none', from + duration);
  };

  /** Jitter turns on and the end of the wait wobbles twice, then settles. */
  const jitterOn = (at: number): void => {
    attr('data-jitter', 'on', at);
    tl.call(() => cue('state'), undefined, at);
    tl.to(
      barEnd,
      { x: 14, duration: 0.12, repeat: 3, yoyo: true, ease: 'sine.inOut', immediateRender: false },
      at,
    );
  };

  const shakeService = (at: number): void => {
    tl.to(service, { x: 9, duration: 0.07, repeat: 5, yoyo: true, ease: 'none' }, at);
  };

  let nextRequest = 0;
  const takeRequest = (): RequestParts | undefined => {
    const parts = requests[nextRequest];
    nextRequest += 1;
    return parts;
  };

  interface TripSpec {
    x?: number;
    from: number;
    start: number;
    down: { to: number; duration: number }[];
    result: 'ok' | 'fail';
    up: { to: number; duration: number }[];
    /** Fire a cue when the last leg lands. Omit to stay silent. */
    sound?: SceneCue;
    fade?: boolean;
  }

  /** Adds one request and returns the time its last leg finishes. */
  const trip = (spec: TripSpec): { parts: RequestParts; end: number } | undefined => {
    const parts = takeRequest();
    if (!parts) return undefined;
    parkRequest(parts, spec.x ?? X, spec.from);
    const end = addTrip(tl, parts, {
      start: spec.start,
      down: spec.down,
      result: spec.result,
      up: spec.up,
      fade: spec.fade ?? true,
    });
    if (spec.sound) {
      const sound = spec.sound;
      tl.call(() => cue(sound), undefined, end);
    }
    return { parts, end };
  };

  // --- Step 1: one transient failure, retried once -----------------------
  // The stage is complete on the first frame; nothing fades in.
  tl.addLabel('step-1', 0);

  // Attempt 1 goes all the way to the service and comes back failed.
  trip({
    from: Y_CLIENT,
    start: 0.5,
    down: [
      { to: Y_RETRY, duration: 0.5 },
      { to: Y_SERVICE, duration: 0.5 },
    ],
    result: 'fail',
    up: [{ to: Y_RETRY, duration: 0.7 }],
    sound: 'failure',
  });
  pill(0, 'active', 1.0);
  attr('data-health', 'down', 1.3);
  attr('data-health', 'ok', 2.0);
  pill(0, 'fail', 2.2);
  backoff(2.2, 1.0, '1s');

  // Attempt 2 leaves from the retry node and succeeds.
  trip({
    from: Y_RETRY,
    start: 3.2,
    down: [{ to: Y_SERVICE, duration: 0.7 }],
    result: 'ok',
    up: [
      { to: Y_RETRY, duration: 0.7 },
      { to: Y_CLIENT, duration: 0.6 },
    ],
    sound: 'success',
  });
  pill(1, 'active', 3.2);
  pill(1, 'ok', 4.6);
  resetPills(5.6);

  // --- Step 2: exponential backoff with jitter ---------------------------
  tl.addLabel('step-2', 6);
  attr('data-health', 'down', 6.0);

  trip({
    from: Y_CLIENT,
    start: 6.3,
    down: [
      { to: Y_RETRY, duration: 0.25 },
      { to: Y_SERVICE, duration: 0.25 },
    ],
    result: 'fail',
    up: [{ to: Y_RETRY, duration: 0.2 }],
    sound: 'failure',
  });
  pill(0, 'active', 6.55);
  pill(0, 'fail', 7.0);
  backoff(7.0, 0.7, '1s');

  trip({
    from: Y_RETRY,
    start: 7.7,
    down: [{ to: Y_SERVICE, duration: 0.35 }],
    result: 'fail',
    up: [{ to: Y_RETRY, duration: 0.35 }],
    sound: 'failure',
  });
  pill(1, 'active', 7.7);
  pill(1, 'fail', 8.4);
  backoff(8.4, 1.4, '2s');
  jitterOn(9.0);
  attr('data-health', 'ok', 9.5);

  trip({
    from: Y_RETRY,
    start: 9.8,
    down: [{ to: Y_SERVICE, duration: 0.7 }],
    result: 'ok',
    up: [
      { to: Y_RETRY, duration: 0.7 },
      { to: Y_CLIENT, duration: 0.6 },
    ],
    sound: 'success',
  });
  pill(2, 'active', 9.8);
  pill(2, 'ok', 11.2);

  // The doubling hint: each wait is twice the last one.
  const tickTimes = [12.2, 12.4, 12.6, 12.8];
  const tickLabels = ['1s', '2s', '4s'];
  scaleTicks.forEach((tick, index) => {
    const at = tickTimes[index] ?? 12.8;
    tl.to(tick, { opacity: 1, duration: 0.25, immediateRender: false }, at);
    tl.to(tick, { opacity: 0, duration: 0.2, immediateRender: false }, 13.0);
    const label = tickLabels[index];
    if (label) attr('data-wait', label, at);
  });

  // --- Step 3: retry storm ------------------------------------------------
  tl.addLabel('step-3', 13);
  attr('data-wait', 'none', 13.0);
  attr('data-jitter', 'off', 13.0);
  attr('data-health', 'recovering', 13.0);
  resetPills(13.0);

  // Wave one: three clients retry in lockstep and knock the service over.
  STORM_X.forEach((lane, index) => {
    trip({
      x: lane,
      from: Y_CLIENT,
      start: 13.0,
      down: [{ to: Y_SERVICE, duration: 0.8 }],
      result: 'fail',
      up: [{ to: Y_RETRY, duration: 0.7 }],
      // One thud for the wave, not three copies of the same tone.
      sound: index === 0 ? 'failure' : undefined,
    });
  });
  attr('data-health', 'down', 13.8);
  shakeService(13.8);
  backoff(14.5, 0.8, '1s');
  attr('data-health', 'recovering', 15.0);

  // Wave two: still in lockstep, so the service goes down again.
  STORM_X.forEach((lane, index) => {
    trip({
      x: lane,
      from: Y_RETRY,
      start: 15.3,
      down: [{ to: Y_SERVICE, duration: 0.8 }],
      result: 'fail',
      up: [{ to: Y_RETRY, duration: 0.7 }],
      sound: index === 0 ? 'failure' : undefined,
    });
  });
  attr('data-health', 'down', 16.1);
  shakeService(16.1);

  // Jitter spreads the third wave out and the service stays up.
  jitterOn(17.0);
  attr('data-health', 'recovering', 17.0);
  const staggered = [17.2, 17.55, 17.9];
  STORM_X.forEach((lane, index) => {
    trip({
      x: lane,
      from: Y_RETRY,
      start: staggered[index] ?? 17.2,
      down: [{ to: Y_SERVICE, duration: 0.5 }],
      result: 'ok',
      up: [{ to: Y_CLIENT, duration: 0.55 }],
      sound: 'success',
    });
  });
  attr('data-health', 'ok', 18.2);

  // --- Step 4: the budget runs out ---------------------------------------
  tl.addLabel('step-4', 19);
  attr('data-jitter', 'off', 19.0);
  attr('data-health', 'down', 19.0);
  resetPills(19.0);

  trip({
    from: Y_CLIENT,
    start: 19.2,
    down: [
      { to: Y_RETRY, duration: 0.25 },
      { to: Y_SERVICE, duration: 0.25 },
    ],
    result: 'fail',
    up: [{ to: Y_RETRY, duration: 0.2 }],
    sound: 'failure',
  });
  pill(0, 'active', 19.45);
  pill(0, 'fail', 19.9);
  backoff(19.9, 0.6, '1s');

  trip({
    from: Y_RETRY,
    start: 20.5,
    down: [{ to: Y_SERVICE, duration: 0.35 }],
    result: 'fail',
    up: [{ to: Y_RETRY, duration: 0.35 }],
    sound: 'failure',
  });
  pill(1, 'active', 20.5);
  pill(1, 'fail', 21.2);
  backoff(21.2, 0.8, '2s');

  // The last attempt fails too, so the call gives up and fails fast.
  const last = trip({
    from: Y_RETRY,
    start: 22.0,
    down: [{ to: Y_SERVICE, duration: 0.35 }],
    result: 'fail',
    up: [{ to: Y_RETRY, duration: 0.35 }],
    sound: 'failure',
    fade: false,
  });
  pill(2, 'active', 22.0);
  pill(2, 'fail', 22.7);
  attr('data-budget', 'on', 22.9);

  if (last) {
    moveRequest(tl, last.parts, Y_CLIENT, 0.6, 23.0);
    hideRequest(tl, last.parts, 23.6);
  }

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
