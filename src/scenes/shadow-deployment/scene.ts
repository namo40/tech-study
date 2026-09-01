import {
  OK_MAX,
  SAME_MAX,
  SCENE_DURATION,
  SIDE_IDS,
  STAGE_STATE,
  TARGET_IDS,
  X_CALL,
  X_LIVE_LANE,
  X_SHADOW_LANE,
  Y_EFFECTS_TOP,
  Y_TRAFFIC_BOTTOM,
  Y_VERSIONS_BOTTOM,
  Y_VERSIONS_TOP,
} from './stage';
import type { ForkState, GhostState, Mark, SideId, SideState, TargetId, TargetState } from './stage';
import { q } from '../shared/dom';
import { hideRequest, markRequest, mountRequests, parkRequest, showRequest } from '../shared/request';
import { createScheduler } from '../shared/simulation';
import { attr, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Shadow Deployment scene: a 24 second, four step timeline.
 *
 * The same two rules as every other scene: every tween sits at an absolute
 * position, and every discrete change is a zero-duration tween on a `data-*`
 * attribute that GSAP reverts when the playhead moves back past it. Nothing on
 * this stage is a continuous quantity — a version card is in one of six states,
 * a target has seen a pass, a stop, both or neither, a readout holds a whole
 * number — so every frame is a set of stacked variants and scrubbing backwards
 * lands on a value rather than on a blend of two.
 *
 * Nothing the reader reads is authored. The scene is told when the ghost's
 * synthetic load runs and when it meets production, when requests leave, when
 * the fork starts copying, what each version card says about itself and when,
 * when the cage is configured, which single mirrored request the shadow answers
 * differently, when a side effect is attempted and by which version against
 * which target, when the version is promoted, and how fast each leg is
 * travelled.
 *
 * Everything else falls out of one pass over that, and three derivations carry
 * the argument. **Who answered a user** is whichever card is `serving` at the
 * instant the answer pops, which is what makes "the shadow never answers a
 * user" a fact about the model rather than a promise in the caption: before the
 * promotion no card but `live` is ever in that state. **Whether an effect gets
 * out** is asked of the card it came from and the gate: a card that is serving
 * sends real effects and they land, a card taking copies is making an attempt
 * and the attempt bounces for as long as the gate is armed — which is why the
 * very same card's write passes after the promotion without a single line
 * changing to say so, and why an attempt is drawn creeping while a real effect
 * is drawn at speed. **What the comparator says** is the shadow's answer plan
 * read one request at a time: `same n` is the length of the current matching
 * run, so it only ever climbs by one and the single mismatch is the only thing
 * in the scene that can take it back to nothing.
 *
 * Four things the model refuses to let the timeline pretend. The cage is armed
 * before the first copy is ever sent, because auditing what a service emits is
 * something you do before you mirror and not after. The doubled-send warning is
 * only allowed to appear once the same target has really seen both a stopped
 * attempt and a delivered send, so the claim it makes is one the stage can
 * back up. `same n` never falls except on the mismatch. And no user answer, at
 * any instant before the promotion, comes from anything but the live version.
 *
 * This scene does not own the forward road. Canary Release owns letting some
 * real users onto a new version, Blue-Green Deployment owns the switch between
 * two live environments, and Rollback owns the way back. What is owned here is
 * the proving that happens with nobody watching: a copy of production traffic,
 * a comparator instead of a socket, and a cage made of configuration.
 */

const ID = 'shadow-deployment';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- how a traveller moves -------------------------------------------------

/** Seconds a request takes from Traffic to Versions: 200px. */
const CALL_LEG = 0.22;
/** Seconds the serving version spends on a request before it answers. */
const DWELL = 0.06;
/** Seconds a real side effect takes from Versions to Effects: 230px. */
const EFFECT_LEG = 0.25;
/**
 * Seconds an attempt takes over the same 230px. It is drawn creeping rather
 * than travelling, because it is not going anywhere: the gate is what it is
 * about to meet, and the picture should have time to say so.
 */
const ATTEMPT_LEG = 0.9;
/** How long a traveller takes to go once it is answered or absorbed. */
const FADE = 0.06;

/** Departure to the instant the answer pops, and departure to gone. */
const ANSWER_AT = CALL_LEG + DWELL;
const CALL_LIFE = CALL_LEG + DWELL + CALL_LEG + FADE;

/**
 * Departure to the instant the comparator has a verdict. It is longer than the
 * live answer on purpose: the comparator has to wait for the second answer and
 * normalise both before it can say anything about them.
 */
const COMPARE_LAG = 0.62;

/** The halo diameter two travellers on one lane must always keep between them. */
const HALO = 52;

// --- what the scene is told ------------------------------------------------

/** When each user request leaves the Traffic band. */
const REQUESTS = [8.12, 9.92, 12.72, 14.45, 18.14, 19.58, 20.28, 21.72];

/** The one mirrored request the shadow answers differently, by its index. */
const DIFF_INDEX = 4;

/** The world the first step is set in, stage by stage. */
const GHOST_PLAN: [number, GhostState][] = [
  [0, 'idle'],
  [0.5, 'pass'],
  [1.4, 'deploy'],
  [2.2, 'break'],
  [3.0, 'off'],
];

/** When the copy starts being made, and when there is only one version left. */
const FORK_PLAN: [number, ForkState][] = [
  [0, 'solo'],
  [7.4, 'mirror'],
  [21.2, 'new'],
];

/** What each version card says about itself, and from when. */
const SIDE_PLAN: Record<SideId, [number, SideState][]> = {
  live: [
    [0, 'serving'],
    [21.2, 'retired'],
  ],
  shadow: [
    [0, 'empty'],
    [6.5, 'warm'],
    [7.4, 'mirror'],
    [19.4, 'fix'],
    [20.2, 'mirror'],
    [21.2, 'serving'],
  ],
};

/**
 * When the cage is built: the settings that split the environment and the gate
 * that stops what gets past them. It is deliberately earlier than the first
 * copy, because working out what a service emits is something you finish before
 * you mirror anything at it.
 */
const CAGE_AT = 6.5;

/** When the shadow takes the live version's place. */
const PROMOTE_AT = 21.2;

/** One attempted side effect: when it leaves, which card sent it, and at what. */
const EFFECTS: [number, SideId, TargetId][] = [
  [12.5, 'shadow', 'db'],
  [13.95, 'live', 'db'],
  [14.3, 'shadow', 'mail'],
  [15.45, 'live', 'mail'],
  [21.95, 'shadow', 'db'],
];

/** When the settings themselves are held up, and for how long. */
const SPLIT_AT = 16.0;
const SPLIT_HOLD = 0.6;

/** When the scene shows what the gate stopped, and for how long. */
const TWICE_AT = 16.95;
const TWICE_HOLD = 0.4;

/** How long the gate stays lit after something has bounced off it. */
const HIT_HOLD = 0.4;

/** When the picture is called settled: promoted, quiet and nothing in flight. */
const SETTLE_AT = 22.4;

/** The four things the scene holds up, and how long each is held for. */
const MARK_AT: [number, Mark, number][] = [
  [3.0, 'shadow', 0.6],
  [3.9, 'copy', 0.5],
  [4.8, 'unseen', 0.4],
  [11.0, 'zero', 0.3],
];

/** The shortest gap between any two cues, and how quiet a step boundary is. */
const MIN_CUE_GAP = 0.2;
/** What a cue that only adds colour has to clear, which is more. */
const SAMPLE_GAP = 0.28;
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
type RideKind = 'call' | 'effect' | 'attempt';

/** One traveller, on one lane, in one direction. */
interface Ride {
  kind: RideKind;
  lane: number;
  from: number;
  to: number;
  startAt: number;
  leg: number;
  /** Absolute time the result marker is put on. */
  markAt: number;
  result: 'ok' | 'fail';
  /** Absolute time the traveller starts fading. */
  fadeAt: number;
  /** The return trip, for a request that carries its answer home. */
  backAt: number | null;
}

/** One answer a user received, once the scene has worked out who gave it. */
interface Answer {
  at: number;
  from: SideId;
  ok: number;
}

/** One verdict the comparator reached about one mirrored request. */
interface Comparison {
  at: number;
  same: boolean;
  run: number;
}

/** One side effect, once the scene has worked out whether it got out. */
interface Emission {
  at: number;
  from: SideId;
  target: TargetId;
  passed: boolean;
}

interface Simulation {
  changes: AttrChange[];
  cues: [number, SceneCue][];
  rides: Ride[];
  answers: Answer[];
  comparisons: Comparison[];
  emissions: Emission[];
  okTotal: number;
  sameHigh: number;
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

/** What a target card says once it has seen one more thing happen to it. */
function withOutcome(state: TargetState, passed: boolean): TargetState {
  if (passed) return state === 'blocked' || state === 'both' ? 'both' : 'pass';
  return state === 'pass' || state === 'both' ? 'both' : 'blocked';
}

// --- the simulation --------------------------------------------------------

function simulate(): Simulation {
  const raw: AttrChange[] = [];
  const fixed: [number, SceneCue][] = [];
  const samples: [number, SceneCue][] = [];
  const rides: Ride[] = [];
  const answers: Answer[] = [];
  const comparisons: Comparison[] = [];
  const emissions: Emission[] = [];
  const problems: string[] = [];

  const setAttr = (at: number, target: string, name: string, value: string): void => {
    raw.push({ at: round(at), target, name, value });
  };
  const stage = (at: number, name: string, value: string): void => {
    setAttr(at, 'stage', `data-sd-${name}`, value);
  };
  const cue = (at: number, name: SceneCue): void => {
    fixed.push([round(at), name]);
  };
  const sample = (at: number, name: SceneCue): void => {
    samples.push([round(at), name]);
  };

  /** What a version card is saying about itself at `at`, from the authored plan. */
  const sideAt = (id: SideId, at: number): SideState =>
    valueOf(SIDE_PLAN[id], at, 'empty');
  /** Which card, if any, is holding real traffic at `at`. */
  const servingAt = (at: number): SideId | null =>
    SIDE_IDS.find((id) => sideAt(id, at) === 'serving') ?? null;
  /** Whether the copy is being made at `at`. */
  const mirroringAt = (at: number): boolean => valueOf(FORK_PLAN, at, 'solo') === 'mirror';
  /** Whether the gate is standing at `at`. */
  const cagedAt = (at: number): boolean => at >= CAGE_AT - EPS && at < PROMOTE_AT - EPS;

  let okValue = 0;
  let heardAnAttempt = false;
  let sameRun = 0;
  let sameHigh = 0;
  let verdict = 'idle';
  const targets: Record<TargetId, TargetState> = { db: 'none', mail: 'none' };
  /** What each target has really seen, so the warning can only claim the truth. */
  const stopped: Record<TargetId, boolean> = { db: false, mail: false };
  const delivered: Record<TargetId, boolean> = { db: false, mail: false };

  const { schedule, drain } = createScheduler();

  // --- what the stage is told, ahead of anything that is derived -----------

  for (const [at, state] of GHOST_PLAN) {
    if (at === 0) {
      stage(0, 'ghost', state);
      continue;
    }
    schedule(at, () => {
      stage(at, 'ghost', state);
      // The one thing in the scene that is genuinely wrong is the moment a
      // build that passed a fake load meets the real shape of production.
      if (state === 'break') cue(at, 'failure');
      // Letting the ghost go is the turn the whole scene hangs on.
      else if (state === 'off') cue(at, 'trip');
      else cue(at, 'state');
    });
  }

  for (const [at, state] of FORK_PLAN) {
    if (at === 0) stage(0, 'fork', state);
    else schedule(at, () => stage(at, 'fork', state));
  }
  // Starting to copy is a beat of its own; the promotion is announced below,
  // where the two cards change places.
  schedule(7.4, () => cue(7.4, 'state'));

  for (const id of SIDE_IDS) {
    for (const [at, state] of SIDE_PLAN[id]) {
      if (at === 0) setAttr(0, id, 'data-sd-side', state);
      else schedule(at, () => setAttr(at, id, 'data-sd-side', state));
    }
  }
  schedule(CAGE_AT, () => {
    // The audit happens here: what does this build write, charge and send, and
    // where can each of those be pointed instead. Only then is anything copied.
    stage(CAGE_AT, 'config', 'on');
    stage(CAGE_AT, 'block', 'armed');
    cue(CAGE_AT, 'state');
  });
  schedule(19.4, () => cue(19.4, 'state'));
  schedule(PROMOTE_AT, () => {
    // The cage was the difference between the two environments, so promoting
    // the shadow is also the moment there stops being a difference.
    stage(PROMOTE_AT, 'config', 'off');
    stage(PROMOTE_AT, 'block', 'off');
    verdict = 'done';
    stage(PROMOTE_AT, 'verdict', 'done');
    cue(PROMOTE_AT, 'state');
  });

  stage(0, 'ok', '0');
  stage(0, 'same', '0');
  stage(0, 'verdict', 'idle');
  stage(0, 'config', 'off');
  stage(0, 'block', 'off');
  stage(0, 'twice', 'off');
  stage(0, 'mark', 'none');
  stage(0, 'settled', 'off');
  for (const id of TARGET_IDS) setAttr(0, id, 'data-sd-target', 'none');

  schedule(SPLIT_AT, () => {
    stage(SPLIT_AT, 'config', 'split');
    stage(round(SPLIT_AT + SPLIT_HOLD), 'config', 'on');
    cue(SPLIT_AT, 'state');
  });

  schedule(TWICE_AT, () => {
    // The warning is only allowed to be shown once the stage can back it up:
    // this target really did stop one send and really did let another out.
    if (!stopped.mail || !delivered.mail) {
      problems.push(`${TWICE_AT} the doubled-send warning is shown with nothing behind it`);
      return;
    }
    stage(TWICE_AT, 'twice', 'on');
    stage(round(TWICE_AT + TWICE_HOLD), 'twice', 'off');
    cue(TWICE_AT, 'state');
  });

  for (const [at, mark, hold] of MARK_AT) {
    schedule(at, () => {
      stage(at, 'mark', mark);
      stage(round(at + hold), 'mark', 'none');
      // The turn at 3.0 already sounds as the ghost going, so the thing held up
      // on top of it is not sounded twice.
      if (mark !== 'shadow') cue(at, 'state');
    });
  }

  schedule(SETTLE_AT, () => {
    stage(SETTLE_AT, 'settled', 'on');
    cue(SETTLE_AT, 'success');
  });

  // --- what travels --------------------------------------------------------

  const ride = (
    kind: RideKind,
    lane: number,
    from: number,
    to: number,
    startAt: number,
    leg: number,
    markAt: number,
    result: 'ok' | 'fail',
    fadeAt: number,
    backAt: number | null,
  ): void => {
    rides.push({ kind, lane, from, to, startAt, leg, markAt, result, fadeAt, backAt });
  };

  REQUESTS.forEach((depart, index) => {
    const answerAt = round(depart + ANSWER_AT);
    const backAt = round(answerAt + CALL_LEG);
    schedule(depart, () => {
      schedule(answerAt, () => {
        // Whoever is holding real traffic answers. Nothing else can.
        const from = servingAt(answerAt);
        if (!from) {
          problems.push(`${answerAt} a user was answered with no version serving`);
          return;
        }
        if (answerAt < PROMOTE_AT - EPS && from !== 'live') {
          problems.push(`${answerAt} a user answer came from ${from} before the promotion`);
        }
        okValue += 1;
        if (okValue > OK_MAX) {
          problems.push(`${answerAt} the readout was asked for ok ${okValue}, which the stage never drew`);
        } else {
          stage(answerAt, 'ok', String(okValue));
        }
        answers.push({ at: answerAt, from, ok: okValue });
        ride('call', X_CALL, Y_TRAFFIC_BOTTOM, Y_VERSIONS_TOP, depart, CALL_LEG, answerAt, 'ok', backAt, backAt);
        cue(answerAt, 'success');
      });

      // The copy is only replayed while the fork is making one, so the last
      // request of the scene is compared against nothing: there is no shadow
      // left to compare it with.
      if (!mirroringAt(depart)) return;
      const verdictAt = round(depart + COMPARE_LAG);
      schedule(verdictAt, () => {
        const matched = index !== DIFF_INDEX;
        if (matched) {
          sameRun += 1;
          sameHigh = Math.max(sameHigh, sameRun);
          if (sameRun > SAME_MAX) {
            problems.push(`${verdictAt} the readout was asked for same ${sameRun}, which the stage never drew`);
            return;
          }
          stage(verdictAt, 'same', String(sameRun));
          // A run coming back after a mismatch is the fourth step's promise, so
          // it is heard rather than merely counted.
          const recovering = verdict === 'diff';
          verdict = 'same';
          stage(verdictAt, 'verdict', 'same');
          if (recovering) cue(verdictAt, 'success');
          else sample(verdictAt, 'state');
        } else {
          sameRun = 0;
          stage(verdictAt, 'same', '0');
          verdict = 'diff';
          stage(verdictAt, 'verdict', 'diff');
          cue(verdictAt, 'state');
        }
        comparisons.push({ at: verdictAt, same: matched, run: sameRun });
      });
    });
  });

  for (const [at, from, target] of EFFECTS) {
    schedule(at, () => {
      const state = sideAt(from, at);
      const real = state === 'serving';
      const leg = real ? EFFECT_LEG : ATTEMPT_LEG;
      const lands = round(at + leg);
      const lane = from === 'live' ? X_LIVE_LANE : X_SHADOW_LANE;
      if (!real && state !== 'mirror' && state !== 'fix') {
        problems.push(`${at} ${from} tried to send something while it was ${state}`);
        return;
      }
      // A real effect gets out. An attempt gets out only if nothing is standing
      // in its way, which is the whole of the third step.
      const passed = real || !cagedAt(lands);
      if (!real && passed && cagedAt(lands)) {
        problems.push(`${lands} an attempt got past a standing gate`);
      }
      ride(
        real ? 'effect' : 'attempt',
        lane,
        Y_VERSIONS_BOTTOM,
        Y_EFFECTS_TOP,
        at,
        leg,
        lands,
        passed ? 'ok' : 'fail',
        lands,
        null,
      );
      // The first attempt setting off is worth hearing as well as the wall it
      // meets, because the point is that the shadow really does try. After that
      // the gate is the only part of it that is news.
      if (!real && !heardAnAttempt) {
        heardAnAttempt = true;
        cue(at, 'state');
      }
      schedule(lands, () => {
        emissions.push({ at: lands, from, target, passed });
        if (passed) {
          delivered[target] = true;
          sample(lands, 'success');
        } else {
          stopped[target] = true;
          stage(lands, 'block', 'hit');
          stage(round(lands + HIT_HOLD), 'block', 'armed');
          cue(lands, 'state');
        }
        const next = withOutcome(targets[target], passed);
        if (next !== targets[target]) {
          targets[target] = next;
          setAttr(lands, target, 'data-sd-target', next);
        }
      });
    });
  }

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

  // --- the lanes ------------------------------------------------------------

  const endsOf = (entry: Ride): number[] =>
    entry.lane === X_CALL
      ? [Y_TRAFFIC_BOTTOM, Y_VERSIONS_TOP]
      : [Y_VERSIONS_BOTTOM, Y_EFFECTS_TOP];
  const goneAt = (entry: Ride): number => round(entry.fadeAt + FADE);
  const whereAt = (entry: Ride, at: number): number => {
    if (at <= entry.startAt) return entry.from;
    const down = Math.min(at, entry.startAt + entry.leg);
    let y = entry.from + ((entry.to - entry.from) * (down - entry.startAt)) / entry.leg;
    if (entry.backAt === null) return y;
    if (at <= entry.markAt) return y;
    const up = Math.min(at, entry.backAt);
    y = entry.to + ((entry.from - entry.to) * (up - entry.markAt)) / entry.leg;
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
    const want =
      entry.kind === 'call'
        ? CALL_LIFE
        : round((entry.kind === 'effect' ? EFFECT_LEG : ATTEMPT_LEG) + FADE);
    if (Math.abs(life - want) > 1e-6) {
      problems.push(`a ${entry.kind} at ${entry.startAt} lives ${life}s rather than ${want}s`);
    }
  }

  let closest = Infinity;
  let closestName = '';
  for (const lane of [X_CALL, X_LIVE_LANE, X_SHADOW_LANE]) {
    const onLane = rides.filter((entry) => entry.lane === lane);
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
            closestName = `x${lane}: ${left.kind}@${left.startAt} and ${right.kind}@${right.startAt} at ${round(t)}`;
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
    const serving = SIDE_IDS.filter((id) => valueAt(id, 'data-sd-side', at) === 'serving');
    if (serving.length !== 1) {
      problems.push(`${at} ${serving.length} versions are holding traffic`);
    }
    if (at < PROMOTE_AT - EPS && serving[0] !== 'live') {
      problems.push(`${at} the shadow is holding traffic before it was promoted`);
    }
    const fork = valueAt('stage', 'data-sd-fork', at);
    const shadowState = valueAt('shadow', 'data-sd-side', at);
    if (fork === 'mirror') {
      // Copies are only ever sent at something that is taking them and cannot
      // answer a user, and only ever while the cage around it is standing.
      if (shadowState !== 'mirror' && shadowState !== 'fix') {
        problems.push(`${at} copies are being sent at a ${shadowState} version`);
      }
      if (valueAt('stage', 'data-sd-block', at) === 'off') {
        problems.push(`${at} copies are being sent with no gate standing`);
      }
      if (valueAt('stage', 'data-sd-config', at) === 'off') {
        problems.push(`${at} copies are being sent with nothing splitting the environments`);
      }
    }
    if (fork !== 'mirror' && shadowState === 'mirror') {
      problems.push(`${at} a version is taking copies that nothing is copying to`);
    }
  }

  // The cage is finished before the first copy is ever sent, not after.
  const firstMirrored = REQUESTS.find((depart) => mirroringAt(depart));
  if (firstMirrored === undefined || CAGE_AT >= firstMirrored - EPS) {
    problems.push('the first copy was sent before the cage was finished');
  }

  // Every attempt the shadow made while the gate stood was stopped, and every
  // real effect the serving version sent got out.
  for (const emission of emissions) {
    const state = sideAt(emission.from, round(emission.at - EPS));
    if (state === 'serving' && !emission.passed) {
      problems.push(`${emission.at} a real ${emission.target} effect was stopped`);
    }
    if (state !== 'serving' && emission.passed && cagedAt(emission.at)) {
      problems.push(`${emission.at} a ${emission.target} attempt got out through a standing gate`);
    }
  }
  if (!emissions.some((entry) => entry.at > PROMOTE_AT && entry.from === 'shadow' && entry.passed)) {
    problems.push('the promoted version never sends a real effect');
  }

  // `same n` climbs by one and is only ever taken back by the mismatch.
  let previousSame = 0;
  let falls = 0;
  for (const change of changes) {
    if (change.name !== 'data-sd-same') continue;
    const value = Number(change.value);
    if (value < previousSame) {
      falls += 1;
      if (valueAt('stage', 'data-sd-verdict', change.at) !== 'diff') {
        problems.push(`${change.at} the matching run was taken back with nothing to explain it`);
      }
    } else if (value !== previousSame + 1) {
      problems.push(`${change.at} the matching run jumped from ${previousSame} to ${value}`);
    }
    previousSame = value;
  }
  if (falls !== 1) problems.push(`the matching run was taken back ${falls} times rather than once`);

  // --- the boundaries and the closing frame --------------------------------

  for (const edge of BOUNDARIES) {
    for (const entry of rides) {
      if (entry.startAt < edge - EPS && goneAt(entry) > edge + EPS) {
        problems.push(`something is in flight on the boundary at ${edge}`);
      }
    }
    if (valueAt('stage', 'data-sd-mark', edge) !== 'none') {
      problems.push(`a highlight is up on the boundary at ${edge}`);
    }
    if (valueAt('stage', 'data-sd-twice', edge) !== 'off') {
      problems.push(`the doubled-send warning is up on the boundary at ${edge}`);
    }
    if (valueAt('stage', 'data-sd-block', edge) === 'hit') {
      problems.push(`the gate is still lit on the boundary at ${edge}`);
    }
    if (valueAt('stage', 'data-sd-config', edge) === 'split') {
      problems.push(`the settings are still held up on the boundary at ${edge}`);
    }
  }
  if (valueAt('stage', 'data-sd-settled', SCENE_DURATION) !== 'on') {
    problems.push('the scene does not end settled');
  }
  if (valueAt('shadow', 'data-sd-side', SCENE_DURATION) !== 'serving') {
    problems.push('the scene does not end with the proven version serving');
  }
  if (valueAt('live', 'data-sd-side', SCENE_DURATION) !== 'retired') {
    problems.push('the scene does not end with the old version stepped down');
  }
  if (valueAt('stage', 'data-sd-verdict', SCENE_DURATION) !== 'done') {
    problems.push('the scene does not end with the comparison finished');
  }
  for (const id of TARGET_IDS) {
    if (valueAt(id, 'data-sd-target', SCENE_DURATION) !== 'both') {
      problems.push(`the scene does not end with ${id} showing what passed and what did not`);
    }
  }

  if (problems.length > 0) throw new Error(`${ID} scene: ${[...new Set(problems)].join('; ')}`);

  rides.sort((left, right) => left.startAt - right.startAt);
  answers.sort((left, right) => left.at - right.at);
  comparisons.sort((left, right) => left.at - right.at);
  emissions.sort((left, right) => left.at - right.at);
  return { changes, cues, rides, answers, comparisons, emissions, okTotal: okValue, sameHigh };
}

// --- the timeline ----------------------------------------------------------

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);
  const sim = simulate();

  // The captions name the figures the model produced. Nothing here places them:
  // if the schedule changes, this is what says the captions have stopped
  // describing the scene.
  if (!sim.answers.every((answer) => answer.at > PROMOTE_AT || answer.from === 'live')) {
    throw new Error(`${ID} scene: the second step promises no user is ever answered by the shadow`);
  }
  if (!sim.emissions.some((entry) => entry.from === 'shadow' && !entry.passed)) {
    throw new Error(`${ID} scene: the third step promises an attempt that is stopped`);
  }
  if (!sim.comparisons.some((entry) => !entry.same)) {
    throw new Error(`${ID} scene: the fourth step promises a mismatch found on real traffic`);
  }
  if (sim.sameHigh < 2) {
    throw new Error(`${ID} scene: the captions promise a run of matching answers`);
  }

  const targets = new Map<string, Element>();
  targets.set('stage', stage);
  for (const id of SIDE_IDS) targets.set(id, q<SVGGElement>(stage, `.sd-card--${id}`, ID));
  for (const id of TARGET_IDS) targets.set(id, q<SVGGElement>(stage, `.sd-target--${id}`, ID));

  const tl = createSceneTimeline();

  // --- everything the stage says about itself ------------------------------

  for (const change of sim.changes) {
    const target = targets.get(change.target);
    if (!target) throw new Error(`${ID} scene: nothing on the stage is called "${change.target}"`);
    attr(tl, target, change.name, change.value, change.at);
  }

  // --- what travels --------------------------------------------------------

  const parts = mountRequests(layer, sim.rides.length, ID);

  sim.rides.forEach((entry, index) => {
    const group = parts[index];
    if (!group) return;
    group.group.classList.add(`sd-req--${entry.kind}`);

    parkRequest(group, entry.lane, entry.from);
    showRequest(tl, group, entry.startAt);
    tl.to(
      group.group,
      { y: entry.to, duration: entry.leg, ease: 'none', immediateRender: false },
      entry.startAt,
    );
    markRequest(tl, group, entry.result, entry.markAt);
    if (entry.backAt !== null) {
      tl.to(
        group.group,
        { y: entry.from, duration: entry.leg, ease: 'none', immediateRender: false },
        entry.markAt,
      );
    }
    hideRequest(tl, group, entry.fadeAt, FADE);
  });

  // --- sound ---------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels ---------------------------------------------------------

  // The stage is complete on the first frame: one version serving, an empty
  // slot beside it, a fork with one arm, a comparator that has compared
  // nothing, a synthetic load drawn but not yet run, no cage, and nothing in
  // flight.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
