import gsap from 'gsap';
import { SCENE_DURATION, TIMER_CIRCUMFERENCE } from './stage';
import { q } from '../shared/dom';
import {
  addTrip,
  haloRequest,
  hideRequest,
  markRequest,
  mountRequests,
  moveRequest,
  parkRequest,
  showRequest,
  type RequestParts,
} from '../shared/request';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneModule, SceneStep } from '../types';

/**
 * Circuit Breaker scene: a 24 second, four step timeline.
 *
 * Two rules keep the timeline safe to scrub:
 *
 * 1. Every tween is placed at an absolute position. Nothing is sequenced
 *    relative to what came before, so seeking to any time renders the correct
 *    frame.
 * 2. State changes never run through `onComplete`. Discrete changes are
 *    zero-duration tweens on `data-*` attributes, which GSAP reverts when the
 *    playhead moves back past them. Colours then come from CSS rules keyed on
 *    those attributes, so both themes stay correct.
 */

const ID = 'circuit-breaker';

/** Horizontal axis every request travels along. */
const X = 540;
/** Resting y of a request inside the client box. */
const Y_CLIENT = 620;
/** y of the breaker switch. */
const Y_BREAKER = 1045;
/** y a request reaches inside the service box, above the health dot. */
const Y_SERVICE = 1630;

/** Meter width in user units for a given failure rate. */
const METER_FULL = 400;
const meterWidth = (ratio: number): number => METER_FULL * ratio;

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 7 },
  { id: 'step-3', label: 'step-3', time: 14 },
  { id: 'step-4', label: 'step-4', time: 19 },
];

type RequestKind = 'success' | 'failure' | 'fastfail' | 'trial';

interface RequestSpec {
  /** Departure time from the client. */
  at: number;
  kind: RequestKind;
}

/**
 * Every request in the scene, in departure order. Each one gets its own group,
 * so nothing has to be recycled and every tween can sit at an absolute time.
 */
const REQUESTS: RequestSpec[] = [
  // Step 1, healthy traffic: four requests, 0.6s apart.
  { at: 0.8, kind: 'success' },
  { at: 1.4, kind: 'success' },
  { at: 2.0, kind: 'success' },
  { at: 2.6, kind: 'success' },
  // Step 1, the service starts failing: four requests, 0.7s apart.
  { at: 3.8, kind: 'failure' },
  { at: 4.5, kind: 'failure' },
  { at: 5.2, kind: 'failure' },
  { at: 5.9, kind: 'failure' },
  // Step 2, the breaker is open: six requests rejected at the breaker.
  { at: 7.4, kind: 'fastfail' },
  { at: 8.1, kind: 'fastfail' },
  { at: 8.8, kind: 'fastfail' },
  { at: 9.5, kind: 'fastfail' },
  { at: 10.2, kind: 'fastfail' },
  { at: 10.9, kind: 'fastfail' },
  // Step 3, half-open: one trial call plus two that are still rejected.
  { at: 14.4, kind: 'trial' },
  { at: 15.0, kind: 'fastfail' },
  { at: 15.6, kind: 'fastfail' },
  // Step 4, closed again: five requests, 0.6s apart.
  { at: 19.5, kind: 'success' },
  { at: 20.1, kind: 'success' },
  { at: 20.7, kind: 'success' },
  { at: 21.3, kind: 'success' },
  { at: 21.9, kind: 'success' },
];

