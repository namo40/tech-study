import gsap from 'gsap';
import {
  BUSY_W,
  COLS_AFTER,
  EVENT_COUNT,
  PROJECTION,
  READ_COL,
  REBUILD_W,
  ROW_COUNT,
  RULE_COUNT,
  SCENE_DURATION,
  STAGE_STATE,
  WAIT_SPOTS,
  WHOLE_BAND,
  X_COMMAND,
  X_QUERY,
  Y_APP,
  Y_CLIENT,
  Y_DETOUR,
  Y_STORE,
} from './stage';
import { q, qa } from '../shared/dom';
import {
  attachToRequest,
  haloRequest,
  hideRequest,
  markRequest,
  mountRequests,
  parkRequest,
  showRequest,
} from '../shared/request';
import type { RequestResult } from '../shared/request';
import { collapseAtInstant, collapseLast, createScheduler, pairInstant } from '../shared/simulation';
import { attr, fadeAt, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * CQRS scene: a 24 second, four step timeline.
 *
 * Same two rules as the other scenes: every tween sits at an absolute position,
 * and every discrete change is a zero-duration tween on a `data-*` attribute
 * that GSAP reverts when the playhead moves back past it.
 *
 * Nothing the reader counts is authored. The scene says only when a request
 * leaves the client, whether it is a command or a query, which read model row
 * it touches, and three things about the deployment: when the handlers split,
 * when the stores split, and when the read model is rebuilt. Everything else
 * falls out of one run over the whole 24 seconds: which requests have to stand
 * outside because the tier is full, how far each occupancy meter has moved,
 * which rule ticks, when a row goes stale and when a projection makes it fresh
 * again, which query therefore reads the old row, how far the rebuild has got,
 * and what the lag reads at any moment.
 *
 * The one number the scene asserts rather than derives is the shape of the
 * work: a join over three tables costs `JOIN_TIME`, the same answer read from a
 * view costs `VIEW_TIME`, and a projection takes `PROJECTION_TIME` to cross.
 * That difference is the whole argument, so it is an input, not an outcome.
 */

const ID = 'command-query-responsibility-segregation';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- how long a leg takes -------------------------------------------------

/** Client box to the door, to the application band, and out of a wait spot. */
const TO_WAIT = 0.12;
const TO_APP = 0.24;
/**
 * Getting in from a wait spot, in two legs: back onto the lane first, then down
 * it. One diagonal would cut the corner across the tier's own title.
 */
const WAIT_SLIDE = 0.08;
const WAIT_DROP = 0.12;
const WAIT_TO_APP = WAIT_SLIDE + WAIT_DROP;
/** Application band to a store, and a store all the way back to the client. */
const APP_TO_STORE = 0.28;
const HOME = 0.4;

/** The detour a query takes while the read model is being rebuilt. */
const DETOUR_DOWN = 0.42;
const DETOUR_ACROSS = 0.16;
const DETOUR_IN = 0.1;
const TO_DETOUR = DETOUR_DOWN + DETOUR_ACROSS + DETOUR_IN;

/** A request that stood outside for longer than this comes back ringed. */
const LATE_WAIT = 0.15;

// --- how long the work takes ----------------------------------------------

/** Running the write model's rules, and the tick between one rule and the next. */
const RULES_TIME = 0.24;
const RULE_STEP = RULES_TIME / RULE_COUNT;
/** Persisting a command's change. */
const WRITE_TIME = 0.3;
/**
 * The three shapes a read can have. The join is what one model costs when the
 * question does not match the way the data is stored; the view and the read
 * store are the same answer already in the shape the screen wants; the detour
 * is that answer computed from the write side while the read model is gone.
 */
const JOIN_TIME = 1.2;
const VIEW_TIME = 0.3;
const READ_TIME = 0.3;
const SLOW_READ = 0.9;

/** How long a change takes to reach the read store, which is what `lag` says. */
const PROJECTION_TIME = 0.8;
const EVENT_LEGS = [0.15, 0.5, 0.15] as const;
/** How long a spent event takes to go. */
const EVENT_FADE = 0.2;

// --- how much room there is -----------------------------------------------

/** Requests the one Application tier can hold, and each split tier after it. */
const APP_SLOTS = 2;
const QUERY_SLOTS = 3;
/** Operations the one database runs at once, and each store once they split. */
const DB_SLOTS = 2;
const WRITE_STORE_SLOTS = 3;
const READ_STORE_SLOTS = 6;
/**
 * What both occupancy meters are drawn against: the tier's own slots plus the
 * two places a request can stand outside it. The `full` state is read off the
 * same number, so the bar and the colour can never disagree.
 */
const METER_CAP = APP_SLOTS + WAIT_SPOTS.length;

// --- what the deployment does ---------------------------------------------

/** When the handlers split, when the stores split, and when the rebuild runs. */
const SPLIT_CODE_AT = 6;
const SPLIT_STORES_AT = 12;
const SPLIT_TIME = 0.6;
const REBUILD_AT = 18.3;
/** Events the rebuild replays, and how far apart it dispatches them. */
const REBUILD_EVENTS = 8;
const REBUILD_GAP = 0.25;

// --- what the client does -------------------------------------------------

type Kind = 'command' | 'query';

interface RequestPlan {
  start: number;
  kind: Kind;
  /** The read model row this request writes, or the one it asks about. */
  row: number;
}

const command = (start: number, row: number): RequestPlan => ({ start, kind: 'command', row });
const query = (start: number, row: number): RequestPlan => ({ start, kind: 'query', row });

const REQUESTS: RequestPlan[] = [
  // Step 1: one tier and one database, with the reads holding both.
  command(0.4, 0),
  query(1.0, 0),
  command(1.6, 1),
  query(2.2, 1),
  query(2.7, 2),
  command(2.9, 2),
  command(3.1, 0),
  // Step 2: the same traffic against split handlers and one database.
  command(6.8, 0),
  query(6.8, 0),
  query(7.6, 1),
  command(8.4, 1),
  query(8.4, 2),
  query(9.2, 0),
  query(10.0, 1),
  // Step 3: split stores, so a read can arrive before the projection does.
  command(12.8, 0),
  query(13.6, 0),
  query(14.4, 0),
  command(15.0, 1),
  query(15.2, 0),
  command(15.6, 2),
  query(15.7, 0),
  query(16.2, 0),
  query(16.6, 0),
  // Step 4: the read model is thrown away and built again.
  query(19.0, 0),
  query(20.0, 1),
  query(21.0, 0),
  query(21.8, 1),
  query(22.6, 2),
];

// --- what the simulation produces -----------------------------------------

/** One leg of something moving: where it goes, and how long it takes. */
interface Move {
  at: number;
  x: number;
  y: number;
  duration: number;
}

interface RequestOutcome {
  moves: Move[];
  result: RequestResult | null;
  markAt: number;
  homeAt: number;
  /** Ringed because it stood outside, or because it took the long way round. */
  ring: boolean;
}

interface EventOutcome {
  moves: Move[];
  showAt: number;
  fadeAt: number;
}

interface AttrChange {
  at: number;
  key: string;
  name: string;
  value: string;
}

interface Segment {
  from: number;
  to: number;
  vFrom: number;
  vTo: number;
}

/** A box that slides and narrows: the two halves of a band coming apart. */
interface BoxMove {
  at: number;
  x: number;
  width: number;
  duration: number;
}

interface Simulation {
  requests: RequestOutcome[];
  events: EventOutcome[];
  attrs: AttrChange[];
  /** How each band's read box slides out from under its write box. */
  boxes: { app: BoxMove[]; store: BoxMove[] };
  writeBusy: Segment[];
  readBusy: Segment[];
  rebuild: Segment[];
  cues: [number, SceneCue][];
}

// --- meters ---------------------------------------------------------------

/** How long a meter takes to move from one reading to the next. */
const METER_RISE = 0.06;

/**
 * A step series turned into a curve: every change is a short ramp, and the
 * value holds until the next one. The ramp is cut short when two changes land
 * closer together than it is long, so the curve never doubles back on itself.
 */
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

/** Scales a curve of readings into a curve of bar widths. */
function toWidths(segments: Segment[], scale: number): Segment[] {
  return segments.map((segment) => ({
    from: round(segment.from),
    to: round(segment.to),
    vFrom: round(segment.vFrom * scale),
    vTo: round(segment.vTo * scale),
  }));
}

// --- the simulation --------------------------------------------------------

/** A place something queues for: store slots, and the tiers' own capacity. */
interface Pool {
  free: number;
  waiting: ((at: number) => void)[];
}

const pool = (size: number): Pool => ({ free: size, waiting: [] });

type RowState = 'fresh' | 'stale' | 'empty';

function simulate(): Simulation {
  const requests: RequestOutcome[] = REQUESTS.map(() => ({
    moves: [],
    result: null,
    markAt: 0,
    homeAt: 0,
    ring: false,
  }));
  const events: EventOutcome[] = Array.from({ length: EVENT_COUNT }, () => ({
    moves: [],
    showAt: 0,
    fadeAt: 0,
  }));
  const raw: AttrChange[] = [];
  const cues: [number, SceneCue][] = [];

  const setAttr = (at: number, key: string, name: string, value: string): void => {
    raw.push({ at: round(at), key, name, value });
  };
  const cue = (at: number, name: SceneCue): void => {
    cues.push([round(at), name]);
  };
  const move = (
    target: { moves: Move[] },
    at: number,
    x: number,
    y: number,
    duration: number,
  ): void => {
    collapseLast(target.moves, { at: round(at), x, y, duration }, (item) => item.at);
  };

  const { schedule, drain } = createScheduler();

  // --- what the deployment has done so far --------------------------------

  let codeSplit = false;
  let storesSplit = false;
  let rebuilding = false;

  // --- the tiers ----------------------------------------------------------

  /** Slots in use, per tier, and the requests standing outside the write tier. */
  const used = [0, 0];
  const waitLine: { index: number; since: number; spot: number; tier: number }[] = [];
  const spotUsed = WAIT_SPOTS.map(() => false);
  const writeLoad: [number, number][] = [];
  const readLoad: [number, number][] = [];

  /** Which tier a request belongs to: one tier until the handlers split. */
  const tierOf = (kind: Kind): number => (codeSplit && kind === 'query' ? 1 : 0);
  const sizeOf = (tier: number): number => (tier === 1 ? QUERY_SLOTS : APP_SLOTS);

  const readLoads = (at: number): void => {
    const outside = waitLine.length;
    collapseLast<[number, number]>(writeLoad, [round(at), (used[0] ?? 0) + outside], pairInstant);
    collapseLast<[number, number]>(readLoad, [round(at), used[1] ?? 0], pairInstant);
    // The border reads off the same number as the bar, so a tier can never look
    // full while its meter says there is room.
    setAttr(at, 'stage', 'data-write-busy', (used[0] ?? 0) + outside >= METER_CAP ? 'full' : 'ok');
    setAttr(at, 'stage', 'data-read-busy', (used[1] ?? 0) >= METER_CAP ? 'full' : 'ok');
  };

  // --- the stores ---------------------------------------------------------

  const database = pool(DB_SLOTS);
  const writeStore = pool(WRITE_STORE_SLOTS);
  const readStore = pool(READ_STORE_SLOTS);

  /** Which pool a request lands in, which is one database until they split. */
  const storeOf = (kind: Kind): Pool => {
    if (!storesSplit) return database;
    return kind === 'command' ? writeStore : readStore;
  };

  const take = (target: Pool, at: number, run: (at: number) => void): void => {
    if (target.free > 0) {
      target.free -= 1;
      run(at);
      return;
    }
    target.waiting.push(run);
  };

  const give = (target: Pool, at: number): void => {
    target.free += 1;
    const next = target.waiting.shift();
    if (!next) return;
    target.free -= 1;
    next(at);
  };

  // --- the write model's checklist ----------------------------------------

  /** Commands currently in the tier, so the ticks belong to whoever is there. */
  let ruleHolders = 0;
  const clearRules = (at: number): void => {
    for (let n = 0; n < RULE_COUNT; n += 1) setAttr(at, `rule-${n + 1}`, 'data-rule', 'off');
  };

  // --- the read model -----------------------------------------------------

  const rows: RowState[] = Array.from({ length: ROW_COUNT }, () => 'fresh');
  const setRow = (at: number, index: number, state: RowState): void => {
    rows[index] = state;
    setAttr(at, `row-${index + 1}`, 'data-row', state);
  };

  /** How many reads are on each row, so a row lights while any of them is on it. */
  const hits = Array.from({ length: ROW_COUNT }, () => 0);
  const hit = (at: number, index: number, delta: number): void => {
    hits[index] = (hits[index] ?? 0) + delta;
    setAttr(at, `row-${index + 1}`, 'data-hit', (hits[index] ?? 0) > 0 ? 'on' : 'off');
  };

  /** How many reads are running, and in which shape, so one label can say so. */
  let reading = 0;
  const readShape = (): string => (storesSplit ? 'none' : codeSplit ? 'view' : 'join');
  const openRead = (at: number): void => {
    const shape = readShape();
    reading += 1;
    setAttr(at, 'stage', 'data-read', shape);
  };
  const closeRead = (at: number): void => {
    reading -= 1;
    if (reading <= 0) setAttr(at, 'stage', 'data-read', 'none');
  };

  // --- the projection -----------------------------------------------------

  let nextEvent = 0;
  let sent = 0;
  let inFlight = 0;
  /** Events applied since the rebuild started, which is what the bar shows. */
  let applied = 0;
  const rebuildBar: [number, number][] = [];

  /** Sends one change across, and returns when it lands. */
  const project = (at: number, onLand: (at: number) => void): void => {
    const outcome = events[nextEvent];
    nextEvent += 1;
    sent += 1;
    setAttr(at, 'stage', 'data-events', String(sent));
    inFlight += 1;
    setAttr(at, 'stage', 'data-lag', '1');

    const landAt = round(at + PROJECTION_TIME);
    if (outcome) {
      outcome.showAt = round(at);
      outcome.fadeAt = landAt;
      let leg = at;
      move(outcome, leg, PROJECTION.x1, PROJECTION.yRun, EVENT_LEGS[0] ?? 0);
      leg = round(leg + (EVENT_LEGS[0] ?? 0));
      move(outcome, leg, PROJECTION.x2, PROJECTION.yRun, EVENT_LEGS[1] ?? 0);
      leg = round(leg + (EVENT_LEGS[1] ?? 0));
      move(outcome, leg, PROJECTION.x2, PROJECTION.yTop, EVENT_LEGS[2] ?? 0);
    }
    schedule(landAt, () => {
      inFlight -= 1;
      if (inFlight <= 0) setAttr(landAt, 'stage', 'data-lag', '0');
      cue(landAt, 'state');
      onLand(landAt);
    });
  };

  // --- the deployment itself ----------------------------------------------

  const boxes: { app: BoxMove[]; store: BoxMove[] } = { app: [], store: [] };
  const splitBoxes = (at: number, band: 'app' | 'store'): void => {
    boxes[band].push({
      at: round(at),
      x: READ_COL.x,
      width: READ_COL.width,
      duration: SPLIT_TIME,
    });
  };

  schedule(SPLIT_CODE_AT, () => {
    codeSplit = true;
    splitBoxes(SPLIT_CODE_AT, 'app');
    setAttr(SPLIT_CODE_AT, 'stage', 'data-split', 'on');
    cue(SPLIT_CODE_AT, 'trip');
    readLoads(SPLIT_CODE_AT);
  });

  schedule(SPLIT_STORES_AT, () => {
    storesSplit = true;
    splitBoxes(SPLIT_STORES_AT, 'store');
    setAttr(SPLIT_STORES_AT, 'stage', 'data-stores', 'two');
    cue(SPLIT_STORES_AT, 'trip');
  });

  schedule(REBUILD_AT, () => {
    rebuilding = true;
    setAttr(REBUILD_AT, 'stage', 'data-rebuild', 'on');
    setAttr(REBUILD_AT, 'stage', 'data-cols', String(COLS_AFTER));
    for (let index = 0; index < ROW_COUNT; index += 1) setRow(REBUILD_AT, index, 'empty');
    collapseLast<[number, number]>(rebuildBar, [round(REBUILD_AT), 0], pairInstant);
    cue(REBUILD_AT, 'trip');
    for (let n = 0; n < REBUILD_EVENTS; n += 1) {
      const sendAt = round(REBUILD_AT + n * REBUILD_GAP);
      schedule(sendAt, () => {
        project(sendAt, (landAt) => {
          applied += 1;
          collapseLast<[number, number]>(rebuildBar, [landAt, applied / REBUILD_EVENTS], pairInstant);
          // The rows come back in the order the replay reaches them: a third of
          // the events is a third of the table.
          const filled = Math.floor((applied * ROW_COUNT) / REBUILD_EVENTS);
          for (let index = 0; index < filled; index += 1) {
            if (rows[index] !== 'fresh') setRow(landAt, index, 'fresh');
          }
          if (applied === REBUILD_EVENTS) {
            rebuilding = false;
            setAttr(landAt, 'stage', 'data-rebuild', 'off');
            cue(landAt, 'trip');
          }
        });
      });
    }
  });

  // --- one request at a time ----------------------------------------------

  /** The work a request does once it is inside a store, and what it costs. */
  const serviceOf = (plan: RequestPlan): number => {
    if (plan.kind === 'command') return WRITE_TIME;
    if (!codeSplit) return JOIN_TIME;
    if (!storesSplit) return VIEW_TIME;
    return READ_TIME;
  };

  /** Everything that happens between arriving in a tier and leaving it. */
  function inside(index: number, at: number, waited: number): void {
    const plan = REQUESTS[index];
    const outcome = requests[index];
    if (!plan || !outcome) return;
    const lane = plan.kind === 'command' ? X_COMMAND : X_QUERY;
    const tier = tierOf(plan.kind);
    outcome.ring = waited > LATE_WAIT;

    const askAt = plan.kind === 'command' ? round(at + RULES_TIME) : at;
    if (plan.kind === 'command') {
      // The rules run one after another, and the checklist starts again for
      // whoever is holding it, so what the reader sees is the current command.
      // It clears once the last command in the tier has gone down to a store.
      ruleHolders += 1;
      clearRules(at);
      for (let n = 0; n < RULE_COUNT; n += 1) {
        setAttr(round(at + (n + 1) * RULE_STEP), `rule-${n + 1}`, 'data-rule', 'on');
      }
    }

    schedule(askAt, () => {
      take(storeOf(plan.kind), askAt, (grantAt) => {
        const service = serviceOf(plan);
        const arriveAt = round(grantAt + APP_TO_STORE);
        const endAt = round(arriveAt + service);
        move(outcome, grantAt, lane, Y_STORE, APP_TO_STORE);

        if (plan.kind === 'command') {
          schedule(arriveAt, () => {
            ruleHolders -= 1;
            if (ruleHolders <= 0) clearRules(arriveAt);
          });
        }

        if (plan.kind === 'query') {
          schedule(arriveAt, () => {
            openRead(arriveAt);
            hit(arriveAt, plan.row, 1);
          });
        }

        schedule(endAt, () => {
          if (plan.kind === 'query') {
            closeRead(endAt);
            hit(endAt, plan.row, -1);
            // A read is only wrong if the row it read is behind the write side.
            const staleRead = rows[plan.row] === 'stale';
            outcome.result = 'ok';
            outcome.markAt = endAt;
            outcome.homeAt = round(endAt + HOME);
            if (staleRead) {
              outcome.ring = true;
              setAttr(endAt, 'stage', 'data-stale', 'on');
              setAttr(outcome.homeAt, 'stage', 'data-stale', 'off');
            }
            move(outcome, endAt, lane, Y_CLIENT, HOME);
            cue(outcome.homeAt, staleRead ? 'failure' : 'success');
          } else {
            outcome.result = 'ok';
            outcome.markAt = endAt;
            outcome.homeAt = round(endAt + HOME);
            move(outcome, endAt, lane, Y_CLIENT, HOME);
            cue(outcome.homeAt, 'success');
            // The write side has moved; the read model has not, until the
            // projection catches up with it.
            if (storesSplit) {
              setRow(endAt, plan.row, 'stale');
              project(endAt, (landAt) => {
                if (rows[plan.row] === 'stale') setRow(landAt, plan.row, 'fresh');
              });
            }
          }
          give(storeOf(plan.kind), endAt);
          leave(tier, endAt);
        });
      });
    });
  }

  /** A query served from the write side while the read model is being rebuilt. */
  function detour(index: number): void {
    const plan = REQUESTS[index];
    const outcome = requests[index];
    if (!plan || !outcome) return;
    const tier = tierOf(plan.kind);

    move(outcome, plan.start, X_QUERY, Y_DETOUR, DETOUR_DOWN);
    move(outcome, round(plan.start + DETOUR_DOWN), X_COMMAND, Y_DETOUR, DETOUR_ACROSS);
    move(outcome, round(plan.start + DETOUR_DOWN + DETOUR_ACROSS), X_COMMAND, Y_STORE, DETOUR_IN);

    const arriveAt = round(plan.start + TO_DETOUR);
    schedule(arriveAt, () => {
      take(writeStore, arriveAt, (grantAt) => {
        const endAt = round(grantAt + SLOW_READ);
        schedule(endAt, () => {
          outcome.result = 'ok';
          outcome.markAt = endAt;
          outcome.ring = true;
          outcome.homeAt = round(endAt + HOME);
          move(outcome, endAt, X_COMMAND, Y_CLIENT, HOME);
          cue(outcome.homeAt, 'success');
          give(writeStore, endAt);
          leave(tier, endAt);
        });
      });
    });
  }

  /** Gives a tier slot back, and lets in whoever has been standing outside. */
  function leave(tier: number, at: number): void {
    used[tier] = (used[tier] ?? 0) - 1;
    readLoads(at);
    for (;;) {
      // The first request outside that the freed tier can now take. Both tiers
      // share the two places to stand, so the line is not one tier's alone.
      const slot = waitLine.findIndex((item) => (used[item.tier] ?? 0) < sizeOf(item.tier));
      const head = waitLine[slot];
      if (!head) return;
      waitLine.splice(slot, 1);
      spotUsed[head.spot] = false;
      used[head.tier] = (used[head.tier] ?? 0) + 1;
      readLoads(at);
      const waited = round(at - head.since);
      const plan = REQUESTS[head.index];
      const outcome = requests[head.index];
      const lane = plan?.kind === 'command' ? X_COMMAND : X_QUERY;
      const spot = WAIT_SPOTS[head.spot] ?? WAIT_SPOTS[0];
      if (outcome) {
        move(outcome, at, lane, spot.y, WAIT_SLIDE);
        move(outcome, round(at + WAIT_SLIDE), lane, Y_APP, WAIT_DROP);
      }
      const arriveAt = round(at + WAIT_TO_APP);
      schedule(arriveAt, () => inside(head.index, arriveAt, waited));
    }
  }

  REQUESTS.forEach((plan, index) => {
    const outcome = requests[index];
    if (!outcome) return;
    const decideAt = round(plan.start + TO_WAIT);

    schedule(decideAt, () => {
      const tier = tierOf(plan.kind);
      if ((used[tier] ?? 0) < sizeOf(tier)) {
        used[tier] = (used[tier] ?? 0) + 1;
        readLoads(decideAt);
        if (plan.kind === 'query' && rebuilding) {
          detour(index);
          return;
        }
        const lane = plan.kind === 'command' ? X_COMMAND : X_QUERY;
        const arriveAt = round(plan.start + TO_APP);
        move(outcome, plan.start, lane, Y_APP, TO_APP);
        schedule(arriveAt, () => inside(index, arriveAt, 0));
        return;
      }
      // No room: stand outside, where the meter can count you.
      const spot = Math.max(0, spotUsed.findIndex((busy) => !busy));
      const place = WAIT_SPOTS[spot] ?? WAIT_SPOTS[0];
      spotUsed[spot] = true;
      waitLine.push({ index, since: decideAt, spot, tier });
      readLoads(decideAt);
      move(outcome, plan.start, place.x, place.y, TO_WAIT);
    });
  });

  drain();

  // --- the meters, once every reading is known ----------------------------

  const writeBusy = toWidths(stepCurve(writeLoad, SCENE_DURATION), BUSY_W / METER_CAP);
  const readBusy = toWidths(stepCurve(readLoad, SCENE_DURATION), BUSY_W / METER_CAP);
  const rebuild = toWidths(stepCurve(rebuildBar, SCENE_DURATION), REBUILD_W);

  // --- put the discrete changes in time order -----------------------------

  const inTimeOrder = raw
    .map((entry, order) => ({ entry, order }))
    .sort((left, right) => left.entry.at - right.entry.at || left.order - right.order)
    .map(({ entry }) => entry);

  const folded: AttrChange[] = [];
  for (const entry of inTimeOrder) {
    collapseAtInstant(folded, entry, (change) => `${change.key}@${change.name}`);
  }

  const seen = new Map<string, string>(Object.entries(STAGE_STATE));
  const attrs: AttrChange[] = [];
  for (const change of folded) {
    const id = `${change.key}@${change.name}`;
    if (seen.get(id) === change.value) continue;
    seen.set(id, change.value);
    attrs.push(change);
  }

  cues.sort((left, right) => left[0] - right[0]);

  return { requests, events, attrs, boxes, writeBusy, readBusy, rebuild, cues };
}

// --- the timeline ----------------------------------------------------------

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const targets: Record<string, Element> = { stage };
  for (let index = 1; index <= RULE_COUNT; index += 1) {
    targets[`rule-${index}`] = q<SVGGElement>(stage, `.cq-rule--${index}`, ID);
  }
  for (let index = 1; index <= ROW_COUNT; index += 1) {
    targets[`row-${index}`] = q<SVGGElement>(stage, `.cq-row--${index}`, ID);
  }

  const appRead = q<SVGRectElement>(stage, '.cq-app-box--read', ID);
  const storeRead = q<SVGRectElement>(stage, '.cq-store-box--read', ID);
  const writeBusyFill = q<SVGRectElement>(stage, '.cq-write-busy-fill', ID);
  const readBusyFill = q<SVGRectElement>(stage, '.cq-read-busy-fill', ID);
  const rebuildFill = q<SVGRectElement>(stage, '.cq-rebuild-fill', ID);
  const eventEls = qa<SVGGElement>(stage, '.cq-event');
  const requestLayer = q<SVGGElement>(stage, '.scene-requests', ID);

  const sim = simulate();
  const parts = mountRequests(requestLayer, REQUESTS.length, ID);

  const tl = createSceneTimeline();

  // --- discrete state -----------------------------------------------------

  for (const change of sim.attrs) {
    const element = targets[change.key];
    if (!element) continue;
    attr(tl, element, change.name, change.value, change.at);
  }

  // --- the two bands coming apart -----------------------------------------

  const slide = (element: Element, steps: readonly BoxMove[]): void => {
    for (const step of steps) {
      tl.fromTo(
        element,
        { attr: { x: WHOLE_BAND.x, width: WHOLE_BAND.width } },
        {
          attr: { x: step.x, width: step.width },
          duration: step.duration,
          ease: 'power2.inOut',
          immediateRender: false,
        },
        step.at,
      );
    }
  };
  slide(appRead, sim.boxes.app);
  slide(storeRead, sim.boxes.store);

  // --- the meters ---------------------------------------------------------

  const widen = (element: Element, segment: Segment): void => {
    if (segment.to <= segment.from || segment.vFrom === segment.vTo) return;
    tl.fromTo(
      element,
      { attr: { width: segment.vFrom } },
      {
        attr: { width: segment.vTo },
        duration: segment.to - segment.from,
        ease: 'none',
        immediateRender: false,
      },
      segment.from,
    );
  };
  for (const segment of sim.writeBusy) widen(writeBusyFill, segment);
  for (const segment of sim.readBusy) widen(readBusyFill, segment);
  for (const segment of sim.rebuild) widen(rebuildFill, segment);

  // --- projection events --------------------------------------------------

  sim.events.forEach((item, index) => {
    const element = eventEls[index];
    if (!element) return;
    gsap.set(element, { x: PROJECTION.x1, y: PROJECTION.yTop, opacity: 0 });
    if (item.moves.length === 0) return;

    tl.set(element, { opacity: 1, immediateRender: false }, item.showAt);
    for (const step of item.moves) {
      tl.to(
        element,
        { x: step.x, y: step.y, duration: step.duration, ease: 'none', immediateRender: false },
        step.at,
      );
    }
    tl.to(element, { opacity: 0, duration: EVENT_FADE, immediateRender: false }, item.fadeAt);
  });

  // --- requests -----------------------------------------------------------

  REQUESTS.forEach((plan, index) => {
    const item = parts[index];
    const outcome = sim.requests[index];
    if (!item || !outcome) return;

    const lane = plan.kind === 'command' ? X_COMMAND : X_QUERY;
    item.group.setAttribute('data-kind', plan.kind);
    parkRequest(item, lane, Y_CLIENT);
    // A command is a square and a query is a circle, so the two are told apart
    // by shape before anything is told apart by colour.
    if (plan.kind === 'command') {
      gsap.set(item.dot, { opacity: 0 });
      const square = attachToRequest(item, 'rect', {
        class: 'scene-req-square',
        x: '-13',
        y: '-13',
        width: '26',
        height: '26',
        rx: '5',
      });
      gsap.set(square, { opacity: 1 });
    }
    showRequest(tl, item, plan.start);

    for (const step of outcome.moves) {
      tl.to(
        item.group,
        { x: step.x, y: step.y, duration: step.duration, ease: 'none', immediateRender: false },
        step.at,
      );
    }

    if (outcome.result !== null) markRequest(tl, item, outcome.result, outcome.markAt);
    if (outcome.ring) haloRequest(tl, item, outcome.markAt, outcome.homeAt, 0.2);
    hideRequest(tl, item, outcome.homeAt, fadeAt(outcome.homeAt, SCENE_DURATION));
  });

  // --- sound --------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels --------------------------------------------------------

  // The stage is complete on the first frame: one application box over one
  // database, an empty rules checklist, a read model nobody has asked for yet,
  // and both meters at nothing.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', SPLIT_CODE_AT);
  tl.addLabel('step-3', SPLIT_STORES_AT);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
