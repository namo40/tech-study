/**
 * Static stage markup for the Competing Consumers scene, and the simulation the
 * markup is written from.
 *
 * Imported on the server, so like every other stage it must stay free of
 * animation libraries. It holds more than the usual stage because two things
 * here carry text only the simulation knows: the shared store, whose entries
 * are the message ids in the order they were acknowledged, and the key table,
 * whose rows are the partition assignment. Writing either of those by hand
 * would let the diagram and the timeline disagree about what happened, so the
 * simulation runs here, once, and both the markup and `scene.ts` read it.
 *
 * The bands:
 *   - y 0..440       kept empty for the step title card
 *   - y 440..680     Producer, with the arrival lane at x 540
 *   - y 880..1220    Queue: the depth counter, the track, the latency meter
 *   - y 1400         the fan rail, which every message crosses
 *   - y 1500..1740   five consumers and the dead-letter queue
 *   - y 1780..1890   the shared store: handled ids, then the key table
 *
 * A message chip travels on three kinds of line and no others. It comes down
 * the arrival lane at x 540 and slides along `Y_DROP` into its slot; it leaves
 * the queue straight down the column of the slot it was standing in, which is
 * the head column at `HEAD_X` unless one instant handed out two messages at
 * once; and it crosses the fan rail at `Y_FAN` before dropping into a
 * consumer's own lane. That is what decides where a label may sit: `latency`
 * is named from x 345 rather than from the left margin because those columns
 * come down past it, the queue is counted from its top right rather than from under the
 * track because a chip slides along the row under the counter, a consumer's
 * name sits below its bar because a chip stops well above it, and the four
 * flash labels share the strip above the rail rather than the rail itself.
 */

import {
  VIEWBOX,
  clientBox,
  counterVariants,
  nodeFrame,
  requestsLayer,
  serviceBox,
  trackAndFill,
  verticalLink,
} from '../shared/stage';
import { collapseAtInstant, collapseLast, createScheduler, pairInstant } from '../shared/simulation';
import { round } from '../shared/state';
import type { SceneCue } from '../types';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- geometry --------------------------------------------------------------

/** The lane every message arrives on, and where it starts. */
export const X_LANE = 540;
export const Y_PRODUCER = 620;

/**
 * The five consumer columns. They are declared before the queue because the
 * head slot is pinned to the first of them: the column down out of the node,
 * the left end of the fan rail and Consumer 1's own lane are one line, and
 * they only read as one line if they share an x.
 */
const CONSUMER_LEFT = [130, 274, 418, 562, 706];
const CONSUMER_W = 134;
/** Centre of each consumer box, which is also the lane a chip rides into it. */
export const CONSUMER_X = CONSUMER_LEFT.map((left) => left + CONSUMER_W / 2);

const NODE_Y = 880;
const NODE_H = 340;

const TRACK_X = 157;
const TRACK_W = 766;
const TRACK_Y = 1030;
const TRACK_H = 84;

/** Slots a queued message can stand in. The deepest the queue ever gets is 9. */
export const SLOT_COUNT = 10;
const SLOT_FIRST = CONSUMER_X[0] ?? 197;
const SLOT_GAP = 70;
/** Centre x of queue slot `index`. */
export const slotX = (index: number): number => SLOT_FIRST + SLOT_GAP * index;
/**
 * The head slot, which is the only column a message leaves the queue on, and
 * therefore where the node, the fan rail and Consumer 1's lane all meet.
 */
export const HEAD_X = SLOT_FIRST;
/** The row a chip slides along on its way in, and the row it rests on. */
export const Y_DROP = 1000;
export const Y_QUEUE = 1072;

/** The queue's latency meter: how long the message just taken had waited. */
const LAT_X = 465;
export const LAT_W = 458;
const LAT_Y = 1160;
/** The wait that fills the meter. The worst this scene reaches is 3.25s. */
export const LAT_MAX = 3.5;

/** The rail every message crosses between the queue and a consumer. */
export const Y_FAN = 1400;
/**
 * The row anything travelling the other way uses: a message handed back to the
 * queue, and a message on its way to the dead-letter queue. It sits above the
 * rail rather than below it, because below the rail every consumer has a lane
 * coming down and a return would have to cross the lot of them; above it there
 * is nothing to cross but the one or two columns the queue lets messages out
 * on. Traffic on the rail itself is then one directional, so nothing meets head
 * on at the corner either.
 */
const Y_BACK = 1314;

const CONSUMER_TOP = 1500;
const CONSUMER_H = 240;
/** Where a message rests while a consumer holds it. */
export const Y_WORK = 1570;
/** Full width of a consumer's progress bar. */
export const BAR_W = 106;
const BAR_Y = 1636;

