import gsap from 'gsap';
import {
  HANDSHAKE_LENGTH,
  OPEN_TIME,
  POOL_MAX,
  SCENE_DURATION,
  WAIT_TIMEOUT,
  WAIT_X,
  WAIT_Y,
  Y_POOL,
} from './stage';
import { q, qa } from '../shared/dom';
import {
  attachToRequest,
  hideRequest,
  markRequest,
  mountRequests,
  moveRequest,
  parkRequest,
  showRequest,
} from '../shared/request';
import type { SceneBuildOptions, SceneInstance, SceneModule, SceneStep } from '../types';

/**
 * Database Connection Pool scene: a 24 second, four step timeline.
 *
 * Same two rules as the other scenes: every tween sits at an absolute position,
 * and every discrete change is a zero-duration tween on a `data-*` attribute
 * that GSAP reverts when the playhead moves back past it.
 *
 * The pool itself is a queueing simulation, not a script. A request asks the
 * pool for a connection at the moment it arrives and takes whatever answer it
 * gets: the lowest idle slot, or a handshake if there is room to open one, or a
 * place in the column. Which requests wait, which time out, and which pick up
 * the connections the first ones give back all fall out of that.
 */

const ID = 'database-connection-pool';

/** The single lane requests travel along. */
const X = 540;
/** Resting y of a request inside the app box. */
const Y_CLIENT = 620;
/** y a request reaches inside the database box. */
const Y_DB = 1630;
/** How long a queued request takes to step back into the lane. */
const QUEUE_RETURN = 0.25;

type SlotState = 'none' | 'opening' | 'idle' | 'busy' | 'held';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

interface RequestPlan {
  start: number;
  toPool: number;
  poolToDb: number;
  /** Seconds spent at the database. */
  query: number;
  dbToPool: number;
  poolToApp: number;
  /** Step 4: seconds the slot stays borrowed after the answer came back. */
  hold?: number;
}

const req = (start: number, legs: Partial<RequestPlan> = {}): RequestPlan => ({
  start,
  toPool: 0.5,
  poolToDb: 0.3,
  query: 0,
  dbToPool: 0.3,
  poolToApp: 0.5,
  ...legs,
});

const REQUESTS: RequestPlan[] = [
  // Step 1: nothing is open yet, so both requests pay for a handshake.
  req(0.5, { poolToDb: 0.4, dbToPool: 0.4 }),
  req(1.2, { poolToDb: 0.4, dbToPool: 0.4 }),
  // Step 2: a steady stream borrowing and returning the same two connections.
  ...[6.3, 6.7, 7.1, 7.5, 7.9, 8.3, 8.7, 9.1].map((start) => req(start)),
  // Step 3: seven slow queries against a pool of four.
  ...[12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 12.9].map((start) => req(start, { query: 1.2 })),
  // Step 4: one request holds its connection long after the query answered.
  req(18.3, { hold: 2.0 }),
  // Step 4: five that borrow for the query only.
  ...[18.6, 19.0, 19.4, 19.8, 20.2].map((start) => req(start)),
];

const round = (value: number): number => Number(value.toFixed(3));
const fadeAt = (home: number): number => Math.max(0.05, Math.min(0.15, SCENE_DURATION - home));

interface SlotChange {
  at: number;
  slot: number;
  state: SlotState;
}

interface Handshake {
  slot: number;
  from: number;
  to: number;
}

interface Outcome {
  /** Slot the request ended up borrowing, or -1 if it gave up. */
  slot: number;
  /** When the handshake it triggered started, if it triggered one. */
  openedAt?: number;
  /** When it joined the column, and which place it took. */
  waitFrom?: number;
  waitIndex?: number;
  /** When it gave up. */
  timedOutAt?: number;
  /** When it took the connection, reached the database, and gave it back. */
  borrowAt?: number;
  laneAt?: number;
  dbAt?: number;
  releaseAt?: number;
  /** When it reached the app again, either way. */
  homeAt: number;
}

interface Simulation {
  outcomes: Outcome[];
  slots: SlotChange[];
  handshakes: Handshake[];
  open: [number, number][];
  waiting: [number, number][];
  held: [number, 'on' | 'off'][];
}

/**
 * Runs the pool. Requests are served in arrival order, a released connection
 * goes straight to the request that has been waiting longest, and a request
 * that stands in the column too long leaves with a timeout.
 */
