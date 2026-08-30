import {
  BASE_ROWS,
  ROW_COUNTS,
  SCENE_DURATION,
  X_LANE,
  Y_DOMAIN_BOTTOM,
  Y_REPO_BOTTOM,
  Y_REPO_TOP,
  Y_STORE_TOP,
} from './stage';
import type { Card, Flag, Impl, Leak, Mark, Mode, Verdict } from './stage';
import { q as pick } from '../shared/dom';
import {
  hideRequest,
  markRequest,
  mountRequests,
  moveRequest,
  parkRequest,
  showRequest,
} from '../shared/request';
import type { RequestParts } from '../shared/request';
import { createScheduler } from '../shared/simulation';
import { attr, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Repository scene: a 24 second, four step timeline.
 *
 * The two standing rules apply here as everywhere: every tween sits at an
 * absolute position, and every discrete change is a zero-duration tween on a
 * `data-*` attribute that GSAP reverts when the playhead moves back past it.
 * Nothing on this stage interpolates — a door is open or it is not, a plate is
 * an engine or a fake, two things are the same or they are not — so every
 * readable value is a stack with exactly one variant revealed.
 *
 * Nothing the reader watches is placed by hand. The scene is told five things
 * and one `createScheduler` pass over the whole 24 seconds derives the rest:
 *
 *   1. **the ghost** — when each query fragment lodges in the service, when the
 *      copies stop being an inconvenience, and when the door replaces them;
 *   2. **the request schedule** — `(the moment it leaves the domain, Find or
 *      Add)`, and nothing about what happens to it after that;
 *   3. **the swap window** — the two instants the implementation behind the
 *      door is exchanged, and for which of them the badge sounds;
 *   4. **the bench** — which card is laid on each side and when the two are
 *      compared, never what the comparison says;
 *   5. **what the captions stop on**, and for how long.
 *
 * Everything else falls out of walking that. **A round trip** is derived from
 * the implementation that happens to be behind the door when the call arrives:
 * an engine sends a traveller down the Store lane and answers when it lands, a
 * fake answers out of its own set and the Store lane stays empty — same call,
 * same reply, one lane quiet. **`rows n`** is the starting three plus every Add
 * the engine accepted and nothing else may move it, which is why an Add during
 * the fake window would leave it alone. **Every verdict** is read off one rule
 * rather than drawn twice: entities are the same when their ids match, values
 * are the same when their contents match, and the pass asserts that the entity
 * bench really does show one `same` with different fields and one `not same`
 * with identical ones, because that pair is the whole of the third step.
 * **Replacing a value** may not change what the bench says, and the pass checks
 * that too — a new chip with the same content is still the same money.
 *
 * The neighbouring scene is Domain-Driven Design, and the difference is
 * deliberate. There the subject is where a border goes and who guards it: one
 * door, an invariant, a writer refused. Here the subject is the **persistence
 * door** — an interface shaped like a collection, an implementation that can be
 * exchanged without the domain noticing, and the two equality rules the domain
 * needs in order to talk about its own objects at all. Nothing in this scene is
 * refused and no invariant is checked, because the argument is about what the
 * domain is allowed to see, not about what it is allowed to do.
 */

const ID = 'repository';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

const BOUNDARIES = [0, 6, 12, 18, 24];
const EPS = 1e-9;

// --- how a traveller moves -------------------------------------------------

/** Seconds a call takes between the Domain and the Repository: 200px. */
const CALL_LEG = 0.34;
/** Seconds the implementation takes to reach the Store: 230px. */
const STORE_LEG = 0.39;
/** How long the answer is held before it starts back up the lane. */
const DWELL = 0.1;
/** How long a traveller takes to fade once it is absorbed. */
const FADE = 0.12;
/** Clear air left on the shared column between one dot going and the next. */
const LANE_GAP = 0.08;
/** How close two dots on one column may ever be. */
const HALO = 52;

// --- what the scene is told ------------------------------------------------

/**
 * The query fragments lodging in the service, the moment the copies stop being
 * survivable, and the moment the door takes them away. The size of the ghost is
 * not here, because the size of the ghost is how many fragments have landed.
 */
const GHOST: [number, Leak][] = [
  [0.5, '1'],
  [1.2, '3'],
  [1.9, 'flood'],
  [2.8, 'none'],
];

/** When persistence stops being loose in the domain, and when the door opens. */
const BOUNDED_AT = 2.8;
const DOOR_AT = 3.8;

/**
 * What the domain asks for, as `(the moment it leaves the domain, which of the
 * two words it uses)`. What happens next is not here: it depends entirely on
 * which implementation is behind the door when the call arrives.
 */
type Op = 'find' | 'add';
const REQUESTS: [number, Op][] = [
  [6.5, 'find'],
  [7.95, 'add'],
  [9.8, 'find'],
  [21.6, 'add'],
];

/**
 * The two moments the implementation behind the door is exchanged. The first is
 * the point the second step is making and it sounds; the second is the scene
 * putting the engine back before the step ends, and it is silent.
 */
const SWAPS: [number, Impl, boolean][] = [
  [9.0, 'memory', true],
  [11.3, 'sql', false],
];

/** How long the `swap` badge stays up after an exchange. */
const SWAP_HOLD = 0.6;

/**
 * The bench, as `(when the two cards are laid down, left, right, when they are
 * compared)`. The verdict is not here: it is read off the one rule below.
 */
const BENCH: [number, Card, Card, number][] = [
  [12.5, 'e7a', 'e7b', 13.6],
  [14.8, 'e7c', 'e9c', 15.8],
  [18.5, 'v10', 'v10', 19.4],
];

/** When somebody tries to change a value and gets a new one instead. */
const REPLACE_AT = 20.4;

/** What the captions stop on, and how long each is held. */
const MARKS: [number, Mark, number][] = [
  [4.6, 'behind', 0.8],
  [10.9, 'testable', 0.7],
  [16.8, 'identity', 0.7],
  [21.4, 'no-repo', 0.7],
];

/** When the picture is called settled: a pure domain, storage at the edge. */
const SETTLE_AT = 22.8;

/** How close any cue may fall to another, and how close any of it to an edge. */
const MIN_CUE_GAP = 0.2;
const BOUNDARY_GAP = 0.3;

// --- the one rule the bench is decided by ----------------------------------

/**
 * What each card is. An entity has an identity and wears whatever fields it
 * happens to have today; a value has no identity at all and is nothing but its
 * content. Two entity cards with the same `identity` are one thing at two
 * moments of its life however far apart their `content` is, and two value cards
 * with the same `content` are the same value however many times one of them has
 * been replaced.
 */
interface Fact {
  kind: 'entity' | 'value';
  identity: string;
  content: string;
}

const FACTS: Record<Exclude<Card, 'empty'>, Fact> = {
  e7a: { kind: 'entity', identity: '7', content: 'a' },
  e7b: { kind: 'entity', identity: '7', content: 'b' },
  e7c: { kind: 'entity', identity: '7', content: 'c' },
  e9c: { kind: 'entity', identity: '9', content: 'c' },
  v10: { kind: 'value', identity: '', content: '10 USD' },
  v10n: { kind: 'value', identity: '', content: '10 USD' },
};

/** The whole of the third and fourth steps, in four lines. */
function decide(left: Card, right: Card): Verdict {
  if (left === 'empty' || right === 'empty') return 'none';
  const a = FACTS[left];
  const b = FACTS[right];
  if (a.kind !== b.kind) return 'none';
  if (a.kind === 'entity') return a.identity === b.identity ? 'same' : 'not-same';
  return a.content === b.content ? 'same' : 'not-same';
}

// --- what one pass over the scene produces ---------------------------------

/** One dot, on one of the two segments of the one column. */
interface Traveller {
  kind: Op | 'store' | 'reply';
  from: number;
  to: number;
  start: number;
  duration: number;
  /** When the marker pops. Absent for a dot that is simply absorbed. */
  verdict?: number;
  /** When the fade starts, and when the dot is gone. */
  fade: number;
  done: number;
}

interface Series {
  at: number;
  value: string;
}

interface Simulation {
  travellers: Traveller[];
  flags: Record<string, Series[]>;
  cues: [number, SceneCue][];
  adds: number;
  rows: number;
  verdicts: [number, Verdict][];
}

/**
 * Walks the whole scene in time order.
 *
 * Only the five inputs above are booked. Every round trip, every readout and
 * every verdict below is worked out from them while the pass runs, and the pass
 * asserts as it goes: `rows` is the starting three plus the Adds the engine
 * took, the Store lane is empty for the whole of the fake's window, an entity
 * verdict is decided by ids alone and a value verdict by contents alone, and no
 * two dots are ever within a halo of each other on the shared column.
 */
function simulate(): Simulation {
  const travellers: Traveller[] = [];
  const flags: Record<string, Series[]> = {
    leak: [],
    mode: [],
    door: [],
    impl: [],
    swap: [],
    left: [],
    right: [],
    verdict: [],
    rows: [],
    mark: [],
    settled: [],
  };
  const cueList: [number, SceneCue][] = [];
  const verdicts: [number, Verdict][] = [];
  const problems: string[] = [];

  /** Everything the reader can read, and the only place any of it changes. */
  let rows = BASE_ROWS;
  let adds = 0;
  let left: Card = 'empty';
  let right: Card = 'empty';
  /** The one thing the round trips depend on, read at the moment they arrive. */
  let impl: Impl = 'none';
  /** Every window the fake was behind the door, so the Store lane can be held to it. */
  const fakeWindows: [number, number][] = [];
  /** Every entity comparison, so the pass can check the step made both cases. */
  const entityCases: { sameId: boolean; sameFields: boolean; verdict: Verdict }[] = [];

  const push = (series: Series[], at: number, value: string): void => {
    const stamp = round(at);
    const last = series[series.length - 1];
    if (last && last.at === stamp) {
      last.value = value;
      return;
    }
    if (last && last.value === value) return;
    series.push({ at: stamp, value });
  };

  const cue = (at: number, name: SceneCue): void => {
    if (at < 0 || at > SCENE_DURATION) return;
    cueList.push([round(at), name]);
  };

  /** The readable state of the whole diagram, checked against what is drawn. */
  const readouts = (at: number): void => {
    if (rows !== BASE_ROWS + adds) {
      problems.push(`${at} rows ${rows} is not the ${BASE_ROWS} it started with plus ${adds} adds`);
    }
    if (!ROW_COUNTS.includes(rows as (typeof ROW_COUNTS)[number])) {
      problems.push(`${at} rows ${rows} is not a drawn value`);
    }
    push(flags.rows!, at, String(rows));
  };

  /** The bench, written down and decided in one place so it cannot disagree. */
  const bench = (at: number): void => {
    push(flags.left!, at, left);
    push(flags.right!, at, right);
    const verdict = decide(left, right);
    push(flags.verdict!, at, verdict);
    verdicts.push([round(at), verdict]);
  };

  const { schedule, drain } = createScheduler();

  // --- the ghost, and the door that replaces it ---------------------------

  for (const [at, leak] of GHOST) {
    schedule(at, () => {
      push(flags.leak!, at, leak);
      if (leak === 'flood') {
        // Copies drifting apart and nothing testable without a database is the
        // warning the first step exists to give, so that is the beat that
        // sounds like one.
        cue(at, 'failure');
      } else if (leak === 'none') {
        push(flags.mode!, BOUNDED_AT, 'bounded' satisfies Mode);
        cue(at, 'trip');
      } else {
        cue(at, 'state');
      }
    });
  }

  schedule(DOOR_AT, () => {
    // The door is not a new box: it is the same plate with two words on it, and
    // an implementation appearing behind it.
    push(flags.door!, DOOR_AT, 'on' satisfies Flag);
    impl = 'sql';
    push(flags.impl!, DOOR_AT, impl);
    cue(DOOR_AT, 'state');
  });

  // --- what the domain asks for, and what that turns into -----------------

  for (const [at, next, sounds] of SWAPS) {
    schedule(at, () => {
      if (impl === 'memory' && next !== 'memory') {
        const window = fakeWindows[fakeWindows.length - 1];
        if (window) window[1] = at;
      }
      if (next === 'memory') fakeWindows.push([at, SCENE_DURATION]);
      impl = next;
      push(flags.impl!, at, impl);
      // The badge marks the exchange either way, but only the exchange the
      // step is arguing about is allowed to make a noise.
      push(flags.swap!, at, 'on' satisfies Flag);
      push(flags.swap!, round(at + SWAP_HOLD), 'off' satisfies Flag);
      if (sounds) cue(at, 'state');
    });
  }

  for (const [at, op] of REQUESTS) {
    const arrival = round(at + CALL_LEG);
    const downDone = round(arrival + FADE);

    schedule(at, () => {
      travellers.push({
        kind: op,
        from: Y_DOMAIN_BOTTOM,
        to: Y_REPO_TOP,
        start: at,
        duration: CALL_LEG,
        fade: arrival,
        done: downDone,
      });
    });

    schedule(arrival, () => {
      if (impl === 'none') {
        problems.push(`${arrival} a call reached a door with no implementation behind it`);
        return;
      }
      // The engine walks to the Store; the fake answers out of its own set and
      // the lower lane never sees a thing. Same call, same reply.
      const engine = impl === 'sql';
      const landing = engine ? round(arrival + STORE_LEG) : arrival;

      if (engine) {
        travellers.push({
          kind: 'store',
          from: Y_REPO_BOTTOM,
          to: Y_STORE_TOP,
          start: arrival,
          duration: STORE_LEG,
          verdict: op === 'add' ? landing : undefined,
          fade: landing,
          done: round(landing + FADE),
        });
      }

      if (op === 'add') {
        // A row only ever lands because an engine put it there, and `rows` is
        // the only thing that says so.
        if (engine) {
          adds += 1;
          rows = BASE_ROWS + adds;
        }
        readouts(landing);
        cue(landing, 'success');
        return;
      }

      // A Find is answered, and the answer goes back up the same column the
      // call came down. It may not leave before the call has cleared the lane.
      const replyAt = round(Math.max(landing + DWELL, downDone + LANE_GAP));
      const replyEnd = round(replyAt + CALL_LEG);
      travellers.push({
        kind: 'reply',
        from: Y_REPO_TOP,
        to: Y_DOMAIN_BOTTOM,
        start: replyAt,
        duration: CALL_LEG,
        verdict: replyEnd,
        fade: replyEnd,
        done: round(replyEnd + FADE),
      });
      readouts(replyEnd);
      cue(replyEnd, 'success');
    });
  }

  // --- the bench ----------------------------------------------------------

  for (const [at, a, b, compareAt] of BENCH) {
    schedule(at, () => {
      left = a;
      right = b;
      // Laying the cards down decides nothing; the bench is blank until the
      // comparison happens.
      push(flags.left!, at, left);
      push(flags.right!, at, right);
      push(flags.verdict!, at, 'none' satisfies Verdict);
      cue(at, 'state');
    });

    schedule(compareAt, () => {
      bench(compareAt);
      const verdict = decide(left, right);
      const fa = left === 'empty' ? undefined : FACTS[left];
      const fb = right === 'empty' ? undefined : FACTS[right];
      if (fa && fb && fa.kind === 'entity' && fb.kind === 'entity') {
        entityCases.push({
          sameId: fa.identity === fb.identity,
          sameFields: fa.content === fb.content,
          verdict,
        });
      }
      // A verdict of `same` is the bench agreeing with itself, which is the
      // sound of a rule working; `not same` is a real answer and a state.
      cue(compareAt, verdict === 'same' ? 'success' : 'state');
    });
  }

  schedule(REPLACE_AT, () => {
    if (right !== 'v10') {
      problems.push(`${REPLACE_AT} nothing replaceable was on the bench`);
      return;
    }
    const before = decide(left, right);
    right = 'v10n';
    bench(REPLACE_AT);
    const after = decide(left, right);
    if (after !== before) {
      problems.push(`${REPLACE_AT} replacing a value changed the verdict ${before} -> ${after}`);
    }
    cue(REPLACE_AT, 'state');
  });

  // --- what the captions stop on ------------------------------------------

  for (const [at, mark, hold] of MARKS) {
    schedule(at, () => {
      push(flags.mark!, at, mark);
      cue(at, 'state');
    });
    schedule(round(at + hold), () => {
      push(flags.mark!, round(at + hold), 'none' satisfies Mark);
    });
  }

  schedule(SETTLE_AT, () => {
    push(flags.settled!, SETTLE_AT, 'on' satisfies Flag);
    cue(SETTLE_AT, 'success');
  });

  // --- run it -------------------------------------------------------------

  push(flags.leak!, 0, 'none' satisfies Leak);
  push(flags.mode!, 0, 'leaking' satisfies Mode);
  push(flags.door!, 0, 'off' satisfies Flag);
  push(flags.impl!, 0, 'none' satisfies Impl);
  push(flags.swap!, 0, 'off' satisfies Flag);
  push(flags.left!, 0, 'empty' satisfies Card);
  push(flags.right!, 0, 'empty' satisfies Card);
  push(flags.verdict!, 0, 'none' satisfies Verdict);
  push(flags.mark!, 0, 'none' satisfies Mark);
  push(flags.settled!, 0, 'off' satisfies Flag);
  readouts(0);

  drain();

  // --- what the pass is held to -------------------------------------------

  if (adds === 0) problems.push('nothing was ever added to the store');
  if (rows !== BASE_ROWS + adds) problems.push(`rows ended on ${rows}, not ${BASE_ROWS + adds}`);

  // The fake's whole claim is that the lower lane goes quiet, so check it.
  for (const traveller of travellers) {
    if (traveller.kind !== 'store') continue;
    for (const [from, to] of fakeWindows) {
      if (traveller.start < to && traveller.done > from) {
        problems.push(`${traveller.start} the store lane ran while the fake was behind the door`);
      }
    }
  }

  // Both entity cases the third step promises have to actually be on screen.
  if (!entityCases.some((c) => c.sameId && !c.sameFields && c.verdict === 'same')) {
    problems.push('the bench never showed one entity at two moments of its life');
  }
  if (!entityCases.some((c) => !c.sameId && c.sameFields && c.verdict === 'not-same')) {
    problems.push('the bench never showed two strangers wearing the same fields');
  }
  for (const [at, verdict] of verdicts) {
    if (verdict !== 'none' && verdict !== 'same' && verdict !== 'not-same') {
      problems.push(`${at} verdict ${verdict} is not a drawn value`);
    }
  }

  // Two dots on one column, in either direction, never inside one halo.
  const samples = Math.round(SCENE_DURATION / 0.01) + 1;
  for (let i = 0; i < samples; i += 1) {
    const t = round(i * 0.01);
    const live: number[] = [];
    for (const traveller of travellers) {
      if (t < traveller.start || t >= traveller.done) continue;
      const progress = Math.min(1, Math.max(0, (t - traveller.start) / traveller.duration));
      live.push(traveller.from + (traveller.to - traveller.from) * progress);
    }
    for (let a = 0; a < live.length; a += 1) {
      for (let b = a + 1; b < live.length; b += 1) {
        if (Math.abs((live[a] ?? 0) - (live[b] ?? 0)) < HALO) {
          problems.push(`${t} two travellers share the column at y ${live[a]} and ${live[b]}`);
        }
      }
    }
  }

  for (const [at, name] of cueList) {
    if (BOUNDARIES.some((edge) => Math.abs(at - edge) < BOUNDARY_GAP)) {
      problems.push(`${at} ${name} sounds inside a step boundary`);
    }
  }
  const ordered = [...cueList].sort((l, r) => l[0] - r[0]);
  for (let i = 1; i < ordered.length; i += 1) {
    const gap = (ordered[i]?.[0] ?? 0) - (ordered[i - 1]?.[0] ?? 0);
    if (gap < MIN_CUE_GAP - EPS) {
      problems.push(`two cues ${gap.toFixed(2)}s apart at ${ordered[i]?.[0]}`);
    }
  }
  if (problems.length > 0) throw new Error(`${ID} scene: ${problems[0]}`);

  return { travellers, flags, cues: ordered, adds, rows, verdicts };
}

// --- the timeline ----------------------------------------------------------

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const layer = pick<SVGGElement>(stage, '.scene-requests', ID);

  const sim = simulate();
  const parts = mountRequests(layer, sim.travellers.length, ID);
  const tl = createSceneTimeline();

  // --- everything the stage says about itself ------------------------------

  for (const [name, series] of Object.entries(sim.flags)) {
    for (const entry of series) attr(tl, stage, `data-repo-${name}`, entry.value, entry.at);
  }

  // --- what travels --------------------------------------------------------

  sim.travellers.forEach((plan, index) => {
    const request: RequestParts | undefined = parts[index];
    if (!request) return;
    request.group.classList.add(`repo-req--${plan.kind}`);
    parkRequest(request, X_LANE, plan.from);

    if (Math.abs(plan.to - plan.from) < 1) {
      throw new Error(`${ID} scene: a traveller with nowhere to go`);
    }
    showRequest(tl, request, plan.start);
    moveRequest(tl, request, plan.to, plan.duration, plan.start);
    if (plan.verdict !== undefined) markRequest(tl, request, 'ok', plan.verdict);
    hideRequest(tl, request, plan.fade, FADE);
  });

  // --- sound ---------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels ---------------------------------------------------------

  // The stage is complete on the first frame: a service with nothing leaking
  // into it, a door nobody has opened with no implementation behind it, an
  // empty bench, a Store holding three rows, and nothing in flight.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
