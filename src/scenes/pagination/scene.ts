import {
  HELD_MAX,
  PAGE_SIZE,
  ROW_COUNTS,
  SCANNED_VALUES,
  SCENE_DURATION,
  SLOTS,
  START_ROWS,
  STAGE_STATE,
  X_LANE,
  Y_CLIENT_BOTTOM,
  Y_RESULT_TOP,
  Y_TABLE_BOTTOM,
  Y_TABLE_TOP,
  rowStateAt,
} from './stage';
import type { Held, Mark, Mode, Out, RowState } from './stage';
import { q } from '../shared/dom';
import {
  hideRequest,
  markRequest,
  mountRequests,
  parkRequest,
  showRequest,
} from '../shared/request';
import type { RequestResult } from '../shared/request';
import { createScheduler } from '../shared/simulation';
import { attr, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Pagination scene: a 24 second, four step timeline.
 *
 * The two standing rules apply here as everywhere: every tween sits at an
 * absolute position, and every discrete change is a zero-duration tween on a
 * `data-*` attribute that GSAP reverts when the playhead moves back past it.
 * Nothing on this stage is a quantity, so nothing on it is interpolated.
 *
 * Nothing is placed by hand either. The scene is told five things and one
 * `createScheduler` pass over the whole 24 seconds derives the rest:
 *
 *   1. the table — a hundred rows carrying unique sort keys, drawn in key order
 *      as one strip, with two spare slots for what gets written into it;
 *   2. the page size, which is the only number both ways of paging agree on;
 *   3. the request schedule: when the Client asks, and how it names the place it
 *      wants — `page n`, which is a count from the top, or `after k`, which is
 *      the last row it actually saw;
 *   4. when a row is inserted, and where its key sorts;
 *   5. the pace: how long a lane leg takes and how long one row takes to touch.
 *
 * Everything the reader counts falls out of walking that. **No page contents, no
 * `scanned` figure and no `dup` verdict is written down anywhere in this file.**
 * An offset page is a count-skip from the current top and then a take; a cursor
 * page is a seek to the first key past the one named and then a take; `scanned`
 * is the length of what the walk touched; the lamps are what falls out of
 * comparing a page with the one before it in the same run. In particular the
 * argument of the second step is made by the model rather than asserted: page 4
 * repeats a row because a row was inserted above it and every position after
 * that row moved down one, and the cursor does not repeat it because the key it
 * was given did not move.
 *
 * Three things are declared rather than derived, and none of them touches a
 * label.
 *
 * **A hundred rows, counted exactly.** The captions talk about tables of fifty
 * thousand rows, which is what makes paging necessary in the first place. The
 * stage does not draw fifty thousand of anything: it draws a hundred rows, and
 * `rows n` counts the strip exactly, so every number on the stage is a number
 * about the picture the reader is looking at.
 *
 * **`scanned` at page granularity.** The readout carries an authored set of six
 * values, one per page-size of rows touched. The model counts every row it
 * touches and the readout shows the largest authored value it has passed, so a
 * deep offset walking eighty rows to reach its page is drawn stepping through
 * four marks the cursor never reaches.
 *
 * **The whole table in one response.** The first step's full load is priced as a
 * single bulk read rather than as a walk, because "give me everything" is one
 * gulp and drawing it as a hundred separate steps would say it is not.
 */

const ID = 'pagination';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

const BOUNDARIES = [0, 6, 12, 18, 24];

// --- what the scene is told: the table -------------------------------------

/** The rows, in key order. A key is unique, which is what paging rests on. */
const START_KEYS = Array.from({ length: START_ROWS }, (_value, index) => index + 1);

/**
 * The writes that land while the reader is reading. Both keys sort in front of
 * everything already stored, which is what a list ordered newest-first does to
 * every position behind it.
 */
const INSERTS: { at: number; key: number }[] = [
  { at: 9.0, key: 0 },
  { at: 14.9, key: -1 },
];

/** How long a freshly written row keeps saying it is new. */
const NEW_HOLD = 1.2;

// --- what the scene is told: what is asked, and when ------------------------

/** One way of naming the place a request wants to read from. */
type Ask =
  | { kind: 'all' }
  | { kind: 'offset'; page: number }
  | { kind: 'cursor'; after: number };

interface Request {
  /** When the request leaves the Client. */
  at: number;
  /** When the mode plate changes, which is normally when the request leaves. */
  announce?: number;
  ask: Ask;
  /** Sounded when the plate changes, for a change the caption stops on. */
  announceCue?: SceneCue;
  /** Sounded when the request reaches the Table. */
  arriveCue?: SceneCue;
  /** Sounded when the walk finishes skipping and starts collecting. */
  skipCue?: SceneCue;
  /** Sounded when the page lands in the Result. */
  landCue?: SceneCue;
  /** What the page carries home. A page that drifted is not a good page. */
  verdict?: RequestResult;
}

const REQUESTS: Request[] = [
  { at: 0.2, ask: { kind: 'all' }, arriveCue: 'state', landCue: 'failure', verdict: 'fail' },
  { at: 2.3, ask: { kind: 'offset', page: 1 }, landCue: 'success' },
  { at: 3.3, ask: { kind: 'offset', page: 2 }, landCue: 'success' },
  {
    at: 6.6,
    ask: { kind: 'offset', page: 3 },
    announceCue: 'state',
    skipCue: 'state',
    landCue: 'success',
  },
  { at: 9.8, ask: { kind: 'offset', page: 4 }, verdict: 'fail' },
  {
    at: 12.9,
    announce: 12.5,
    ask: { kind: 'cursor', after: 40 },
    announceCue: 'trip',
    arriveCue: 'state',
    landCue: 'success',
  },
  { at: 15.2, ask: { kind: 'cursor', after: 60 }, landCue: 'success' },
  { at: 18.4, ask: { kind: 'cursor', after: 20 }, landCue: 'success' },
  { at: 19.3, ask: { kind: 'cursor', after: 40 }, landCue: 'success' },
  { at: 20.4, ask: { kind: 'offset', page: 5 } },
  { at: 22.1, ask: { kind: 'cursor', after: 60 }, landCue: 'success' },
];

/** When the first step stops asking for everything and starts asking for a page. */
const RELEASE_AT = 1.9;

/** What the scene holds up for a moment, and for how long. */
const MARK_PLAN: [number, number, Mark, SceneCue][] = [
  [4.8, 0.6, 'position', 'state'],
  [16.6, 0.6, 'jump', 'state'],
  [20.4, 0.6, 'cap', 'state'],
  [21.2, 0.6, 'token', 'state'],
  [22.0, 0.6, 'unique', 'state'],
];

/** The last answer is the one that stands. */
const SETTLE_AT = 23.5;

// --- what the scene is told: the pace --------------------------------------

/** Both lane legs at 500 px/s: 200px down to the Table, 230px on to the Result. */
const LEG_ASK = 0.31;
const LEG_GIVE = 0.35;

/** Touching one row, whether the walk keeps it or throws it away. */
const ROW_TIME = 0.01;

/** Reading the whole table at once, and how many rows one gulp of that is. */
const BULK_TIME = 0.4;
const BULK_CHUNK = 20;

/** How long a traveller takes to go once it is absorbed, or once it is marked. */
const FADE = 0.16;
const MARK_FADE = 0.22;

/** Rules the finished cue list is held to. */
const MIN_CUE_GAP = 0.2;
const BOUNDARY_GAP = 0.3;

// --- what one pass over the scene produces ---------------------------------

interface Change {
  at: number;
  name: string;
  value: string;
}

interface CellChange {
  at: number;
  value: RowState;
}

type Lane = 'ask' | 'give';

interface Traveller {
  lane: Lane;
  start: number;
  land: number;
  result?: RequestResult;
}

/** What one request turned out to be, read back by the build and the audits. */
interface Landing {
  at: number;
  kind: Ask['kind'];
  keys: number[];
  scanned: number;
  skipped: number;
  dup: number[];
  gap: boolean;
  continues: boolean;
  held: number;
  tableRows: number;
}

interface Simulation {
  changes: Change[];
  rows: CellChange[][];
  travellers: Traveller[];
  cues: [number, SceneCue][];
  landings: Landing[];
}

// --- reading the table ------------------------------------------------------

/**
 * What a request returns, which is the whole difference between the two ways of
 * naming a place. An offset counts from the current top and throws away
 * everything it counted; a cursor seeks to the first key past the one it was
 * handed and counts nothing.
 */
function read(table: readonly number[], ask: Ask): { from: number; keys: number[]; skipped: number } {
  if (ask.kind === 'all') return { from: 0, keys: [...table], skipped: 0 };
  if (ask.kind === 'offset') {
    const skipped = Math.min(table.length, (ask.page - 1) * PAGE_SIZE);
    return { from: skipped, keys: table.slice(skipped, skipped + PAGE_SIZE), skipped };
  }
  let from = 0;
  while (from < table.length && (table[from] ?? 0) <= ask.after) from += 1;
  return { from, keys: table.slice(from, from + PAGE_SIZE), skipped: 0 };
}

/** Whether this request carries on from the one before it, so a verdict is due. */
function continuesFrom(ask: Ask, previous: Ask | null, lastKey: number | null): boolean {
  if (!previous || previous.kind !== ask.kind) return false;
  if (ask.kind === 'offset' && previous.kind === 'offset') return ask.page === previous.page + 1;
  if (ask.kind === 'cursor') return lastKey !== null && ask.after === lastKey;
  return false;
}

/** What the mode plate says while a request is the current one. */
function modeOf(ask: Ask): Mode {
  if (ask.kind === 'all') return 'none';
  return (ask.kind === 'offset' ? `page-${ask.page}` : `after-${ask.after}`) as Mode;
}

// --- the simulation --------------------------------------------------------

/**
 * Walks the whole scene in time order.
 *
 * One `createScheduler` pass runs it: the script books the requests, the writes
 * and the marks, and every request books the events that fall out of what it
 * asked — one booking per row it walks past, one per row it collects, one for
 * the page leaving and one for it landing. Booked events run earliest first, so
 * a request that reaches the table after a row was inserted reads the table as
 * it now stands rather than as it stood when the request was sent.
 */
function simulate(): Simulation {
  const { schedule, drain } = createScheduler();

  const changes: Change[] = [];
  const stageHeld: Record<string, string> = {};
  for (const [key, value] of Object.entries(STAGE_STATE)) {
    if (key.startsWith('stage@')) stageHeld[key.slice('stage@'.length)] = value;
  }
  const write = (at: number, name: string, value: string): void => {
    if (stageHeld[name] === value) return;
    stageHeld[name] = value;
    changes.push({ at: round(at), name, value });
  };

  const rows: CellChange[][] = Array.from({ length: SLOTS }, () => []);
  const rowHeld: RowState[] = Array.from({ length: SLOTS }, (_v, i) => rowStateAt(i));
  const setRow = (at: number, slot: number, value: RowState): void => {
    const index = slot - 1;
    if (rowHeld[index] === value) return;
    rowHeld[index] = value;
    rows[index]?.push({ at: round(at), value });
  };

  const travellers: Traveller[] = [];
  const send = (lane: Lane, start: number, result?: RequestResult): void => {
    const duration = lane === 'ask' ? LEG_ASK : LEG_GIVE;
    travellers.push({ lane, start: round(start), land: round(start + duration), result });
  };

  const cues: [number, SceneCue][] = [];
  const sound = (at: number, name: SceneCue): void => {
    cues.push([round(at), name]);
  };

  const landings: Landing[] = [];
  const problems: string[] = [];

  // --- the model everything on the stage is read off -----------------------

  /** The rows, in key order. Inserts go where their key belongs. */
  let table = [...START_KEYS];
  /** Keys handed out in earlier pages of the run the reader is in. */
  const handed = new Set<number>();
  /** Keys of the page on display, and the ones it is handing out twice. */
  let current: number[] = [];
  const currentSet = new Set<number>();
  const dupSet = new Set<number>();
  /** Keys still saying they were just written. */
  const fresh = new Set<number>();
  /** How far down the strip the current walk has counted and discarded. */
  let scanTop = 0;
  /** Rows this request has touched, whether it kept them or not. */
  let touched = 0;
  /** Pages the reader is holding, and where the last one ended. */
  let heldPages = 0;
  let previousAsk: Ask | null = null;
  let lastKey: number | null = null;

  /**
   * What one slot is, which is only ever a question about the row standing in
   * it. `dup` beats `page` because a row handed out twice is the more
   * interesting fact about it, and `scan` beats `read` because what this
   * request is walking over is the thing the reader is being shown — a row the
   * reader already has is no cheaper to walk past a second time.
   *
   * That ordering is also what makes the two ways of paging different pictures
   * rather than different labels. An offset page arrives behind a long band of
   * rows it counted and discarded, so the band the reader already had is
   * underneath it; a cursor page counts nothing, so the band the reader had
   * stays visible and the new page is drawn touching it — or, when a row moved,
   * one slot inside it.
   */
  const rowStateOf = (slot: number): RowState => {
    if (slot > table.length) return 'empty';
    const key = table[slot - 1] ?? 0;
    if (dupSet.has(key)) return 'dup';
    if (currentSet.has(key)) return 'page';
    if (fresh.has(key)) return 'new';
    if (slot <= scanTop) return 'scan';
    if (handed.has(key)) return 'read';
    return 'idle';
  };

  const paint = (at: number): void => {
    for (let slot = 1; slot <= SLOTS; slot += 1) setRow(at, slot, rowStateOf(slot));
    write(at, 'data-pg-rows', String(table.length));
    write(at, 'data-pg-new', fresh.size > 0 ? 'on' : 'off');
  };

  /** The bill, reported at the granularity the readout draws. */
  const showCost = (at: number): void => {
    let shown: number = SCANNED_VALUES[0] ?? 0;
    for (const value of SCANNED_VALUES) if (value <= touched) shown = value;
    write(at, 'data-pg-scanned', String(shown));
  };

  // --- the requests --------------------------------------------------------

  for (const request of REQUESTS) {
    const announceAt = round(request.announce ?? request.at);
    /** Held across the three callbacks one request is spread over. */
    const run = { continues: false, gap: false, lastBefore: null as number | null };

    // Naming the place is one event and reading it is another. The plate
    // changes when the reader asks; the last answer stays on the Result until
    // the database starts producing the next one, which is what a list on a
    // screen does and what keeps a page from flashing past unread.
    schedule(announceAt, () => {
      write(announceAt, 'data-pg-mode', modeOf(request.ask));
      if (request.announceCue) sound(announceAt, request.announceCue);
    });

    schedule(request.at, () => send('ask', request.at));

    const arriveAt = round(request.at + LEG_ASK);
    schedule(arriveAt, () => {
      run.continues = continuesFrom(request.ask, previousAsk, lastKey);
      run.lastBefore = lastKey;
      if (run.continues) {
        // The page on display stops being the answer and becomes what the
        // reader has already been handed.
        for (const key of current) handed.add(key);
      } else {
        handed.clear();
        heldPages = 0;
        write(arriveAt, 'data-pg-held', '0' satisfies Held);
        write(arriveAt, 'data-pg-dup', 'off');
        write(arriveAt, 'data-pg-gap', 'off');
      }
      current = [];
      currentSet.clear();
      dupSet.clear();
      scanTop = 0;
      touched = 0;
      write(arriveAt, 'data-pg-out', 'none' satisfies Out);
      showCost(arriveAt);
      paint(arriveAt);
      if (request.arriveCue) sound(arriveAt, request.arriveCue);

      // The table is read as it stands right now, not as it stood when the
      // request was sent. That one line is the whole of the drift.
      const { keys, skipped } = read(table, request.ask);
      const handedBefore = new Set(handed);
      const first = keys[0];
      run.gap =
        run.continues &&
        first !== undefined &&
        run.lastBefore !== null &&
        table.some((key) => key > (run.lastBefore ?? 0) && key < first);

      const collect = (from: number): number => {
        keys.forEach((key, index) => {
          const when = round(from + (index + 1) * ROW_TIME);
          schedule(when, () => {
            current.push(key);
            currentSet.add(key);
            if (handedBefore.has(key)) dupSet.add(key);
            touched += 1;
            showCost(when);
            paint(when);
          });
        });
        return round(from + keys.length * ROW_TIME);
      };

      let ready: number;
      if (request.ask.kind === 'all') {
        // One response carrying everything is one gulp, so it is priced as
        // gulps rather than as a walk.
        const chunks = Math.max(1, Math.ceil(keys.length / BULK_CHUNK));
        const step = round(BULK_TIME / chunks);
        for (let chunk = 1; chunk <= chunks; chunk += 1) {
          const when = round(arriveAt + chunk * step);
          const upTo = Math.min(keys.length, chunk * BULK_CHUNK);
          schedule(when, () => {
            for (let index = current.length; index < upTo; index += 1) {
              const key = keys[index];
              if (key === undefined) continue;
              current.push(key);
              currentSet.add(key);
              touched += 1;
            }
            showCost(when);
            paint(when);
          });
        }
        ready = round(arriveAt + chunks * step);
      } else {
        // Everything the page will not return, walked over one row at a time.
        for (let step = 1; step <= skipped; step += 1) {
          const when = round(arriveAt + step * ROW_TIME);
          schedule(when, () => {
            scanTop = step;
            touched += 1;
            showCost(when);
            paint(when);
          });
        }
        const skipEnd = round(arriveAt + skipped * ROW_TIME);
        if (request.skipCue) {
          const cue = request.skipCue;
          schedule(skipEnd, () => sound(skipEnd, cue));
        }
        ready = collect(skipEnd);
      }

      schedule(ready, () => {
        // The drift is visible here, in the table, before any lamp says so: the
        // band the page just filled runs into the band the reader already has.
        if (dupSet.size > 0) sound(ready, 'failure');
        send('give', ready, request.verdict ?? 'ok');
      });

      const landAt = round(ready + LEG_GIVE);
      schedule(landAt, () => {
        const bulk = request.ask.kind === 'all';
        if (!bulk) heldPages += 1;
        write(landAt, 'data-pg-held', (bulk ? 'all' : String(heldPages)) as Held);
        write(landAt, 'data-pg-out', (bulk ? 'burst' : dupSet.size > 0 ? 'dup' : 'page') as Out);
        if (run.continues) {
          write(landAt, 'data-pg-dup', dupSet.size > 0 ? 'on' : 'off');
          write(landAt, 'data-pg-gap', run.gap ? 'on' : 'off');
        }
        previousAsk = request.ask;
        if (keys.length > 0) lastKey = keys[keys.length - 1] ?? lastKey;
        landings.push({
          at: landAt,
          kind: request.ask.kind,
          keys: [...keys],
          scanned: touched,
          skipped,
          dup: [...dupSet],
          gap: run.gap,
          continues: run.continues,
          held: bulk ? -1 : heldPages,
          tableRows: table.length,
        });
        if (request.landCue) sound(landAt, request.landCue);
      });
    });
  }

  // --- the writes that land while the reader is reading --------------------

  for (const insert of INSERTS) {
    schedule(insert.at, () => {
      const position = table.findIndex((key) => key > insert.key);
      table = position < 0 ? [...table, insert.key] : [
        ...table.slice(0, position),
        insert.key,
        ...table.slice(position),
      ];
      fresh.add(insert.key);
      paint(insert.at);
      sound(insert.at, 'state');
    });
    const settle = round(insert.at + NEW_HOLD);
    schedule(settle, () => {
      fresh.delete(insert.key);
      paint(settle);
    });
  }

  // --- the beats the captions stop on --------------------------------------

  schedule(RELEASE_AT, () => {
    current = [];
    currentSet.clear();
    dupSet.clear();
    handed.clear();
    scanTop = 0;
    touched = 0;
    heldPages = 0;
    write(RELEASE_AT, 'data-pg-out', 'none' satisfies Out);
    write(RELEASE_AT, 'data-pg-held', '0' satisfies Held);
    write(RELEASE_AT, 'data-pg-mode', 'page-1' satisfies Mode);
    showCost(RELEASE_AT);
    paint(RELEASE_AT);
    sound(RELEASE_AT, 'trip');
  });

  for (const [at, hold, mark, cue] of MARK_PLAN) {
    schedule(at, () => {
      write(at, 'data-pg-mark', mark);
      sound(at, cue);
    });
    const off = round(at + hold);
    schedule(off, () => write(off, 'data-pg-mark', 'none' satisfies Mark));
  }

  schedule(SETTLE_AT, () => {
    write(SETTLE_AT, 'data-pg-settled', 'on');
    sound(SETTLE_AT, 'success');
  });

  drain();

  // --- what the walk has to have produced ----------------------------------

  if (landings.length !== REQUESTS.length) {
    problems.push(`${landings.length} of ${REQUESTS.length} requests came back`);
  }
  REQUESTS.forEach((_request, index) => {
    const landing = landings[index];
    const next = REQUESTS[index + 1];
    if (!landing) return;
    // An answer the reader never had time to look at is not an answer. The
    // next request clears the Result when it reaches the table, so that is the
    // gap the page on display actually gets.
    if (next && round(next.at + LEG_ASK) - landing.at < 0.3) {
      problems.push(`the page landing at ${landing.at} is cleared ${round(next.at + LEG_ASK)}`);
    }
    if (!ROW_COUNTS.includes(landing.tableRows as (typeof ROW_COUNTS)[number])) {
      problems.push(`the table held ${landing.tableRows} rows, which the readout cannot draw`);
    }
    if (!SCANNED_VALUES.includes(landing.scanned as (typeof SCANNED_VALUES)[number])) {
      problems.push(`a request scanned ${landing.scanned}, which the readout cannot draw`);
    }
    if (landing.held > HELD_MAX) problems.push(`the reader held ${landing.held} pages`);
    if (landing.kind !== 'all' && landing.keys.length !== PAGE_SIZE) {
      problems.push(`a page came back holding ${landing.keys.length} rows`);
    }
  });

  // A cursor pays the same however deep it is, and an offset pays for the depth.
  const cursors = landings.filter((landing) => landing.kind === 'cursor');
  const offsets = landings.filter((landing) => landing.kind === 'offset');
  if (cursors.some((landing) => landing.scanned !== PAGE_SIZE)) {
    problems.push('a cursor page scanned something other than the page it returned');
  }
  if (offsets.some((landing) => landing.scanned !== landing.skipped + PAGE_SIZE)) {
    problems.push('an offset page did not pay for what it skipped');
  }
  const deepest = Math.max(...offsets.map((landing) => landing.scanned));
  if (!(deepest > PAGE_SIZE * 2 && deepest > (cursors[0]?.scanned ?? 0))) {
    problems.push('the deepest offset in the scene is not visibly dearer than a cursor');
  }

  // With nothing written underneath them, the two ways of naming a place are
  // the same place. This is the claim the whole second step is a departure from.
  for (let page = 2; page <= 5; page += 1) {
    const byCount = read(START_KEYS, { kind: 'offset', page }).keys;
    const byRow = read(START_KEYS, { kind: 'cursor', after: (page - 1) * PAGE_SIZE }).keys;
    if (byCount.join(',') !== byRow.join(',')) {
      problems.push(`on a still table page ${page} and a cursor disagree`);
    }
  }

  // After a write, exactly one of them drifts, and it drifts by repeating the
  // row the reader last saw rather than by skipping one.
  const drifted = landings.filter((landing) => landing.dup.length > 0 || landing.gap);
  if (drifted.length !== 1) problems.push(`${drifted.length} pages drifted, the scene is about one`);
  const drift = drifted[0];
  if (drift && drift.kind !== 'offset') problems.push('the page that drifted was not an offset page');
  if (drift && drift.dup.join(',') !== String(drift.keys[0])) {
    problems.push(`the repeat was ${drift.dup.join(',')}, not the first row of the page`);
  }
  if (cursors.some((landing) => landing.dup.length > 0 || landing.gap)) {
    problems.push('a cursor page repeated or skipped a row');
  }
  if (!cursors.some((landing) => landing.continues && landing.tableRows > START_ROWS + 1)) {
    problems.push('no cursor page carried on across a write');
  }

  if (table.length !== START_ROWS + INSERTS.length) {
    problems.push(`the table finished holding ${table.length} rows`);
  }
  if (rowHeld.filter((state) => state !== 'empty').length !== table.length) {
    problems.push('the strip and the row count disagree at the end');
  }
  for (const plan of travellers) {
    if (plan.start < 0 || plan.land > SCENE_DURATION) {
      problems.push('a traveller runs off the end of the scene');
    }
  }

  // A cue on a step boundary belongs to neither step, and two cues on top of
  // each other are one noise.
  cues.sort((left, right) => left[0] - right[0]);
  cues.forEach(([at], index) => {
    if (BOUNDARIES.some((edge) => Math.abs(at - edge) < BOUNDARY_GAP - 1e-9)) {
      problems.push(`a cue at ${at} sits on a step boundary`);
    }
    const previous = cues[index - 1]?.[0];
    if (previous !== undefined && at - previous < MIN_CUE_GAP - 1e-9) {
      problems.push(`cues at ${previous} and ${at} are on top of each other`);
    }
  });

  if (problems.length > 0) throw new Error(`${ID} scene: ${[...new Set(problems)].join('; ')}`);

  // --- the changes, collapsed at each instant ------------------------------

  // Two changes to one thing at one instant would render in insertion order
  // forwards and in reverse backwards, so that single frame would depend on
  // which way the reader scrubbed. Only the one that ends up applying is kept.
  const collapse = <T extends { at: number }>(series: T[], keyOf: (item: T) => string): T[] => {
    const ordered: T[] = [];
    for (const entry of series) {
      let replaced = false;
      for (let index = ordered.length - 1; index >= 0; index -= 1) {
        const candidate = ordered[index];
        if (!candidate || candidate.at !== entry.at) break;
        if (keyOf(candidate) === keyOf(entry)) {
          ordered[index] = entry;
          replaced = true;
          break;
        }
      }
      if (!replaced) ordered.push(entry);
    }
    return ordered;
  };

  travellers.sort((left, right) => left.start - right.start);

  return {
    changes: collapse(changes, (entry) => entry.name),
    rows: rows.map((series) => collapse(series, () => 'row')),
    travellers,
    cues,
    landings,
  };
}

// --- the timeline ----------------------------------------------------------

/** Where a traveller starts, and the one coordinate its lane moves. */
const LANES: Record<Lane, { x: number; y: number; to: number }> = {
  ask: { x: X_LANE, y: Y_CLIENT_BOTTOM, to: Y_TABLE_TOP },
  give: { x: X_LANE, y: Y_TABLE_BOTTOM, to: Y_RESULT_TOP },
};

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);
  const rowElements = Array.from({ length: SLOTS }, (_value, index) =>
    q<SVGRectElement>(stage, `.pg-row--${index + 1}`, ID),
  );

  const sim = simulate();

  // The captions name the figures the model produced. Nothing here places them:
  // if the table, the page size or the schedule change, this is what says the
  // captions have stopped describing the scene.
  const deep = sim.landings.find((landing) => landing.kind === 'offset' && landing.skipped === 40);
  const seek = sim.landings.find((landing) => landing.kind === 'cursor');
  if (!deep || !seek) throw new Error(`${ID} scene: the walk fell short`);
  if (deep.skipped !== 40 || deep.scanned !== 60) {
    throw new Error(
      `${ID} scene: the caption says page three skips forty and scans sixty, the model says ` +
        `${deep.skipped} and ${deep.scanned}`,
    );
  }
  if (seek.scanned !== PAGE_SIZE || seek.keys[0] !== 41) {
    throw new Error(
      `${ID} scene: the caption says after key forty reads twenty, the model says ` +
        `${seek.keys[0]} and ${seek.scanned}`,
    );
  }

  const parts = mountRequests(layer, sim.travellers.length, ID);
  const tl = createSceneTimeline();

  // --- everything the stage says about itself ------------------------------

  for (const change of sim.changes) attr(tl, stage, change.name, change.value, change.at);
  sim.rows.forEach((series, index) => {
    const element = rowElements[index];
    if (!element) return;
    for (const entry of series) attr(tl, element, 'data-pg-row', entry.value, entry.at);
  });

  // --- what travels --------------------------------------------------------

  sim.travellers.forEach((plan, index) => {
    const request = parts[index];
    if (!request) return;
    const lane = LANES[plan.lane];

    // A dot is drawn as the lane it belongs to, because a request going down
    // and the page it produced coming after it are different kinds of thing.
    request.group.classList.add(`pg-carry--${plan.lane}`);
    parkRequest(request, lane.x, lane.y);

    showRequest(tl, request, plan.start);
    tl.to(
      request.group,
      {
        y: lane.to,
        duration: round(plan.land - plan.start),
        ease: 'none',
        immediateRender: false,
      },
      plan.start,
    );

    // Only the page carries a verdict. A request on its way down is absorbed by
    // the table it reached.
    if (plan.result) {
      markRequest(tl, request, plan.result, plan.land);
      hideRequest(tl, request, plan.land, MARK_FADE);
    } else {
      hideRequest(tl, request, plan.land, FADE);
    }
  });

  // --- sound ---------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels ---------------------------------------------------------

  // The stage is complete on the first frame: a hundred rows stored in key
  // order, two spare slots, nothing asked for, nothing scanned, nothing
  // received, both lamps dark and nothing in flight.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
