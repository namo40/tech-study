import gsap from 'gsap';
import {
  BALANCES,
  EMITS,
  P0_CELLS,
  P1_CELLS,
  SCENE_DURATION,
  SLOTS,
  X_P0,
  X_P1,
  Y_CONSUMERS_TOP,
  Y_PART_BOTTOM,
  Y_PART_TOP,
  Y_PRODUCER_BOTTOM,
} from './stage';
import type { CellState, EmitState, Level, Mark, Mode, SlotState, Verdict } from './stage';
import { q } from '../shared/dom';
import {
  attachToRequest,
  hideRequest,
  markRequest,
  mountRequests,
  parkRequest,
  showRequest,
} from '../shared/request';
import { createScheduler } from '../shared/simulation';
import { attr, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Ordering scene: a 24 second, four step timeline.
 *
 * The two standing rules apply here as everywhere: every tween sits at an
 * absolute position, and every discrete change is a zero-duration tween on a
 * `data-*` attribute that GSAP reverts when the playhead moves back past it.
 *
 * Nothing the reader counts is authored. The scene is told four things — when
 * the Producer emits an event and what key and amount it carries, how the key
 * is routed to a partition, how fast each consumption path moves, and when the
 * middle band stops being one log and starts being two partitions. One pass
 * over the whole 24 seconds turns that into everything else: which cell an
 * event lands in, the order the Consumers process things in, every `balance`,
 * the `in order` / `reordered` verdict, the `hot` gauge, whether P1 is idle,
 * and when the picture settles.
 *
 * Three derivations carry the argument. **The overtake is not drawn, it is
 * raced.** In the first step the only authored difference between the two
 * consumption paths is how long each takes to travel its lane; `-30` leaves
 * second, is picked up second, and finishes first because its path is quicker.
 * Nothing is lost and nothing is duplicated — the multiset of processed events
 * equals the multiset published, and the build asserts it — so the moment the
 * balance goes negative is produced by processing order and by nothing else.
 * **Order inside a key is a consequence of routing, not a promise added on
 * top.** Once a key maps to a partition, that partition's log is appended to in
 * publish order and drained by one consumer from the oldest cell, so
 * per-key processing order equals per-key publish order by construction; the
 * build asserts that too. **The gauge is the backlog.** `hot` is a pure
 * function of how many of P0's cells are appended and not yet processed, so the
 * third step's skew is not a colour the scene chooses: it is what a burst on one
 * key does to a queue with one consumer.
 *
 * One thing is a picture rather than a measurement. No cell, mark or slot
 * carries a number. Which event is which is its position in its row, because
 * position *is* the sequence this scene is about, and writing the sequence a
 * second time is what would let the two copies disagree.
 */

const ID = 'ordering';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

const BOUNDARIES = [0, 6, 12, 18, 24];

// --- how a traveller moves -------------------------------------------------

/** The routing lane: 200px from the Producer down to a partition. */
const LEG_IN = 0.26;
/** A consumption lane under key routing: 230px from a partition down. */
const LEG_OUT = 0.32;

/** How long a traveller takes to fade, and how long a verdict marker holds. */
const FADE_IN_LEG = 0.1;
const MARK_HOLD = 0.22;
const MARK_FADE = 0.14;

// --- what the scene is told ------------------------------------------------

/** The two accounts. `k7` is the popular one, which is the whole third step. */
type Key = 'k7' | 'k9';

/** Which partition a key is routed to, once routing exists at all. */
const ROUTE: Record<Key, Part> = { k7: 'p0', k9: 'p1' };

/** The two partitions, which are also the two lane columns. */
type Part = 'p0' | 'p1';

interface Publish {
  at: number;
  key: Key;
  /** What the event does to the account, for the key the balance is about. */
  amount: number | null;
}

/**
 * Every event the Producer emits. Four bursts with four different shapes: two
 * events on one account to start, an even trickle once routing exists, a rush
 * of the popular key, and finally a spread. The amounts on `k7` alternate, so
 * the stage only ever draws two amount labels, and the balance is still a
 * running total of them.
 */
const PUBLISHES: Publish[] = [
  // Step 1. No routing rule yet, so the Producer just alternates lanes.
  { at: 0.5, key: 'k7', amount: 100 },
  { at: 1.0, key: 'k7', amount: -30 },
  // Step 2. One key per partition, at a pace one consumer can hold.
  { at: 6.8, key: 'k7', amount: 100 },
  { at: 7.4, key: 'k9', amount: null },
  { at: 8.0, key: 'k7', amount: -30 },
  { at: 9.2, key: 'k7', amount: 100 },
  { at: 9.8, key: 'k9', amount: null },
  // Step 3. The popular key arrives in a burst and P1 gets one event.
  { at: 12.5, key: 'k7', amount: -30 },
  { at: 12.66, key: 'k7', amount: 100 },
  { at: 12.8, key: 'k9', amount: null },
  { at: 12.82, key: 'k7', amount: -30 },
  { at: 12.98, key: 'k7', amount: 100 },
  { at: 13.14, key: 'k7', amount: -30 },
  { at: 13.3, key: 'k7', amount: 100 },
  // Step 4. The same keys, spread the way a redesigned key space spreads them.
  { at: 19.2, key: 'k9', amount: null },
  { at: 19.6, key: 'k7', amount: -30 },
  { at: 20.4, key: 'k9', amount: null },
  { at: 21.1, key: 'k7', amount: 100 },
  { at: 21.6, key: 'k9', amount: null },
];

/** When the middle band stops being one log and starts being two partitions. */
const MODE_AT = 6.4;

/** Everything the scene is told about one consumption path. */
interface PathPlan {
  id: string;
  /** Seconds the path takes to carry one event down its lane. */
  leg: number;
  /** When it first looks for something to process. */
  firstPoll: number;
  /** How often it looks when it found nothing. */
  idle: number;
  /** How long after finishing one event it looks for the next. */
  gap: number;
  /** The window it works in, which is which side of the mode change it is on. */
  from: number;
  until: number;
}

/**
 * The two paths of the first step. The only thing that separates them is `leg`:
 * the left path is slow and the right path is quick, and that difference is the
 * entire authored input behind the overtake.
 */
const SINGLE_PATHS: PathPlan[] = [
  { id: 'slow', leg: 2.8, firstPoll: 1.6, idle: 0.3, gap: 0.4, from: 0, until: MODE_AT },
  { id: 'fast', leg: 1.2, firstPoll: 2.4, idle: 0.3, gap: 0.4, from: 0, until: MODE_AT },
];

/**
 * One consumer per partition, from the moment partitions exist. Neither one
 * ever changes pace: what changes across the scene is only how many events the
 * key distribution sends them, which is what makes the third step's backlog the
 * distribution's fault rather than the consumer's.
 */
const KEYED_PATHS: Record<Part, PathPlan> = {
  p0: { id: 'p0', leg: LEG_OUT, firstPoll: 6.62, idle: 0.24, gap: 0.4, from: MODE_AT, until: SCENE_DURATION },
  p1: { id: 'p1', leg: LEG_OUT, firstPoll: 6.75, idle: 0.28, gap: 0.44, from: MODE_AT, until: SCENE_DURATION },
};

/** Where the gauge changes what it says, counted in P0 cells not yet processed. */
const WARM_AT = 2;
const HOT_AT = 4;

/** Which way the gauge moved, so only a rise is heard as a warning. */
const LEVELS_ORDER: Record<Level, number> = { calm: 0, warm: 1, hot: 2 };

/** When the scene holds something up, and for how long. */
const MARK_KEYS_AT = 11.0;
const MARK_COST_AT = 17.2;
const MARK_DESIGN_AT = 18.4;
const MARK_FOR = 0.8;

/** How long after the last event is processed the picture calls itself settled. */
const SETTLE_LAG = 0.25;

/** How close two samples of one repeating thing may sound, how close any cue
    may fall to another, and how close any of it may fall to a boundary. */
const SAMPLE_GAP: Record<string, number> = {
  publish: 0.9,
  skew: 0.55,
  k7: 0.9,
  k9: 0.9,
};
const MIN_CUE_GAP = 0.2;
const BOUNDARY_GAP = 0.3;

/** Times are rounded to milliseconds, so a gap of exactly the minimum is one. */
const EPS = 1e-6;

// --- what one pass over the scene produces ---------------------------------

/** Which of the four declared segments a traveller is on. */
type Lane = 'in-p0' | 'in-p1' | 'out-p0' | 'out-p1';

interface Traveller {
  lane: Lane;
  /** The key it carries, which is also how it is drawn. */
  key: Key;
  start: number;
  land: number;
  /** How long the leg takes, which differs per path in the first step. */
  leg: number;
  /** The amount label the event carries, when it carries one. */
  amount: number | null;
  /** The verdict the traveller pops when it lands, or nothing for a routing leg. */
  result: 'ok' | 'fail' | null;
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
  flags: Record<string, Series[]>;
  emits: Series[][];
  cells: Record<Part, Series[][]>;
  ghost: Series[][];
  slots: Series[][];
  travellers: Traveller[];
  cues: [number, SceneCue][];
  /** Read back by the build, so a drift in the schedule fails loudly. */
  processed: number;
  balance: number;
  settledAt: number | null;
}

// --- the simulation --------------------------------------------------------

/** One event, from the moment the Producer emits it. */
interface Event {
  /** Position in the Producer's row, counting from one. */
  index: number;
  key: Key;
  amount: number | null;
  /** Position among this key's events, which is the order it must keep. */
  keySeq: number;
  /** Where it was appended: a partition, or a side of the first step's log. */
  part: Part;
  /** Position in that row, counting from one. */
  cell: number;
  /** Whether the first step's bridged log holds it rather than a partition. */
  ghost: boolean;
  appendedAt: number;
  takenAt: number | null;
  landedAt: number | null;
}

/**
 * Walks the whole scene in time order.
 *
 * The publishes are booked first, because everything else is downstream of an
 * event existing: a cell can only go live once something was appended to it, a
 * consumer can only take a cell that is live, and the gauge can only read a
 * backlog that something put there. Booked events run earliest first and a
 * running one may book more, so a consumer that polls at 12.86 sees exactly the
 * cells appended before it and nothing that comes later.
 */
function simulate(): Simulation {
  interface Entry {
    key: string;
    at: number;
    value: string;
    order: number;
  }

  const raw: Entry[] = [];
  let order = 0;
  const record = (key: string, at: number, value: string): void => {
    order += 1;
    raw.push({ key, at: round(at), value, order });
  };

  const travellers: Traveller[] = [];
  const fixed: Fixed[] = [];
  const candidates: Candidate[] = [];
  const problems: string[] = [];

  const fix = (at: number, name: SceneCue, family: string | null = null): void => {
    if (at < 0 || at > SCENE_DURATION) return;
    fixed.push({ at: round(at), family, name });
  };
  const sample = (at: number, family: string, name: SceneCue): void => {
    if (at < 0 || at > SCENE_DURATION) return;
    candidates.push({ at: round(at), family, name });
  };

  /** Puts one traveller on a segment and answers when it gets to the far end. */
  const travel = (
    lane: Lane,
    key: Key,
    start: number,
    leg: number,
    amount: number | null,
    result: 'ok' | 'fail' | null,
  ): number => {
    const land = round(start + leg);
    travellers.push({ lane, key, start: round(start), land, leg, amount, result });
    return land;
  };

  // --- what the diagram is holding ----------------------------------------

  const events: Event[] = [];
  /** The two partition logs, plus the first step's bridged log. */
  const rows: Record<Part, Event[]> = { p0: [], p1: [] };
  const ghostRow: Event[] = [];
  const keyCount: Record<Key, number> = { k7: 0, k9: 0 };

  let balance = 0;
  let processed = 0;
  let violations = 0;
  let hot: Level = 'calm';
  let idle = false;
  let settledAt: number | null = null;
  let mode: Mode = 'single';

  const { schedule, drain } = createScheduler();

  // --- the opening state, which is the whole diagram -----------------------

  record('mode', 0, 'single' satisfies Mode);
  record('balance', 0, '0');
  record('verdict', 0, 'ordered' satisfies Verdict);
  record('hot', 0, 'calm' satisfies Level);
  record('idle', 0, 'off');
  record('mark', 0, 'none' satisfies Mark);
  record('settled', 0, 'off');
  for (let n = 1; n <= EMITS; n += 1) record(`emit-${n}`, 0, 'none' satisfies EmitState);
  for (let n = 1; n <= P0_CELLS; n += 1) record(`p0-${n}`, 0, 'none' satisfies CellState);
  for (let n = 1; n <= P1_CELLS; n += 1) record(`p1-${n}`, 0, 'none' satisfies CellState);
  for (let n = 1; n <= 2; n += 1) record(`ghost-${n}`, 0, 'none' satisfies CellState);
  for (let n = 1; n <= SLOTS; n += 1) record(`slot-${n}`, 0, 'none' satisfies SlotState);

  /**
   * The gauge, recomputed wherever P0's backlog can have changed. It reads the
   * partition's cells and nothing else, so there is no way for it to disagree
   * with the row above it.
   */
  const readGauge = (at: number): void => {
    const backlog = rows.p0.filter((event) => event.landedAt === null).length;
    const level: Level = backlog >= HOT_AT ? 'hot' : backlog >= WARM_AT ? 'warm' : 'calm';
    if (level === hot) return;
    const rising = LEVELS_ORDER[level] > LEVELS_ORDER[hot];
    hot = level;
    record('hot', at, level);
    // The peak is the one reading worth hearing, and it is a warning.
    if (level === 'hot' && rising) fix(at, 'failure');
  };

  /**
   * Whether one partition is standing still while the other is over its head.
   * Both halves are read off the two rows, so "idle" is never a word the scene
   * chose: it is what having no backlog next to a hot neighbour looks like.
   */
  const readIdle = (at: number): void => {
    const busy = rows.p0.filter((event) => event.landedAt === null).length;
    const other = rows.p1.filter((event) => event.landedAt === null).length;
    const now = busy >= HOT_AT && other === 0;
    if (now === idle) return;
    idle = now;
    record('idle', at, now ? 'on' : 'off');
    if (now) fix(at, 'state');
  };

  // --- the publishes, and the cells they become ----------------------------

  PUBLISHES.forEach((publish, index) => {
    const emitIndex = index + 1;
    schedule(publish.at, () => {
      keyCount[publish.key] += 1;
      // The sequence is fixed when the Producer emits, not when the event
      // arrives, because publish order is the thing the scene is measuring
      // against and a burst would otherwise renumber itself in flight.
      const keySeq = keyCount[publish.key];
      record(`emit-${emitIndex}`, publish.at, publish.key satisfies EmitState);

      // With no routing rule the Producer simply alternates lanes, which is the
      // point: nothing about the event decided where it went. Once routing
      // exists, the key decides, and the lane is the partition.
      const part: Part = mode === 'keyed' ? ROUTE[publish.key] : index % 2 === 0 ? 'p0' : 'p1';
      const lane: Lane = part === 'p0' ? 'in-p0' : 'in-p1';
      const arrive = travel(lane, publish.key, publish.at, LEG_IN, publish.amount, null);
      const ghost = mode === 'single';

      schedule(arrive, () => {
        const row = ghost ? ghostRow : rows[part];
        const cell = row.length + 1;
        const event: Event = {
          index: emitIndex,
          key: publish.key,
          amount: publish.amount,
          keySeq,
          part,
          cell,
          ghost,
          appendedAt: arrive,
          takenAt: null,
          landedAt: null,
        };
        row.push(event);
        events.push(event);
        record(ghost ? `ghost-${cell}` : `${part}-${cell}`, arrive, 'live' satisfies CellState);
        readGauge(arrive);
        readIdle(arrive);
      });

      // The first two publishes are the premise of the whole scene, so both are
      // heard rather than thinned; the third step's rush is its own family,
      // because a burst that sounds once does not read as a burst.
      if (publish.at < MODE_AT) fix(publish.at, 'state', 'publish');
      else if (publish.at >= 12 && publish.at < 18) sample(publish.at, 'skew', 'state');
      else sample(publish.at, 'publish', 'state');
    });
  });

  schedule(MODE_AT, () => {
    mode = 'keyed';
    record('mode', MODE_AT, 'keyed' satisfies Mode);
    // The verdict is about the regime being watched. Routing replaces the
    // bridged log with two partitions, so there is nothing left of the first
    // step for it to be a verdict on.
    violations = 0;
    record('verdict', MODE_AT, 'ordered' satisfies Verdict);
    fix(MODE_AT, 'trip');
  });

  // --- what each consumption path processes, at its own pace ---------------

  /** The oldest cell in a row that nobody has picked up yet. */
  const oldest = (row: Event[]): Event | null =>
    row.find((event) => event.takenAt === null) ?? null;

  const finish = (event: Event, at: number, traveller: Traveller): void => {
    event.landedAt = at;
    processed += 1;

    // In publish order for its key, or not. `expected` is the lowest sequence
    // this key has not processed yet, so the event that overtook is the one
    // flagged and the one it overtook is not.
    const expected = Math.min(
      ...events
        .filter((other) => other.key === event.key && other.landedAt === null)
        .map((other) => other.keySeq),
      event.keySeq,
    );
    const inOrder = event.keySeq === expected;
    // The marker the traveller pops is the verdict on its own arrival, so a
    // cross is never a colour: it is a cross.
    traveller.result = inOrder ? 'ok' : 'fail';
    if (!inOrder) {
      violations += 1;
      if (violations === 1) {
        record('verdict', at, 'reordered' satisfies Verdict);
        fix(at, 'failure');
      }
    }

    record(
      `slot-${processed}`,
      at,
      (inOrder ? event.key : 'oops') satisfies SlotState,
    );
    record(event.ghost ? `ghost-${event.cell}` : `${event.part}-${event.cell}`, at, 'done' satisfies CellState);

    if (event.amount !== null) {
      balance += event.amount;
      if (!BALANCES.includes(balance as (typeof BALANCES)[number])) {
        problems.push(`balance reached ${balance} at ${at}, which the stage cannot draw`);
      }
      record('balance', at, String(balance));
    }

    readGauge(at);
    readIdle(at);

    // A landing is heard as one of three things: the verdict on an overtake,
    // the first step's second arrival where the total comes right after the
    // journey went wrong, or one of the two per-partition rhythms.
    if (!inOrder) return;
    if (event.ghost) fix(at, 'state');
    else sample(at, event.key, event.key === 'k7' ? 'success' : 'state');

    if (processed === PUBLISHES.length) {
      const settle = round(at + SETTLE_LAG);
      settledAt = settle;
      schedule(settle, () => {
        record('settled', settle, 'on');
        fix(settle, 'success');
      });
    }
  };

  const runPath = (plan: PathPlan, pick: () => Event | null, laneOf: (event: Event) => Lane): void => {
    const poll = (at: number): void => {
      if (at > plan.until || at > SCENE_DURATION) return;
      schedule(at, () => {
        const event = pick();
        if (!event) {
          poll(round(at + plan.idle));
          return;
        }
        event.takenAt = at;
        const land = travel(laneOf(event), event.key, at, plan.leg, event.amount, 'ok');
        const traveller = travellers[travellers.length - 1];
        if (!traveller) return;
        schedule(land, () => finish(event, land, traveller));
        poll(round(land + plan.gap));
      });
    };
    poll(plan.firstPoll);
  };

  // The first step's two paths share one log: neither of them owns a key,
  // because there is no key rule yet. Each carries what it took down the lane
  // the cell was sitting on, so the picture never teleports an event sideways.
  for (const plan of SINGLE_PATHS) {
    runPath(
      plan,
      () => oldest(ghostRow),
      (event) => (event.part === 'p0' ? 'out-p0' : 'out-p1'),
    );
  }

  // Under routing there is one consumer per partition, and it drains its own
  // row from the oldest cell. That is the whole mechanism behind per-key order.
  for (const part of ['p0', 'p1'] as const) {
    runPath(
      KEYED_PATHS[part],
      () => oldest(rows[part]),
      () => (part === 'p0' ? 'out-p0' : 'out-p1'),
    );
  }

  // --- the three things the scene holds up --------------------------------

  for (const [at, value, name] of [
    [MARK_KEYS_AT, 'keys', 'state'],
    [MARK_COST_AT, 'cost', 'state'],
    [MARK_DESIGN_AT, 'design', 'trip'],
  ] as [number, Mark, SceneCue][]) {
    schedule(at, () => {
      record('mark', at, value);
      fix(at, name);
    });
    schedule(round(at + MARK_FOR), () =>
      record('mark', round(at + MARK_FOR), 'none' satisfies Mark),
    );
  }

  // --- run it --------------------------------------------------------------

  drain();

  if (processed !== PUBLISHES.length) {
    throw new Error(`${ID} scene: ${processed} of ${PUBLISHES.length} events were processed`);
  }
  if (events.length !== PUBLISHES.length) {
    throw new Error(`${ID} scene: ${events.length} events reached a log, ${PUBLISHES.length} were published`);
  }
  if (rows.p0.length > P0_CELLS || rows.p1.length > P1_CELLS || ghostRow.length > 2) {
    throw new Error(`${ID} scene: a log outgrew the row the stage draws`);
  }
  if (settledAt === null) throw new Error(`${ID} scene: the picture never settled`);

  // Nothing lost, nothing duplicated: every published event was appended once
  // and processed once, which is what makes the negative balance a matter of
  // order alone.
  const seen = new Set<number>();
  for (const event of events) {
    if (seen.has(event.index)) problems.push(`event ${event.index} reached a log twice`);
    seen.add(event.index);
    if (event.landedAt === null) problems.push(`event ${event.index} was never processed`);
  }

  // Inside one key, under routing, processing order is publish order.
  for (const key of ['k7', 'k9'] as const) {
    const done = events
      .filter((event) => event.key === key && !event.ghost)
      .sort((left, right) => (left.landedAt ?? 0) - (right.landedAt ?? 0));
    done.forEach((event, index) => {
      if (event.keySeq !== (done[0]?.keySeq ?? 1) + index) {
        problems.push(`${key} processed sequence ${event.keySeq} in position ${index + 1}`);
      }
    });
  }

  if (problems.length > 0) throw new Error(`${ID} scene: ${problems.join('; ')}`);

  // --- the series, put in time order and collapsed -------------------------

  // Changes are recorded as they are worked out rather than as they happen — a
  // landing writes a slot, a cell, a balance and two readings in one pass — so
  // each key is sorted once here. Two changes to one key at one instant would
  // otherwise render in insertion order forwards and in reverse backwards, so
  // only the one that ends up applying is kept.
  const seriesOf = (key: string): Series[] => {
    const sorted = raw
      .filter((entry) => entry.key === key)
      .sort((left, right) => left.at - right.at || left.order - right.order);
    const atInstant: Series[] = [];
    for (const entry of sorted) {
      const last = atInstant[atInstant.length - 1];
      if (last && last.at === entry.at) last.value = entry.value;
      else atInstant.push({ at: entry.at, value: entry.value });
    }
    const out: Series[] = [];
    for (const entry of atInstant) {
      const last = out[out.length - 1];
      if (last && last.value === entry.value) continue;
      out.push(entry);
    }
    return out;
  };

  const flags: Record<string, Series[]> = {};
  for (const key of ['mode', 'balance', 'verdict', 'hot', 'idle', 'mark', 'settled']) {
    flags[key] = seriesOf(key);
  }
  const emitSeries = Array.from({ length: EMITS }, (_value, index) => seriesOf(`emit-${index + 1}`));
  const cellSeries: Record<Part, Series[][]> = {
    p0: Array.from({ length: P0_CELLS }, (_value, index) => seriesOf(`p0-${index + 1}`)),
    p1: Array.from({ length: P1_CELLS }, (_value, index) => seriesOf(`p1-${index + 1}`)),
  };
  const ghostSeries = Array.from({ length: 2 }, (_value, index) => seriesOf(`ghost-${index + 1}`));
  const slotSeries = Array.from({ length: SLOTS }, (_value, index) => seriesOf(`slot-${index + 1}`));

  // --- the cues ------------------------------------------------------------

  // Same shape as the other scenes: everything the scene has to say is kept,
  // and the repeating families are thinned to samples so a landing is heard
  // often enough to read as a rhythm without becoming one.
  const accepted: Fixed[] = fixed
    .filter((entry) => !BOUNDARIES.some((edge) => Math.abs(entry.at - edge) < BOUNDARY_GAP - EPS))
    .sort((left, right) => left.at - right.at)
    .filter(
      (entry, index, list) =>
        index === 0 || entry.at - (list[index - 1]?.at ?? -99) >= MIN_CUE_GAP - EPS,
    );

  const lastOf: Record<string, number> = { publish: -99, skew: -99, k7: -99, k9: -99 };
  candidates.sort((left, right) => left.at - right.at);
  for (const candidate of candidates) {
    let previous = lastOf[candidate.family] ?? -99;
    for (const other of accepted) {
      if (other.family === candidate.family && other.at < candidate.at && other.at > previous) {
        previous = other.at;
      }
    }
    if (candidate.at - previous < (SAMPLE_GAP[candidate.family] ?? 0.9) - EPS) continue;
    if (BOUNDARIES.some((edge) => Math.abs(candidate.at - edge) < BOUNDARY_GAP - EPS)) continue;
    if (accepted.some((other) => Math.abs(other.at - candidate.at) < MIN_CUE_GAP - EPS)) continue;
    lastOf[candidate.family] = candidate.at;
    accepted.push({ at: candidate.at, family: candidate.family, name: candidate.name });
    accepted.sort((left, right) => left.at - right.at);
  }

  const cues: [number, SceneCue][] = accepted
    .map((entry) => [entry.at, entry.name] as [number, SceneCue])
    .sort((left, right) => left[0] - right[0]);

  travellers.sort((left, right) => left.start - right.start);

  return {
    flags,
    emits: emitSeries,
    cells: cellSeries,
    ghost: ghostSeries,
    slots: slotSeries,
    travellers,
    cues,
    processed,
    balance,
    settledAt,
  };
}

// --- the timeline ----------------------------------------------------------

/** Where a traveller starts, and the one coordinate its segment moves. */
const LANES: Record<Lane, { x: number; y: number; to: number }> = {
  'in-p0': { x: X_P0, y: Y_PRODUCER_BOTTOM, to: Y_PART_TOP },
  'in-p1': { x: X_P1, y: Y_PRODUCER_BOTTOM, to: Y_PART_TOP },
  'out-p0': { x: X_P0, y: Y_PART_BOTTOM, to: Y_CONSUMERS_TOP },
  'out-p1': { x: X_P1, y: Y_PART_BOTTOM, to: Y_CONSUMERS_TOP },
};

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);
  const emitElements = Array.from({ length: EMITS }, (_value, index) =>
    q<SVGRectElement>(stage, `.od-emit--${index + 1}`, ID),
  );
  const cellElements: Record<Part, SVGRectElement[]> = {
    p0: Array.from({ length: P0_CELLS }, (_value, index) =>
      q<SVGRectElement>(stage, `.od-cell-p0--${index + 1}`, ID),
    ),
    p1: Array.from({ length: P1_CELLS }, (_value, index) =>
      q<SVGRectElement>(stage, `.od-cell-p1--${index + 1}`, ID),
    ),
  };
  const ghostElements = Array.from({ length: 2 }, (_value, index) =>
    q<SVGRectElement>(stage, `.od-gcell--${index + 1}`, ID),
  );
  const slotElements = Array.from({ length: SLOTS }, (_value, index) =>
    q<SVGRectElement>(stage, `.od-slot--${index + 1}`, ID),
  );

  const sim = simulate();
  if (sim.processed > SLOTS) {
    throw new Error(`${ID} scene: the result strip outgrew the row the stage draws`);
  }
  if (sim.settledAt === null || sim.balance !== BALANCES[BALANCES.length - 1]) {
    throw new Error(`${ID} scene: the account ended on ${sim.balance}, not the balance the stage draws last`);
  }

  const parts = mountRequests(layer, sim.travellers.length, ID);
  const tl = createSceneTimeline();

  // --- everything the stage says about itself ------------------------------

  for (const [name, series] of Object.entries(sim.flags)) {
    for (const entry of series) attr(tl, stage, `data-od-${name}`, entry.value, entry.at);
  }
  sim.emits.forEach((series, index) => {
    const element = emitElements[index];
    if (!element) return;
    for (const entry of series) attr(tl, element, 'data-od-emit', entry.value, entry.at);
  });
  for (const part of ['p0', 'p1'] as const) {
    sim.cells[part].forEach((series, index) => {
      const element = cellElements[part][index];
      if (!element) return;
      for (const entry of series) attr(tl, element, 'data-od-cell', entry.value, entry.at);
    });
  }
  sim.ghost.forEach((series, index) => {
    const element = ghostElements[index];
    if (!element) return;
    for (const entry of series) attr(tl, element, 'data-od-ghost', entry.value, entry.at);
  });
  sim.slots.forEach((series, index) => {
    const element = slotElements[index];
    if (!element) return;
    for (const entry of series) attr(tl, element, 'data-od-slot', entry.value, entry.at);
  });

  // --- what travels --------------------------------------------------------

  sim.travellers.forEach((plan, index) => {
    const request = parts[index];
    if (!request) return;
    const lane = LANES[plan.lane];

    // A traveller is drawn as its key, the same way the rows and the strip are,
    // so the lane a dot takes and the key that sent it there are one fact.
    if (plan.key === 'k9') request.group.classList.add('od-k9');

    // Only the ordered key carries an amount, because it is the only key the
    // balance is a balance of.
    if (plan.amount !== null) {
      const label = attachToRequest(
        request,
        'text',
        { class: 'od-amount', x: '34', y: '10' },
        plan.amount > 0 ? `+${plan.amount}` : String(plan.amount),
      );
      gsap.set(label, { opacity: 1 });
    }

    parkRequest(request, lane.x, lane.y);
    showRequest(tl, request, plan.start);
    tl.to(
      request.group,
      { y: lane.to, duration: plan.leg, ease: 'none', immediateRender: false },
      plan.start,
    );

    if (plan.result === null) {
      // A routing leg carries no verdict: an append is not a result.
      hideRequest(tl, request, plan.land, FADE_IN_LEG);
      return;
    }
    markRequest(tl, request, plan.result, plan.land);
    hideRequest(tl, request, round(plan.land + MARK_HOLD), MARK_FADE);
  });

  // --- sound ---------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels ---------------------------------------------------------

  // The stage is complete on the first frame: the Producer with nothing emitted
  // yet, one bridged log with two empty cells, an empty result strip, a balance
  // of zero, no complaint about the order, and nothing in flight.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
