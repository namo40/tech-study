/**
 * Playback speed preference.
 *
 * One rate for every scene player on the site, kept in `localStorage` so the
 * choice survives navigation. Only the four listed rates are accepted; a
 * missing or unrecognised stored value falls back to normal speed.
 */

export const SPEEDS = [0.5, 1, 1.5, 2] as const;

const STORAGE_KEY = 'speed';

const DEFAULT_SPEED = 1;

export function getSpeed(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const match = SPEEDS.find((speed) => String(speed) === stored);
    return match ?? DEFAULT_SPEED;
  } catch {
    return DEFAULT_SPEED;
  }
}

export function setSpeed(value: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // Storage is unavailable; the choice still applies to this page view.
  }
}

/** Advances through the rates in place, wrapping from the fastest to the slowest. */
export function nextSpeed(current: number): number {
  const index = SPEEDS.findIndex((speed) => speed === current);
  if (index < 0) return DEFAULT_SPEED;
  return SPEEDS[(index + 1) % SPEEDS.length] ?? DEFAULT_SPEED;
}

/** The button face: the rate followed by a multiplication sign, e.g. `1.5×`. */
export function formatSpeed(value: number): string {
  return `${value}×`;
}
