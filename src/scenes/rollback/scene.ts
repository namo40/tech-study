import {
  CHIP_IDS,
  ESCAPE_MAX,
  OK_MAX,
  REV_IDS,
  SCENE_DURATION,
  STAGE_STATE,
  X_LANE,
  Y_RELEASES_BOTTOM,
  Y_RELEASES_TOP,
  Y_STATE_TOP,
  Y_TRAFFIC_BOTTOM,
} from './stage';
import type { ChipState, Mark, RevId, RevState } from './stage';
import { q } from '../shared/dom';
import { hideRequest, markRequest, mountRequests, parkRequest, showRequest } from '../shared/request';
import { createScheduler } from '../shared/simulation';
import { attr, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Rollback scene: a 24 second, four step timeline.
 *
 * The same two rules as every other scene: every tween sits at an absolute
 * position, and every discrete change is a zero-duration tween on a `data-*`
 * attribute that GSAP reverts when the playhead moves back past it. Nothing on
 * this stage is a continuous quantity — a card is in one of six states, a chip
 * holds one of three answers, the database holds `old` records or `old` and
 * `new` — so every frame is a set of stacked variants and scrubbing backwards
 * lands on a value rather than on a blend of two.
 *
 * Nothing the reader reads is authored. The scene is told when requests leave,
 * where the `active` pointer is at each moment and what each card says about
 * itself, which revision is the bad one, when the ghost's rebuild inches
 * forward and when the ghost is taken away, when the bad revision writes a
 * record in its own shape, when the compatible window is opened, when the side
 * effects go out, and when the picture is called settled.
 *
 * Everything else falls out of one pass over that. **Whether an answer is good**
 * is a question asked of the revision the pointer was on when the answer came
 * back: a bad revision answers badly, and so does a good one that is being
 * asked to read a record written in a shape it has never seen. That second
 * clause is the whole of the third step, and it is the reason the return road
 * can be closed by something other than the deploy. **The `err n` readout** is
 * the number of errors among the last three answers, so it climbs one answer at
 * a time and falls one answer at a time; it is never set, and it never moves on
 * its own. **The detection instant** is wherever that readout first reaches the
 * threshold, which is what makes the rollback a consequence of the incident
 * rather than a beat placed on a clock. **`ok n`** counts every good answer the
 * scene ever gives, so it stops climbing during an incident and starts again
 * when the return road is taken.
 *
 * Three things the model refuses to let the timeline pretend. The ghost has no
 * shelf, because a world that throws the old revision away has no history to
 * roll back to. No rebuild is ever drawn outside the ghost, because a rollback
 * is a pointer move and not a deployment. And the `new` records and the escaped
 * effects never come off the stage once they are on it, because neither data
 * nor a sent email rolls back with the code.
 *
 * This scene does not own the forward road. Blue-Green Deployment owns the
 * switch between two live environments, Canary Release owns who sees a new
 * version first, and Database Migration owns how a schema change is rolled out.
 * What is owned here is the road back: the revision kept warm, the pointer
 * moving to it, and the three kinds of damage that will not follow it.
 */

const ID = 'rollback';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- how a traveller moves -------------------------------------------------

/** Seconds a request takes from Traffic to Releases: 200px. */
const CALL_LEG = 0.22;
/** Seconds a write takes from Releases to State: 230px, the same speed. */
const WRITE_LEG = 0.25;
/** Seconds the active revision spends on a request before it answers. */
const DWELL = 0.06;
/** How long a traveller takes to go once it is answered or absorbed. */
const FADE = 0.06;

/** Departure to the instant the answer pops, and departure to gone. */
const ANSWER_AT = CALL_LEG + DWELL;
const CALL_LIFE = CALL_LEG + DWELL + CALL_LEG + FADE;
const WRITE_LIFE = WRITE_LEG + FADE;

/** The halo diameter two travellers on one lane must always keep between them. */
const HALO = 52;

// --- what the scene is told ------------------------------------------------

/**
 * How often a request leaves Traffic. It is longer than one whole round trip
 * on purpose: the answer rides the same lane back up, so the lane is empty
 * again before the next request is allowed onto it.
 */
const CADENCE = 0.6;

/** When traffic runs in each step, and how many requests that step sends. */
const WINDOWS = [
  { from: 0.56, count: 8 },
  { from: 6.68, count: 8 },
  { from: 12.56, count: 8 },
  { from: 18.16, count: 7 },
];

/** Where the `active` pointer is, and when it moves. */
const POINTER: [number, RevId][] = [
  [0, 'v1'],
  [0.5, 'v2'],
  [3.0, 'v1'],
  [6.5, 'v2'],
  [9.2, 'v1'],
  [12.5, 'v2'],
  [14.4, 'v1'],
  [21.0, 'v3'],
];

/**
 * What each card says about itself. `v2` keeps saying `bad` after the pointer
 * has left it, because a rolled-back revision is evidence and is kept rather
 * than overwritten; inside the ghost it is taken away with the world it was
 * drawn in.
 */
const REV_PLAN: Record<RevId, [number, RevState][]> = {
  v1: [
    [0, 'live'],
    [0.5, 'gone'],
    [3.0, 'live'],
    [6.5, 'shelf'],
    [9.2, 'live'],
    [12.5, 'shelf'],
    [14.4, 'live'],
    [21.0, 'shelf'],
  ],
  v2: [
    [0, 'none'],
    [0.5, 'bad'],
    [3.0, 'none'],
    [6.5, 'bad'],
  ],
  v3: [
    [0, 'none'],
    [20.2, 'ready'],
    [21.0, 'live'],
  ],
};

/** Which revision answers badly whenever it is the one being asked. */
const BAD: Record<RevId, boolean> = { v1: false, v2: true, v3: false };

/** The revision whose record shape is `new`. Anything older cannot read it. */
const NEW_WRITER: RevId = 'v2';

/** When the world without revision history is taken away. */
const GHOST_END = 3.0;

/** How far the ghost's rebuild gets, which is the point: not far. */
const BUILD_STEPS: [number, string][] = [
  [2.2, '1'],
  [2.7, '2'],
];

/** When the bad revision writes a record in its own shape. */
const WRITES = [13.4];

/** When the compatible window is opened, so neighbours read each other. */
const COMPAT_AT = 15.6;

/** When the effects that already left are shown leaving. */
const EFFECTS = [18.5, 18.9];

/** When the picture is called settled: forward, clean and quiet. */
const SETTLE_AT = 22.5;

/** How many errors in the last three answers count as an incident. */
const ERR_THRESHOLD = 3;

/** The six things the scene holds up, and how long each is held for. */
const MARK_AT: [number, Mark, number][] = [
  [2.2, 'noway', 0.7],
  [3.94, 'keep', 0.4],
  [4.8, 'road', 0.5],
  [11.5, 'fast', 0.4],
  [17.5, 'wide', 0.4],
  [19.4, 'gone', 0.5],
];

/** The shortest gap between any two cues, and how quiet a step boundary is. */
const MIN_CUE_GAP = 0.2;
/** What a cue that only adds colour has to clear, which is more. */
const SAMPLE_GAP = 0.35;
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

/** What a traveller is carrying, which is also how it is drawn. */
type RideKind = 'call' | 'write' | 'effect';

/** One traveller, on one lane, in one direction. */
interface Ride {
  kind: RideKind;
  from: number;
  to: number;
  startAt: number;
  leg: number;
  /** Absolute time the result marker is put on, when there is one. */
  markAt: number | null;
  result: 'ok' | 'fail';
  /** Absolute time the traveller starts fading. */
  fadeAt: number;
  /** The whole return trip, for a request that carries its answer home. */
  backAt: number | null;
}

/** One answer, once the scene has worked out who gave it. */
interface Answer {
  at: number;
  rev: RevId;
  ok: boolean;
  /** Why a bad answer was bad, which is the difference the third step is about. */
  reason: 'bad' | 'unreadable' | null;
}

interface Simulation {
  changes: AttrChange[];
  cues: [number, SceneCue][];
  rides: Ride[];
  answers: Answer[];
  /** Reported rather than drawn: what the run actually produced. */
  detections: number[];
  errPeak: number;
  okTotal: number;
}

/** The value in force at `at` in an authored series. */
function valueOf<T>(series: [number, T][], at: number, fallback: T): T {
  let held = fallback;
  for (const [when, value] of series) {
    if (when > at + EPS) break;
    held = value;
  }
  return held;
}

const revIndex = (id: RevId): number => REV_IDS.indexOf(id);

// --- the simulation --------------------------------------------------------

function simulate(): Simulation {
  const raw: AttrChange[] = [];
  const fixed: [number, SceneCue][] = [];
  const samples: [number, SceneCue][] = [];
  const rides: Ride[] = [];
  const answers: Answer[] = [];
  const detections: number[] = [];
  const problems: string[] = [];

  const gaps = new Map<number, number>();

  const setAttr = (at: number, target: string, name: string, value: string): void => {
    raw.push({ at: round(at), target, name, value });
  };
  const stage = (at: number, name: string, value: string): void => {
    setAttr(at, 'stage', `data-rbk-${name}`, value);
  };
  const cue = (at: number, name: SceneCue): void => {
    fixed.push([round(at), name]);
  };
  const sample = (at: number, name: SceneCue, gap: number): void => {
    samples.push([round(at), name]);
    gaps.set(round(at), gap);
  };

  /** The window of answers `err n` is counted over, oldest first. */
  const chips: ChipState[] = CHIP_IDS.map(() => 'none');
  let errValue = 0;
  let okValue = 0;
  let errPeak = 0;

  /** When the errors were last given a reason to stop. */
  let recoveredAt = -Infinity;
  /** When the last bad answer came back, so a fall can be attributed. */
  let lastBadAnswer = -Infinity;
  /** Whether the readout is already inside an incident. */
  let inIncident = false;
  let warnOn = false;
  let dbHasNew = false;
  let escaped = 0;

  const { schedule, drain } = createScheduler();

  // --- what the stage is told, ahead of anything that is derived -----------

  stage(0, 'mode', 'ghost');
  schedule(GHOST_END, () => {
    stage(GHOST_END, 'mode', 'history');
    recoveredAt = GHOST_END;
  });

  for (const [at, id] of POINTER) {
    if (at === 0) {
      stage(0, 'active', id);
      continue;
    }
    schedule(at, () => {
      stage(at, 'active', id);
      // A pointer move is the only thing that can stop a bad revision
      // answering, so it is also the only thing a fall in `err n` is allowed
      // to be attributed to.
      recoveredAt = at;
      if (at === GHOST_END) cue(at, 'trip');
      else cue(at, id === 'v3' ? 'success' : 'state');
    });
  }

  for (const id of REV_IDS) {
    for (const [at, state] of REV_PLAN[id]) {
      if (at === 0) setAttr(0, id, 'data-rbk-rev', state);
      else schedule(at, () => setAttr(at, id, 'data-rbk-rev', state));
    }
  }
  // Standing by is a beat of its own: the fix is built before it is pointed at.
  const readyAt = REV_PLAN.v3.find(([, state]) => state === 'ready')?.[0];
  if (readyAt !== undefined) schedule(readyAt, () => cue(readyAt, 'state'));

  stage(0, 'build', 'off');
  for (const [at, value] of BUILD_STEPS) schedule(at, () => stage(at, 'build', value));
  schedule(GHOST_END, () => stage(GHOST_END, 'build', 'off'));

  stage(0, 'db', 'old');
  stage(0, 'compat', 'off');
  stage(0, 'warn', 'off');
  stage(0, 'escaped', '0');
  stage(0, 'err', '0');
  stage(0, 'ok', '0');
  stage(0, 'mark', 'none');
  stage(0, 'settled', 'off');
  for (const id of CHIP_IDS) setAttr(0, id, 'data-rbk-chip', 'none');

  schedule(COMPAT_AT, () => {
    stage(COMPAT_AT, 'compat', 'on');
    if (warnOn) {
      warnOn = false;
      stage(COMPAT_AT, 'warn', 'off');
    }
    // Widening the schema is the other thing that can stop the errors, and it
    // is the only one that is not a pointer move.
    recoveredAt = COMPAT_AT;
    cue(COMPAT_AT, 'state');
  });

  for (const [at, mark, hold] of MARK_AT) {
    schedule(at, () => {
      stage(at, 'mark', mark);
      stage(round(at + hold), 'mark', 'none');
      cue(at, mark === 'noway' ? 'failure' : 'state');
    });
  }

  schedule(SETTLE_AT, () => {
    stage(SETTLE_AT, 'settled', 'on');
    cue(SETTLE_AT, 'success');
  });

  // --- what travels --------------------------------------------------------

  const ride = (
    kind: RideKind,
    from: number,
    to: number,
    startAt: number,
    leg: number,
    markAt: number | null,
    result: 'ok' | 'fail',
    fadeAt: number,
    backAt: number | null,
  ): void => {
    rides.push({ kind, from, to, startAt, leg, markAt, result, fadeAt, backAt });
  };

  for (const at of WRITES) {
    schedule(at, () => {
      const lands = round(at + WRITE_LEG);
      ride('write', Y_RELEASES_BOTTOM, Y_STATE_TOP, at, WRITE_LEG, lands, 'ok', lands, null);
      schedule(lands, () => {
        if (dbHasNew) return;
        dbHasNew = true;
        stage(lands, 'db', 'both');
        cue(lands, 'state');
      });
    });
  }

  for (const at of EFFECTS) {
    schedule(at, () => {
      const lands = round(at + WRITE_LEG);
      ride('effect', Y_RELEASES_BOTTOM, Y_STATE_TOP, at, WRITE_LEG, null, 'ok', lands, null);
      schedule(lands, () => {
        escaped += 1;
        if (escaped > ESCAPE_MAX) {
          problems.push(`${lands} more effects escaped than the band ever drew`);
          return;
        }
        stage(lands, 'escaped', String(escaped));
        cue(lands, 'state');
      });
    });
  }

  /** Who is answering at `at`, and whether the answer is any good. */
  const verdict = (at: number): { rev: RevId; ok: boolean; reason: 'bad' | 'unreadable' | null } => {
    const rev = valueOf(POINTER, at, 'v1');
    if (BAD[rev]) return { rev, ok: false, reason: 'bad' };
    // The other way an answer goes wrong: code that went back is being handed a
    // record written in a shape it has never seen.
    const compat = at >= COMPAT_AT - EPS;
    if (dbHasNew && !compat && revIndex(rev) < revIndex(NEW_WRITER)) {
      return { rev, ok: false, reason: 'unreadable' };
    }
    return { rev, ok: true, reason: null };
  };

  for (const window of WINDOWS) {
    for (let n = 0; n < window.count; n += 1) {
      const at = round(window.from + n * CADENCE);
      const answerAt = round(at + ANSWER_AT);
      const backAt = round(answerAt + CALL_LEG);
      schedule(at, () => {
        schedule(answerAt, () => {
          const { rev, ok, reason } = verdict(answerAt);
          answers.push({ at: answerAt, rev, ok, reason });
          ride(
            'call',
            Y_TRAFFIC_BOTTOM,
            Y_RELEASES_TOP,
            at,
            CALL_LEG,
            answerAt,
            ok ? 'ok' : 'fail',
            backAt,
            backAt,
          );

          if (!ok) lastBadAnswer = answerAt;

          // The window slides by exactly one answer, so the readout moves by at
          // most one and is never set from outside.
          chips.shift();
          chips.push(ok ? 'ok' : 'err');
          chips.forEach((state, index) => {
            const id = CHIP_IDS[index];
            if (id) setAttr(answerAt, id, 'data-rbk-chip', state);
          });

          const before = errValue;
          errValue = chips.filter((state) => state === 'err').length;
          errPeak = Math.max(errPeak, errValue);
          if (errValue !== before) stage(answerAt, 'err', String(errValue));

          if (ok) {
            okValue += 1;
            if (okValue > OK_MAX) {
              problems.push(`${answerAt} the readout was asked for ok ${okValue}, which the stage never drew`);
            } else {
              stage(answerAt, 'ok', String(okValue));
            }
          }

          // A fall in the readout has to have a cause, and the cause has to be
          // more recent than the last bad answer.
          if (errValue < before && !(recoveredAt > lastBadAnswer - EPS && recoveredAt <= answerAt + EPS)) {
            problems.push(`${answerAt} the readout fell with nothing to explain it`);
          }

          // The old code meeting a record it cannot read is worth saying once,
          // where the reader sees the answer come back wrong.
          if (reason === 'unreadable' && !warnOn) {
            warnOn = true;
            stage(answerAt, 'warn', 'on');
            cue(answerAt, 'state');
          }

          // The incident is detected where the readout crosses the threshold,
          // and only in a world that has somewhere to go back to.
          if (errValue >= ERR_THRESHOLD && !inIncident) {
            inIncident = true;
            if (answerAt > GHOST_END) {
              detections.push(answerAt);
              cue(answerAt, 'state');
            }
          }
          if (errValue === 0) inIncident = false;

          // Colour, and only where it is not stepping on something else: the
          // readout starting to climb, the first clean answer after the return
          // road was taken, the readout back to normal, and the last answer of
          // the scene.
          if (!ok && errValue === 2 && before === 1) sample(answerAt, 'state', SAMPLE_GAP);
          if (ok && before > 0 && recoveredAt > -Infinity && answerAt - recoveredAt < 1.2) {
            sample(answerAt, 'success', MIN_CUE_GAP);
          }
          if (ok && errValue === 0 && before > 0) sample(answerAt, 'success', SAMPLE_GAP);
        });
      });
    }
  }

  drain();

  // The last answer the scene gives is worth hearing as the thing that settled.
  let lastAnswer: Answer | undefined;
  for (const entry of answers) if (!lastAnswer || entry.at > lastAnswer.at) lastAnswer = entry;
  if (lastAnswer && lastAnswer.ok) sample(lastAnswer.at, 'success', SAMPLE_GAP);

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
    const prior = held.get(key) ?? STAGE_STATE[key];
    held.set(key, change.value);
    if (prior === change.value) continue;
    changes.push({ at: change.at, target: change.target, name: change.name, value: change.value });
  }

  const valueAt = (target: string, name: string, at: number): string => {
    let value = STAGE_STATE[`${target}@${name}`] ?? '';
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
    const want = gaps.get(entry[0]) ?? SAMPLE_GAP;
    if (cues.some(([other]) => Math.abs(other - entry[0]) < want - EPS)) continue;
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

  // --- the lanes ------------------------------------------------------------

  const laneOf = (ride: Ride): 'call' | 'write' =>
    ride.from === Y_TRAFFIC_BOTTOM || ride.from === Y_RELEASES_TOP ? 'call' : 'write';
  const endsOf = (ride: Ride): number[] =>
    laneOf(ride) === 'call'
      ? [Y_TRAFFIC_BOTTOM, Y_RELEASES_TOP]
      : [Y_RELEASES_BOTTOM, Y_STATE_TOP];
  const goneAt = (ride: Ride): number => round(ride.fadeAt + FADE);
  const whereAt = (ride: Ride, at: number): number => {
    if (at <= ride.startAt) return ride.from;
    const down = Math.min(at, ride.startAt + ride.leg);
    let y = ride.from + ((ride.to - ride.from) * (down - ride.startAt)) / ride.leg;
    if (ride.backAt === null || ride.markAt === null) return y;
    if (at <= ride.markAt) return y;
    const up = Math.min(at, ride.backAt);
    y = ride.to + ((ride.from - ride.to) * (up - ride.markAt)) / ride.leg;
    return y;
  };

  for (const entry of rides) {
    const ends = endsOf(entry);
    if (!ends.includes(entry.from) || !ends.includes(entry.to)) {
      problems.push(`a ${entry.kind} leg at ${entry.startAt} does not end on a box edge`);
    }
    if (entry.startAt < 0 || goneAt(entry) > SCENE_DURATION) {
      problems.push(`a traveller runs off the end of the scene at ${entry.startAt}`);
    }
    const life = round(goneAt(entry) - entry.startAt);
    const want = entry.kind === 'call' ? CALL_LIFE : WRITE_LIFE;
    if (Math.abs(life - want) > 1e-6) {
      problems.push(`a ${entry.kind} at ${entry.startAt} lives ${life}s rather than ${want}s`);
    }
  }
  // The lane is only ever asked to hold one traveller, so the cadence has to be
  // longer than a whole round trip rather than merely longer than the way down.
  if (CADENCE < CALL_LIFE - EPS) {
    problems.push(`requests leave every ${CADENCE}s and a round trip takes ${CALL_LIFE}s`);
  }

  let closest = Infinity;
  let closestName = '';
  for (const lane of ['call', 'write'] as const) {
    const onLane = rides.filter((entry) => laneOf(entry) === lane);
    for (let a = 0; a < onLane.length; a += 1) {
      for (let b = a + 1; b < onLane.length; b += 1) {
        const left = onLane[a];
        const right = onLane[b];
        if (!left || !right) continue;
        const from = Math.max(left.startAt, right.startAt);
        const to = Math.min(goneAt(left), goneAt(right));
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

  // --- the things the model refuses to let the timeline pretend ------------

  const instants = [0, ...changes.map((change) => change.at), ...BOUNDARIES, SCENE_DURATION];
  for (const at of [...new Set(instants)].sort((left, right) => left - right)) {
    const mode = valueAt('stage', 'data-rbk-mode', at);
    const states = REV_IDS.map((id) => valueAt(id, 'data-rbk-rev', at));

    // A world that throws the old revision away has no shelf to go back to.
    if (mode === 'ghost' && states.includes('shelf')) {
      problems.push(`${at} the ghost is showing a shelf`);
    }
    // A rollback is a pointer move. Nothing outside the ghost ever rebuilds.
    if (mode !== 'ghost' && valueAt('stage', 'data-rbk-build', at) !== 'off') {
      problems.push(`${at} something is being rebuilt outside the ghost`);
    }
    // Once there is a shelf, a newer revision is never live without an older
    // one still standing behind it.
    const active = valueAt('stage', 'data-rbk-active', at) as RevId;
    if (mode !== 'ghost' && revIndex(active) > 0) {
      const behind = states
        .slice(0, revIndex(active))
        .some((state) => state === 'shelf' || state === 'bad' || state === 'live');
      if (!behind) problems.push(`${at} ${active} is live with nothing behind it`);
    }
  }

  // Data does not roll back, and neither does a sent email.
  let sawNew = false;
  let escapeHigh = 0;
  for (const change of changes) {
    if (change.name === 'data-rbk-db') {
      if (change.value === 'both') sawNew = true;
      else if (sawNew) problems.push(`${change.at} the new records went away again`);
    }
    if (change.name === 'data-rbk-escaped') {
      const value = Number(change.value);
      if (value < escapeHigh) problems.push(`${change.at} an escaped effect was taken back`);
      escapeHigh = Math.max(escapeHigh, value);
    }
  }

  // --- the boundaries and the closing frame --------------------------------

  for (const edge of BOUNDARIES) {
    for (const entry of rides) {
      if (entry.startAt < edge - EPS && goneAt(entry) > edge + EPS) {
        problems.push(`something is in flight on the boundary at ${edge}`);
      }
    }
    if (valueAt('stage', 'data-rbk-mark', edge) !== 'none') {
      problems.push(`a highlight is up on the boundary at ${edge}`);
    }
    if (valueAt('stage', 'data-rbk-err', edge) !== '0') {
      problems.push(`the readout is not back to normal on the boundary at ${edge}`);
    }
    if (valueAt('stage', 'data-rbk-build', edge) !== 'off') {
      problems.push(`a build is running on the boundary at ${edge}`);
    }
    if (valueAt('stage', 'data-rbk-warn', edge) !== 'off') {
      problems.push(`a warning is up on the boundary at ${edge}`);
    }
  }
  if (valueAt('stage', 'data-rbk-active', SCENE_DURATION) !== 'v3') {
    problems.push('the scene does not end on the corrected release');
  }
  if (valueAt('stage', 'data-rbk-settled', SCENE_DURATION) !== 'on') {
    problems.push('the scene does not end settled');
  }
  if (valueAt('stage', 'data-rbk-compat', SCENE_DURATION) !== 'on') {
    problems.push('the scene does not end with the compatible window open');
  }
  if (valueAt('stage', 'data-rbk-escaped', SCENE_DURATION) !== String(ESCAPE_MAX)) {
    problems.push('the scene does not end with what escaped still on the stage');
  }
  if (detections.length !== 2) {
    problems.push(`the readout crossed the threshold ${detections.length} times outside the ghost`);
  }

  if (problems.length > 0) throw new Error(`${ID} scene: ${[...new Set(problems)].join('; ')}`);

  rides.sort((left, right) => left.startAt - right.startAt);
  answers.sort((left, right) => left.at - right.at);
  return { changes, cues, rides, answers, detections, errPeak, okTotal: okValue };
}

// --- the timeline ----------------------------------------------------------

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);
  const sim = simulate();

  // The captions name the figures the model produced. Nothing here places them:
  // if the schedule changes, this is what says the captions have stopped
  // describing the scene.
  if (sim.errPeak < ERR_THRESHOLD) {
    throw new Error(`${ID} scene: the incidents never reach the threshold the captions promise`);
  }
  if (!sim.answers.some((answer) => answer.reason === 'unreadable')) {
    throw new Error(`${ID} scene: the third step promises old code meeting a record it cannot read`);
  }
  if (!sim.answers.some((answer) => answer.rev === 'v3' && answer.ok)) {
    throw new Error(`${ID} scene: the fourth step promises a corrected release answering`);
  }

  const targets = new Map<string, Element>();
  targets.set('stage', stage);
  for (const id of REV_IDS) targets.set(id, q<SVGGElement>(stage, `.rbk-rev--${id}`, ID));
  for (const id of CHIP_IDS) targets.set(id, q<SVGGElement>(stage, `.rbk-chip--${id}`, ID));

  const tl = createSceneTimeline();

  // --- everything the stage says about itself ------------------------------

  for (const change of sim.changes) {
    const target = targets.get(change.target);
    if (!target) throw new Error(`${ID} scene: nothing on the stage is called "${change.target}"`);
    attr(tl, target, change.name, change.value, change.at);
  }

  // --- what travels --------------------------------------------------------

  const parts = mountRequests(layer, sim.rides.length, ID);

  sim.rides.forEach((ride, index) => {
    const group = parts[index];
    if (!group) return;
    group.group.classList.add(`rbk-req--${ride.kind}`);

    parkRequest(group, X_LANE, ride.from);
    showRequest(tl, group, ride.startAt);
    tl.to(
      group.group,
      { y: ride.to, duration: ride.leg, ease: 'none', immediateRender: false },
      ride.startAt,
    );
    if (ride.markAt !== null) markRequest(tl, group, ride.result, ride.markAt);
    if (ride.backAt !== null && ride.markAt !== null) {
      tl.to(
        group.group,
        { y: ride.from, duration: ride.leg, ease: 'none', immediateRender: false },
        ride.markAt,
      );
    }
    hideRequest(tl, group, ride.fadeAt, FADE);
  });

  // --- sound ---------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels ---------------------------------------------------------

  // The stage is complete on the first frame: one revision live, two slots that
  // were never deployed, no shelf because this world has no history yet, three
  // empty answer chips, a database of `old` records and nothing in flight.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
