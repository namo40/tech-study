import {
  GHOST_FIELDS,
  ITEMS,
  MAX_OK,
  SCENE_DURATION,
  TOTALS,
  X_SALES,
  X_SHIP,
  Y_CONTEXT_BOTTOM,
  Y_CONTEXT_TOP,
  Y_DOMAIN_BOTTOM,
  Y_ROOT_TOP,
} from './stage';
import type { CardState, ContextId, Flag, Ghost, Lamp, Mark, Mode } from './stage';
import { q as pick } from '../shared/dom';
import {
  hideRequest,
  markRequest,
  mountRequests,
  moveRequest,
  parkRequest,
  showRequest,
} from '../shared/request';
import type { RequestParts, RequestResult } from '../shared/request';
import { createScheduler } from '../shared/simulation';
import { attr, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Domain-Driven Design scene: a 24 second, four step timeline.
 *
 * The two standing rules apply here as everywhere: every tween sits at an
 * absolute position, and every discrete change is a zero-duration tween on a
 * `data-*` attribute that GSAP reverts when the playhead moves back past it.
 * Nothing on this stage interpolates at all — a border is drawn or it is not,
 * a word means one thing or another, a write is let through or refused — so
 * every readable value is a stack of text with one variant revealed.
 *
 * Nothing the reader watches is placed by hand. The scene is told five things
 * and one `createScheduler` pass over the whole 24 seconds derives the rest:
 *
 *   1. **the ghost window** — when the shared model goes up, when each field
 *      accretes on it, and when it comes down;
 *   2. **when each context says what it means** by the word it inherited;
 *   3. **the write schedule** — `(verdict time, through the root or around it,
 *      how much the line is worth)`, which is the whole of the third step;
 *   4. **when Sales publishes and when Shipping reads**;
 *   5. **what the captions stop on**, and for how long.
 *
 * Everything else falls out of walking that. **The verdict** is not authored:
 * a write that arrives through the root is checked against the invariant and
 * passes, and a write that tried to go around the door is refused, so the two
 * outcomes are one rule rather than two drawings. **`total n`** is the running
 * sum of the deltas the root accepted, and nothing else may move it — a refused
 * write leaves every readout on the stage exactly as it found it, which is the
 * property the third step is claiming and the model asserts at every refusal.
 * **`ok n`** is the count of those acceptances. **The lamp** is whatever the
 * root last answered, and it goes back to waiting on its own. And **Shipping's
 * `items n`** after the fourth step is the line count Sales published, worked
 * out from the writes the root accepted rather than written down twice — which
 * is what makes the translation a translation instead of a shared variable.
 *
 * The neighbouring scene is Event Sourcing, and the difference is deliberate.
 * There the aggregate is the thing that turns a command into an event and a log
 * back into state. Here it is a **gatekeeper**: one door, an invariant checked
 * on the way through, and outside references that hold an id rather than a line.
 * Nothing in this scene is replayed and nothing is snapshotted, because the
 * argument is about where a boundary goes, not about how state is stored.
 */

const ID = 'domain-driven-design';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

const BOUNDARIES = [0, 6, 12, 18, 24];
const EPS = 1e-9;

// --- how a traveller moves -------------------------------------------------

/** Seconds a word takes between the Domain band and a context: 200px. */
const LANG_LEG = 0.34;
/** Seconds a write takes from Sales to the Root's door: 230px. */
const WRITE_LEG = 0.39;
/** How long a write stands at the door while the invariant is checked. */
const DOOR_DWELL = 0.21;
/** How long a traveller takes to fade once it is absorbed. */
const FADE = 0.12;

// --- what the scene is told ------------------------------------------------

/**
 * The shared model of the first step: when it goes up, when each department's
 * fields land on it, and when it comes down again. The card's size is not here,
 * because the card's size is how many fields have landed.
 */
const GHOST = {
  ticks: [0.5, 0.87, 1.24, 1.6],
  off: 2.8,
} as const;

/** When the Domain band stops being one model, and when the two frames light. */
const BORDERED_AT = 2.8;
const FRAMES_AT = 3.8;

/** When each context says what it means by the word it inherited. */
const REVEALS: [number, ContextId][] = [
  [6.5, 'sales'],
  [7.6, 'ship'],
];

/**
 * A change made inside one context, in that context's own language. The number
 * is what it adds to that context's own readout, which for Sales is nothing —
 * a price is not a line — and for Shipping is one box.
 */
const UPDATES: [number, ContextId, number][] = [
  [8.8, 'sales', 0],
  [9.8, 'ship', 1],
];

/** When the Root stops being scenery and becomes the door being watched. */
const ROOT_AT = 12.5;

/**
 * The writes, as `(the moment the verdict lands, how the writer got there, what
 * the line is worth)`. The verdict itself is not here: a write that came through
 * the root is checked and passes, and one that went around it is refused.
 */
type Route = 'root' | 'bypass';
const WRITES: [number, Route, number][] = [
  [13.4, 'root', 3],
  [14.6, 'root', 2],
  [16.2, 'bypass', 4],
];

/** When Sales publishes in its own words, and when Shipping has read it. */
const PUBLISH_AT = 18.5;
const CONSUME_AT = 19.6;

/** What the scene holds up for a moment, and how long it holds it. */
const MARKS: [number, Mark, number][] = [
  [4.6, 'border', 0.7],
  [10.4, 'promise', 0.7],
  [16.9, 'id-only', 0.7],
  [20.8, 'no-share', 0.7],
  [21.8, 'map', 0.5],
];

/** How long a context's frame stays lit after a change it accepted. */
const PULSE_HOLD = 0.5;
/** How long the guard's lamp holds an answer before going back to waiting. */
const LAMP_HOLD = 0.7;
/** How long the refusal stays on the board. */
const DENY_HOLD = 0.6;

/** When the picture is called settled: two contexts, one door, one translation. */
const SETTLE_AT = 22.4;

/** How close any cue may fall to another, and how close any of it to an edge. */
const MIN_CUE_GAP = 0.2;
const BOUNDARY_GAP = 0.3;

// --- what one pass over the scene produces --------------------------------

/** One dot, on one of the three lanes. */
interface Traveller {
  kind: 'lang' | 'write' | 'bypass' | 'event';
  x: number;
  from: number;
  to: number;
  start: number;
  /** When the marker pops, and what it says. Absent for a plain delivery. */
  verdict?: { at: number; result: RequestResult };
  /** Where it goes after the verdict, for a write that was sent back. */
  back?: { to: number; at: number; duration: number };
  /** When the dot is gone. */
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
  published: number;
  accepted: number;
  refused: number;
  total: number;
}

/**
 * Walks the whole scene in time order.
 *
 * Only the five inputs above are booked. Every verdict, every readout and every
 * cue below is worked out from them while the pass runs, and the pass asserts
 * as it goes: a refused write may not move anything, an accepted one must leave
 * the total equal to the sum of the deltas the root has taken, and the count of
 * boxes Shipping ends with must be the line count Sales published.
 */
function simulate(): Simulation {
  const travellers: Traveller[] = [];
  const flags: Record<string, Series[]> = {
    ghost: [],
    fields: [],
    mode: [],
    frames: [],
    sales: [],
    ship: [],
    total: [],
    items: [],
    root: [],
    lamp: [],
    ok: [],
    deny: [],
    event: [],
    mark: [],
    settled: [],
  };
  const cueList: [number, SceneCue][] = [];
  const problems: string[] = [];

  /** Everything the reader can read, and the only place any of it changes. */
  let fields = 0;
  let total = 0;
  let items = 0;
  let ok = 0;
  let accepted = 0;
  let refused = 0;
  /** The deltas the root has taken, which `total` has to keep agreeing with. */
  const takenDeltas: number[] = [];
  let published = 0;

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
    const sum = takenDeltas.reduce((a, b) => a + b, 0);
    if (total !== sum) problems.push(`${at} total ${total} is not the sum ${sum} of accepted lines`);
    if (!TOTALS.includes(total as (typeof TOTALS)[number])) {
      problems.push(`${at} total ${total} is not a drawn value`);
    }
    if (!ITEMS.includes(items as (typeof ITEMS)[number])) {
      problems.push(`${at} items ${items} is not a drawn value`);
    }
    if (ok > MAX_OK) problems.push(`${at} ok ${ok} is past the ${MAX_OK} drawn`);
    if (ok !== accepted) problems.push(`${at} ok ${ok} is not the ${accepted} writes taken`);
    push(flags.total, at, String(total));
    push(flags.items, at, String(items));
    push(flags.ok, at, String(ok));
  };

  const { schedule, drain } = createScheduler();

  // --- the shared model, and the borders that replace it ------------------

  GHOST.ticks.forEach((at, index) => {
    schedule(at, () => {
      fields = index + 1;
      if (index === 0) push(flags.ghost, at, 'on' satisfies Ghost);
      push(flags.fields, at, String(fields));
      // Putting the shared model up is a state. Reaching the size where every
      // change has to be negotiated with everybody is the warning the first
      // step exists to give, so the last field is the one that sounds like one.
      if (index === 0) cue(at, 'state');
      else if (fields === GHOST_FIELDS) cue(at, 'failure');
    });
  });

  schedule(GHOST.off, () => {
    fields = 0;
    push(flags.ghost, GHOST.off, 'off' satisfies Ghost);
    push(flags.fields, GHOST.off, '0');
    push(flags.mode, BORDERED_AT, 'bordered' satisfies Mode);
    cue(GHOST.off, 'trip');
  });

  schedule(FRAMES_AT, () => {
    push(flags.frames, FRAMES_AT, 'on' satisfies Flag);
    cue(FRAMES_AT, 'state');
  });

  // --- what travels, and what each arrival means --------------------------

  const laneOf = (context: ContextId): number => (context === 'sales' ? X_SALES : X_SHIP);

  for (const [at, context] of REVEALS) {
    const start = round(at - LANG_LEG);
    schedule(start, () => {
      travellers.push({
        kind: 'lang',
        x: laneOf(context),
        from: Y_DOMAIN_BOTTOM,
        to: Y_CONTEXT_TOP,
        start,
        done: round(at + FADE),
      });
    });
    schedule(at, () => {
      push(flags[context]!, at, 'own' satisfies CardState);
      readouts(at);
      cue(at, 'state');
    });
  }

  for (const [at, context, delta] of UPDATES) {
    const start = round(at - LANG_LEG);
    schedule(start, () => {
      travellers.push({
        kind: 'lang',
        x: laneOf(context),
        from: Y_DOMAIN_BOTTOM,
        to: Y_CONTEXT_TOP,
        start,
        verdict: { at, result: 'ok' },
        done: round(at + FADE + 0.1),
      });
    });
    schedule(at, () => {
      const card = flags[context]?.[flags[context]!.length - 1]?.value;
      if (card !== 'own') problems.push(`${at} ${context} took a change before it had a model`);
      // A change made in a context's own language lands in that context and
      // nowhere else, which is the whole of what a border buys.
      if (context === 'ship') items += delta;
      readouts(at);
      push(flags.mark, at, context satisfies Mark);
      push(flags.mark, round(at + PULSE_HOLD), 'none' satisfies Mark);
      cue(at, 'success');
    });
  }

  // --- the door -----------------------------------------------------------

  schedule(ROOT_AT, () => {
    push(flags.root, ROOT_AT, 'on' satisfies Flag);
    cue(ROOT_AT, 'state');
  });

  for (const [verdictAt, route, delta] of WRITES) {
    const start = round(verdictAt - DOOR_DWELL - WRITE_LEG);
    schedule(start, () => {
      // A write that means to go around the guard is drawn hollow and dashed on
      // the same column, because it is the same road with the door skipped.
      const result: RequestResult = route === 'root' ? 'ok' : 'fail';
      travellers.push({
        kind: route === 'root' ? 'write' : 'bypass',
        x: X_SALES,
        from: Y_CONTEXT_BOTTOM,
        to: Y_ROOT_TOP,
        start,
        verdict: { at: verdictAt, result },
        back:
          route === 'bypass'
            ? { to: Y_CONTEXT_BOTTOM, at: verdictAt, duration: WRITE_LEG }
            : undefined,
        done:
          route === 'bypass'
            ? round(verdictAt + WRITE_LEG + FADE)
            : round(verdictAt + 0.22 + FADE),
      });
      if (route === 'bypass') cue(start, 'state');
    });

    schedule(verdictAt, () => {
      const before = `${total}|${items}|${ok}`;
      if (route === 'root') {
        // Through the door: the root checks the one rule it owns, and the total
        // and the count move together because they are the same event.
        takenDeltas.push(delta);
        total += delta;
        accepted += 1;
        ok += 1;
        push(flags.lamp, verdictAt, 'ok' satisfies Lamp);
        push(flags.lamp, round(verdictAt + LAMP_HOLD), 'idle' satisfies Lamp);
        readouts(verdictAt);
        cue(verdictAt, 'success');
      } else {
        refused += 1;
        push(flags.lamp, verdictAt, 'deny' satisfies Lamp);
        push(flags.deny, verdictAt, 'on' satisfies Flag);
        push(flags.lamp, round(verdictAt + DENY_HOLD), 'idle' satisfies Lamp);
        push(flags.deny, round(verdictAt + DENY_HOLD), 'off' satisfies Flag);
        readouts(verdictAt);
        cue(verdictAt, 'state');
        const after = `${total}|${items}|${ok}`;
        if (after !== before) {
          problems.push(`${verdictAt} a refused write moved a readout: ${before} -> ${after}`);
        }
      }
    });
  }

  // --- the one thing that crosses a border --------------------------------

  schedule(PUBLISH_AT, () => {
    // Sales publishes what its own model knows: the lines the root took. The
    // number is read off the model rather than written down a second time.
    published = accepted;
    travellers.push({
      kind: 'event',
      x: X_SALES,
      from: Y_CONTEXT_TOP,
      to: Y_DOMAIN_BOTTOM,
      start: PUBLISH_AT,
      done: round(PUBLISH_AT + LANG_LEG + FADE),
    });
    push(flags.event, round(PUBLISH_AT + LANG_LEG), 'on' satisfies Flag);
    cue(PUBLISH_AT, 'trip');
  });

  const consumeStart = round(CONSUME_AT - LANG_LEG);
  schedule(consumeStart, () => {
    travellers.push({
      kind: 'event',
      x: X_SHIP,
      from: Y_DOMAIN_BOTTOM,
      to: Y_CONTEXT_TOP,
      start: consumeStart,
      verdict: { at: CONSUME_AT, result: 'ok' },
      done: round(CONSUME_AT + FADE + 0.1),
    });
  });

  schedule(CONSUME_AT, () => {
    // Shipping builds its own Order from what it heard. It does not take Sales'
    // model; it takes Sales' words and counts boxes with them.
    items = published;
    readouts(CONSUME_AT);
    if (items !== published) problems.push(`${CONSUME_AT} Shipping did not rebuild from the event`);
    push(flags.mark, CONSUME_AT, 'ship' satisfies Mark);
    push(flags.mark, round(CONSUME_AT + PULSE_HOLD), 'none' satisfies Mark);
    cue(CONSUME_AT, 'success');
  });

  // --- what the captions stop on ------------------------------------------

  for (const [at, mark, hold] of MARKS) {
    schedule(at, () => {
      push(flags.mark, at, mark);
      cue(at, 'state');
    });
    schedule(round(at + hold), () => {
      push(flags.mark, round(at + hold), 'none' satisfies Mark);
    });
  }

  schedule(SETTLE_AT, () => {
    push(flags.settled, SETTLE_AT, 'on' satisfies Flag);
    push(flags.lamp, SETTLE_AT, 'ok' satisfies Lamp);
    cue(SETTLE_AT, 'success');
  });

  // --- run it -------------------------------------------------------------

  push(flags.ghost, 0, 'off' satisfies Ghost);
  push(flags.fields, 0, '0');
  push(flags.mode, 0, 'shared' satisfies Mode);
  push(flags.frames, 0, 'off' satisfies Flag);
  push(flags.sales, 0, 'none' satisfies CardState);
  push(flags.ship, 0, 'none' satisfies CardState);
  push(flags.root, 0, 'off' satisfies Flag);
  push(flags.lamp, 0, 'idle' satisfies Lamp);
  push(flags.deny, 0, 'off' satisfies Flag);
  push(flags.event, 0, 'off' satisfies Flag);
  push(flags.mark, 0, 'none' satisfies Mark);
  push(flags.settled, 0, 'off' satisfies Flag);
  readouts(0);

  drain();

  // --- what the pass is held to -------------------------------------------

  if (accepted === 0) problems.push('no write ever went through the root');
  if (refused === 0) problems.push('nothing ever tried to go around the root');
  if (items !== published) {
    problems.push(`Shipping ended on items ${items}, Sales published ${published}`);
  }
  let highest = -1;
  for (const entry of flags.ok ?? []) {
    const value = Number(entry.value);
    if (value < highest) problems.push(`${entry.at} ok fell from ${highest} to ${value}`);
    highest = Math.max(highest, value);
  }
  for (const [at, name] of cueList) {
    if (BOUNDARIES.some((edge) => Math.abs(at - edge) < BOUNDARY_GAP)) {
      problems.push(`${at} ${name} sounds inside a step boundary`);
    }
  }
  const ordered = [...cueList].sort((left, right) => left[0] - right[0]);
  for (let i = 1; i < ordered.length; i += 1) {
    const gap = (ordered[i]?.[0] ?? 0) - (ordered[i - 1]?.[0] ?? 0);
    if (gap < MIN_CUE_GAP - EPS) problems.push(`two cues ${gap.toFixed(2)}s apart at ${ordered[i]?.[0]}`);
  }
  if (problems.length > 0) throw new Error(`${ID} scene: ${problems[0]}`);

  return { travellers, flags, cues: ordered, published, accepted, refused, total };
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
    for (const entry of series) attr(tl, stage, `data-ddd-${name}`, entry.value, entry.at);
  }

  // --- what travels --------------------------------------------------------

  sim.travellers.forEach((plan, index) => {
    const request: RequestParts | undefined = parts[index];
    if (!request) return;
    request.group.classList.add(`ddd-req--${plan.kind}`);
    parkRequest(request, plan.x, plan.from);

    if (Math.abs(plan.to - plan.from) < 1) {
      throw new Error(`${ID} scene: a traveller with nowhere to go`);
    }
    const duration = plan.kind === 'write' || plan.kind === 'bypass' ? WRITE_LEG : LANG_LEG;
    showRequest(tl, request, plan.start);
    moveRequest(tl, request, plan.to, duration, plan.start);

    if (plan.verdict) markRequest(tl, request, plan.verdict.result, plan.verdict.at);
    if (plan.back) {
      moveRequest(tl, request, plan.back.to, plan.back.duration, plan.back.at);
    }
    hideRequest(tl, request, round(plan.done - FADE), FADE);
  });

  // --- sound ---------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels ---------------------------------------------------------

  // The stage is complete on the first frame: the word `Order` on a lean card,
  // two contexts that have not yet said what they mean by it, a guard waiting at
  // a door nobody has knocked on, and nothing in flight.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