const DLQ_LEFT = 850;
const DLQ_W = 100;
/** Centre of the dead-letter queue, which is reached along the fan rail. */
export const DLQ_X = DLQ_LEFT + DLQ_W / 2;

const STORE_X = 130;
const STORE_W = 820;
const STORE_Y = 1780;
const STORE_H = 110;
const STORE_LABEL_X = 152;
const STORE_LABEL_Y = 1846;
const ENTRY_H = 44;
const ENTRY_Y = 1835 - ENTRY_H / 2;
const SEEN_W = 56;
const SEEN_STEP = 64;
const SEEN_LAST = 918;
const KEY_W = 96;
const KEY_STEP = 107;
const KEY_LAST = 898;

/** A message chip, which every clearance above is measured against. */
export const CHIP_W = 60;
export const CHIP_H = 42;

// --- what the scene is told -------------------------------------------------

/** One message the producer sends, named by what it carries. */
interface Arrival {
  /** When it reaches the queue. The chip leaves the producer `TO_QUEUE` earlier. */
  at: number;
  label: string;
  /** Partition key, for the step that stops treating messages as independent. */
  key?: string;
  /** Work this one costs, when it is not the usual amount. */
  work?: number;
  /** Throws on every attempt. */
  poison?: boolean;
  /** A second copy of a message the broker has already delivered once. */
  copy?: boolean;
}

/**
 * Producer to the queue, in three legs. Every leg of every route on this stage
 * is either vertical or horizontal, never diagonal, because a diagonal cuts
 * the corner off whatever the two lanes were routed around.
 */
const DROP = 0.3;
const SLIDE = 0.15;
const SETTLE = 0.1;
const TO_QUEUE = DROP + SLIDE + SETTLE;
/**
 * Queue to a consumer: down the slot's column, along the rail, into a lane.
 *
 * The rail is the one leg with a fixed speed rather than a fixed duration.
 * Consumers can free 0.05s apart and take from the same column, so chips follow
 * each other onto the rail, and a fixed duration would make the one bound for
 * the far lane the fastest and let it run down the one in front. At one speed
 * for everybody the gap between two chips on the rail is whatever gap they left
 * the queue with, which is never less than a chip's width. What the leg loses
 * or gains the drop into the lane takes back, so every message still reaches
 * its consumer `TO_CONSUMER` after it was taken and no derived time moves.
 */
const PULL_DOWN = 0.12;
const RAIL = 4500;
const MIN_IN = 0.04;
const TO_CONSUMER = 0.3;
/**
 * How long a column is left to itself after a chip has come down it. Two
 * consumers can free 0.05s apart and take from the same slot, and without this
 * the second chip is on the rail while the first is still dropping into a lane
 * a chip's width away. Waiting costs the chip nothing: it runs the rest of the
 * trip faster and still arrives `TO_CONSUMER` after it was taken.
 */
const COLUMN_GAP = 0.12;
/**
 * Two chips are 60 wide and 70 apart, so a slot is only really free once the
 * chip that was standing in it has moved a chip's width away. Nothing may be
 * drawn into a slot before that, which is what these three say:
 *
 *   - `QUEUE_LAG` is how long the queue waits before closing up behind a
 *     departure, so the chip that left is clear of the row first;
 *   - `CLEAR_DOWN` is how long a chip taken from the head needs to fall out of
 *     the row it was standing in, which is `CHIP_H` at the pull speed;
 *   - `CLEAR_SIDE` is how long a slide needs to carry a chip a full width.
 *
 * `RESEAT_LAG` is one number rather than a per-case one, so that two consumers
 * taking at the same instant produce two re-seats that land on the same frame
 * and fold into one.
 */
const RESEAT_LAG = 0.06;
const CLEAR_DOWN = 0.02;
const CLEAR_SIDE = 0.06;
/** Consumer back to the head of the queue, for an attempt that never acked. */
const BACK_UP = 0.12;
const BACK_ACROSS = 0.12;
const BACK_IN = 0.06;
const TO_QUEUE_HEAD = BACK_UP + BACK_ACROSS + BACK_IN;
/** Head of the queue to the dead-letter queue, for a message nobody finishes. */
const DEAD_DWELL = 0.1;
const DEAD_UP = 0.15;
const DEAD_ACROSS = 0.2;
const DEAD_IN = 0.15;
/** How long a chip takes to slide one place along the queue, and to go. */
const SHIFT = 0.07;
const CHIP_FADE = 0.28;

/** The work itself, and the much smaller cost of recognising a duplicate. */
const WORK = 0.7;
const SKIP_WORK = 0.15;
/** How long a consumer shows that an attempt threw. */
const FAIL_FLASH = 0.5;
/** Attempts a message gets before it is dead-lettered instead of redelivered. */
const MAX_DELIVERIES = 2;
/** How long a meter takes to move, and how long a flash label stays up. */
const METER_RISE = 0.15;
const FLASH_HOLD = 0.5;
const WARN_HOLD = 1;
/** Waits that turn the latency meter from calm to warning to hot. */
const LAT_WARN = 1.2;
const LAT_HOT = 2.4;

