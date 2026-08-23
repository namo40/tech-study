import gsap from 'gsap';
import {
  BAR_W,
  BUSY_W,
  DLQ_DROP_X,
  JOB_LABELS,
  SCENE_DURATION,
  STAGE_STATE,
  WAIT_SPOTS,
  WORKER_X,
  X_BORN,
  X_STATUS,
  X_WORK,
  Y_ABOVE,
  Y_BORN,
  Y_CLIENT,
  Y_DLQ,
  Y_DROP,
  Y_FAN,
  Y_QUEUE,
  Y_WEB,
  Y_WORK,
  slotX,
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
 * Web-Queue-Worker scene: a 24 second, four step timeline.
 *
 * Same two rules as the other scenes: every tween sits at an absolute position,
 * and every discrete change is a zero-duration tween on a `data-*` attribute
 * that GSAP reverts when the playhead moves back past it.
 *
 * Nothing about the queue is authored. The scene says only when a request
 * leaves the client, whether it is a status poll, and three things about the
 * deployment: when the Web tier stops doing the work inline, when two more
 * workers arrive, and which job is the poison one. Everything the reader counts
 * falls out of that: how deep the queue gets and when, which worker takes which
 * job, how long anybody waited, which request gives up, and how far each meter
 * has filled. The Web tier and the workers run the same `JOB_TIME`, because it
 * is the same work either way — the whole scene is the difference between doing
 * it on the request thread and doing it behind a queue.
 */

const ID = 'web-queue-worker';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- how long a leg takes -------------------------------------------------

/** Client box to the Web box, and back. */
const TO_WEB = 0.3;
const TO_HOME = 0.3;
/** Client box to a waiting place above the Web box, and out of one. */
const TO_WAIT = 0.15;
const WAIT_TO_WEB = 0.15;
const WAIT_HOME = 0.15;

/** How long a request stands above the Web box before the user gives up. */
const WAIT_TIMEOUT = 1.6;
/** A longer wait than this comes back ringed, even though it succeeded. */
const LATE_WAIT = 0.8;

/** The work itself, whether the Web tier runs it or a worker does. */
const JOB_TIME = 1.5;
/** What accepting a job costs the Web tier, once it stops running the work. */
const ACCEPT = 0.1;

/**
 * Request slots the Web tier has. An accept takes one of them for as long as
 * the request is inside the tier; work run on the request thread takes all of
 * them, because nothing else gets in while it runs. The `busy` meter is that
 * number over this one, so the meter and the queueing rule can never disagree.
 */
const WEB_SLOTS = 6;

// --- how long a job chip takes --------------------------------------------

/** Web box to a queue slot, in two legs so no chip crosses another. */
const CHIP_DROP = 0.15;
const CHIP_SETTLE = 0.1;
const CHIP_TO_QUEUE = CHIP_DROP + CHIP_SETTLE;
/** Queue to a worker: out along the fan, then down the worker's own lane. */
const CHIP_FAN = 0.22;
const CHIP_IN = 0.13;
const CHIP_TO_WORKER = CHIP_FAN + CHIP_IN;
/** Worker to the dead-letter queue: back up, across, and down the far column. */
const DLQ_UP = 0.12;
const DLQ_ACROSS = 0.16;
const DLQ_DOWN = 0.17;
/** How long a chip takes to slide one place along the queue. */
const CHIP_SHIFT = 0.15;
/** How long a finished chip takes to go. */
const CHIP_FADE = 0.25;

/** How long a worker takes to notice the job at the head of the queue. */
const PICKUP = 0.15;
/** How far into a job the poison one throws, and how long the worker shows it. */
const FAIL_TIME = 0.85;
const FAIL_FLASH = 0.5;
/** Attempts a job gets before it is dead-lettered instead of retried. */
const MAX_ATTEMPTS = 2;
/** Which job of the burst is the poison one. */
const FAILING_JOB = 7;

/** How long a bar takes to empty once its job is over, and a meter to move. */
const BAR_DRAIN = 0.2;
const BUSY_RISE = 0.05;

// --- what the deployment does ---------------------------------------------

/** When the Web tier starts queueing the work instead of running it. */
const ASYNC_AT = 6;
/** When two more workers arrive, and how long the label says so. */
const SCALE_AT = 18;
const SCALE_HOLD = 0.5;
/** Where each step restarts the job numbering, because each starts empty. */
const RESET_AT = [ASYNC_AT, 12];

// --- what the client does -------------------------------------------------

type RequestKind = 'work' | 'status';

interface RequestPlan {
  start: number;
  kind: RequestKind;
}

const work = (start: number): RequestPlan => ({ start, kind: 'work' });
const status = (start: number): RequestPlan => ({ start, kind: 'status' });

const REQUESTS: RequestPlan[] = [
  // Step 1: four requests against a tier that runs the work on the request.
  work(0.4),
  work(0.8),
  work(1.2),
  work(3.4),
  // Step 2: the same requests, accepted and queued, plus two status polls.
  work(6.3),
  work(6.9),
  work(7.9),
  status(8.3),
  work(9.0),
  status(9.7),
  // Step 3: a burst of twelve, one every 0.15s.
  ...Array.from({ length: 12 }, (_value, i) => work(round(12.3 + i * 0.15))),
];

// --- what the simulation produces ------------------------------------------

/** One leg of something moving: where it goes, and how long it takes. */
interface Move {
  at: number;
  x: number;
  y: number;
  duration: number;
}

interface RequestOutcome {
  moves: Move[];
  /** Marker the request ends on, or null when it only carries a label. */
  result: RequestResult | null;
  markAt: number;
  homeAt: number;
  /** Stood above the Web box for longer than a moment. */
  late: boolean;
  /** The `202`, `pending` or `done` a response carries, and which side it sits. */
  code: string | null;
  codeAt: number;
  codeSide: 'left' | 'right';
}

interface ChipOutcome {
  moves: Move[];
  showAt: number;
  /** When the chip fades, or null for one that stays in the dead-letter queue. */
  fadeAt: number | null;
  states: [number, string][];
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

interface Simulation {
  requests: RequestOutcome[];
  chips: ChipOutcome[];
  attrs: AttrChange[];
  bars: Segment[][];
  busy: Segment[];
  cues: [number, SceneCue][];
}

// --- meters ----------------------------------------------------------------

/**
 * A worker's progress bar as one continuous line: it fills over the run, drains
 * once the run is over, and sits at nothing in between. Returning the whole
 * curve rather than key frames is what keeps every frame of it derived.
 */
function barCurve(runs: readonly { from: number; to: number; peak: number }[], end: number): Segment[] {
  const segments: Segment[] = [];
  let at = 0;
  runs.forEach((run, index) => {
    if (run.from > at) segments.push({ from: at, to: run.from, vFrom: 0, vTo: 0 });
    segments.push({ from: run.from, to: run.to, vFrom: 0, vTo: run.peak });
    const next = runs[index + 1]?.from ?? end;
    const drained = Math.min(round(run.to + BAR_DRAIN), next);
    segments.push({ from: run.to, to: drained, vFrom: run.peak, vTo: 0 });
    at = drained;
  });
  if (at < end) segments.push({ from: at, to: end, vFrom: 0, vTo: 0 });
  return segments;
}

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
    const until = Math.min(round(time + BUSY_RISE), series[index + 1]?.[0] ?? end);
    segments.push({ from: time, to: until, vFrom: value, vTo: next });
    value = next;
    at = until;
  });
  if (at < end) segments.push({ from: at, to: end, vFrom: value, vTo: value });
  return segments;
}

