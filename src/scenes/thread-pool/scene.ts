import gsap from 'gsap';
import {
  AWAIT_SLOTS,
  BASE_THREADS,
  CHIP_X,
  LANE_Y,
  QUEUE_X,
  QUEUE_Y,
  SCENE_DURATION,
  Y_CLIENT,
} from './stage';
import { q, qa } from '../shared/dom';
import {
  attachToRequest,
  hideRequest,
  markRequest,
  mountRequests,
  parkRequest,
  showRequest,
} from '../shared/request';
import type { SceneBuildOptions, SceneInstance, SceneModule, SceneStep } from '../types';

/**
 * Thread Pool scene: a 24 second, four step timeline.
 *
 * Same two rules as the other scenes: every tween sits at an absolute position,
 * and every discrete change is a zero-duration tween on a `data-*` attribute
 * that GSAP reverts when the playhead moves back past it.
 *
 * The pool is simulated, not scripted. Work arrives, queues, and is dispatched
 * to the lowest free lane; whether the queue grows, which item waits longest,
 * and how many threads that costs all fall out of how long each item holds its
 * lane. Step 2 holds it for the whole I/O wait, step 3 gives it back, and the
 * difference between those two numbers is the whole scene.
 */

const ID = 'thread-pool';

/** The lane work items travel down from the requests box. */
const X = 540;

/** Requests box to the queue column. */
const TO_QUEUE = 0.4;
/** Queue to a lane, and a lane back out to the parking box. */
const TO_LANE = 0.15;
const TO_AWAIT = 0.2;
/** A lane back up to the requests box. */
const TO_HOME = 0.5;

/** How long an I/O wait takes, whether it holds a thread or not. */
const IO_LATENCY = 1.5;
/** A wait longer than this in the queue comes back marked late. */
const LATE_WAIT = 1.0;

/** When the pool decides to add one more thread, and when it gives them back. */
const INJECTIONS = [8.0, 8.6];
const RETIRE_AT = 12;
/** How long the `+1 thread` flash stays up. */
const FLASH_HOLD = 0.4;

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

/**
 * How a work item behaves once a thread picks it up.
 *  - `short`    runs briefly and is done.
 *  - `blocking` runs, then waits for I/O without letting go of the thread.
 *  - `await`    runs, parks itself, and comes back to whatever thread is free.
 *  - `cpu`      holds a thread for a long computation.
 */
type WorkKind = 'short' | 'blocking' | 'await' | 'cpu';

interface WorkPlan {
  start: number;
  kind: WorkKind;
  /** Seconds of actual work before and after the wait. */
  run: number;
}

const work = (start: number, kind: WorkKind, run: number): WorkPlan => ({ start, kind, run });

const WORK: WorkPlan[] = [
  // Step 1: eighteen short items, comfortably inside four threads.
  ...Array.from({ length: 18 }, (_v, i) => work(round(0.4 + i * 0.25), 'short', 0.3)),
  // Step 2: ten items that hold their thread for the whole I/O wait.
  ...Array.from({ length: 10 }, (_v, i) => work(round(6.05 + i * 0.15), 'blocking', 0.2)),
  // Step 3: nine of the same items, this time awaiting their I/O.
  ...Array.from({ length: 9 }, (_v, i) => work(round(12.2 + i * 0.3), 'await', 0.2)),
  // Step 4: two long computations that really do need a thread.
  work(18.3, 'cpu', 2.5),
  work(18.4, 'cpu', 2.5),
  // Step 4: ordinary I/O work carrying on around them.
  ...Array.from({ length: 6 }, (_v, i) => work(round(18.5 + i * 0.4), 'await', 0.2)),
];

function round(value: number): number {
  return Number(value.toFixed(3));
}

const fadeAt = (home: number): number => Math.max(0.05, Math.min(0.15, SCENE_DURATION - home));

type LaneState = 'absent' | 'idle' | 'running' | 'blocked' | 'cpu';

interface LaneChange {
  at: number;
  lane: number;
  state: LaneState;
}

interface Move {
  at: number;
  x: number;
  y: number;
  duration: number;
}

interface ItemPlan {
  moves: Move[];
  /** When the check mark appears, and when the item is back home. */
  doneAt: number;
  homeAt: number;
  /** Waited longer than a moment in the queue. */
  late: boolean;
}