/** Adds one request as a set of absolutely positioned tweens. */
function addRequest(
  tl: gsap.core.Timeline,
  parts: RequestParts,
  spec: RequestSpec,
  cue: (name: SceneCue) => void,
): void {
  parkRequest(parts, X, Y_CLIENT);

  const t = spec.at;

  if (spec.kind === 'success' || spec.kind === 'failure' || spec.kind === 'trial') {
    // Reaches the breaker, continues to the service, and comes back with a result.
    const toBreaker = spec.kind === 'failure' ? 0.55 : 0.5;
    const toService = spec.kind === 'trial' ? 0.6 : toBreaker;
    const dwell = spec.kind === 'trial' ? 0.4 : 0;
    const back = spec.kind === 'failure' ? 0.5 : 0.4;
    const result = spec.kind === 'failure' ? 'fail' : 'ok';
    const sound: SceneCue = spec.kind === 'failure' ? 'failure' : 'success';

    const home = addTrip(tl, parts, {
      start: t,
      down: [
        { to: Y_BREAKER, duration: toBreaker },
        { to: Y_SERVICE, duration: toService },
      ],
      result,
      dwell,
      up: [{ to: Y_CLIENT, duration: back }],
    });

    if (spec.kind === 'trial') haloRequest(tl, parts, t, home);
    tl.call(() => cue(sound), undefined, home);
    return;
  }

  // Rejected at the breaker: it never reaches the service.
  const atBreaker = t + 0.4;
  const bounce = atBreaker + 0.3;
  const home = bounce + 0.4;

  showRequest(tl, parts, t);
  moveRequest(tl, parts, Y_BREAKER, 0.4, t);
  markRequest(tl, parts, 'fail', atBreaker, 0.5);
  tl.call(() => cue('failure'), undefined, atBreaker);
  moveRequest(tl, parts, Y_CLIENT, 0.4, bounce, 'power1.in');
  hideRequest(tl, parts, home);
}

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const arm = q<SVGLineElement>(stage, '.cb-arm', ID);
  const badgeGlow = q<SVGRectElement>(stage, '.cb-badge-glow', ID);
  const timer = q<SVGGElement>(stage, '.cb-timer', ID);
  const timerProgress = q<SVGCircleElement>(stage, '.cb-timer-progress', ID);
  const meterFill = q<SVGRectElement>(stage, '.cb-meter-fill', ID);
  const service = q<SVGGElement>(stage, '.scene-service', ID);
  const health = q<SVGCircleElement>(stage, '.scene-health', ID);
  const requestLayer = q<SVGGElement>(stage, '.scene-requests', ID);

  const requests = mountRequests(requestLayer, REQUESTS.length, ID);

  const tl = gsap.timeline({ paused: true });

  // --- Step 1: closed, then the service starts failing -------------------
  // The stage is drawn in full from the very first frame. Nothing fades the
  // boxes, connectors, switch, badge, or meter in, because the player opens
  // paused at time 0 and that frame is the reader's first look at the diagram.
  tl.addLabel('step-1', 0);

  // The service goes down.
  tl.set(stage, { attr: { 'data-health': 'down' }, immediateRender: false }, 3.8);
  tl.to(service, { x: 9, duration: 0.07, repeat: 5, yoyo: true, ease: 'none' }, 3.8);

  // Failures come back and push the meter past the 50% threshold tick.
  const meterSteps: { at: number; ratio: number; level: string }[] = [
    { at: 5.4, ratio: 0.25, level: '1' },
    { at: 6.1, ratio: 0.5, level: '2' },
    { at: 6.8, ratio: 0.75, level: '3' },
  ];
  for (const step of meterSteps) {
    tl.set(stage, { attr: { 'data-meter': step.level }, immediateRender: false }, step.at);
    tl.to(meterFill, {
      attr: { width: meterWidth(step.ratio) },
      duration: 0.3,
      ease: 'power2.out',
      immediateRender: false,
    }, step.at);
  }

  // --- Step 2: the breaker trips open ------------------------------------
  tl.addLabel('step-2', 7);
  tl.set(stage, { attr: { 'data-state': 'open' }, immediateRender: false }, 7);
  tl.call(() => cue('trip'), undefined, 7);
  tl.to(arm, { rotation: 34, svgOrigin: '540 990', duration: 0.26, ease: 'back.out(3)' }, 7);
  tl.to(arm, { rotation: 30, svgOrigin: '540 990', duration: 0.22, ease: 'power2.out' }, 7.26);

  // The break duration ring fills once while calls fail fast.
  tl.to(timer, { opacity: 1, duration: 0.3, immediateRender: false }, 7.2);
  tl.fromTo(
    timerProgress,
    { attr: { 'stroke-dashoffset': TIMER_CIRCUMFERENCE } },
    { attr: { 'stroke-dashoffset': 0 }, duration: 6.6, ease: 'none', immediateRender: false },
    7.4,
  );
  tl.to(timer, { opacity: 0, duration: 0.3, immediateRender: false }, 14);

  // The service starts recovering while it is shielded.
  tl.set(stage, { attr: { 'data-health': 'recovering' }, immediateRender: false }, 10);
  tl.to(health, {
    scale: 1.25,
    transformOrigin: '50% 50%',
    duration: 0.5,
    repeat: 7,
    yoyo: true,
    ease: 'sine.inOut',
    immediateRender: false,
  }, 10);

  // --- Step 3: half-open, one trial call ---------------------------------
  tl.addLabel('step-3', 14);
  tl.set(stage, { attr: { 'data-state': 'half', 'data-health': 'ok' }, immediateRender: false }, 14);
  tl.call(() => cue('state'), undefined, 14);
  tl.to(arm, { rotation: 0, svgOrigin: '540 990', duration: 0.4, ease: 'power2.inOut' }, 14);

  // The badge flashes when the trial call comes back successfully.
  tl.fromTo(
    badgeGlow,
    { opacity: 0 },
    { opacity: 0.55, duration: 0.18, yoyo: true, repeat: 1, ease: 'sine.out', immediateRender: false },
    16.4,
  );

  // --- Step 4: closed again ----------------------------------------------
  tl.addLabel('step-4', 19);
  tl.set(stage, { attr: { 'data-state': 'closed', 'data-meter': '0' }, immediateRender: false }, 19);
  tl.call(() => cue('trip'), undefined, 19);
  tl.to(meterFill, {
    attr: { width: 0 },
    duration: 0.45,
    ease: 'power2.inOut',
    immediateRender: false,
  }, 19);

  // --- Requests -----------------------------------------------------------
  REQUESTS.forEach((spec, index) => {
    const parts = requests[index];
    if (parts) addRequest(tl, parts, spec, cue);
  });

  // Pin the total length so the scrub bar covers the closing hold.
  tl.to({}, { duration: 0.01 }, SCENE_DURATION - 0.01);

  // Render the whole timeline once in each direction so every zero-duration
  // tween records its start value. Without this, scrubbing backwards before a
  // state change has ever played forward would leave the wrong state behind.
  tl.progress(1, true).progress(0, true).pause();

  return { tl, steps: STEPS };
}

const scene: SceneModule = {
  id: ID,
  duration: SCENE_DURATION,
  build,
};

export default scene;
