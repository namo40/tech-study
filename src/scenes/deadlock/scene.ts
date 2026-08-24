import {
  CHIP_DX,
  CHIP_H,
  CHIP_W,
  COMMITS_MAX,
  DEADLOCKS_MAX,
  LANE_X,
  RETRIES_MAX,
  ROW_A_STATES,
  SCENE_DURATION,
  STAGE_STATE,
  Y_CLIENT,
  Y_ROW_A,
  Y_ROW_B,
  Y_WAIT_A,
  Y_WAIT_B,
  rowKey,
} from './stage';
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
 * Deadlock scene: a 24 second, four step timeline.
 *
 * Same two rules as the other scenes: every tween sits at an absolute position,
 * and every discrete change is a zero-duration tween on a `data-*` attribute
 * that GSAP reverts when the playhead moves back past it.
 *
 * Nothing the reader watches is placed by hand. The scene is told five things:
 * when each transaction leaves its box, which rows it wants and in what order,
 * how long it holds a lock before doing the next thing, how long the lock
 * manager waits before looking for a cycle and how long it then takes to kill
 * something, and — for the last step — how long each optimistic writer thinks
 * and what it adds to the row. Everything else falls out of one pass over the
 * whole 24 seconds.
 *
 * Which transaction gets a lock is whoever reaches the row first, so the second
 * one waits because the first is already there rather than because a keyframe
 * says so. A wait-for edge is drawn when a traveller stops short of a row, and
 * the lock manager wakes half a second after every edge and looks for a cycle;
 * finding one it kills the transaction that has the least to roll back, which
 * on these inputs is the one that acquired its first lock last. The survivor is
 * then granted the row the victim was holding, which is why it can finish at
 * all. The third step changes only the order the rows are named in, and the
 * cycle stops forming as a consequence. The last step takes no locks: a writer
 * carries the version it read, and the write lands only if the row still has
 * that version, so the second writer's conflict, its reload and the value it
 * finally writes are all consequences of the first writer having got there
 * first. The three readouts are the scene's own tallies of what happened.
 */

const ID = 'deadlock';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- how a traveller moves -------------------------------------------------

/**
 * One speed for every leg of every journey, in pixels per second. A fixed speed
 * rather than a fixed duration is what keeps the two transactions comparable:
 * the drop from a transaction box to `row A` takes exactly half a second, and
 * the drop to `row B` takes longer because `row B` is further down, which is
 * the whole point of stacking the rows.
 */
const SPEED = 2020;

const travel = (from: number, to: number): number => Math.abs(to - from) / SPEED;

/** How long a result marker stays before the traveller goes. */
const FADE = 0.2;

// --- what the lock manager does -------------------------------------------

/** How long after a new wait-for edge the lock manager looks for a cycle. */
const DETECT_INTERVAL = 0.5;
/** How long between finding a cycle and killing something. */
const VICTIM_DELAY = 0.25;
/** How long a victim waits before running again, and how long `retry` shows. */
const RETRY_DELAY = 0.9;
const RETRY_SHOW = 0.2;

// --- what the optimistic writer does --------------------------------------

/** How long a conflict is shown before the row is read again. */
const RELOAD_DELAY = 0.2;
/** How long reapplying the change to the reloaded row takes. */
const REAPPLY = 0.1;

// --- what the scene is told -----------------------------------------------

type RowId = 'A' | 'B';

/** One run of a transaction that locks rows: when it starts and what it wants. */
interface LockPlan {
  /** Lane, zero based: 0 is T1 and 1 is T2. */
  txn: 0 | 1;
  start: number;
  /** The rows it locks, in the order it asks for them. */
  wants: RowId[];
  /** Seconds it holds a lock before asking for the next row or committing. */
  work: number;
}

/**
 * Step 1 runs three pairs, step 2 runs the pair that deadlocks, and step 3 runs
 * the same work with both transactions naming the rows in one order. The only
 * difference between step 2 and step 3 is `wants`.
 */
