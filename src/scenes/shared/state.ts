/**
 * Discrete state, written the one way that survives scrubbing.
 *
 * A scene never changes state from a callback. It sets a `data-*` attribute
 * with a zero-duration tween, which GSAP reverts when the playhead moves back
 * past it, and CSS keyed on that attribute decides what it looks like. That is
 * what keeps both scrub directions and both themes correct.
 */

/** Sets one attribute on one target at an absolute time. */
export function attr(
  tl: gsap.core.Timeline,
  target: gsap.TweenTarget,
  name: string,
  value: string,
  at: number,
): void {
  tl.set(target, { attr: { [name]: value }, immediateRender: false }, at);
}

/**
 * Rounds a time to milliseconds. Simulations add legs together, and floating
 * point remainders would otherwise make two things that land on the same
 * instant miss each other.
 */
export function round(value: number): number {
  return Number(value.toFixed(3));
}

/**
 * Fade time for a request that lands, never running past the end of the scene.
 */
export function fadeAt(home: number, duration: number): number {
  return Math.max(0.05, Math.min(0.15, duration - home));
}