function simulate(): Simulation {
  const states: SlotState[] = Array.from({ length: POOL_MAX }, () => 'none');
  const outcomes: Outcome[] = REQUESTS.map(() => ({ slot: -1, homeAt: 0 }));
  const slots: SlotChange[] = [];
  const handshakes: Handshake[] = [];
  const open: [number, number][] = [];
  const waiting: [number, number][] = [];
  const held: [number, 'on' | 'off'][] = [];
  const queue: number[] = [];
  let nextWaitIndex = 0;

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
  const recordSlot = (at: number, slot: number, state: SlotState): void => {
    for (let i = slots.length - 1; i >= 0; i -= 1) {
      const candidate = slots[i];
      if (!candidate || candidate.at !== at) break;
      if (candidate.slot === slot) {
        candidate.state = state;
        return;
      }
    }
    slots.push({ at, slot, state });
  };
  const recordPair = <T>(series: [number, T][], at: number, next: T): void => {
    const previous = series[series.length - 1];
    if (previous && previous[0] === at) previous[1] = next;
    else series.push([at, next]);
  };

  const setSlot = (at: number, slot: number, state: SlotState): void => {
    states[slot] = state;
    recordSlot(at, slot, state);
    const openCount = states.filter((value) => value !== 'none' && value !== 'opening').length;
    recordPair(open, at, openCount);
  };
  const setWaiting = (at: number): void => recordPair(waiting, at, queue.length);
  const lowest = (match: SlotState): number => states.findIndex((value) => value === match);

  /** Hands slot `slot` to request `index`, and books everything that follows. */
  const borrow = (index: number, slot: number, at: number, fromQueue: boolean): void => {
    const plan = REQUESTS[index];
    const outcome = outcomes[index];
    if (!plan || !outcome) return;
    setSlot(at, slot, 'busy');
    outcome.slot = slot;
    outcome.borrowAt = at;
    // A request called back from the column has to step into the lane first.
    const laneAt = fromQueue ? round(at + QUEUE_RETURN) : at;
    outcome.laneAt = laneAt;
    const dbAt = round(laneAt + plan.poolToDb);
    const releaseAt = round(dbAt + plan.query + plan.dbToPool);
    outcome.dbAt = dbAt;
    outcome.releaseAt = releaseAt;
    outcome.homeAt = round(releaseAt + plan.poolToApp);

    schedule(releaseAt, () => {
      if (plan.hold === undefined) {
        setSlot(releaseAt, slot, 'idle');
        serveQueue(releaseAt);
        return;
      }
      // The answer is back but the application has not let go yet.
      setSlot(releaseAt, slot, 'held');
      recordPair(held, releaseAt, 'on');
      const freeAt = round(releaseAt + plan.hold);
      schedule(freeAt, () => {
        setSlot(freeAt, slot, 'idle');
        recordPair(held, freeAt, 'off');
        serveQueue(freeAt);
      });
    });
  };

  /** Gives freed connections to whoever has been waiting longest. */
  function serveQueue(at: number): void {
    for (;;) {
      if (queue.length === 0) return;
      const slot = lowest('idle');
      if (slot < 0) return;
      const index = queue.shift();
      if (index === undefined) return;
      setWaiting(at);
      borrow(index, slot, at, true);
    }
  }

  REQUESTS.forEach((plan, index) => {
    const at = round(plan.start + plan.toPool);
    schedule(at, () => {
      const outcome = outcomes[index];
      if (!outcome) return;

      const idle = lowest('idle');
      if (idle >= 0) {
        borrow(index, idle, at, false);
        return;
      }

      const free = lowest('none');
      if (free >= 0) {
        // Room to open one: pay for the handshake, then borrow it.
        setSlot(at, free, 'opening');
        outcome.openedAt = at;
        const ready = round(at + OPEN_TIME);
        handshakes.push({ slot: free, from: at, to: ready });
        schedule(ready, () => borrow(index, free, ready, false));
        return;
      }

      // Everything is busy, so stand in the column and start the clock.
      outcome.waitFrom = at;
      outcome.waitIndex = nextWaitIndex;
      nextWaitIndex += 1;
      queue.push(index);
      setWaiting(at);

      const deadline = round(at + WAIT_TIMEOUT);
      schedule(deadline, () => {
        const position = queue.indexOf(index);
        if (position < 0) return;
        queue.splice(position, 1);
        outcome.timedOutAt = deadline;
        outcome.homeAt = round(deadline + plan.poolToApp);
        setWaiting(deadline);
      });
    });
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

  return { outcomes, slots, handshakes, open, waiting, held };
}

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const slotEls = qa<SVGRectElement>(stage, '.dp-slot');
  const handshakeEls = qa<SVGLineElement>(stage, '.dp-handshake');
  const requestLayer = q<SVGGElement>(stage, '.scene-requests', ID);

  const sim = simulate();
  const requests = mountRequests(requestLayer, REQUESTS.length, ID);

  const tl = gsap.timeline({ paused: true });

  const attr = (name: string, value: string, at: number): void => {
    tl.set(stage, { attr: { [name]: value }, immediateRender: false }, at);
  };

  // --- pool state, straight from the simulation ---------------------------

  for (const change of sim.slots) {
    const element = slotEls[change.slot];
    if (!element) continue;
    tl.set(element, { attr: { 'data-slot-state': change.state }, immediateRender: false }, change.at);
  }
  for (const [at, count] of sim.open) {
    attr('data-open', String(count), at);
    // The database sees exactly the connections the pool has opened.
    attr('data-connections', String(count), at);
  }
  for (const [at, count] of sim.waiting) attr('data-waiting', String(count), at);
  for (const [at, value] of sim.held) {
    attr('data-held', value, at);
    if (value === 'on') tl.call(() => cue('trip'), undefined, at);
  }

  // --- handshakes ----------------------------------------------------------

  for (const shake of sim.handshakes) {
    const line = handshakeEls[shake.slot];
    if (!line) continue;
    tl.set(line, { opacity: 1, immediateRender: false }, shake.from);
    tl.fromTo(
      line,
      { attr: { 'stroke-dashoffset': HANDSHAKE_LENGTH } },
      {
        attr: { 'stroke-dashoffset': 0 },
        duration: shake.to - shake.from,
        ease: 'none',
        immediateRender: false,
      },
      shake.from,
    );
    tl.call(() => cue('state'), undefined, shake.to);
    tl.to(line, { opacity: 0, duration: 0.3, immediateRender: false }, shake.to);
  }

  // --- requests ------------------------------------------------------------

  REQUESTS.forEach((plan, index) => {
    const parts = requests[index];
    const outcome = sim.outcomes[index];
    if (!parts || !outcome) return;
    parkRequest(parts, X, Y_CLIENT);

    const atPool = round(plan.start + plan.toPool);
    showRequest(tl, parts, plan.start);
    moveRequest(tl, parts, Y_POOL, plan.toPool, plan.start);

    // A request with nowhere to go steps aside into the column.
    if (outcome.waitFrom !== undefined) {
      const lane = WAIT_Y[outcome.waitIndex ?? 0] ?? WAIT_Y[0] ?? Y_POOL;
      tl.to(
        parts.group,
        { x: WAIT_X, y: lane, duration: QUEUE_RETURN, ease: 'power1.out' },
        outcome.waitFrom,
      );
    }

    if (outcome.timedOutAt !== undefined) {
      const home = outcome.homeAt;
      const label = attachToRequest(
        parts,
        'text',
        { class: 'scene-req-timeout', x: '28', y: '8' },
        'timeout',
      );
      markRequest(tl, parts, 'fail', outcome.timedOutAt, 0.5);
      tl.set(label, { opacity: 1, immediateRender: false }, outcome.timedOutAt);
      tl.to(
        parts.group,
        { x: X, y: Y_CLIENT, duration: plan.poolToApp, ease: 'power1.in' },
        outcome.timedOutAt,
      );
      tl.call(() => cue('failure'), undefined, home);
      tl.set(label, { opacity: 0, immediateRender: false }, home);
      hideRequest(tl, parts, home, fadeAt(home));
      return;
    }

    const laneAt = outcome.laneAt ?? atPool;
    const dbAt = outcome.dbAt ?? atPool;
    const releaseAt = outcome.releaseAt ?? atPool;
    const home = outcome.homeAt;

    // Called back from the column, or held at the pool while it opens.
    if (outcome.waitFrom !== undefined) {
      tl.to(
        parts.group,
        { x: X, y: Y_POOL, duration: QUEUE_RETURN, ease: 'power1.in' },
        outcome.borrowAt ?? atPool,
      );
    }

    moveRequest(tl, parts, Y_DB, plan.poolToDb, laneAt);
    markRequest(tl, parts, 'ok', round(dbAt + plan.query));
    moveRequest(tl, parts, Y_POOL, plan.dbToPool, round(dbAt + plan.query));
    moveRequest(tl, parts, Y_CLIENT, plan.poolToApp, releaseAt);
    tl.call(() => cue('success'), undefined, home);
    hideRequest(tl, parts, home, fadeAt(home));
  });

  // --- step labels ---------------------------------------------------------

  // The stage is complete on the first frame: four empty slots and no
  // connections open, which is exactly what a cold start looks like.
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