const LOCK_PLANS: LockPlan[] = [
  // Step 1: different rows, then the same row.
  { txn: 0, start: 0.4, wants: ['A'], work: 0.8 },
  { txn: 1, start: 0.8, wants: ['B'], work: 0.8 },
  { txn: 0, start: 2.8, wants: ['A'], work: 0.8 },
  { txn: 1, start: 3.1, wants: ['A'], work: 0.8 },
  // Step 2: A then B against B then A.
  { txn: 0, start: 6.3, wants: ['A', 'B'], work: 0.6 },
  { txn: 1, start: 6.4, wants: ['B', 'A'], work: 0.6 },
  // Step 3: both name A then B, once at length and once short.
  { txn: 0, start: 12.1, wants: ['A', 'B'], work: 0.5 },
  { txn: 1, start: 12.2, wants: ['A', 'B'], work: 0.5 },
  { txn: 0, start: 15.6, wants: ['A', 'B'], work: 0.2 },
  { txn: 1, start: 15.7, wants: ['A', 'B'], work: 0.2 },
];

/** One run of a transaction that takes no lock at all. */
interface OptimisticPlan {
  txn: 0 | 1;
  start: number;
  /** Seconds spent away from the row between reading it and writing it. */
  think: number;
}

const OPTIMISTIC_PLANS: OptimisticPlan[] = [
  { txn: 0, start: 18.3, think: 0.2 },
  { txn: 1, start: 18.4, think: 0.5 },
];

/** When the lock order is announced, and when the locks are dropped entirely. */
const ORDER_AT = 12;
const VERSION_AT = 18;

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
  /** When it becomes visible, always at `Y_CLIENT`. */
  start: number;
  legs: Leg[];
  marks: Mark[];
  /** Times the plain dot comes back after a result marker was shown. */
  restores: number[];
  /** Stretches it is ringed for, which is exactly the time it spends waiting. */
  rings: [number, number][];
  /** `[at, index into ROW_A_STATES]` for the version chip it carries. */
  chips: [number, number][];
  /** When the chip goes, which is when the journey ends. */
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

interface Attempt {
  plan: LockPlan;
  index: number;
  /** Where the traveller is now, which every leg is measured from. */
  pos: number;
  /** How many of `wants` it already holds. */
  step: number;
  alive: boolean;
}

interface Optimistic {
  plan: OptimisticPlan;
  index: number;
  pos: number;
  /** The version it read, which is what the write is conditional on. */
  carried: number;
}

