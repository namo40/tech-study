import gsap from 'gsap';
import { q } from './dom';

/**
 * Request dots, shared by every scene.
 *
 * A request is one group holding a plain dot plus the two result markers. The
 * markers are drawn as a check and a cross, so success and failure are never
 * told apart by colour alone. Each request in a scene gets its own group, which
 * keeps every tween at an absolute position and the timeline safe to scrub.
 */

const MARKUP = `<g class="scene-req">
  <circle class="scene-req-halo" r="26" />
  <circle class="scene-req-dot" r="14" />
  <g class="scene-req-ok"><circle class="scene-req-ok-bg" r="20" /><path class="scene-req-glyph" d="M -9 1 L -3 8 L 10 -7" /></g>
  <g class="scene-req-fail"><circle class="scene-req-fail-bg" r="20" /><path class="scene-req-glyph" d="M -8 -8 L 8 8 M 8 -8 L -8 8" /></g>
</g>`;

export interface RequestParts {
  group: SVGGElement;
  halo: SVGCircleElement;
  dot: SVGCircleElement;
  ok: SVGGElement;
  fail: SVGGElement;
}

/** Result markers a request can end on. */
export type RequestResult = 'ok' | 'fail';

const POP = {
  scale: 1,
  transformOrigin: '50% 50%',
  duration: 0.18,
  ease: 'back.out(2.4)',
  immediateRender: false,
};

/**
 * Fills the request layer with `count` request groups and returns their parts.
 */
export function mountRequests(layer: SVGGElement, count: number, sceneId: string): RequestParts[] {
  layer.innerHTML = Array.from({ length: count }, () => MARKUP).join('');
  return Array.from(layer.querySelectorAll<SVGGElement>('.scene-req')).map((group) => ({
    group,
    halo: q<SVGCircleElement>(group, '.scene-req-halo', sceneId),
    dot: q<SVGCircleElement>(group, '.scene-req-dot', sceneId),
    ok: q<SVGGElement>(group, '.scene-req-ok', sceneId),
    fail: q<SVGGElement>(group, '.scene-req-fail', sceneId),
  }));
}

/**
 * Base state a request reverts to: parked at its origin, hidden, showing the
 * plain dot. Set outside the timeline so seeking before the first tween lands
 * on it.
 */
export function parkRequest(parts: RequestParts, x: number, y: number): void {
  gsap.set(parts.group, { x, y, opacity: 0 });
  gsap.set([parts.ok, parts.fail, parts.halo], { opacity: 0 });
  gsap.set(parts.dot, { opacity: 1 });
}

/** Makes a parked request visible. */
export function showRequest(tl: gsap.core.Timeline, parts: RequestParts, at: number): void {
  tl.set(parts.group, { opacity: 1, immediateRender: false }, at);
}

/** Fades a request out once it has been absorbed. */
export function hideRequest(
  tl: gsap.core.Timeline,
  parts: RequestParts,
  at: number,
  duration = 0.22,
): void {
  tl.to(parts.group, { opacity: 0, duration, immediateRender: false }, at);
}

/** Moves a request along the vertical axis. */
export function moveRequest(
  tl: gsap.core.Timeline,
  parts: RequestParts,
  to: number,
  duration: number,
  at: number,
  ease = 'none',
): void {
  tl.to(parts.group, { y: to, duration, ease }, at);
}

/**
 * Swaps the plain dot for a result marker, which pops from its own centre.
 */
export function markRequest(
  tl: gsap.core.Timeline,
  parts: RequestParts,
  result: RequestResult,
  at: number,
  scaleFrom = 0.55,
): void {
  const marker = result === 'ok' ? parts.ok : parts.fail;
  tl.set(parts.dot, { opacity: 0, immediateRender: false }, at);
  tl.set(marker, { opacity: 1, immediateRender: false }, at);
  tl.fromTo(marker, { scale: scaleFrom, transformOrigin: '50% 50%' }, { ...POP }, at);
}

/** Highlights a request with a ring, for a call that deserves attention. */
export function haloRequest(
  tl: gsap.core.Timeline,
  parts: RequestParts,
  from: number,
  to: number,
): void {
  tl.set(parts.halo, { opacity: 1, immediateRender: false }, from);
  tl.to(parts.halo, { opacity: 0, duration: 0.3, immediateRender: false }, to);
}

export interface TripLeg {
  /** y the request travels to. */
  to: number;
  /** Seconds the leg takes. */
  duration: number;
}

export interface TripOptions {
  /** Absolute time the request leaves its origin. */
  start: number;
  /** Legs travelled before the result is known. */
  down: TripLeg[];
  /** Result the request comes back with. */
  result: RequestResult;
  /** Seconds spent at the far end before turning around. */
  dwell?: number;
  /** Legs travelled after the result is known. */
  up: TripLeg[];
  /** Fade the request out when the last leg ends. Defaults to true. */
  fade?: boolean;
}

/**
 * The shape almost every request follows: travel down through one or more
 * nodes, pop a result marker, then travel back up. Returns the time the last
 * leg finishes so a caller can hang further tweens off it.
 */
export function addTrip(
  tl: gsap.core.Timeline,
  parts: RequestParts,
  options: TripOptions,
): number {
  const { start, down, result, dwell = 0, up, fade = true } = options;

  showRequest(tl, parts, start);

  let at = start;
  for (const leg of down) {
    moveRequest(tl, parts, leg.to, leg.duration, at);
    at += leg.duration;
  }

  const turnAround = at + dwell;
  markRequest(tl, parts, result, turnAround);

  at = turnAround;
  for (const leg of up) {
    moveRequest(tl, parts, leg.to, leg.duration, at);
    at += leg.duration;
  }

  if (fade) hideRequest(tl, parts, at);
  return at;
}

/**
 * Adds one extra element to a request group, for decoration a single scene
 * needs: the value a read is carrying, a square marker for a write, a label.
 * It starts hidden, so the scene decides when it appears.
 */
export function attachToRequest(
  parts: RequestParts,
  tag: string,
  attributes: Record<string, string>,
  text?: string,
): SVGElement {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag) as SVGElement;
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  if (text !== undefined) element.textContent = text;
  parts.group.appendChild(element);
  gsap.set(element, { opacity: 0 });
  return element;
}
