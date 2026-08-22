/**
 * Small motion flourishes shared between scenes.
 */

/**
 * The shudder a box makes when the thing behind it gives way. Deliberately
 * short and square: `ease: 'none'` with a yoyo repeat reads as a knock rather
 * than a wobble.
 */
export function shakeService(
  tl: gsap.core.Timeline,
  target: gsap.TweenTarget,
  at: number,
): void {
  tl.to(target, { x: 9, duration: 0.07, repeat: 5, yoyo: true, ease: 'none' }, at);
}
