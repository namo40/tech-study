import {
  MAX_SEQ,
  SCENE_DURATION,
  X_CMD,
  X_FEED,
  X_LOG_LEFT,
  X_ORDER_RIGHT,
  Y_APP,
  Y_BUS,
  Y_LOG_BOTTOM,
  Y_ORDER,
  Y_READERS,
} from './stage';
import type { Lamp, RowState } from './stage';
import { q } from '../shared/dom';
import {
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
 * Event Sourcing scene: a 24 second, four step timeline.
 *
 * The two standing rules apply here as everywhere: every tween sits at an
 * absolute position, and every discrete change is a zero-duration tween on a
 * `data-*` attribute that GSAP reverts when the playhead moves back past it.
 *
 * Nothing the reader counts is authored. The scene is told six things — when a
 * command leaves the App and which of the three the aggregate turns it into,
 * when the aggregate is emptied and told to rebuild itself, how fast a rebuild
 * reads the log, when a snapshot is stored, when the derived views are switched
 * on, and how often the reader takes the next event. One pass over the whole 24
 * seconds turns that into everything else: the rows in the log, `seq`, `items`,
 * the `paid` badge, where the replay cursor is, which rows a snapshot has made
 * unnecessary, and `rows`.
 *
 * Two derivations carry the argument. **The log is the only thing written to.**
 * A command produces an event, the event is appended, and the event is what
 * moves the state — so `seq` is a count of appends, the number of written rows
 * is `seq` by construction, and the state card is never set from anywhere but a
 * fold. **A rebuild folds the same events the log is holding.** There is no
 * parallel series of hand-written state values anywhere in this file: the
 * replay in the second step, the bounded replay that goes back to `seq 2` and
 * then comes forward again, and the snapshot-assisted rebuild in the third step
 * all call the same `apply` over the same array the appends filled. That is why
 * the aggregate lands back on exactly the state it was wiped from, and why
 * stopping the replay early shows the past rather than an approximation of it.
 *
 * Event sourcing is the neighbour of CQRS and is deliberately not it. CQRS is
 * about two paths — one model that changes data and another that answers
 * questions about it — and it does not care how either one stores anything.
 * Here there is one path, and the whole claim is about what gets stored on it:
 * the log is the record, the state is a replay of the log, the snapshot is an
 * optimisation that can be thrown away, and a correction is one more event
 * rather than an overwrite. The read model in the fourth step is a consequence
 * of that, not the subject: it is drawn as a consumer of the same log because
 * "many truths derived from one log" is what makes the log worth keeping.
 *
 * One thing is a picture rather than a measurement. The six event rows carry no
 * names, because what a row says here is only whether it has been written,
 * whether a replay is folding it right now, and whether a snapshot has made
 * reading it unnecessary. The words the events would carry are already on the
 * state card, which is the point: the card is the log added up.
 */

const ID = 'event-sourcing';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

const BOUNDARIES = [0, 6, 12, 18, 24];

// --- how a traveller moves -------------------------------------------------

/** The command lane, both ways: 200px between the App and the Order. */
const LEG_CMD = 0.24;
/** The append lane, both ways: 100px between the Order and the Log. */
const LEG_BUS = 0.12;
/** The feed lane: 230px between the Log and the Readers. */
const LEG_FEED = 0.28;

/** How long a traveller takes to fade once it is absorbed. */
const FADE = 0.1;
/** The same, for the acknowledgement, which has a marker to show first. */
const MARK_FADE = 0.16;

// --- what the scene is told ------------------------------------------------

/** What an event does to the state it is folded into. */
type EventKind = 'add' | 'pay' | 'remove';

/** When a command leaves the App, and what the aggregate decides it means. */
interface Command {
  at: number;
  kind: EventKind;
}

/**
 * The seven commands. Two items go on the order and it is paid for; three more
 * are added later; and the last one is the correction, which is not an update
 * of anything — it is an event that says one item came off again.
 *
 * The sixth is placed where it is on purpose: its event is appended after the
 * snapshot has been taken, so the rebuild that follows has exactly one row left
 * to read. A snapshot that covered the whole log would be a rebuild that read
 * nothing, and a rebuild that reads nothing cannot show what a snapshot saves.
 */
const COMMANDS: Command[] = [
  { at: 0.6, kind: 'add' },
  { at: 2.4, kind: 'add' },
  { at: 3.9, kind: 'pay' },
  { at: 12.1, kind: 'add' },
  { at: 13.55, kind: 'add' },
  { at: 14.35, kind: 'add' },
  { at: 20.5, kind: 'remove' },
];

/** How long the aggregate takes to decide, and to apply what it decided. */
const VALIDATE = 0.3;
const APPLY = 0.24;

/** One rebuild of the aggregate: everything the scene is told about a replay. */
interface Rebuild {
  /** When the aggregate is emptied. */
  at: number;
  /** How long after that the first read leaves the log. */
  lead: number;
  /** Seconds between the start of one read and the start of the next. */
  pace: number;
  /** Fold this many events and then stop, or null to fold them all. */
  stopAfter: number | null;
  /** When a stopped rebuild carries on, which is the way back from the past. */
  resumeAt: number | null;
  /** Whether the rebuild may start from a stored snapshot. */
  fromSnapshot: boolean;
  /** How long after the last fold the `replaying` badge goes out. */
  doneLag: number;
  /** What the emptying sounds like: a restart trips, a look backwards does not. */
  startCue: SceneCue;
  /** Whether the fold it stops on is worth a sound of its own. */
  markStop: boolean;
}

/**
 * The three rebuilds. The first is the plain one: empty the aggregate, play the
 * whole log, arrive back where it started. The second stops after two events,
 * holds the state the order was in at `seq 2`, and then finishes. The third is
 * the one the snapshot is for: it loads the stored fold and then reads only the
 * one row the snapshot does not cover, which is the whole saving drawn at the
 * size the log happens to be.
 */
const REBUILDS: Rebuild[] = [
  {
    at: 6.5,
    lead: 0.7,
    pace: 1.05,
    stopAfter: null,
    resumeAt: null,
    fromSnapshot: false,
    doneLag: 0.3,
    startCue: 'trip',
    markStop: false,
  },
  {
    at: 10.3,
    lead: 0.15,
    pace: 0.45,
    stopAfter: 2,
    resumeAt: 11.33,
    fromSnapshot: false,
    doneLag: 0.15,
    startCue: 'state',
    markStop: true,
  },
  {
    at: 15.3,
    lead: 0.35,
    pace: 0.45,
    stopAfter: null,
    resumeAt: null,
    fromSnapshot: true,
    doneLag: 0.35,
    startCue: 'trip',
    markStop: false,
  },
];

/** When the state is photographed, and how long the comparison is held up. */
const SNAPSHOT_AT = 14.95;
const CONTRAST_AT = 16.65;
const CONTRAST_FOR = 0.6;

/** When the derived views are switched on. */
const CHIPS_AT = 18.4;

/** When the reader starts taking events, and how often it takes the next one. */
const FEED_FROM = 18.8;
const FEED_EVERY = 0.46;

/** When everything the log has produced is shown to agree with it. */
const SETTLE_AT = 22.5;

/** How long a row stays lit after the read that folded it has landed. */
const ROW_HOLD = 0.1;

/** How close two samples of one repeating thing may sound, how close any cue
    may fall to another, and how close any of it may fall to a boundary. */
const SAMPLE_GAP = 0.9;
const MIN_CUE_GAP = 0.2;
const BOUNDARY_GAP = 0.3;

/** Times are rounded to milliseconds, so a gap of exactly the minimum is one. */
const EPS = 1e-6;

// --- what one pass over the scene produces --------------------------------

/** The state of the order, which is only ever the log added up. */
interface Fold {
  items: number;
  paid: boolean;
}

const EMPTY: Fold = { items: 0, paid: false };

/** What one event does. This is the only place the meaning of an event lives. */
function apply(state: Fold, kind: EventKind): Fold {
  if (kind === 'add') return { items: state.items + 1, paid: state.paid };
  if (kind === 'remove') return { items: Math.max(0, state.items - 1), paid: state.paid };
  return { items: state.items, paid: true };
}

/** One row of the log, once an append has written it. */
interface LoggedEvent {
  seq: number;
  kind: EventKind;
  at: number;
}

interface Series {
  at: number;
  value: string;
}

/** Which lane a traveller is on, which is also how it is drawn. */
type Lane = 'command' | 'ack' | 'append' | 'read' | 'feed';

interface Traveller {
  lane: Lane;
  start: number;
  land: number;
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
  rows: Series[][];
  travellers: Traveller[];
  cues: [number, SceneCue][];
  /** Read back by the build, so a drift in the schedule fails loudly. */
  finalSeq: number;
  snapSeq: number;
}

// --- the simulation --------------------------------------------------------

/** How long a traveller spends on each lane. */
const LEG: Record<Lane, number> = {
  command: LEG_CMD,
  ack: LEG_CMD,
  append: LEG_BUS,
  read: LEG_BUS,
  feed: LEG_FEED,
};

/**
 * Walks the whole scene in time order.
 *
 * The commands are booked first, because everything else is downstream of an
 * event existing: a rebuild can only fold what the appends put in the log, a
 * snapshot can only photograph what those events add up to, and the reader can
 * only take rows that are there. Booked events run earliest first and a running
 * one may book more, so a rebuild that starts at 6.5 sees exactly the three
 * events committed before it and nothing that comes later.
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

  const fix = (at: number, name: SceneCue, family: string | null = null): void => {
    if (at < 0 || at > SCENE_DURATION) return;
    fixed.push({ at: round(at), family, name });
  };
  const sample = (at: number, family: string, name: SceneCue): void => {
    if (at < 0 || at > SCENE_DURATION) return;
    candidates.push({ at: round(at), family, name });
  };

  /** Puts one traveller on a lane and answers when it gets to the far end. */
  const travel = (lane: Lane, start: number): number => {
    const land = round(start + LEG[lane]);
    travellers.push({ lane, start: round(start), land });
    return land;
  };

  // --- what the diagram is holding ----------------------------------------

  /** The log. Nothing is ever taken out of it or written over. */
  const log: LoggedEvent[] = [];
  let seq = 0;
  /** What the aggregate currently believes, which is only ever a fold. */
  let live: Fold = EMPTY;
  /** The stored snapshot: the sequence number it covers, and what it holds. */
  let snapSeq = 0;
  let snapFold: Fold = EMPTY;
  /** How many events the projection has folded in. */
  let consumed = 0;

  const setFold = (at: number, next: Fold): void => {
    live = next;
    record('items', at, String(next.items));
    record('paid', at, (next.paid ? 'on' : 'off') satisfies Lamp);
  };
  const setRow = (at: number, n: number, value: RowState): void => record(`row-${n}`, at, value);

  const { schedule, drain } = createScheduler();

  // --- the opening state, which is the whole diagram -----------------------

  setFold(0, EMPTY);
  record('replay', 0, 'off' satisfies Lamp);
  record('seq', 0, '0');
  record('snap', 0, 'off');
  record('proj', 0, 'off' satisfies Lamp);
  record('audit', 0, 'off' satisfies Lamp);
  record('rows', 0, '0');
  record('settled', 0, 'off');
  for (let n = 1; n <= MAX_SEQ; n += 1) setRow(0, n, 'none');

  // --- the commands, and the events they turn into -------------------------

  for (const command of COMMANDS) {
    // A correction is the one event the scene is arguing about, so it never
    // gets thinned out of the sound track the way a routine append can be.
    const loud = command.kind === 'remove';
    const arrive = travel('command', command.at);

    schedule(arrive, () => {
      const appendLand = travel('append', round(arrive + VALIDATE));

      schedule(appendLand, () => {
        seq += 1;
        const written = seq;
        log.push({ seq: written, kind: command.kind, at: appendLand });
        record('seq', appendLand, String(written));
        setRow(appendLand, written, 'on');
        if (loud) fix(appendLand, 'state', 'append');
        else sample(appendLand, 'append', 'state');

        const applyAt = round(appendLand + APPLY);
        schedule(applyAt, () => {
          // The state moves because an event was stored, never the other way
          // round. This is the only line outside a replay that touches the
          // state card, and what it folds is the row that was just written.
          setFold(applyAt, apply(live, command.kind));
          if (loud) fix(applyAt, 'state', 'apply');
          else sample(applyAt, 'apply', 'state');

          const ackLand = travel('ack', applyAt);
          schedule(ackLand, () => fix(ackLand, 'success', 'ack'));
        });
      });
    });
  }

  // --- the rebuilds --------------------------------------------------------

  for (const rebuild of REBUILDS) {
    schedule(rebuild.at, () => {
      const before = live;
      record('replay', rebuild.at, 'on' satisfies Lamp);
      setFold(rebuild.at, EMPTY);
      fix(rebuild.at, rebuild.startCue);

      const startAt = round(rebuild.at + rebuild.lead);
      let covered = 0;
      let readsFrom = startAt;
      let lastFold = startAt;

      if (rebuild.fromSnapshot && snapSeq > 0) {
        const loadAt = startAt;
        covered = snapSeq;
        readsFrom = round(startAt + rebuild.pace);
        schedule(loadAt, () => {
          setFold(loadAt, snapFold);
          fix(loadAt, 'state');
        });
      }

      // Only the events the aggregate still has to fold, in the order the log
      // holds them. There is no second list anywhere: this is the log.
      const pending = log.filter((event) => event.seq > covered);
      const stop = rebuild.stopAfter;

      pending.forEach((event, index) => {
        const paused = stop !== null && index >= stop;
        const from = paused ? (rebuild.resumeAt ?? readsFrom) : readsFrom;
        const step = paused && stop !== null ? index - stop : index;
        const leave = round(from + step * rebuild.pace);
        const land = travel('read', leave);

        setRow(leave, event.seq, 'read');
        setRow(round(land + ROW_HOLD), event.seq, 'on');
        lastFold = Math.max(lastFold, land);

        schedule(land, () => {
          setFold(land, apply(live, event.kind));
          // The fold a bounded replay stops on is the past itself, so it is
          // heard whatever else is going on around it.
          if (rebuild.markStop && stop !== null && index === stop - 1) {
            fix(land, 'state', 'replay');
          } else {
            sample(land, 'replay', 'state');
          }
        });
      });

      const doneAt = round(lastFold + rebuild.doneLag);
      schedule(doneAt, () => {
        record('replay', doneAt, 'off' satisfies Lamp);
        fix(doneAt, 'success');
        if (live.items !== before.items || live.paid !== before.paid) {
          throw new Error(`${ID} scene: the rebuild at ${rebuild.at} did not land back on itself`);
        }
      });
    });
  }

  // --- the snapshot, and the comparison it makes possible ------------------

  schedule(SNAPSHOT_AT, () => {
    snapSeq = seq;
    // The snapshot is the fold of the log up to a sequence number, worked out
    // here rather than copied off the state card, because that is what a
    // snapshot is: a result anybody holding the log could have computed.
    snapFold = log
      .filter((event) => event.seq <= snapSeq)
      .reduce<Fold>((state, event) => apply(state, event.kind), EMPTY);
    record('snap', SNAPSHOT_AT, String(snapSeq));
    for (let n = 1; n <= snapSeq; n += 1) setRow(SNAPSHOT_AT, n, 'snap');
    fix(SNAPSHOT_AT, 'trip');
  });

  schedule(CONTRAST_AT, () => {
    if (snapSeq === 0) return;
    // What the rebuild would have had to read, held up beside what it did
    // read, which was nothing at all.
    for (let n = 1; n <= snapSeq; n += 1) {
      setRow(CONTRAST_AT, n, 'read');
      setRow(round(CONTRAST_AT + CONTRAST_FOR), n, 'snap');
    }
    fix(CONTRAST_AT, 'state');
  });

  // --- the derived views ---------------------------------------------------

  schedule(CHIPS_AT, () => {
    record('proj', CHIPS_AT, 'on' satisfies Lamp);
    record('audit', CHIPS_AT, 'on' satisfies Lamp);
    fix(CHIPS_AT, 'trip');
  });

  for (let at = FEED_FROM; at < SCENE_DURATION; at = round(at + FEED_EVERY)) {
    const poll = round(at);
    schedule(poll, () => {
      const next = log[consumed];
      if (!next || next.at > poll) return;
      consumed += 1;
      const folded = consumed;
      const land = travel('feed', poll);
      schedule(land, () => {
        record('rows', land, String(folded));
        // A derived view sounds when it has caught up with the log, which is
        // the only moment it is entitled to claim that it is right.
        if (folded === log.length) fix(land, 'success', 'feed');
        else sample(land, 'feed', 'state');
      });
    });
  }

  schedule(SETTLE_AT, () => {
    record('settled', SETTLE_AT, 'on');
    fix(SETTLE_AT, 'success');
  });

  // --- run it --------------------------------------------------------------

  drain();

  if (seq !== MAX_SEQ) {
    throw new Error(`${ID} scene: the log ended on seq ${seq}, and the stage draws ${MAX_SEQ} rows`);
  }
  if (snapSeq === 0) throw new Error(`${ID} scene: no snapshot was ever stored`);

  // --- the series, put in time order and collapsed -------------------------

  // Changes are recorded as they are worked out rather than as they happen — a
  // rebuild lays down every row it will light before the first read lands — so
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
  for (const key of ['items', 'paid', 'replay', 'seq', 'snap', 'proj', 'audit', 'rows', 'settled']) {
    flags[key] = seriesOf(key);
  }
  const rows = Array.from({ length: MAX_SEQ }, (_value, index) => seriesOf(`row-${index + 1}`));

  // --- the cues ------------------------------------------------------------

  // Same shape as the other scenes: everything the scene has to say is kept,
  // and the repeating families are thinned to samples so an append or a read
  // is heard often enough to read as a rhythm without becoming one.
  const accepted: Fixed[] = fixed
    .filter((entry) => !BOUNDARIES.some((edge) => Math.abs(entry.at - edge) < BOUNDARY_GAP - EPS))
    .sort((left, right) => left.at - right.at)
    .filter(
      (entry, index, list) =>
        index === 0 || entry.at - (list[index - 1]?.at ?? -99) >= MIN_CUE_GAP - EPS,
    );

  const lastOf: Record<string, number> = { append: -99, apply: -99, replay: -99, feed: -99 };
  candidates.sort((left, right) => left.at - right.at);
  for (const candidate of candidates) {
    let previous = lastOf[candidate.family] ?? -99;
    for (const other of accepted) {
      if (other.family === candidate.family && other.at < candidate.at && other.at > previous) {
        previous = other.at;
      }
    }
    if (candidate.at - previous < SAMPLE_GAP - EPS) continue;
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

  return { flags, rows, travellers, cues, finalSeq: seq, snapSeq };
}

// --- the timeline ----------------------------------------------------------

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);
  const rowElements = Array.from({ length: MAX_SEQ }, (_value, index) =>
    q<SVGRectElement>(stage, `.es-row--${index + 1}`, ID),
  );

  const sim = simulate();
  if (sim.snapSeq > MAX_SEQ || sim.finalSeq > MAX_SEQ) {
    throw new Error(`${ID} scene: the log outgrew the column the stage draws`);
  }

  const parts = mountRequests(layer, sim.travellers.length, ID);
  const tl = createSceneTimeline();

  // --- everything the stage says about itself ------------------------------

  for (const [name, series] of Object.entries(sim.flags)) {
    for (const entry of series) attr(tl, stage, `data-es-${name}`, entry.value, entry.at);
  }
  sim.rows.forEach((series, index) => {
    const element = rowElements[index];
    if (!element) return;
    for (const entry of series) attr(tl, element, 'data-es-row', entry.value, entry.at);
  });

  // --- what travels --------------------------------------------------------

  /** Where a traveller starts, and the one coordinate its lane moves. */
  const LANES: Record<Lane, { x: number; y: number; to: gsap.TweenVars }> = {
    command: { x: X_CMD, y: Y_APP, to: { y: Y_ORDER } },
    ack: { x: X_CMD, y: Y_ORDER, to: { y: Y_APP } },
    append: { x: X_ORDER_RIGHT, y: Y_BUS, to: { x: X_LOG_LEFT } },
    read: { x: X_LOG_LEFT, y: Y_BUS, to: { x: X_ORDER_RIGHT } },
    feed: { x: X_FEED, y: Y_LOG_BOTTOM, to: { y: Y_READERS } },
  };

  sim.travellers.forEach((plan, index) => {
    const request = parts[index];
    if (!request) return;
    const lane = LANES[plan.lane];

    parkRequest(request, lane.x, lane.y);
    showRequest(tl, request, plan.start);
    tl.to(
      request.group,
      { ...lane.to, duration: LEG[plan.lane], ease: 'none', immediateRender: false },
      plan.start,
    );

    // An acknowledgement is the only traveller that comes back with a verdict.
    // Everything else is absorbed by whatever it reached, because an append,
    // a read and a feed all end inside the thing they were going to.
    if (plan.lane === 'ack') {
      markRequest(tl, request, 'ok', plan.land);
      hideRequest(tl, request, plan.land, MARK_FADE);
    } else {
      hideRequest(tl, request, plan.land, FADE);
    }
  });

  // --- sound ---------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels ---------------------------------------------------------

  // The stage is complete on the first frame: an empty aggregate, six unwritten
  // rows, `seq 0`, no snapshot, both derived views dark and nothing in flight.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
