import gsap from 'gsap';
import type { SceneModule } from '../types';

/**
 * The timeline shell every scene is built inside.
 *
 * Two things at the end of a build are easy to get subtly wrong, and both
 * scenes and the player depend on them, so they live here rather than being
 * copied into each scene:
 *
 * 1. A pin at the very end fixes `tl.duration()` at the scene length, so the
 *    scrub bar covers the closing hold instead of stopping at the last tween.
 * 2. A render in each direction lets every zero-duration tween record its start
 *    value. Without it, scrubbing backwards past a state change that has never
 *    played forwards leaves the wrong state behind. Both renders suppress
 *    events, so the warm-up never fires a sound cue.
 */

/** A paused timeline, which is the only kind a scrubbable scene may use. */
export function createSceneTimeline(): gsap.core.Timeline {
  return gsap.timeline({ paused: true });
}

/** Pins the length, warms the timeline up in both directions, and parks it. */
export function finishSceneTimeline(tl: gsap.core.Timeline, duration: number): void {
  tl.to({}, { duration: 0.01 }, duration - 0.01);
  tl.progress(1, true).progress(0, true).pause();
}

/** Names a scene module, so the shape the player expects is declared once. */
export function defineScene(module: SceneModule): SceneModule {
  return module;
}