/** When each consumer joins. Two arrive with step 2 and two more with step 4. */
const ONLINE = [0, 6.2, 6.2, 19.8, 19.8];
/** The consumer that dies mid-message, when it dies, and when it comes back. */
const CRASH_CONSUMER = 1;
const CRASH_AT = 13.25;
const RECOVER_AT = 14.25;
/** When the broker starts sending every key to one consumer. */
const PARTITION_AT = 19.8;
/** Where the numbering restarts, because the queue is empty there. */
const RENUMBER_AT = 12;

const flow = (from: number, gap: number, count: number, first: number): Arrival[] =>
  Array.from({ length: count }, (_value, n) => ({
    at: round(from + gap * n),
    label: `m${first + n}`,
  }));

const ARRIVALS: Arrival[] = [
  // Step 1: one consumer, and messages faster than it can finish them.
  ...flow(0.95, 0.35, 14, 1),
  // Step 2: the same queue, drained by three.
  ...flow(6.1, 0.6, 8, 15),
  // Step 3: a shallow queue, a crash, a duplicate, and one message that never works.
  { at: 12.0, label: 'm1' },
  { at: 12.35, label: 'm2' },
  { at: 12.7, label: 'm3' },
  { at: 13.3, label: 'm4' },
  { at: 13.9, label: 'm5' },
  { at: 14.3, label: 'm6', poison: true },
  { at: 15.0, label: 'm3', copy: true },
  { at: 15.2, label: 'm7' },
  { at: 15.8, label: 'm8' },
  { at: 16.4, label: 'm9' },
  // Step 4: three messages for one key, handed to three consumers.
  { at: 18.2, label: '#7 a', key: '#7', work: 1.2 },
  { at: 18.4, label: '#7 b', key: '#7' },
  { at: 18.6, label: '#7 c', key: '#7', work: 0.4 },
  // Step 4: five keys, two messages each, once the broker partitions by key.
  ...['#7', '#8', '#9', '#10', '#11', '#7', '#8', '#9', '#10', '#11'].map((key, n) => ({
    at: round(20.2 + 0.18 * n),
    label: key,
    key,
  })),
];

/** The label each chip carries, in the order the producer sends them. */
export const CHIP_LABELS = ARRIVALS.map((arrival) => arrival.label);

// --- what the simulation produces -------------------------------------------

interface Move {
  at: number;
  x: number;
  y: number;
  duration: number;
}

interface ChipOutcome {
  moves: Move[];
  showAt: number;
  /** When the chip goes, or null for the one that stays in the dead-letter queue. */
  fadeAt: number | null;
  states: [number, string][];
}

interface AttrChange {
  at: number;
  key: string;
  name: string;
  value: string;
}

export interface Segment {
  from: number;
  to: number;
  vFrom: number;
  vTo: number;
}

export interface Simulation {
  chips: ChipOutcome[];
  attrs: AttrChange[];
  bars: Segment[][];
  latency: Segment[];
  cues: [number, SceneCue][];
  /** Message ids in the shared store, in the order they were acknowledged. */
  seen: string[];
  /** The key table, once the broker sends each key to one consumer. */
  keys: string[];
  /** Fade time of every chip, so the timeline and the stage agree on one number. */
  fade: number;
}

type ConsumerState = 'absent' | 'idle' | 'busy' | 'fail' | 'down';

interface Run {
  from: number;
  to: number;
  peak: number;
}

interface Message {
  index: number;
  label: string;
  key: string | null;
  work: number;
  poison: boolean;
  copy: boolean;
  /** When the producer sent it, which is which step it belongs to. */
  sentAt: number;
  /** When it joined the queue the last time, which is what latency measures. */
  queuedAt: number;
  deliveries: number;
  /** The slot the chip is drawn in, which the queue index only catches up to
   * once the re-seat slide for it has been recorded. */
  renderSlot: number;
  acked: boolean;
  run: Run | null;
}

/** A bar as one continuous line: it fills over a run and drains after it. */
function barCurve(runs: readonly Run[], end: number): Segment[] {
  const segments: Segment[] = [];
  let at = 0;
  runs.forEach((run, index) => {
    if (run.from > at) segments.push({ from: at, to: run.from, vFrom: 0, vTo: 0 });
    segments.push({ from: run.from, to: run.to, vFrom: 0, vTo: run.peak });
    const next = runs[index + 1]?.from ?? end;
    const drained = Math.min(round(run.to + METER_RISE), next);
    segments.push({ from: run.to, to: drained, vFrom: run.peak, vTo: 0 });
    at = drained;
  });
  if (at < end) segments.push({ from: at, to: end, vFrom: 0, vTo: 0 });
  return segments;
}

