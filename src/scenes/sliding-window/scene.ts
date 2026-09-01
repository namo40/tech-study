import gsap from 'gsap';
import {
  ARRIVALS,
  CAPACITY,
  DEPARTURE_ROWS,
  DROP_MAX,
  LEAK,
  LIMIT,
  OK_MAX,
  PPS,
  SCENE_DURATION,
  STAGE_STATE,
  SWEEP,
  TRACK_X0,
  TRACK_X1,
  WINDOW,
  X_LANE,
  Y_OUT_TOP,
  Y_REQ_BOTTOM,
  Y_WIN_BOTTOM,
  Y_WIN_TOP,
} from './stage';
import type { GaugeState, Mark, Mode, Panel } from './stage';
import { q } from '../shared/dom';
import { hideRequest, markRequest, mountRequests, parkRequest, showRequest } from '../shared/request';
import { createScheduler } from '../shared/simulation';
import { attr, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Sliding Window scene: a 24 second, four step timeline.
 *
 * The same two rules as every other scene. Every tween sits at an absolute
 * position, and every discrete change is a zero-duration tween on a `data-*`
 * attribute that GSAP reverts when the playhead moves back past it. The only
 * two continuous quantities are the `now` mark walking the track and the
 * sliding band's edge following it, which is the one thing here that really is
 * continuous; everything else is a stack of variants, so scrubbing backwards
 * lands on a value rather than on a blend of two.
 *
 * Nothing the reader reads is authored. The scene is told one arrival pattern —
 * four requests crowded into the end of a window and four more into the start
 * of the next, then three stragglers — the window length, the limit, the
 * bucket's capacity and leak rate, when the picture changes from one way of
 * working the window out to the next, and how fast each leg is travelled. That
 * pattern is replayed unchanged in all four steps, and every verdict comes from
 * the rule in force at the time:
 *
 *  - `fixed` admits while the count inside the clock-aligned partition `now` is
 *    in is below the limit. The partition resets on the clock, so the burst on
 *    either side of a wall is two separate fours.
 *  - `slide` admits while the number of admitted arrivals in the half-open
 *    interval `(now - WINDOW, now]` is below the limit. There is no wall to
 *    reset on, so the second burst meets the first.
 *  - `approx` keeps one counter per segment and admits while
 *    `previous * (1 - elapsed / WINDOW) + current + 1` is at most the limit.
 *  - `bucket` has no window: an arrival is enqueued while the bucket is below
 *    capacity and drops when it is full, and the bucket drips one out every
 *    `LEAK` seconds for as long as it holds anything.
 *
 * Everything the stage shows falls out of that: which chip is a check and which
 * a cross, which tick stands above the track and which hangs below it, the
 * `ok n` and `drop n` totals, the gauge, the bucket's level, the drip times and
 * the output band's rhythm. The gauge is deliberately not the limiter's own
 * count but the true one — how many admitted arrivals really are inside the
 * last `WINDOW` seconds — so it can say `double` in the first step while the
 * fixed window's own counter is calmly reading four.
 *
 * Four things the model refuses to let the timeline pretend, all asserted below
 * against a 10 ms sweep of the step they belong to. The fixed window really
 * does admit twice its limit across one seam, and the scene fails to build if
 * it does not. The sliding window really never lets more than the limit into
 * any window-length interval. The approximation really does drop at the seam
 * where the fixed window admitted, and really does hold the excess well under
 * twice the limit — while over-admitting slightly, which is the honest cost of
 * the trade and is stated rather than hidden. And the bucket's departures are
 * exactly one leak period apart for as long as it has anything in it.
 *
 * This scene does not own the limiter. Rate Limiter owns where a limiter sits
 * and the 429 the caller gets back, and Token Bucket owns saved-up allowance
 * spent in a burst. What is owned here is the geometry: where a window's edges
 * are, what it costs to put them in the right place, and what happens when you
 * stop counting and start shaping instead.
 */

const ID = 'sliding-window';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

/** The instant each step starts, which is also the instant its replay resets. */
const STEP_AT = [0, 6, 12, 18];

// --- the shape of one replay ------------------------------------------------

/** Seconds into a step at which track time zero sits. */
const SWEEP_FROM = 0.3;
/** How long the `now` mark takes to walk the track, one second per second. */
const SWEEP_FOR = SWEEP;
/** When the mark fades, when it is put back at the left end, and when it returns. */
const SWEEP_FADE = 0.15;
const RETRACE_AT = SWEEP_FROM + SWEEP_FOR + 0.3;
const RETURN_AT = RETRACE_AT + 0.2;
/** When a replay's counters, chips, ticks and notches are put back to nothing. */
const RESET_AT = 0.35;

// --- how a traveller moves --------------------------------------------------

/**
 * Seconds a request takes from Requests to Window (200px) and from Window to
 * Out (230px), and how long it takes to go once it has been judged or absorbed.
 *
 * Two arrivals in the pattern are only 0.10 s apart, and a traveller sits on
 * its endpoint while it fades, so the three numbers are chosen together: a
 * segment of `D` px travelled in `L` seconds leaves `D * (gap - FADE) / L` px
 * between two travellers at the tightest moment, which is 55.6 px on the upper
 * segment and 57.5 px on the lower one — both clear of the 52 px halo.
 */
const IN_LEG = 0.18;
const PASS_LEG = 0.2;
const FADE = 0.05;
/** The halo diameter two travellers on one segment must always keep between them. */
const HALO = 52;

// --- what the picture is told -----------------------------------------------

/** How the window is worked out, and from when. */
const MODE_PLAN: [number, Mode][] = [
  [0, 'fixed'],
  [4.6, 'slide'],
  [12.35, 'approx'],
  [18.35, 'bucket'],
];

/** What the limiter has to remember, and from when. */
const PANEL_PLAN: [number, Panel][] = [
  [0, 'counter'],
  [4.6, 'log'],
  [14.4, 'approx'],
  [18.35, 'level'],
];

/** The rule each step's replay is judged by. */
const STEP_RULE: Mode[] = ['fixed', 'slide', 'approx', 'bucket'];

/** What the scene holds up, when, and for how long. */
const MARK_AT: [number, Mark, number][] = [
  [0.45, 'wall', 0.5],
  // The ring round `now` is drawn on the mark itself, so it comes down before
  // the mark goes out at the end of the sweep rather than after it.
  [4.3, 'now', 0.25],
  [4.95, 'band', 0.35],
  [6.55, 'now', 0.4],
  [11.0, 'hold', 0.4],
  [12.75, 'ledger', 0.5],
  [13.4, 'ledger', 0.5],
  [17.0, 'ledger', 0.4],
];

/** How long the seam bracket stays up once the count has reached twice the limit. */
const SEAM_HOLD = 0.7;
/** How long the bucket's rim shows what went over it. */
const SPILL_HOLD = 0.4;
/** How long the bead at the spout is a drop rather than a hollow. */
const BEAD_HOLD = 0.14;
/** When the picture is called settled: the bucket empty and nothing in flight. */
const SETTLE_AT = 22.6;

/** The shortest gap between any two cues, and how quiet a step boundary is. */
const MIN_CUE_GAP = 0.2;
/** What a cue that only adds colour has to clear, which is more. */
const SAMPLE_GAP = 0.28;
const BOUNDARY_GAP = 0.3;
const BOUNDARIES = [0, 6, 12, 18, 24];
const EPS = 1e-9;

// --- what the simulation produces -------------------------------------------

/** One discrete change, and the thing on the stage it is written on. */
interface AttrChange {
  at: number;
  target: string;
  name: string;
  value: string;
}

/** One traveller, on one segment, in one direction. */
interface Ride {
  kind: 'in' | 'pass';
  from: number;
  to: number;
  startAt: number;
  leg: number;
  markAt: number | null;
  result: 'ok' | 'fail';
  fadeAt: number;
}

/** What one replay came to, kept so the captions can be checked against it. */
interface StepResult {
  step: number;
  rule: Mode;
  admitted: number[];
  dropped: number[];
  ok: number;
  drop: number;
  /** The most admitted arrivals any window-length interval of the replay held. */
  peak: number;
  /** Where that peak was measured, as the interval's right edge in track time. */
  peakAt: number;
}

interface Simulation {
  changes: AttrChange[];
  cues: [number, SceneCue][];
  rides: Ride[];
  steps: StepResult[];
  /** The bucket's departures, in track time, and the gaps between them. */
  drips: number[];
}

/** What the gauge says about `n` admitted arrivals inside the last window. */
function gaugeOf(n: number): GaugeState {
  if (n < LIMIT) return 'under';
  if (n === LIMIT) return 'at';
  return n >= 2 * LIMIT ? 'double' : 'over';
}

/** How many of `times` fall in the half-open interval `(at - WINDOW, at]`. */
function inWindow(times: readonly number[], at: number): number {
  return times.filter((t) => t > at - WINDOW + EPS && t <= at + EPS).length;
}

/** Which clock-aligned segment track time `t` belongs to. */
const segmentOf = (t: number): number => Math.floor(t / WINDOW);

// --- the simulation ---------------------------------------------------------

function simulate(): Simulation {
  const raw: AttrChange[] = [];
  const fixed: [number, SceneCue][] = [];
  const samples: [number, SceneCue][] = [];
  const rides: Ride[] = [];
  const results: StepResult[] = [];
  const problems: string[] = [];
  let dripTimes: number[] = [];

  const setAttr = (at: number, target: string, name: string, value: string): void => {
    raw.push({ at: round(at), target, name, value });
  };
  const stage = (at: number, name: string, value: string): void => {
    setAttr(at, 'stage', `data-sw-${name}`, value);
  };
  const cue = (at: number, name: SceneCue): void => {
    fixed.push([round(at), name]);
  };
  const sample = (at: number, name: SceneCue): void => {
    samples.push([round(at), name]);
  };
  const ride = (
    kind: Ride['kind'],
    from: number,
    to: number,
    startAt: number,
    leg: number,
    markAt: number | null,
    result: Ride['result'],
  ): void => {
    rides.push({
      kind,
      from,
      to,
      startAt: round(startAt),
      leg,
      markAt: markAt === null ? null : round(markAt),
      result,
      fadeAt: round(startAt + leg),
    });
  };

  const { schedule, drain } = createScheduler();

  // --- the opening frame, and the things the picture is simply told ---------

  for (const [key, value] of Object.entries(STAGE_STATE)) {
    setAttr(0, 'stage', key.slice('stage@'.length), value);
  }

  for (const [at, mode] of MODE_PLAN) {
    if (at === 0) continue;
    schedule(at, () => {
      stage(at, 'mode', mode);
      // Letting the clock-aligned window go is the turn the scene hangs on, so
      // it is heard as a release rather than as one more change of state.
      cue(at, mode === 'slide' ? 'trip' : 'state');
      if (mode === 'bucket') {
        stage(at, 'out', 'drip');
        for (let i = 0; i < DEPARTURE_ROWS.arr.length; i += 1) {
          setAttr(at, `out-arr-${i}`, 'data-sw-out-hit', 'off');
        }
      }
    });
  }
  for (const [at, panel] of PANEL_PLAN) {
    if (at === 0) continue;
    // Only the change at 14.4 is a beat of its own; the other two ride along
    // with the change of window they belong to and are already sounded.
    schedule(at, () => {
      stage(at, 'panel', panel);
      if (at === 14.4) cue(at, 'state');
    });
  }
  for (const [at, mark, hold] of MARK_AT) {
    schedule(at, () => {
      stage(at, 'mark', mark);
      stage(round(at + hold), 'mark', 'none');
      cue(at, 'state');
    });
  }

  // --- one replay per step, judged by the rule in force --------------------

  STEP_AT.forEach((base, step) => {
    const rule = STEP_RULE[step] ?? 'fixed';
    const zero = round(base + SWEEP_FROM);

    // Every replay starts from nothing: no verdicts, no ticks, no notches.
    const reset = round(base + RESET_AT);
    if (step > 0) {
      schedule(reset, () => {
        stage(reset, 'ok', '0');
        stage(reset, 'drop', '0');
        stage(reset, 'gauge', 'under');
        stage(reset, 'seam', 'off');
        ARRIVALS.forEach((_value, i) => {
          setAttr(reset, `chip-${i}`, 'data-sw-chip', 'off');
          setAttr(reset, `tick-${i}`, 'data-sw-tick', 'off');
        });
        for (const kind of ['arr', 'drip'] as const) {
          DEPARTURE_ROWS[kind].forEach((_value, i) => {
            setAttr(reset, `out-${kind}-${i}`, 'data-sw-out-hit', 'off');
          });
        }
      });
    }

    // Which clock-aligned segment `now` is in, for the two modes that draw them.
    for (let n = 1; n <= 2; n += 1) {
      const at = round(zero + n * WINDOW);
      const part = String(n);
      schedule(at, () => stage(at, 'part', part));
    }
    schedule(round(base + RETRACE_AT), () => stage(round(base + RETRACE_AT), 'part', '0'));

    const admitted: number[] = [];
    const dropped: number[] = [];
    /** Admitted per clock-aligned segment, for the two modes that count that way. */
    const perSegment = new Map<number, number>();
    /** The bucket, for the step that has one. */
    let level = 0;
    let nextDrip: number | null = null;
    const drips: number[] = [];

    for (const at of ARRIVALS) {
      const seg = segmentOf(at);
      let pass: boolean;
      if (rule === 'fixed') {
        pass = (perSegment.get(seg) ?? 0) < LIMIT;
      } else if (rule === 'slide') {
        pass = inWindow(admitted, at) < LIMIT;
      } else if (rule === 'approx') {
        const previous = perSegment.get(seg - 1) ?? 0;
        const current = perSegment.get(seg) ?? 0;
        const weight = 1 - (at - seg * WINDOW) / WINDOW;
        pass = previous * weight + current + 1 <= LIMIT + EPS;
      } else {
        // The bucket drips on its own clock, so everything it owes before this
        // arrival is paid out before the arrival is looked at.
        while (nextDrip !== null && nextDrip < at - EPS) {
          const out: number = nextDrip;
          level -= 1;
          drips.push(out);
          nextDrip = level > 0 ? round(out + LEAK) : null;
        }
        if (nextDrip !== null && Math.abs(nextDrip - at) < EPS) {
          problems.push(`a drip and an arrival land together at ${at}`);
        }
        pass = level < CAPACITY;
        if (pass) {
          level += 1;
          if (nextDrip === null) nextDrip = round(at + LEAK);
        }
      }
      if (pass) {
        admitted.push(at);
        if (rule !== 'slide') perSegment.set(seg, (perSegment.get(seg) ?? 0) + 1);
      } else {
        dropped.push(at);
      }
    }
    if (rule === 'bucket') {
      while (nextDrip !== null) {
        const out = nextDrip;
        level -= 1;
        drips.push(out);
        nextDrip = level > 0 ? round(out + LEAK) : null;
      }
      if (level !== 0) problems.push(`the bucket ends the scene holding ${level}`);
      dripTimes = drips.slice();
    }

    // --- what the reader sees of that -------------------------------------

    let ok = 0;
    let drops = 0;
    ARRIVALS.forEach((at, index) => {
      const verdict = round(zero + at);
      const passed = admitted.includes(at);
      const depart = round(verdict - IN_LEG);
      ride('in', Y_REQ_BOTTOM, Y_WIN_TOP, depart, IN_LEG, verdict, passed ? 'ok' : 'fail');
      if (passed) ok += 1;
      else drops += 1;
      const tally = passed ? ok : drops;
      if (passed && ok > OK_MAX) problems.push(`${verdict} the readout was asked for ok ${ok}`);
      if (!passed && drops > DROP_MAX) {
        problems.push(`${verdict} the readout was asked for drop ${drops}`);
      }
      schedule(verdict, () => {
        setAttr(verdict, `chip-${index}`, 'data-sw-chip', passed ? 'ok' : 'drop');
        setAttr(verdict, `tick-${index}`, 'data-sw-tick', passed ? 'ok' : 'drop');
        stage(verdict, passed ? 'ok' : 'drop', String(tally));
        sample(verdict, passed ? 'success' : 'state');
      });
      if (!passed) return;
      // Only an admitted request travels on to Out. A drop is a state on the
      // track and in its chip, and nothing leaves the Window band.
      ride('pass', Y_WIN_BOTTOM, Y_OUT_TOP, verdict, PASS_LEG, null, 'ok');
      const lands = round(verdict + PASS_LEG);
      schedule(lands, () => {
        if (rule === 'bucket') return;
        setAttr(lands, `out-arr-${index}`, 'data-sw-out-hit', 'on');
      });
    });

    // The bucket fills as admitted requests land in it and empties on its own
    // clock, so its level, its drips and its rim are all read off the same run.
    if (rule === 'bucket') {
      let held = 0;
      const moves: [number, number][] = [];
      // The bucket takes the request at the moment it is let in, which is the
      // same instant its chip turns and `ok n` climbs; the ride down is the
      // request going where it has already been counted.
      for (const at of admitted) moves.push([at, 1]);
      for (const at of drips) moves.push([at, -1]);
      moves.sort((left, right) => left[0] - right[0] || right[1] - left[1]);
      for (const [at, delta] of moves) {
        held += delta;
        const depth = String(held);
        if (held < 0 || held > CAPACITY) problems.push(`the bucket holds ${held} at ${at}`);
        const when = round(zero + at);
        schedule(when, () => {
          stage(when, 'level', depth);
          if (delta > 0) {
            sample(when, 'state');
            return;
          }
          stage(when, 'leak', 'drip');
          stage(round(when + BEAD_HOLD), 'leak', 'idle');
          const index = drips.indexOf(at);
          if (index >= 0) setAttr(when, `out-drip-${index}`, 'data-sw-out-hit', 'on');
          // The last drop is the picture's point, so it is always heard.
          if (at === drips[drips.length - 1]) cue(when, 'success');
          else sample(when, 'success');
        });
      }
      for (const at of dropped) {
        const when = round(zero + at);
        schedule(when, () => {
          stage(when, 'spill', 'on');
          stage(round(when + SPILL_HOLD), 'spill', 'off');
          cue(when, 'state');
        });
      }
    }

    // --- the gauge, which reads the truth rather than the limiter ----------

    const marks: [number, number][] = [];
    // The bucket step has no window at all, so there is nothing for the gauge
    // to be reading and it stays where the replay's reset left it.
    for (const at of rule === 'bucket' ? [] : admitted) {
      marks.push([at, 1]);
      marks.push([round(at + WINDOW), -1]);
    }
    marks.sort((left, right) => left[0] - right[0] || right[1] - left[1]);
    let count = 0;
    let said: GaugeState = 'under';
    let announced = false;
    for (const [at, delta] of marks) {
      count += delta;
      const want = gaugeOf(count);
      if (want === said) continue;
      said = want;
      const when = round(zero + at);
      schedule(when, () => {
        stage(when, 'gauge', want);
        if (want !== 'double' || announced) return;
        // Twice the limit inside one window is the thing the first step is
        // about, so the bracket goes up and it is the one failure in the scene.
        announced = true;
        stage(when, 'seam', 'on');
        stage(round(when + SEAM_HOLD), 'seam', 'off');
        cue(when, 'failure');
      });
    }
    if (said !== 'under') problems.push(`step ${step + 1} ends with the gauge saying ${said}`);

    // --- what the replay is allowed to claim -------------------------------

    let peak = 0;
    let peakAt = 0;
    for (let t = 0; t <= SWEEP + EPS; t = round(t + 0.01)) {
      const held = inWindow(admitted, t);
      if (held > peak) {
        peak = held;
        peakAt = t;
      }
    }
    if (rule === 'fixed' && peak !== 2 * LIMIT) {
      problems.push(`the fixed window's seam let ${peak} through rather than ${2 * LIMIT}`);
    }
    if (rule === 'slide' && peak !== LIMIT) {
      problems.push(`the sliding window let ${peak} into one window rather than ${LIMIT}`);
    }
    if (rule === 'approx') {
      // The approximation is allowed to over-admit a little at a pattern edge —
      // that is the trade — but it must not hand back the free reset the fixed
      // window gave away, and it must drop where the fixed window admitted.
      if (peak >= 2 * LIMIT) problems.push(`the approximation reopened the seam at ${peak}`);
      if (peak <= LIMIT) problems.push('the approximation is being drawn as exact, which it is not');
      const fixedStep = results[0];
      const closed = dropped.find((at) => fixedStep?.admitted.includes(at));
      if (closed === undefined) {
        problems.push('the approximation admits everything the fixed window did');
      } else {
        // The moment the approximation refuses the request the clock-aligned
        // window waved through is the whole point of the step, so it is heard.
        cue(round(zero + closed), 'success');
      }
    }
    if (rule === 'bucket') {
      for (let i = 1; i < drips.length; i += 1) {
        const previous = drips[i - 1] ?? 0;
        const at = drips[i] ?? 0;
        // A gap longer than the leak period is only allowed where the bucket
        // really was empty and waiting for something to arrive.
        const idle = !admitted.some((a) => a > previous + EPS && a < at - EPS);
        if (Math.abs(at - previous - LEAK) > 1e-6 && !idle) {
          problems.push(`departures at ${previous} and ${at} are not one leak apart`);
        }
      }
      if (dropped.length === 0) problems.push('the bucket never overflows');
    }
    if (ok + drops !== ARRIVALS.length) {
      problems.push(`step ${step + 1} judged ${ok + drops} of ${ARRIVALS.length} arrivals`);
    }

    results.push({ step: step + 1, rule, admitted, dropped, ok, drop: drops, peak, peakAt });
  });

  schedule(SETTLE_AT, () => {
    stage(SETTLE_AT, 'settled', 'on');
    cue(SETTLE_AT, 'success');
  });

  drain();

  // --- what the stage actually says, once the no-ops are taken out ---------

  const changes: AttrChange[] = [];
  const ordered = raw
    .map((change, index) => ({ ...change, index }))
    .sort((left, right) => left.at - right.at || left.index - right.index);
  const lastPerInstant = new Map<string, (typeof ordered)[number]>();
  for (const change of ordered) {
    lastPerInstant.set(`${change.target}@${change.name}#${change.at}`, change);
  }
  const collapsed = [...lastPerInstant.values()].sort(
    (left, right) => left.at - right.at || left.index - right.index,
  );
  const held = new Map<string, string>();
  for (const change of collapsed) {
    const key = `${change.target}@${change.name}`;
    const prior = held.get(key);
    held.set(key, change.value);
    if (prior === change.value) continue;
    if (prior === undefined && change.at === 0) continue;
    changes.push({ at: change.at, target: change.target, name: change.name, value: change.value });
  }

  const valueAt = (target: string, name: string, at: number): string => {
    let value = STAGE_STATE[`${target}@${name}`] ?? 'off';
    for (const change of changes) {
      if (change.at > at + EPS) break;
      if (change.target === target && change.name === name) value = change.value;
    }
    return value;
  };

  // --- the cues, once the optional ones have been given room ---------------

  fixed.sort((left, right) => left[0] - right[0]);
  const cues: [number, SceneCue][] = [];
  for (const entry of fixed) {
    const previous = cues.at(-1);
    if (previous && previous[0] === entry[0]) continue;
    cues.push(entry);
  }
  for (const entry of samples.slice().sort((left, right) => left[0] - right[0])) {
    if (cues.some(([other]) => Math.abs(other - entry[0]) < SAMPLE_GAP - EPS)) continue;
    if (BOUNDARIES.some((edge) => Math.abs(entry[0] - edge) < BOUNDARY_GAP - EPS)) continue;
    cues.push(entry);
    cues.sort((left, right) => left[0] - right[0]);
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

  // --- the two lane segments ------------------------------------------------

  const goneAt = (entry: Ride): number => round(entry.fadeAt + FADE);
  const whereAt = (entry: Ride, at: number): number => {
    if (at <= entry.startAt) return entry.from;
    const down = Math.min(at, entry.startAt + entry.leg);
    return entry.from + ((entry.to - entry.from) * (down - entry.startAt)) / entry.leg;
  };
  const ENDS: Record<Ride['kind'], [number, number]> = {
    in: [Y_REQ_BOTTOM, Y_WIN_TOP],
    pass: [Y_WIN_BOTTOM, Y_OUT_TOP],
  };
  for (const entry of rides) {
    const ends = ENDS[entry.kind];
    if (entry.from !== ends[0] || entry.to !== ends[1]) {
      problems.push(`a ${entry.kind} leg at ${entry.startAt} does not end on a box edge`);
    }
    if (entry.startAt < 0 || goneAt(entry) > SCENE_DURATION) {
      problems.push(`a traveller runs off the end of the scene at ${entry.startAt}`);
    }
  }
  let closest = Infinity;
  let closestName = '';
  for (const kind of ['in', 'pass'] as const) {
    const lane = rides.filter((entry) => entry.kind === kind);
    for (let a = 0; a < lane.length; a += 1) {
      for (let b = a + 1; b < lane.length; b += 1) {
        const left = lane[a];
        const right = lane[b];
        if (!left || !right) continue;
        const from = Math.max(left.startAt, right.startAt);
        const to = Math.min(goneAt(left), goneAt(right));
        if (to <= from) continue;
        for (let t = from; t <= to + EPS; t = round(t + 0.01)) {
          const apart = Math.abs(whereAt(left, t) - whereAt(right, t));
          if (apart < closest) {
            closest = apart;
            closestName = `${kind}: ${left.startAt} and ${right.startAt} at ${round(t)}`;
          }
        }
      }
    }
  }
  if (closest < HALO - EPS) {
    problems.push(`two travellers come ${closest.toFixed(0)}px apart (${closestName})`);
  }

  // --- the boundaries and the closing frame --------------------------------

  for (const edge of BOUNDARIES) {
    for (const entry of rides) {
      if (entry.startAt < edge - EPS && goneAt(entry) > edge + EPS) {
        problems.push(`something is in flight on the boundary at ${edge}`);
      }
    }
    if (valueAt('stage', 'data-sw-mark', edge) !== 'none') {
      problems.push(`a highlight is up on the boundary at ${edge}`);
    }
    if (valueAt('stage', 'data-sw-seam', edge) !== 'off') {
      problems.push(`the seam bracket is up on the boundary at ${edge}`);
    }
    if (valueAt('stage', 'data-sw-spill', edge) !== 'off') {
      problems.push(`the bucket is still spilling on the boundary at ${edge}`);
    }
    if (valueAt('stage', 'data-sw-leak', edge) !== 'idle') {
      problems.push(`a drop is still at the spout on the boundary at ${edge}`);
    }
    if (valueAt('stage', 'data-sw-part', edge) !== '0') {
      problems.push(`the track is not back at its first segment on the boundary at ${edge}`);
    }
  }
  if (valueAt('stage', 'data-sw-level', SCENE_DURATION) !== '0') {
    problems.push('the scene does not end with the bucket empty');
  }
  if (valueAt('stage', 'data-sw-settled', SCENE_DURATION) !== 'on') {
    problems.push('the scene does not end settled');
  }
  if (valueAt('stage', 'data-sw-mode', SCENE_DURATION) !== 'bucket') {
    problems.push('the scene does not end on the bucket');
  }

  if (problems.length > 0) throw new Error(`${ID} scene: ${[...new Set(problems)].join('; ')}`);

  rides.sort((left, right) => left.startAt - right.startAt);
  return { changes, cues, rides, steps: results, drips: dripTimes };
}

// --- the timeline -----------------------------------------------------------

/** How wide the sliding band is once it has grown to its full window length. */
const BAND_W = PPS * WINDOW;
/** How far the band's left edge travels once it is following `now`. */
const BAND_TRAVEL = TRACK_X1 - TRACK_X0 - BAND_W;

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);
  const now = q<SVGGElement>(stage, '.sw-now', ID);
  const band = q<SVGRectElement>(stage, '.sw-band', ID);
  const sim = simulate();

  // The captions name the figures the model produced. Nothing here places them:
  // if the pattern or the rules change, this is what says the captions have
  // stopped describing the scene.
  const [one, two, three, four] = sim.steps;
  if (!one || !two || !three || !four) throw new Error(`${ID} scene: a step produced no replay`);
  if (one.peak !== 2 * LIMIT) {
    throw new Error(`${ID} scene: the first step promises a seam that lets ${2 * LIMIT} through`);
  }
  if (two.peak !== LIMIT || two.drop === 0) {
    throw new Error(`${ID} scene: the second step promises the excess drops and the rest holds`);
  }
  if (three.peak >= one.peak || three.drop === 0) {
    throw new Error(`${ID} scene: the third step promises an approximation that closes the seam`);
  }
  if (four.drop !== 1 || sim.drips.length < 8) {
    throw new Error(`${ID} scene: the fourth step promises one overflow and a steady drip`);
  }

  const targets = new Map<string, Element>();
  targets.set('stage', stage);
  ARRIVALS.forEach((_value, index) => {
    targets.set(`chip-${index}`, q<SVGGElement>(stage, `.sw-chip--${index}`, ID));
    targets.set(`tick-${index}`, q<SVGGElement>(stage, `.sw-tick--${index}`, ID));
  });
  for (const kind of ['arr', 'drip'] as const) {
    DEPARTURE_ROWS[kind].forEach((_value, index) => {
      targets.set(`out-${kind}-${index}`, q<SVGGElement>(stage, `.sw-out--${kind}-${index}`, ID));
    });
  }

  const tl = createSceneTimeline();

  // --- everything the stage says about itself ------------------------------

  for (const change of sim.changes) {
    const target = targets.get(change.target);
    if (!target) throw new Error(`${ID} scene: nothing on the stage is called "${change.target}"`);
    attr(tl, target, change.name, change.value, change.at);
  }

  // --- the one thing that really is continuous -----------------------------

  gsap.set(now, { x: 0, opacity: 1 });
  gsap.set(band, { attr: { x: TRACK_X0, width: 0 } });

  for (const base of STEP_AT) {
    const from = round(base + SWEEP_FROM);
    const ends = round(from + SWEEP_FOR);
    // `now` walks the track at one track second per second, then goes out
    // before the step ends and comes back at the left edge, so the boundary
    // itself holds still and neither scrub direction has to guess.
    tl.fromTo(
      now,
      { x: 0 },
      { x: TRACK_X1 - TRACK_X0, duration: SWEEP_FOR, ease: 'none', immediateRender: false },
      from,
    );
    tl.to(now, { opacity: 0, duration: SWEEP_FADE, immediateRender: false }, ends);
    tl.set(now, { x: 0, immediateRender: false }, round(base + RETRACE_AT));
    tl.to(now, { opacity: 1, duration: SWEEP_FADE, immediateRender: false }, round(base + RETURN_AT));

    // The sliding band is the last window length behind `now`: it grows out of
    // the left edge until it is a whole window wide, then follows.
    tl.fromTo(
      band,
      { attr: { width: 0 } },
      { attr: { width: BAND_W }, duration: WINDOW, ease: 'none', immediateRender: false },
      from,
    );
    tl.fromTo(
      band,
      { attr: { x: TRACK_X0 } },
      {
        attr: { x: TRACK_X0 + BAND_TRAVEL },
        duration: SWEEP_FOR - WINDOW,
        ease: 'none',
        immediateRender: false,
      },
      round(from + WINDOW),
    );
    tl.set(band, { attr: { x: TRACK_X0, width: 0 }, immediateRender: false }, round(base + RETRACE_AT));
  }

  // --- what travels --------------------------------------------------------

  const parts = mountRequests(layer, sim.rides.length, ID);

  sim.rides.forEach((entry, index) => {
    const group = parts[index];
    if (!group) return;
    group.group.classList.add(`sw-req--${entry.kind}`);

    parkRequest(group, X_LANE, entry.from);
    showRequest(tl, group, entry.startAt);
    tl.to(
      group.group,
      { y: entry.to, duration: entry.leg, ease: 'none', immediateRender: false },
      entry.startAt,
    );
    if (entry.markAt !== null) markRequest(tl, group, entry.result, entry.markAt);
    hideRequest(tl, group, entry.fadeAt, FADE);
  });

  // --- sound ---------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels ---------------------------------------------------------

  // The stage is complete on the first frame: a clock-aligned window drawn over
  // an empty track, `now` parked at the left end, a gauge under the limit, one
  // counter's worth of memory, an empty bucket, and nothing in flight.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