// --- the simulation --------------------------------------------------------

interface Job {
  chip: number;
  attempts: number;
  reserved: boolean;
  /** The worker that ran the last attempt, which does not get the next one. */
  lastWorker: number;
  doneAt: number | null;
  landAt: number;
  slot: number;
}

type WorkerState = 'off' | 'absent' | 'idle' | 'busy' | 'fail';

function simulate(): Simulation {
  const requests: RequestOutcome[] = REQUESTS.map(() => ({
    moves: [],
    result: null,
    markAt: 0,
    homeAt: 0,
    late: false,
    code: null,
    codeAt: 0,
    codeSide: 'right',
  }));
  const chips: ChipOutcome[] = JOB_LABELS.map(() => ({
    moves: [],
    showAt: 0,
    fadeAt: null,
    states: [],
  }));
  const raw: AttrChange[] = [];
  const cues: [number, SceneCue][] = [];
  const runs: { from: number; to: number; peak: number }[][] = WORKER_X.map(() => []);
  const occupancy: [number, number][] = [];

  const setAttr = (at: number, key: string, name: string, value: string): void => {
    raw.push({ at: round(at), key, name, value });
  };
  const cue = (at: number, name: SceneCue): void => {
    cues.push([round(at), name]);
  };
  const move = (target: { moves: Move[] }, at: number, x: number, y: number, duration: number): void => {
    collapseLast(target.moves, { at: round(at), x, y, duration }, (item) => item.at);
  };

  // --- the Web tier -------------------------------------------------------

  let slots = WEB_SLOTS;
  let queueing = false;
  const waitLine: { index: number; since: number; cost: number; spot: number }[] = [];
  const spotUsed = WAIT_SPOTS.map(() => false);
  const setOccupancy = (at: number): void => {
    collapseLast<[number, number]>(occupancy, [round(at), WEB_SLOTS - slots], pairInstant);
    // Read off the same number as the meter, so the border and the bar can
    // never disagree about whether the tier has room.
    setAttr(at, 'stage', 'data-busy', slots === 0 ? 'full' : 'ok');
  };

  // --- the queue and the workers ------------------------------------------

  const queue: Job[] = [];
  const workers: { state: WorkerState; busy: boolean; reserved: boolean }[] = WORKER_X.map(
    (_x, index) => ({ state: index < 2 ? 'off' : 'absent', busy: false, reserved: false }),
  );
  let nextChip = 0;
  let jobNumber = 0;
  let tracked: Job | null = null;

  /** Jobs the burst poisons, named by the chip they were handed. */
  const poison = new Set<number>();

  const setDepth = (at: number): void => setAttr(at, 'stage', 'data-depth', String(queue.length));
  const setWorker = (at: number, index: number, state: WorkerState): void => {
    const holder = workers[index];
    if (holder) holder.state = state;
    setAttr(at, `worker-${index + 1}`, 'data-worker', state);
  };

  /** Re-seats every chip still in the queue and records the slides. */
  const reseat = (at: number): void => {
    queue.forEach((job, index) => {
      if (job.slot === index) return;
      job.slot = index;
      const chip = chips[job.chip];
      if (chip) move(chip, at, slotX(index), Y_QUEUE, CHIP_SHIFT);
    });
  };

  const { schedule, drain } = createScheduler();

  /** Hands the earliest unreserved job to the lowest idle worker, and repeats. */
  function pump(at: number): void {
    for (;;) {
      const worker = workers.findIndex(
        (item) => item.state !== 'off' && item.state !== 'absent' && !item.busy && !item.reserved,
      );
      if (worker < 0) return;
      const job = queue.find((item) => !item.reserved && item.lastWorker !== worker);
      if (!job) return;
      const holder = workers[worker];
      if (!holder) return;
      holder.reserved = true;
      job.reserved = true;
      const takeAt = round(at + PICKUP);
      schedule(takeAt, () => take(worker, job, takeAt));
    }
  }

  /** A worker takes a job: the chip leaves the queue and rides down its lane. */
  function take(index: number, job: Job, at: number): void {
    const holder = workers[index];
    const chip = chips[job.chip];
    if (!holder || !chip) return;
    queue.splice(queue.indexOf(job), 1);
    job.reserved = false;
    job.lastWorker = index;
    holder.reserved = false;
    holder.busy = true;
    setDepth(at);
    reseat(at);

    const lane = WORKER_X[index] ?? 0;
    move(chip, at, lane, Y_FAN, CHIP_FAN);
    move(chip, round(at + CHIP_FAN), lane, Y_WORK, CHIP_IN);

    const runFrom = round(at + CHIP_TO_WORKER);
    setWorker(runFrom, index, 'busy');
    chip.states.push([runFrom, 'running']);

    if (job.attempts < MAX_ATTEMPTS && poison.has(job.chip)) {
      const failAt = round(runFrom + FAIL_TIME);
      runs[index]?.push({ from: runFrom, to: failAt, peak: FAIL_TIME / JOB_TIME });
      schedule(failAt, () => {
        job.attempts += 1;
        setWorker(failAt, index, 'fail');
        cue(failAt, 'failure');
        if (job.attempts >= MAX_ATTEMPTS) {
          chip.states.push([failAt, 'dead']);
          move(chip, failAt, lane, Y_ABOVE, DLQ_UP);
          move(chip, round(failAt + DLQ_UP), DLQ_DROP_X, Y_ABOVE, DLQ_ACROSS);
          const landAt = round(failAt + DLQ_UP + DLQ_ACROSS);
          move(chip, landAt, DLQ_DROP_X, Y_DLQ, DLQ_DOWN);
          const restAt = round(landAt + DLQ_DOWN);
          setAttr(restAt, 'stage', 'data-dlq', 'on');
          cue(restAt, 'trip');
        } else {
          chip.states.push([failAt, 'queued']);
          move(chip, failAt, lane, Y_FAN, CHIP_DROP);
          move(chip, round(failAt + CHIP_DROP), slotX(0), Y_QUEUE, CHIP_SETTLE);
          const backAt = round(failAt + CHIP_TO_QUEUE);
          schedule(backAt, () => {
            queue.unshift(job);
            job.slot = 0;
            reseat(backAt);
            setDepth(backAt);
            pump(backAt);
          });
        }
        const freeAt = round(failAt + FAIL_FLASH);
        schedule(freeAt, () => {
          holder.busy = false;
          setWorker(freeAt, index, 'idle');
          pump(freeAt);
        });
      });
      return;
    }

    const doneAt = round(runFrom + JOB_TIME);
    runs[index]?.push({ from: runFrom, to: doneAt, peak: 1 });
    schedule(doneAt, () => {
      holder.busy = false;
      job.doneAt = doneAt;
      setWorker(doneAt, index, 'idle');
      chip.states.push([doneAt, 'done']);
      chip.fadeAt = doneAt;
      cue(doneAt, 'success');
      pump(doneAt);
    });
  }

  /** The Web tier accepts a job: a chip is born on the request and drops in. */
  function enqueue(at: number): Job {
    jobNumber += 1;
    const job: Job = {
      chip: nextChip,
      attempts: 0,
      reserved: false,
      lastWorker: -1,
      doneAt: null,
      landAt: round(at + CHIP_TO_QUEUE),
      slot: 0,
    };
    if (jobNumber === FAILING_JOB) poison.add(nextChip);
    if (jobNumber === 1) tracked = job;
    nextChip += 1;

    const chip = chips[job.chip];
    if (chip) chip.showAt = round(at);
    schedule(job.landAt, () => {
      queue.push(job);
      job.slot = queue.length - 1;
      if (chip) {
        move(chip, at, slotX(job.slot), Y_DROP, CHIP_DROP);
        move(chip, round(at + CHIP_DROP), slotX(job.slot), Y_QUEUE, CHIP_SETTLE);
      }
      setDepth(job.landAt);
      pump(job.landAt);
    });
    return job;
  }

  // --- the deployment itself ----------------------------------------------

  schedule(ASYNC_AT, () => {
    queueing = true;
    setWorker(ASYNC_AT, 0, 'idle');
    setWorker(ASYNC_AT, 1, 'idle');
    cue(ASYNC_AT, 'state');
    pump(ASYNC_AT);
  });
  for (const at of RESET_AT) schedule(at, () => { jobNumber = 0; });
  schedule(SCALE_AT, () => {
    setWorker(SCALE_AT, 2, 'idle');
    setWorker(SCALE_AT, 3, 'idle');
    setAttr(SCALE_AT, 'stage', 'data-scale', 'on');
    setAttr(SCALE_AT + SCALE_HOLD, 'stage', 'data-scale', 'off');
    cue(SCALE_AT, 'state');
    pump(SCALE_AT);
  });

  // --- one request at a time ----------------------------------------------

  REQUESTS.forEach((plan, index) => {
    const outcome = requests[index];
    if (!outcome) return;

    if (plan.kind === 'status') {
      const arriveAt = round(plan.start + TO_WEB);
      move(outcome, plan.start, X_STATUS, Y_WEB, TO_WEB);
      schedule(arriveAt, () => {
        slots -= 1;
        setOccupancy(arriveAt);
        const answerAt = round(arriveAt + ACCEPT);
        schedule(answerAt, () => {
          slots += 1;
          setOccupancy(answerAt);
          const watched = tracked;
          const finished = watched !== null && watched.doneAt !== null && watched.doneAt <= answerAt;
          outcome.code = finished ? 'done' : 'pending';
          outcome.codeAt = answerAt;
          outcome.codeSide = 'left';
          if (finished) {
            outcome.result = 'ok';
            outcome.markAt = answerAt;
          }
          outcome.homeAt = round(answerAt + TO_HOME);
          move(outcome, answerAt, X_STATUS, Y_CLIENT, TO_HOME);
          cue(outcome.homeAt, finished ? 'success' : 'state');
          release(answerAt);
        });
      });
      return;
    }

    // A work request finds out at the door whether the tier has room for it.
    const decideAt = round(plan.start + TO_WAIT);
    schedule(decideAt, () => {
      const cost = queueing ? 1 : WEB_SLOTS;
      if (slots >= cost) {
        slots -= cost;
        setOccupancy(decideAt);
        const arriveAt = round(plan.start + TO_WEB);
        move(outcome, plan.start, X_WORK, Y_WEB, TO_WEB);
        schedule(arriveAt, () => admit(index, arriveAt, cost, 0));
        return;
      }
      const spot = Math.max(0, spotUsed.findIndex((used) => !used));
      const place = WAIT_SPOTS[spot] ?? WAIT_SPOTS[0];
      spotUsed[spot] = true;
      waitLine.push({ index, since: decideAt, cost, spot });
      move(outcome, plan.start, place.x, place.y, TO_WAIT);

      const giveUpAt = round(decideAt + WAIT_TIMEOUT);
      schedule(giveUpAt, () => {
        const at = waitLine.findIndex((item) => item.index === index);
        if (at < 0) return;
        waitLine.splice(at, 1);
        spotUsed[spot] = false;
        outcome.result = 'fail';
        outcome.markAt = giveUpAt;
        outcome.homeAt = round(giveUpAt + WAIT_HOME);
        move(outcome, giveUpAt, X_WORK, Y_CLIENT, WAIT_HOME);
        cue(outcome.homeAt, 'failure');
      });
    });
  });

  /** A request that got in: the tier either runs the work or books it. */
  function admit(index: number, at: number, cost: number, waited: number): void {
    const outcome = requests[index];
    if (!outcome) return;
    outcome.late = waited > LATE_WAIT;

    if (cost === WEB_SLOTS) {
      const endAt = round(at + JOB_TIME);
      outcome.result = 'ok';
      outcome.markAt = endAt;
      outcome.homeAt = round(endAt + TO_HOME);
      move(outcome, endAt, X_WORK, Y_CLIENT, TO_HOME);
      schedule(endAt, () => {
        slots += cost;
        setOccupancy(endAt);
        cue(outcome.homeAt, 'success');
        release(endAt);
      });
      return;
    }

    const answerAt = round(at + ACCEPT);
    schedule(answerAt, () => {
      slots += cost;
      setOccupancy(answerAt);
      enqueue(answerAt);
      outcome.result = 'ok';
      outcome.markAt = answerAt;
      outcome.code = '202';
      outcome.codeAt = answerAt;
      outcome.homeAt = round(answerAt + TO_HOME);
      move(outcome, answerAt, X_WORK, Y_CLIENT, TO_HOME);
      cue(outcome.homeAt, 'success');
      release(answerAt);
    });
  }

  /** Lets as many waiting requests in as the tier now has room for. */
  function release(at: number): void {
    for (;;) {
      const head = waitLine[0];
      if (!head || slots < head.cost) return;
      waitLine.shift();
      spotUsed[head.spot] = false;
      slots -= head.cost;
      setOccupancy(at);
      const arriveAt = round(at + WAIT_TO_WEB);
      const waited = round(at - head.since);
      const outcome = requests[head.index];
      if (outcome) move(outcome, at, X_WORK, Y_WEB, WAIT_TO_WEB);
      schedule(arriveAt, () => admit(head.index, arriveAt, head.cost, waited));
    }
  }

  drain();

  // --- the meters, once every run is known --------------------------------

  const bars = runs.map((list) =>
    barCurve(list, SCENE_DURATION).map((segment) => ({
      from: round(segment.from),
      to: round(segment.to),
      vFrom: round(segment.vFrom * BAR_W),
      vTo: round(segment.vTo * BAR_W),
    })),
  );
  const busy = stepCurve(occupancy, SCENE_DURATION).map((segment) => ({
    from: round(segment.from),
    to: round(segment.to),
    vFrom: round((segment.vFrom / WEB_SLOTS) * BUSY_W),
    vTo: round((segment.vTo / WEB_SLOTS) * BUSY_W),
  }));

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

  return { requests, chips, attrs, bars, busy, cues };
}

