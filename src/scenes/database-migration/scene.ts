import {
  OK_MAX,
  SCENE_DURATION,
  STRIP_SLOTS,
  TABLE_ROWS,
  X_QUERY,
  X_RESULT,
  X_WRITE,
  Y_APP_BOTTOM,
  Y_READS_TOP,
  Y_SCHEMA_BOTTOM,
  Y_SCHEMA_TOP,
} from './stage';
import type { HitState, Mark, NewCell, OldCell, Phase, ReadTarget, SlotState, Version } from './stage';
import { q } from '../shared/dom';
import { hideRequest, markRequest, mountRequests, parkRequest, showRequest } from '../shared/request';
import { createScheduler } from '../shared/simulation';
import { attr, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Database Migration scene: a 24 second, four step timeline.
 *
 * The two standing rules apply here as everywhere: every tween sits at an
 * absolute position, and every discrete change is a zero-duration tween on a
 * `data-*` attribute that GSAP reverts when the playhead moves back past it.
 *
 * Nothing the reader counts is authored. The scene is told eight things — when
 * each instance stops being `v1` and starts being `v2`; when the one-shot
 * rename ghost appears and when it is put away; when the three schema steps
 * happen; when dual writing begins; which instance writes which row and when;
 * which instance reads and when; when the backfill runs its batches; and when
 * the reader is asked to look at something. One pass over the whole 24 seconds
 * turns that into everything else: every cell's state in both columns, which
 * column each read lands on, whether it comes back at all, `rows n`, `ok n`,
 * the `error`, the six slots of the result strip, and the settle.
 *
 * Three derivations carry the argument. **The window is the premise, not a
 * warning.** Which version each instance is running is a fact of the timeline,
 * and a read's target column is computed from the reading version and the
 * schema in force at the instant the query lands — so the first step's failure
 * is not drawn, it is what happens when a `v1` read arrives while the ghost has
 * already taken the column away. The build asserts the biconditional: a read
 * fails exactly when a `v1` reader arrives during the ghost, which is another
 * way of saying nothing else in the scene can break.
 *
 * **Dual writing is a rule about columns, not a badge.** A `v1` write touches
 * the old column; a `v2` write touches the new one, and also the old one while
 * dual writing is on and the old column still exists. That single rule produces
 * the second step's picture — two cells lighting for one instance and one for
 * the other — and the last step's, where the same `v2` write touches one cell
 * because there is only one column left. The build fails if a `v2` write would
 * ever skip a column its `v1` neighbour is still reading.
 *
 * **The switch is earned.** `rows n` counts the rows the new column actually
 * holds, filled by whatever put them there — a dual write or a backfill batch —
 * and the build asserts that it reached six before reads were pointed at the
 * new column. The verification beat is the same count read out loud, so "only
 * then do reads switch" is a property of the ordering rather than a caption.
 *
 * One thing is a picture rather than a measurement. No cell carries a value.
 * What a cell says is whether the value is there and how it got there — set,
 * empty, dual-written, backfilled, moved by the ghost, or gone with its column
 * — because that is the only question the migration asks of a row, and a second
 * copy of the value would be a second thing that could disagree.
 */

const ID = 'database-migration';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

const BOUNDARIES = [0, 6, 12, 18, 24];

// --- how a traveller moves -------------------------------------------------

/** The App-to-Schema lanes: 200px, whether it carries a write or a query. */
const LEG_LANE = 0.26;
/** The Schema-to-Reads lane, which is 230px and so a shade longer. */
const LEG_RESULT = 0.3;
/** How long the Schema holds a query before the answer sets off. */
const SCHEMA_DWELL = 0.1;

/** How long a traveller takes to fade, and how long a result marker holds. */
const FADE_LEG = 0.1;
const MARK_HOLD = 0.22;
const MARK_FADE = 0.14;

/** How long a cell stays lit after a write lands on it. */
const HIT_HOLD = 0.3;

// --- what the scene is told ------------------------------------------------

/** The two App instances, which are the two capsules on the stage. */
type Instance = 0 | 1;

/**
 * When each instance stops running `v1`. The rollout is the whole premise: one
 * instance takes the new version early, the other keeps serving the old one for
 * ten seconds, and everything the schema does has to be true for both.
 */
const UPGRADE_AT: Record<Instance, number> = { 0: 16.2, 1: 7.6 };

/** The one-shot rename, and the moment the scene puts the idea away again. */
const GHOST_AT = 2.2;
const GHOST_END_AT = 4.4;

/** The three steps a destructive change decomposes into. */
const EXPAND_AT = 6.4;
const SWITCH_AT = 15.6;
const CONTRACT_AT = 18.4;

/** When the newer version starts writing both columns. */
const DUAL_AT = 8.2;

/** The backfill: when it starts, and when each batch lands a row. */
const BACKFILL_AT = 12.4;
const BATCH_TIMES = [12.8, 13.4, 14.0, 14.6];

/** When the two columns are checked against each other, before anything moves. */
const VERIFY_AT = 15.0;

/** When the picture calls itself settled, once nothing is left to change. */
const SETTLE_AT = 22.4;

interface WritePlan {
  at: number;
  app: Instance;
  /** The row it updates, 1-based. Which columns it touches is not authored. */
  row: number;
}

/**
 * Every write the App makes. Nothing here says which columns are written: that
 * is the version the instance is running, the columns that exist when the write
 * lands, and whether dual writing is on.
 */
const WRITES: WritePlan[] = [
  { at: 0.4, app: 0, row: 1 },
  { at: 1.2, app: 1, row: 4 },
  { at: 6.9, app: 0, row: 2 },
  { at: 8.2, app: 1, row: 3 },
  { at: 9.8, app: 1, row: 5 },
  { at: 10.2, app: 0, row: 6 },
  { at: 13.0, app: 1, row: 3 },
  { at: 16.45, app: 0, row: 5 },
  { at: 19.6, app: 1, row: 2 },
  { at: 21.0, app: 0, row: 4 },
];

interface ReadPlan {
  at: number;
  app: Instance;
}

/**
 * Every read. Which column it looks in is the reading version and the pointer
 * the switch moves, and whether it finds anything is whether that column exists
 * at the instant the query lands.
 */
const READS: ReadPlan[] = [
  { at: 0.7, app: 0 },
  { at: 1.2, app: 1 },
  { at: 2.8, app: 0 },
  { at: 4.45, app: 0 },
  { at: 6.7, app: 0 },
  { at: 8.8, app: 1 },
  { at: 9.6, app: 0 },
  { at: 10.1, app: 1 },
  { at: 13.6, app: 0 },
  { at: 16.15, app: 1 },
  { at: 18.85, app: 1 },
  { at: 20.74, app: 0 },
];

/** When the scene holds something up, and for how long. */
const MARKS: [number, number, Mark, SceneCue][] = [
  [3.75, 0.6, 'overlap', 'state'],
  [11.0, 0.6, 'compatible', 'state'],
  [15.0, 0.5, 'verify', 'success'],
  [19.8, 0.6, 'deployable', 'state'],
  [20.6, 0.6, 'reversible', 'state'],
];

/** How close two samples of one repeating thing may sound, how close any cue
    may fall to another, and how close any of it may fall to a boundary. */
const SAMPLE_GAP: Record<string, number> = { read: 0.45 };
const MIN_CUE_GAP = 0.2;
const BOUNDARY_GAP = 0.3;

/** Times are rounded to milliseconds, so a gap of exactly the minimum is one. */
const EPS = 1e-6;

// --- what one pass over the scene produces ---------------------------------

/** The three declared segments, each named for what travels down it. */
type Lane = 'write' | 'query' | 'result';

interface Traveller {
  lane: Lane;
  start: number;
  land: number;
  /** How it is drawn: a write, a query that only asks, or an answer. */
  kind: Lane;
  /** The marker it pops when it lands, or nothing for a leg that is not a result. */
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
  apps: Series[][];
  oldCells: Series[][];
  newCells: Series[][];
  oldHits: Series[][];
  newHits: Series[][];
  slots: Series[][];
  travellers: Traveller[];
  cues: [number, SceneCue][];
  /** Read back by the build, so a drift in the derivation fails loudly. */
  okTotal: number;
  failures: number;
  rowsCoveredAt: number;
}

// --- the simulation --------------------------------------------------------

/**
 * Walks the whole scene in time order.
 *
 * The schema's own events are booked before the traffic, so that when a write
 * or a query lands it reads the columns that exist at that instant rather than
 * the ones that existed when it set off. That is the point: a rollout is a
 * span, and what a request finds depends on where in the span it arrives.
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
    start: number,
    duration: number,
    result: Traveller['result'],
  ): number => {
    const land = round(start + duration);
    travellers.push({ lane, start: round(start), land, kind: lane, result });
    return land;
  };

  // --- what the diagram is holding ----------------------------------------

  const versions: Version[] = ['v1', 'v1'];
  const oldCells: OldCell[] = Array.from({ length: TABLE_ROWS }, () => 'set');
  const newCells: NewCell[] = Array.from({ length: TABLE_ROWS }, () => 'absent');
  const strip: SlotState[] = Array.from({ length: STRIP_SLOTS }, () => 'none');

  let ghost = false;
  let oldColumn = true;
  let newColumn = false;
  let dual = false;
  let reads: ReadTarget = 'old';
  let rows = 0;
  let ok = 0;
  let failures = 0;
  /** When the new column first held every row, which is what gates the switch. */
  let rowsCoveredAt = Number.POSITIVE_INFINITY;

  const { schedule, drain } = createScheduler();

  // --- the opening state, which is the whole diagram -----------------------

  record('ghost', 0, 'off');
  record('phase', 0, 'none' satisfies Phase);
  record('oldcol', 0, 'on');
  record('newcol', 0, 'off');
  record('dual', 0, 'off');
  record('backfill', 0, 'off');
  record('reads', 0, 'old' satisfies ReadTarget);
  record('rows', 0, '0');
  record('ok', 0, '0');
  record('err', 0, 'off');
  record('mark', 0, 'none' satisfies Mark);
  record('settled', 0, 'off');
  for (const app of [0, 1]) record(`app-${app}`, 0, 'v1' satisfies Version);
  for (let r = 1; r <= TABLE_ROWS; r += 1) {
    record(`old-${r}`, 0, 'set' satisfies OldCell);
    record(`new-${r}`, 0, 'absent' satisfies NewCell);
    record(`hitold-${r}`, 0, 'off' satisfies HitState);
    record(`hitnew-${r}`, 0, 'off' satisfies HitState);
  }
  for (let s = 1; s <= STRIP_SLOTS; s += 1) record(`slot-${s}`, 0, 'none' satisfies SlotState);

  /**
   * `rows n` recomputed wherever the new column can have changed. It reads the
   * cells and nothing else, so there is no way for the readout to disagree with
   * the table above it — and the moment it first reaches six is a measurement,
   * which is what makes "reads switch only after the backfill" checkable.
   */
  const readRows = (at: number): void => {
    const count = newCells.filter(
      (value) => value === 'dual' || value === 'back' || value === 'moved',
    ).length;
    if (count === rows) return;
    rows = count;
    record('rows', at, String(count));
    if (count === TABLE_ROWS && !ghost && rowsCoveredAt === Number.POSITIVE_INFINITY) {
      rowsCoveredAt = at;
    }
  };

  /** Newest answer on the right, and the oldest one falls off the left. */
  const pushSlot = (value: SlotState, at: number): void => {
    strip.shift();
    strip.push(value);
    strip.forEach((slot, index) => record(`slot-${index + 1}`, at, slot));
  };

  // --- the schema's own events, booked before any traffic ------------------

  for (const app of [0, 1] as Instance[]) {
    const at = UPGRADE_AT[app];
    schedule(at, () => {
      versions[app] = 'v2';
      record(`app-${app}`, at, 'v2' satisfies Version);
      fix(at, 'state');
    });
  }

  // The ghost: a rename is one statement, so the old column stops existing and
  // the new one exists with every row in it, all at one instant. Nothing about
  // that is wrong except that the app is not one statement.
  schedule(GHOST_AT, () => {
    ghost = true;
    oldColumn = false;
    newColumn = true;
    record('ghost', GHOST_AT, 'on');
    record('oldcol', GHOST_AT, 'off');
    record('newcol', GHOST_AT, 'on');
    for (let r = 1; r <= TABLE_ROWS; r += 1) {
      oldCells[r - 1] = 'gone';
      newCells[r - 1] = 'moved';
      record(`old-${r}`, GHOST_AT, 'gone' satisfies OldCell);
      record(`new-${r}`, GHOST_AT, 'moved' satisfies NewCell);
    }
    readRows(GHOST_AT);
    fix(GHOST_AT, 'state');
  });

  schedule(GHOST_END_AT, () => {
    ghost = false;
    oldColumn = true;
    newColumn = false;
    record('ghost', GHOST_END_AT, 'off');
    record('oldcol', GHOST_END_AT, 'on');
    record('newcol', GHOST_END_AT, 'off');
    record('err', GHOST_END_AT, 'off');
    for (let r = 1; r <= TABLE_ROWS; r += 1) {
      oldCells[r - 1] = 'set';
      newCells[r - 1] = 'absent';
      record(`old-${r}`, GHOST_END_AT, 'set' satisfies OldCell);
      record(`new-${r}`, GHOST_END_AT, 'absent' satisfies NewCell);
    }
    readRows(GHOST_END_AT);
    fix(GHOST_END_AT, 'state');
  });

  // Expand: the column arrives empty, which is the whole reason adding is safe.
  schedule(EXPAND_AT, () => {
    newColumn = true;
    record('newcol', EXPAND_AT, 'on');
    record('phase', EXPAND_AT, 'expand' satisfies Phase);
    for (let r = 1; r <= TABLE_ROWS; r += 1) {
      newCells[r - 1] = 'empty';
      record(`new-${r}`, EXPAND_AT, 'empty' satisfies NewCell);
    }
    readRows(EXPAND_AT);
    fix(EXPAND_AT, 'trip');
  });

  schedule(DUAL_AT, () => {
    dual = true;
    record('dual', DUAL_AT, 'on');
    fix(DUAL_AT, 'state');
  });

  schedule(BACKFILL_AT, () => {
    record('backfill', BACKFILL_AT, 'on');
    fix(BACKFILL_AT, 'state');
  });

  // Each batch takes the next row the new column has nothing in, which is why
  // the rows a dual write already covered are not copied twice.
  for (const at of BATCH_TIMES) {
    schedule(at, () => {
      const index = newCells.findIndex((value) => value === 'empty');
      if (index < 0) {
        problems.push(`the backfill batch at ${at} found no row left to copy`);
        return;
      }
      newCells[index] = 'back';
      record(`new-${index + 1}`, at, 'back' satisfies NewCell);
      readRows(at);
      if (!newCells.includes('empty')) record('backfill', at, 'off');
      fix(at, 'state');
    });
  }

  schedule(SWITCH_AT, () => {
    reads = 'new';
    record('reads', SWITCH_AT, 'new' satisfies ReadTarget);
    record('phase', SWITCH_AT, 'switch' satisfies Phase);
    fix(SWITCH_AT, 'trip');
  });

  // Contract: the same instant that drops the column ends dual writing, because
  // there is no longer a second column to write.
  schedule(CONTRACT_AT, () => {
    oldColumn = false;
    dual = false;
    record('oldcol', CONTRACT_AT, 'off');
    record('dual', CONTRACT_AT, 'off');
    record('phase', CONTRACT_AT, 'contract' satisfies Phase);
    for (let r = 1; r <= TABLE_ROWS; r += 1) {
      oldCells[r - 1] = 'gone';
      record(`old-${r}`, CONTRACT_AT, 'gone' satisfies OldCell);
    }
    fix(CONTRACT_AT, 'trip');
  });

  // --- the traffic ---------------------------------------------------------

  for (const plan of WRITES) {
    schedule(plan.at, () => {
      const land = travel('write', plan.at, LEG_LANE, null);
      schedule(land, () => {
        // Which columns a write touches is the version, the columns that exist
        // when it lands, and whether dual writing is on. Nothing else.
        const version = versions[plan.app];
        const targets: ReadTarget[] = [];
        if (version === 'v1') {
          if (oldColumn) targets.push('old');
        } else {
          if (newColumn) targets.push('new');
          if (oldColumn && dual) targets.push('old');
        }
        if (targets.length === 0) {
          problems.push(`the ${version} write at ${plan.at} had no column to write to`);
          return;
        }
        if (version === 'v2' && oldColumn && !dual) {
          problems.push(`the v2 write at ${plan.at} would skip the column v1 still reads`);
        }
        if (land >= CONTRACT_AT && targets.includes('old')) {
          problems.push(`the write at ${plan.at} still touches name after the contract`);
        }
        const off = round(land + HIT_HOLD);
        for (const target of targets) {
          const key = target === 'old' ? 'hitold' : 'hitnew';
          record(`${key}-${plan.row}`, land, 'on' satisfies HitState);
          record(`${key}-${plan.row}`, off, 'off' satisfies HitState);
        }
        if (targets.includes('new') && newCells[plan.row - 1] === 'empty') {
          newCells[plan.row - 1] = 'dual';
          record(`new-${plan.row}`, land, 'dual' satisfies NewCell);
          readRows(land);
        }
      });
    });
  }

  for (const plan of READS) {
    schedule(plan.at, () => {
      const arrive = travel('query', plan.at, LEG_LANE, null);
      schedule(arrive, () => {
        // v1 can only name the column it was compiled against; v2 looks wherever
        // the switch is pointing. Whether it finds anything is whether that
        // column exists at the instant the query lands.
        const version = versions[plan.app];
        const target: ReadTarget = version === 'v2' ? reads : 'old';
        const failed = target === 'old' ? !oldColumn : !newColumn;
        if (failed !== (version === 'v1' && ghost)) {
          problems.push(
            `the read at ${plan.at} ${failed ? 'failed' : 'succeeded'} as ${version} with the ghost ${ghost ? 'up' : 'down'}`,
          );
        }
        if (failed && arrive > EXPAND_AT && arrive < CONTRACT_AT) {
          problems.push(`the read at ${plan.at} found no column between expand and contract`);
        }
        if (arrive >= CONTRACT_AT && target === 'old') {
          problems.push(`the read at ${plan.at} still looks in name after the contract`);
        }
        const leaves = round(arrive + SCHEMA_DWELL);
        schedule(leaves, () => {
          const land = travel('result', leaves, LEG_RESULT, failed ? 'fail' : 'ok');
          schedule(land, () => {
            if (failed) {
              failures += 1;
              record('err', land, 'on');
              pushSlot('err', land);
              fix(land, 'failure');
              return;
            }
            ok += 1;
            record('ok', land, String(ok));
            pushSlot(target, land);
            sample(land, 'read', 'success');
          });
        });
      });
    });
  }

  // --- the things the scene holds up --------------------------------------

  for (const [at, hold, value, name] of MARKS) {
    schedule(at, () => {
      record('mark', at, value);
      fix(at, name);
    });
    schedule(round(at + hold), () => record('mark', round(at + hold), 'none' satisfies Mark));
  }

  schedule(SETTLE_AT, () => {
    record('settled', SETTLE_AT, 'on');
    fix(SETTLE_AT, 'success');
  });

  // --- run it --------------------------------------------------------------

  drain();

  if (ok !== OK_MAX) {
    problems.push(`the scene answered ${ok} reads and the stage counts to ${OK_MAX}`);
  }
  if (failures !== 1) {
    problems.push(`${failures} reads came back empty, the scene is about exactly one`);
  }
  if (rows !== TABLE_ROWS) {
    problems.push(`the new column ended holding ${rows} of ${TABLE_ROWS} rows`);
  }
  if (rowsCoveredAt > SWITCH_AT) {
    problems.push(`reads moved at ${SWITCH_AT} but the new column was only whole at ${rowsCoveredAt}`);
  }
  if (rowsCoveredAt > VERIFY_AT) {
    problems.push(`the columns were checked at ${VERIFY_AT}, before the backfill finished`);
  }
  if (oldColumn) problems.push('the old column outlived the contract');
  if (!newColumn) problems.push('the new column is not there at the end');
  if (versions.some((version) => version !== 'v2')) {
    problems.push(`the rollout ended on ${versions.join('/')}`);
  }
  if (oldCells.some((value) => value !== 'gone')) {
    problems.push(`the dropped column still draws ${oldCells.join('/')}`);
  }
  if (newCells.some((value) => value !== 'dual' && value !== 'back')) {
    problems.push(`the new column ended on ${newCells.join('/')}`);
  }

  if (problems.length > 0) throw new Error(`${ID} scene: ${problems.join('; ')}`);

  // --- the series, put in time order and collapsed -------------------------

  // Changes are recorded as they are worked out rather than as they happen — a
  // landing writes a cell, a readout and six strip slots in one pass — so each
  // key is sorted once here. Two changes to one key at one instant would
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
  for (const key of [
    'ghost',
    'phase',
    'oldcol',
    'newcol',
    'dual',
    'backfill',
    'reads',
    'rows',
    'ok',
    'err',
    'mark',
    'settled',
  ]) {
    flags[key] = seriesOf(key);
  }
  const apps = [0, 1].map((app) => seriesOf(`app-${app}`));
  const indexes = Array.from({ length: TABLE_ROWS }, (_value, index) => index + 1);
  const oldSeries = indexes.map((r) => seriesOf(`old-${r}`));
  const newSeries = indexes.map((r) => seriesOf(`new-${r}`));
  const oldHits = indexes.map((r) => seriesOf(`hitold-${r}`));
  const newHits = indexes.map((r) => seriesOf(`hitnew-${r}`));
  const slots = Array.from({ length: STRIP_SLOTS }, (_value, index) =>
    seriesOf(`slot-${index + 1}`),
  );

  // --- the cues ------------------------------------------------------------

  // Same shape as the other scenes: everything the scene has to say is kept,
  // and the one repeating family is thinned to samples so an answer is heard
  // often enough to read as a rhythm without becoming one.
  const accepted: Fixed[] = fixed
    .filter((entry) => !BOUNDARIES.some((edge) => Math.abs(entry.at - edge) < BOUNDARY_GAP - EPS))
    .sort((left, right) => left.at - right.at)
    .filter(
      (entry, index, list) =>
        index === 0 || entry.at - (list[index - 1]?.at ?? -99) >= MIN_CUE_GAP - EPS,
    );

  const lastOf: Record<string, number> = { read: -99 };
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
    apps,
    oldCells: oldSeries,
    newCells: newSeries,
    oldHits,
    newHits,
    slots,
    travellers,
    cues,
    okTotal: ok,
    failures,
    rowsCoveredAt,
  };
}

