import {
  MAX_ATTEMPTS,
  SCENE_DURATION,
  STEP_COUNT,
  X_LANE,
  Y_ENGINE,
  Y_ENGINE_BOTTOM,
  Y_SCHEDULE,
  Y_WORK,
} from './stage';
import type {
  ApproveState,
  EngineState,
  Lamp,
  LineState,
  Mark,
  StepState,
  WorkState,
} from './stage';
import { q } from '../shared/dom';
import {
  hideRequest,
  markRequest,
  moveRequest,
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
 * Workflow Engine scene: a 24 second, four step timeline.
 *
 * The two standing rules apply here as everywhere: every tween sits at an
 * absolute position, and every discrete change is a zero-duration tween on a
 * `data-*` attribute that GSAP reverts when the playhead moves back past it.
 *
 * Nothing the reader counts is authored. The scene is told eight things — when
 * the clock says the job is due, how long the engine holds before it starts
 * each step, how long the Work end takes on each execution, which step fails
 * the first time it is tried, how long the engine backs off before retrying,
 * when the engine crashes and when it comes back, and when the approval
 * arrives. One pass over the whole 24 seconds turns that into everything else:
 * where each step stands, how many lines the history holds, which attempt the
 * engine is on, how many steps the Work box has actually carried out, and —
 * the one that matters — which step a restarted engine resumes from.
 *
 * Two derivations carry the argument. **Progress is the history, not the
 * process.** A step is recorded when its result reaches the engine, and the
 * step strip is the engine's own working memory: when the engine dies, every
 * cell goes back to `pending`, because that is what dying costs. The history
 * card is untouched by the crash, because it was never inside the engine.
 * **The resume is a replay of that card.** After the restart the engine walks
 * its four steps in order and asks the record about each one; step 1 comes back
 * `done` because there is a line for it, and the engine resumes at
 * `history.length + 1`. There is no branch anywhere in this file that says
 * "skip step one". Delete the line the first step wrote and the same code
 * would run it again.
 *
 * Workflow Engine is the neighbour of State Machine and is deliberately not it.
 * A state machine is the rules: which transitions are legal, and what the
 * current state is allowed to become. It has nothing to say about what happens
 * when the process holding that state is killed. This scene is the runtime
 * underneath: the thing that writes progress down, restarts, replays, retries
 * one step without restarting the workflow, and sleeps for hours holding
 * nothing. It is also not a Saga. A saga's answer to a failed step is to walk
 * backwards undoing the finished ones; the engine's answer is to run the failed
 * step again and carry on forwards, which is why every step here has to be safe
 * to run twice and why the fourth step is a wait rather than a compensation.
 *
 * One thing is a picture rather than a measurement. The four history lines
 * carry no names, because a line only ever says that a step completed and lines
 * are written in order — so line n is step n by construction, and the count is
 * the whole message. The words that a line would carry are already on the step
 * strip, which is the point: the strip is the history read back.
 */

const ID = 'workflow-engine';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

const BOUNDARIES = [0, 6, 12, 18, 24];

// --- how a traveller moves -------------------------------------------------

/** The signal lane, downwards only: 200px between the Schedule and the Engine. */
const LEG_SIGNAL = 0.24;
/** The execution lane, both ways: 230px between the Engine and the Work. */
const LEG_WORK = 0.28;

/** How long a traveller takes to fade once it is absorbed. */
const FADE = 0.1;
/** The same, for one that came back with a verdict it has to show first. */
const MARK_FADE = 0.16;

// --- what the scene is told ------------------------------------------------

/** When the clock says the job is due, which is the only thing that starts it. */
const DUE_AT = 0.6;
/** How long the schedule takes to hand the engine the start signal. */
const TRIGGER_LAG = 0.36;

/**
 * How long the engine holds before it begins each step, counted from the
 * moment it is free to: the start signal landing for step one, and the previous
 * step's line being written for the rest. This is the engine pacing itself, and
 * it is the only reason the steps are spread across the four sections rather
 * than running back to back.
 */
const STEP_LEAD = [0, 0.6, 1.8, 2.62];

/** How long the engine takes to hand a step over once it has begun it. */
const DISPATCH_LAG = 0.36;

/**
 * How long the Work end takes, per step and per attempt.
 *
 * Step two's first execution is the long one, and the crash lands inside it.
 * Its second is short because a step that is safe to run twice is usually also
 * cheap to run twice: asked for the same thing again, the far end finds most of
 * it already there. Step three's first execution is the quick one that fails,
 * which is what a validation error or a rejected call looks like.
 */
const WORK_TIME: number[][] = [[1.08], [2.6, 0.28], [0.14, 0.4], [0.2]];

/** The step that fails the first time it is tried, and only the first time. */
const FAIL_STEP = 3;

/** How long the engine backs off after a failure before it tries again. */
const BACKOFF = 1.02;
/** How long after a failure the engine says which attempt is coming. */
const ATTEMPT_LAG = 0.54;

/** When the engine dies, and when it is brought back. */
const CRASH_AT = 6.5;
const RESTART_AT = 7.4;

/** How a restarted engine reads its record: when it starts, and how fast. */
const REPLAY_LEAD = 0.4;
const REPLAY_PACE = 0.4;
/** How long after the last question the engine acts on the answer. */
const RESUME_LAG = 0.4;

/** The step that is a wait rather than a call, and when the answer arrives. */
const APPROVAL_STEP = 4;
const APPROVAL_LANDS_AT = 20.8;
/** How long after it starts waiting the engine lets go of everything. */
const SLEEP_LAG = 0.4;

/** How long after a step is recorded the scene holds up what it proves. */
const HOLD_LAG = 0.4;
const HOLD_FOR = 0.6;

/** How long after the last line is written the schedule books the next run. */
const CLOSE_LAG = 0.3;

/** How close two samples of one repeating thing may sound, how close any cue
    may fall to another, and how close any of it may fall to a boundary. */
const SAMPLE_GAP = 0.9;
const MIN_CUE_GAP = 0.2;
const BOUNDARY_GAP = 0.3;

/** Times are rounded to milliseconds, so a gap of exactly the minimum is one. */
const EPS = 1e-6;

// --- what one pass over the scene produces --------------------------------

interface Series {
  at: number;
  value: string;
}

/** Which lane a traveller is on, which is also how it is drawn. */
type Lane = 'signal' | 'work';

interface Traveller {
  lane: Lane;
  /** When it leaves its origin. */
  start: number;
  /** When the outbound leg ends. */
  land: number;
  /** What it comes back with, or null when it is absorbed where it landed. */
  result: RequestResult | null;
  /** When the marker pops, for one that comes back. */
  pop: number;
  /** When the return leg ends, for one that comes back. */
  home: number;
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
  cells: Series[][];
  lines: Series[][];
  travellers: Traveller[];
  cues: [number, SceneCue][];
  /** Read back by the build, so a drift in the schedule fails loudly. */
  recorded: number[];
  finalDone: number;
}

// --- the simulation --------------------------------------------------------

/**
 * Walks the whole scene in time order.
 *
 * The engine is written as a loop rather than as a script: `beginStep` starts
 * whatever step it is handed, `dispatch` sends it to the Work end and books
 * what happens when the result comes back, and the result books the next step.
 * Booked events run earliest first and a running one may book more, so the
 * replay at 7.8 sees exactly the lines that were written before the crash and
 * nothing that comes later.
 *
 * The crash is the one event that reaches in from outside the loop. It does not
 * cancel anything: it flips a flag, and everything else falls out of that. The
 * execution that was in flight is orphaned because `aliveAt` says nobody will
 * be there to hear it; the strip empties because the strip is the engine's
 * memory; the history card is not mentioned at all, because the crash has no
 * way to touch it.
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

  const fix = (at: number, name: SceneCue, family: string | null = null): void => {
    if (at < 0 || at > SCENE_DURATION) return;
    fixed.push({ at: round(at), family, name });
  };
  const sample = (at: number, family: string, name: SceneCue): void => {
    if (at < 0 || at > SCENE_DURATION) return;
    candidates.push({ at: round(at), family, name });
  };

  const setCell = (at: number, n: number, value: StepState): void =>
    record(`cell-${n}`, at, value);
  const setLine = (at: number, n: number, value: LineState): void =>
    record(`line-${n}`, at, value);

  /** A signal from outside the engine. It only ever runs downwards. */
  const signal = (lands: number): void => {
    const start = round(lands - LEG_SIGNAL);
    travellers.push({ lane: 'signal', start, land: round(lands), result: null, pop: 0, home: 0 });
  };

  const { schedule, drain } = createScheduler();

  // --- what the diagram is holding ----------------------------------------

  /** Whether the engine exists at a given moment, which is all the crash is. */
  const aliveAt = (at: number): boolean => at < CRASH_AT || at >= RESTART_AT;

  /** The record. Nothing is ever taken out of it or written over. */
  const history: number[] = [];
  /** How many times the engine has tried each step. */
  const attempts = Array.from({ length: STEP_COUNT }, () => 0);
  /** How many steps the Work end has actually carried out. */
  let done = 0;
  /** Whether the approval has arrived, and which step is asleep waiting for it. */
  let approved = false;
  let waitingOn: number | null = null;

  // --- the opening state, which is the whole diagram -----------------------

  record('due', 0, 'off' satisfies Lamp);
  record('next', 0, 'on' satisfies Lamp);
  record('engine', 0, 'up' satisfies EngineState);
  record('attempt', 0, '0');
  record('approve', 0, 'off' satisfies ApproveState);
  record('cursor', 0, '0');
  record('work', 0, 'idle' satisfies WorkState);
  record('done', 0, '0');
  record('mark', 0, 'off' satisfies Mark);
  record('settled', 0, 'off');
  for (let n = 1; n <= STEP_COUNT; n += 1) {
    setCell(0, n, 'pending');
    setLine(0, n, 'none');
  }

  // --- the engine ----------------------------------------------------------

  /** Sends one attempt at one step to the Work end, and books what follows. */
  const dispatch = (n: number, attempt: number, at: number, resumed: boolean): void => {
    const dwell = WORK_TIME[n - 1]?.[attempt - 1];
    if (dwell === undefined) {
      throw new Error(`${ID} scene: step ${n} has no duration for attempt ${attempt}`);
    }
    const land = round(at + LEG_WORK);
    const pop = round(land + dwell);
    const home = round(pop + LEG_WORK);
    const fails = n === FAIL_STEP && attempt === 1;
    // An execution the engine does not outlive is orphaned. The work still
    // leaves and the far end still starts on it; what is missing is anybody to
    // be told how it went, which is exactly why the step is not recorded.
    const orphaned = !aliveAt(pop) || !aliveAt(home);

    travellers.push({
      lane: 'work',
      start: round(at),
      land,
      result: orphaned ? null : fails ? 'fail' : 'ok',
      pop: orphaned ? land : pop,
      home: orphaned ? land : home,
    });

    schedule(land, () => record('work', land, 'busy' satisfies WorkState));
    if (orphaned) return;

    schedule(pop, () => {
      if (fails) {
        record('work', pop, 'failed' satisfies WorkState);
        return;
      }
      // The counter in the Work box is the one number the engine does not own:
      // it counts side effects that actually happened, so a step the engine
      // skipped on replay can never move it.
      done += 1;
      record('done', pop, String(done));
    });

    schedule(home, () => {
      record('work', home, 'idle' satisfies WorkState);

      if (fails) {
        setCell(home, n, 'failed');
        fix(home, 'failure');
        const showAt = round(home + ATTEMPT_LAG);
        schedule(showAt, () => {
          record('attempt', showAt, String(attempt + 1));
          fix(showAt, 'state');
        });
        const retryAt = round(home + BACKOFF);
        schedule(retryAt, () => beginStep(n, retryAt, false));
        return;
      }

      // The line is the whole point. Everything after a crash is read back out
      // of these four writes and nothing else.
      setCell(home, n, 'done');
      history.push(n);
      setLine(home, history.length, 'on');
      record('attempt', home, '0');
      fix(home, 'success');

      // What this particular step proved, held up for a moment: a step the
      // engine picked up after a restart proves the Work box did not run twice,
      // and a step that took two attempts proves the record still holds exactly
      // one line for it.
      const mark: Mark | null = resumed ? 'work' : attempt > 1 ? 'history' : null;
      if (mark !== null) {
        const holdAt = round(home + HOLD_LAG);
        schedule(holdAt, () => {
          record('mark', holdAt, mark);
          fix(holdAt, 'state');
        });
        const dropAt = round(holdAt + HOLD_FOR);
        schedule(dropAt, () => record('mark', dropAt, 'off' satisfies Mark));
      }

      if (n < STEP_COUNT) {
        const nextAt = round(home + (STEP_LEAD[n] ?? 0));
        schedule(nextAt, () => beginStep(n + 1, nextAt, false));
      } else {
        beginStep(n + 1, home, false);
      }
    });
  };

  /** Starts whatever step it is handed, or closes the instance. */
  function beginStep(n: number, at: number, resumed: boolean): void {
    if (n > STEP_COUNT) {
      const closeAt = round(at + CLOSE_LAG);
      schedule(closeAt, () => {
        record('next', closeAt, 'on' satisfies Lamp);
        record('settled', closeAt, 'on');
        fix(closeAt, 'state');
      });
      return;
    }

    // A step that is waiting for a person is a step like any other. The engine
    // marks it and then lets go of everything: no thread, no timer, no lock.
    if (n === APPROVAL_STEP && !approved) {
      setCell(at, n, 'waiting');
      record('approve', at, 'waiting' satisfies ApproveState);
      waitingOn = n;
      fix(at, 'trip');
      const sleepAt = round(at + SLEEP_LAG);
      schedule(sleepAt, () => {
        record('engine', sleepAt, 'idle' satisfies EngineState);
        fix(sleepAt, 'state');
      });
      return;
    }

    attempts[n - 1] = (attempts[n - 1] ?? 0) + 1;
    setCell(at, n, 'running');
    if (n === 1) fix(at, 'state', 'step-start');
    else sample(at, 'step-start', 'state');
    dispatch(n, attempts[n - 1] ?? 1, round(at + DISPATCH_LAG), resumed);
  }

  // --- the schedule, which is the only thing that starts any of this -------

  schedule(DUE_AT, () => {
    record('due', DUE_AT, 'on' satisfies Lamp);
    // This occurrence is no longer the next one; it is this one.
    record('next', DUE_AT, 'off' satisfies Lamp);
    fix(DUE_AT, 'trip');
  });

  const triggerLands = round(DUE_AT + TRIGGER_LAG + LEG_SIGNAL);
  signal(triggerLands);
  schedule(triggerLands, () => {
    record('due', triggerLands, 'off' satisfies Lamp);
    beginStep(1, triggerLands, false);
  });

  // --- the crash, and what a restarted engine can still find ---------------

  schedule(CRASH_AT, () => {
    record('engine', CRASH_AT, 'down' satisfies EngineState);
    // The strip is the engine's working memory, so this is what dying costs.
    // The history card is not mentioned here, because the crash cannot reach it.
    for (let n = 1; n <= STEP_COUNT; n += 1) setCell(CRASH_AT, n, 'pending');
    record('attempt', CRASH_AT, '0');
    record('cursor', CRASH_AT, '0');
    record('work', CRASH_AT, 'idle' satisfies WorkState);
    fix(CRASH_AT, 'failure');
  });

  schedule(RESTART_AT, () => {
    record('engine', RESTART_AT, 'up' satisfies EngineState);
    fix(RESTART_AT, 'state');

    // The replay. The engine walks its own steps in order and asks the record
    // about each one; there is no branch here that names a step to skip.
    let last = RESTART_AT;
    for (let n = 1; n <= STEP_COUNT; n += 1) {
      const askAt = round(RESTART_AT + REPLAY_LEAD + (n - 1) * REPLAY_PACE);
      last = askAt;
      record('cursor', askAt, String(n));
      if (history.includes(n)) {
        setCell(askAt, n, 'done');
        fix(askAt, 'state', 'replay');
      } else {
        sample(askAt, 'replay', 'state');
      }
    }

    const resumeAt = round(last + RESUME_LAG);
    schedule(resumeAt, () => {
      record('cursor', resumeAt, '0');
      // Where to carry on from is a fact about the record, not about the code.
      beginStep(history.length + 1, resumeAt, true);
    });
  });

  // --- the answer a person eventually gives --------------------------------

  signal(APPROVAL_LANDS_AT);
  schedule(APPROVAL_LANDS_AT, () => {
    if (waitingOn !== APPROVAL_STEP) {
      throw new Error(`${ID} scene: the approval arrived with nothing waiting for it`);
    }
    approved = true;
    waitingOn = null;
    record('approve', APPROVAL_LANDS_AT, 'granted' satisfies ApproveState);
    record('engine', APPROVAL_LANDS_AT, 'up' satisfies EngineState);
    fix(APPROVAL_LANDS_AT, 'state');
    beginStep(APPROVAL_STEP, APPROVAL_LANDS_AT, false);
  });

  // --- run it --------------------------------------------------------------

  drain();

  const expected = Array.from({ length: STEP_COUNT }, (_value, index) => index + 1).join(',');
  if (history.join(',') !== expected) {
    throw new Error(`${ID} scene: the history ended as [${history.join(',')}]`);
  }
  if (done !== STEP_COUNT) {
    throw new Error(`${ID} scene: ${done} steps ran but ${STEP_COUNT} were recorded`);
  }
  const tried = attempts[FAIL_STEP - 1] ?? 0;
  if (tried !== 2) throw new Error(`${ID} scene: step ${FAIL_STEP} was tried ${tried} times`);
  if (Math.max(...attempts) > MAX_ATTEMPTS) {
    throw new Error(`${ID} scene: a step outgrew the ${MAX_ATTEMPTS} attempts the stage draws`);
  }

  // --- the series, put in time order and collapsed -------------------------

  // Changes are recorded as they are worked out rather than as they happen — a
  // restart lays down four cursor positions before the first of them is read —
  // so each key is sorted once here. Two changes to one key at one instant
  // would otherwise render in insertion order forwards and in reverse
  // backwards, so only the one that ends up applying is kept.
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
    'due',
    'next',
    'engine',
    'attempt',
    'approve',
    'cursor',
    'work',
    'done',
    'mark',
    'settled',
  ]) {
    flags[key] = seriesOf(key);
  }
  const cells = Array.from({ length: STEP_COUNT }, (_value, index) =>
    seriesOf(`cell-${index + 1}`),
  );
  const lines = Array.from({ length: STEP_COUNT }, (_value, index) =>
    seriesOf(`line-${index + 1}`),
  );

  // --- the cues ------------------------------------------------------------

  // Same shape as the other scenes: everything the scene has to say is kept,
  // and the repeating families are thinned to samples so a step start or a
  // replay question is heard often enough to read as a rhythm without becoming
  // one.
  const accepted: Fixed[] = fixed
    .filter((entry) => !BOUNDARIES.some((edge) => Math.abs(entry.at - edge) < BOUNDARY_GAP - EPS))
    .sort((left, right) => left.at - right.at)
    .filter(
      (entry, index, list) =>
        index === 0 || entry.at - (list[index - 1]?.at ?? -99) >= MIN_CUE_GAP - EPS,
    );

  const lastOf: Record<string, number> = { 'step-start': -99, replay: -99 };
  candidates.sort((left, right) => left.at - right.at);
  for (const candidate of candidates) {
    let previous = lastOf[candidate.family] ?? -99;
    for (const other of accepted) {
      if (other.family === candidate.family && other.at < candidate.at && other.at > previous) {
        previous = other.at;
      }
    }
    if (candidate.at - previous < SAMPLE_GAP - EPS) continue;
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

  return { flags, cells, lines, travellers, cues, recorded: [...history], finalDone: done };
}