const rowY = (row: RowId): number => (row === 'A' ? Y_ROW_A : Y_ROW_B);
const waitY = (row: RowId): number => (row === 'A' ? Y_WAIT_A : Y_WAIT_B);
const slotKey = (row: RowId): string => `slot-${row.toLowerCase()}`;
const lockAct = (row: RowId): string => (row === 'A' ? 'lock-a' : 'lock-b');

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
      restores: [],
      rings: [],
      chips: [],
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

  const setAct = (txn: number, value: string, at: number): void => {
    setAttr(at, `txn-${txn + 1}`, 'data-act', value);
  };

  // --- state the simulation carries ---------------------------------------

  /** Which transaction holds each row, and who is queued behind it. */
  const owner: Record<RowId, number | null> = { A: null, B: null };
  const queue: Record<RowId, Attempt[]> = { A: [], B: [] };
  /** Rows each live attempt is holding, so a rollback knows what to free. */
  const holding = new Map<Attempt, RowId[]>();
  /** Locks each transaction holds, which is what the graph node fills from. */
  const holds = [0, 0];
  /** The wait-for graph: `waitFor[t]` is the transaction `t` is blocked behind. */
  const waitFor: (number | null)[] = [null, null];
  /** When each transaction last took its first lock, which picks the victim. */
  const firstLockAt = [0, 0];
  /** True from finding a cycle until the victim has been rolled back. */
  let resolving = false;

  let commits = 0;
  let deadlocks = 0;
  let retries = 0;
  /** Optimistic writes that landed, which is the index into `ROW_A_STATES`. */
  let writes = 0;

  const rowVersion = (): number => ROW_A_STATES[writes]?.version ?? 0;

  const { schedule, drain } = createScheduler();

  // --- locks --------------------------------------------------------------

  const stopWaiting = (txn: number, at: number): void => {
    if (waitFor[txn] === null) return;
    waitFor[txn] = null;
    setAttr(at, 'stage', `data-wait${txn + 1}`, 'off');
  };

  /** The visible half of taking a lock, shared by both ways of getting one. */
  const markHeld = (a: Attempt, row: RowId, at: number): void => {
    const txn = a.plan.txn;
    setAttr(at, slotKey(row), 'data-lock', `t${txn + 1}`);
    setAttr(at, 'stage', `data-hold${txn + 1}`, String(holds[txn]));
    stopWaiting(txn, at);
    setAct(txn, lockAct(row), at);
    cue(at, 'state');
  };

  /** Books whatever the attempt does next: another row, or its commit. */
  const advance = (a: Attempt, at: number): void => {
    a.step += 1;
    const next = round(at + a.plan.work);
    schedule(next, () => {
      if (!a.alive) return;
      const want = a.plan.wants[a.step];
      if (want) askFor(a, want, next);
      else commit(a, next);
    });
  };

  /**
   * Takes the row. Ownership moves at `at`, because that is when the row stops
   * being available to anyone else; the traveller then covers whatever distance
   * is left, and the slot fills when it lands. Standing on the row already makes
   * that distance zero, which is the only difference between reaching a free row
   * and being handed one that has just been freed.
   */
  const claim = (a: Attempt, row: RowId, at: number): void => {
    owner[row] = a.plan.txn;
    holding.get(a)?.push(row);
    holds[a.plan.txn] += 1;
    if (holds[a.plan.txn] === 1) firstLockAt[a.plan.txn] = at;

    const target = rowY(row);
    const duration = travel(a.pos, target);
    if (duration <= 0) {
      markHeld(a, row, at);
      advance(a, at);
      return;
    }
    addLeg(a.index, target, at, duration);
    a.pos = target;
    const arrive = round(at + duration);
    const rings = travellers[a.index]?.rings ?? [];
    const ring = rings[rings.length - 1];
    if (ring && ring[1] === ring[0]) ring[1] = arrive;
    schedule(arrive, () => {
      markHeld(a, row, arrive);
      advance(a, arrive);
    });
  };

  /** Hands a freed row to whoever has been waiting longest for it. */
  const grantHead = (row: RowId, at: number): void => {
    const next = queue[row].shift();
    if (!next || !next.alive) return;
    claim(next, row, at);
  };

  const release = (a: Attempt, at: number): RowId[] => {
    const rows = holding.get(a) ?? [];
    for (const row of rows) {
      owner[row] = null;
      holds[a.plan.txn] -= 1;
      setAttr(at, slotKey(row), 'data-lock', 'free');
    }
    setAttr(at, 'stage', `data-hold${a.plan.txn + 1}`, String(holds[a.plan.txn]));
    holding.set(a, []);
    return rows;
  };

  const goHome = (a: Attempt, at: number): void => {
    const duration = travel(a.pos, Y_CLIENT);
    addLeg(a.index, Y_CLIENT, at, duration);
    a.pos = Y_CLIENT;
    const home = round(at + duration);
    const traveller = travellers[a.index];
    if (traveller) traveller.fadeAt = home;
    setAct(a.plan.txn, 'none', round(home + FADE));
  };

  const commit = (a: Attempt, at: number): void => {
    const rows = release(a, at);
    commits += 1;
    setAttr(at, 'stage', 'data-commits', String(Math.min(commits, COMMITS_MAX)));
    setAct(a.plan.txn, 'commit', at);
    travellers[a.index]?.marks.push({ at: round(at), result: 'ok' });
    cue(at, 'success');
    goHome(a, at);
    a.alive = false;
    for (const row of rows) grantHead(row, at);
  };

  /** The traveller has reached the row it asked for, and finds out who has it. */
  const arriveAt = (a: Attempt, row: RowId, at: number): void => {
    if (owner[row] === null) {
      claim(a, row, at);
      return;
    }
    // Locked by the other transaction: it backs off and stands above the row.
    const target = waitY(row);
    const duration = travel(a.pos, target);
    addLeg(a.index, target, at, duration);
    a.pos = target;
    const stopped = round(at + duration);
    schedule(stopped, () => {
      if (!a.alive) return;
      if (owner[row] === null) {
        claim(a, row, stopped);
        return;
      }
      queue[row].push(a);
      waitFor[a.plan.txn] = owner[row];
      setAttr(stopped, 'stage', `data-wait${a.plan.txn + 1}`, 'on');
      setAct(a.plan.txn, 'wait', stopped);
      travellers[a.index]?.rings.push([stopped, stopped]);
      cue(stopped, 'state');
      // Every new edge wakes the detector, which is the only thing that looks
      // for a cycle: nothing in the scene knows a deadlock is coming.
      const wake = round(stopped + DETECT_INTERVAL);
      schedule(wake, () => detect(wake));
    });
  };

  const askFor = (a: Attempt, row: RowId, at: number): void => {
    const target = rowY(row);
    const duration = travel(a.pos, target);
    addLeg(a.index, target, at, duration);
    a.pos = target;
    setAct(a.plan.txn, lockAct(row), at);
    const arrive = round(at + duration);
    schedule(arrive, () => {
      if (a.alive) arriveAt(a, row, arrive);
    });
  };

  // --- the deadlock -------------------------------------------------------

  /**
   * The victim is the transaction with the least to roll back: fewer locks
   * first, and if both hold the same number, the one that got its first lock
   * last, because it is the one that has been running for the shortest time.
   */
  const pickVictim = (): number => {
    if (holds[0] !== holds[1]) return (holds[0] ?? 0) < (holds[1] ?? 0) ? 0 : 1;
    return (firstLockAt[0] ?? 0) > (firstLockAt[1] ?? 0) ? 0 : 1;
  };

  const start = (a: Attempt, at: number): void => {
    const traveller = travellers[a.index];
    if (traveller) traveller.start = round(at);
    a.pos = Y_CLIENT;
    holding.set(a, []);
    const want = a.plan.wants[0];
    if (want) askFor(a, want, at);
  };

  const kill = (victim: number, at: number): void => {
    const a = [...holding.keys()].find((item) => item.alive && item.plan.txn === victim);
    if (!a) return;
    a.alive = false;
    setAttr(at, 'stage', 'data-victim', `t${victim + 1}`);
    const rows = release(a, at);
    const index = queue.A.indexOf(a);
    if (index >= 0) queue.A.splice(index, 1);
    const indexB = queue.B.indexOf(a);
    if (indexB >= 0) queue.B.splice(indexB, 1);
    stopWaiting(victim, at);
    setAttr(at, 'stage', 'data-graph', 'ok');
    resolving = false;
    const rings = travellers[a.index]?.rings ?? [];
    const ring = rings[rings.length - 1];
    if (ring && ring[1] === ring[0]) ring[1] = at;
    travellers[a.index]?.marks.push({ at: round(at), result: 'fail' });
    cue(at, 'failure');
    goHome(a, at);
    const home = travellers[a.index]?.fadeAt ?? at;
    setAttr(home, 'stage', 'data-deadlock', 'off');
    for (const row of rows) grantHead(row, at);

    // The victim runs again from the top: same plan, new traveller.
    const announce = round(at + RETRY_DELAY);
    schedule(announce, () => {
      retries += 1;
      setAttr(announce, 'stage', 'data-retries', String(Math.min(retries, RETRIES_MAX)));
      setAttr(announce, 'stage', 'data-victim', 'none');
      setAct(victim, 'retry', announce);
      cue(announce, 'trip');
      const again: Attempt = {
        plan: a.plan,
        index: newTraveller(a.plan.txn, announce + RETRY_SHOW),
        pos: Y_CLIENT,
        step: 0,
        alive: true,
      };
      schedule(round(announce + RETRY_SHOW), () => start(again, round(announce + RETRY_SHOW)));
    });
  };

  const detect = (at: number): void => {
    if (resolving) return;
    if (waitFor[0] !== 1 || waitFor[1] !== 0) return;
    resolving = true;
    deadlocks += 1;
    setAttr(at, 'stage', 'data-graph', 'cycle');
    setAttr(at, 'stage', 'data-deadlock', 'on');
    setAttr(at, 'stage', 'data-deadlocks', String(Math.min(deadlocks, DEADLOCKS_MAX)));
    cue(at, 'trip');
    const victim = pickVictim();
    const killAt = round(at + VICTIM_DELAY);
    schedule(killAt, () => kill(victim, killAt));
  };

  // --- the policy changes -------------------------------------------------

  schedule(ORDER_AT, () => {
    setAttr(ORDER_AT, 'stage', 'data-order', 'on');
    cue(ORDER_AT, 'trip');
  });

  schedule(VERSION_AT, () => {
    setAttr(VERSION_AT, 'stage', 'data-order', 'off');
    setAttr(VERSION_AT, 'stage', 'data-mode', 'version');
    setAttr(VERSION_AT, 'stage', 'data-row-a', rowKey(writes));
    cue(VERSION_AT, 'trip');
  });

  // --- the transactions that take locks -----------------------------------

  for (const plan of LOCK_PLANS) {
    const attempt: Attempt = {
      plan,
      index: newTraveller(plan.txn, plan.start),
      pos: Y_CLIENT,
      step: 0,
      alive: true,
    };
    schedule(plan.start, () => start(attempt, plan.start));
  }

  // --- the transactions that take none ------------------------------------

  const goHomeOpt = (o: Optimistic, at: number): void => {
    const duration = travel(o.pos, Y_CLIENT);
    addLeg(o.index, Y_CLIENT, at, duration);
    o.pos = Y_CLIENT;
    const home = round(at + duration);
    const traveller = travellers[o.index];
    if (traveller) {
      traveller.fadeAt = home;
      traveller.chipEnd = home;
    }
    setAct(o.plan.txn, 'none', round(home + FADE));
  };

  const write = (o: Optimistic, at: number): void => {
    const traveller = travellers[o.index];
    if (o.carried === rowVersion()) {
      writes += 1;
      commits += 1;
      setAttr(at, 'stage', 'data-row-a', rowKey(writes));
      setAttr(at, 'stage', 'data-commits', String(Math.min(commits, COMMITS_MAX)));
      setAct(o.plan.txn, 'commit', at);
      traveller?.marks.push({ at: round(at), result: 'ok' });
      cue(at, 'success');
      goHomeOpt(o, at);
      return;
    }
    // The row moved on while the writer was away, so the write is refused.
    setAct(o.plan.txn, 'conflict', at);
    traveller?.marks.push({ at: round(at), result: 'fail' });
    cue(at, 'failure');
    const reload = round(at + RELOAD_DELAY);
    schedule(reload, () => {
      traveller?.restores.push(reload);
      o.carried = rowVersion();
      traveller?.chips.push([reload, writes]);
      retries += 1;
      setAttr(reload, 'stage', 'data-retries', String(Math.min(retries, RETRIES_MAX)));
      setAct(o.plan.txn, 'read', reload);
      cue(reload, 'state');
      const duration = travel(o.pos, Y_CLIENT);
      addLeg(o.index, Y_CLIENT, reload, duration);
      o.pos = Y_CLIENT;
      const home = round(reload + duration);
      const depart = round(home + REAPPLY);
      schedule(depart, () => writeTrip(o, depart));
    });
  };

  const writeTrip = (o: Optimistic, at: number): void => {
    setAct(o.plan.txn, 'write', at);
    const duration = travel(o.pos, Y_ROW_A);
    addLeg(o.index, Y_ROW_A, at, duration);
    o.pos = Y_ROW_A;
    const arrive = round(at + duration);
    schedule(arrive, () => write(o, arrive));
  };

  const read = (o: Optimistic, at: number): void => {
    o.carried = rowVersion();
    travellers[o.index]?.chips.push([round(at), writes]);
    setAct(o.plan.txn, 'read', at);
    cue(at, 'state');
    const duration = travel(o.pos, Y_CLIENT);
    addLeg(o.index, Y_CLIENT, at, duration);
    o.pos = Y_CLIENT;
    const home = round(at + duration);
    const depart = round(home + o.plan.think);
    schedule(depart, () => writeTrip(o, depart));
  };

  for (const plan of OPTIMISTIC_PLANS) {
    const optimistic: Optimistic = {
      plan,
      index: newTraveller(plan.txn, plan.start),
      pos: Y_CLIENT,
      carried: 0,
    };
    schedule(plan.start, () => {
      setAct(plan.txn, 'read', plan.start);
      const duration = travel(Y_CLIENT, Y_ROW_A);
      addLeg(optimistic.index, Y_ROW_A, plan.start, duration);
      optimistic.pos = Y_ROW_A;
      const arrive = round(plan.start + duration);
      schedule(arrive, () => read(optimistic, arrive));
    });
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

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const targets: Record<string, Element> = { stage };
  for (let index = 1; index <= 2; index += 1) {
    targets[`txn-${index}`] = q<SVGGElement>(stage, `.dl-acts--${index}`, ID);
  }
  for (const row of ['a', 'b'] as const) {
    targets[`slot-${row}`] = q<SVGGElement>(stage, `.dl-slot--${row}`, ID);
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
    request.group.classList.add(`dl-req--t${traveller.txn + 1}`);
    parkRequest(request, lane, Y_CLIENT);

    // The version chip rides on the outer side of the lane, so it never lands
    // between a traveller and the labels on the inner side of the stage. Only a
    // traveller that reads a version carries one, so the rest stay bare.
    const side = traveller.txn === 0 ? -1 : 1;
    const chips = (traveller.chips.length === 0 ? [] : ROW_A_STATES).map((state, position) => {
      const box = attachToRequest(request, 'rect', {
        class: 'dl-chip-box',
        x: String(side * CHIP_DX - CHIP_W / 2),
        y: String(-CHIP_H / 2),
        width: String(CHIP_W),
        height: String(CHIP_H),
        rx: '10',
      });
      const text = attachToRequest(
        request,
        'text',
        {
          class: 'scene-req-chip dl-chip-text',
          x: String(side * CHIP_DX),
          y: '9',
          'text-anchor': 'middle',
        },
        `v${state.version}`,
      );
      return { box, text, position };
    });

    showRequest(tl, request, traveller.start);
    for (const leg of traveller.legs) {
      tl.to(
        request.group,
        { y: leg.to, duration: leg.duration, ease: 'none', immediateRender: false },
        leg.at,
      );
    }
    for (const mark of traveller.marks) markRequest(tl, request, mark.result, mark.at);
    for (const at of traveller.restores) {
      tl.set(request.fail, { opacity: 0, immediateRender: false }, at);
      tl.set(request.ok, { opacity: 0, immediateRender: false }, at);
      tl.set(request.dot, { opacity: 1, immediateRender: false }, at);
    }
    for (const [from, to] of traveller.rings) haloRequest(tl, request, from, to, FADE);
    for (const [at, position] of traveller.chips) {
      for (const chip of chips) {
        const visible = chip.position === position ? 1 : 0;
        tl.set([chip.box, chip.text], { opacity: visible, immediateRender: false }, at);
      }
    }
    if (traveller.chips.length > 0 && traveller.chipEnd > 0) {
      for (const chip of chips) {
        tl.set([chip.box, chip.text], { opacity: 0, immediateRender: false }, traveller.chipEnd);
      }
    }
    hideRequest(tl, request, traveller.fadeAt, FADE);
  });

  // --- sound --------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels --------------------------------------------------------

  // The stage is complete on the first frame: two transactions, an empty
  // wait-for graph, two rows with their locks free, and every tally at zero.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
