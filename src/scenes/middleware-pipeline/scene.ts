import gsap from 'gsap';
import { LAYER_Y, SCENE_DURATION, SWAP_DISTANCE, Y_CLIENT, Y_ENDPOINT } from './stage';
import { q, qa } from '../shared/dom';
import {
  attachToRequest,
  hideRequest,
  markRequest,
  mountRequests,
  moveRequest,
  parkRequest,
  showRequest,
} from '../shared/request';
import { fadeAt, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneInstance, SceneStep } from '../types';

/**
 * Middleware Pipeline scene: a 24 second, four step timeline.
 *
 * Same two rules as the other scenes: every tween sits at an absolute position,
 * and every discrete change is a zero-duration tween on a `data-*` attribute
 * that GSAP reverts when the playhead moves back past it.
 *
 * The traversal is simulated rather than drawn. A request knows only which
 * middleware would turn it away; the simulation walks the stack in the order
 * the layers are actually in at that moment and finds the first one that does.
 * That is what makes step 4 work: the same request meets a different middleware
 * first once two of them trade places, and the outcome changes with it.
 */

const ID = 'middleware-pipeline';

/** The lane every request travels along. */
const X = 540;

/** Client box to the first layer, and back. */
const EDGE = 0.4;
/** One layer to the next, and the last layer to the endpoint. */
const HOP = 0.25;
/** How long a layer stays lit as something passes through it. */
const PASS_HOLD = 0.3;
/** How long a layer stays lit when it ends the chain. */
const STOP_HOLD = 0.4;
/** How long the endpoint holds a request that it answers. */
const ENDPOINT_DWELL = 0.5;

/** Two layers trade places here. */
const SWAP_AT = 20;
const SWAP_DURATION = 0.6;
const SWAP_END = SWAP_AT + SWAP_DURATION;

/** Layer identities, by registration order. */
const EXCEPTION = 0;
const STATIC = 1;
const AUTH = 3;
const RATELIMIT = 4;

/** Which layer sits at which position, before and after the swap. */
const ORDER_A = [0, 1, 2, 3, 4];
const ORDER_B = [0, 1, 2, 4, 3];

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

type Kind = 'normal' | 'anon' | 'file';
type LayerState = 'idle' | 'in' | 'out' | 'ok' | 'stop' | 'error' | 'handled';

interface RequestPlan {
  start: number;
  kind: Kind;
  /** Middleware that would answer this request itself, by layer identity. */
  blocks: { layer: number; code: string; ok?: boolean }[];
  /** The endpoint throws instead of answering. */
  throws?: boolean;
}

const REQUESTS: RequestPlan[] = [
  // Step 1: all the way down and all the way back.
  { start: 0.5, kind: 'normal', blocks: [] },
  // Step 2: authentication answers 401 without calling the next one.
  { start: 6.3, kind: 'anon', blocks: [{ layer: AUTH, code: '401' }] },
  // Step 2: static files answers the file itself.
  { start: 9.3, kind: 'file', blocks: [{ layer: STATIC, code: '200', ok: true }] },
  // Step 3: the endpoint throws and the exception climbs back out.
  { start: 12.3, kind: 'normal', blocks: [], throws: true },
  // Step 4: three anonymous requests pay for authentication before being told no.
  ...[18.2, 18.35, 18.5].map((start) => ({
    start,
    kind: 'anon' as const,
    blocks: [{ layer: AUTH, code: '401' }],
  })),
  // Step 4, after the swap: two are still authenticated away, two are rate limited.
  ...[20.65, 20.8].map((start) => ({
    start,
    kind: 'anon' as const,
    blocks: [{ layer: AUTH, code: '401' }],
  })),
  ...[20.95, 21.1].map((start) => ({
    start,
    kind: 'anon' as const,
    blocks: [
      { layer: AUTH, code: '401' },
      { layer: RATELIMIT, code: '429' },
    ],
  })),
];

/** Which layer occupies a position at a given moment. */
const layerAt = (position: number, at: number): number =>
  (at < SWAP_END ? ORDER_A : ORDER_B)[position] ?? position;

interface Hold {
  target: number;
  from: number;
  to: number;
  state: LayerState;
}

interface Waypoint {
  at: number;
  y: number;
  duration: number;
}

interface Journey {
  moves: Waypoint[];
  /** When the result marker appears, what it is, and the code it carries. */
  markAt: number;
  markOk: boolean;
  code: string;
  /** The exception leg, when the endpoint throws. */
  diamondFrom?: number;
  diamondTo?: number;
  homeAt: number;
}

interface Simulation {
  journeys: Journey[];
  layers: { at: number; layer: number; state: LayerState }[];
  endpoint: [number, string][];
  /** When the exception leaves the endpoint, for the cue. */
  throwAt?: number;
}

