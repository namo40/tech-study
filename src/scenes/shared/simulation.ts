import { round } from './state';

/**
 * The event kernel the queue-style scenes are built on.
 *
 * A scene does not author what the viewer sees. It books events, runs them in
 * time order, and emits the attribute changes that fall out. Because a running
 * event may book more events, the drain loop always re-picks the earliest
 * unfinished task rather than walking a list that was fixed up front: that is
 * what lets a connection released at 9.4 hand itself to whoever was waiting,
 * and lets a cache fill schedule its own expiry.
 *
 * Two scenes deliberately do **not** use this kernel. Rate Limiter and Bulkhead
 * build every event first, sort once, and walk the result, because their
 * same-instant tie-break is a domain rule (a refill lands before a consume, a
 * release lands before an acquire) rather than insertion order. Rewriting them
 * on top of `drain` would silently drop that rule, so they keep their own loop.
 */

/** One booked event. `order` breaks ties between events at the same instant. */
export interface Task {
  at: number;
  order: number;
  run: () => void;
}

export interface Scheduler {
  /** Books `run` for `at`. Safe to call from inside a running task. */
  schedule: (at: number, run: () => void) => void;
  /** Runs everything booked, earliest first, including anything booked late. */
  drain: () => void;
}

export function createScheduler(): Scheduler {
  const tasks: Task[] = [];
  let order = 0;

  const schedule = (at: number, run: () => void): void => {
    order += 1;
    tasks.push({ at: round(at), order, run });
  };

  const drain = (): void => {
    const done = new Set<Task>();
    for (;;) {
      let next: Task | undefined;
      for (const task of tasks) {
        if (done.has(task)) continue;
        if (!next || task.at < next.at || (task.at === next.at && task.order < next.order)) {
          next = task;
        }
      }
      if (!next) break;
      done.add(next);
      next.run();
    }
  };

  return { schedule, drain };
}

/*
 * Collapsing changes that land on one instant.
 *
 * Two zero-duration tweens at the same position render in insertion order going
 * forwards and in reverse going backwards, so leaving both would make that
 * single frame depend on which way the reader scrubbed. Both guards below fix
 * that by keeping only the change that ends up applying — but they have
 * different reach, and they are not interchangeable.
 */

/** The instant of a `[time, value]` pair: the key guard (A) collapses on. */
export const pairInstant = <T>(pair: [number, T]): number => pair[0];

/**
 * Guard (A): collapse against the previous entry only, keyed on its instant.
 *
 * Enough for a series that only ever changes once per instant, such as a
 * counter. It cannot see past the last entry, so it must not be used where a
 * second change to the same element can arrive after a change to another one.
 */
export function collapseLast<T>(series: T[], entry: T, keyFn: (item: T) => number): void {
  const last = series.length - 1;
  const previous = series[last];
  if (previous !== undefined && keyFn(previous) === keyFn(entry)) series[last] = entry;
  else series.push(entry);
}

/**
 * Guard (B): scan back over everything already recorded at this instant and
 * replace the entry for the same element, if there is one.
 *
 * Needed wherever one instant touches several elements in more than one pass —
 * a version bump that empties three cache instances and then re-keys them, a
 * pool release that frees one slot and immediately fills another.
 */
export function collapseAtInstant<T extends { at: number }>(
  series: T[],
  entry: T,
  keyFn: (item: T) => unknown,
): void {
  for (let i = series.length - 1; i >= 0; i -= 1) {
    const candidate = series[i];
    if (!candidate || candidate.at !== entry.at) break;
    if (keyFn(candidate) === keyFn(entry)) {
      series[i] = entry;
      return;
    }
  }
  series.push(entry);
}