/** A step series turned into a curve: every change is a short ramp that holds. */
function stepCurve(series: readonly [number, number][], end: number): Segment[] {
  const segments: Segment[] = [];
  let at = 0;
  let value = 0;
  series.forEach(([time, next], index) => {
    if (time > at) segments.push({ from: at, to: time, vFrom: value, vTo: value });
    const until = Math.min(round(time + METER_RISE), series[index + 1]?.[0] ?? end);
    segments.push({ from: time, to: until, vFrom: value, vTo: next });
    value = next;
    at = until;
  });
  if (at < end) segments.push({ from: at, to: end, vFrom: value, vTo: value });
  return segments;
}

/** What every `data-*` starts at, so a change to a held value can be dropped. */
export const STAGE_STATE: Record<string, string> = {
  'stage@data-depth': '0',
  'stage@data-latency': 'ok',
  'stage@data-store': 'seen',
  'stage@data-dlq': 'off',
  'stage@data-scale': 'off',
  'stage@data-warn': 'off',
  'stage@data-redeliver': 'off',
  'consumer-1@data-consumer': 'idle',
  'consumer-2@data-consumer': 'absent',
  'consumer-3@data-consumer': 'absent',
  'consumer-4@data-consumer': 'absent',
  'consumer-5@data-consumer': 'absent',
};

