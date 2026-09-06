/**
 * Difficulty bands.
 *
 * A page carries a level from 1 to 10. Ten chips would be a row nobody reads,
 * so the index filters on five bands of two levels each, and a band travels in
 * the address as its range: `?level=5-6` is the third chip. The number itself
 * is what the reader sees on a page, so the band is only ever a grouping.
 */

/** Band numbers, low to high. Band `n` holds levels `2n - 1` and `2n`. */
export const LEVEL_BANDS = [1, 2, 3, 4, 5] as const;

export type LevelBand = (typeof LEVEL_BANDS)[number];

/** The band a level falls in. Values outside 1..10 clamp to the end bands. */
export function levelBand(level: number): LevelBand {
  const band = Math.ceil(level / 2);
  return Math.min(Math.max(band, 1), LEVEL_BANDS.length) as LevelBand;
}

/** The address value for a band, such as `5-6` for band 3. */
export function bandRange(band: number): string {
  return `${band * 2 - 1}-${band * 2}`;
}

/** The band a `?level=` value names, or nothing when it names none. */
export function rangeBand(range: string): LevelBand | undefined {
  return LEVEL_BANDS.find((band) => bandRange(band) === range);
}