interface BlockedLine {
  lane: number;
  from: number;
  to: number;
}

interface Simulation {
  items: ItemPlan[];
  lanes: LaneChange[];
  queue: [number, number][];
  awaiting: [number, number][];
  threads: [number, number][];
  blockedLines: BlockedLine[];
}

/**
 * Runs the pool. Work is dispatched in arrival order to the lowest free lane;
 * anything that arrives when every lane is taken stands in the queue.
 */
function simulate(): Simulation {
  const states: LaneState[] = LANE_Y.map((_y, index) =>
    index < BASE_THREADS ? 'idle' : 'absent',
  );
  const items: ItemPlan[] = WORK.map(() => ({ moves: [], doneAt: 0, homeAt: 0, late: false }));
  const lanes: LaneChange[] = [];
  const queue: [number, number][] = [];
  const awaiting: [number, number][] = [];
  const threads: [number, number][] = [];
  const blockedLines: BlockedLine[] = [];

  /** Queued items, in arrival order, each holding a column position. */
  const pending: { index: number; since: number; slot: number }[] = [];
  const queueSlotUsed = QUEUE_Y.map(() => false);
  const awaitSlotUsed = AWAIT_SLOTS.map(() => false);
  let parked = 0;

  interface Task {
    at: number;
    order: number;
    run: () => void;
  }
  const tasks: Task[] = [];
  let order = 0;
  const schedule = (at: number, run: () => void): void => {
    order += 1;
    tasks.push({ at: round(at), order, run });
  };

  /*
   * Two changes to the same thing at one instant would render in insertion
   * order going forwards and in reverse going backwards, so that frame would
   * depend on which way the reader scrubbed. Collapse them.
   */
  const recordLane = (at: number, lane: number, state: LaneState): void => {
    for (let i = lanes.length - 1; i >= 0; i -= 1) {
      const candidate = lanes[i];
      if (!candidate || candidate.at !== at) break;
      if (candidate.lane === lane) {
        candidate.state = state;
        return;
      }
    }
    lanes.push({ at, lane, state });
  };
  const recordPair = <T>(series: [number, T][], at: number, next: T): void => {
    const previous = series[series.length - 1];
    if (previous && previous[0] === at) previous[1] = next;
    else series.push([at, next]);
  };

  const setLane = (at: number, lane: number, state: LaneState): void => {
    states[lane] = state;
    recordLane(at, lane, state);
    recordPair(threads, at, states.filter((value) => value !== 'absent').length);
  };
  const setQueue = (at: number): void => recordPair(queue, at, pending.length);
  const setAwaiting = (at: number): void => recordPair(awaiting, at, parked);
  const freeLane = (): number => states.findIndex((value) => value === 'idle');
  const takeSlot = (used: boolean[]): number => {
    const index = used.findIndex((value) => !value);
    if (index >= 0) used[index] = true;
    return index < 0 ? 0 : index;
  };


  /** Sends an item home with a check mark. */
  const finish = (index: number, at: number): void => {
    const item = items[index];
    if (!item) return;
    item.doneAt = at;
    item.homeAt = round(at + TO_HOME);
    item.moves.push({ at, x: X, y: Y_CLIENT, duration: TO_HOME });
  };

  const resuming = new Set<number>();

  /** Hands lane `lane` to item `index` and books everything that follows. */
  function dispatch(
    index: number,
    lane: number,
    at: number,
    waited: number,
    moveFrom: number,
    moveDuration: number,
  ): void {
    const plan = WORK[index];
    const item = items[index];
    if (!plan || !item) return;
    if (waited > LATE_WAIT) item.late = true;

    const laneY = LANE_Y[lane] ?? 0;
    item.moves.push({ at: moveFrom, x: CHIP_X, y: laneY, duration: moveDuration });

    if (plan.kind === 'short' || plan.kind === 'cpu') {
      setLane(at, lane, plan.kind === 'cpu' ? 'cpu' : 'running');
      const done = round(at + plan.run);
      schedule(done, () => {
        setLane(done, lane, 'idle');
        finish(index, done);
        pump(done);
      });
      return;
    }

    if (plan.kind === 'blocking') {
      // The thread is held for the whole wait, so nobody else can have it.
      setLane(at, lane, 'running');
      const blockFrom = round(at + plan.run);
      const blockTo = round(blockFrom + IO_LATENCY);
      const done = round(blockTo + plan.run);
      schedule(blockFrom, () => {
        setLane(blockFrom, lane, 'blocked');
        blockedLines.push({ lane, from: blockFrom, to: blockTo });
      });
      schedule(blockTo, () => setLane(blockTo, lane, 'running'));
      schedule(done, () => {
        setLane(done, lane, 'idle');
        finish(index, done);
        pump(done);
      });
      return;
    }

    // Awaiting: run briefly, then let go of the thread and park.
    setLane(at, lane, 'running');
    const leaveAt = round(at + plan.run);
    schedule(leaveAt, () => {
      setLane(leaveAt, lane, 'idle');
      const slot = takeSlot(awaitSlotUsed);
      const spot = AWAIT_SLOTS[slot] ?? { x: 850, y: 1080 };
      item.moves.push({ at: leaveAt, x: spot.x, y: spot.y, duration: TO_AWAIT });
      parked += 1;
      setAwaiting(round(leaveAt + TO_AWAIT));
      pump(leaveAt);

      const backAt = round(leaveAt + TO_AWAIT + IO_LATENCY);
      schedule(backAt, () => {
        awaitSlotUsed[slot] = false;
        parked -= 1;
        setAwaiting(backAt);
        resuming.add(index);
        admit(index, backAt, backAt, TO_AWAIT);
      });
    });
  }

  /** The second half of an awaited item: back to a lane, then home. */
  function resume(
    index: number,
    lane: number,
    at: number,
    moveFrom: number,
    moveDuration: number,
  ): void {
    const plan = WORK[index];
    const item = items[index];
    if (!plan || !item) return;
    const laneY = LANE_Y[lane] ?? 0;
    setLane(at, lane, 'running');
    item.moves.push({ at: moveFrom, x: CHIP_X, y: laneY, duration: moveDuration });
    const done = round(at + TO_AWAIT + plan.run);
    schedule(done, () => {
      setLane(done, lane, 'idle');
      finish(index, done);
      pump(done);
    });
  }

  /**
   * Work reaching the pool. If a lane is free and nobody is ahead of it, it
   * goes straight there in one movement; otherwise it takes a place in the
   * column and waits its turn.
   */
  function admit(index: number, at: number, moveFrom: number, moveDuration: number): void {
    const lane = freeLane();
    if (pending.length === 0 && lane >= 0) {
      if (resuming.delete(index)) resume(index, lane, at, moveFrom, moveDuration + TO_AWAIT);
      else dispatch(index, lane, at, 0, moveFrom, moveDuration + TO_LANE);
      return;
    }
    const slot = takeSlot(queueSlotUsed);
    pending.push({ index, since: at, slot });
    setQueue(at);
    const item = items[index];
    const spot = QUEUE_Y[slot] ?? QUEUE_Y[0] ?? 1000;
    if (item) item.moves.push({ at: moveFrom, x: QUEUE_X, y: spot, duration: moveDuration });
  }

  /** Dispatches as much queued work as there are free lanes. */
  function pump(at: number): void {
    for (;;) {
      if (pending.length === 0) return;
      const lane = freeLane();
      if (lane < 0) return;
      const head = pending.shift();
      if (!head) return;
      queueSlotUsed[head.slot] = false;
      setQueue(at);
      if (resuming.delete(head.index)) resume(head.index, lane, at, at, TO_AWAIT);
      else dispatch(head.index, lane, at, round(at - head.since), at, TO_LANE);
    }
  }

  // Work arriving from the requests box.
  WORK.forEach((plan, index) => {
    const at = round(plan.start + TO_QUEUE);
    schedule(at, () => admit(index, at, plan.start, TO_QUEUE));
  });

  // The pool adds threads one at a time, and gives them back at the reset.
  INJECTIONS.forEach((at, offset) => {
    const lane = BASE_THREADS + offset;
    schedule(at, () => {
      setLane(at, lane, 'idle');
      pump(at);
    });
  });
  schedule(RETIRE_AT, () => {
    for (let lane = BASE_THREADS; lane < LANE_Y.length; lane += 1) {
      if (states[lane] !== 'absent') setLane(RETIRE_AT, lane, 'absent');
    }
  });

  const done = new Set<Task>();
  for (;;) {
    let next: Task | undefined;
    for (const task of tasks) {
      if (done.has(task)) continue;
      if (!next || task.at < next.at || (task.at === next.at && task.order < next.order)) next = task;
    }
    if (!next) break;
    done.add(next);
    next.run();
  }

  return { items, lanes, queue, awaiting, threads, blockedLines };
}

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const bars = qa<SVGRectElement>(stage, '.tp-bar');
  const blockedEls = qa<SVGLineElement>(stage, '.tp-blocked-line');
  const requestLayer = q<SVGGElement>(stage, '.scene-requests', ID);

  const sim = simulate();
  const items = mountRequests(requestLayer, WORK.length, ID);

  const tl = gsap.timeline({ paused: true });

  const attr = (name: string, value: string, at: number): void => {
    tl.set(stage, { attr: { [name]: value }, immediateRender: false }, at);
  };

  // --- pool state, straight from the simulation ---------------------------

  for (const change of sim.lanes) {
    const bar = bars[change.lane];
    if (!bar) continue;
    tl.set(bar, { attr: { 'data-lane-state': change.state }, immediateRender: false }, change.at);
  }
  for (const [at, count] of sim.queue) attr('data-queue', String(count), at);
  for (const [at, count] of sim.awaiting) attr('data-awaiting', String(count), at);
  for (const [at, count] of sim.threads) attr('data-threads', String(count), at);

  // Each dashed line is up for exactly as long as its thread is stuck.
  for (const line of sim.blockedLines) {
    const element = blockedEls[line.lane];
    if (!element) continue;
    tl.to(element, { opacity: 1, duration: 0.2, immediateRender: false }, line.from);
    tl.call(() => cue('state'), undefined, line.from);
    tl.to(element, { opacity: 0, duration: 0.2, immediateRender: false }, line.to);
  }

  // The pool announcing that it has added one more thread.
  for (const at of INJECTIONS) {
    attr('data-inject', 'on', at);
    attr('data-inject', 'off', round(at + FLASH_HOLD));
    tl.call(() => cue('trip'), undefined, at);
  }

  // --- work items -----------------------------------------------------------

  WORK.forEach((plan, index) => {
    const parts = items[index];
    const item = sim.items[index];
    if (!parts || !item) return;
    parkRequest(parts, X, Y_CLIENT);
    showRequest(tl, parts, plan.start);

    if (plan.kind === 'cpu') {
      const label = attachToRequest(
        parts,
        'text',
        { class: 'scene-req-cpu', x: '24', y: '7' },
        'CPU',
      );
      tl.set(label, { opacity: 1, immediateRender: false }, plan.start);
      tl.set(label, { opacity: 0, immediateRender: false }, item.doneAt);
    }

    for (const move of item.moves) {
      tl.to(parts.group, { x: move.x, y: move.y, duration: move.duration, ease: 'none' }, move.at);
    }

    // Work that stood in the queue too long comes back ringed amber.
    markRequest(tl, parts, 'ok', item.doneAt);
    if (item.late) {
      tl.set(parts.halo, { opacity: 1, immediateRender: false }, item.doneAt);
      tl.to(parts.halo, { opacity: 0, duration: 0.2, immediateRender: false }, item.homeAt);
      tl.call(() => cue('failure'), undefined, item.homeAt);
    } else {
      tl.call(() => cue('success'), undefined, item.homeAt);
    }
    hideRequest(tl, parts, item.homeAt, fadeAt(item.homeAt));
  });

  // --- step labels ---------------------------------------------------------

  // The stage is complete on the first frame: four idle lanes, nothing queued.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  // Pin the total length so the scrub bar covers the closing hold.
  tl.to({}, { duration: 0.01 }, SCENE_DURATION - 0.01);

  // Render once in each direction so every zero-duration tween records its
  // start value before a reader can scrub backwards past it.
  tl.progress(1, true).progress(0, true).pause();

  return { tl, steps: STEPS };
}

const scene: SceneModule = {
  id: ID,
  duration: SCENE_DURATION,
  build,
};

export default scene;
