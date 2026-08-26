import gsap from 'gsap';
import {
  GATE_MS,
  LAG_MAX_MS,
  LAG_STEPS,
  LAG_STEP_MS,
  MAX_VERSION,
  SCENE_DURATION,
  STAGE_STATE,
  X_A,
  X_B,
  X_TRUNK,
  Y_CLIENT,
  Y_PRIMARY,
  Y_PRIMARY_BOTTOM,
  Y_RAIL,
  Y_REPLICA,
} from './stage';
import { q } from '../shared/dom';
import {
  attachToRequest,
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
 * Eventual Consistency scene: a 24 second, four step timeline.
 *
 * Same two rules as the other scenes: every tween sits at an absolute position,
 * and every discrete change is a zero-duration tween on a `data-*` attribute
 * that GSAP reverts when the playhead moves back past it.
 *
 * Nothing the reader counts is authored. The scene is told six things: when
 * each write commits on the primary, how long a change takes to reach each
 * replica and how fast that replica can apply changes one after another, when
 * each read leaves the client and which copy it is aimed at, when the client
 * starts pinning one session's reads, and how far behind a replica may fall
 * before it stops taking eventual reads.
 *
 * Everything else falls out of one pass over the whole 24 seconds. A version
 * exists once the primary has committed it; a replica shows it once its own
 * copy of that change has landed, which is why the two replicas hold different
 * values for as long as they do. Lag is not a picture of being behind, it is
 * the age of the oldest change a replica has not applied yet, so it climbs at
 * one second per second while the replica is behind and falls when the replica
 * catches up. Convergence is the moment all three values have been equal long
 * enough to say so. A read is answered by whichever copy it reached, with the
 * value that copy holds at the instant it arrives, so the stale answers in the
 * second step, the vanished write in the third and the clean answers in the
 * fourth are consequences of the same schedule rather than results written down
 * in advance. The staleness bound is a comparison against that same lag figure:
 * it closes the moment Replica B passes it and opens the moment B is back
 * inside it, and the reads that get rerouted are the ones that happened to
 * leave while it was closed.
 */

const ID = 'eventual-consistency';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- how a request moves --------------------------------------------------

/** One speed for every leg a client request travels, in pixels per second. */
const SPEED = 3000;

/** Client to the top of the primary, and client to the top of a replica. */
const TRIP_PRIMARY = round((Y_PRIMARY - Y_CLIENT) / SPEED);
const TRIP_REPLICA = round((Y_REPLICA - Y_CLIENT) / SPEED);

/** The two legs replication travels after the trunk, in pixels. */
const LEG_RAIL = X_TRUNK - X_A;
const LEG_DROP = Y_REPLICA - Y_RAIL;

/** How long a copy takes to answer, once the read has reached it. */
const EVENTUAL_DWELL = 0.06;
/** A strong read is answered by the primary, and pays for the privilege. */
const STRONG_DWELL = 0.36;

/** How long a marker stays before the request that carries it goes. */
const FADE = 0.15;
/**
 * How long an answered read holds its result before it goes. The value it came
 * back with is the point of the whole scene, so it has to stay long enough to
 * be read rather than long enough to be noticed.
 */
const RESULT_HOLD = 0.3;
/**
 * How long a write's marker stays on the top of the primary. It is the longest
 * a marker may stay rather than how long it does: a write that lands while the
 * one before it is still being absorbed would stand on the same pixel, so the
 * marker always clears before the next write reaches the same spot.
 */
const WRITE_FADE = 0.18;
const WRITE_CLEAR = 0.02;
const REPL_FADE = 0.06;

/**
 * The two rules that keep replication legible on a trunk and a rail both
 * copies of a change share.
 *
 * Every copy takes the same time to clear the trunk, whatever its flight, so a
 * fast copy can never overtake a slow one on the stretch where they are all in
 * the same column. And the copy bound for the far replica leaves the primary
 * once the near copy is `RAIL_LEAD` of the rail ahead of it, so the two are
 * already apart when they turn opposite ways. Without either, two changes would
 * sit on the same pixel and a reader would see one where there were two.
 */
const TRUNK_TIME = 0.05;
const RAIL_LEAD = 0.4;

// --- what the scene is told -----------------------------------------------

interface WritePlan {
  /** When the primary commits it. It leaves the client `TRIP_PRIMARY` earlier. */
  commit: number;
  /** True when it belongs to the session the third step follows. */
  session?: boolean;
}

/**
 * When each write commits. Two in the first step, one and then a burst of three
 * in the second, the session's two in the third, and the six in the fourth that
 * push Replica B past the staleness bound.
 */
const WRITES: WritePlan[] = [
  { commit: 0.9 },
  { commit: 2.1 },
  { commit: 6.2 },
  { commit: 8.5 },
  { commit: 9.1 },
  { commit: 9.8 },
  { commit: 12.4, session: true },
  { commit: 15.1, session: true },
  { commit: 19.4 },
  { commit: 19.5 },
  { commit: 19.74 },
  { commit: 19.98 },
  { commit: 20.22 },
  { commit: 21.07 },
];

type Copy = 'primary' | 'a' | 'b';

interface ReadPlan {
  /** When the read leaves the client. */
  start: number;
  /** The copy it is aimed at, before pinning or the staleness bound speak. */
  aim: Copy;
  /** True when it belongs to the session that has just written. */
  session?: boolean;
  /** The fourth step names what each read asked for; earlier steps do not. */
  label?: 'strong' | 'eventual';
}

const READS: ReadPlan[] = [
  { start: 7.2, aim: 'a' },
  { start: 7.2, aim: 'b' },
  { start: 13.2, aim: 'b', session: true },
  { start: 15.9, aim: 'a', session: true },
  { start: 18.2, aim: 'a', label: 'eventual' },
  { start: 18.4, aim: 'primary', label: 'strong' },
  { start: 18.75, aim: 'b', label: 'eventual' },
  { start: 20.3, aim: 'b', label: 'eventual' },
  { start: 21.14, aim: 'b', label: 'eventual' },
  { start: 21.9, aim: 'b', label: 'eventual' },
  { start: 22.2, aim: 'primary', label: 'strong' },
  { start: 22.55, aim: 'a', label: 'eventual' },
  { start: 22.85, aim: 'b', label: 'eventual' },
];

/**
 * How long a change takes to reach each replica, and how long that replica
 * takes to apply one change before it can start the next, from each time
 * onwards. Replica A is the near copy and stays close behind; Replica B is the
 * far one, and the two long stretches are what the second and third steps are
 * about.
 */
const DELAY: Record<'a' | 'b', [number, number][]> = {
  a: [
    [0, 0.3],
    [6, 0.5],
    [8, 0.6],
    [11, 0.5],
    [12.3, 0.6],
    [15, 0.5],
    [19, 0.22],
  ],
  b: [
    [0, 1.3],
    [6, 2.33],
    [8, 0.9],
    [12, 2.05],
    [15, 1.3],
    [19, 0.32],
    [21, 0.1],
  ],
};

const SERVICE: Record<'a' | 'b', [number, number][]> = {
  a: [
    [0, 0.1],
    [8, 0.3],
    [11, 0.1],
    [19, 0.12],
  ],
  b: [
    [0, 0.2],
    [8, 0.89],
    [12, 0.2],
    [19, 0.36],
    [21, 0.1],
  ],
};

/** When the client starts sending the session's reads to the copy it wrote to. */
const PIN_AT = 14.4;
/** Which copy the pin points at, which is the near one. */
const PIN_TO: Copy = 'a';

/**
 * When reads start choosing what they need per read, which is when a bound on
 * staleness starts deciding whether Replica B may answer one at all. Before
 * this the scene is about what eventual consistency does, not about routing
 * around it, so the bound is neither drawn nor consulted.
 */
const GATE_FROM = 18;

/** How long the three values have to agree before the scene says they have. */
const CONVERGE_HOLD = 0.2;

/**
 * How fast the lag readout is allowed to fall, in milliseconds per second. A
 * replica catching up is a real drop, but a readout that jumped would look like
 * a different number rather than the same one settling, so the fall is drawn at
 * a fixed rate and the readout passes through every value on the way down.
 */
const LAG_FALL_RATE = 8000;

/** The shortest gap between two sampled arrival cues. */
const STATE_GAP = 0.3;

// --- what the simulation produces -----------------------------------------

interface WriteOutcome {
  commitAt: number;
  version: number;
  /** When each replica applies it, and how long the whole journey took. */
  arrive: Record<'a' | 'b', number>;
}

interface ReadOutcome {
  target: Copy;
  arriveAt: number;
  resolveAt: number;
  /** The version the copy it reached handed back. */
  value: number;
  /** True when that version was behind the primary at the instant it answered. */
  stale: boolean;
  /** True when the session could not see a write it had already made. */
  violation: boolean;
  /** True when the session saw its own write again. */
  recovered: boolean;
  /** True when the staleness bound sent it somewhere other than its aim. */
  rerouted: boolean;
}

interface AttrChange {
  at: number;
  target: string;
  name: string;
  value: string;
}

interface Simulation {
  writes: WriteOutcome[];
  reads: ReadOutcome[];
  attrs: AttrChange[];
  cues: [number, SceneCue][];
}

/** The value a step function holds at `at`. */
function stepValue(table: [number, number][], at: number): number {
  let value = table[0]?.[1] ?? 0;
  for (const [from, next] of table) if (at >= from) value = next;
  return value;
}

/** One straight run of the lag curve, in seconds of lag against seconds. */
interface LagSegment {
  from: number;
  to: number;
  v0: number;
  slope: number;
}

/**
 * The lag a replica shows: the age of the oldest change it has not applied,
 * which rises at one second per second and drops when the change lands. The
 * drop is drawn as a fall rather than a jump, so the readout passes through the
 * numbers in between.
 */
function lagCurve(commits: number[], arrivals: number[]): LagSegment[] {
  const raw: LagSegment[] = [];
  let previous = 0;
  for (let i = 0; i < commits.length; i += 1) {
    const commit = commits[i] ?? 0;
    const arrive = arrivals[i] ?? 0;
    const start = Math.max(commit, previous);
    if (start > previous) raw.push({ from: previous, to: start, v0: 0, slope: 0 });
    if (arrive > start) raw.push({ from: start, to: arrive, v0: start - commit, slope: 1 });
    previous = Math.max(previous, arrive);
  }
  raw.push({ from: previous, to: SCENE_DURATION, v0: 0, slope: 0 });

  const drawn: LagSegment[] = [];
  let shown = 0;
  for (const segment of raw) {
    let at = segment.from;
    if (shown > segment.v0 + 1e-9) {
      // Falling. It meets the true curve once the fall has eaten the gap.
      const meet = at + (shown - segment.v0) / (LAG_FALL_RATE / 1000 + segment.slope);
      const to = Math.min(meet, segment.to);
      drawn.push({ from: at, to, v0: shown, slope: -LAG_FALL_RATE / 1000 });
      shown -= (LAG_FALL_RATE / 1000) * (to - at);
      at = to;
    }
    if (at < segment.to) {
      const v0 = segment.v0 + segment.slope * (at - segment.from);
      drawn.push({ from: at, to: segment.to, v0, slope: segment.slope });
      shown = v0 + segment.slope * (segment.to - at);
    }
  }
  return drawn;
}

/** Every reading the lag readout passes through, as `[time, step]` pairs. */
function lagReadings(segments: LagSegment[]): [number, number][] {
  const bucket = (ms: number): number =>
    Math.max(0, Math.min(LAG_STEPS - 1, Math.floor((ms + 1e-6) / LAG_STEP_MS)));
  const out: [number, number][] = [];
  let current = 0;
  for (const segment of segments) {
    if (segment.slope === 0) continue;
    const from = segment.v0 * 1000;
    const to = (segment.v0 + segment.slope * (segment.to - segment.from)) * 1000;
    if (segment.slope > 0) {
      for (let k = current + 1; k <= bucket(to); k += 1) {
        const ms = k * LAG_STEP_MS;
        if (ms > LAG_MAX_MS) break;
        out.push([round(segment.from + (ms - from) / (segment.slope * 1000)), k]);
        current = k;
      }
    } else {
      for (let k = current; k > bucket(to); k -= 1) {
        const ms = k * LAG_STEP_MS;
        out.push([round(segment.from + (ms - from) / (segment.slope * 1000)), k - 1]);
        current = k - 1;
      }
    }
  }
  return out;
}

/** The value one copy holds at `at`, given the times it changed. */
function valueAt(changes: [number, number][], at: number): number {
  let value = 1;
  for (const [when, version] of changes) if (at >= when) value = version;
  return value;
}

// --- the simulation -------------------------------------------------------

function simulate(): Simulation {
  const raw: AttrChange[] = [];
  const cues: [number, SceneCue][] = [];

  const setAttr = (at: number, target: string, name: string, value: string): void => {
    raw.push({ at: round(at), target, name, value });
  };
  const cue = (at: number, name: SceneCue): void => {
    cues.push([round(at), name]);
  };

  const writes: WriteOutcome[] = WRITES.map((plan, index) => ({
    commitAt: plan.commit,
    version: index + 2,
    arrive: { a: 0, b: 0 },
  }));
  const reads: ReadOutcome[] = READS.map((plan) => ({
    target: plan.aim,
    arriveAt: 0,
    resolveAt: 0,
    value: 1,
    stale: false,
    violation: false,
    recovered: false,
    rerouted: false,
  }));

  const { schedule, drain } = createScheduler();

  // --- the primary --------------------------------------------------------

  /** When each version became the primary's value. */
  const primarySteps: [number, number][] = [];
  /** The versions the session wrote, and when the primary took them. */
  const sessionWrites: [number, number][] = [];

  writes.forEach((outcome, index) => {
    schedule(outcome.commitAt, () => {
      primarySteps.push([outcome.commitAt, outcome.version]);
      setAttr(outcome.commitAt, 'primary', 'data-ec-val', String(outcome.version));
      setAttr(outcome.commitAt, 'primary', 'data-ec-writes', String(outcome.version));
      setAttr(outcome.commitAt, `cell-${outcome.version}`, 'data-ec-cell', 'on');
      if (WRITES[index]?.session) sessionWrites.push([outcome.commitAt, outcome.version]);
    });
    // The client shows the write it is issuing from the moment it leaves.
    setAttr(outcome.commitAt - TRIP_PRIMARY, 'stage', 'data-ec-write', String(outcome.version));
  });

  drain();

  // --- the replicas -------------------------------------------------------

  const replicaSteps: Record<'a' | 'b', [number, number][]> = { a: [], b: [] };
  const commits = writes.map((write) => write.commitAt);

  for (const side of ['a', 'b'] as const) {
    let free = 0;
    for (const write of writes) {
      const ready = round(write.commitAt + stepValue(DELAY[side], write.commitAt));
      const at = round(Math.max(ready, free));
      free = round(at + stepValue(SERVICE[side], at));
      write.arrive[side] = at;
      replicaSteps[side].push([at, write.version]);
      setAttr(at, side === 'a' ? 'repA' : 'repB', 'data-ec-val', String(write.version));
    }
  }

  // --- what each replica reads as its lag ---------------------------------

  const curves: Record<'a' | 'b', LagSegment[]> = {
    a: lagCurve(
      commits,
      writes.map((write) => write.arrive.a),
    ),
    b: lagCurve(
      commits,
      writes.map((write) => write.arrive.b),
    ),
  };

  for (const side of ['a', 'b'] as const) {
    const target = side === 'a' ? 'repA' : 'repB';
    for (const [at, step] of lagReadings(curves[side])) {
      if (at < 0 || at > SCENE_DURATION) continue;
      setAttr(at, target, 'data-ec-lag', String(step));
    }
  }

  // --- when the three values agree ----------------------------------------

  const moments = [
    ...commits,
    ...writes.map((write) => write.arrive.a),
    ...writes.map((write) => write.arrive.b),
  ].sort((left, right) => left - right);

  const agreesAt = (at: number): boolean => {
    const primary = valueAt(primarySteps, at);
    return valueAt(replicaSteps.a, at) === primary && valueAt(replicaSteps.b, at) === primary;
  };

  const spans: [number, number][] = [];
  let openedAt: number | null = 0;
  for (const moment of moments) {
    const agrees = agreesAt(moment);
    if (agrees && openedAt === null) openedAt = moment;
    if (!agrees && openedAt !== null) {
      spans.push([openedAt, moment]);
      openedAt = null;
    }
  }
  if (openedAt !== null) spans.push([openedAt, SCENE_DURATION]);

  for (const [from, to] of spans) {
    const settled = round(from + CONVERGE_HOLD);
    if (to <= settled) continue;
    setAttr(settled, 'stage', 'data-ec-conv', 'yes');
    // The stage opens converged, so the first span is a state rather than a
    // moment: nothing has happened yet for the reader to hear.
    if (from > 0) cue(settled, 'success');
    if (to < SCENE_DURATION) setAttr(to, 'stage', 'data-ec-conv', 'no');
  }

  // --- the staleness bound ------------------------------------------------

  const bound = GATE_MS / 1000;
  /**
   * Every moment Replica B crosses the bound, in either direction. The bound is
   * only drawn from the first time it takes B out of rotation, so the reader
   * meets it doing something rather than sitting there waiting.
   */
  const crossings: [number, 'closed' | 'open'][] = [];
  for (const segment of curves.b) {
    if (segment.slope === 0) continue;
    const end = segment.v0 + segment.slope * (segment.to - segment.from);
    if ((segment.v0 - bound) * (end - bound) >= 0) continue;
    const at = round(segment.from + (bound - segment.v0) / segment.slope);
    if (at < GATE_FROM) continue;
    crossings.push([at, segment.slope > 0 ? 'closed' : 'open']);
  }
  crossings.sort((left, right) => left[0] - right[0]);

  const gateChanges: [number, 'closed' | 'open'][] = [];
  let gateState: 'off' | 'closed' | 'open' = 'off';
  for (const [at, value] of crossings) {
    if (gateState === 'off' && value !== 'closed') continue;
    if (gateState === value) continue;
    gateState = value;
    gateChanges.push([at, value]);
  }

  const gateFrom = gateChanges[0]?.[0] ?? Infinity;
  for (const [at, value] of gateChanges) {
    setAttr(at, 'stage', 'data-ec-gate', value);
    cue(at, 'trip');
  }

  /** What the bound says about Replica B at `at`. */
  const gateAt = (at: number): 'off' | 'closed' | 'open' => {
    let state: 'off' | 'closed' | 'open' = 'off';
    for (const [when, value] of gateChanges) if (at >= when) state = value;
    return state;
  };

  // --- the session pin ----------------------------------------------------

  setAttr(PIN_AT, 'stage', 'data-ec-session', 'on');
  cue(PIN_AT, 'trip');

  // --- the reads ----------------------------------------------------------

  READS.forEach((plan, index) => {
    const outcome = reads[index];
    if (!outcome) return;

    let target: Copy = plan.aim;
    if (plan.session && plan.start >= PIN_AT) target = PIN_TO;
    if (target === 'b' && plan.start >= gateFrom && gateAt(plan.start) === 'closed') {
      target = 'a';
      outcome.rerouted = true;
      cue(plan.start, 'trip');
    }
    outcome.target = target;

    const trip = target === 'primary' ? TRIP_PRIMARY : TRIP_REPLICA;
    const dwell = target === 'primary' ? STRONG_DWELL : EVENTUAL_DWELL;
    outcome.arriveAt = round(plan.start + trip);
    outcome.resolveAt = round(outcome.arriveAt + dwell);

    const primary = valueAt(primarySteps, outcome.arriveAt);
    outcome.value =
      target === 'primary' ? primary : valueAt(replicaSteps[target], outcome.arriveAt);
    outcome.stale = outcome.value < primary;

    // A session is owed whatever it has already written, whoever answers it.
    let owed = 0;
    if (plan.session) {
      for (const [when, version] of sessionWrites) if (when <= outcome.arriveAt) owed = version;
    }
    if (owed > 0) {
      outcome.violation = outcome.value < owed;
      outcome.recovered = !outcome.violation;
    }

    if (outcome.violation) cue(outcome.resolveAt, 'failure');
    else if (outcome.recovered) cue(outcome.resolveAt, 'success');
    else if (outcome.stale) cue(outcome.resolveAt, 'state');
  });

  // --- arrivals, sampled rather than counted ------------------------------

  const arrivals = [
    ...writes.map((write) => write.arrive.a),
    ...writes.map((write) => write.arrive.b),
  ].sort((left, right) => left - right);
  let lastSample = -Infinity;
  for (const at of arrivals) {
    if (at - lastSample < STATE_GAP) continue;
    lastSample = at;
    cue(at, 'state');
  }

  // --- put the discrete changes in time order -----------------------------

  const inTimeOrder = raw
    .map((entry, order) => ({ entry, order }))
    .sort((left, right) => left.entry.at - right.entry.at || left.order - right.order)
    .map(({ entry }) => entry);

  const folded: AttrChange[] = [];
  for (const entry of inTimeOrder) {
    collapseAtInstant(folded, entry, (change) => `${change.target}@${change.name}`);
  }

  const seen = new Map<string, string>();
  for (const [key, value] of Object.entries(STAGE_STATE)) seen.set(key, value);
  for (let n = 1; n <= MAX_VERSION; n += 1) {
    seen.set(`cell-${n}@data-ec-cell`, n === 1 ? 'on' : 'off');
  }
  const attrs: AttrChange[] = [];
  for (const change of folded) {
    const key = `${change.target}@${change.name}`;
    if (seen.get(key) === change.value) continue;
    seen.set(key, change.value);
    attrs.push(change);
  }

  cues.sort((left, right) => left[0] - right[0]);

  return { writes, reads, attrs, cues };
}

// --- the timeline ---------------------------------------------------------

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const targets: Record<string, Element> = {
    stage,
    primary: q<SVGGElement>(stage, '.ec-primary', ID),
    repA: q<SVGGElement>(stage, '.ec-rep--a', ID),
    repB: q<SVGGElement>(stage, '.ec-rep--b', ID),
  };
  for (let n = 1; n <= MAX_VERSION; n += 1) {
    targets[`cell-${n}`] = q<SVGRectElement>(stage, `.ec-cell--${n}`, ID);
  }

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);
  const sim = simulate();

  const replCount = sim.writes.length * 2;
  const parts = mountRequests(layer, READS.length + WRITES.length + replCount, ID);
  const readParts = parts.slice(0, READS.length);
  const writeParts = parts.slice(READS.length, READS.length + WRITES.length);
  const replParts = parts.slice(READS.length + WRITES.length);

  const tl = createSceneTimeline();

  // --- discrete state -----------------------------------------------------

  for (const change of sim.attrs) {
    const target = targets[change.target];
    if (target) attr(tl, target, change.name, change.value, change.at);
  }

  // --- what travels -------------------------------------------------------

  const move = (target: RequestParts, vars: gsap.TweenVars, duration: number, at: number): void => {
    tl.to(target.group, { ...vars, duration, ease: 'none', immediateRender: false }, at);
  };

  READS.forEach((plan, index) => {
    const request = readParts[index];
    const outcome = sim.reads[index];
    if (!request || !outcome) return;

    const lane =
      outcome.target === 'primary' ? X_TRUNK : outcome.target === 'a' ? X_A : X_B;
    const land = outcome.target === 'primary' ? Y_PRIMARY : Y_REPLICA;

    attachToRequest(request, 'rect', {
      class: 'scene-req-chip-box ec-result-bg',
      x: '30',
      y: '-26',
      width: '120',
      height: '52',
      rx: '14',
    });
    attachToRequest(
      request,
      'text',
      {
        class: 'scene-req-chip ec-result-text',
        x: '90',
        y: '9',
        'text-anchor': 'middle',
      },
      `v ${outcome.value}`,
    );
    const result = Array.from(request.group.querySelectorAll<SVGElement>('.ec-result-bg, .ec-result-text'));

    const goneAt = round(outcome.resolveAt + RESULT_HOLD);

    if (plan.label) {
      const kind = attachToRequest(
        request,
        'text',
        { class: 'scene-req-label ec-kind', x: '-34', y: '9', 'text-anchor': 'end' },
        plan.label,
      );
      tl.set(kind, { opacity: 1, immediateRender: false }, plan.start);
      tl.to(kind, { opacity: 0, duration: FADE, immediateRender: false }, goneAt);
    }

    if (outcome.stale) {
      const stale = attachToRequest(
        request,
        'text',
        { class: 'ec-stale', x: '-34', y: '9', 'text-anchor': 'end' },
        'stale',
      );
      tl.set(stale, { opacity: 1, immediateRender: false }, outcome.resolveAt);
      tl.to(stale, { opacity: 0, duration: FADE, immediateRender: false }, goneAt);
    }

    parkRequest(request, lane, Y_CLIENT);
    showRequest(tl, request, plan.start);
    move(request, { y: land }, outcome.arriveAt - plan.start, plan.start);
    tl.set(result, { opacity: 1, immediateRender: false }, outcome.resolveAt);
    tl.to(result, { opacity: 0, duration: FADE, immediateRender: false }, goneAt);
    markRequest(tl, request, outcome.violation ? 'fail' : 'ok', outcome.resolveAt);
    hideRequest(tl, request, goneAt, FADE);
  });

  WRITES.forEach((_plan, index) => {
    const request = writeParts[index];
    const outcome = sim.writes[index];
    if (!request || !outcome) return;

    const square = attachToRequest(request, 'rect', {
      class: 'scene-req-square ec-write-dot',
      x: '-15',
      y: '-15',
      width: '30',
      height: '30',
      rx: '6',
    });
    parkRequest(request, X_TRUNK, Y_CLIENT);
    gsap.set(request.dot, { opacity: 0 });
    gsap.set(square, { opacity: 1 });

    const start = round(outcome.commitAt - TRIP_PRIMARY);
    showRequest(tl, request, start);
    move(request, { y: Y_PRIMARY }, TRIP_PRIMARY, start);
    const next = sim.writes[index + 1]?.commitAt ?? Infinity;
    const fade = Math.min(WRITE_FADE, Math.max(0.05, next - outcome.commitAt - WRITE_CLEAR));
    tl.set(square, { opacity: 0, immediateRender: false }, outcome.commitAt);
    markRequest(tl, request, 'ok', outcome.commitAt);
    hideRequest(tl, request, outcome.commitAt, round(fade));
  });

  /** How long the near copy spends on the rail, which is what the far copy waits. */
  const railTime = (flight: number): number =>
    ((flight - TRUNK_TIME) * LEG_RAIL) / (LEG_RAIL + LEG_DROP);

  sim.writes.forEach((outcome, index) => {
    const lead = round(RAIL_LEAD * railTime(outcome.arrive.a - outcome.commitAt));
    for (const side of ['a', 'b'] as const) {
      const request = replParts[index * 2 + (side === 'a' ? 0 : 1)];
      if (!request) continue;
      const start = round(outcome.commitAt + (side === 'b' ? lead : 0));
      const flight = round(outcome.arrive[side] - start);
      if (flight <= TRUNK_TIME) continue;

      const diamond = attachToRequest(request, 'path', {
        class: 'ec-change',
        d: 'M 0 -15 L 15 0 L 0 15 L -15 0 Z',
      });
      parkRequest(request, X_TRUNK, Y_PRIMARY_BOTTOM);
      gsap.set(request.dot, { opacity: 0 });
      gsap.set(diamond, { opacity: 1 });

      // The three legs share the flight in proportion to their length, so the
      // corners are one point rather than two legs overlapping by a fraction.
      const lane = side === 'a' ? X_A : X_B;
      const turn = round(start + TRUNK_TIME);
      const drop = round(turn + ((flight - TRUNK_TIME) * LEG_RAIL) / (LEG_RAIL + LEG_DROP));

      showRequest(tl, request, start);
      move(request, { y: Y_RAIL }, turn - start, start);
      move(request, { x: lane }, drop - turn, turn);
      move(request, { y: Y_REPLICA }, outcome.arrive[side] - drop, drop);
      hideRequest(tl, request, outcome.arrive[side], REPL_FADE);
    }
  });

  // --- sound --------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels --------------------------------------------------------

  // The stage is complete on the first frame: three copies holding the same
  // value, nothing in flight, and no lag on either replica.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
