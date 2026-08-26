import gsap from 'gsap';
import {
  BRK_X,
  ID_BASE,
  ORD_ROWS,
  OUT_ROWS,
  SCENE_DURATION,
  SLOT_COUNT,
  STAGE_STATE,
  X_BROKER_RIGHT,
  X_CDC,
  X_DIRECT,
  X_MAIN,
  X_POLL,
  X_SERVICE_RIGHT,
  Y_BOTTOM,
  Y_BUS,
  Y_DATABASE,
  Y_DATABASE_BOTTOM,
  Y_PUBLISH_EXIT,
  Y_SERVICE,
} from './stage';
import { q } from '../shared/dom';
import {
  attachToRequest,
  hideRequest,
  markRequest,
  mountRequests,
  parkRequest,
  showRequest,
} from '../shared/request';
import type { RequestParts } from '../shared/request';
import { collapseAtInstant, createScheduler } from '../shared/simulation';
import { attr, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Transactional Outbox scene: a 24 second, four step timeline.
 *
 * Same two rules as the other scenes: every tween sits at an absolute position,
 * and every discrete change is a zero-duration tween on a `data-*` attribute
 * that GSAP reverts when the playhead moves back past it.
 *
 * Nothing the reader counts is authored. The scene is told seven things: when
 * a request reaches the Service and how that request is written, when the
 * broker is answering, which commits fail, how often the relay polls and how
 * many rows it takes each time, when the relay crashes and restarts, when a
 * cleanup sweep runs, and when change data capture takes the relay's place.
 *
 * Everything else falls out of one pass over the whole 24 seconds. A sequence
 * number is handed out at commit, so a transaction that fails leaves no gap and
 * takes no number. A row is `pending` from the commit that wrote it until the
 * relay marks it `sent`, and the relay marks it a fixed delay after the message
 * lands — which is the whole of the third step, because a crash inside that
 * delay leaves the row pending and the message already delivered. `published`
 * counts rows that reached `sent`, `duplicates` counts deliveries of a message
 * that had already been delivered, and the two together are how many messages
 * the broker actually saw. The queue is a fixed pool: a delivery takes the
 * lowest free slot and the consumer frees whichever slot has been held longest,
 * so the two `id 42` sitting side by side in the third step are a consequence
 * of the schedule rather than a picture drawn of one.
 */

const ID = 'transactional-outbox';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- how a request moves --------------------------------------------------

/** One speed for every leg any traveller takes, in pixels per second. */
const SPEED = 2000;

/** The write: the bottom of the Service to the top of the Database. */
const TRIP_WRITE = round((Y_DATABASE - Y_SERVICE) / SPEED);

/**
 * The publish made outside a transaction: out of the right edge of the Service,
 * down the column that passes to the right of the Database, and one turn onto
 * the bus to reach the right edge of the Broker.
 */
const LEG_OUT = round((X_DIRECT - X_SERVICE_RIGHT) / SPEED);
const LEG_DOWN = round((Y_BUS - Y_PUBLISH_EXIT) / SPEED);
const LEG_IN = round((X_DIRECT - X_BROKER_RIGHT) / SPEED);
const TRIP_DIRECT = round(LEG_OUT + LEG_DOWN + LEG_IN);

/** The relay's claim: the bottom of the Database, then the bus. */
const LEG_CLAIM = round((Y_BUS - Y_DATABASE_BOTTOM) / SPEED);
const LEG_BUS = round((BRK_X - X_POLL) / SPEED);
const TRIP_RELAY = round(LEG_CLAIM + LEG_BUS);

/** Change data capture: the bottom of the Database to the top of the Broker. */
const TRIP_CDC = round((Y_BOTTOM - Y_DATABASE_BOTTOM) / SPEED);

/** How long a marker stays before the request carrying it goes. */
const FADE = 0.16;
/** How long a delivery's dot stays once the slot it filled has lit. */
const LAND_FADE = 0.05;

/**
 * The gap between two dots of one batch. Three rows claimed together leave a
 * fixed distance apart rather than on top of each other, so a batch reads as
 * several messages travelling together rather than as one. It has to be longer
 * than `LAND_FADE`, because the dot in front stops at the edge of the Broker
 * and the one behind it is still moving while it fades.
 */
const BATCH_GAP = 0.12;

// --- what the scene is told -----------------------------------------------

/** How a request is written: two statements, or one transaction. */
type Mode = 'commit-first' | 'publish-first' | 'tx';

interface RequestPlan {
  /** When `POST /orders` reaches the Service. */
  at: number;
  mode: Mode;
  /** True when the commit this request makes does not survive. */
  commitFails?: boolean;
}

/**
 * When each request arrives and how it is written. The first two are the two
 * orderings of a dual write; everything after them is one transaction.
 */
const REQUESTS: RequestPlan[] = [
  { at: 0.4, mode: 'commit-first' },
  { at: 2.8, mode: 'publish-first', commitFails: true },
  { at: 6.4, mode: 'tx' },
  { at: 7.8, mode: 'tx' },
  { at: 8.6, mode: 'tx', commitFails: true },
  { at: 15.2, mode: 'tx' },
  { at: 18.2, mode: 'tx' },
  { at: 18.6, mode: 'tx' },
  { at: 19.0, mode: 'tx' },
  { at: 21.5, mode: 'tx' },
  { at: 22.2, mode: 'tx' },
];

/** How long after arrival the commit lands, per way of writing. */
const COMMIT_AFTER: Record<Mode, number> = {
  'commit-first': 0.6,
  'publish-first': 1.8,
  tx: 0.4,
};

/** How long after arrival a publish leaves the Service, when there is one. */
const PUBLISH_AFTER: Record<Mode, number | null> = {
  'commit-first': 1.4,
  'publish-first': 0.3,
  tx: null,
};

/** When the code the Service runs becomes one transaction. */
const TX_FROM = 6.2;
/** How long the frame holds its result before it goes back to plain. */
const FRAME_FLASH = 0.25;
/** How long the request chip stays lit after the request is answered. */
const REQ_HOLD = 0.15;

/** Whether the broker is answering, from each time onwards. */
const BROKER: [number, 'up' | 'down'][] = [
  [0, 'down'],
  [2.6, 'up'],
  [5.2, 'down'],
  [12.2, 'up'],
];

/** When the relay makes its first poll. */
const RELAY_FROM = 12.2;
/** How long between polls, from each time onwards. */
const POLL_EVERY: [number, number][] = [
  [0, 1.2],
  [19.0, 0.9],
];
/** How many rows one poll claims, from each time onwards. */
const BATCH_SIZE: [number, number][] = [
  [0, 1],
  [18.4, 3],
];
/** When the relay dies, and when it comes back. */
const RELAY_CRASH = 13.9;
const RELAY_RESTART = 14.6;
/** How long after a restart the relay polls again. */
const RESTART_DELAY = 0.2;
/**
 * How long the relay takes to mark a row `sent` once the message has landed.
 * The whole third step lives inside this gap: a crash here leaves a delivered
 * message and a row that still says `pending`.
 */
const MARK_DELAY = 0.4;

/** When a cleanup sweep trims every row that has been marked `sent`. */
const CLEANUP: number[] = [20.6, 23.5];

/** When change data capture replaces polling, and how far behind it reads. */
const CDC_FROM = 21.4;
const CDC_LAG = 0.2;

/** When the consumer is draining the queue, and how often it takes one. */
const DRAIN: [number, number][] = [
  [15.4, 17.4],
  [20.0, 24.0],
];
const DRAIN_EVERY = 0.4;

/** The shortest gap between two sampled state cues. */
const STATE_GAP = 0.25;

// --- what the simulation produces -----------------------------------------

interface CommitOutcome {
  /** When the write dot reaches the Database, which is when the commit lands. */
  at: number;
  ok: boolean;
  /** Sequence number the outbox row was given, or 0 when there is no row. */
  seq: number;
}

interface DeliveryOutcome {
  kind: 'relay' | 'cdc' | 'direct';
  /** The row it carries, or 0 for a publish made with no row behind it. */
  seq: number;
  /** When the dot leaves, and when the message reaches the broker. */
  leaveAt: number;
  landAt: number;
  /** A publish the broker was not up to take. */
  refused: boolean;
}

interface AttrChange {
  at: number;
  target: string;
  name: string;
  value: string;
}

interface Simulation {
  commits: CommitOutcome[];
  deliveries: DeliveryOutcome[];
  attrs: AttrChange[];
  cues: [number, SceneCue][];
}

/** The value a step function holds at `at`. */
function stepValue<T>(table: [number, T][], at: number): T {
  let value = table[0]![1];
  for (const [from, next] of table) if (at >= from) value = next;
  return value;
}

// --- the simulation -------------------------------------------------------

function simulate(): Simulation {
  const raw: AttrChange[] = [];
  const cues: [number, SceneCue][] = [];
  /** State cues before sampling; they are thinned once the pass is over. */
  const stateAt: number[] = [];

  const setAttr = (at: number, target: string, name: string, value: string): void => {
    raw.push({ at: round(at), target, name, value });
  };
  const cue = (at: number, name: SceneCue): void => {
    cues.push([round(at), name]);
  };

  const commits: CommitOutcome[] = [];
  const deliveries: DeliveryOutcome[] = [];

  /**
   * What the outbox knows about one row, which is all the relay works from.
   * Which strip row it is drawn on is not decided here: rows are written in one
   * pass and trimmed in another, so the strip is dealt out at the end, over the
   * two passes merged into time order.
   */
  interface Row {
    seq: number;
    committedAt: number;
    sentAt: number | null;
    trimmedAt: number | null;
    claimedAt: number | null;
    delivered: number;
  }
  const rows: Row[] = [];
  /** A transaction that wrote both rows and then lost them. */
  const tries: [number, number][] = [];

  let orders = 0;
  let seqNext = 1;
  let published = 0;
  let duplicates = 0;

  /**
   * How many rows are waiting to go out is the one reading two passes touch:
   * a commit adds to it and a mark takes from it, and the two are worked out in
   * different passes. So the changes are collected as steps and added up once,
   * in time order, rather than written down as they are found.
   */
  const pendingSteps: [number, number][] = [];
  const setOrders = (at: number, value: number): void =>
    setAttr(at, 'stage', 'data-ob-orders', String(value));

  /** The queue: which message each slot holds, and when it took it. */
  const slots: ({ seq: number; ghost: boolean; since: number } | null)[] = Array.from(
    { length: SLOT_COUNT },
    () => null,
  );

  const { schedule, drain } = createScheduler();

  // --- the Service --------------------------------------------------------

  setAttr(TX_FROM, 'stage', 'data-ob-code', 'tx');
  setAttr(TX_FROM, 'stage', 'data-ob-frame', 'on');

  for (const [at, health] of BROKER) setAttr(at, 'stage', 'data-ob-broker', health);
  setAttr(RELAY_CRASH, 'stage', 'data-ob-relay', 'down');
  setAttr(RELAY_RESTART, 'stage', 'data-ob-relay', 'up');
  cue(RELAY_CRASH, 'failure');
  cue(RELAY_RESTART, 'trip');
  setAttr(CDC_FROM, 'stage', 'data-ob-cdc', 'on');
  cue(CDC_FROM, 'trip');

  for (const [from, to] of DRAIN) {
    setAttr(from, 'stage', 'data-ob-drain', 'on');
    if (to < SCENE_DURATION) setAttr(to, 'stage', 'data-ob-drain', 'off');
  }

  const brokerUpAt = (at: number): boolean => stepValue(BROKER, at) === 'up';

  // --- every request, written the way its step writes it ------------------

  for (const plan of REQUESTS) {
    const commitAt = round(plan.at + COMMIT_AFTER[plan.mode]);
    const publishOffset = PUBLISH_AFTER[plan.mode];
    const publishAt = publishOffset === null ? null : round(plan.at + publishOffset);
    const answeredAt =
      publishAt === null ? commitAt : Math.max(commitAt, round(publishAt + TRIP_DIRECT));

    setAttr(plan.at, 'stage', 'data-ob-req', 'on');
    setAttr(round(answeredAt + REQ_HOLD), 'stage', 'data-ob-req', 'off');

    // The publish that is not inside the transaction.
    if (publishAt !== null) {
      const landAt = round(publishAt + TRIP_DIRECT);
      const refused = !brokerUpAt(landAt);
      if (!refused) {
        const slot = slots.findIndex((held) => held === null);
        if (slot >= 0) {
          slots[slot] = { seq: 0, ghost: true, since: landAt };
          setAttr(landAt, `slot-${slot}`, 'data-ob-slot', 'ghost');
          setAttr(landAt, `slot-${slot}`, 'data-ob-msg', '0');
          stateAt.push(landAt);
        }
      }
      deliveries.push({ kind: 'direct', seq: 0, leaveAt: publishAt, landAt, refused });
      if (refused) cue(landAt, 'failure');
    }

    schedule(commitAt, () => {
      const ok = plan.commitFails !== true;
      const bar = orders;

      if (!ok) {
        // The transaction wrote both rows and then lost them. Nothing takes a
        // sequence number, because the outbox hands those out at commit.
        setAttr(commitAt, `bar-${bar}`, 'data-ob-bar', 'try');
        setAttr(round(commitAt + 0.35), `bar-${bar}`, 'data-ob-bar', 'off');
        if (plan.mode === 'tx') tries.push([commitAt, round(commitAt + 0.35)]);
        if (plan.mode === 'tx') {
          setAttr(commitAt, 'stage', 'data-ob-frame', 'fail');
          setAttr(round(commitAt + FRAME_FLASH), 'stage', 'data-ob-frame', 'on');
        }
        stateAt.push(round(commitAt + 0.35));
        if (plan.mode !== 'tx') cue(commitAt, 'failure');
        commits.push({ at: commitAt, ok: false, seq: 0 });
        return;
      }

      orders += 1;
      setAttr(commitAt, `bar-${bar}`, 'data-ob-bar', 'on');
      setOrders(commitAt, orders);
      cue(commitAt, 'success');

      let seq = 0;
      if (plan.mode === 'tx') {
        seq = seqNext;
        seqNext += 1;
        rows.push({
          seq,
          committedAt: commitAt,
          sentAt: null,
          trimmedAt: null,
          claimedAt: null,
          delivered: 0,
        });
        pendingSteps.push([commitAt, 1]);
        setAttr(commitAt, 'stage', 'data-ob-frame', 'commit');
        setAttr(round(commitAt + FRAME_FLASH), 'stage', 'data-ob-frame', 'on');
      }
      commits.push({ at: commitAt, ok: true, seq });
    });
  }

  drain();
  commits.sort((left, right) => left.at - right.at);

  // --- the queue ----------------------------------------------------------

  /** Puts a message in the lowest free slot, and says nothing when full. */
  const enqueue = (at: number, seq: number): number => {
    const slot = slots.findIndex((held) => held === null);
    if (slot < 0) return -1;
    slots[slot] = { seq, ghost: false, since: at };
    setAttr(at, `slot-${slot}`, 'data-ob-slot', 'held');
    setAttr(at, `slot-${slot}`, 'data-ob-msg', String(seq));
    return slot;
  };

  /** Frees whichever slot has been held longest. */
  const consume = (at: number): boolean => {
    let oldest = -1;
    for (let i = 0; i < SLOT_COUNT; i += 1) {
      const held = slots[i];
      if (!held) continue;
      if (oldest < 0 || held.since < slots[oldest]!.since) oldest = i;
    }
    if (oldest < 0) return false;
    slots[oldest] = null;
    setAttr(at, `slot-${oldest}`, 'data-ob-slot', 'free');
    setAttr(at, `slot-${oldest}`, 'data-ob-msg', '0');
    return slots.every((held) => held === null);
  };

  // --- the relay, and then change data capture ----------------------------

  const pipeline = createScheduler();
  const push = (at: number, run: () => void): void => pipeline.schedule(round(at), run);

  /** Every poll the relay makes, worked out before anything is published. */
  const polls: number[] = [];
  let nextPoll = RELAY_FROM;
  while (nextPoll < SCENE_DURATION) {
    if (nextPoll >= CDC_FROM) break;
    if (nextPoll >= RELAY_CRASH && nextPoll <= RELAY_RESTART) {
      nextPoll = round(RELAY_RESTART + RESTART_DELAY);
      continue;
    }
    polls.push(round(nextPoll));
    nextPoll = round(nextPoll + stepValue(POLL_EVERY, nextPoll));
  }

  /** Every consumer tick, likewise. */
  const ticks: number[] = [];
  for (const [from, to] of DRAIN) {
    for (let at = from; at < to; at = round(at + DRAIN_EVERY)) ticks.push(round(at));
  }

  for (const at of polls) {
    push(at, () => {
      const size = stepValue(BATCH_SIZE, at);
      const ready = rows
        .filter((row) => row.committedAt <= at && row.sentAt === null && row.claimedAt === null)
        .sort((left, right) => left.seq - right.seq)
        .slice(0, size);
      if (ready.length === 0) return;
      if (ready.length > 1) cue(at, 'trip');
      ready.forEach((row, index) => {
        row.claimedAt = at;
        const leaveAt = round(at + index * BATCH_GAP);
        const landAt = round(leaveAt + TRIP_RELAY);
        const duplicate = row.delivered > 0;
        row.delivered += 1;
        deliveries.push({ kind: 'relay', seq: row.seq, leaveAt, landAt, refused: false });
        push(landAt, () => {
          enqueue(landAt, row.seq);
          stateAt.push(landAt);
          if (duplicate) {
            duplicates += 1;
            setAttr(landAt, 'stage', 'data-ob-dups', String(duplicates));
            setAttr(landAt, 'stage', 'data-ob-once', 'on');
          }
        });
        const markAt = round(landAt + MARK_DELAY);
        push(markAt, () => {
          // A relay that died between publishing and marking leaves the row
          // pending, so the next poll finds it and sends it a second time.
          if (markAt >= RELAY_CRASH && markAt <= RELAY_RESTART) {
            row.claimedAt = null;
            return;
          }
          row.sentAt = markAt;
          pendingSteps.push([markAt, -1]);
          published += 1;
          setAttr(markAt, 'stage', 'data-ob-published', String(published));
        });
      });
    });
  }

  // Change data capture reads the log instead, so a change leaves as soon as it
  // is committed rather than when the next poll comes round.
  for (const row of rows) {
    if (row.committedAt < CDC_FROM) continue;
    const leaveAt = round(row.committedAt + CDC_LAG);
    const landAt = round(leaveAt + TRIP_CDC);
    push(leaveAt, () => {
      row.claimedAt = leaveAt;
      row.delivered += 1;
      deliveries.push({ kind: 'cdc', seq: row.seq, leaveAt, landAt, refused: false });
    });
    push(landAt, () => {
      enqueue(landAt, row.seq);
      stateAt.push(landAt);
    });
    const markAt = round(landAt + MARK_DELAY);
    push(markAt, () => {
      row.sentAt = markAt;
      pendingSteps.push([markAt, -1]);
      published += 1;
      setAttr(markAt, 'stage', 'data-ob-published', String(published));
    });
  }

  for (const at of ticks) {
    push(at, () => {
      const emptied = consume(at);
      if (emptied) cue(at, 'success');
    });
  }

  for (const at of CLEANUP) {
    push(at, () => {
      const trimmed = rows.filter(
        (row) => row.sentAt !== null && row.sentAt <= at && row.trimmedAt === null,
      );
      if (trimmed.length === 0) return;
      for (const row of trimmed) row.trimmedAt = at;
      stateAt.push(at);
    });
  }

  // One pass over everything the relay, the consumer and the sweeps do, in time
  // order, so a poll always sees the rows the commits before it wrote and a
  // delivery booked from inside a poll still lands in its place in the order.
  pipeline.drain();

  // --- which strip row each outbox row is drawn on ------------------------

  // A row takes the lowest strip row that is free when it is written, and gives
  // it back when a sweep trims it. Both ends are known only now, which is why
  // the strip is dealt out here rather than at the commit that wrote the row.
  interface Claim {
    at: number;
    kind: 'take' | 'give';
    row: Row | null;
  }
  const claims: Claim[] = [];
  for (const row of rows) {
    claims.push({ at: row.committedAt, kind: 'take', row });
    if (row.trimmedAt !== null) claims.push({ at: row.trimmedAt, kind: 'give', row });
  }
  for (const [from, to] of tries) {
    claims.push({ at: from, kind: 'take', row: null });
    claims.push({ at: to, kind: 'give', row: null });
  }
  claims.sort((left, right) => left.at - right.at || (left.kind === 'give' ? -1 : 1));

  const held = new Map<Row | 'try', number>();
  const takeStrip = (): number => {
    const used = new Set(held.values());
    for (let i = 0; i < OUT_ROWS; i += 1) if (!used.has(i)) return i;
    return OUT_ROWS - 1;
  };
  for (const claim of claims) {
    const key = claim.row ?? 'try';
    if (claim.kind === 'give') {
      const strip = held.get(key);
      held.delete(key);
      if (strip === undefined) continue;
      setAttr(claim.at, `row-${strip}`, 'data-ob-row', 'none');
      setAttr(claim.at, `row-${strip}`, 'data-ob-seq', '0');
      continue;
    }
    const strip = takeStrip();
    held.set(key, strip);
    if (claim.row === null) {
      setAttr(claim.at, `row-${strip}`, 'data-ob-row', 'try');
      continue;
    }
    setAttr(claim.at, `row-${strip}`, 'data-ob-seq', String(claim.row.seq));
    setAttr(claim.at, `row-${strip}`, 'data-ob-row', 'pending');
    if (claim.row.sentAt !== null) {
      setAttr(claim.row.sentAt, `row-${strip}`, 'data-ob-row', 'sent');
    }
  }

  // --- how many rows are waiting, added up once the whole pass is over -----

  pendingSteps.sort((left, right) => left[0] - right[0]);
  let pending = 0;
  for (const [at, delta] of pendingSteps) {
    pending += delta;
    setAttr(at, 'stage', 'data-ob-pending', String(pending));
  }

  // --- the state cues, sampled rather than counted ------------------------

  stateAt.sort((left, right) => left - right);
  let lastSample = -Infinity;
  for (const at of stateAt) {
    if (at - lastSample < STATE_GAP) continue;
    lastSample = at;
    cue(at, 'state');
  }

  // --- put the discrete changes in time order -----------------------------

  const inTimeOrder = raw
    .map((entry, order) => ({ entry, order }))
    .sort((left, right) => left.entry.at - right.entry.at || left.order - right.order)
    .map(({ entry }) => entry);

  const folded: AttrChange[] = [];
  for (const entry of inTimeOrder) {
    collapseAtInstant(folded, entry, (change) => `${change.target}@${change.name}`);
  }

  const seen = new Map<string, string>();
  for (const [key, value] of Object.entries(STAGE_STATE)) seen.set(key, value);
  for (let n = 0; n < ORD_ROWS; n += 1) seen.set(`bar-${n}@data-ob-bar`, 'off');
  for (let n = 0; n < OUT_ROWS; n += 1) {
    seen.set(`row-${n}@data-ob-row`, 'none');
    seen.set(`row-${n}@data-ob-seq`, '0');
  }
  for (let n = 0; n < SLOT_COUNT; n += 1) {
    seen.set(`slot-${n}@data-ob-slot`, 'free');
    seen.set(`slot-${n}@data-ob-msg`, '0');
  }
  const attrs: AttrChange[] = [];
  for (const change of folded) {
    const key = `${change.target}@${change.name}`;
    if (seen.get(key) === change.value) continue;
    seen.set(key, change.value);
    attrs.push(change);
  }

  cues.sort((left, right) => left[0] - right[0]);
  deliveries.sort((left, right) => left.leaveAt - right.leaveAt);

  return { commits, deliveries, attrs, cues };
}

// --- the timeline ---------------------------------------------------------

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const targets: Record<string, Element> = { stage };
  for (let n = 0; n < ORD_ROWS; n += 1) {
    targets[`bar-${n}`] = q<SVGRectElement>(stage, `.ob-bar--${n}`, ID);
  }
  for (let n = 0; n < OUT_ROWS; n += 1) {
    targets[`row-${n}`] = q<SVGGElement>(stage, `.ob-row--${n}`, ID);
  }
  for (let n = 0; n < SLOT_COUNT; n += 1) {
    targets[`slot-${n}`] = q<SVGGElement>(stage, `.ob-slot-group--${n}`, ID);
  }

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);
  const sim = simulate();

  const parts = mountRequests(layer, REQUESTS.length + sim.deliveries.length, ID);
  const writeParts = parts.slice(0, REQUESTS.length);
  const shipParts = parts.slice(REQUESTS.length);

  const tl = createSceneTimeline();

  // --- discrete state -----------------------------------------------------

  for (const change of sim.attrs) {
    const target = targets[change.target];
    if (target) attr(tl, target, change.name, change.value, change.at);
  }

  // --- what travels -------------------------------------------------------

  const move = (target: RequestParts, vars: gsap.TweenVars, duration: number, at: number): void => {
    tl.to(target.group, { ...vars, duration, ease: 'none', immediateRender: false }, at);
  };

  /**
   * The write. It is a square rather than a dot, which is what a write is
   * everywhere else on the site, and it carries the result of the commit back
   * rather than travelling home with it.
   */
  REQUESTS.forEach((plan, index) => {
    const request = writeParts[index];
    const commitAt = round(plan.at + COMMIT_AFTER[plan.mode]);
    const outcome = sim.commits.find((entry) => entry.at === commitAt);
    if (!request || !outcome) return;

    const square = attachToRequest(request, 'rect', {
      class: 'scene-req-square ob-write',
      x: '-15',
      y: '-15',
      width: '30',
      height: '30',
      rx: '6',
    });
    parkRequest(request, X_MAIN, Y_SERVICE);
    gsap.set(request.dot, { opacity: 0 });
    gsap.set(square, { opacity: 1 });

    const start = round(commitAt - TRIP_WRITE);
    showRequest(tl, request, start);
    move(request, { y: Y_DATABASE }, TRIP_WRITE, start);
    tl.set(square, { opacity: 0, immediateRender: false }, commitAt);
    markRequest(tl, request, outcome.ok ? 'ok' : 'fail', commitAt);
    hideRequest(tl, request, commitAt, FADE);
  });

  /** Everything that reaches the broker, whichever route it took. */
  sim.deliveries.forEach((delivery, index) => {
    const request = shipParts[index];
    if (!request) return;

    if (delivery.seq > 0) {
      const label = attachToRequest(
        request,
        'text',
        { class: 'scene-req-label ob-ship-id', x: '38', y: '9' },
        `id ${ID_BASE + delivery.seq}`,
      );
      gsap.set(label, { opacity: 1 });
    }

    if (delivery.kind === 'direct') {
      parkRequest(request, X_SERVICE_RIGHT, Y_PUBLISH_EXIT);
      showRequest(tl, request, delivery.leaveAt);
      const turn = round(delivery.leaveAt + LEG_OUT);
      const bus = round(turn + LEG_DOWN);
      move(request, { x: X_DIRECT }, LEG_OUT, delivery.leaveAt);
      move(request, { y: Y_BUS }, LEG_DOWN, turn);
      move(request, { x: X_BROKER_RIGHT }, LEG_IN, bus);
      markRequest(tl, request, delivery.refused ? 'fail' : 'ok', delivery.landAt);
      hideRequest(tl, request, delivery.landAt, FADE);
      return;
    }

    if (delivery.kind === 'relay') {
      parkRequest(request, X_POLL, Y_DATABASE_BOTTOM);
      showRequest(tl, request, delivery.leaveAt);
      const turn = round(delivery.leaveAt + LEG_CLAIM);
      move(request, { y: Y_BUS }, LEG_CLAIM, delivery.leaveAt);
      move(request, { x: BRK_X }, LEG_BUS, turn);
      hideRequest(tl, request, delivery.landAt, LAND_FADE);
      return;
    }

    parkRequest(request, X_CDC, Y_DATABASE_BOTTOM);
    showRequest(tl, request, delivery.leaveAt);
    move(request, { y: Y_BOTTOM }, TRIP_CDC, delivery.leaveAt);
    hideRequest(tl, request, delivery.landAt, LAND_FADE);
  });

  // --- sound --------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels --------------------------------------------------------

  // The stage is complete on the first frame: both tables empty, the broker
  // down, the queue free and every readout at zero.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