function simulate(): Simulation {
  const chips: ChipOutcome[] = ARRIVALS.map(() => ({
    moves: [],
    showAt: 0,
    fadeAt: null,
    states: [],
  }));
  const raw: AttrChange[] = [];
  const cues: [number, SceneCue][] = [];
  const runs: Run[][] = CONSUMER_X.map(() => []);
  const waits: [number, number][] = [];
  const seen: string[] = [];
  const keys: string[] = [];

  const setAttr = (at: number, key: string, name: string, value: string): void => {
    raw.push({ at: round(at), key, name, value });
  };
  const cue = (at: number, name: SceneCue): void => {
    cues.push([round(at), name]);
  };
  const move = (chip: ChipOutcome, at: number, x: number, y: number, duration: number): void => {
    collapseLast(chip.moves, { at: round(at), x, y, duration }, (item) => item.at);
  };
  /**
   * The three legs from the producer into a slot: down the arrival lane, along
   * the drop row, then in. The last one waits above the slot when whoever was
   * standing there has not moved out of the way yet, which is the only place a
   * chip is ever drawn later than the moment the queue counted it.
   */
  const arrive = (chip: ChipOutcome, at: number, slot: number): void => {
    const x = slotX(slot);
    move(chip, at, X_LANE, Y_DROP, DROP);
    move(chip, round(at + DROP), x, Y_DROP, SLIDE);
    const ready = round(at + DROP + SLIDE);
    move(chip, round(Math.max(ready, slotFree[slot] ?? 0)), x, Y_QUEUE, SETTLE);
    slotFree[slot] = Number.POSITIVE_INFINITY;
  };
  /** A label that comes up for a moment and goes again. */
  const flash = (at: number, name: string, hold: number): void => {
    setAttr(at, 'stage', name, 'on');
    setAttr(round(at + hold), 'stage', name, 'off');
  };

  const queue: Message[] = [];
  const arrived: Message[] = [];
  /** The earliest time a chip may be drawn standing in each slot. */
  const slotFree: number[] = Array.from({ length: SLOT_COUNT }, () => 0);
  /** The earliest time a chip may start down each slot's column, keyed by x. */
  const columnFree = new Map<number, number>();
  const consumers = CONSUMER_X.map((_x, index) => ({
    state: (index === 0 ? 'idle' : 'absent') as ConsumerState,
    busy: false,
    holding: null as Message | null,
    idleSince: index === 0 ? 0 : Number.POSITIVE_INFINITY,
  }));
  const assigned = new Map<string, number>();
  const warned = new Set<string>();
  let partitioned = false;

  const setDepth = (at: number): void => setAttr(at, 'stage', 'data-depth', String(queue.length));
  const setConsumer = (at: number, index: number, state: ConsumerState): void => {
    const holder = consumers[index];
    if (holder) holder.state = state;
    setAttr(at, `consumer-${index + 1}`, 'data-consumer', state);
  };

  /**
   * Re-seats every chip still queued and records the slides. Closing up behind
   * a departure lags, so the chip that left is out of the row before the next
   * one arrives in it; making room for an arrival at the head leads, so the row
   * is already clear when it lands.
   */
  const reseat = (at: number, lag: number = RESEAT_LAG): void => {
    const start = round(at + lag);
    queue.forEach((message, index) => {
      if (message.renderSlot === index) return;
      slotFree[message.renderSlot] = round(start + CLEAR_SIDE);
      slotFree[index] = Number.POSITIVE_INFINITY;
      message.renderSlot = index;
      const chip = chips[message.index];
      if (chip) move(chip, start, slotX(index), Y_QUEUE, SHIFT);
    });
  };

  const { schedule, drain } = createScheduler();

  /** The consumer that has waited longest, which is who the next message goes to. */
  const longestIdle = (): number => {
    let best = -1;
    consumers.forEach((consumer, index) => {
      if (consumer.state !== 'idle' || consumer.busy) return;
      const rival = consumers[best];
      if (best < 0 || !rival || consumer.idleSince < rival.idleSince) best = index;
    });
    return best;
  };

  /** The consumer a key belongs to: whoever holds the fewest keys so far. */
  const consumerFor = (at: number, key: string): number => {
    const held = assigned.get(key);
    if (held !== undefined) return held;
    const load = CONSUMER_X.map(() => 0);
    for (const owner of assigned.values()) load[owner] = (load[owner] ?? 0) + 1;
    let best = -1;
    consumers.forEach((consumer, index) => {
      if (consumer.state === 'absent') return;
      if (best < 0 || (load[index] ?? 0) < (load[best] ?? 0)) best = index;
    });
    assigned.set(key, best);
    keys.push(`${key} → C${best + 1}`);
    setAttr(at, `key-${keys.length}`, 'data-entry', 'on');
    cue(at, 'state');
    return best;
  };

  /**
   * Hands out the message at the head of the queue, and repeats while it can.
   * Only the head ever leaves, which is what keeps every chip's route down out
   * of the queue on one column.
   */
  function pump(at: number): void {
    let took = false;
    for (;;) {
      const message = queue[0];
      if (!message) break;
      const index = partitioned ? consumerFor(at, message.key ?? '') : longestIdle();
      const holder = consumers[index];
      if (index < 0 || !holder || holder.state !== 'idle' || holder.busy) break;
      take(index, message, at);
      took = true;
    }
    // One re-seat for the whole instant, after everything that leaves has left.
    if (took) reseat(at);
  }

  /** A consumer takes the message at the head: the chip rides down to it. */
  function take(index: number, message: Message, at: number): void {
    const holder = consumers[index];
    const chip = chips[message.index];
    if (!holder || !chip) return;
    queue.splice(queue.indexOf(message), 1);
    holder.busy = true;
    holder.holding = message;
    message.deliveries += 1;
    collapseLast<[number, number]>(waits, [round(at), round(at - message.queuedAt)], pairInstant);
    setDepth(at);

    // A re-seat booked for this instant by an earlier take is stale now: this
    // chip is leaving instead of shifting, so drop it before reading where the
    // chip stands.
    while (chip.moves.length > 0 && (chip.moves[chip.moves.length - 1]?.at ?? 0) >= at) {
      chip.moves.pop();
    }

    // It leaves from the column it is standing in, which is the head column
    // unless this instant handed out two messages at once, in which case the
    // second one leaves from the slot behind it. Both drop straight down, so
    // the two never share a column and never catch each other on the rail.
    const lane = CONSUMER_X[index] ?? 0;
    const column = chip.moves[chip.moves.length - 1]?.x ?? HEAD_X;
    slotFree[message.renderSlot] = round(at + CLEAR_DOWN);
    const from = round(Math.max(at, columnFree.get(column) ?? 0));
    columnFree.set(column, round(from + COLUMN_GAP));
    const budget = round(TO_CONSUMER - (from - at));
    const across = round(Math.abs(lane - column) / RAIL);
    const down = round(Math.min(PULL_DOWN, budget - across - MIN_IN));
    const into = round(Math.max(MIN_IN, budget - down - across));
    move(chip, from, column, Y_FAN, down);
    move(chip, round(from + down), lane, Y_FAN, across);
    move(chip, round(from + down + across), lane, Y_WORK, into);

    const runFrom = round(at + TO_CONSUMER);
    setConsumer(runFrom, index, 'busy');
    chip.states.push([runFrom, 'running']);

    // A copy of something the store already holds costs a lookup and nothing more.
    const duplicate = message.copy && seen.includes(message.label);
    const work = duplicate ? SKIP_WORK : message.work;
    const endAt = round(runFrom + work);
    const run: Run = { from: runFrom, to: endAt, peak: work / WORK };
    message.run = run;
    runs[index]?.push(run);

    schedule(endAt, () => {
      if (holder.holding !== message) return; // the consumer died holding it
      holder.busy = false;
      holder.holding = null;

      if (message.poison) {
        setConsumer(endAt, index, 'fail');
        cue(endAt, 'failure');
        sendBack(message, index, endAt);
        const freeAt = round(endAt + FAIL_FLASH);
        schedule(freeAt, () => {
          holder.idleSince = freeAt;
          setConsumer(freeAt, index, 'idle');
          pump(freeAt);
        });
        return;
      }

      holder.idleSince = endAt;
      setConsumer(endAt, index, 'idle');
      message.acked = true;
      chip.states.push([endAt, duplicate ? 'skipped' : 'done']);
      chip.fadeAt = endAt;
      cue(endAt, 'success');
      if (!duplicate) record(endAt, message);
      checkOrder(endAt, message);
      pump(endAt);
    });
  }

  /** The chip leaves a consumer that did not acknowledge and climbs back. */
  function sendBack(message: Message, index: number, at: number): void {
    const chip = chips[message.index];
    if (chip) {
      chip.states.push([at, 'redelivered']);
      move(chip, at, CONSUMER_X[index] ?? 0, Y_BACK, BACK_UP);
      move(chip, round(at + BACK_UP), HEAD_X, Y_BACK, BACK_ACROSS);
      move(chip, round(at + BACK_UP + BACK_ACROSS), HEAD_X, Y_QUEUE, BACK_IN);
    }
    const backAt = round(at + TO_QUEUE_HEAD);
    schedule(backAt, () => requeue(message, backAt));
  }

  /** The shared store remembers every id handled while step 3 runs. */
  function record(at: number, message: Message): void {
    if (message.sentAt < RENUMBER_AT || message.key !== null) return;
    if (seen.includes(message.label)) return;
    seen.push(message.label);
    setAttr(at, `seen-${seen.length}`, 'data-entry', 'on');
  }

  /** A key finished out of turn is the price competing consumers charge. */
  function checkOrder(at: number, message: Message): void {
    const key = message.key;
    if (key === null || warned.has(key)) return;
    const earlier = arrived.some(
      (item) => item.key === key && item.index < message.index && !item.acked,
    );
    if (!earlier) return;
    warned.add(key);
    flash(at, 'data-warn', WARN_HOLD);
    cue(at, 'trip');
  }

  /** A message that came back: it goes to the head, or it goes to the DLQ. */
  function requeue(message: Message, at: number): void {
    const chip = chips[message.index];
    flash(at, 'data-redeliver', FLASH_HOLD);
    cue(at, 'trip');
    if (message.deliveries >= MAX_DELIVERIES) {
      // It never joins the queue again: it pauses at the head and is routed out,
      // so the depth the reader counts stays the count of what can still be run.
      const goAt = round(at + DEAD_DWELL);
      schedule(goAt, () => {
        if (chip) {
          chip.states.push([goAt, 'dead']);
          move(chip, goAt, HEAD_X, Y_BACK, DEAD_UP);
          move(chip, round(goAt + DEAD_UP), DLQ_X, Y_BACK, DEAD_ACROSS);
          move(chip, round(goAt + DEAD_UP + DEAD_ACROSS), DLQ_X, Y_WORK, DEAD_IN);
        }
        const landAt = round(goAt + DEAD_UP + DEAD_ACROSS + DEAD_IN);
        setAttr(landAt, 'stage', 'data-dlq', 'on');
        cue(landAt, 'trip');
      });
      return;
    }
    message.queuedAt = at;
    // The chip lands on the head column, so the queue makes room ahead of it.
    message.renderSlot = 0;
    queue.unshift(message);
    reseat(at, -SHIFT - CLEAR_SIDE);
    slotFree[0] = Number.POSITIVE_INFINITY;
    setDepth(at);
    pump(at);
  }

  // --- the deployment itself -----------------------------------------------

  ONLINE.forEach((at, index) => {
    if (at <= 0) return;
    schedule(at, () => {
      const holder = consumers[index];
      if (holder) holder.idleSince = at;
      setConsumer(at, index, 'idle');
      if (index % 2 === 1) {
        flash(at, 'data-scale', FLASH_HOLD);
        cue(at, 'trip');
      }
      pump(at);
    });
  });

  schedule(CRASH_AT, () => {
    const holder = consumers[CRASH_CONSUMER];
    const message = holder?.holding ?? null;
    if (!holder || !message) return;
    holder.busy = false;
    holder.holding = null;
    setConsumer(CRASH_AT, CRASH_CONSUMER, 'down');
    cue(CRASH_AT, 'trip');
    // The bar stops where the process stopped rather than finishing on its own.
    if (message.run) {
      message.run.peak = round(((CRASH_AT - message.run.from) / WORK) * 1000) / 1000;
      message.run.to = CRASH_AT;
    }
    sendBack(message, CRASH_CONSUMER, CRASH_AT);
  });

  schedule(RECOVER_AT, () => {
    const holder = consumers[CRASH_CONSUMER];
    if (holder) holder.idleSince = RECOVER_AT;
    setConsumer(RECOVER_AT, CRASH_CONSUMER, 'idle');
    cue(RECOVER_AT, 'state');
    pump(RECOVER_AT);
  });

  schedule(PARTITION_AT, () => {
    partitioned = true;
    setAttr(PARTITION_AT, 'stage', 'data-store', 'keys');
    cue(PARTITION_AT, 'state');
    pump(PARTITION_AT);
  });

  // --- one message at a time ------------------------------------------------

  ARRIVALS.forEach((arrival, index) => {
    const chip = chips[index];
    if (!chip) return;
    const bornAt = round(arrival.at - TO_QUEUE);
    chip.showAt = bornAt;
    const message: Message = {
      index,
      label: arrival.label,
      key: arrival.key ?? null,
      work: arrival.work ?? WORK,
      poison: arrival.poison === true,
      copy: arrival.copy === true,
      sentAt: arrival.at,
      queuedAt: arrival.at,
      deliveries: 0,
      renderSlot: 0,
      acked: false,
      run: null,
    };
    schedule(arrival.at, () => {
      arrived.push(message);
      if (message.copy) {
        // A redelivery from the broker joins at the head, not at the tail.
        message.renderSlot = 0;
        queue.unshift(message);
        chip.states.push([arrival.at, 'duplicate']);
        reseat(arrival.at, -SHIFT - CLEAR_SIDE);
        arrive(chip, bornAt, 0);
      } else {
        queue.push(message);
        message.renderSlot = queue.length - 1;
        arrive(chip, bornAt, message.renderSlot);
      }
      setDepth(arrival.at);
      pump(arrival.at);
    });
  });

  drain();

  // --- the meters, once every run is known ---------------------------------

  const bars = runs.map((list) =>
    barCurve(list, SCENE_DURATION).map((segment) => ({
      from: round(segment.from),
      to: round(segment.to),
      vFrom: round(segment.vFrom * BAR_W),
      vTo: round(segment.vTo * BAR_W),
    })),
  );
  const latency = stepCurve(waits, SCENE_DURATION).map((segment) => ({
    from: round(segment.from),
    to: round(segment.to),
    vFrom: round(Math.min(1, segment.vFrom / LAT_MAX) * LAT_W),
    vTo: round(Math.min(1, segment.vTo / LAT_MAX) * LAT_W),
  }));
  for (const [at, wait] of waits) {
    const level = wait >= LAT_HOT ? 'hot' : wait >= LAT_WARN ? 'warn' : 'ok';
    setAttr(at, 'stage', 'data-latency', level);
  }

  // --- put the discrete changes in time order ------------------------------

  const inTimeOrder = raw
    .map((entry, order) => ({ entry, order }))
    .sort((left, right) => left.entry.at - right.entry.at || left.order - right.order)
    .map(({ entry }) => entry);

  const folded: AttrChange[] = [];
  for (const entry of inTimeOrder) {
    collapseAtInstant(folded, entry, (change) => `${change.key}@${change.name}`);
  }

  const state = new Map<string, string>(Object.entries(STAGE_STATE));
  const attrs: AttrChange[] = [];
  for (const change of folded) {
    const id = `${change.key}@${change.name}`;
    if (state.get(id) === change.value) continue;
    state.set(id, change.value);
    attrs.push(change);
  }

  cues.sort((left, right) => left[0] - right[0]);

  return { chips, attrs, bars, latency, cues, seen, keys, fade: CHIP_FADE };
}

