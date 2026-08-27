import {
  CAPACITY,
  SCENE_DURATION,
  X_LANE,
  Y_CONSUMER,
  Y_PRODUCER,
  Y_QUEUE_BOTTOM,
  Y_QUEUE_TOP,
} from './stage';
import type { Lamp } from './stage';
import { q } from '../shared/dom';
import {
  hideRequest,
  mountRequests,
  moveRequest,
  parkRequest,
  showRequest,
} from '../shared/request';
import type { RequestParts } from '../shared/request';
import { createScheduler } from '../shared/simulation';
import { attr, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Backpressure scene: a 24 second, four step timeline.
 *
 * The two standing rules apply here as everywhere: every tween sits at an
 * absolute position, and every discrete change is a zero-duration tween on a
 * `data-*` attribute that GSAP reverts when the playhead moves back past it.
 *
 * Nothing the reader watches is placed by hand. The scene is told seven things —
 * the rate the producer would like to send at and when that changes, how fast
 * the consumer drains and when it starts taking four at a time, how big the
 * buffer is, what the buffer does when it is full, how long an item must sit in
 * the buffer before it can be taken, how far the depth has to fall before the
 * `full` badge goes out, and the windows each step may put traffic in. One pass
 * over the whole 24 seconds turns that into everything else.
 *
 * Four derivations carry it. **Whether an item is sent at all** is the bounded
 * buffer and nothing else: the producer sends when the number it has
 * outstanding — on the lane plus in the buffer — is below both the capacity and
 * its own `admits` limit, and otherwise it waits. **The depth** is a count of
 * arrivals minus departures, changed by one where the reader sees each of them
 * happen: up when an item lands on the buffer's top edge, down when the consumer
 * takes one off the bottom. The eight cells are drawn from that one number, so
 * the filled cell count is the depth by construction. **The `in` readout** is
 * the rate the producer is actually achieving: its own offer rate while it is
 * free-running, nothing at all while the buffer has stopped it, and the
 * consumer's pace once it is being paced by the consumer — which is what
 * backpressure *is*, arriving as a number rather than as an arrow. And **`wait`,
 * `full` and `admits`** all follow the depth: `full` latches at capacity and
 * clears once the buffer has drained to its release level, `wait` lights when
 * the producer has been stalled for longer than a moment and goes out when it
 * sends again, and the concurrency limit steps down behind the wait and back up
 * behind the release, one at a time.
 *
 * Backpressure is the neighbour of Web-Queue-Worker and of Rate Limiter, and is
 * deliberately neither. Web-Queue-Worker is the *architecture* — a queue, some
 * workers, and what a job's status looks like while it waits. Rate Limiter
 * refuses at the door and the refused request is gone. Here nothing is refused
 * and nothing is lost: the queue is finite, so when it fills, the pressure has
 * to go somewhere, and the only place left is back into the producer's own pace.
 * The push-back therefore never travels as a dot. It is drawn as state — the
 * `full` badge on the buffer and the `wait` chip on the producer — because the
 * thing that moves upstream is not a message, it is an absence of permission.
 *
 * One quantity is reported rather than drawn. An item on a lane and a cell in
 * the buffer are the same unit of work, and `in` and `out` are that unit's rate
 * in items per second, so the dot cadence is exactly proportional to the number
 * beside it: at `in 60/s` the producer sends three times as often as at
 * `in 20/s`. The lanes are 200px and 230px and a traveller sweeps 26px, so even
 * at the fastest rate here the lane carries one item at a time.
 */

const ID = 'backpressure';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

const BOUNDARIES = [0, 6, 12, 18, 24];

// --- how a traveller moves -------------------------------------------------

/** Seconds an item takes from the producer to the buffer: 200px. */
const IN_LEG = 0.24;
/** Seconds an item takes from the buffer to the consumer: 230px. */
const OUT_LEG = 0.28;
/** How long a traveller takes to fade once it is absorbed. */
const FADE = 0.1;

// --- what the scene is told ------------------------------------------------

/**
 * Items per second carried by one dot and held by one cell. The readouts are in
 * items per second, so this is the only place the two scales meet: at `in 60/s`
 * the producer sends one dot every 16/60 of a second, and each of those dots
 * fills exactly one of the eight cells.
 */
const ITEMS_PER_CELL = 16;

/** The rate the producer would like to send at, and when that changes. */
const OFFER: [number, number][] = [
  [0, 20],
  [8.0, 60],
  [10.3, 20],
  [12.4, 60],
  [16.6, 20],
  [19.8, 60],
  [20.9, 20],
];

/** The rate the consumer drains at. Batching is the only thing that moves it. */
const DRAIN: [number, number][] = [
  [0, 20],
  [18.6, 40],
];

/** When the consumer starts taking four at a time. */
const BATCH_AT = 18.4;

/** The lowest the concurrency limit is taken to while the buffer pushes back. */
const ADMITS_LOW = 3;
/** Seconds between one step of the concurrency limit and the next. */
const ADMITS_STEP = 0.16;
/** Seconds between the wait and the limit starting to close. */
const ADMITS_DROP_LAG = 0.4;
/** Seconds between the release and the limit starting to open again. */
const ADMITS_RISE_LAG = 0.4;

/** How long an item rests in the buffer before the consumer may take it. */
const MIN_DWELL = 0.3;

/** Depth the `full` badge clears at, once it has latched at capacity. */
const FULL_RELEASE = 4;

/** How long after the buffer fills the producer says it is being made to wait. */
const WAIT_LAG = 0.35;
/** How long after the buffer lets go the producer stops saying so. */
const WAIT_CLEAR = 0.2;
/** How long a stall runs before the rate meter admits it has stopped. */
const BLOCK_SHOW = 0.6;
/** Seconds between a cell coming free and the waiting producer using it. */
const HANDOFF = 0.12;

/**
 * When traffic may be put on the lanes. Each step ends on a still stage, so an
 * item is only sent, and only taken, while its window is open; `outBy` runs a
 * little past `inBy` so the last item sent is also the last one taken and the
 * depth a step closes on is the depth it was holding.
 */
const WINDOWS = [
  { from: 0.4, inBy: 4.6, outBy: 5.4 },
  { from: 6.5, inBy: 11.0, outBy: 11.0 },
  { from: 12.4, inBy: 17.2, outBy: 17.6 },
  { from: 18.5, inBy: 22.7, outBy: 23.5 },
];

/** The rungs the producer's rate meter rests on. */
const IN_LADDER = [0, 20, 60];

/** How close two samples of one repeating thing may sound, how close any sample
    may fall to another cue, and how close any of it may fall to a boundary. */
const SAMPLE_GAP = 1.5;
const MIN_CUE_GAP = 0.2;
const BOUNDARY_GAP = 0.3;

// --- what one pass over the scene produces --------------------------------

interface Traveller {
  start: number;
  home: number;
}

interface Series {
  at: number;
  value: string;
}

/** A cue that has to sound, and the family it belongs to for spacing. */
interface Fixed {
  at: number;
  family: string | null;
  name: SceneCue;
}

/** One of a repeating family, kept only if it is far enough from everything. */
interface Candidate {
  at: number;
  family: string;
  name: SceneCue;
}

interface Simulation {
  sent: Traveller[];
  taken: Traveller[];
  flags: Record<string, Series[]>;
  cues: [number, SceneCue][];
  peakDepth: number;
  fullAt: number | null;
  releasedAt: number | null;
  resumedAt: number | null;
}

const rateAt = (schedule: [number, number][], t: number): number => {
  let value = schedule[0]?.[1] ?? 20;
  for (const [from, rate] of schedule) if (t >= from - 1e-9) value = rate;
  return value;
};

/** Nearest rung of the producer's rate meter to a measured rate. */
const snap = (rate: number): number =>
  IN_LADDER.reduce((best, rung) =>
    Math.abs(rung - rate) < Math.abs(best - rate) ? rung : best,
  );

const windowAt = (t: number): (typeof WINDOWS)[number] | undefined =>
  WINDOWS.find((w) => t >= w.from - 1e-9 && t <= w.outBy + 1e-9);

/**
 * Walks the whole scene in time order.
 *
 * The producer's cadence is booked first and everything else falls out of it,
 * because the only thing the reader is being asked to watch is what a finite
 * buffer does to the pace of whoever is filling it.
 */
function simulate(): Simulation {
  const sent: Traveller[] = [];
  const taken: Traveller[] = [];
  const flags: Record<string, Series[]> = {
    in: [],
    out: [],
    depth: [],
    admits: [],
    wait: [],
    full: [],
    batch: [],
  };
  const fixed: Fixed[] = [];
  const candidates: Candidate[] = [];

  /** Arrival times of the items resting in the buffer, oldest first. */
  const buffer: number[] = [];
  /** Items the producer has sent that have not yet landed in the buffer. */
  let onLane = 0;

  let admits = CAPACITY;
  let fullOn = false;
  let blockedSince: number | null = null;
  let consumerFreeAt = 0;
  let peakDepth = 0;
  let sawSeven = false;
  /**
   * The one attempt each side has booked, or null when it has none. A running
   * task may book more, so the only way to keep a side's cadence honest is to
   * name the instant the booking is for and let a stale booking retire itself.
   */
  let sendDue: number | null = null;
  let takeDue: number | null = null;

  let fullAt: number | null = null;
  let releasedAt: number | null = null;
  let resumedAt: number | null = null;

  const push = (series: Series[], at: number, value: string): void => {
    const stamp = round(at);
    const last = series[series.length - 1];
    if (last && last.at === stamp) {
      last.value = value;
      return;
    }
    if (last && last.value === value) return;
    series.push({ at: stamp, value });
  };

  const fix = (at: number, name: SceneCue, family: string | null = null): void => {
    if (at < 0 || at > SCENE_DURATION) return;
    fixed.push({ at: round(at), family, name });
  };

  const sample = (at: number, family: string, name: SceneCue): void => {
    if (at < 0 || at > SCENE_DURATION) return;
    candidates.push({ at: round(at), family, name });
  };

  const { schedule, drain } = createScheduler();

  // --- the opening state, which is the whole diagram -----------------------

  push(flags.in, 0, '20');
  push(flags.out, 0, '20');
  push(flags.depth, 0, '0');
  push(flags.admits, 0, String(CAPACITY));
  push(flags.wait, 0, 'off' satisfies Lamp);
  push(flags.full, 0, 'off' satisfies Lamp);
  push(flags.batch, 0, 'off' satisfies Lamp);

  // --- what the consumer is doing ------------------------------------------

  for (const [from, rate] of DRAIN) {
    if (from === 0) continue;
    schedule(from, () => {
      push(flags.out, from, String(rate));
      fix(from, 'state');
    });
  }

  schedule(BATCH_AT, () => {
    push(flags.batch, BATCH_AT, 'on' satisfies Lamp);
    fix(BATCH_AT, 'trip');
  });

  // --- the producer and the consumer, declared before they book each other --

  /** Books the producer's next attempt, unless a sooner one is already due. */
  const bookSend = (t: number): void => {
    const at = round(t);
    if (at > SCENE_DURATION) return;
    if (sendDue !== null && sendDue <= at) return;
    sendDue = at;
    schedule(at, () => {
      if (sendDue !== at) return;
      sendDue = null;
      sendStep(at);
    });
  };

  /** The same, for the consumer. It is never asked to run before it is free. */
  const bookTake = (t: number): void => {
    const at = round(t);
    if (at > SCENE_DURATION) return;
    if (takeDue !== null && takeDue <= at) return;
    takeDue = at;
    schedule(at, () => {
      if (takeDue !== at) return;
      takeDue = null;
      takeStep(at);
    });
  };

  /** A cell has come free, so a producer that was told to wait may go now. */
  const retrySend = (t: number): void => {
    if (sendDue !== null) return;
    bookSend(t);
  };

  function takeStep(t: number): void {
    if (buffer.length === 0) return;
    const head = buffer[0] ?? 0;
    const ready = round(Math.max(t, consumerFreeAt, head + MIN_DWELL));
    const slot = windowAt(ready);
    if (!slot || ready > slot.outBy) {
      const next = WINDOWS.find((w) => w.from > ready);
      if (next) bookTake(next.from);
      return;
    }
    if (ready > t) {
      bookTake(ready);
      return;
    }

    buffer.shift();
    setDepth(t, buffer.length);
    const home = round(t + OUT_LEG);
    taken.push({ start: t, home });
    sample(home, 'absorb', 'success');

    consumerFreeAt = round(t + ITEMS_PER_CELL / rateAt(DRAIN, t));
    bookTake(consumerFreeAt);
    retrySend(round(t + HANDOFF));
  }

  // --- the concurrency limit, which follows the buffer ---------------------

  const rampAdmits = (from: number, to: number, at: number): void => {
    const direction = to > from ? 1 : -1;
    const total = Math.abs(to - from);
    for (let index = 1; index <= total; index += 1) {
      const when = round(at + (index - 1) * ADMITS_STEP);
      if (when > SCENE_DURATION) return;
      const value = from + index * direction;
      schedule(when, () => {
        admits = value;
        push(flags.admits, when, String(value));
        if (index === 1 || index === total) fix(when, 'state', 'admits');
        else sample(when, 'admits', 'state');
        // Widening the limit can be what lets a waiting producer go.
        if (direction > 0) retrySend(round(when + HANDOFF));
      });
    }
  };

  // --- the depth, and everything that reads it -----------------------------

  const setDepth = (at: number, value: number): void => {
    push(flags.depth, at, String(value));
    peakDepth = Math.max(peakDepth, value);
    sample(at, 'depth', 'state');

    if (value === CAPACITY - 1 && !sawSeven) {
      sawSeven = true;
      // One cell left is the last warning a buffer can give.
      fix(at, 'failure');
    }
    if (value === CAPACITY && !fullOn) {
      fullOn = true;
      fullAt = at;
      push(flags.full, at, 'on' satisfies Lamp);
      fix(at, 'trip');
      push(flags.wait, round(at + WAIT_LAG), 'on' satisfies Lamp);
      fix(round(at + WAIT_LAG), 'state');
      rampAdmits(CAPACITY, ADMITS_LOW, round(at + WAIT_LAG + ADMITS_DROP_LAG));
    } else if (fullOn && value <= FULL_RELEASE) {
      fullOn = false;
      releasedAt = at;
      push(flags.full, at, 'off' satisfies Lamp);
      fix(at, 'state');
      push(flags.wait, round(at + WAIT_CLEAR), 'off' satisfies Lamp);
      fix(round(at + WAIT_CLEAR), 'state');
      rampAdmits(ADMITS_LOW, CAPACITY, round(at + ADMITS_RISE_LAG));
    }
  };

  // --- the producer --------------------------------------------------------

  function sendStep(t: number): void {
    const slot = windowAt(t);
    if (!slot || t > slot.inBy) {
      // Between windows the producer holds still; it picks its cadence back up
      // when the next window opens.
      const next = WINDOWS.find((w) => w.from > t);
      if (next) bookSend(next.from);
      return;
    }

    const room = Math.min(CAPACITY, admits);
    if (buffer.length + onLane >= room) {
      if (blockedSince === null) {
        blockedSince = t;
        const quiet = round(t + BLOCK_SHOW);
        schedule(quiet, () => {
          if (blockedSince === null) return;
          push(flags.in, quiet, '0');
          fix(quiet, 'state');
        });
      }
      return;
    }

    // --- the item goes ------------------------------------------------------

    const wasStalled = blockedSince !== null;
    blockedSince = null;
    const arrive = round(t + IN_LEG);
    sent.push({ start: t, home: arrive });
    onLane += 1;

    // What the meter says. Free-running, the producer is achieving the rate it
    // is offering. Coming off a stall it is achieving exactly what the consumer
    // is taking, because that is the only thing letting it go: the number is
    // the push-back, arriving as a reading rather than as an arrow.
    const reading = String(snap(wasStalled ? rateAt(DRAIN, t) : rateAt(OFFER, t)));
    if (reading !== (flags.in[flags.in.length - 1]?.value ?? '')) {
      push(flags.in, t, reading);
      fix(t, 'state', 'in');
    }

    if (wasStalled && resumedAt === null && releasedAt !== null) {
      resumedAt = t;
      // The pace is honest again, which is the whole argument of the step.
      fix(round(t + 0.62), 'success');
    }

    schedule(arrive, () => {
      onLane -= 1;
      buffer.push(arrive);
      setDepth(arrive, buffer.length);
      sample(arrive, 'pass', 'success');
      bookTake(round(Math.max(consumerFreeAt, arrive + MIN_DWELL)));
    });

    bookSend(round(t + ITEMS_PER_CELL / rateAt(OFFER, t)));
  }

  // --- run it --------------------------------------------------------------

  bookSend(WINDOWS[0]?.from ?? 0);

  drain();

  // --- the replayed spike, read off the finished series --------------------

  // Two beats in the last step are only knowable once the whole pass is done:
  // the instant the buffer stops filling for good, and the instant it is empty
  // again. Both are read back rather than guessed at while the pass is running.
  const late = flags.depth.filter((entry) => entry.at > 18);
  const highest = late.reduce((best, entry) => Math.max(best, Number(entry.value)), 0);
  const lastHigh = late.map((entry) => Number(entry.value)).lastIndexOf(highest);
  const overThePeak = lastHigh >= 0 ? late[lastHigh + 1] : undefined;
  if (highest > 0 && overThePeak) fix(overThePeak.at, 'success');
  const settled = late.find((entry) => entry.value === '0');
  if (settled) fix(settled.at, 'success');

  // --- the cues ------------------------------------------------------------

  const accepted: Fixed[] = fixed
    .filter((entry) => !BOUNDARIES.some((edge) => Math.abs(entry.at - edge) < BOUNDARY_GAP))
    .sort((left, right) => left.at - right.at)
    .filter(
      (entry, index, list) =>
        index === 0 || entry.at - (list[index - 1]?.at ?? -99) >= MIN_CUE_GAP,
    );

  const lastOf: Record<string, number> = { pass: -99, absorb: -99, depth: -99, admits: -99 };
  candidates.sort((left, right) => left.at - right.at);
  for (const candidate of candidates) {
    let previous = lastOf[candidate.family] ?? -99;
    for (const other of accepted) {
      if (other.family === candidate.family && other.at < candidate.at && other.at > previous) {
        previous = other.at;
      }
    }
    if (candidate.at - previous < SAMPLE_GAP) continue;
    if (BOUNDARIES.some((edge) => Math.abs(candidate.at - edge) < BOUNDARY_GAP)) continue;
    if (accepted.some((other) => Math.abs(other.at - candidate.at) < MIN_CUE_GAP)) continue;
    lastOf[candidate.family] = candidate.at;
    accepted.push({ at: candidate.at, family: candidate.family, name: candidate.name });
    accepted.sort((left, right) => left.at - right.at);
  }

  const cues: [number, SceneCue][] = accepted
    .map((entry) => [entry.at, entry.name] as [number, SceneCue])
    .sort((left, right) => left[0] - right[0]);

  if (fullAt === null) throw new Error(ID + ' scene: the buffer never filled');
  if (resumedAt === null) throw new Error(ID + ' scene: the producer never got going again');

  return { sent, taken, flags, cues, peakDepth, fullAt, releasedAt, resumedAt };
}

// --- the timeline ----------------------------------------------------------

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);

  const sim = simulate();
  const parts = mountRequests(layer, sim.sent.length + sim.taken.length, ID);
  const sentParts = parts.slice(0, sim.sent.length);
  const takenParts = parts.slice(sim.sent.length);

  const tl = createSceneTimeline();

  // --- everything the stage says about itself ------------------------------

  for (const [name, series] of Object.entries(sim.flags)) {
    for (const entry of series) attr(tl, stage, 'data-' + name, entry.value, entry.at);
  }

  // --- what travels --------------------------------------------------------

  // An item goes down one lane and is absorbed at the far edge. There is no
  // journey back and no verdict: the answer to "may I send another?" is the
  // state of the buffer, not something that comes home.
  const lane = (
    plans: Traveller[],
    group: RequestParts[],
    from: number,
    to: number,
    leg: number,
  ): void => {
    plans.forEach((plan, index) => {
      const request = group[index];
      if (!request) return;
      parkRequest(request, X_LANE, from);
      showRequest(tl, request, plan.start);
      moveRequest(tl, request, to, leg, plan.start);
      hideRequest(tl, request, plan.home, FADE);
    });
  };

  lane(sim.sent, sentParts, Y_PRODUCER, Y_QUEUE_TOP, IN_LEG);
  lane(sim.taken, takenParts, Y_QUEUE_BOTTOM, Y_CONSUMER, OUT_LEG);

  // --- sound ---------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels ---------------------------------------------------------

  // The stage is complete on the first frame: an empty buffer, both readouts at
  // the rate the two sides opened on, the concurrency limit at its full width,
  // neither lamp lit, and nothing in flight.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
