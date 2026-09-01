import {
  BACKLOG_MAX,
  BAR_IDS,
  BAR_STEPS,
  OK_MAX,
  PORT_MAX,
  SCENE_DURATION,
  SLOT_IDS,
  STAGE_STATE,
  X_LANE,
  Y_IO_TOP,
  Y_REQUESTS_BOTTOM,
  Y_THREADS_BOTTOM,
  Y_THREADS_TOP,
} from './stage';
import type { BarId, Mark, SlotId, SlotState } from './stage';
import { q } from '../shared/dom';
import { hideRequest, markRequest, mountRequests, parkRequest, showRequest } from '../shared/request';
import { collapseAtInstant, createScheduler } from '../shared/simulation';
import { attr, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * I/O Completion Port scene: a 24 second, four step timeline.
 *
 * The same two rules as every other scene: every tween sits at an absolute
 * position, and every discrete change is a zero-duration tween on a `data-*`
 * attribute that GSAP reverts when the playhead moves back past it. Nothing here
 * is a continuous quantity — a slot is free, running or held; a bar is idle or
 * one of four quarters; the port holds a whole number of packets — so every
 * frame is a set of stacked variants and scrubbing backwards lands on a value
 * rather than on a blend of two.
 *
 * Nothing the reader reads is authored. The scene is told when each request
 * leaves the Requests band and what kind it is, how long each operation takes,
 * when the blocking ghost is taken away, when the gate is turned on and when the
 * picture is called settled.
 *
 * Everything else falls out of one pass over that. Which slot a request lands
 * on, how long that slot is held, when the start reaches the port, when the
 * operation finishes, how deep the packet queue gets, which slot picks the
 * continuation up, when `ok n` moves and what the backlog reaches are all read
 * off the run. The two numbers the third step is about — six operations in
 * flight against two threads that ever wake — are counted from the run rather
 * than written into it, and the build refuses the scene if they come out any
 * other way.
 *
 * The pool hands work out from two ends, which is the one presentational choice
 * in the model: a request arriving from the Requests band goes to the lowest
 * free slot, and a completion packet goes to the highest free one. That is what
 * lets the reader tell a registration from a continuation by where it lights,
 * and it is why the second step's continuation demonstrably does not run on the
 * thread that started the operation.
 *
 * This scene does not own the pool. Thread Pool owns worker threads and the work
 * queue in general, and Thread Pool Starvation owns what a starved pool looks
 * like from outside. What is owned here is the one moment those two do not
 * draw: the point where a wait leaves the thread behind, and the packet that
 * comes back when it is over.
 */

const ID = 'io-completion-port';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- how a traveller moves -------------------------------------------------

/** The two lanes, and how long a traveller takes to cross each of them. */
const LEG_IN = 0.36;
const LEG_IO = 0.36;

/** The halo diameter two travellers on one lane must always keep between them. */
const HALO = 52;

/** How long a traveller takes to go once it has nothing left to do. */
const FADE = 0.1;

// --- what the pool and the port do -----------------------------------------

/** What a thread spends on a request before the start reaches the port. */
const REGISTER = 0.36;
/** How fast a thread already in a loop issues the next start. */
const START_GAP = 0.12;
/** What a continuation costs the thread that picks it up. */
const CONT = 0.26;
/** The shortest gap between two packets leaving the port. */
const PICKUP_GAP = 0.28;
/** How long a packet sits on the port before a thread is woken for it. */
const PORT_DELAY = 0.7;
/** How long the port must have been empty for a new packet to announce itself. */
const PORT_LULL = 0.5;

// --- what the scene is told ------------------------------------------------

/**
 * One request.
 *  - `block` is the first step's ghost: the thread that takes it is held for the
 *    whole operation, so the request never comes back.
 *  - `pile` never leaves the Requests band, because by the time it arrives there
 *    is no thread left to take it.
 *  - `work` is the ordinary shape: register the start, give the thread back, and
 *    come back on whichever thread picks the completion packet up.
 *  - `trap` is `work` with the fourth step's mistake in it: the thread that
 *    registered the start blocks on the result instead of returning to the pool,
 *    and is only released when the continuation finally runs somewhere else.
 */
type Kind = 'block' | 'pile' | 'work' | 'trap';

interface RequestPlan {
  at: number;
  kind: Kind;
  /** Seconds the operating system spends on the operation. */
  io: number;
}

const REQUESTS: RequestPlan[] = [
  // Step 1: four requests, each of which parks a thread for the whole wait,
  // and three more that arrive to find nothing left to take them.
  { at: 0.14, kind: 'block', io: 3.0 },
  { at: 0.94, kind: 'block', io: 3.0 },
  { at: 1.19, kind: 'block', io: 3.0 },
  { at: 1.44, kind: 'block', io: 3.0 },
  { at: 2.2, kind: 'pile', io: 0 },
  { at: 2.45, kind: 'pile', io: 0 },
  { at: 2.7, kind: 'pile', io: 0 },
  // Step 2: one request, slowly, so every hand-off is legible.
  { at: 6.4, kind: 'work', io: 1.92 },
  // Step 3: six requests inside one loop, all in flight at once. Each takes a
  // little less than the one before, so the six completions land close together
  // and the port is holding all of them before the first thread is woken.
  { at: 12.1, kind: 'work', io: 0.92 },
  { at: 12.22, kind: 'work', io: 0.86 },
  { at: 12.34, kind: 'work', io: 0.8 },
  { at: 12.46, kind: 'work', io: 0.74 },
  { at: 12.58, kind: 'work', io: 0.68 },
  { at: 12.7, kind: 'work', io: 0.62 },
  // Step 4: one request whose continuation blocks the thread that started it,
  // and four more launched at once behind it.
  { at: 18.06, kind: 'trap', io: 1.2 },
  { at: 18.66, kind: 'work', io: 0.3 },
  { at: 18.78, kind: 'work', io: 0.3 },
  { at: 18.9, kind: 'work', io: 0.3 },
  { at: 19.02, kind: 'work', io: 0.3 },
];

/** When the blocking world is taken away and the port takes over. */
const GHOST_END = 3.0;

/** When the gate is turned on, and how many starts it allows in flight. */
const LIMIT_AT = 20.55;
const LIMIT = 2;

/** The five things the scene holds up, and how long each is held for. */
const MARK_AT: [number, Mark, number][] = [
  [3.9, 'nothread', 0.5],
  [4.8, 'os', 0.5],
  [8.4, 'bars', 0.5],
  [11.0, 'wait', 0.5],
  // The third step's two numbers are held up while both of them are on the
  // stage: six bars running, and four slots that all still read `free`.
  [13.86, 'count', 0.22],
];

/** When the picture is called settled: bounded, drained and free. */
const SETTLE_AT = 22.76;

/** The shortest gap between any two cues, and how quiet a step boundary is. */
const MIN_CUE_GAP = 0.2;
const BOUNDARY_GAP = 0.3;
const BOUNDARIES = [0, 6, 12, 18, 24];
const EPS = 1e-9;

// --- what the simulation produces ------------------------------------------

/** One discrete change, and the thing on the stage it is written on. */
interface AttrChange {
  at: number;
  target: string;
  name: string;
  value: string;
}

/** Which way a traveller is going, which is also what it is carrying. */
type RideKind = 'arrive' | 'start' | 'packet' | 'home';

/** One leg of one request, on one lane, in one direction. */
interface Ride {
  request: number;
  kind: RideKind;
  lane: 'in' | 'io';
  from: number;
  to: number;
  startAt: number;
  leg: number;
  /** Whether the check mark is put on at the start of this leg. */
  marks: boolean;
  /** Whether the request fades rather than being taken straight off. */
  fades: boolean;
}

/** One operation, once the scene has run it to the end. */
interface Operation {
  request: number;
  kind: Kind;
  slot: number;
  bar: BarId | null;
  takeAt: number;
  issueAt: number;
  ioAt: number;
  doneAt: number;
  pickAt: number;
  contAt: number;
  /** The slot the continuation actually ran on, which is not the one above. */
  contSlot: number;
  okAt: number;
  ok: number;
}

interface Simulation {
  changes: AttrChange[];
  cues: [number, SceneCue][];
  rides: Ride[];
  operations: Operation[];
  /** The most operations in flight at once inside each step. */
  inFlightPeak: number[];
  /** The most threads running code at once inside each step. */
  busyPeak: number[];
  /** Which slots ever ran anything inside each step. */
  slotsUsed: Set<SlotId>[];
  portPeak: number;
  backlogPeak: number;
}

// --- the simulation --------------------------------------------------------

function simulate(): Simulation {
  const raw: AttrChange[] = [];
  const fixed: [number, SceneCue][] = [];
  const rides: Ride[] = [];
  const operations: Operation[] = [];
  const problems: string[] = [];

  const setAttr = (at: number, target: string, name: string, value: string): void => {
    raw.push({ at: round(at), target, name, value });
  };
  const cue = (at: number, name: SceneCue): void => {
    fixed.push([round(at), name]);
  };
  const stage = (at: number, name: string, value: string): void => {
    setAttr(at, 'stage', `data-iocp-${name}`, value);
  };

  const slots: SlotState[] = SLOT_IDS.map(() => 'free');
  /** When each slot last became free, so a never-used slot reads as ready. */
  const bars: Record<BarId, string> = Object.fromEntries(
    BAR_IDS.map((id) => [id, 'off']),
  ) as Record<BarId, string>;
  let backlog = 0;
  let okValue = 0;

  /** Completion packets waiting on the port, oldest first. */
  const queue: number[] = [];
  /** Which request each queued packet belongs to. */
  const queued: number[] = [];
  let lastPickup = -Infinity;
  let emptySince = 0;
  let pickupBooked = -Infinity;

  /** Operations whose start has been issued and has not yet completed. */
  const inFlight = new Set<number>();
  const inFlightLog: [number, number][] = [];
  const busyLog: [number, number][] = [];
  const usedLog: [number, number][] = [];

  const { schedule, drain } = createScheduler();

  const setSlot = (at: number, index: number, state: SlotState): void => {
    if (slots[index] === state) return;
    slots[index] = state;
    const id = SLOT_IDS[index];
    if (!id) return;
    setAttr(at, id, 'data-iocp-slot', state);
    busyLog.push([round(at), slots.filter((value) => value === 'busy').length]);
    if (state === 'busy') usedLog.push([round(at), index]);
  };
  const setBar = (at: number, id: BarId, value: string): void => {
    if (bars[id] === value) return;
    bars[id] = value;
    setAttr(at, id, 'data-iocp-bar', value);
  };
  const setPort = (at: number): void => {
    stage(at, 'port', String(queue.length));
    if (queue.length > PORT_MAX) {
      problems.push(`${round(at)} the port holds ${queue.length} packets, which the card never drew`);
    }
  };
  const setBacklog = (at: number): void => {
    stage(at, 'backlog', String(backlog));
    if (backlog > BACKLOG_MAX) {
      problems.push(`${round(at)} the backlog reached ${backlog}, which the band never drew`);
    }
  };
  const setOk = (at: number): void => {
    okValue += 1;
    if (okValue > OK_MAX) {
      problems.push(`${round(at)} the readout was asked for ok ${okValue}, which the stage never drew`);
      return;
    }
    stage(at, 'ok', String(okValue));
  };

  const lowestFree = (): number => slots.findIndex((value) => value === 'free');
  const highestFree = (): number => {
    for (let i = slots.length - 1; i >= 0; i -= 1) if (slots[i] === 'free') return i;
    return -1;
  };
  const freeBar = (): BarId | null => BAR_IDS.find((id) => bars[id] === 'off') ?? null;

  const ride = (
    request: number,
    kind: RideKind,
    lane: 'in' | 'io',
    from: number,
    to: number,
    startAt: number,
    marks = false,
    fades = false,
  ): void => {
    rides.push({
      request,
      kind,
      lane,
      from,
      to,
      startAt: round(startAt),
      leg: lane === 'in' ? LEG_IN : LEG_IO,
      marks,
      fades,
    });
  };

  const noteInFlight = (at: number): void => {
    inFlightLog.push([round(at), inFlight.size]);
  };

  // --- the loop one thread runs ---------------------------------------------

  /** The thread currently registering starts, and how far its loop has got. */
  let registrar: { slot: number; lastIssue: number; kind: Kind } | null = null;

  /** Books everything that follows one start reaching the port. */
  function runOperation(index: number, plan: RequestPlan, op: Operation): void {
    const ioAt = round(op.issueAt + LEG_IO);
    op.ioAt = ioAt;
    ride(index, 'start', 'io', Y_THREADS_BOTTOM, Y_IO_TOP, op.issueAt);

    inFlight.add(index);
    noteInFlight(op.issueAt);
    if (op.issueAt > LIMIT_AT + EPS && inFlight.size > LIMIT) {
      problems.push(`${op.issueAt} a start was issued with ${inFlight.size} already in flight under the gate`);
    }

    schedule(ioAt, () => {
      const bar = freeBar();
      if (!bar) {
        problems.push(`${ioAt} a seventh operation went in flight, and the IO band only draws six`);
        return;
      }
      op.bar = bar;
      setBar(ioAt, bar, '1');
      for (let step = 2; step <= BAR_STEPS; step += 1) {
        const at = round(ioAt + (plan.io * (step - 1)) / BAR_STEPS);
        schedule(at, () => setBar(at, bar, String(step)));
      }
      const doneAt = round(ioAt + plan.io);
      op.doneAt = doneAt;
      schedule(doneAt, () => {
        setBar(doneAt, bar, 'off');
        inFlight.delete(index);
        noteInFlight(doneAt);
        if (queue.length === 0) {
          if (doneAt - emptySince >= PORT_LULL - EPS) cue(doneAt, 'state');
        }
        queue.push(doneAt);
        queued.push(index);
        setPort(doneAt);
        pump(doneAt);
      });
    });
  }

  /** Hands one packet to a thread, as often as the port is allowed to. */
  function pump(now: number): void {
    const head = queue[0];
    if (head === undefined) return;
    const earliest = round(Math.max(lastPickup + PICKUP_GAP, head + PORT_DELAY));
    if (earliest > now + EPS) {
      if (earliest > pickupBooked + EPS) {
        pickupBooked = earliest;
        schedule(earliest, () => pump(earliest));
      }
      return;
    }
    queue.shift();
    const index = queued.shift();
    if (index === undefined) return;
    lastPickup = now;
    setPort(now);
    if (queue.length === 0) emptySince = now;

    const op = operations[index];
    if (!op) return;
    op.pickAt = now;
    ride(index, 'packet', 'io', Y_IO_TOP, Y_THREADS_BOTTOM, now);

    const contAt = round(now + LEG_IO);
    schedule(contAt, () => {
      const slot = highestFree();
      if (slot < 0) {
        problems.push(`${contAt} a completion packet arrived with no thread free to run it`);
        return;
      }
      op.contAt = contAt;
      op.contSlot = slot;
      setSlot(contAt, slot, 'busy');
      const okAt = round(contAt + CONT);
      schedule(okAt, () => {
        setSlot(okAt, slot, 'free');
        // A thread that blocked on this very result is only released now.
        if (op.kind === 'trap') setSlot(okAt, op.slot, 'free');
        setOk(okAt);
        op.okAt = okAt;
        op.ok = okValue;
        cue(okAt, 'success');
        ride(index, 'home', 'in', Y_THREADS_TOP, Y_REQUESTS_BOTTOM, okAt, true, true);
      });
    });
    schedule(round(now + PICKUP_GAP), () => pump(round(now + PICKUP_GAP)));
  }

  // --- what a request does ---------------------------------------------------

  REQUESTS.forEach((plan, index) => {
    const op: Operation = {
      request: index,
      kind: plan.kind,
      slot: -1,
      bar: null,
      takeAt: 0,
      issueAt: 0,
      ioAt: 0,
      doneAt: 0,
      pickAt: 0,
      contAt: 0,
      contSlot: -1,
      okAt: 0,
      ok: 0,
    };
    operations.push(op);

    if (plan.kind === 'pile') {
      schedule(plan.at, () => {
        const held = slots.filter((value) => value === 'held').length;
        backlog += 1;
        setBacklog(plan.at);
        cue(plan.at, held === slots.length && backlog === 1 ? 'failure' : 'state');
      });
      return;
    }

    const arriveAt = round(plan.at + LEG_IN);
    ride(index, 'arrive', 'in', Y_REQUESTS_BOTTOM, Y_THREADS_TOP, plan.at);

    schedule(arriveAt, () => {
      if (plan.kind === 'block') {
        // A blocking wait: the thread that takes it is held for the whole
        // operation, and the ghost is taken away before any of them come back.
        const slot = lowestFree();
        if (slot < 0) {
          problems.push(`${arriveAt} a blocking request found no free thread, which the ghost never shows`);
          return;
        }
        op.slot = slot;
        op.takeAt = arriveAt;
        setSlot(arriveAt, slot, 'held');
        cue(arriveAt, 'state');
        const bar = freeBar();
        if (!bar) return;
        op.bar = bar;
        setBar(arriveAt, bar, '1');
        for (let step = 2; step <= BAR_STEPS; step += 1) {
          const at = round(arriveAt + (plan.io * (step - 1)) / BAR_STEPS);
          if (at < GHOST_END) schedule(at, () => setBar(at, bar, String(step)));
        }
        return;
      }

      // Port mode. A thread already inside a loop takes the next request too,
      // because starting an operation is nearly free; anything else wakes the
      // lowest free thread.
      if (registrar && plan.kind === 'work' && arriveAt <= registrar.lastIssue + EPS) {
        registrar.lastIssue = round(registrar.lastIssue + START_GAP);
        op.slot = registrar.slot;
        op.takeAt = arriveAt;
        op.issueAt = registrar.lastIssue;
      } else {
        const slot = lowestFree();
        if (slot < 0) {
          problems.push(`${arriveAt} a request found no free thread to register it`);
          return;
        }
        op.slot = slot;
        op.takeAt = arriveAt;
        op.issueAt = round(arriveAt + REGISTER);
        setSlot(arriveAt, slot, 'busy');
        registrar = { slot, lastIssue: op.issueAt, kind: plan.kind };
        if (plan.kind === 'work') cue(arriveAt, 'state');
      }

      const issueAt = op.issueAt;
      schedule(issueAt, () => {
        runOperation(index, plan, op);
        // The loop closes when this was its last start. A thread that blocked on
        // the result stays where it is instead of going back to the pool.
        if (registrar && registrar.slot === op.slot && Math.abs(registrar.lastIssue - issueAt) < EPS) {
          if (plan.kind === 'trap') {
            setSlot(issueAt, op.slot, 'held');
            cue(issueAt, 'state');
          } else {
            setSlot(issueAt, op.slot, 'free');
            cue(issueAt, 'state');
          }
          registrar = null;
        }
      });
    });
  });

  // --- the world the scene starts in, and the one it moves to ---------------

  schedule(GHOST_END, () => {
    stage(GHOST_END, 'mode', 'port');
    slots.forEach((_value, index) => setSlot(GHOST_END, index, 'free'));
    for (const id of BAR_IDS) setBar(GHOST_END, id, 'off');
    backlog = 0;
    setBacklog(GHOST_END);
    emptySince = GHOST_END;
    cue(GHOST_END, 'trip');
  });

  schedule(LIMIT_AT, () => {
    stage(LIMIT_AT, 'limit', 'on');
    cue(LIMIT_AT, 'state');
  });

  for (const [at, value, hold] of MARK_AT) {
    schedule(at, () => {
      stage(at, 'mark', value);
      cue(at, 'state');
    });
    schedule(round(at + hold), () => stage(round(at + hold), 'mark', 'none'));
  }

  schedule(SETTLE_AT, () => {
    stage(SETTLE_AT, 'settled', 'on');
    cue(SETTLE_AT, 'success');
  });

  drain();

  return finish({ raw, fixed, rides, operations, problems, inFlightLog, busyLog, usedLog });
}

// --- what has to be true for the picture to mean anything ------------------

interface RawSimulation {
  raw: AttrChange[];
  fixed: [number, SceneCue][];
  rides: Ride[];
  operations: Operation[];
  problems: string[];
  inFlightLog: [number, number][];
  busyLog: [number, number][];
  usedLog: [number, number][];
}

/** Where a traveller is at `t`: down its lane, then parked at the far edge. */
const whereAt = (ride: Ride, t: number): number => {
  const d = t - ride.startAt;
  if (d <= 0) return ride.from;
  if (d >= ride.leg) return ride.to;
  return ride.from + (ride.to - ride.from) * (d / ride.leg);
};

/** How long a traveller can be seen for, fade included. */
const lastSeen = (ride: Ride): number => round(ride.startAt + ride.leg + (ride.fades ? FADE : 0));

/** Which step an instant belongs to. */
const stepOf = (t: number): number => Math.min(3, Math.max(0, Math.floor(t / 6)));

/** The highest value a `[time, value]` log reaches inside each step. */
const peaks = (log: [number, number][]): number[] => {
  const out = [0, 0, 0, 0];
  for (const [at, value] of log) {
    const step = stepOf(at);
    out[step] = Math.max(out[step] ?? 0, value);
  }
  return out;
};

function finish(sim: RawSimulation): Simulation {
  const { raw, fixed, rides, operations, inFlightLog, busyLog, usedLog } = sim;
  const problems = [...sim.problems];

  // --- the discrete changes, in time order and collapsed -------------------

  // Two changes to one thing at one instant would render in insertion order
  // forwards and in reverse going backwards, so that single frame would depend
  // on which way the reader scrubbed. Only the one that applies is kept.
  const inTimeOrder = raw
    .map((entry, order) => ({ entry, order }))
    .sort((left, right) => left.entry.at - right.entry.at || left.order - right.order)
    .map(({ entry }) => entry);

  const folded: AttrChange[] = [];
  for (const entry of inTimeOrder) {
    collapseAtInstant(folded, entry, (change) => `${change.target}@${change.name}`);
  }

  const seen = new Map<string, string>(Object.entries(STAGE_STATE));
  const changes: AttrChange[] = [];
  for (const change of folded) {
    const key = `${change.target}@${change.name}`;
    if (seen.get(key) === change.value) continue;
    seen.set(key, change.value);
    changes.push(change);
  }

  /** The value one thing on the stage holds at `t`. */
  const valueAt = (target: string, name: string, t: number): string => {
    let value = STAGE_STATE[`${target}@${name}`] ?? '';
    for (const change of changes) {
      if (change.target !== target || change.name !== name) continue;
      if (change.at <= t + EPS) value = change.value;
    }
    return value;
  };

  // The readout counts what came back and never counts anything else.
  let counted = 0;
  for (const change of changes) {
    if (change.name !== 'data-iocp-ok') continue;
    const value = Number(change.value);
    if (value !== counted + 1) problems.push(`${change.at} the readout went from ok ${counted} to ok ${value}`);
    counted = value;
  }
  const wanted = operations.filter((op) => op.okAt > 0).length;
  if (counted !== wanted) problems.push(`the readout finished on ok ${counted} for ${wanted} completions`);
  if (counted !== OK_MAX) problems.push(`the stage draws ok up to ${OK_MAX} and the run reached ${counted}`);

  // Every request that was meant to come back did, and none of the ghost's did.
  for (const op of operations) {
    if (op.kind === 'pile') continue;
    if (op.kind === 'block') {
      if (op.okAt > 0) problems.push(`a blocking request came back at ${op.okAt}`);
      continue;
    }
    if (op.okAt <= 0) problems.push(`the request taken at ${op.takeAt} never came back`);
    if (op.doneAt <= op.ioAt) problems.push(`the operation started at ${op.ioAt} finished at ${op.doneAt}`);
    if (op.pickAt < op.doneAt) problems.push(`a packet from ${op.doneAt} was picked up at ${op.pickAt}`);
    // The thread that registered the start is never the thread that runs the
    // continuation, which is the second step's whole point.
    if (op.contSlot === op.slot) {
      problems.push(`the operation registered at ${op.issueAt} was continued on the thread that started it`);
    }
  }
  if (!operations.some((op) => op.kind === 'work' && stepOf(op.takeAt) === 1)) {
    problems.push('the second step has no request in it');
  }

  // Nothing is ever held while the port is doing the waiting, except the one
  // trap the fourth step is about.
  const trapSlots = new Set(operations.filter((op) => op.kind === 'trap').map((op) => op.slot));
  for (const change of changes) {
    if (change.name !== 'data-iocp-slot' || change.value !== 'held') continue;
    if (change.at < GHOST_END - EPS) continue;
    const slot = SLOT_IDS.indexOf(change.target as SlotId);
    if (!trapSlots.has(slot)) {
      problems.push(`${change.at} ${change.target} was held on a wait in port mode`);
    }
  }

  // The port never holds a packet it was not handed, and never hands out one it
  // does not hold: the depth is completions minus pickups at every instant.
  const events: [number, number][] = [];
  for (const op of operations) {
    if (op.doneAt > 0) events.push([op.doneAt, 1]);
    if (op.pickAt > 0) events.push([op.pickAt, -1]);
  }
  events.sort((left, right) => left[0] - right[0] || right[1] - left[1]);
  let depth = 0;
  let portPeak = 0;
  const depthAt = new Map<number, number>();
  for (const [at, delta] of events) {
    depth += delta;
    portPeak = Math.max(portPeak, depth);
    depthAt.set(round(at), depth);
    if (depth < 0) problems.push(`${at} the port handed out a packet it did not hold`);
  }
  for (const [at, want] of depthAt) {
    const shown = Number(valueAt('stage', 'data-iocp-port', at));
    if (shown !== want) problems.push(`${at} the port reads ${shown} for ${want} packets`);
  }
  if (portPeak !== PORT_MAX) {
    problems.push(`the port card draws ${PORT_MAX} packets and the run reached ${portPeak}`);
  }

  // The backlog only ever grows while every thread is held.
  let backlogPeak = 0;
  for (const change of changes) {
    if (change.name !== 'data-iocp-backlog') continue;
    backlogPeak = Math.max(backlogPeak, Number(change.value));
  }
  if (backlogPeak !== BACKLOG_MAX) {
    problems.push(`the band draws a backlog of ${BACKLOG_MAX} and the run reached ${backlogPeak}`);
  }

  // --- the two numbers the third step is about ------------------------------

  const inFlightPeak = peaks(inFlightLog);
  const busyPeak = peaks(busyLog);
  const slotsUsed: Set<SlotId>[] = [new Set(), new Set(), new Set(), new Set()];
  for (const [at, index] of usedLog) {
    const id = SLOT_IDS[index];
    if (id) slotsUsed[stepOf(at)]?.add(id);
  }
  if ((inFlightPeak[2] ?? 0) !== 6) {
    problems.push(`the third step promises six operations at once and ran ${inFlightPeak[2]}`);
  }
  if ((slotsUsed[2]?.size ?? 0) !== 2) {
    problems.push(`the third step promises two threads and used ${slotsUsed[2]?.size}`);
  }
  if ((inFlightPeak[2] ?? 0) <= (busyPeak[2] ?? 0)) {
    problems.push('the third step never has more operations in flight than threads running');
  }
  if ((busyPeak[0] ?? 0) !== 0) {
    problems.push(`the ghost has ${busyPeak[0]} threads running code, and its point is that none are`);
  }

  // --- the lanes ------------------------------------------------------------

  for (const ride of rides) {
    const wantY =
      ride.lane === 'in'
        ? [Y_REQUESTS_BOTTOM, Y_THREADS_TOP]
        : [Y_THREADS_BOTTOM, Y_IO_TOP];
    if (!wantY.includes(ride.from) || !wantY.includes(ride.to)) {
      problems.push(`a ${ride.kind} leg at ${ride.startAt} does not end on a box edge`);
    }
    if (ride.startAt < 0 || lastSeen(ride) > SCENE_DURATION) {
      problems.push(`a traveller runs off the end of the scene at ${ride.startAt}`);
    }
  }

  // Two travellers on one lane, measured rather than assumed, and measured
  // across directions because both lanes carry traffic each way.
  let closest = Infinity;
  let closestName = '';
  for (const lane of ['in', 'io'] as const) {
    const onLane = rides.filter((entry) => entry.lane === lane);
    for (let a = 0; a < onLane.length; a += 1) {
      for (let b = a + 1; b < onLane.length; b += 1) {
        const left = onLane[a];
        const right = onLane[b];
        if (!left || !right) continue;
        const from = Math.max(left.startAt, right.startAt);
        const to = Math.min(lastSeen(left), lastSeen(right));
        if (to <= from) continue;
        for (let t = from; t <= to + EPS; t = round(t + 0.01)) {
          const apart = Math.abs(whereAt(left, t) - whereAt(right, t));
          if (apart < closest) {
            closest = apart;
            closestName = `${lane}: ${left.kind}@${left.startAt} and ${right.kind}@${right.startAt} at ${round(t)}`;
          }
        }
      }
    }
  }
  if (closest < HALO - EPS) {
    problems.push(`two travellers come ${closest.toFixed(0)}px apart (${closestName})`);
  }

  // --- the cues -------------------------------------------------------------

  fixed.sort((left, right) => left[0] - right[0]);
  const cues: [number, SceneCue][] = [];
  for (const entry of fixed) {
    const previous = cues.at(-1);
    if (previous && previous[0] === entry[0]) continue;
    cues.push(entry);
  }
  cues.forEach(([at], index) => {
    if (BOUNDARIES.some((edge) => Math.abs(at - edge) < BOUNDARY_GAP - EPS)) {
      problems.push(`a cue at ${at} sits on a step boundary`);
    }
    const previous = cues[index - 1]?.[0];
    if (previous !== undefined && at - previous < MIN_CUE_GAP - EPS) {
      problems.push(`cues at ${previous} and ${at} are on top of each other`);
    }
  });

  // --- the boundaries and the two end frames --------------------------------

  for (const edge of BOUNDARIES) {
    for (const ride of rides) {
      if (ride.startAt < edge - EPS && lastSeen(ride) > edge + EPS) {
        problems.push(`something is in flight on the boundary at ${edge}`);
      }
    }
    if (valueAt('stage', 'data-iocp-mark', edge) !== 'none') {
      problems.push(`a highlight is up on the boundary at ${edge}`);
    }
    for (const id of SLOT_IDS) {
      const state = valueAt(id, 'data-iocp-slot', edge);
      if (state !== 'free') problems.push(`${id} reads ${state} on the boundary at ${edge}`);
    }
    for (const id of BAR_IDS) {
      if (valueAt(id, 'data-iocp-bar', edge) !== 'off') {
        problems.push(`${id} is running on the boundary at ${edge}`);
      }
    }
    if (valueAt('stage', 'data-iocp-port', edge) !== '0') {
      problems.push(`the port is not empty on the boundary at ${edge}`);
    }
    if (valueAt('stage', 'data-iocp-backlog', edge) !== '0') {
      problems.push(`the backlog is not empty on the boundary at ${edge}`);
    }
  }
  if (valueAt('stage', 'data-iocp-mode', SCENE_DURATION) !== 'port') {
    problems.push('the scene does not end in port mode');
  }
  if (valueAt('stage', 'data-iocp-limit', SCENE_DURATION) !== 'on') {
    problems.push('the scene does not end with the gate on');
  }
  if (valueAt('stage', 'data-iocp-settled', SCENE_DURATION) !== 'on') {
    problems.push('the scene does not end settled');
  }

  // Once the gate is on the queue only ever drains.
  let held = Number(valueAt('stage', 'data-iocp-port', LIMIT_AT));
  for (const change of changes) {
    if (change.name !== 'data-iocp-port' || change.at < LIMIT_AT - EPS) continue;
    const value = Number(change.value);
    if (value > held) problems.push(`${change.at} the queue grew to ${value} with the gate on`);
    held = value;
  }

  if (problems.length > 0) throw new Error(`${ID} scene: ${[...new Set(problems)].join('; ')}`);

  rides.sort((left, right) => left.startAt - right.startAt);
  return {
    changes,
    cues,
    rides,
    operations,
    inFlightPeak,
    busyPeak,
    slotsUsed,
    portPeak,
    backlogPeak,
  };
}

// --- the timeline ----------------------------------------------------------

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);
  const sim = simulate();

  // The captions name the figures the model produced. Nothing here places them:
  // if the schedule changes, this is what says the captions have stopped
  // describing the scene.
  if (sim.inFlightPeak[2] !== 6 || sim.slotsUsed[2]?.size !== 2) {
    throw new Error(`${ID} scene: the third step promises six operations and two threads`);
  }
  if (sim.backlogPeak === 0) {
    throw new Error(`${ID} scene: the first step promises a queue growing behind idle threads`);
  }
  if (sim.operations.filter((op) => op.kind === 'trap' && op.okAt > 0).length !== 1) {
    throw new Error(`${ID} scene: the fourth step promises exactly one thread taken back`);
  }

  const targets = new Map<string, Element>();
  targets.set('stage', stage);
  for (const id of SLOT_IDS) targets.set(id, q<SVGGElement>(stage, `.iocp-slot--${id}`, ID));
  for (const id of BAR_IDS) targets.set(id, q<SVGGElement>(stage, `.iocp-bar--${id}`, ID));

  // Each request is one group, and every leg it travels is a tween on it.
  const legs = new Map<number, Ride[]>();
  for (const ride of sim.rides) {
    const list = legs.get(ride.request) ?? [];
    list.push(ride);
    legs.set(ride.request, list);
  }
  const riders = [...legs.keys()].sort((left, right) => left - right);
  const parts = mountRequests(layer, riders.length, ID);

  const tl = createSceneTimeline();

  // --- everything the stage says about itself ------------------------------

  for (const change of sim.changes) {
    const target = targets.get(change.target);
    if (!target) throw new Error(`${ID} scene: nothing on the stage is called "${change.target}"`);
    attr(tl, target, change.name, change.value, change.at);
  }

  // --- what travels --------------------------------------------------------

  riders.forEach((request, index) => {
    const group = parts[index];
    const list = legs.get(request);
    if (!group || !list) return;

    const first = list[0];
    if (!first) return;
    const op = sim.operations[request];
    group.group.classList.add(`iocp-req--${op?.kind === 'trap' ? 'trap' : 'work'}`);

    parkRequest(group, X_LANE, first.from);

    for (const ride of list) {
      // Each leg starts where it starts: a request that spent the last second
      // inside a box is put back on the lane rather than sliding across it.
      tl.set(group.group, { y: ride.from, opacity: 1, immediateRender: false }, ride.startAt);
      tl.to(
        group.group,
        { y: ride.to, duration: ride.leg, ease: 'none', immediateRender: false },
        ride.startAt,
      );
      if (ride.marks) markRequest(tl, group, 'ok', ride.startAt);
      const ends = round(ride.startAt + ride.leg);
      if (ride.fades) hideRequest(tl, group, ends, FADE);
      else tl.set(group.group, { opacity: 0, immediateRender: false }, ends);
    }
    // A ghost request is taken away with the world it was drawn in.
    const last = list.at(-1);
    if (last && !last.fades && op?.kind === 'block') {
      showRequest(tl, group, last.startAt);
    }
  });

  // --- sound ---------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels ---------------------------------------------------------

  // The stage is complete on the first frame: four free slots, six idle bars, an
  // empty port, `ok 0`, no backlog, no gate and nothing in flight.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