export const SIMULATION: Simulation = simulate();

// --- markup -----------------------------------------------------------------

const depth = counterVariants({
  x: 910,
  y: 936,
  className: 'cc-depth',
  max: SLOT_COUNT,
  anchor: 'end',
  format: (n) => `depth ${n}`,
});

const latencyMeter = `<text class="scene-caption-label cc-lat-label" x="345" y="1178">latency</text>
    ${trackAndFill({
      x: LAT_X,
      y: LAT_Y,
      width: LAT_W,
      height: 18,
      rx: 9,
      className: 'cc-lat',
    })}`;

/** One consumer: its progress bar and its name, both clear of the chip's row. */
const consumer = (index: number): string => {
  const left = CONSUMER_LEFT[index] ?? 0;
  const centre = CONSUMER_X[index] ?? 0;
  return serviceBox({
    x: left,
    width: CONSUMER_W,
    y: CONSUMER_TOP,
    height: CONSUMER_H,
    title: `Consumer ${index + 1}`,
    titleX: left + 11,
    titleY: 1710,
    titleClass: 'cc-consumer-label',
    titleAnchor: null,
    className: `cc-consumer cc-consumer--${index + 1}`,
    attrs: ` data-consumer="${index === 0 ? 'idle' : 'absent'}"`,
    boxClass: 'scene-box cc-consumer-box',
    children: `
    ${trackAndFill({
      x: centre - BAR_W / 2,
      y: BAR_Y,
      width: BAR_W,
      height: 16,
      rx: 8,
      className: 'cc-bar',
    })}`,
  });
};

