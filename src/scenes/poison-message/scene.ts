import gsap from 'gsap';
import {
  AGE_STEPS,
  CELL_START,
  DELAYS,
  DLQ_CELLS,
  MAX_ATTEMPT,
  MAX_DEPTH,
  MAX_FAIL,
  MAX_OK,
  QUEUE_CELLS,
  RETRY_CELLS,
  SCENE_DURATION,
  STAGE_STATE,
  X_CONSUMER_RIGHT,
  X_DEAD,
  X_RETRY_LEFT,
  X_WORK,
  Y_DLQ_TOP,
  Y_MID_BOTTOM,
  Y_MID_TOP,
  Y_QUEUE_BOTTOM,
  Y_SIDE,
} from './stage';
import type { CellState, DrawerState, Mark, SlotState, Tick } from './stage';
import { q } from '../shared/dom';
import {
  attachToRequest,
  hideRequest,
  markRequest,
  mountRequests,
  parkRequest,
  showRequest,
} from '../shared/request';
import type { RequestParts, RequestResult } from '../shared/request';
import { collapseAtInstant, createScheduler } from '../shared/simulation';
import { attr, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Poison Message scene: a 24 second, four step timeline.
 *
 * Same two rules as the other scenes: every tween sits at an absolute position,
 * and every discrete change is a zero-duration tween on a `data-*` attribute
 * that GSAP reverts when the playhead moves back past it. The one thing that is
 * drawn rather than switched is the delay timer, which sweeps its arc.
 *
 * Nothing the reader counts is authored. The scene is told nine things: when
 * each message arrives and which single one of them can never be handled, how
 * long the consumer spends before it answers, how many deliveries it retries in
 * process before the message goes back to the broker, how long the broker's
 * lock is, when the delay queue is switched on, how long the two waits it hands
 * out are, how many deliveries the message is allowed in total, and how long a
 * head-of-line wait has to get before the queue calls it critical.
 *
 * Everything else falls out of one pass. `depth` is the row, `age` is the wait
 * of the oldest message the queue has not finished with, `attempt` is the
 * delivery count the poison message carries, `ok` and `fail` count what came
 * back, and the move to the dead-letter queue happens on the delivery that
 * spends the budget — not on a time somebody picked.
 *
 * The reason the first two steps look the way they do is head-of-line blocking:
 * the queue is strictly first in, first out, so a message that fails and is
 * redelivered goes back to the head and everything behind it waits. Nobody
 * decides that `age` should climb; it climbs because the head does not move.
 */

const ID = 'poison-message';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- how a traveller moves ------------------------------------------------

/** One speed for every leg any traveller takes, in pixels per second. */
const SPEED = 1000;

/** The work lane, which carries a delivery down and a redelivery back up. */
const TRIP_WORK = round((Y_MID_TOP - Y_QUEUE_BOTTOM) / SPEED);
/** The side lane, from the Consumer to the delay queue. */
const TRIP_SIDE = round((X_RETRY_LEFT - X_CONSUMER_RIGHT) / SPEED);
/** The last lane, from the delay queue into the dead-letter queue. */
const TRIP_DEAD = round((Y_DLQ_TOP - Y_MID_BOTTOM) / SPEED);
/** How long a traveller takes to go once it has arrived. */
const FADE = 0.12;

// --- what the scene is told -----------------------------------------------

interface Arrival {
  /** When the message reaches the back of the queue. */
  at: number;
  /** The one message the handler can never get through. */
  bad?: boolean;
}

/**
 * The stream. Two messages are already waiting when the scene opens, the third
 * is the one that cannot be handled, and the five behind it are what turns a
 * single bad message into everybody's problem.
 */
const ARRIVALS: Arrival[] = [
  { at: 0 },
  { at: 0 },
  { at: 2.2, bad: true },
  { at: 3.0 },
  { at: 4.6 },
  { at: 6.9 },
  { at: 8.6 },
  { at: 10.2 },
  { at: 16.2 },
  { at: 19.8 },
  { at: 20.4 },
  { at: 21.0 },
  { at: 21.6 },
];

/** When the consumer picks up the first of the two messages already waiting. */
const OPEN = 0.45;
/** The beat between a message reaching the queue and the broker offering it. */
const ARRIVE_GAP = 0.05;
/** How long the consumer holds a message before it answers. */
const WORK_OK = 0.3;
/** The poison message is rejected while it is still being deserialized. */
const WORK_BAD = 0.15;
/** The beat between one result and the consumer taking the next message. */
const HOLD = 0.1;

/** Deliveries the consumer retries in process before it gives the message back. */
const IMMEDIATE = 3;
/** The beat between one of those in-process retries and the next delivery. */
const IMMEDIATE_GAP = 0.1;
/** The broker's lock, which is what governs redelivery after that. */
const LOCK = 2.35;

/** When the delay queue is switched on, after which a failure moves aside. */
const RETRY_FROM = 12;
/** The beat between a failure and the message leaving for the delay queue. */
const RETRY_DWELL = 0.3;
/** The beat between the message landing in the delay queue and the timer starting. */
const RING_START = 0.15;
/** Seconds of scene time the two waits take, in the order they are handed out. */
const RING_RUN = [1.3, 1.6];
/** Deliveries the message is allowed before it is dead-lettered. */
const BUDGET = 8;
/** The beat between landing in the delay queue and going on to the DLQ. */
const DEAD_DWELL = 0.3;

/** How long a head-of-line wait has to get before the queue calls it critical. */
const PEAK_AGE = 8.8;
/** The highest wait the readout draws, in seconds. */
const MAX_AGE = AGE_STEPS[AGE_STEPS.length - 1] ?? 8;
/** How long the Consumer's result mark holds one answer. */
const TICK_HOLD = 0.28;

/** The three things the scene holds up, and for how long. */
const MARK_AT: [number, Mark][] = [
  [8.6, 'promise'],
  [10.6, 'cost'],
  [22.4, 'isolated'],
];
const MARK_FOR = 1;

/** When the picture is called settled: main line normal, the poison isolated. */
const SETTLE_AT = 22.7;

/** The shortest gap between two sampled success cues. */
const SUCCESS_GAP = 0.3;
/** The shortest gap between any two cues, and how quiet a step boundary is. */
const MIN_CUE_GAP = 0.2;
const BOUNDARY_GAP = 0.3;
const BOUNDARIES = [0, 6, 12, 18, 24];
const EPS = 1e-6;

// --- what the simulation produces -----------------------------------------

interface AttrChange {
  at: number;
  target: string;
  name: string;
  value: string;
}

/** One leg of a journey: which coordinate moves, to where, and how long it takes. */
interface Leg {
  axis: 'x' | 'y';
  to: number;
  at: number;
  duration: number;
}

/** One traveller: a dot on one lane, and whether it is the poison message. */
interface Journey {
  x: number;
  y: number;
  bad: boolean;
  /** Which side of the dot the word sits on, so it never leaves the diagram. */
  word?: 'left' | 'right';
  showAt: number;
  legs: Leg[];
  mark: { result: RequestResult; at: number } | null;
  fadeAt: number;
}

/** One sweep of the delay timer: the arc it draws and the seconds it takes. */
interface RingSweep {
  at: number;
  until: number;
}

interface Simulation {
  attrs: AttrChange[];
  cues: [number, SceneCue][];
  journeys: Journey[];
  ring: RingSweep[];
  ok: number;
  fail: number;
  /** When the poison message reached the drawer, which has to be in step four. */
  deadAt: number;
}

/** What the broker knows about one message, which is all it works from. */
interface Message {
  id: number;
  bad: boolean;
  /** When it last entered the queue. A redelivery does not reset it; a delay does. */
  arrivedAt: number;
  /** The earliest the broker will offer it again. */
  readyAt: number;
  /** Deliveries it has been given, which is the count the budget is spent from. */
  deliveries: number;
  /** True while it is out with the consumer, so the row does not draw it twice. */
  inFlight: boolean;
}

// --- the simulation -------------------------------------------------------

function simulate(): Simulation {
  const raw: AttrChange[] = [];
  const fixed: [number, SceneCue][] = [];
  const successAt: number[] = [];
  const journeys: Journey[] = [];
  const ring: RingSweep[] = [];
  const problems: string[] = [];

  const setAttr = (at: number, target: string, name: string, value: string): void => {
    raw.push({ at: round(at), target, name, value });
  };
  const cue = (at: number, name: SceneCue): void => {
    fixed.push([round(at), name]);
  };

  /**
   * Everything the queue has not finished with, oldest first. A message out
   * with the consumer is still in it, because a delivery that fails has not
   * taken the message off anybody's hands; only an acknowledgement or a move to
   * the delay queue does that. That is why `age` never dips while the poison
   * message is in the air.
   */
  const line: Message[] = [];
  let ok = 0;
  let fail = 0;
  let deliveries = 0;
  let consumerBusy = false;
  let consumerFreeAt = OPEN;
  let retryHeld: Message | null = null;
  let delayIndex = 0;
  let deadAt: number | null = null;
  let ageAfterDead = 0;
  /** The last wait the readout was given, so a rise is heard and a fall is not. */
  let ageShown = 0;
  let peakShown = false;

  const { schedule, drain } = createScheduler();

  /** Books one pass of the broker at `at`, at most once per instant. */
  const booked = new Set<number>();
  const wake = (at: number): void => {
    const t = round(Math.max(at, 0));
    if (t > SCENE_DURATION || booked.has(t)) return;
    booked.add(t);
    schedule(t, () => pump(t));
  };

  /** Books one look at the head-of-line wait, at most once per instant. */
  const ageBooked = new Set<number>();
  const wakeAge = (at: number): void => {
    const t = round(at);
    if (t > SCENE_DURATION || ageBooked.has(t)) return;
    ageBooked.add(t);
    schedule(t, () => refreshAge(t));
  };

  /**
   * The wait of the oldest message the queue has not finished with, floored to
   * one of the values the readout draws and capped at the highest of them, plus
   * the flag that says the wait has gone critical. The next crossing books
   * itself, so the reading is right between events without the scene sampling
   * the whole 24 seconds.
   */
  function refreshAge(at: number): void {
    const head = line[0];
    const wait = head ? round(at - head.arrivedAt) : 0;
    const value = Math.min(MAX_AGE, Math.floor(wait / 2) * 2);
    if (!AGE_STEPS.includes(value as (typeof AGE_STEPS)[number])) {
      problems.push(`${at.toFixed(2)} computed an age of ${value}, which the stage does not draw`);
    }
    const critical = wait >= PEAK_AGE;
    setAttr(at, 'stage', 'data-pm-age', String(value));
    setAttr(at, 'stage', 'data-pm-peak', critical ? 'on' : 'off');
    // The wait is heard while it grows, because that is the cost accumulating.
    // It falling is the recovery, and the acknowledgements already say that.
    if (value > ageShown) cue(at, 'state');
    if (critical && !peakShown) cue(at, 'failure');
    ageShown = value;
    peakShown = critical;
    if (deadAt !== null && at > deadAt) ageAfterDead = Math.max(ageAfterDead, value);
    if (!head) return;
    if (value < MAX_AGE) wakeAge(round(head.arrivedAt + value + 2));
    if (wait < PEAK_AGE) wakeAge(round(head.arrivedAt + PEAK_AGE));
  }

  /**
   * The row is written from the line rather than from a plan: a cell is
   * whichever message is standing in that position, and the poison one is
   * marked, so `depth` and the `bad` cell cannot disagree with each other.
   */
  const renderQueue = (at: number): void => {
    const waiting = line.filter((message) => !message.inFlight);
    if (waiting.length > QUEUE_CELLS) {
      problems.push(`${at.toFixed(2)} ${waiting.length} messages waiting, ${QUEUE_CELLS} cells`);
    }
    for (let i = 0; i < QUEUE_CELLS; i += 1) {
      const held = waiting[i];
      const value: CellState = !held ? 'none' : held.bad ? 'bad' : 'held';
      setAttr(at, `cell-${i}`, 'data-pm-cell', value);
    }
    setAttr(at, 'stage', 'data-pm-depth', String(Math.min(waiting.length, MAX_DEPTH)));
    refreshAge(at);
  };

  const setTick = (at: number, value: Exclude<Tick, 'off'>): void => {
    setAttr(at, 'stage', 'data-pm-tick', value);
    setAttr(round(at + TICK_HOLD), 'stage', 'data-pm-tick', 'off');
  };

  const setSlot = (at: number, index: number, value: SlotState): void => {
    setAttr(at, `slot-${index}`, 'data-pm-slot', value);
  };

  const setDrawer = (at: number, index: number, value: DrawerState): void => {
    setAttr(at, `drawer-${index}`, 'data-pm-drawer', value);
  };

  /**
   * The last move: the budget is spent, so the message is taken out of the
   * retry loop and put in the drawer with its history, and the lamp comes on.
   */
  const sendToDrawer = (at: number, message: Message): void => {
    const departAt = round(at + DEAD_DWELL);
    const landAt = round(departAt + TRIP_DEAD);
    setSlot(departAt, 0, 'none');
    cue(departAt, 'trip');
    journeys.push({
      x: X_DEAD,
      y: Y_MID_BOTTOM,
      bad: true,
      // This lane lands 30px from the right edge of the drawer, so the word
      // goes on the inside of the dot rather than off the box.
      word: 'left',
      showAt: departAt,
      legs: [{ axis: 'y', to: Y_DLQ_TOP, at: departAt, duration: TRIP_DEAD }],
      mark: null,
      fadeAt: landAt,
    });

    schedule(landAt, () => {
      retryHeld = null;
      deadAt = landAt;
      setDrawer(landAt, 0, 'dead');
      setAttr(landAt, 'stage', 'data-pm-dead', '1');
      setAttr(landAt, 'stage', 'data-pm-alert', 'on');
      setAttr(landAt, 'stage', 'data-pm-attempt', '0');
      cue(landAt, 'state');
      if (message.deliveries !== BUDGET) {
        problems.push(`the drawer took a message on delivery ${message.deliveries}, not ${BUDGET}`);
      }
    });
  };

  /**
   * The move that saves the main line: the failed message leaves the consumer
   * sideways, waits out a delay that gets longer each time, and rejoins at the
   * back of the queue rather than at the head.
   */
  const sendToRetry = (at: number, message: Message): void => {
    const departAt = round(at + RETRY_DWELL);
    const landAt = round(departAt + TRIP_SIDE);
    cue(departAt, 'trip');
    journeys.push({
      x: X_CONSUMER_RIGHT,
      y: Y_SIDE,
      bad: true,
      showAt: departAt,
      legs: [{ axis: 'x', to: X_RETRY_LEFT, at: departAt, duration: TRIP_SIDE }],
      mark: null,
      fadeAt: landAt,
    });

    consumerBusy = false;
    consumerFreeAt = round(departAt + HOLD);
    wake(consumerFreeAt);

    schedule(landAt, () => {
      retryHeld = message;
      setSlot(landAt, 0, 'wait');

      if (message.deliveries >= BUDGET) {
        sendToDrawer(landAt, message);
        return;
      }

      const run = RING_RUN[delayIndex] ?? RING_RUN[RING_RUN.length - 1] ?? 1;
      const label = DELAYS[delayIndex] ?? DELAYS[DELAYS.length - 1] ?? 5;
      delayIndex += 1;
      const startAt = round(landAt + RING_START);
      const endAt = round(startAt + run);
      ring.push({ at: startAt, until: endAt });
      setAttr(startAt, 'stage', 'data-pm-delay', `d${label}`);
      cue(startAt, 'state');

      schedule(endAt, () => {
        setAttr(endAt, 'stage', 'data-pm-delay', 'off');
        setSlot(endAt, 0, 'none');
        retryHeld = null;
        message.arrivedAt = endAt;
        message.readyAt = round(endAt + ARRIVE_GAP);
        line.push(message);
        renderQueue(endAt);
        cue(endAt, 'state');
        wake(message.readyAt);
      });
    });
  };

  /** Hands the head of the line to the consumer and books what comes back. */
  const dispatch = (at: number): void => {
    const message = line[0];
    if (!message) return;
    message.inFlight = true;
    consumerBusy = true;
    deliveries += 1;
    message.deliveries += 1;
    renderQueue(at);

    const landAt = round(at + TRIP_WORK);
    const outAt = round(landAt + (message.bad ? WORK_BAD : WORK_OK));
    if (message.bad) setAttr(landAt, 'stage', 'data-pm-attempt', String(message.deliveries));

    if (!message.bad) {
      journeys.push({
        x: X_WORK,
        y: Y_QUEUE_BOTTOM,
        bad: false,
        showAt: at,
        legs: [{ axis: 'y', to: Y_MID_TOP, at, duration: TRIP_WORK }],
        mark: { result: 'ok', at: outAt },
        fadeAt: outAt,
      });
      schedule(outAt, () => {
        const index = line.indexOf(message);
        if (index >= 0) line.splice(index, 1);
        ok += 1;
        setAttr(outAt, 'stage', 'data-pm-ok', String(ok));
        setTick(outAt, 'ok');
        successAt.push(outAt);
        renderQueue(outAt);
        consumerBusy = false;
        consumerFreeAt = round(outAt + HOLD);
        wake(consumerFreeAt);
      });
      return;
    }

    // The poison message. It fails every time, and what happens next is the
    // policy in force at the moment it fails.
    const goesAside = outAt >= RETRY_FROM;
    const backAt = round(outAt + TRIP_WORK);
    journeys.push({
      x: X_WORK,
      y: Y_QUEUE_BOTTOM,
      bad: true,
      showAt: at,
      legs: goesAside
        ? [{ axis: 'y', to: Y_MID_TOP, at, duration: TRIP_WORK }]
        : [
            { axis: 'y', to: Y_MID_TOP, at, duration: TRIP_WORK },
            { axis: 'y', to: Y_QUEUE_BOTTOM, at: outAt, duration: TRIP_WORK },
          ],
      mark: { result: 'fail', at: outAt },
      fadeAt: goesAside ? round(outAt + RETRY_DWELL - 0.05) : backAt,
    });

    schedule(outAt, () => {
      fail += 1;
      setAttr(outAt, 'stage', 'data-pm-fail', String(fail));
      setTick(outAt, 'fail');
      cue(outAt, fail === 1 ? 'failure' : 'state');

      if (goesAside) {
        const index = line.indexOf(message);
        if (index >= 0) line.splice(index, 1);
        message.inFlight = false;
        renderQueue(outAt);
        sendToRetry(outAt, message);
        return;
      }

      schedule(backAt, () => {
        message.inFlight = false;
        message.readyAt = round(
          backAt + (message.deliveries < IMMEDIATE ? IMMEDIATE_GAP : LOCK),
        );
        renderQueue(backAt);
        consumerBusy = false;
        consumerFreeAt = backAt;
        wake(message.readyAt);
      });
    });
  };

  /** One pass of the broker: offer the head if both it and the consumer are ready. */
  function pump(now: number): void {
    if (consumerBusy) return;
    const head = line[0];
    if (!head || head.inFlight) return;
    const ready = Math.max(head.readyAt, consumerFreeAt);
    if (ready > now) {
      wake(ready);
      return;
    }
    dispatch(now);
  }

  // --- the stream ---------------------------------------------------------

  ARRIVALS.forEach((plan, index) => {
    const message: Message = {
      id: index + 1,
      bad: plan.bad === true,
      arrivedAt: plan.at,
      readyAt: round(plan.at + ARRIVE_GAP),
      deliveries: 0,
      inFlight: false,
    };
    schedule(plan.at, () => {
      line.push(message);
      renderQueue(plan.at);
      if (message.bad) cue(plan.at, 'state');
      wake(message.readyAt);
    });
  });

  // --- the three things the scene holds up --------------------------------

  for (const [at, value] of MARK_AT) {
    schedule(at, () => {
      setAttr(at, 'stage', 'data-pm-mark', value);
      cue(at, 'state');
    });
    schedule(round(at + MARK_FOR), () =>
      setAttr(round(at + MARK_FOR), 'stage', 'data-pm-mark', 'none'),
    );
  }

  schedule(SETTLE_AT, () => {
    setAttr(SETTLE_AT, 'stage', 'data-pm-settled', 'on');
    cue(SETTLE_AT, 'success');
  });

  drain();

  // --- what has to be true for the picture to mean anything ---------------

  if (line.length > 0) problems.push(`${line.length} message(s) never left the queue`);
  if (retryHeld !== null) problems.push('a message was left in the delay queue');
  if (deadAt === null) problems.push('the poison message was never dead-lettered');
  if (ok !== MAX_OK) problems.push(`${ok} messages were acknowledged, ${MAX_OK} are drawn`);
  if (fail !== BUDGET) problems.push(`${fail} deliveries failed, the budget is ${BUDGET}`);
  if (ok + fail !== deliveries) {
    problems.push(`${deliveries} deliveries, but ${ok} ok and ${fail} failed`);
  }
  if (ageAfterDead !== 0) {
    problems.push(`the head-of-line wait reached ${ageAfterDead}s after the transfer`);
  }
  if (MAX_ATTEMPT !== BUDGET) problems.push(`the stage draws ${MAX_ATTEMPT} attempts, budget ${BUDGET}`);
  if (problems.length > 0) throw new Error(`${ID} scene: ${problems.join('; ')}`);

  // --- the cues, sampled where they repeat --------------------------------

  successAt.sort((left, right) => left - right);
  let lastSample = -Infinity;
  const sampled: [number, SceneCue][] = [];
  for (const at of successAt) {
    if (at - lastSample < SUCCESS_GAP - EPS) continue;
    lastSample = at;
    sampled.push([at, 'success']);
  }

  const cues: [number, SceneCue][] = [];
  for (const entry of [...fixed, ...sampled].sort((left, right) => left[0] - right[0])) {
    if (BOUNDARIES.some((edge) => Math.abs(entry[0] - edge) < BOUNDARY_GAP - EPS)) continue;
    const previous = cues[cues.length - 1];
    if (previous && entry[0] - previous[0] < MIN_CUE_GAP - EPS) continue;
    cues.push(entry);
  }

  // --- the discrete changes, in time order and collapsed ------------------

  // A single instant touches several elements in more than one pass — a
  // dispatch writes six cells, a depth and two age readings — so only the
  // change that ends up applying is kept, and a change that writes a value
  // something already holds is dropped.
  const inTimeOrder = raw
    .map((entry, order) => ({ entry, order }))
    .sort((left, right) => left.entry.at - right.entry.at || left.order - right.order)
    .map(({ entry }) => entry);

  const folded: AttrChange[] = [];
  for (const entry of inTimeOrder) {
    collapseAtInstant(folded, entry, (change) => `${change.target}@${change.name}`);
  }

  const seen = new Map<string, string>();
  for (const [name, value] of Object.entries(STAGE_STATE)) seen.set(`stage@${name}`, value);
  for (let n = 0; n < QUEUE_CELLS; n += 1) {
    seen.set(`cell-${n}@data-pm-cell`, CELL_START[n] ?? 'none');
  }
  for (let n = 0; n < RETRY_CELLS; n += 1) seen.set(`slot-${n}@data-pm-slot`, 'none');
  for (let n = 0; n < DLQ_CELLS; n += 1) seen.set(`drawer-${n}@data-pm-drawer`, 'none');

  const attrs: AttrChange[] = [];
  for (const change of folded) {
    const key = `${change.target}@${change.name}`;
    if (seen.get(key) === change.value) continue;
    seen.set(key, change.value);
    attrs.push(change);
  }

  journeys.sort((left, right) => left.showAt - right.showAt);

  return { attrs, cues, journeys, ring, ok, fail, deadAt: deadAt ?? 0 };
}

// --- the timeline ---------------------------------------------------------

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const targets: Record<string, Element> = { stage };
  for (let n = 0; n < QUEUE_CELLS; n += 1) {
    targets[`cell-${n}`] = q<SVGGElement>(stage, `.pm-cell--${n}`, ID);
  }
  for (let n = 0; n < RETRY_CELLS; n += 1) {
    targets[`slot-${n}`] = q<SVGGElement>(stage, `.pm-slot--${n}`, ID);
  }
  for (let n = 0; n < DLQ_CELLS; n += 1) {
    targets[`drawer-${n}`] = q<SVGGElement>(stage, `.pm-drawer--${n}`, ID);
  }

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);
  const progress = q<SVGCircleElement>(stage, '.pm-ring-progress', ID);
  const sim = simulate();
  if (sim.ok !== MAX_OK || sim.fail !== MAX_FAIL) {
    throw new Error(`${ID} scene: ended on ok ${sim.ok} and fail ${sim.fail}, not what the stage draws`);
  }
  if (sim.deadAt < 18 || sim.deadAt > SCENE_DURATION) {
    throw new Error(`${ID} scene: the message reached the drawer at ${sim.deadAt}, outside the fourth step`);
  }

  const parts = mountRequests(layer, sim.journeys.length, ID);

  const tl = createSceneTimeline();

  // --- discrete state -----------------------------------------------------

  for (const change of sim.attrs) {
    const target = targets[change.target];
    if (target) attr(tl, target, change.name, change.value, change.at);
  }

  // --- the timer, which is drawn rather than switched ---------------------

  const circumference = Number(progress.getAttribute('stroke-dasharray') ?? 0);
  for (const sweep of sim.ring) {
    tl.fromTo(
      progress,
      { attr: { 'stroke-dashoffset': circumference } },
      {
        attr: { 'stroke-dashoffset': 0 },
        duration: Math.max(round(sweep.until - sweep.at), 0.01),
        ease: 'none',
        immediateRender: false,
      },
      sweep.at,
    );
  }

  // --- what travels -------------------------------------------------------

  sim.journeys.forEach((journey, index) => {
    const request: RequestParts | undefined = parts[index];
    if (!request) return;

    // The word rides with the message, so it is on the stage exactly once from
    // the moment the poison message arrives until it is in the drawer.
    if (journey.bad) {
      const left = journey.word === 'left';
      const label = attachToRequest(
        request,
        'text',
        {
          class: 'scene-req-label pm-tag',
          x: left ? '-36' : '36',
          y: '9',
          ...(left ? { 'text-anchor': 'end' } : {}),
        },
        'bad',
      );
      gsap.set(label, { opacity: 1 });
    }

    parkRequest(request, journey.x, journey.y);
    showRequest(tl, request, journey.showAt);
    for (const leg of journey.legs) {
      tl.to(
        request.group,
        { [leg.axis]: leg.to, duration: leg.duration, ease: 'none', immediateRender: false },
        leg.at,
      );
    }
    if (journey.mark) markRequest(tl, request, journey.mark.result, journey.mark.at);
    hideRequest(tl, request, journey.fadeAt, FADE);
  });

  // --- sound --------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels --------------------------------------------------------

  // The stage is complete on the first frame: two messages standing in the row,
  // a head that has not aged, nothing retried, an empty delay queue, an empty
  // drawer, the lamp out and nothing in flight.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
