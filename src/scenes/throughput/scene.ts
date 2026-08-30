import {
  BUSY_LEVELS,
  CAPACITIES,
  DOT_ITEMS,
  QUEUE_MAX,
  RATES,
  SCENE_DURATION,
  SLOT_MAX,
  STAGE_STATE,
  WAIT_LEVELS,
  X_LANE,
  Y_ARRIVALS_BOTTOM,
  Y_DONE_TOP,
  Y_SERVER_BOTTOM,
  Y_SERVER_TOP,
  gaugeWidth,
} from './stage';
import type { Flag, Ghost, Mark } from './stage';
import { q as pick } from '../shared/dom';
import { hideRequest, mountRequests, parkRequest, showRequest } from '../shared/request';
import type { RequestParts } from '../shared/request';
import { createScheduler } from '../shared/simulation';
import { attr, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Throughput scene: a 24 second, four step timeline.
 *
 * The two standing rules apply here as everywhere: every tween sits at an
 * absolute position, and every discrete change is a zero-duration tween on a
 * `data-*` attribute that GSAP reverts when the playhead moves back past it.
 * The gauge fill is the one width that is interpolated, because an arrival rate
 * closing on a ceiling is a picture before it is a number.
 *
 * Nothing the reader watches is placed by hand. The scene is told four things
 * and one `createScheduler` pass over the whole 24 seconds derives the rest:
 *
 *   1. **the arrival timeline** — what `in` is, and when it changes;
 *   2. **the Server's configuration timeline** — how many slots it is paying
 *      for and how long one of them takes over a job, which between them are
 *      the only source of capacity in this diagram;
 *   3. **the size of a unit of work** — `DOT_ITEMS`, which is both what one
 *      traveller stands for and what one queue cell holds;
 *   4. **the value sets the four readouts may draw**, and the windows each step
 *      may put traffic in.
 *
 * Everything else falls out of walking that. **Capacity** is slots times the
 * rate one slot achieves. **The queue** is the running integral of `in` minus
 * capacity, floored at nothing, and a cell appears the instant that integral
 * passes another `DOT_ITEMS` of work — so the row of cells is the integral by
 * construction and the two can never disagree. **`busy`** is a hundred percent
 * whenever there is a queue or arrivals have reached the ceiling, and the share
 * of capacity in use otherwise; the filled slots are that percentage of the row,
 * so the picture and the number are one calculation. **`out`** is capacity
 * whenever the Server has work banked and the arrival rate otherwise, which is
 * the whole argument of the third step written as two lines of arithmetic:
 * throughput cannot pass the ceiling, and beyond the ceiling the extra arrivals
 * do not go anywhere except into the line. **`wait`** is the queue divided by
 * the rate it is being retired at — Little's law, at the granularity the row is
 * drawn in — so it moves when the queue moves and never on its own.
 *
 * The one moment the model books for itself is the relief at the end. The
 * arrival timeline does not say when the pressure comes back; the scheduler
 * says it, at the instant the last unit leaves the line, because the point of
 * the fourth step is that the same load which saturated a four-slot Server sits
 * at 80% of a six-slot one.
 *
 * Backpressure is this scene's neighbour and is deliberately a different scene.
 * Backpressure is about **what to do** when arrivals outrun capacity: level the
 * load, bound the concurrency, batch the drain. Nothing is levelled, bounded or
 * batched here. This scene is the **measuring lens** you need before any of
 * those is a sensible thing to argue about: two axes rather than one,
 * utilization as the cheapest early warning, saturation as the place latency
 * actually lives, and a ceiling that belongs to the narrowest stage. The fourth
 * step nods at capacity and at arrival pressure because those are the only two
 * levers there are, but it stages neither of them as a mechanism.
 *
 * One quantity is reported rather than drawn, exactly as in Backpressure. A dot
 * on a lane is `DOT_ITEMS` of work, so the cadence on each lane is the number
 * written beside it divided by that, and the two lanes visibly run at different
 * speeds the moment `out` stops following `in`. What a dot does *not* do is wait
 * in the line: the line is drawn as cells, because a request standing in a queue
 * is not travelling anywhere, and that is the point the third step is making.
 */

const ID = 'throughput';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

const BOUNDARIES = [0, 6, 12, 18, 24];
const EPS = 1e-9;

// --- how a traveller moves -------------------------------------------------

/** Seconds a request takes from Arrivals to the Server: 200px. */
const IN_LEG = 0.24;
/** Seconds a completion takes from the Server to Done: 230px. */
const OUT_LEG = 0.28;
/** How long a traveller takes to fade once it is absorbed. */
const FADE = 0.1;

// --- what the scene is told ------------------------------------------------

/**
 * The rate work arrives at, and when that changes. The last change is not here:
 * the model books it when the line is empty again.
 */
const ARRIVALS: [number, number][] = [
  [0, 10],
  [6.5, 16],
  [8.6, 32],
  [12.5, 60],
  [15.5, 40],
];

/** What the arrival rate comes back to once the backlog is gone. */
const RELIEF_RATE = 48;

/**
 * The Server, and the two ghosts of the first step. `slots` is how many jobs it
 * can have in hand at once and `each` is how many of them one slot finishes per
 * second, so capacity is the product and nothing else. The two ghosts are the
 * same capacity reached two different ways: one slot that takes 100 ms a job,
 * and four that take 400 ms.
 */
interface Config {
  slots: number;
  each: number;
  ghost: Ghost;
}

const CONFIGS: [number, Config][] = [
  [0, { slots: 4, each: 10, ghost: 'off' }],
  [0.5, { slots: 1, each: 10, ghost: 'a' }],
  [1.6, { slots: 4, each: 2.5, ghost: 'b' }],
  [3.6, { slots: 4, each: 10, ghost: 'off' }],
  [18.5, { slots: 6, each: 10, ghost: 'off' }],
];

/** What the scene holds up for a moment, and how long it holds it. */
const MARKS: [number, Mark][] = [
  [2.8, 'axes'],
  [10.6, 'headroom'],
  [14.4, 'ceiling'],
  [16.4, 'behind'],
  [21.8, 'bottleneck'],
];
const MARK_HOLD = 0.7;

/** When the picture is called settled: the widened Server, running with room. */
const SETTLE_AT = 22.4;

/**
 * When traffic may be put on the lanes. Each step ends on a still stage, so a
 * request is only sent, and a completion only released, while its window is
 * open; `outBy` runs a little past `inBy` so the last thing the reader sees is
 * work leaving rather than work arriving.
 */
const WINDOWS = [
  { from: 0.4, inBy: 4.6, outBy: 5.2 },
  { from: 6.3, inBy: 10.7, outBy: 11.0 },
  { from: 12.4, inBy: 16.4, outBy: 16.6 },
  { from: 18.4, inBy: 21.8, outBy: 22.0 },
];

/** The three beats that are a completion landing rather than a number moving. */
const LANDINGS: [number, string][] = [
  [4.2, 'flow'],
  [7.3, 'linear-40'],
  [9.5, 'linear-80'],
];

/** How close two samples of one repeating thing may sound, how close any cue
    may fall to another, and how close any of it may fall to a boundary. */
const SAMPLE_GAP = 1.15;
const MIN_CUE_GAP = 0.2;
const BOUNDARY_GAP = 0.3;

// --- what one pass over the scene produces --------------------------------

/** One dot, on one of the two lanes. */
interface Traveller {
  lane: 'in' | 'out';
  start: number;
  home: number;
}

interface Series {
  at: number;
  value: string;
}

/** A cue that has to sound, and the family it belongs to for spacing. */
interface Fixed {
  at: number;
  family: string | null;
  name: SceneCue;
}

interface Simulation {
  travellers: Traveller[];
  flags: Record<string, Series[]>;
  fills: [number, number][];
  cues: [number, SceneCue][];
  peakQueue: number;
  emptyAt: number | null;
  ghostOut: Record<string, string>;
}

/** The nearest rung of a readout's ladder to a derived figure. */
const snap = (levels: readonly number[], value: number): number =>
  levels.reduce((best, rung) => (Math.abs(rung - value) < Math.abs(best - value) ? rung : best));

const windowAt = (t: number): (typeof WINDOWS)[number] | undefined =>
  WINDOWS.find((w) => t >= w.from - EPS && t <= w.outBy + EPS);

/**
 * Walks the whole scene in time order.
 *
 * Arrivals and the Server's shape are the only things booked up front. The
 * queue books itself: every time the integral of `in` minus capacity passes
 * another unit of work, that crossing is an event, and the event books the next
 * one from wherever the rates are by then.
 */
function simulate(): Simulation {
  const travellers: Traveller[] = [];
  const flags: Record<string, Series[]> = {
    in: [],
    busy: [],
    queue: [],
    out: [],
    wait: [],
    slots: [],
    active: [],
    cap: [],
    ghost: [],
    mark: [],
    settled: [],
  };
  const fills: [number, number][] = [];
  const fixed: Fixed[] = [];
  const candidates: Fixed[] = [];
  const problems: string[] = [];

  let inRate = ARRIVALS[0]?.[1] ?? 10;
  let config: Config = CONFIGS[0]?.[1] ?? { slots: 4, each: 10, ghost: 'off' };
  /** Units of work banked, in items, and the instant that figure is true at. */
  let banked = 0;
  let bankedAt = 0;
  let peakQueue = 0;
  /** The queue as the stage last drew it, which is the only version cues read. */
  let drawnQueue = 0;
  let emptyAt: number | null = null;
  let relieved = false;
  /** The crossing the queue has booked, or null when it has none. */
  let crossingDue: number | null = null;
  /** The earliest a completion may leave, once the Server has been rebuilt. */
  let outHold = 0;
  const ghostOut: Record<string, string> = {};

  const capacity = (): number => config.slots * config.each;
  const net = (): number => inRate - capacity();
  const queueUnits = (): number => Math.floor(banked / DOT_ITEMS + EPS);

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

  const fix = (at: number, name: SceneCue, family: string | null = null): void => {
    if (at < 0 || at > SCENE_DURATION) return;
    fixed.push({ at: round(at), family, name });
  };

  const sample = (at: number, family: string, name: SceneCue): void => {
    if (at < 0 || at > SCENE_DURATION) return;
    candidates.push({ at: round(at), family, name });
  };

  const { schedule, drain } = createScheduler();

  // --- everything the stage says about itself, from the two rates ----------

  /**
   * The whole readable state of the diagram, worked out from `in`, the Server's
   * shape and the queue. Nothing below this line writes a number the reader
   * sees; they all change these three and ask for the picture again.
   */
  const write = (at: number): void => {
    const cap = capacity();
    const units = queueUnits();
    peakQueue = Math.max(peakQueue, units);
    drawnQueue = units;

    const saturated = units > 0 || inRate >= cap - EPS;
    const busy = saturated ? 100 : snap(BUSY_LEVELS, (inRate / cap) * 100);
    const out = saturated ? cap : inRate;
    const wait = snap(WAIT_LEVELS, ((units * DOT_ITEMS) / cap) * 1000);
    const active = Math.round((busy / 100) * config.slots);

    if (!RATES.includes(inRate as (typeof RATES)[number])) {
      problems.push(`${at} in ${inRate} is not a drawn value`);
    }
    if (!RATES.includes(out as (typeof RATES)[number])) {
      problems.push(`${at} out ${out} is not a drawn value`);
    }
    if (!CAPACITIES.includes(cap as (typeof CAPACITIES)[number])) {
      problems.push(`${at} capacity ${cap} has no ceiling line`);
    }
    if (units > QUEUE_MAX) problems.push(`${at} the queue reached ${units}, past the row`);
    if (out > cap + EPS) problems.push(`${at} out ${out} is above capacity ${cap}`);
    if (units === 0 && out > inRate + EPS) {
      problems.push(`${at} out ${out} is above in ${inRate} with an empty queue`);
    }
    if (active > config.slots) problems.push(`${at} ${active} slots busy of ${config.slots}`);

    push(flags.in, at, String(inRate));
    push(flags.busy, at, String(busy));
    push(flags.queue, at, String(units));
    push(flags.out, at, String(out));
    push(flags.wait, at, String(wait));
    push(flags.slots, at, String(config.slots));
    push(flags.active, at, String(active));
    push(flags.cap, at, String(cap));
    push(flags.ghost, at, config.ghost);

    if (config.ghost !== 'off') {
      ghostOut[config.ghost] = `${config.slots} slot(s) x ${1000 / config.each} ms -> out ${out}/s, busy ${busy}%`;
    }

    const last = fills[fills.length - 1];
    const width = gaugeWidth(inRate);
    if (!last || last[1] !== width) fills.push([round(at), width]);
  };

  // --- the queue, which books its own next move ---------------------------

  /** Moves the banked work forward to `at` without touching anything else. */
  const carry = (at: number): void => {
    const value = banked + net() * (at - bankedAt);
    banked = value < EPS ? 0 : value;
    bankedAt = at;
  };

  const bookCrossing = (from: number): void => {
    crossingDue = null;
    const rate = net();
    if (rate > EPS) {
      const level = (Math.floor(banked / DOT_ITEMS + EPS) + 1) * DOT_ITEMS;
      const at = round(from + (level - banked) / rate);
      if (at > SCENE_DURATION) return;
      crossingDue = at;
      schedule(at, () => crossing(at));
    } else if (rate < -EPS && banked > EPS) {
      const level = Math.max(0, (Math.ceil(banked / DOT_ITEMS - EPS) - 1) * DOT_ITEMS);
      const at = round(from + (banked - level) / -rate);
      if (at > SCENE_DURATION) return;
      crossingDue = at;
      schedule(at, () => crossing(at));
    }
  };

  function crossing(at: number): void {
    if (crossingDue !== at) return;
    crossingDue = null;
    // The comparison is against what the stage last drew, not against the live
    // integral: a traveller leaving carries the integral forward too, so the
    // only honest "before" is the number the reader can currently see.
    const before = drawnQueue;
    carry(at);
    write(at);
    const after = drawnQueue;

    if (after > before) {
      // The line growing is the only thing the third step is about, so the
      // first unit is always heard and the rest are sampled.
      if (before === 0) fix(at, 'state', 'grow');
      else sample(at, 'grow', 'state');
    } else if (after < before) {
      if (after === 0) {
        emptyAt = at;
        // The backlog is gone, so the pressure that saturated the old Server
        // comes back — and lands inside the ceiling the new one has.
        if (!relieved && at > 18) {
          relieved = true;
          inRate = RELIEF_RATE;
          write(at);
          fix(at, 'success');
        }
      } else if (before === peakQueue) fix(at, 'state', 'drain');
      else sample(at, 'drain', 'success');
    }

    bookCrossing(at);
  }

  // --- what the scene is told, laid down in time order --------------------

  for (const [from, rate] of ARRIVALS) {
    if (from === 0) continue;
    schedule(from, () => {
      carry(from);
      inRate = rate;
      write(from);
      // Arrivals crossing the ceiling and arrivals levelling off again are the
      // two beats of the third step. The second lands on the queue's peak, so
      // it is the failure that beat is entitled to rather than a second state.
      fix(from, queueUnits() === peakQueue && peakQueue > 0 ? 'failure' : 'state');
      bookCrossing(from);
    });
  }

  for (const [from, shape] of CONFIGS) {
    if (from === 0) continue;
    schedule(from, () => {
      carry(from);
      const wasGhost = config.ghost;
      config = shape;
      write(from);
      outHold = round(from + 1 / shape.each);
      // Putting the ghost up is a state; taking it down is the moment the two
      // axes come apart, and widening the Server is the moment the ceiling
      // moves. Both of those are trips.
      fix(from, shape.ghost === 'off' && (wasGhost !== 'off' || from > 12) ? 'trip' : 'state');
      bookCrossing(from);
    });
  }

  for (const [at, mark] of MARKS) {
    schedule(at, () => {
      push(flags.mark, at, mark);
      fix(at, 'state');
    });
    schedule(round(at + MARK_HOLD), () => {
      push(flags.mark, round(at + MARK_HOLD), 'none' satisfies Mark);
    });
  }

  schedule(SETTLE_AT, () => {
    push(flags.settled, SETTLE_AT, 'on' satisfies Flag);
    fix(SETTLE_AT, 'success');
  });

  // --- what travels -------------------------------------------------------

  /**
   * One lane's cadence. A dot is `DOT_ITEMS` of work and the readout beside the
   * lane is work per second, so the gap between two dots is one divided by the
   * other, and the lane runs visibly faster the moment its number does.
   */
  const send = (lane: 'in' | 'out', at: number): void => {
    const slot = windowAt(at);
    const limit = lane === 'in' ? slot?.inBy : slot?.outBy;
    if (!slot || limit === undefined || at > limit + EPS) {
      const next = WINDOWS.find((w) => w.from > at);
      if (next) schedule(next.from, () => send(lane, next.from));
      return;
    }
    carry(at);
    const cap = capacity();
    const saturated = queueUnits() > 0 || inRate >= cap - EPS;
    const rate = lane === 'in' ? inRate : saturated ? cap : inRate;
    if (lane === 'out' && at < outHold - EPS) {
      // Nothing leaves a Server that has just been rebuilt until one job has
      // had time to run: that gap is the service time, and it is the only
      // visible difference between the two ghosts of the first step.
      schedule(outHold, () => send(lane, outHold));
      return;
    }

    const leg = lane === 'in' ? IN_LEG : OUT_LEG;
    const home = round(at + leg);
    travellers.push({ lane, start: round(at), home });
    if (lane === 'out') {
      for (const [after, family] of LANDINGS) {
        if (home >= after - EPS && !fixed.some((entry) => entry.family === family)) {
          fix(home, 'success', family);
        }
      }
    }

    const next = round(at + DOT_ITEMS / rate);
    if (next <= SCENE_DURATION) schedule(next, () => send(lane, next));
  };

  // --- run it -------------------------------------------------------------

  write(0);
  push(flags.mark, 0, 'none' satisfies Mark);
  push(flags.settled, 0, 'off' satisfies Flag);
  bookCrossing(0);
  const opening = WINDOWS[0]?.from ?? 0;
  schedule(opening, () => send('in', opening));
  schedule(opening, () => send('out', opening));

  drain();

  if (problems.length > 0) throw new Error(`${ID} scene: ${problems[0]}`);
  if (emptyAt === null) throw new Error(`${ID} scene: the queue never drained`);
  if (peakQueue < 3) throw new Error(`${ID} scene: the queue never really formed`);
  if (ghostOut.a !== undefined && ghostOut.a.split('->')[1] !== ghostOut.b?.split('->')[1]) {
    throw new Error(
      `${ID} scene: the two configurations of the first step do not agree — ` +
        `${ghostOut.a} against ${ghostOut.b}`,
    );
  }

  // --- the cues -----------------------------------------------------------

  const accepted: Fixed[] = fixed
    .filter((entry) => !BOUNDARIES.some((edge) => Math.abs(entry.at - edge) < BOUNDARY_GAP))
    .sort((left, right) => left.at - right.at)
    .filter(
      (entry, index, list) => index === 0 || entry.at - (list[index - 1]?.at ?? -99) >= MIN_CUE_GAP,
    );

  const lastOf: Record<string, number> = { grow: -99, drain: -99 };
  candidates.sort((left, right) => left.at - right.at);
  for (const candidate of candidates) {
    const family = candidate.family ?? '';
    let previous = lastOf[family] ?? -99;
    for (const other of accepted) {
      if (other.family === family && other.at < candidate.at && other.at > previous) {
        previous = other.at;
      }
    }
    if (candidate.at - previous < SAMPLE_GAP) continue;
    if (BOUNDARIES.some((edge) => Math.abs(candidate.at - edge) < BOUNDARY_GAP)) continue;
    if (accepted.some((other) => Math.abs(other.at - candidate.at) < MIN_CUE_GAP)) continue;
    lastOf[family] = candidate.at;
    accepted.push(candidate);
    accepted.sort((left, right) => left.at - right.at);
  }

  const cues: [number, SceneCue][] = accepted
    .map((entry) => [entry.at, entry.name] as [number, SceneCue])
    .sort((left, right) => left[0] - right[0]);

  return { travellers, flags, fills, cues, peakQueue, emptyAt, ghostOut };
}

// --- the timeline ----------------------------------------------------------

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const layer = pick<SVGGElement>(stage, '.scene-requests', ID);
  const fill = pick<SVGRectElement>(stage, '.tput-gauge-fill', ID);

  const sim = simulate();
  if (sim.peakQueue > QUEUE_MAX) {
    throw new Error(`${ID} scene: the queue reached ${sim.peakQueue}, past the ${QUEUE_MAX} drawn`);
  }
  if (Number(STAGE_STATE['data-tput-slots']) > SLOT_MAX) {
    throw new Error(`${ID} scene: the opening configuration is wider than the row`);
  }

  const parts = mountRequests(layer, sim.travellers.length, ID);
  const tl = createSceneTimeline();

  // --- everything the stage says about itself ------------------------------

  for (const [name, series] of Object.entries(sim.flags)) {
    for (const entry of series) attr(tl, stage, `data-tput-${name}`, entry.value, entry.at);
  }

  // The one width on the stage. It is a rate rather than a state, so it is the
  // one thing here that moves rather than switching.
  for (const [at, width] of sim.fills) {
    if (at === 0) continue;
    tl.to(fill, { attr: { width }, duration: 0.18, ease: 'power1.out', immediateRender: false }, at);
  }

  // --- what travels --------------------------------------------------------

  // A dot goes down one lane and is absorbed at the far edge. There is no
  // journey back and no verdict: a completed unit of work does not report to
  // anybody, it just stops being work.
  sim.travellers.forEach((plan, index) => {
    const request: RequestParts | undefined = parts[index];
    if (!request) return;
    const from = plan.lane === 'in' ? Y_ARRIVALS_BOTTOM : Y_SERVER_BOTTOM;
    const to = plan.lane === 'in' ? Y_SERVER_TOP : Y_DONE_TOP;
    request.group.classList.add(`tput-req--${plan.lane}`);
    parkRequest(request, X_LANE, from);
    showRequest(tl, request, plan.start);
    tl.to(
      request.group,
      { y: to, duration: plan.lane === 'in' ? IN_LEG : OUT_LEG, ease: 'none', immediateRender: false },
      plan.start,
    );
    hideRequest(tl, request, plan.home, FADE);
  });

  // --- sound ---------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels ---------------------------------------------------------

  // The stage is complete on the first frame: a four slot Server a quarter
  // busy, the ceiling drawn on the gauge at the rate it can retire, an empty
  // line, everything that arrives leaving again, and nothing in flight.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