/** One message chip. It is drawn on the origin and carried by the timeline. */
const messageChip = (label: string, index: number): string =>
  `<g class="cc-chip cc-chip--${index + 1}" data-chip="queued">
      <rect class="cc-chip-bg" x="${-CHIP_W / 2}" y="${-CHIP_H / 2}" width="${CHIP_W}" height="${CHIP_H}" rx="12" />
      <text class="scene-mono cc-chip-text" x="0" y="7" text-anchor="middle">${label}</text>
      <text class="cc-chip-note cc-chip-ack" x="0" y="38" text-anchor="middle">ack</text>
      <text class="cc-chip-note cc-chip-skip" x="0" y="38" text-anchor="middle">skip</text>
    </g>`;

/** One row of the shared store: a handled id, or a key and who owns it. */
const entry = (
  label: string,
  index: number,
  count: number,
  kind: 'seen' | 'key',
  width: number,
  step: number,
  last: number,
): string => {
  const centre = last - step * (count - 1 - index);
  return `<g class="cc-entry cc-entry--${kind} cc-${kind}--${index + 1}" data-entry="off">
      <rect class="cc-entry-bg" x="${centre - width / 2}" y="${ENTRY_Y}" width="${width}" height="${ENTRY_H}" rx="12" />
      <text class="scene-mono cc-entry-text cc-entry-text--${kind}" x="${centre}" y="${ENTRY_Y + 30}" text-anchor="middle">${label}</text>
    </g>`;
};

