import {
  BULK_COUNT,
  ENTITY_NAMES,
  PLANS,
  ROWS_PER_CHIP,
  ROW_COUNT,
  SCENE_DURATION,
  SNAP_TEXTS,
  SPEED,
  SQL_COUNT,
  STAGE_STATE,
  TOTAL_TEXTS,
  VALUE_TEXTS,
  X_CALL,
  X_ROW,
  Y_CODE_IN,
  Y_CODE_OUT,
  Y_CTX,
  Y_DB,
  memoryWidth,
  trackedIndex,
} from './stage';
import type { CodeLine, CodePlan, EntityName, RowState } from './stage';
import { q, qa } from '../shared/dom';
import { hideRequest, mountRequests, parkRequest, showRequest } from '../shared/request';
import { collapseAtInstant, createScheduler } from '../shared/simulation';
import { attr, fadeAt, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Change Tracking scene: a 24 second, four step timeline.
 *
 * Same two rules as the other scenes: every tween sits at an absolute position,
 * and every discrete change is a zero-duration tween on a `data-*` attribute
 * that GSAP reverts when the playhead moves back past it.
 *
 * Nothing on this stage is placed by hand. The scene is told three things: the
 * eight snippets in `stage.ts` with a cost on every row, the instant each one
 * starts running, and what goes wrong on two of the runs. One interpreter walks
 * the rows and everything else falls out of it.
 *
 * The interpreter holds what a `DbContext` holds: for each entity it has handed
 * out, its current values, the snapshot it copied when it first saw them, and
 * the state that follows from the two. A query materialises rows and files them
 * as `Unchanged` with a snapshot; an assignment changes the values and nothing
 * else, which is exactly the point of the first step — the row is out of date
 * with its snapshot and still says `Unchanged`, because nobody has looked yet.
 * `SaveChanges` is what looks: `DetectChanges` walks every tracked row, compares
 * it with its snapshot, and the rows that differ become `Modified` with the
 * columns that differ named. Only those columns reach the statement.
 *
 * The statements are therefore derived rather than written. An `Added` row emits
 * an INSERT, a `Deleted` row a DELETE, a `Modified` row an UPDATE listing its
 * dirty columns, and an entity that came from outside has no snapshot at all, so
 * every column is dirty and the UPDATE names them all. More than one statement
 * opens a transaction; a statement that violates a constraint takes the frame
 * with it, which is why the rollback greys the two that had already landed and
 * leaves the tracker holding the same pending changes it held before.
 *
 * The sweep is proportional and that is the lesson: `DetectChanges` costs one
 * pass per tracked row, so a context holding one entity is done in a flicker and
 * a context holding a thousand takes two thirds of a second every time anything
 * is saved.
 *
 * Two readings come off the tracker rather than being set. `tracked n` is how
 * many rows it holds, and the memory meter is a share of a fixed budget read off
 * the same number, which is why a thousand row query pushes it to 70% and
 * `AsNoTracking` leaves it where an empty context sits.
 *
 * One sampling, declared once: a bulk result is a thousand rows, drawn as ten
 * chips and ten rows of texture. One chip is one texture row is a hundred rows,
 * and the counter steps by a hundred as each one lands.
 *
 * The snippet in the Code box changes seven times, which are the only cuts in
 * the scene. Every one of them is scheduled at an instant when no cursor is on a
 * row, no statement is outstanding and nothing is travelling, and none of them
 * carries identity across: each snippet is a fresh unit of work.
 */

const ID = 'change-tracking';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- how long the parts of a save take ------------------------------------

/** How long one row of the tracker stays lit while `DetectChanges` reads it. */
const SCAN_HOLD = 0.05;
/** Seconds `DetectChanges` spends on one named row, and on one row of texture. */
const SCAN_PITCH_ROW = 0.05;
const SCAN_PITCH_BULK = 0.065;
/** How long the sweep takes to start, so a one row context still shows one. */
const SCAN_OPEN = 0.03;
/** How long the database takes to answer the last statement of a save. */
const STATEMENT_TIME = 0.4;
/** Seconds between two statements of the same batch, unless a run says otherwise. */
const BATCH_PITCH = 0.4;
/**
 * How long a traveller takes to fade once it has been absorbed, and how much
 * room the next one on the same lane needs behind it. A stream of chips lands
 * on one spot, so every fade is clipped to leave the follower a clear halo.
 */
const FADE = 0.14;
const CLEARANCE = 52;
/** How long the meter takes to move to a new reading. */
const METER_MOVE = 0.12;
/** How long after a save lands that the tracker accepts the result. */
const ACCEPT_DELAY = 0.05;

/** Seconds a traveller spends covering the distance between two stops. */
const travel = (from: number, to: number): number => round(Math.abs(to - from) / SPEED);

// --- what the scene is told -----------------------------------------------

/** A tracker row present before a run starts, because the step opens on it. */
interface Seed {
  name: EntityName;
  value: string;
  total: string;
  token?: boolean;
}

interface Run {
  /** When the cursor lands on the first row of the snippet. */
  at: number;
  plan: string;
  /** When the snippet is swapped in, which is always a quiet instant. */
  cutAt: number;
  /** The cut empties the tracker before it seeds it. */
  clears?: boolean;
  /** The rows the tracker already holds when the step opens. */
  seed?: Seed[];
  /** Index of the statement that violates a constraint, if one does. */
  failStatement?: number;
  /** Seconds between two statements of this run's batch. */
  batchPitch?: number;
  /** When another session's save shows up in the database. */
  otherAt?: number;
}

/** The eight runs. Every instant on the stage is derived from these. */
const RUNS: Run[] = [
  { at: 0.4, plan: 's1', cutAt: 0 },
  {
    at: 6.4,
    plan: 's2a',
    cutAt: 5.9,
    clears: true,
    seed: [
      { name: 'Order #12', value: 'Paid', total: '40' },
      { name: 'Line #1', value: 'sku A', total: '1' },
      { name: 'Line #2', value: 'sku B', total: '1' },
    ],
  },
  { at: 9.95, plan: 's2b', cutAt: 9.85, failStatement: 1, batchPitch: 0.12 },
  { at: 12.0, plan: 's3', cutAt: 11.9, clears: true },
  { at: 14.62, plan: 's3n', cutAt: 14.6 },
  { at: 18.05, plan: 's4a', cutAt: 17.9, clears: true },
  { at: 19.8, plan: 's4b', cutAt: 19.75, clears: true },
  {
    at: 21.55,
    plan: 's4c',
    cutAt: 21.3,
    clears: true,
    seed: [{ name: 'Order #12', value: 'Shipped', total: '40', token: true }],
    otherAt: 21.45,
  },
];

/**
 * The long lived context, which is the one thing on the stage that is not a
 * snippet: four requests served by one `DbContext` that never lets go of what it
 * tracked. The counter is the running total, so the leak is arithmetic.
 */
const LIFETIME_AT = 16.5;
const LEAK_AT = 16.7;
const LEAK_REQUESTS = [100, 200, 300, 400];
const LEAK_PITCH = 0.15;

// --- what the simulation produces -----------------------------------------

interface AttrChange {
  at: number;
  key: string;
  name: string;
  value: string;
}

interface Mover {
  /** Which lane it rides and where it starts. */
  x: number;
  from: number;
  to: number;
  showAt: number;
  duration: number;
  hideAt: number;
  /** Seconds it takes to disappear once it has arrived. */
  fade: number;
  /** Which of the four kinds of traveller it is, for its size and colour. */
  kind: 'call' | 'stmt' | 'entity' | 'chip';
}

interface MeterStep {
  at: number;
  width: number;
}

interface Simulation {
  attrs: AttrChange[];
  movers: Mover[];
  meter: MeterStep[];
  cues: [number, SceneCue][];
}

// --- the tracker ----------------------------------------------------------

/** One entity the context has handed out and is therefore watching. */
interface Tracked {
  name: EntityName;
  state: RowState;
  value: string;
  total: string;
  /** What the values were when the context first saw them. */
  snapValue: string | null;
  snapTotal: string | null;
  /** Which columns `DetectChanges` found different. */
  dirty: 'none' | 'value' | 'all';
  /** Whether the row carries a concurrency token the UPDATE has to check. */
  token: boolean;
}

/** The snapshot text for a pair of values, which is how a row shows it. */
const snapText = (value: string | null, total: string | null): string =>
  value === null || total === null ? 'none' : `{${value} ${total}}`;

/** The DELETE a removed line emits, which names the row it was loaded as. */
const deleteStatement = (name: EntityName): number => (name === 'Line #1' ? 4 : 3);

/** The order EF Core sends a batch in: inserts, then deletes, then updates. */
const SEND_ORDER: RowState[] = ['Added', 'Deleted', 'Modified'];

function simulate(): Simulation {
  const raw: AttrChange[] = [];
  const movers: Mover[] = [];
  const meter: MeterStep[] = [];
  const cues: [number, SceneCue][] = [];

  const setAttr = (at: number, key: string, name: string, value: string): void => {
    raw.push({ at: round(at), key, name, value });
  };
  const cue = (at: number, name: SceneCue): void => {
    cues.push([round(at), name]);
  };

  /** The rows of the tracker, in the order the reader sees them. */
  const slots: (Tracked | null)[] = Array.from({ length: ROW_COUNT }, () => null);
  /** How many entities a bulk result added, which no named row can hold. */
  let bulkTracked = 0;

  const namedCount = (): number => slots.filter((slot) => slot !== null).length;
  const trackedCount = (): number => namedCount() + bulkTracked;

  /** Writes the count, and the meter reading that follows from it. */
  const readTracker = (at: number): void => {
    const count = trackedCount();
    setAttr(at, 'stage', 'data-tracked', String(trackedIndex(count)));
    meter.push({ at: round(at), width: memoryWidth(count) });
  };

  /** Writes one row of the tracker from the entity it is holding. */
  const paintRow = (at: number, index: number): void => {
    const entity = slots[index];
    const key = `row-${index}`;
    if (!entity) {
      setAttr(at, key, 'data-row', 'empty');
      setAttr(at, key, 'data-name', 'none');
      setAttr(at, key, 'data-value', 'none');
      setAttr(at, key, 'data-total', 'none');
      setAttr(at, key, 'data-snap', 'none');
      setAttr(at, key, 'data-dirty', 'none');
      return;
    }
    setAttr(at, key, 'data-row', entity.state.toLowerCase());
    setAttr(at, key, 'data-name', String(ENTITY_NAMES.indexOf(entity.name)));
    setAttr(at, key, 'data-value', String(VALUE_TEXTS.indexOf(entity.value as never)));
    setAttr(at, key, 'data-total', String(TOTAL_TEXTS.indexOf(entity.total as never)));
    setAttr(
      at,
      key,
      'data-snap',
      String(SNAP_TEXTS.indexOf(snapText(entity.snapValue, entity.snapTotal) as never)),
    );
    setAttr(at, key, 'data-dirty', entity.dirty);
  };

  const paintAll = (at: number): void => {
    for (let index = 0; index < ROW_COUNT; index += 1) paintRow(at, index);
  };

  const find = (name: EntityName): number => slots.findIndex((slot) => slot?.name === name);

  const place = (entity: Tracked): number => {
    const free = slots.findIndex((slot) => slot === null);
    const index = free < 0 ? ROW_COUNT - 1 : free;
    slots[index] = entity;
    return index;
  };

  /** Clears everything a new unit of work starts without. */
  const clearStatements = (at: number): void => {
    for (let index = 0; index < SQL_COUNT; index += 1) {
      setAttr(at, `sql-${index}`, 'data-stmt', 'none');
      setAttr(at, `sql-${index}`, 'data-run', 'off');
    }
    setAttr(at, 'stage', 'data-tx', 'off');
    setAttr(at, 'stage', 'data-affected', 'none');
    setAttr(at, 'stage', 'data-result', 'none');
    setAttr(at, 'stage', 'data-exception', 'off');
  };

  const clearBulk = (at: number): void => {
    for (let index = 0; index < BULK_COUNT; index += 1) {
      setAttr(at, `bulk-${index}`, 'data-bulk', 'off');
      setAttr(at, `bulk-${index}`, 'data-scan', 'off');
    }
    bulkTracked = 0;
  };

  const { schedule, drain } = createScheduler();

  /** A traveller that rides one lane from one stop to the next. */
  const move = (kind: Mover['kind'], x: number, from: number, to: number, at: number): number => {
    const duration = travel(from, to);
    movers.push({
      kind,
      x,
      from,
      to,
      showAt: round(at),
      duration,
      hideAt: round(at + duration),
      fade: FADE,
    });
    return round(at + duration);
  };

  /** The statement rows an entity emits, in the order EF Core writes them. */
  const statementFor = (entity: Tracked): number[] => {
    if (entity.state === 'Added') return [2];
    if (entity.state === 'Deleted') return [deleteStatement(entity.name)];
    if (entity.dirty === 'all') return [6, 7];
    return entity.token ? [9, 8] : [1];
  };

  // --- running one snippet ------------------------------------------------

  function run(runner: Run): void {
    const plan = PLANS[runner.plan] as CodePlan;

    /** `SaveChanges`: look at everything, send what differs, then accept it. */
    const save = (at: number): void => {
      clearStatements(at);
      setAttr(at, 'stage', 'data-detect', 'on');
      cue(at, 'trip');

      // DetectChanges walks whatever the tracker is holding, one row at a time,
      // so what it costs is what the tracker is carrying.
      const bulkRows = bulkTracked / ROWS_PER_CHIP;
      const scanned = bulkRows > 0 ? bulkRows : namedCount();
      const pitch = bulkRows > 0 ? SCAN_PITCH_BULK : SCAN_PITCH_ROW;
      let sweepAt = round(at + SCAN_OPEN);
      for (let index = 0; index < scanned; index += 1) {
        const key = bulkRows > 0 ? `bulk-${index}` : `row-${index}`;
        setAttr(sweepAt, key, 'data-scan', 'on');
        setAttr(round(sweepAt + SCAN_HOLD), key, 'data-scan', 'off');
        sweepAt = round(sweepAt + pitch);
      }
      const decidedAt = round(Math.max(sweepAt, at + 0.06));
      setAttr(decidedAt, 'stage', 'data-detect', 'off');

      // What differs from its snapshot is Modified, and only the columns that
      // differ are marked. Nothing else moves.
      let changed = false;
      slots.forEach((entity, index) => {
        if (!entity || entity.state !== 'Unchanged') return;
        if (entity.value === entity.snapValue && entity.total === entity.snapTotal) return;
        entity.state = 'Modified';
        entity.dirty = 'value';
        changed = true;
        paintRow(decidedAt, index);
      });
      if (changed) cue(decidedAt, 'state');

      const pending = slots
        .map((entity, index) => ({ entity, index }))
        .filter(
          (item): item is { entity: Tracked; index: number } =>
            item.entity !== null && item.entity.state !== 'Unchanged',
        )
        .sort(
          (left, right) =>
            SEND_ORDER.indexOf(left.entity.state) - SEND_ORDER.indexOf(right.entity.state),
        );

      if (pending.length === 0) {
        // Nothing to send. The sweep still happened, which is the whole cost of
        // tracking a result set nobody meant to change.
        setAttr(decidedAt, 'stage', 'data-affected', '0');
        cue(decidedAt, 'state');
        return;
      }

      const opensTransaction = pending.length > 1;
      const batchPitch = runner.batchPitch ?? BATCH_PITCH;
      const firstLeaves = round(decidedAt + 0.02);
      if (opensTransaction) {
        setAttr(firstLeaves, 'stage', 'data-tx', 'open');
        cue(firstLeaves, 'state');
      }

      let slot = 0;
      let landedAt = decidedAt;
      pending.forEach((item, order) => {
        const texts = statementFor(item.entity);
        const leaveAt = round(firstLeaves + order * batchPitch);
        const arriveAt = move('stmt', X_CALL, Y_CTX, Y_DB, leaveAt);
        schedule(arriveAt, () => {
          for (const text of texts) {
            if (slot >= SQL_COUNT) break;
            setAttr(arriveAt, `sql-${slot}`, 'data-stmt', String(text));
            setAttr(arriveAt, `sql-${slot}`, 'data-run', 'live');
            slot += 1;
          }
          cue(arriveAt, 'state');
        });
        landedAt = Math.max(landedAt, arriveAt);
      });

      const resultAt = round(landedAt + STATEMENT_TIME);

      if (runner.failStatement !== undefined) {
        // One statement violates a constraint, so the frame takes the rest with
        // it. The tracker is untouched: the changes are still pending.
        const failing = runner.failStatement;
        schedule(resultAt, () => {
          for (let index = 0; index < SQL_COUNT; index += 1) {
            setAttr(resultAt, `sql-${index}`, 'data-run', index === failing ? 'failed' : 'undone');
          }
          setAttr(resultAt, 'stage', 'data-tx', 'rollback');
          cue(resultAt, 'failure');
        });
        return;
      }

      const affected = pending.length;
      // The UPDATE checks the version it read. Somebody else has already saved,
      // so the WHERE matches nothing and the save comes back with zero rows.
      const conflicted =
        runner.otherAt !== undefined && pending.some((item) => item.entity.token);

      schedule(resultAt, () => {
        if (conflicted) {
          setAttr(resultAt, 'stage', 'data-affected', '0');
          setAttr(resultAt, 'stage', 'data-result', 'fail');
          setAttr(resultAt, 'stage', 'data-exception', 'on');
          cue(resultAt, 'failure');
          return;
        }
        setAttr(resultAt, 'stage', 'data-affected', String(affected));
        setAttr(resultAt, 'stage', 'data-result', 'ok');
        if (opensTransaction) setAttr(resultAt, 'stage', 'data-tx', 'commit');
        cue(resultAt, 'success');

        // Accepted: what was added or modified is now what the database holds,
        // so the snapshot is retaken and what was deleted stops being tracked.
        const acceptAt = round(resultAt + ACCEPT_DELAY);
        for (const item of pending) {
          if (item.entity.state === 'Deleted') slots[item.index] = null;
          else {
            item.entity.state = 'Unchanged';
            item.entity.snapValue = item.entity.value;
            item.entity.snapTotal = item.entity.total;
            item.entity.dirty = 'none';
          }
        }
        setAttr(acceptAt, 'stage', 'data-allcols', 'off');
        paintAll(acceptAt);
        readTracker(acceptAt);
        cue(acceptAt, 'state');
      });
    };

    /** One query: down to the database, and back with what it materialised. */
    const query = (row: CodeLine, at: number): void => {
      const rows = row.rows ?? 1;
      const bulk = rows > 1;
      const noTracking = row.noTracking === true;
      if (bulk && !noTracking) setAttr(at, 'stage', 'data-table', 'bulk');
      const arriveAt = move('call', X_CALL, Y_CODE_OUT, Y_DB, at);

      schedule(arriveAt, () => {
        setAttr(arriveAt, 'sql-0', 'data-stmt', String(row.sql ?? 0));
        setAttr(arriveAt, 'sql-0', 'data-run', 'live');
        cue(arriveAt, 'state');

        const chips = bulk ? BULK_COUNT : 1;
        const pitch = bulk ? (noTracking ? 0.083 : 0.111) : 0;
        for (let chip = 0; chip < chips; chip += 1) {
          const leaveAt = round(arriveAt + chip * pitch);
          const landsAt = move(
            bulk ? 'chip' : 'entity',
            X_ROW,
            Y_DB,
            noTracking ? Y_CODE_IN : Y_CTX,
            leaveAt,
          );
          const which = chip;
          schedule(landsAt, () => {
            if (noTracking) {
              // The result never reaches the tracker, so nothing is filed and
              // nothing is counted. The chip goes straight back to the code.
              if (which === 0) cue(landsAt, 'state');
              return;
            }
            if (bulk) {
              setAttr(landsAt, `bulk-${which}`, 'data-bulk', 'on');
              bulkTracked += ROWS_PER_CHIP;
            } else {
              const values = row.values ?? ['New', '40'];
              const index = place({
                name: row.entity ?? 'Order #12',
                state: 'Unchanged',
                value: values[0],
                total: values[1],
                snapValue: values[0],
                snapTotal: values[1],
                dirty: 'none',
                token: false,
              });
              paintRow(landsAt, index);
            }
            readTracker(landsAt);
            cue(landsAt, 'state');
          });
        }
      });
    };

    /** One row of the snippet: light the cursor, do what it says, move on. */
    const step = (index: number, at: number): void => {
      const row = plan.lines[index] as CodeLine | undefined;
      if (!row) {
        setAttr(at, 'stage', 'data-cursor', 'none');
        return;
      }
      setAttr(at, 'stage', 'data-cursor', String(index));

      if (row.kind === 'query') {
        query(row, at);
      } else if (row.kind === 'assign') {
        const slotIndex = find(row.entity as EntityName);
        const entity = slots[slotIndex];
        if (entity) {
          entity.value = row.value ?? entity.value;
          paintRow(at, slotIndex);
          cue(at, 'state');
        }
      } else if (row.kind === 'add') {
        const values = row.values ?? ['sku C', '2'];
        const slotIndex = place({
          name: row.entity as EntityName,
          state: 'Added',
          value: values[0],
          total: values[1],
          snapValue: null,
          snapTotal: null,
          dirty: 'none',
          token: false,
        });
        paintRow(at, slotIndex);
        readTracker(at);
        cue(at, 'state');
      } else if (row.kind === 'remove') {
        const slotIndex = find(row.entity as EntityName);
        const entity = slots[slotIndex];
        if (entity) {
          entity.state = 'Deleted';
          entity.dirty = 'none';
          paintRow(at, slotIndex);
          cue(at, 'state');
        }
      } else if (row.kind === 'update' || row.kind === 'attach') {
        // The entity comes from outside the context, so it arrives on the lane
        // the code hands work down rather than out of the database.
        const values = row.values ?? ['Shipped', '40'];
        const detached = row.kind === 'update';
        const landsAt = move('entity', X_CALL, Y_CODE_OUT, Y_CTX, at);
        schedule(landsAt, () => {
          const slotIndex = place({
            name: row.entity as EntityName,
            // `Update` has no snapshot to compare against, so it has to assume
            // every column changed. `Attach` files it as untouched instead.
            state: detached ? 'Modified' : 'Unchanged',
            value: values[0],
            total: values[1],
            snapValue: detached ? null : values[0],
            snapTotal: detached ? null : values[1],
            dirty: detached ? 'all' : 'none',
            token: false,
          });
          if (detached) setAttr(landsAt, 'stage', 'data-allcols', 'on');
          paintRow(landsAt, slotIndex);
          readTracker(landsAt);
          cue(landsAt, 'state');
        });
      } else if (row.kind === 'mark') {
        const slotIndex = find(row.entity as EntityName);
        const entity = slots[slotIndex];
        if (entity) {
          entity.state = 'Modified';
          entity.dirty = 'value';
          paintRow(at, slotIndex);
          cue(at, 'state');
        }
      } else if (row.kind === 'save') {
        save(at);
      }

      const next = round(at + row.cost);
      schedule(next, () => step(index + 1, next));
    };

    step(0, runner.at);
  }

  /** The cut that puts a snippet on screen and the tracker in its opening state. */
  function cut(runner: Run): void {
    const at = round(runner.cutAt);
    setAttr(at, 'stage', 'data-snippet', runner.plan);
    setAttr(at, 'stage', 'data-cursor', 'none');
    clearStatements(at);

    if (runner.clears) {
      for (let index = 0; index < ROW_COUNT; index += 1) slots[index] = null;
      clearBulk(at);
      setAttr(at, 'stage', 'data-table', 'rows');
      setAttr(at, 'stage', 'data-allcols', 'off');
      setAttr(at, 'stage', 'data-rowversion', 'off');
      setAttr(at, 'stage', 'data-lifetime', 'off');
      setAttr(at, 'stage', 'data-leak', 'off');
      setAttr(at, 'stage', 'data-bypass', 'off');
      setAttr(at, 'stage', 'data-other', 'off');
    }
    for (const seed of runner.seed ?? []) {
      place({
        name: seed.name,
        state: 'Unchanged',
        value: seed.value,
        total: seed.total,
        snapValue: seed.value,
        snapTotal: seed.total,
        dirty: 'none',
        token: seed.token ?? false,
      });
      if (seed.token) setAttr(at, 'stage', 'data-rowversion', 'on');
    }
    if (PLANS[runner.plan]?.lines.some((line) => line.noTracking)) {
      // The next query skips the tracker, so the lane through the context opens
      // and whatever the last one filed is let go.
      setAttr(at, 'stage', 'data-bypass', 'on');
      setAttr(at, 'stage', 'data-table', 'rows');
      clearBulk(at);
    }
    paintAll(at);
    readTracker(at);
    cue(at, 'trip');

    if (runner.otherAt !== undefined) {
      const otherAt = round(runner.otherAt);
      setAttr(otherAt, 'stage', 'data-other', 'on');
      cue(otherAt, 'state');
    }
  }

  for (const runner of RUNS) {
    if (runner.cutAt > 0) schedule(runner.cutAt, () => cut(runner));
    schedule(runner.at, () => run(runner));
  }

  // The long lived context: one DbContext across four requests, never emptied.
  schedule(LIFETIME_AT, () => {
    setAttr(LIFETIME_AT, 'stage', 'data-lifetime', 'request');
    cue(LIFETIME_AT, 'state');
  });
  schedule(LEAK_AT, () => {
    setAttr(LEAK_AT, 'stage', 'data-lifetime', 'singleton');
    setAttr(LEAK_AT, 'stage', 'data-table', 'bulk');
    setAttr(LEAK_AT, 'stage', 'data-bypass', 'off');
    cue(LEAK_AT, 'trip');
    let held = 0;
    LEAK_REQUESTS.forEach((request, index) => {
      const at = round(LEAK_AT + 0.1 + index * LEAK_PITCH);
      held += request;
      const rows = Math.min(held / ROWS_PER_CHIP, BULK_COUNT);
      for (let row = 0; row < rows; row += 1) setAttr(at, `bulk-${row}`, 'data-bulk', 'on');
      bulkTracked = held;
      readTracker(at);
      cue(at, 'state');
    });
    const failAt = round(LEAK_AT + 0.1 + LEAK_REQUESTS.length * LEAK_PITCH + 0.05);
    setAttr(failAt, 'stage', 'data-leak', 'on');
    cue(failAt, 'failure');
  });

  drain();

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

  // Clip each fade so the traveller behind it has a clear halo when it lands on
  // the same spot: what a chip stream costs is worked out, not guessed at.
  const byStop = new Map<string, Mover[]>();
  for (const mover of movers) {
    const key = `${mover.x}@${mover.to}`;
    const list = byStop.get(key);
    if (list) list.push(mover);
    else byStop.set(key, [mover]);
  }
  for (const list of byStop.values()) {
    list.sort((left, right) => left.hideAt - right.hideAt);
    list.forEach((mover, index) => {
      const next = list[index + 1];
      if (!next) return;
      const room = next.hideAt - mover.hideAt - CLEARANCE / SPEED;
      mover.fade = Math.max(0.03, round(Math.min(mover.fade, room)));
    });
  }

  meter.sort((left, right) => left.at - right.at);
  const meterSteps: MeterStep[] = [];
  let lastWidth = memoryWidth(0);
  for (const entry of meter) {
    if (entry.width === lastWidth) continue;
    lastWidth = entry.width;
    if (meterSteps[meterSteps.length - 1]?.at === entry.at) meterSteps.pop();
    meterSteps.push(entry);
  }

  cues.sort((left, right) => left[0] - right[0]);
  const deduped: [number, SceneCue][] = [];
  const heard = new Set<string>();
  for (const entry of cues) {
    const id = `${entry[0]}@${entry[1]}`;
    if (heard.has(id)) continue;
    heard.add(id);
    deduped.push(entry);
  }

  return { attrs, movers, meter: meterSteps, cues: deduped };
}

// --- the timeline ---------------------------------------------------------

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const targets: Record<string, Element> = { stage };
  for (let index = 0; index < ROW_COUNT; index += 1) {
    targets[`row-${index}`] = q<SVGGElement>(stage, `.ct-row--${index}`, ID);
  }
  for (let index = 0; index < BULK_COUNT; index += 1) {
    targets[`bulk-${index}`] = q<SVGRectElement>(stage, `.ct-bulk--${index}`, ID);
  }
  for (let index = 0; index < SQL_COUNT; index += 1) {
    targets[`sql-${index}`] = q<SVGGElement>(stage, `.ct-stmt--${index}`, ID);
  }
  const meterFill = q<SVGRectElement>(stage, '.ct-meter-fill', ID);
  const layer = q<SVGGElement>(stage, '.scene-requests', ID);

  const sim = simulate();
  const parts = mountRequests(layer, sim.movers.length, ID);
  const groups = qa<SVGGElement>(layer, '.scene-req');

  const tl = createSceneTimeline();

  // --- discrete state -----------------------------------------------------

  for (const change of sim.attrs) {
    const element = targets[change.key];
    if (!element) continue;
    attr(tl, element, change.name, change.value, change.at);
  }

  // --- how much the context is holding ------------------------------------

  for (const entry of sim.meter) {
    tl.to(
      meterFill,
      { attr: { width: entry.width }, duration: METER_MOVE, ease: 'none', immediateRender: false },
      entry.at,
    );
  }

  // --- travellers ---------------------------------------------------------

  sim.movers.forEach((mover, index) => {
    const item = parts[index];
    if (!item) return;
    groups[index]?.classList.add(`ct-req--${mover.kind}`);
    parkRequest(item, mover.x, mover.from);
    showRequest(tl, item, mover.showAt);
    tl.to(
      item.group,
      { y: mover.to, duration: mover.duration, ease: 'none', immediateRender: false },
      mover.showAt,
    );
    hideRequest(tl, item, mover.hideAt, Math.min(mover.fade, fadeAt(mover.hideAt, SCENE_DURATION)));
  });

  // --- sound --------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels --------------------------------------------------------

  // The stage is complete on the first frame: the first snippet in the Code box
  // with no cursor on it, an empty tracker under a context holding nothing but
  // itself, and a database that has been sent nothing.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
