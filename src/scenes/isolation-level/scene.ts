import {
  CHIP_DX,
  CHIP_H,
  CHIP_W,
  LANE_X,
  RULES,
  SCENE_DURATION,
  STAGE_STATE,
  WAITS_MAX,
  WAITS_STEP,
  Y_ROW,
  Y_TXN,
  Y_WAIT,
} from './stage';
import type { Level } from './stage';
import { q } from '../shared/dom';
import {
  attachToRequest,
  haloRequest,
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
 * Isolation Level scene: a 24 second, four step timeline.
 *
 * Same two rules as the other scenes: every tween sits at an absolute position,
 * and every discrete change is a zero-duration tween on a `data-*` attribute
 * that GSAP reverts when the playhead moves back past it.
 *
 * Nothing the reader watches is placed by hand. The scene is told four things:
 * what each level does (`RULES` in the stage module, five rules per level),
 * when the dial is turned, which statements each transaction runs and how long
 * it thinks between them, and how much each write adds to the row. Everything
 * else falls out of one pass over the whole 24 seconds.
 *
 * Which transaction waits is whoever finds the row already taken, so the second
 * one stops short of the row because the first is holding it rather than
 * because a keyframe says so. What a reader is served is the last committed
 * value, or under snapshot the value the reading transaction began on, which is
 * why the same query answers 3 and then 2 while the level is read committed and
 * answers the same thing twice once it is not. A write is refused when the
 * version the writer began on is no longer the version on the row, which is why
 * the second writer in the third step rolls back, retries against the row it
 * finds the second time, and lands on a different number than it first tried to
 * write. The waits gauge is the scene counting its own waiting: it ticks toward
 * whatever the level in force costs while anybody is blocked, and back down to
 * nothing when nobody is. Even the anomaly table is derived — each cell asks the
 * same rules whether that level lets that anomaly through.
 */

const ID = 'isolation-level';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- how a traveller moves -------------------------------------------------

/**
 * One speed for every leg of every journey, in pixels per second. A fixed speed
 * rather than a fixed duration keeps the two lanes comparable: the drop from a
 * transaction box to the row takes exactly three tenths of a second on both
 * sides, and backing off to the wait mark costs the same twelve hundredths
 * whichever transaction had to do it.
 */
const SPEED = 2000 / 3;

const travel = (from: number, to: number): number => Math.abs(to - from) / SPEED;

/** How long a result marker stays before the traveller fades. */
const FADE = 0.18;

// --- what the row and the levels do ---------------------------------------

/**
 * The version the row carries before anything in the scene has run. It is 4
 * rather than 1 because the third step is where versions go on show, and by
 * then three writes have landed: the number the reader first sees is 7 because
 * the scene counted, not because it was told to say 7.
 */
const BASE_VERSION = 4;

/** The value the row starts on. */
const BASE_STOCK = 5;

/** How long an anomaly stays marked in the table after it is demonstrated. */
const MARK_HOLD = 2;

/** How often the waits gauge moves, and how many of its steps raise a sound. */
const WAITS_TICK = 0.06;
const RISE_SAMPLE = 4;

// --- what the scene is told ------------------------------------------------

/** One statement inside a transaction. */
interface Op {
  kind: 'select' | 'update';
  /** Seconds the transaction thinks before running this statement. */
  delay: number;
  /** What an update adds to the value it is working from. */
  by?: number;
}

/** One run of one transaction: when it begins, what it runs, when it ends. */
interface Run {
  /** Lane, zero based: 0 is T1 and 1 is T2. */
  txn: 0 | 1;
  start: number;
  ops: Op[];
  /** Seconds between the last statement coming home and the commit. */
  commitDelay: number;
  /** Seconds after a rollback before the same work is tried again. */
  retryDelay?: number;
}

/**
 * The eight transactions the scene runs, in the order they begin.
 *
 * Step 1 is one writer and two readers, so the reader that arrives mid-write
 * has something to be held by. Step 2 is a reader that reads twice with a
 * writer landing in between, then the same pair again once the dial has moved.
 * Step 3 is two writers that both began on the same version. Step 4 runs no
 * transaction at all: it is the dial and the table.
 */
const RUNS: Run[] = [
  // Step 1: the writer, the reader it blocks, and the reader that follows it.
  { txn: 0, start: 0.4, ops: [{ kind: 'update', delay: 0.3, by: -2 }], commitDelay: 2.1 },
  { txn: 1, start: 1.6, ops: [{ kind: 'select', delay: 0 }], commitDelay: 0.5 },
  { txn: 1, start: 4.14, ops: [{ kind: 'select', delay: 0 }], commitDelay: 0.4 },
  // Step 2: two reads with a commit between them, then the same at a higher level.
  {
    txn: 1,
    start: 6.4,
    ops: [
      { kind: 'select', delay: 0 },
      { kind: 'select', delay: 0.8 },
    ],
    commitDelay: 0.4,
  },
  { txn: 0, start: 6.9, ops: [{ kind: 'update', delay: 0, by: -1 }], commitDelay: 0 },
  {
    txn: 1,
    start: 9.4,
    ops: [
      { kind: 'select', delay: 0 },
      { kind: 'select', delay: 0.5 },
    ],
    commitDelay: 0,
  },
  { txn: 0, start: 9.9, ops: [{ kind: 'update', delay: 0, by: -1 }], commitDelay: 0.2 },
  // Step 3: a snapshot read, then two writers that began on the same version.
  {
    txn: 1,
    start: 12.9,
    ops: [
      { kind: 'select', delay: 0 },
      { kind: 'update', delay: 0.7, by: -1 },
    ],
    commitDelay: 0.3,
    retryDelay: 0.6,
  },
  { txn: 0, start: 13.9, ops: [{ kind: 'update', delay: 0.2, by: 5 }], commitDelay: 0.5 },
];

/** When the dial is turned, and to what. */
const LEVEL_CHANGES: [number, Level][] = [
  [9, 'rr'],
  [12.4, 'snap'],
];

/** When the version stops being an implementation detail and goes on show. */
const VERSION_AT = 12.4;

/** When both transaction boxes are cleared, which is the end of the third step. */
const IDLE_AT = 17.9;

/** The last step: the dial walks the four levels, then settles on one. */
const TOUR_START = 18.4;
const TOUR_EVERY = 0.8;
const TOUR_ORDER: Level[] = ['rc', 'rr', 'snap', 'ser'];
const SETTLE_AT = 22.2;
const SETTLE_LEVEL: Level = 'rc';

// --- what the simulation produces -----------------------------------------

interface Leg {
  at: number;
  to: number;
  duration: number;
}

interface Mark {
  at: number;
  result: 'ok' | 'fail';
}

interface Traveller {
  txn: 0 | 1;
  /** When it becomes visible, always at `Y_TXN`. */
  start: number;
  legs: Leg[];
  marks: Mark[];
  /** Stretches it is ringed for, which is exactly the time it spends waiting. */
  rings: [number, number][];
  /** The value it is carrying home, and when it picked it up. */
  stock: [number, number] | null;
  /** The version its work is conditional on, once versions are on show. */
  version: [number, number] | null;
  /** When whatever it carries goes, which is when the journey ends. */
  chipEnd: number;
  fadeAt: number;
}

interface AttrChange {
  at: number;
  key: string;
  name: string;
  value: string;
}

interface Simulation {
  travellers: Traveller[];
  attrs: AttrChange[];
  cues: [number, SceneCue][];
}

// --- the simulation -------------------------------------------------------

/** One live transaction: what it began on, what it has seen, what it owes. */
interface Txn {
  run: Run;
  txn: 0 | 1;
  ops: Op[];
  step: number;
  /** The value and version it began on, which is what a snapshot answers from. */
  snapValue: number;
  snapVersion: number;
  /** Every value it has been served, so a second answer can be compared. */
  reads: number[];
  /** The value it has written but not yet committed. */
  pending: number | null;
  conflicted: boolean;
  retried: boolean;
}

/** A writer parked at the wait mark, and what to do when the row comes free. */
interface Waiter {
  txn: 0 | 1;
  resume: (at: number) => void;
}

function simulate(): Simulation {
  const travellers: Traveller[] = [];
  const raw: AttrChange[] = [];
  const cues: [number, SceneCue][] = [];

  const setAttr = (at: number, key: string, name: string, value: string): void => {
    raw.push({ at: round(at), key, name, value });
  };
  const cue = (at: number, name: SceneCue): void => {
    cues.push([round(at), name]);
  };

  const newTraveller = (txn: 0 | 1, start: number): number => {
    travellers.push({
      txn,
      start: round(start),
      legs: [],
      marks: [],
      rings: [],
      stock: null,
      version: null,
      chipEnd: 0,
      fadeAt: 0,
    });
    return travellers.length - 1;
  };

  /** Adds one vertical leg, which always begins where the last one ended. */
  const addLeg = (index: number, to: number, at: number, duration: number): void => {
    if (duration <= 0) return;
    travellers[index]?.legs.push({ at: round(at), to, duration: round(duration) });
  };

  /** Closes the open ring on a traveller that has stopped waiting. */
  const closeRing = (index: number, at: number): void => {
    const rings = travellers[index]?.rings ?? [];
    const ring = rings[rings.length - 1];
    if (ring && ring[1] === ring[0]) ring[1] = round(at);
  };

  const setStmt = (txn: number, value: string, at: number): void => {
    setAttr(at, `stmt-${txn + 1}`, 'data-stmt', value);
  };
  const setStatus = (txn: number, value: string, at: number): void => {
    setAttr(at, `status-${txn + 1}`, 'data-st', value);
  };

  // --- state the simulation carries ---------------------------------------

  /** The level in force, which every rule below is looked up through. */
  let level: Level = 'rc';
  /** The last committed value on the row, and the version stamped on it. */
  let stock = BASE_STOCK;
  let version = BASE_VERSION;
  /** Versions exist from the first frame; they go on show in the third step. */
  let versionShown = false;
  /** Who is writing the row, and who is reading it under a level that holds on. */
  let writeLock: number | null = null;
  const readLocks = new Set<number>();
  const waiters: Waiter[] = [];

  /** The gauge: what it reads now, what it is heading for, and who is blocked. */
  let waitsNow = 0;
  let waitsTarget = 0;
  let blocked = 0;
  /** True once the last step starts showing what each level costs. */
  let showingCost = false;
  let tickBooked = false;
  let riseIndex = 0;

  /** When the anomaly currently marked in the table stops being marked. */
  let markUntil = 0;

  const { schedule, drain } = createScheduler();

  const setVersionAttr = (at: number): void => {
    setAttr(at, 'stage', 'data-version', versionShown ? String(version) : 'none');
  };

  // --- the waits gauge ----------------------------------------------------

  /**
   * What the gauge is heading for: whatever the level in force costs while
   * somebody is blocked or the last step is pricing the levels, and nothing at
   * all when neither is true. The number is never assigned; it is asked for.
   */
  const wantWaits = (): number => (showingCost || blocked > 0 ? RULES[level].waitCost : 0);

  function bookTick(at: number): void {
    if (tickBooked) return;
    tickBooked = true;
    const next = round(at + WAITS_TICK);
    schedule(next, () => tick(next));
  }

  function tick(at: number): void {
    tickBooked = false;
    if (waitsNow === waitsTarget) return;
    const rising = waitsNow < waitsTarget;
    waitsNow = Math.max(0, Math.min(WAITS_MAX, waitsNow + (rising ? WAITS_STEP : -WAITS_STEP)));
    setAttr(at, 'stage', 'data-waits', String(waitsNow));
    // A rise is somebody waiting, so it is worth hearing. The last step's
    // pricing pass raises one cue per level and does not need one per step.
    if (rising && !showingCost) {
      if (riseIndex % RISE_SAMPLE === 0) cue(at, 'state');
      riseIndex += 1;
    }
    bookTick(at);
  }

  const retarget = (at: number): void => {
    const want = wantWaits();
    if (want === waitsTarget) return;
    if (want > waitsNow) riseIndex = 0;
    waitsTarget = want;
    bookTick(at);
  };

  // --- the anomaly table --------------------------------------------------

  /** Marks the anomaly a statement has just demonstrated, for a short while. */
  const markAnomaly = (at: number, anomaly: string): void => {
    setAttr(at, 'stage', 'data-mark', anomaly);
    const clearAt = round(at + MARK_HOLD);
    markUntil = clearAt;
    schedule(clearAt, () => {
      if (markUntil !== clearAt) return;
      setAttr(clearAt, 'stage', 'data-mark', 'none');
    });
  };

  // --- locks --------------------------------------------------------------

  const canWrite = (txn: number): boolean => {
    if (writeLock !== null && writeLock !== txn) return false;
    if (!RULES[level].writerWaits) return true;
    for (const reader of readLocks) if (reader !== txn) return false;
    return true;
  };

  const pump = (at: number): void => {
    for (let i = 0; i < waiters.length; i += 1) {
      const waiter = waiters[i] as Waiter;
      if (!canWrite(waiter.txn)) continue;
      waiters.splice(i, 1);
      waiter.resume(at);
      return;
    }
  };

  const release = (txn: number, at: number): void => {
    if (writeLock === txn) {
      writeLock = null;
      setAttr(at, 'stage', 'data-rowlock', 'free');
    }
    readLocks.delete(txn);
    pump(at);
  };

  // --- one transaction ----------------------------------------------------

  const goHome = (t: Txn, index: number, at: number): void => {
    const duration = travel(Y_ROW, Y_TXN);
    addLeg(index, Y_TXN, at, duration);
    const home = round(at + duration);
    const traveller = travellers[index];
    if (traveller) {
      traveller.fadeAt = home;
      traveller.chipEnd = home;
    }
    t.step += 1;
    scheduleOp(t, home);
  };

  const serveRead = (t: Txn, index: number, at: number, waited: boolean): void => {
    const rules = RULES[level];
    const value = rules.readsSnapshot ? t.snapValue : stock;
    const seen = rules.readsSnapshot ? t.snapVersion : version;
    if (rules.writerWaits) readLocks.add(t.txn);

    const previous = t.reads[t.reads.length - 1];
    const disagrees = previous !== undefined && previous !== value;
    t.reads.push(value);

    const traveller = travellers[index];
    if (traveller) {
      traveller.stock = [round(at), value];
      if (versionShown) traveller.version = [round(at), seen];
      traveller.marks.push({ at: round(at), result: 'ok' });
    }

    // A read that had to be held is the level refusing to show a half-written
    // row; a read that disagrees with the one before it is the anomaly the
    // second step is about. Anything else is a read that cost nothing.
    if (waited) {
      markAnomaly(at, 'dirty');
      cue(at, 'state');
    } else if (disagrees) {
      markAnomaly(at, 'nonrep');
      cue(at, 'state');
    } else {
      cue(at, 'success');
    }
    goHome(t, index, at);
  };

  const doWrite = (t: Txn, op: Op, index: number, at: number): void => {
    const rules = RULES[level];
    const traveller = travellers[index];
    if (rules.versionChecked && t.snapVersion !== version) {
      // The row moved on while this transaction was working from an older
      // version of it, so the write is refused rather than queued.
      t.conflicted = true;
      traveller?.marks.push({ at: round(at), result: 'fail' });
      goHome(t, index, at);
      return;
    }
    writeLock = t.txn;
    setAttr(at, 'stage', 'data-rowlock', `t${t.txn + 1}`);
    const base = rules.readsSnapshot ? t.snapValue : stock;
    t.pending = base + (op.by ?? 0);
    traveller?.marks.push({ at: round(at), result: 'ok' });
    goHome(t, index, at);
  };

  const resumeWrite = (t: Txn, op: Op, index: number, at: number): void => {
    const duration = travel(Y_WAIT, Y_ROW);
    addLeg(index, Y_ROW, at, duration);
    const arrive = round(at + duration);
    schedule(arrive, () => doWrite(t, op, index, arrive));
  };

  const tryWrite = (t: Txn, op: Op, index: number, at: number): void => {
    if (canWrite(t.txn)) {
      doWrite(t, op, index, at);
      return;
    }
    const duration = travel(Y_ROW, Y_WAIT);
    addLeg(index, Y_WAIT, at, duration);
    const stopped = round(at + duration);
    schedule(stopped, () => {
      if (canWrite(t.txn)) {
        resumeWrite(t, op, index, stopped);
        return;
      }
      setStatus(t.txn, 'waiting', stopped);
      travellers[index]?.rings.push([stopped, stopped]);
      blocked += 1;
      retarget(stopped);
      waiters.push({
        txn: t.txn,
        resume: (grantAt: number) => {
          blocked -= 1;
          retarget(grantAt);
          closeRing(index, grantAt);
          setStatus(t.txn, 'running', grantAt);
          resumeWrite(t, op, index, grantAt);
        },
      });
    });
  };

  const tryRead = (t: Txn, index: number, at: number): void => {
    const rules = RULES[level];
    const held = writeLock !== null && writeLock !== t.txn;
    if (!held || rules.readsSnapshot || rules.readWait <= 0) {
      serveRead(t, index, at, false);
      return;
    }
    // The row is being written, so the read is held while the lock is checked.
    // What it is served afterwards is still the committed value, never the one
    // being written: the wait is the cost, not the answer.
    const duration = travel(Y_ROW, Y_WAIT);
    addLeg(index, Y_WAIT, at, duration);
    const stopped = round(at + duration);
    schedule(stopped, () => {
      setStatus(t.txn, 'waiting', stopped);
      travellers[index]?.rings.push([stopped, stopped]);
      blocked += 1;
      retarget(stopped);
      const until = round(stopped + RULES[level].readWait);
      schedule(until, () => {
        blocked -= 1;
        retarget(until);
        closeRing(index, until);
        setStatus(t.txn, 'running', until);
        const back = travel(Y_WAIT, Y_ROW);
        addLeg(index, Y_ROW, until, back);
        const arrive = round(until + back);
        schedule(arrive, () => serveRead(t, index, arrive, true));
      });
    });
  };

  const depart = (t: Txn, op: Op, at: number): void => {
    setStmt(t.txn, op.kind, at);
    const index = newTraveller(t.txn, at);
    const traveller = travellers[index];
    // A writer carries the version its change is conditional on, so the reader
    // can see what the row is about to be checked against.
    if (op.kind === 'update' && versionShown && traveller) {
      traveller.version = [round(at), t.snapVersion];
    }
    const duration = travel(Y_TXN, Y_ROW);
    addLeg(index, Y_ROW, at, duration);
    const arrive = round(at + duration);
    schedule(arrive, () => {
      if (op.kind === 'select') tryRead(t, index, arrive);
      else tryWrite(t, op, index, arrive);
    });
  };

  const finish = (t: Txn, at: number): void => {
    if (t.conflicted) {
      setStmt(t.txn, 'rollback', at);
      setStatus(t.txn, 'rolled-back', at);
      t.pending = null;
      release(t.txn, at);
      cue(at, 'failure');
      const delay = t.run.retryDelay;
      if (delay === undefined || t.retried) return;
      const again = round(at + delay);
      schedule(again, () => {
        // The retry re-runs the write, against whatever the row says now. It
        // does not think about it again: the thinking already happened.
        begin(
          {
            run: t.run,
            txn: t.txn,
            ops: t.ops.filter((op) => op.kind === 'update').map((op) => ({ ...op, delay: 0 })),
            step: 0,
            snapValue: 0,
            snapVersion: 0,
            reads: [],
            pending: null,
            conflicted: false,
            retried: true,
          },
          again,
        );
      });
      return;
    }
    setStmt(t.txn, 'commit', at);
    setStatus(t.txn, 'committed', at);
    if (t.pending !== null) {
      stock = t.pending;
      version += 1;
      setAttr(at, 'stage', 'data-stock', String(stock));
      setVersionAttr(at);
    }
    release(t.txn, at);
    cue(at, 'success');
  };

  function scheduleOp(t: Txn, at: number): void {
    const op = t.conflicted ? undefined : t.ops[t.step];
    if (!op) {
      const end = round(at + t.run.commitDelay);
      schedule(end, () => finish(t, end));
      return;
    }
    const go = round(at + op.delay);
    schedule(go, () => depart(t, op, go));
  }

  function begin(t: Txn, at: number): void {
    setStmt(t.txn, 'begin', at);
    setStatus(t.txn, 'running', at);
    t.snapValue = stock;
    t.snapVersion = version;
    scheduleOp(t, at);
  }

  // --- the policy changes -------------------------------------------------

  for (const [at, next] of LEVEL_CHANGES) {
    schedule(at, () => {
      level = next;
      setAttr(at, 'stage', 'data-level', next);
      cue(at, 'trip');
      retarget(at);
    });
  }

  schedule(VERSION_AT, () => {
    versionShown = true;
    setVersionAttr(VERSION_AT);
  });

  schedule(IDLE_AT, () => {
    for (const txn of [0, 1]) {
      setStmt(txn, 'none', IDLE_AT);
      setStatus(txn, 'none', IDLE_AT);
    }
  });

  // --- the last step: what each level permits, and what it costs -----------

  schedule(TOUR_START, () => {
    showingCost = true;
    cue(TOUR_START, 'trip');
    retarget(TOUR_START);
  });

  TOUR_ORDER.forEach((next, index) => {
    const at = round(TOUR_START + index * TOUR_EVERY);
    schedule(at, () => {
      level = next;
      setAttr(at, 'stage', 'data-level', next);
      cue(at, 'state');
      retarget(at);
    });
  });

  schedule(SETTLE_AT, () => {
    level = SETTLE_LEVEL;
    setAttr(SETTLE_AT, 'stage', 'data-level', SETTLE_LEVEL);
    cue(SETTLE_AT, 'success');
    retarget(SETTLE_AT);
  });

  // --- the transactions ---------------------------------------------------

  for (const run of RUNS) {
    const t: Txn = {
      run,
      txn: run.txn,
      ops: run.ops,
      step: 0,
      snapValue: 0,
      snapVersion: 0,
      reads: [],
      pending: null,
      conflicted: false,
      retried: false,
    };
    schedule(run.start, () => begin(t, run.start));
  }

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

  cues.sort((left, right) => left[0] - right[0]);

  return { travellers, attrs, cues };
}

// --- the timeline ---------------------------------------------------------

/** One plate a traveller carries, built only for the travellers that carry it. */
function addChip(
  request: RequestParts,
  side: number,
  dy: number,
  kind: string,
  label: string,
): SVGElement[] {
  const box = attachToRequest(request, 'rect', {
    class: `il-chip-box il-chip-box--${kind}`,
    x: String(side * CHIP_DX - CHIP_W / 2),
    y: String(dy - CHIP_H / 2),
    width: String(CHIP_W),
    height: String(CHIP_H),
    rx: '12',
  });
  const text = attachToRequest(
    request,
    'text',
    {
      class: `scene-req-chip il-chip-text il-chip-text--${kind}`,
      x: String(side * CHIP_DX),
      y: String(dy + 8),
      'text-anchor': 'middle',
    },
    label,
  );
  return [box, text];
}

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const targets: Record<string, Element> = { stage };
  for (let index = 1; index <= 2; index += 1) {
    targets[`stmt-${index}`] = q<SVGGElement>(stage, `.il-txn--${index} .il-stmt`, ID);
    targets[`status-${index}`] = q<SVGGElement>(stage, `.il-txn--${index} .il-status`, ID);
  }
  const layer = q<SVGGElement>(stage, '.scene-requests', ID);

  const sim = simulate();
  const parts = mountRequests(layer, sim.travellers.length, ID);

  const tl = createSceneTimeline();

  // --- discrete state -----------------------------------------------------

  for (const change of sim.attrs) {
    const element = targets[change.key];
    if (!element) continue;
    attr(tl, element, change.name, change.value, change.at);
  }

  // --- what travels -------------------------------------------------------

  sim.travellers.forEach((traveller, index) => {
    const request = parts[index] as RequestParts | undefined;
    if (!request) return;

    const lane = LANE_X[traveller.txn] ?? 0;
    request.group.classList.add(`il-req--t${traveller.txn + 1}`);
    parkRequest(request, lane, Y_TXN);

    // Whatever a traveller carries rides on the outer side of its lane, so it
    // never lands between the two lanes where the other one is passing. A
    // traveller carrying both stacks them either side of the dot.
    const side = traveller.txn === 0 ? -1 : 1;
    const both = traveller.stock !== null && traveller.version !== null;
    const stockChip = traveller.stock
      ? addChip(request, side, both ? -22 : 0, 'stock', `stock ${traveller.stock[1]}`)
      : null;
    const versionChip = traveller.version
      ? addChip(request, side, both ? 22 : 0, 'version', `version ${traveller.version[1]}`)
      : null;

    showRequest(tl, request, traveller.start);
    for (const leg of traveller.legs) {
      tl.to(
        request.group,
        { y: leg.to, duration: leg.duration, ease: 'none', immediateRender: false },
        leg.at,
      );
    }
    for (const mark of traveller.marks) markRequest(tl, request, mark.result, mark.at);
    for (const [from, to] of traveller.rings) haloRequest(tl, request, from, to, FADE);
    if (stockChip && traveller.stock) {
      tl.set(stockChip, { opacity: 1, immediateRender: false }, traveller.stock[0]);
      tl.set(stockChip, { opacity: 0, immediateRender: false }, traveller.chipEnd);
    }
    if (versionChip && traveller.version) {
      tl.set(versionChip, { opacity: 1, immediateRender: false }, traveller.version[0]);
      tl.set(versionChip, { opacity: 0, immediateRender: false }, traveller.chipEnd);
    }
    hideRequest(tl, request, traveller.fadeAt, FADE);
  });

  // --- sound --------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels --------------------------------------------------------

  // The stage is complete on the first frame: two idle transactions, a row with
  // its lock free and its value on show, the dial on read committed, and the
  // whole anomaly table with the gauge at nothing.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
