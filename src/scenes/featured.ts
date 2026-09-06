/**
 * The scenes the concept index opens with.
 *
 * The theater can switch between these five without leaving the page, so both
 * the page that draws the first one and the loader that fetches the rest read
 * the list from here: one list, and no way for the two to drift apart.
 */
export const FEATURED_SCENES = [
  'circuit-breaker',
  'retry',
  'garbage-collection',
  'load-test',
  'async-await',
] as const;