// --- the timeline ----------------------------------------------------------

/** Where a traveller starts, the one coordinate its segment moves, and how long. */
const LANES: Record<Lane, { x: number; y: number; to: number; duration: number }> = {
  write: { x: X_WRITE, y: Y_APP_BOTTOM, to: Y_SCHEMA_TOP, duration: LEG_LANE },
  query: { x: X_QUERY, y: Y_APP_BOTTOM, to: Y_SCHEMA_TOP, duration: LEG_LANE },
  result: { x: X_RESULT, y: Y_SCHEMA_BOTTOM, to: Y_READS_TOP, duration: LEG_RESULT },
};

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);
  const appElements = [0, 1].map((index) => q<SVGGElement>(stage, `.dm-app--${index}`, ID));
  const indexes = Array.from({ length: TABLE_ROWS }, (_value, index) => index + 1);
  const oldElements = indexes.map((r) => q<SVGRectElement>(stage, `.dm-cell-old--${r}`, ID));
  const newElements = indexes.map((r) => q<SVGRectElement>(stage, `.dm-cell-new--${r}`, ID));
  const slotElements = Array.from({ length: STRIP_SLOTS }, (_value, index) =>
    q<SVGRectElement>(stage, `.dm-slot--${index + 1}`, ID),
  );

  const sim = simulate();
  if (sim.okTotal !== OK_MAX || sim.failures !== 1) {
    throw new Error(`${ID} scene: ${sim.okTotal} answers and ${sim.failures} failures`);
  }
  if (sim.rowsCoveredAt > SWITCH_AT) {
    throw new Error(`${ID} scene: the switch runs before the backfill finishes`);
  }

  const parts = mountRequests(layer, sim.travellers.length, ID);
  const tl = createSceneTimeline();

  // --- everything the stage says about itself ------------------------------

  for (const [name, series] of Object.entries(sim.flags)) {
    for (const entry of series) attr(tl, stage, `data-dm-${name}`, entry.value, entry.at);
  }
  sim.apps.forEach((series, index) => {
    const element = appElements[index];
    if (!element) return;
    for (const entry of series) attr(tl, element, 'data-dm-app', entry.value, entry.at);
  });
  sim.oldCells.forEach((series, index) => {
    const element = oldElements[index];
    if (!element) return;
    for (const entry of series) attr(tl, element, 'data-dm-cell-old', entry.value, entry.at);
  });
  sim.newCells.forEach((series, index) => {
    const element = newElements[index];
    if (!element) return;
    for (const entry of series) attr(tl, element, 'data-dm-cell-new', entry.value, entry.at);
  });
  sim.oldHits.forEach((series, index) => {
    const element = oldElements[index];
    if (!element) return;
    for (const entry of series) attr(tl, element, 'data-dm-hit', entry.value, entry.at);
  });
  sim.newHits.forEach((series, index) => {
    const element = newElements[index];
    if (!element) return;
    for (const entry of series) attr(tl, element, 'data-dm-hit', entry.value, entry.at);
  });
  sim.slots.forEach((series, index) => {
    const element = slotElements[index];
    if (!element) return;
    for (const entry of series) attr(tl, element, 'data-dm-slot', entry.value, entry.at);
  });

  // --- what travels --------------------------------------------------------

  sim.travellers.forEach((plan, index) => {
    const request = parts[index];
    if (!request) return;
    const lane = LANES[plan.lane];

    // A write and a query are drawn apart from the plain dot, because the
    // argument the scene makes is about them differing: for most of it a write
    // touches two columns while every read touches one. An answer stays plain,
    // because what it says is the marker it pops.
    if (plan.kind !== 'result') request.group.classList.add(`dm-${plan.kind}`);

    parkRequest(request, lane.x, lane.y);
    showRequest(tl, request, plan.start);
    tl.to(
      request.group,
      { y: lane.to, duration: lane.duration, ease: 'none', immediateRender: false },
      plan.start,
    );

    if (plan.result === null) {
      // A write and a query are not results, so neither pops a marker: what the
      // write did is the cell it lit, and what the query asked comes back down
      // the other lane.
      hideRequest(tl, request, plan.land, FADE_LEG);
      return;
    }
    markRequest(tl, request, plan.result, plan.land);
    hideRequest(tl, request, round(plan.land + MARK_HOLD), MARK_FADE);
  });

  // --- sound ---------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels ---------------------------------------------------------

  // The stage is complete on the first frame: two v1 instances, one column with
  // six rows in it, no migration started, no answer given yet, and nothing in
  // flight.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