const seenEntries = SIMULATION.seen
  .map((label, index) =>
    entry(label, index, SIMULATION.seen.length, 'seen', SEEN_W, SEEN_STEP, SEEN_LAST),
  )
  .join('\n    ');

const keyEntries = SIMULATION.keys
  .map((label, index) =>
    entry(label, index, SIMULATION.keys.length, 'key', KEY_W, KEY_STEP, KEY_LAST),
  )
  .join('\n    ');

const lanes = [...CONSUMER_X, DLQ_X].map((x) => verticalLink(x, Y_FAN, CONSUMER_TOP)).join('\n  ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" data-depth="0" data-latency="ok" data-store="seen" data-dlq="off" data-scale="off" data-warn="off" data-redeliver="off" aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_LANE, 680, NODE_Y)}
  ${verticalLink(HEAD_X, NODE_Y + NODE_H, Y_FAN)}
  <line class="scene-link" x1="${HEAD_X}" y1="${Y_FAN}" x2="${DLQ_X}" y2="${Y_FAN}" />
  ${lanes}

  ${clientBox({ title: 'Producer', titleY: 512 })}

  ${nodeFrame({
    y: NODE_Y,
    height: NODE_H,
    label: 'Queue',
    labelY: 936,
    children: `    <text class="scene-caption-label cc-prefetch" x="300" y="936">prefetch 1</text>
    ${depth}
    <rect class="scene-track cc-queue-track" x="${TRACK_X}" y="${TRACK_Y}" width="${TRACK_W}" height="${TRACK_H}" rx="24" />
    ${latencyMeter}`,
  })}

  <text class="scene-flash cc-redeliver" x="410" y="1254" text-anchor="middle">redeliver</text>
  <text class="scene-flash cc-warn" x="640" y="1254" text-anchor="middle">out of order</text>
  <text class="scene-flash cc-scale" x="880" y="1254" text-anchor="middle">+2</text>

  ${consumer(0)}

  ${consumer(1)}

  ${consumer(2)}

  ${consumer(3)}

  ${consumer(4)}

  ${serviceBox({
    x: DLQ_LEFT,
    width: DLQ_W,
    y: CONSUMER_TOP,
    height: CONSUMER_H,
    title: 'DLQ',
    titleY: 1710,
    titleClass: 'cc-dlq-label',
    className: 'cc-dlq',
    boxClass: 'scene-box cc-dlq-box',
  })}

  <g class="cc-store">
    <rect class="scene-box cc-store-box" x="${STORE_X}" y="${STORE_Y}" width="${STORE_W}" height="${STORE_H}" rx="24" />
    <text class="scene-node-label cc-store-label cc-store-label--seen" x="${STORE_LABEL_X}" y="${STORE_LABEL_Y}">seen</text>
    <text class="scene-node-label cc-store-label cc-store-label--keys" x="${STORE_LABEL_X}" y="${STORE_LABEL_Y}">partition by key</text>
    ${seenEntries}
    ${keyEntries}
  </g>

  <g class="cc-messages">
    ${CHIP_LABELS.map(messageChip).join('\n    ')}
  </g>

  ${requestsLayer()}
</svg>`;