// --- the timeline ----------------------------------------------------------

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const targets: Record<string, Element> = { stage };
  for (let index = 1; index <= WORKER_X.length; index += 1) {
    targets[`worker-${index}`] = q<SVGGElement>(stage, `.wqw-worker--${index}`, ID);
  }
  const barFills = qa<SVGRectElement>(stage, '.wqw-bar-fill');
  const busyFill = q<SVGRectElement>(stage, '.wqw-busy-fill', ID);
  const chipEls = qa<SVGGElement>(stage, '.wqw-chip');
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

  // --- the meters ---------------------------------------------------------

  const widen = (element: Element, segment: { from: number; to: number; vFrom: number; vTo: number }): void => {
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
  sim.bars.forEach((segments, index) => {
    const element = barFills[index];
    if (!element) return;
    for (const segment of segments) widen(element, segment);
  });
  for (const segment of sim.busy) widen(busyFill, segment);

  // --- job chips ----------------------------------------------------------

  sim.chips.forEach((chip, index) => {
    const element = chipEls[index];
    if (!element) return;
    gsap.set(element, { x: X_BORN, y: Y_BORN, opacity: 0 });
    if (chip.moves.length === 0) return;

    tl.set(element, { opacity: 1, immediateRender: false }, chip.showAt);
    for (const step of chip.moves) {
      tl.to(
        element,
        { x: step.x, y: step.y, duration: step.duration, ease: 'none', immediateRender: false },
        step.at,
      );
    }
    let held = 'queued';
    for (const [at, state] of chip.states) {
      if (state === held) continue;
      held = state;
      attr(tl, element, 'data-chip', state, at);
    }
    if (chip.fadeAt !== null) {
      tl.to(element, { opacity: 0, duration: CHIP_FADE, immediateRender: false }, chip.fadeAt);
    }
  });

  // --- requests -----------------------------------------------------------

  REQUESTS.forEach((plan, index) => {
    const item = parts[index];
    const outcome = sim.requests[index];
    if (!item || !outcome) return;

    const lane = plan.kind === 'status' ? X_STATUS : X_WORK;
    item.group.setAttribute('data-kind', plan.kind);
    parkRequest(item, lane, Y_CLIENT);
    showRequest(tl, item, plan.start);

    for (const step of outcome.moves) {
      tl.to(
        item.group,
        { x: step.x, y: step.y, duration: step.duration, ease: 'none', immediateRender: false },
        step.at,
      );
    }

    if (outcome.code !== null) {
      const left = outcome.codeSide === 'left';
      const label = attachToRequest(
        item,
        'text',
        {
          class: 'scene-req-code wqw-req-code',
          x: left ? '-30' : '30',
          y: '8',
          'text-anchor': left ? 'end' : 'start',
        },
        outcome.code,
      );
      tl.set(label, { opacity: 1, immediateRender: false }, outcome.codeAt);
    }

    if (outcome.result !== null) markRequest(tl, item, outcome.result, outcome.markAt);
    if (outcome.late) haloRequest(tl, item, outcome.markAt, outcome.homeAt, 0.2);
    hideRequest(tl, item, outcome.homeAt, fadeAt(outcome.homeAt, SCENE_DURATION));
  });

  // --- sound --------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels --------------------------------------------------------

  // The stage is complete on the first frame: an empty queue, two workers
  // waiting, two more outlined but not there yet, and an empty dead-letter box.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