// --- the timeline ----------------------------------------------------------

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);
  const cellElements = Array.from({ length: STEP_COUNT }, (_value, index) =>
    q<SVGGElement>(stage, `.we-cell--${index + 1}`, ID),
  );
  const lineElements = Array.from({ length: STEP_COUNT }, (_value, index) =>
    q<SVGRectElement>(stage, `.we-line--${index + 1}`, ID),
  );

  const sim = simulate();
  if (sim.recorded.length !== STEP_COUNT || sim.finalDone !== STEP_COUNT) {
    throw new Error(`${ID} scene: the instance did not close on all ${STEP_COUNT} steps`);
  }

  const parts = mountRequests(layer, sim.travellers.length, ID);
  const tl = createSceneTimeline();

  // --- everything the stage says about itself ------------------------------

  for (const [name, series] of Object.entries(sim.flags)) {
    for (const entry of series) attr(tl, stage, `data-we-${name}`, entry.value, entry.at);
  }
  // A cell carries its own state, because four steps stand in four different
  // places at once and only the cell knows which one it is in.
  sim.cells.forEach((series, index) => {
    const element = cellElements[index];
    if (!element) return;
    for (const entry of series) attr(tl, element, 'data-we-step', entry.value, entry.at);
  });
  sim.lines.forEach((series, index) => {
    const element = lineElements[index];
    if (!element) return;
    for (const entry of series) attr(tl, element, 'data-we-line', entry.value, entry.at);
  });

  // --- what travels --------------------------------------------------------

  /** Where a traveller starts on its lane, and the far end of it. */
  const LANES: Record<Lane, { x: number; from: number; to: number }> = {
    signal: { x: X_LANE, from: Y_SCHEDULE, to: Y_ENGINE },
    work: { x: X_LANE, from: Y_ENGINE_BOTTOM, to: Y_WORK },
  };

  sim.travellers.forEach((plan, index) => {
    const request = parts[index];
    if (!request) return;
    const lane = LANES[plan.lane];

    parkRequest(request, lane.x, lane.from);
    showRequest(tl, request, plan.start);
    moveRequest(tl, request, lane.to, round(plan.land - plan.start), plan.start);

    // A signal is absorbed by whoever it reached, and so is an execution the
    // engine did not live long enough to hear back from. Everything else comes
    // home carrying the one thing the engine is waiting for: how it went.
    if (plan.result === null) {
      hideRequest(tl, request, plan.land, FADE);
      return;
    }
    markRequest(tl, request, plan.result, plan.pop);
    moveRequest(tl, request, lane.from, round(plan.home - plan.pop), plan.pop);
    hideRequest(tl, request, plan.home, MARK_FADE);
  });

  // --- sound ---------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels ---------------------------------------------------------

  // The stage is complete on the first frame: a schedule holding the next run,
  // four pending steps, an empty history, `done 0`, and nothing in flight.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
