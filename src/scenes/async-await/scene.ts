import {
  AXIS_UNIT,
  CODE_ROW_Y,
  CONT_RISE,
  CONT_X,
  IO_BAR_W,
  LANE_Y,
  MS,
  PLANS,
  SCENE_DURATION,
  SPEED,
  STAGE_STATE,
  X_LANE,
  Y_CALLER,
  Y_IO,
  Y_LOST,
} from './stage';
import type { CodePlan } from './stage';
import { q, qa } from '../shared/dom';
import {
  attachToRequest,
  hideRequest,
  markRequest,
  mountRequests,
  parkRequest,
  showRequest,
} from '../shared/request';
import type { RequestResult } from '../shared/request';
import { collapseAtInstant, createScheduler } from '../shared/simulation';
import { attr, fadeAt, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Async/Await scene: a 24 second, four step timeline.
 *
 * Same two rules as the other scenes: every tween sits at an absolute position,
 * and every discrete change is a zero-duration tween on a `data-*` attribute
 * that GSAP reverts when the playhead moves back past it.
 *
 * Nothing on this stage is placed by hand. The scene is told six things — the
 * five snippets in `stage.ts`, each line's cost in milliseconds, and the six
 * instants a caller invokes one of them — and one interpreter walks them. It
 * moves the cursor down the rows, spends each line's cost on whichever lane it
 * holds, and at an `await` it starts the I/O, hands the Task back, and lets the
 * lane go. When the I/O finishes it books a continuation on whatever lane is
 * free then, which is the whole of step 1: the continuation prefers the lane
 * the method did *not* start on, so the reader sees it land somewhere else.
 *
 * The three things that go wrong come out of the same interpreter rather than
 * being drawn. `.Result` is a line that starts the I/O and keeps the lane, so
 * when the continuation is booked the only lane a single threaded context may
 * use is the one that is blocked, and there is nowhere to put it: that is the
 * deadlock, and the interpreter finds it by looking for a free lane and failing.
 * `async void` is a plan that returns no Task, so when its `throw` line runs
 * there is no route back to the Caller and the exception falls instead of
 * rising. Cancellation is an instant that lands inside an I/O window: the bar
 * stops at the fraction of the work that had been done, which is why the
 * cancelled bar is short and the failed one is shorter.
 *
 * The two measured rows are read off the same numbers as the I/O bars. Two
 * 300 ms calls awaited one after another draw one bar after the other and add
 * up to 600 ms; the same two calls started together draw two bars from the same
 * origin and stop at 300. Nothing writes 600 or 300 into a width.
 *
 * One compression of time, `MS` scene seconds to the millisecond, so a call
 * that takes twice as long looks twice as long. Every label keeps the real
 * value: `600 ms` is a real 600 ms drawn over 1.5 scene seconds.
 *
 * The snippet in the Method changes between steps, which is the one cut in the
 * scene. It is made quiet rather than hidden: the swap happens 0.08s before the
 * step label, with the code dimmed either side of it, and it is only ever
 * scheduled at an instant when no lane is running, no I/O is outstanding and
 * nothing is travelling. No identity is carried across it — each snippet is a
 * fresh call from the Caller, not a continuation of the last one.
 */

const ID = 'async-await';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- what a call looks like from outside ----------------------------------

/** Seconds a continuation takes to drop onto its lane. */
const DROP = 0.12;
/** How long a continuation that cannot land keeps trying before it is marked. */
const SPIN = 0.8;
/** How long the deadlock stays up before the stage is cleared for the next one. */
const SPIN_HOLD = 0.44;
/** How long an I/O bar keeps its result before it is cleared for the next call. */
const IO_HOLD = 0.6;
/** How long a result marker stays before its traveller fades. */
const FADE = 0.2;
/** How long the code is dimmed either side of a snippet swap. */
const DIM = 0.12;
/** How much of the process boundary flash the unhandled exception gets. */
const FLASH = 0.4;

/** Seconds it takes to travel between two stops on the trunk. */
const travel = (from: number, to: number): number => round(Math.abs(to - from) / SPEED);

// --- what the scene is told -----------------------------------------------

interface Runner {
  /** When the Caller invokes, and which snippet it invokes. */
  at: number;
  plan: string;
  /** When the Method's snippet becomes this one. Omitted for the first. */
  swapAt?: number;
  /** The Caller passes a token and can cancel with it. */
  token?: boolean;
  /** The Caller has a catch ready for whatever comes back up. */
  arms?: boolean;
  /** The instant the Caller cancels, and the instant the dependency fails. */
  cancelAt?: number;
  failAt?: number;
}

/**
 * The six calls. Everything else on the stage is worked out from these and
 * from the per-line costs in `stage.ts`.
 */
const CALLS: Runner[] = [
  { at: 0.4, plan: 's1' },
  { at: 6.3, plan: 's2', swapAt: 5.92 },
  { at: 12.15, plan: 's3a', swapAt: 11.92 },
  { at: 15.4, plan: 's3b', swapAt: 15.1 },
  { at: 18.4, plan: 's4', swapAt: 17.92, token: true, arms: true, cancelAt: 19.6 },
  { at: 21.2, plan: 's4', token: true, arms: true, failAt: 22.0 },
];

// --- what the simulation produces -----------------------------------------

interface AttrChange {
  at: number;
  key: string;
  name: string;
  value: string;
}

interface Leg {
  at: number;
  to: number;
  duration: number;
}

interface Mover {
  x: number;
  from: number;
  showAt: number;
  legs: Leg[];
  label?: string;
  diamond?: boolean;
  /** A continuation with nowhere to land keeps knocking on the lane. */
  bob?: { at: number; to: number; cycle: number; repeat: number };
  mark?: RequestResult;
  markAt?: number;
  hideAt: number;
}

interface BarSweep {
  /** Index of the bar, and the width it reaches. */
  index: number;
  from: number;
  to: number;
  width: number;
}

interface Simulation {
  attrs: AttrChange[];
  movers: Mover[];
  ioBars: BarSweep[];
  ioClears: { index: number; at: number }[];
  axisBars: BarSweep[];
  busy: [number, number][];
  dims: number[];
  cues: [number, SceneCue][];
}

type LaneState = 'idle' | 'running' | 'blocked';
type Outcome = 'done' | 'cancelled' | 'failed';

// --- the simulation -------------------------------------------------------

function simulate(): Simulation {
  const raw: AttrChange[] = [];
  const movers: Mover[] = [];
  const ioBars: BarSweep[] = [];
  const ioClears: { index: number; at: number }[] = [];
  const axisBars: BarSweep[] = [];
  const busy: [number, number][] = [];
  const dims: number[] = [];
  const cues: [number, SceneCue][] = [];

  const setAttr = (at: number, key: string, name: string, value: string): void => {
    raw.push({ at: round(at), key, name, value });
  };
  const cue = (at: number, name: SceneCue): void => {
    cues.push([round(at), name]);
  };

  const lanes: LaneState[] = ['idle', 'idle'];
  const setLane = (at: number, lane: number, state: LaneState): void => {
    if (lanes[lane] === state) return;
    lanes[lane] = state;
    setAttr(at, `lane-${lane + 1}`, 'data-lane-state', state);
  };

  const { schedule, drain } = createScheduler();

  /** A traveller on the trunk that is absorbed where it lands. */
  const trunkMover = (from: number, to: number, at: number, label?: string): Mover => {
    const duration = travel(from, to);
    const mover: Mover = {
      x: X_LANE,
      from,
      showAt: round(at),
      legs: [{ at: round(at), to, duration }],
      label,
      hideAt: round(at + duration),
    };
    movers.push(mover);
    return mover;
  };

  /**
   * One outstanding call. The bar stops where the work got to, which is the
   * whole of it: a cancellation that lands a third of the way through leaves a
   * bar a third of the way across.
   */
  function startIo(
    runner: Runner,
    io: number,
    at: number,
    ms: number,
    axis: number | undefined,
    onEnd: (endAt: number, outcome: Outcome) => void,
  ): { endAt: number; outcome: Outcome } {
    const full = round(at + ms * MS);
    let endAt = full;
    let outcome: Outcome = 'done';
    if (runner.cancelAt !== undefined && runner.cancelAt > at && runner.cancelAt < full) {
      endAt = round(runner.cancelAt);
      outcome = 'cancelled';
    }
    if (runner.failAt !== undefined && runner.failAt > at && runner.failAt < full) {
      endAt = round(runner.failAt);
      outcome = 'failed';
    }
    const done = (endAt - at) / (full - at);

    setAttr(at, `io-${io + 1}`, 'data-work', 'running');
    ioBars.push({ index: io, from: at, to: endAt, width: round(IO_BAR_W * done) });
    if (axis !== undefined) {
      axisBars.push({ index: axis, from: at, to: endAt, width: round(AXIS_UNIT * done) });
    }

    schedule(endAt, () => {
      setAttr(endAt, `io-${io + 1}`, 'data-work', outcome);
      if (outcome === 'failed') cue(endAt, 'failure');
      const clearAt = round(endAt + IO_HOLD);
      ioClears.push({ index: io, at: clearAt });
      setAttr(clearAt, `io-${io + 1}`, 'data-work', 'idle');
      onEnd(endAt, outcome);
    });

    // The end is known the moment the call leaves, which is what lets a
    // `WhenAll` know now which of the calls it is waiting on will be last.
    return { endAt, outcome };
  }

  // --- one call, walked line by line --------------------------------------

  function run(runner: Runner): void {
    const plan = PLANS[runner.plan] as CodePlan;
    let lane = 0;
    let taskShown = false;
    let pendingSince = 0;

    /**
     * The dot standing on the trunk beside the row the thread is reading. It
     * arrives with the call, slides down as the cursor does, and is released
     * into the I/O by the line that makes the call, so there is never a second
     * dot on the trunk to run into it.
     */
    let carrier: Mover | null = null;
    let carrierY = 0;

    /** Sends the carrier somewhere, or makes a fresh dot when there is none. */
    const send = (from: number, to: number, at: number): void => {
      const duration = travel(from, to);
      if (carrier && carrierY === from) {
        carrier.legs.push({ at, to, duration });
        carrier.hideAt = round(at + duration);
        carrier = null;
        return;
      }
      if (carrier) {
        carrier.hideAt = at;
        carrier = null;
      }
      trunkMover(from, to, at, runner.token ? 'ct' : undefined);
    };

    /** Absorbs the carrier where it stands, for a line that calls nothing. */
    const park = (at: number): void => {
      if (!carrier) return;
      carrier.hideAt = at;
      carrier = null;
    };

    /** Frees the lane and hands the unfinished Task back to the Caller. */
    const yieldThread = (at: number): void => {
      if (plan.returnsTask && !taskShown) {
        taskShown = true;
        pendingSince = at;
        setAttr(at, 'stage', 'data-task', 'pending');
        cue(at, 'state');
      }
      setLane(at, lane, 'idle');
      cue(at, 'trip');
    };

    /** Closes the call out: the Task is settled and the lane is given back. */
    const settle = (at: number, value: string, sound: SceneCue): void => {
      setLane(at, lane, 'idle');
      setAttr(at, 'stage', 'data-line', 'none');
      if (plan.returnsTask) {
        setAttr(at, 'stage', 'data-task', value);
        cue(at, sound);
        if (taskShown) busy.push([pendingSince, round(at)]);
      }
    };

    /** Books the rest of the method on whatever lane is free when it lands. */
    function resume(at: number, next: number, outcome: Outcome): void {
      cue(at, 'state');
      const other = 1 - lane;
      const allowed = plan.singleThreaded ? [lane] : [other, lane];
      const free = allowed.find((index) => lanes[index] === 'idle');

      if (free === undefined) {
        // Nowhere to run: the only lane this context may use is blocked.
        const spinTo = round(at + SPIN);
        movers.push({
          x: CONT_X,
          from: (LANE_Y[lane] ?? 0) - CONT_RISE,
          showAt: at,
          legs: [],
          label: 'continuation',
          bob: { at, to: 14, cycle: SPIN / 4, repeat: 3 },
          mark: 'fail',
          markAt: spinTo,
          hideAt: round(spinTo + SPIN_HOLD),
        });
        setAttr(spinTo, 'stage', 'data-deadlock', 'on');
        cue(spinTo, 'failure');
        const clear = round(spinTo + SPIN_HOLD);
        schedule(clear, () => {
          setAttr(clear, 'stage', 'data-deadlock', 'off');
          setAttr(clear, 'stage', 'data-line', 'none');
          setLane(clear, lane, 'idle');
        });
        return;
      }

      const landAt = round(at + DROP);
      const laneY = LANE_Y[free] ?? 0;
      lane = free;

      if (outcome === 'done') {
        movers.push({
          x: CONT_X,
          from: laneY - CONT_RISE,
          showAt: at,
          legs: [{ at, to: laneY, duration: DROP }],
          label: 'continuation',
          hideAt: 0,
        });
        const mover = movers[movers.length - 1] as Mover;
        setLane(landAt, free, 'running');
        cue(landAt, 'state');
        schedule(landAt, () => step(next, landAt, mover));
        return;
      }

      // The continuation runs only to rethrow what the await was waiting on.
      movers.push({
        x: CONT_X,
        from: laneY - CONT_RISE,
        showAt: at,
        legs: [{ at, to: laneY, duration: DROP }],
        label: 'continuation',
        hideAt: round(landAt + 0.06),
      });
      setLane(landAt, free, 'running');
      cue(landAt, 'state');
      schedule(landAt, () => rethrow(landAt, outcome));
    }

    /** Carries a cancellation or a failure up the awaits to the Caller. */
    function rethrow(at: number, outcome: Outcome): void {
      const leaveAt = round(at + 0.06);
      const row = CODE_ROW_Y[0] ?? 0;
      const up = travel(Y_IO, row);
      const home = travel(row, Y_CALLER);
      const atRow = round(leaveAt + up);
      const arriveAt = round(atRow + home);
      movers.push({
        x: X_LANE,
        from: Y_IO,
        showAt: leaveAt,
        legs: [
          { at: leaveAt, to: row, duration: up },
          { at: atRow, to: Y_CALLER, duration: home },
        ],
        label: outcome === 'cancelled' ? 'cancelled' : 'throw',
        diamond: true,
        hideAt: arriveAt,
      });
      schedule(arriveAt, () => {
        if (outcome === 'cancelled') {
          settle(arriveAt, 'cancelled', 'state');
          return;
        }
        settle(arriveAt, 'faulted', 'state');
        if (runner.arms) {
          setAttr(arriveAt, 'stage', 'data-catch', 'caught');
          cue(arriveAt, 'success');
        }
      });
    }

    /** Runs one line: the cursor moves to it, then it costs what it costs. */
    function step(index: number, at: number, arrived?: Mover): void {
      const row = plan.lines[index];
      if (!row) {
        if (arrived) arrived.hideAt = at;
        park(at);
        settle(at, 'done', 'success');
        return;
      }
      setAttr(at, 'stage', 'data-line', String(index));
      cue(at, 'state');
      const rowY = CODE_ROW_Y[index] ?? 0;
      if (carrier && carrierY !== rowY) {
        carrier.legs.push({ at, to: rowY, duration: travel(carrierY, rowY) });
        carrierY = rowY;
      }
      const actAt = round(at + row.run * MS);
      if (arrived) arrived.hideAt = actAt;
      schedule(actAt, () => act(index, actAt));
    }

    /** What the line does once the thread has finished reading it. */
    function act(index: number, at: number): void {
      const row = plan.lines[index];
      if (!row) return;
      const rowY = CODE_ROW_Y[index] ?? 0;
      const calls = row.calls ?? [];

      if (row.kind === 'plain') {
        step(index + 1, at);
        return;
      }

      if (row.kind === 'return') {
        park(at);
        settle(at, 'done', 'success');
        return;
      }

      if (row.kind === 'throw') {
        park(at);
        if (plan.returnsTask) {
          rethrow(at, 'failed');
          return;
        }
        // Nothing awaited this method, so the exception has nowhere to go.
        const fall = travel(rowY, Y_LOST);
        movers.push({
          x: X_LANE,
          from: rowY,
          showAt: at,
          legs: [{ at, to: Y_LOST, duration: fall }],
          label: 'lost',
          diamond: true,
          mark: 'fail',
          markAt: round(at + fall),
          hideAt: round(at + fall + FADE),
        });
        setAttr(at, 'stage', 'data-unhandled', 'on');
        setAttr(round(at + FLASH), 'stage', 'data-unhandled', 'off');
        cue(at, 'failure');
        setLane(at, lane, 'idle');
        setAttr(round(at + fall), 'stage', 'data-line', 'none');
        return;
      }

      if (row.kind === 'start') {
        // Both calls leave on one line and without an await, so the lane is
        // still held and one dot carries both of them to the I/O.
        send(rowY, Y_IO, at);
        for (const call of calls) {
          outstanding.push(startIo(runner, call.io, at, call.ms, call.axis, () => undefined));
        }
        step(index + 1, at);
        return;
      }

      if (row.kind === 'whenall') {
        park(at);
        yieldThread(at);
        const last = outstanding.reduce((left, right) => (right.endAt > left.endAt ? right : left), {
          endAt: at,
          outcome: 'done' as Outcome,
        });
        outstanding.length = 0;
        schedule(last.endAt, () => resume(last.endAt, index + 1, last.outcome));
        return;
      }

      const call = calls[0];
      if (!call) {
        step(index + 1, at);
        return;
      }

      send(rowY, Y_IO, at);

      if (row.kind === 'block') {
        // `.Result` keeps the thread while the I/O runs, doing nothing with it.
        setLane(at, lane, 'blocked');
        cue(at, 'state');
        startIo(runner, call.io, at, call.ms, call.axis, (endAt, outcome) =>
          resume(endAt, index + 1, outcome),
        );
        return;
      }

      yieldThread(at);
      startIo(runner, call.io, at, call.ms, call.axis, (endAt, outcome) =>
        resume(endAt, index + 1, outcome),
      );
    }

    const outstanding: { endAt: number; outcome: Outcome }[] = [];

    // The call itself: one traveller from the Caller to the first row.
    const firstRow = CODE_ROW_Y[0] ?? 0;
    const down = travel(Y_CALLER, firstRow);
    const arriveAt = round(runner.at + down);
    carrier = {
      x: X_LANE,
      from: Y_CALLER,
      showAt: runner.at,
      legs: [{ at: runner.at, to: firstRow, duration: down }],
      label: runner.token ? 'ct' : undefined,
      hideAt: arriveAt,
    };
    carrierY = firstRow;
    movers.push(carrier);

    // Whatever the last call left in the Caller is cleared before this one is
    // made, so a Task chip is only ever the Task of the call on screen.
    const readyAt = round(runner.swapAt ?? runner.at - 0.3);
    setAttr(readyAt, 'stage', 'data-task', 'none');
    if (runner.swapAt !== undefined) {
      const swapAt = round(runner.swapAt);
      dims.push(swapAt);
      setAttr(swapAt, 'stage', 'data-code', plan.id);
      cue(swapAt, 'trip');
    }
    setAttr(readyAt, 'stage', 'data-token', runner.token ? 'on' : 'off');
    setAttr(readyAt, 'stage', 'data-catch', runner.arms ? 'armed' : 'off');
    if (runner.token) cue(readyAt, 'state');
    if (runner.cancelAt !== undefined) {
      const cancelAt = round(runner.cancelAt);
      schedule(cancelAt, () => {
        setAttr(cancelAt, 'stage', 'data-token', 'cancelled');
        cue(cancelAt, 'trip');
      });
    }

    schedule(arriveAt, () => {
      const free = lanes.findIndex((state) => state === 'idle');
      lane = free < 0 ? 0 : free;
      setLane(arriveAt, lane, 'running');
      step(0, arriveAt);
    });
  }

  for (const runner of CALLS) schedule(runner.at, () => run(runner));
  drain();

  // The two measured rows are read off the bars they drew, not written down.
  const seqDone = axisBars
    .filter((bar) => bar.index < 2)
    .reduce((latest, bar) => Math.max(latest, bar.to), 0);
  const concDone = axisBars
    .filter((bar) => bar.index >= 2)
    .reduce((latest, bar) => Math.max(latest, bar.to), 0);
  if (seqDone > 0) {
    setAttr(seqDone, 'stage', 'data-seq', 'on');
    cue(seqDone, 'state');
  }
  if (concDone > 0) {
    setAttr(concDone, 'stage', 'data-conc', 'on');
    cue(concDone, 'state');
  }

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
  const deduped: [number, SceneCue][] = [];
  const heard = new Set<string>();
  for (const entry of cues) {
    const id = `${entry[0]}@${entry[1]}`;
    if (heard.has(id)) continue;
    heard.add(id);
    deduped.push(entry);
  }

  return { attrs, movers, ioBars, ioClears, axisBars, busy, dims, cues: deduped };
}

// --- the timeline ---------------------------------------------------------

/** Grows a bar from one width to another, starting at an absolute position. */
function growBar(
  tl: gsap.core.Timeline,
  element: Element,
  from: number,
  to: number,
  at: number,
  duration: number,
): void {
  if (duration <= 0) {
    tl.set(element, { attr: { width: to }, immediateRender: false }, at);
    return;
  }
  tl.fromTo(
    element,
    { attr: { width: from } },
    { attr: { width: to }, duration, ease: 'none', immediateRender: false },
    at,
  );
}

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const targets: Record<string, Element> = { stage };
  for (let index = 1; index <= 2; index += 1) {
    targets[`lane-${index}`] = q<SVGGElement>(stage, `.aw-lane--${index}`, ID);
    targets[`io-${index}`] = q<SVGGElement>(stage, `.aw-io--${index}`, ID);
  }
  const ioFills = qa<SVGRectElement>(stage, '.aw-io-bar-fill');
  const axisFills = qa<SVGRectElement>(stage, '.aw-axis-fill');
  const codeGroup = q<SVGGElement>(stage, '.aw-code-group', ID);
  const busyDot = q<SVGCircleElement>(stage, '.aw-busy', ID);
  const layer = q<SVGGElement>(stage, '.scene-requests', ID);

  const sim = simulate();
  const parts = mountRequests(layer, sim.movers.length, ID);

  const tl = createSceneTimeline();

  // --- discrete state -----------------------------------------------------

  for (const change of sim.attrs) {
    const element = targets[change.key];
    if (!element) continue;
    attr(tl, element, change.name, change.value, change.at);
  }

  // --- how far each call got ----------------------------------------------

  for (const sweep of sim.ioBars) {
    const element = ioFills[sweep.index];
    if (element) growBar(tl, element, 0, sweep.width, sweep.from, sweep.to - sweep.from);
  }
  for (const clear of sim.ioClears) {
    const element = ioFills[clear.index];
    if (element) tl.set(element, { attr: { width: 0 }, immediateRender: false }, clear.at);
  }
  for (const sweep of sim.axisBars) {
    const element = axisFills[sweep.index];
    if (element) growBar(tl, element, 0, sweep.width, sweep.from, sweep.to - sweep.from);
  }

  // --- the snippet swap, dimmed either side so the cut is quiet -----------

  for (const at of sim.dims) {
    tl.to(codeGroup, { opacity: 0.16, duration: DIM, ease: 'none', immediateRender: false }, at - DIM);
    tl.to(codeGroup, { opacity: 1, duration: DIM, ease: 'none', immediateRender: false }, at);
  }

  // --- the Caller getting on with its own work ----------------------------

  for (const [from, to] of sim.busy) {
    const span = to - from;
    if (span <= 0) continue;
    const halves = Math.max(2, Math.round(span / 0.5) * 2);
    tl.fromTo(
      busyDot,
      { x: 0 },
      {
        x: 22,
        duration: span / halves,
        repeat: halves - 1,
        yoyo: true,
        ease: 'sine.inOut',
        immediateRender: false,
      },
      from,
    );
  }

  // --- travellers ---------------------------------------------------------

  sim.movers.forEach((mover, index) => {
    const item = parts[index];
    if (!item) return;
    parkRequest(item, mover.x, mover.from);
    showRequest(tl, item, mover.showAt);

    if (mover.label) {
      const label = attachToRequest(
        item,
        'text',
        { class: 'scene-req-label aw-req-label', x: '0', y: '-56', 'text-anchor': 'middle' },
        mover.label,
      );
      tl.set(label, { opacity: 1, immediateRender: false }, mover.showAt);
      tl.set(label, { opacity: 0, immediateRender: false }, mover.hideAt);
    }
    if (mover.diamond) {
      const glyph = attachToRequest(item, 'path', {
        class: 'scene-req-diamond aw-req-diamond',
        d: 'M 0 -19 L 19 0 L 0 19 L -19 0 Z',
      });
      tl.set(glyph, { opacity: 1, immediateRender: false }, mover.showAt);
      tl.set(item.dot, { opacity: 0, immediateRender: false }, mover.showAt);
      tl.set(glyph, { opacity: 0, immediateRender: false }, mover.markAt ?? mover.hideAt);
    }

    for (const leg of mover.legs) {
      tl.to(
        item.group,
        { y: leg.to, duration: leg.duration, ease: 'none', immediateRender: false },
        leg.at,
      );
    }
    if (mover.bob) {
      tl.fromTo(
        item.group,
        { y: mover.from },
        {
          y: mover.from + mover.bob.to,
          duration: mover.bob.cycle,
          repeat: mover.bob.repeat,
          yoyo: true,
          ease: 'sine.inOut',
          immediateRender: false,
        },
        mover.bob.at,
      );
    }
    if (mover.mark && mover.markAt !== undefined) markRequest(tl, item, mover.mark, mover.markAt);
    hideRequest(tl, item, mover.hideAt, fadeAt(mover.hideAt, SCENE_DURATION));
  });

  // --- sound --------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels --------------------------------------------------------

  // The stage is complete on the first frame: the Caller holding nothing, the
  // first snippet in the Method with no cursor on it, two idle lanes, two empty
  // I/O bars and two empty measured rows.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