/** Higher wins when two things light the same layer at once. */
const PRIORITY: Record<LayerState, number> = {
  idle: 0,
  in: 1,
  out: 2,
  ok: 3,
  stop: 3,
  error: 4,
  handled: 5,
};

/**
 * Walks each request down the stack as it stands at that moment, finds the
 * first middleware that would answer it, and records what every layer shows.
 */
function simulate(): Simulation {
  const journeys: Journey[] = [];
  const holds: Hold[] = [];
  const endpointHolds: Hold[] = [];
  let throwAt: number | undefined;

  const light = (layer: number, from: number, state: LayerState, hold: number): void => {
    holds.push({ target: layer, from: round(from), to: round(from + hold), state });
  };

  for (const plan of REQUESTS) {
    const moves: Waypoint[] = [];
    const downAt = (position: number): number => round(plan.start + EDGE + position * HOP);

    // Walk down until a middleware answers, or the endpoint is reached.
    let stopPosition = -1;
    let code = '200';
    let ok = true;
    for (let position = 0; position < LAYER_Y.length; position += 1) {
      const at = downAt(position);
      const layer = layerAt(position, at);
      const block = plan.blocks.find((entry) => entry.layer === layer);
      moves.push({ at: round(at - (position === 0 ? EDGE : HOP)), y: LAYER_Y[position] ?? 0, duration: position === 0 ? EDGE : HOP });
      if (block) {
        stopPosition = position;
        code = block.code;
        ok = block.ok === true;
        light(layer, at, ok ? 'ok' : 'stop', STOP_HOLD);
        break;
      }
      light(layer, at, 'in', PASS_HOLD);
    }

    let turnAt: number;
    let climbFrom: number;
    const journey: Journey = { moves, markAt: 0, markOk: true, code, homeAt: 0 };

    if (stopPosition >= 0) {
      turnAt = downAt(stopPosition);
      climbFrom = stopPosition - 1;
      journey.markAt = turnAt;
      journey.markOk = ok;
    } else {
      // Nothing stopped it, so it reaches the endpoint.
      const atEndpoint = round(plan.start + EDGE + LAYER_Y.length * HOP);
      moves.push({ at: round(atEndpoint - HOP), y: Y_ENDPOINT, duration: HOP });
      if (plan.throws) {
        endpointHolds.push({ target: 0, from: atEndpoint, to: round(atEndpoint + 0.5), state: 'stop' });
        throwAt = atEndpoint;
        journey.diamondFrom = atEndpoint;
        turnAt = atEndpoint;
      } else {
        endpointHolds.push({ target: 0, from: atEndpoint, to: round(atEndpoint + ENDPOINT_DWELL), state: 'ok' });
        turnAt = round(atEndpoint + ENDPOINT_DWELL);
        journey.markAt = turnAt;
        journey.markOk = true;
      }
      climbFrom = LAYER_Y.length - 1;
    }

    // Climb back out through the same positions, in reverse.
    let at = turnAt;
    for (let position = climbFrom; position >= 0; position -= 1) {
      at = round(at + HOP);
      const layer = layerAt(position, at);
      moves.push({ at: round(at - HOP), y: LAYER_Y[position] ?? 0, duration: HOP });
      if (plan.throws) {
        // The outermost middleware is the one that can turn it into a 500.
        if (layer === EXCEPTION) {
          light(layer, at, 'handled', STOP_HOLD);
          journey.diamondTo = at;
          journey.markAt = at;
          journey.markOk = false;
          journey.code = '500';
          at = round(at + STOP_HOLD);
        } else {
          light(layer, at, 'error', PASS_HOLD);
        }
      } else {
        light(layer, at, 'out', PASS_HOLD);
      }
    }

    const homeAt = round(at + EDGE);
    moves.push({ at, y: Y_CLIENT, duration: EDGE });
    journey.homeAt = homeAt;
    journeys.push(journey);
  }

  /** Turns overlapping holds into one state per target over time. */
  const flatten = (all: Hold[], targets: number): { at: number; layer: number; state: LayerState }[] => {
    const out: { at: number; layer: number; state: LayerState }[] = [];
    for (let target = 0; target < targets; target += 1) {
      const mine = all.filter((hold) => hold.target === target);
      const marks = Array.from(new Set(mine.flatMap((hold) => [hold.from, hold.to]))).sort(
        (a, b) => a - b,
      );
      let shown: LayerState = 'idle';
      for (const at of marks) {
        let best: LayerState = 'idle';
        for (const hold of mine) {
          if (hold.from <= at && at < hold.to && PRIORITY[hold.state] > PRIORITY[best]) {
            best = hold.state;
          }
        }
        if (best !== shown) {
          shown = best;
          out.push({ at, layer: target, state: best });
        }
      }
    }
    return out.sort((a, b) => a.at - b.at || a.layer - b.layer);
  };

  const layers = flatten(holds, LAYER_Y.length);
  const endpoint = flatten(endpointHolds, 1).map(
    (change) => [change.at, change.state === 'ok' ? 'hit' : change.state === 'stop' ? 'throw' : 'idle'] as [number, string],
  );

  return { journeys, layers, endpoint, throwAt };
}

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const layerEls = qa<SVGGElement>(stage, '.mw-layer');
  const endpointEl = q<SVGGElement>(stage, '.mw-endpoint', ID);
  const requestLayer = q<SVGGElement>(stage, '.scene-requests', ID);

  const sim = simulate();
  const requests = mountRequests(requestLayer, REQUESTS.length, ID);

  const tl = createSceneTimeline();

  // --- layer and endpoint state, straight from the simulation -------------

  for (const change of sim.layers) {
    const element = layerEls[change.layer];
    if (!element) continue;
    tl.set(element, { attr: { 'data-layer-state': change.state }, immediateRender: false }, change.at);
  }
  for (const [at, state] of sim.endpoint) {
    tl.set(endpointEl, { attr: { 'data-endpoint-state': state }, immediateRender: false }, at);
  }
  if (sim.throwAt !== undefined) {
    tl.call(() => cue('state'), undefined, sim.throwAt);
  }

  // --- two layers trade places, which changes what runs first --------------

  const authEl = layerEls[AUTH];
  const rateEl = layerEls[RATELIMIT];
  if (authEl && rateEl) {
    tl.to(
      rateEl,
      { y: -SWAP_DISTANCE, duration: SWAP_DURATION, ease: 'power2.inOut', immediateRender: false },
      SWAP_AT,
    );
    tl.to(
      authEl,
      { y: SWAP_DISTANCE, duration: SWAP_DURATION, ease: 'power2.inOut', immediateRender: false },
      SWAP_AT,
    );
  }
  tl.set(stage, { attr: { 'data-order': 'b' }, immediateRender: false }, SWAP_END);
  tl.call(() => cue('trip'), undefined, SWAP_AT);

  // --- requests -------------------------------------------------------------

  REQUESTS.forEach((plan, index) => {
    const parts = requests[index];
    const journey = sim.journeys[index];
    if (!parts || !journey) return;
    parkRequest(parts, X, Y_CLIENT);
    showRequest(tl, parts, plan.start);

    // An anonymous request is a hollow dot; a static file is a square.
    if (plan.kind === 'anon') {
      gsap.set(parts.dot, { opacity: 0 });
      const hollow = attachToRequest(parts, 'circle', { class: 'scene-req-hollow', r: '14' });
      tl.set(hollow, { opacity: 1, immediateRender: false }, plan.start);
      tl.set(hollow, { opacity: 0, immediateRender: false }, journey.markAt);
    }
    if (plan.kind === 'file') {
      gsap.set(parts.dot, { opacity: 0 });
      const square = attachToRequest(parts, 'rect', {
        class: 'scene-req-square',
        x: '-7',
        y: '-7',
        width: '14',
        height: '14',
        rx: '2',
      });
      const label = attachToRequest(
        parts,
        'text',
        { class: 'scene-req-label', x: '26', y: '8' },
        'file',
      );
      tl.set([square, label], { opacity: 1, immediateRender: false }, plan.start);
      tl.set([square, label], { opacity: 0, immediateRender: false }, journey.markAt);
    }

    // The exception that climbs out of the endpoint is a red diamond.
    if (journey.diamondFrom !== undefined) {
      const diamond = attachToRequest(parts, 'path', {
        class: 'scene-req-diamond',
        d: 'M 0 -13 L 13 0 L 0 13 L -13 0 Z',
      });
      tl.set(parts.dot, { opacity: 0, immediateRender: false }, journey.diamondFrom);
      tl.set(diamond, { opacity: 1, immediateRender: false }, journey.diamondFrom);
      tl.set(diamond, { opacity: 0, immediateRender: false }, journey.diamondTo ?? journey.markAt);
    }

    for (const move of journey.moves) {
      moveRequest(tl, parts, move.y, move.duration, move.at);
    }

    // The status code rides home with the answer.
    const chip = attachToRequest(
      parts,
      'text',
      { class: 'scene-req-code', x: '30', y: '8' },
      journey.code,
    );
    tl.set(chip, { opacity: 1, immediateRender: false }, journey.markAt);
    markRequest(tl, parts, journey.markOk ? 'ok' : 'fail', journey.markAt);
    if (journey.markOk) tl.call(() => cue('success'), undefined, journey.homeAt);
    else if (journey.code !== '500') tl.call(() => cue('failure'), undefined, journey.homeAt);
    hideRequest(tl, parts, journey.homeAt, fadeAt(journey.homeAt, SCENE_DURATION));
  });

  // --- step labels ---------------------------------------------------------

  // The stage is complete on the first frame: five layers at rest, endpoint idle.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
