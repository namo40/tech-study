import gsap from 'gsap';
import {
  MAX_LOAD,
  NARROW_HOME,
  PART_IDS,
  SCENE_DURATION,
  STAGE_STATE,
  WIDE_HOME,
  X_LANE,
  Y_DATA_BOTTOM,
  Y_PARTS_TOP,
  Y_SPLIT_BOTTOM,
  Y_SPLIT_TOP,
  partName,
} from './stage';
import type { Key, Mark, PartId } from './stage';
import { q } from '../shared/dom';
import {
  attachToRequest,
  hideRequest,
  markRequest,
  mountRequests,
  parkRequest,
  showRequest,
} from '../shared/request';
import type { RequestParts, RequestResult } from '../shared/request';
import { collapseAtInstant, createScheduler } from '../shared/simulation';
import { attr, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Partitioning scene: a 24 second, four step timeline.
 *
 * The same two rules as every other scene: every tween sits at an absolute
 * position, and every discrete change is a zero-duration tween on a `data-*`
 * attribute that GSAP reverts when the playhead moves back past it. Nothing in
 * this scene is a continuous quantity — an axis is one of two, a key is one of
 * two, a load is a count — so every frame is a set of stacked variants and
 * scrubbing backwards lands on a value rather than on a blend of two.
 *
 * Nothing the reader counts is authored. The scene is told eight things: when
 * the one-table growth ticks and when it saturates, when the sweep is drawn,
 * when the cut is chosen and along which axis, when the key card names a key,
 * when each row band or new write arrives and what key value it carries, when
 * each of the third step's two reads is issued and whether it is narrow or
 * wide, and when the scene stops.
 *
 * Everything else falls out of one pass. Each arrival's part is the active key
 * applied to that arrival's key value at the moment it leaves the Split box:
 * `user` sends odd values to `P1` and even ones to `P2`, and `date` sends every
 * new row to today's part and nowhere else, which is why the fourth step's
 * writes pile onto one card although their values would have spread perfectly
 * well. Each `load n` is the count of everything that part has taken. The `hot`
 * verdict is a rule read off those two counts at every instant — a part is hot
 * when it holds at least `HOT_FACTOR` times what the other one holds and at
 * least `HOT_FLOOR` in total — so the lamp lighting in the fourth step and
 * clearing after the key is corrected are consequences, not stage directions,
 * and so are the two cues that sound on them. The third step's reads are routed
 * by which half of the vertical cut they need, so "the narrow read touches only
 * the narrow part" is a fact about the split rather than a claim about it.
 *
 * The scene draws no router and no per-request part lookup. Choosing the axis
 * and reading the load shape a key produces is all that happens here; where a
 * given key is resolved to a part on the way to a query is the sharding scene's
 * subject, and this one stops at the door.
 */

const ID = 'partitioning';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- how a traveller moves -------------------------------------------------

/** One speed for every leg any traveller takes, in pixels per second. */
const SPEED = 1250;

/** The upper lane: something on its way from the table to the cut. */
const LEG_CUT = round((Y_SPLIT_TOP - Y_DATA_BOTTOM) / SPEED);
/** The lower lane: a placement going down, or a read going down and back. */
const LEG_PLACE = round((Y_PARTS_TOP - Y_SPLIT_BOTTOM) / SPEED);
/** How long an arrival spends inside the Split box, where the key reads it. */
const DWELL = 0.156;
/**
 * How long a traveller takes to go once it has nothing left to do. Both fades
 * are short on purpose: the fourth step's writes land two tenths apart, and a
 * dot still sitting on the box edge when the next one arrives would put two
 * travellers inside one halo on the same column.
 */
const FADE = 0.12;
const MARK_FADE = 0.14;

// --- what the scene is told ------------------------------------------------

/** Each tick is one more month of rows in the table nobody has split yet. */
const GROWTH_TICKS = [0.5, 1.0, 1.5, 2.0];
/** When every query is drawn sweeping the whole thing, and where that ends. */
const SCAN_AT = 1.4;
const PEAK_AT = 2.2;
/** When the ghost is released and there is somewhere to split to. */
const LIFT_AT = 3.0;
/** The window where both cuts are drawn on the data, because both are real. */
const CUTS_ON = 3.9;
const CUTS_OFF = 5.4;

/** When the axis card takes a word, and when the key card takes a badge. */
const AXIS_AT: [number, 'rows' | 'columns'][] = [
  [6.5, 'rows'],
  [12.5, 'columns'],
  [18.5, 'rows'],
];
const KEY_AT: [number, Key][] = [
  [6.5, 'user'],
  [18.5, 'date'],
  [21.2, 'user'],
];

/** When the vertical cut is drawn on the data, and when it is put away. */
const SPLIT_ON = 13.4;
const SPLIT_OFF = 18.5;

/**
 * Every row band and every new write, as the moment it lands and the key value
 * it carries. Nothing here says which part it goes to: the key in force when it
 * leaves the Split box decides, which is the whole fourth step. `cue` is only
 * the noise the scene makes on purpose; the two that matter most — the lamp
 * lighting and clearing — are not in this table at all, because the verdict
 * emits them itself.
 */
const ARRIVALS: { at: number; kind: 'band' | 'write'; value: number; cue: SceneCue | null }[] = [
  { at: 7.4, kind: 'band', value: 1, cue: 'success' },
  { at: 7.9, kind: 'band', value: 3, cue: null },
  { at: 8.4, kind: 'band', value: 2, cue: 'success' },
  { at: 8.9, kind: 'band', value: 4, cue: null },
  { at: 18.8, kind: 'write', value: 5, cue: 'state' },
  { at: 19.0, kind: 'write', value: 6, cue: null },
  { at: 19.2, kind: 'write', value: 7, cue: null },
  { at: 19.4, kind: 'write', value: 8, cue: null },
  { at: 20.0, kind: 'write', value: 9, cue: null },
  { at: 21.6, kind: 'write', value: 10, cue: null },
  { at: 22.0, kind: 'write', value: 11, cue: null },
];

/** The third step's two reads: a narrow one and, much more rarely, a wide one. */
const READS: { at: number; wide: boolean }[] = [
  { at: 14.4, wide: false },
  { at: 16.4, wide: true },
];

/** Which part every new row belongs to while the key is the date: today's. */
const TODAY_PART: PartId = 'p2';

/**
 * The imbalance rule, stated once and read everywhere. A part is hot when it is
 * carrying at least three times what the other one carries, and when there is
 * enough on it for the ratio to mean anything — two rows against none is not a
 * hot partition, it is a scene that has just started.
 */
const HOT_FACTOR = 3;
const HOT_FLOOR = 4;

/** How long a part shows that something just landed on it. */
const TOUCH_HOLD = 0.15;

/** The seven things the scene holds up, and how long each is held for. */
const MARK_AT: [number, Mark, number][] = [
  [CUTS_ON, 'axes', 0.6],
  [4.8, 'choose', 0.6],
  [9.4, 'half', 0.5],
  [10.4, 'schema', 0.5],
  [11.0, 'capacity', 0.5],
  [15.4, 'rejoin', 0.6],
  [17.0, 'rare', 0.5],
  [20.4, 'blob', 0.5],
];

/** When the picture is called settled: a shape, a key, and a quiet lamp. */
const SETTLE_AT = 22.4;

/** The shortest gap between any two cues, and how quiet a step boundary is. */
const MIN_CUE_GAP = 0.2;
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

/** How a traveller is drawn, which says what kind of thing it is carrying. */
type Kind = 'band' | 'write' | 'read';

interface Journey {
  x: number;
  y: number;
  to: number;
  /** Where a read comes back to, or null for everything that stays put. */
  back: number | null;
  kind: Kind;
  /** The part the traveller is for, which rides with the dot. Empty on the
   *  upper lane, where the key has not read the row yet. */
  label: string;
  showAt: number;
  duration: number;
  mark: RequestResult | null;
  landAt: number;
  markAt: number;
  hideAt: number;
}

/** One arrival, routed. */
interface Delivery {
  at: number;
  kind: 'band' | 'write';
  value: number;
  key: Key;
  part: PartId;
}

/** One read, and the single part it turned out to need. */
interface Read {
  at: number;
  wide: boolean;
  part: PartId;
}

/** The two counts and the verdict read off them, at every instant they change. */
interface Verdict {
  at: number;
  p1: number;
  p2: number;
  lit: boolean;
}

interface Simulation {
  changes: AttrChange[];
  cues: [number, SceneCue][];
  journeys: Journey[];
  deliveries: Delivery[];
  reads: Read[];
  verdicts: Verdict[];
  loads: Record<PartId, number>;
}

// --- the simulation --------------------------------------------------------

/**
 * What the active key does with one key value. `user` spreads, because odd and
 * even land in different places; `date` does not, because every new row carries
 * today and today is one part.
 */
function routeBy(key: Key, value: number): PartId {
  if (key === 'date') return TODAY_PART;
  return value % 2 === 1 ? 'p1' : 'p2';
}

function simulate(): Simulation {
  const raw: AttrChange[] = [];
  const fixed: [number, SceneCue][] = [];
  const journeys: Journey[] = [];
  const deliveries: Delivery[] = [];
  const reads: Read[] = [];
  const verdicts: Verdict[] = [];
  const problems: string[] = [];

  const setAttr = (at: number, target: string, name: string, value: string): void => {
    raw.push({ at: round(at), target, name, value });
  };
  const cue = (at: number, name: SceneCue): void => {
    fixed.push([round(at), name]);
  };

  /** The key in force. Every arrival reads it; none of them sets it. */
  let key: Key = 'none';
  /** What each part has taken, and whether the lamp is lit. */
  const load = new Map<PartId, number>(PART_IDS.map((id) => [id, 0]));
  const partHot = new Map<PartId, string>(PART_IDS.map((id) => [id, 'off']));
  let alarm = false;
  let holding = 'empty';
  const loadSeries: { at: number; id: PartId; from: number; to: number }[] = [];

  const travel = (
    y: number,
    to: number,
    back: number | null,
    landAt: number,
    duration: number,
    kind: Kind,
    label: string,
    mark: RequestResult | null,
  ): void => {
    const hideAt = back === null ? round(landAt) : round(landAt + duration);
    journeys.push({
      x: X_LANE,
      y,
      to,
      back,
      kind,
      label,
      showAt: round(landAt - duration),
      duration,
      mark,
      landAt: round(landAt),
      markAt: round(landAt),
      hideAt,
    });
  };

  /** Says a part was touched, and takes the word back once it has been read. */
  const touch = (at: number, id: PartId, how: 'write' | 'read'): void => {
    setAttr(at, `part-${id}`, 'data-pt-touch', how);
    schedule(round(at + TOUCH_HOLD), () => setAttr(round(at + TOUCH_HOLD), `part-${id}`, 'data-pt-touch', 'off'));
  };

  /**
   * Reads the imbalance rule off the two counts and writes down whatever it
   * says. This is the only place the lamp is ever set, and the only place the
   * fourth step's failure and its recovery are ever sounded.
   */
  const settleHot = (at: number): void => {
    const p1 = load.get('p1') ?? 0;
    const p2 = load.get('p2') ?? 0;
    const high = Math.max(p1, p2);
    const low = Math.min(p1, p2);
    const lit = high >= HOT_FACTOR * low && high >= HOT_FLOOR;
    const hotPart: PartId | null = lit ? (p1 > p2 ? 'p1' : 'p2') : null;
    if (lit !== alarm) {
      alarm = lit;
      setAttr(at, 'stage', 'data-pt-alarm', lit ? 'on' : 'off');
      cue(at, lit ? 'failure' : 'success');
    }
    for (const id of PART_IDS) {
      const want = hotPart === id ? 'on' : 'off';
      if ((partHot.get(id) ?? 'off') !== want) {
        partHot.set(id, want);
        setAttr(at, `part-${id}`, 'data-pt-hot', want);
      }
    }
    verdicts.push({ at: round(at), p1, p2, lit });
  };

  const { schedule, drain } = createScheduler();

  // --- the world where everything is one table -----------------------------

  GROWTH_TICKS.forEach((at, index) => {
    schedule(at, () => {
      setAttr(at, 'stage', 'data-pt-ghost', String(index + 1));
      // Only the first tick is heard. Growth that announced itself four times
      // would be four noises rather than one argument.
      if (index === 0) cue(at, 'state');
    });
  });

  schedule(SCAN_AT, () => {
    setAttr(SCAN_AT, 'stage', 'data-pt-scan', 'sweep');
    cue(SCAN_AT, 'state');
  });

  schedule(PEAK_AT, () => {
    setAttr(PEAK_AT, 'stage', 'data-pt-ghost', 'peak');
    cue(PEAK_AT, 'failure');
  });

  schedule(LIFT_AT, () => {
    setAttr(LIFT_AT, 'stage', 'data-pt-ghost', 'off');
    setAttr(LIFT_AT, 'stage', 'data-pt-scan', 'off');
    setAttr(LIFT_AT, 'stage', 'data-pt-mode', 'split');
    cue(LIFT_AT, 'trip');
  });

  // The two cuts go up on the data and the box is ringed at the same instant,
  // because they are one beat: there are two axes and only two. The noise for
  // it is the mark's, so the beat sounds once.
  schedule(CUTS_ON, () => setAttr(CUTS_ON, 'stage', 'data-pt-cuts', 'on'));
  schedule(CUTS_OFF, () => setAttr(CUTS_OFF, 'stage', 'data-pt-cuts', 'off'));

  // --- the two decisions ---------------------------------------------------

  // Choosing an axis and naming a key are one beat wherever they land on the
  // same instant, so the noise belongs to the instant rather than to either
  // change: the axis speaks for both, and the key speaks alone at 21.2.
  const axisTimes = new Set(AXIS_AT.map(([at]) => at));
  for (const [at, axis] of AXIS_AT) {
    schedule(at, () => {
      setAttr(at, 'stage', 'data-pt-axis', axis);
      cue(at, 'state');
    });
  }
  for (const [at, name] of KEY_AT) {
    schedule(at, () => {
      key = name;
      setAttr(at, 'stage', 'data-pt-key', name);
      if (!axisTimes.has(at)) cue(at, 'state');
    });
  }

  schedule(SPLIT_ON, () => {
    setAttr(SPLIT_ON, 'stage', 'data-pt-split', 'on');
    setAttr(SPLIT_ON, 'stage', 'data-pt-parts', 'cols');
    holding = 'cols';
    cue(SPLIT_ON, 'state');
  });
  schedule(SPLIT_OFF, () => {
    setAttr(SPLIT_OFF, 'stage', 'data-pt-split', 'off');
    setAttr(SPLIT_OFF, 'stage', 'data-pt-parts', 'bands');
    holding = 'bands';
  });

  // --- everything that lands, routed by the key in force -------------------

  for (const plan of ARRIVALS) {
    // The upper lane: the row is on its way to be cut, and nothing about it has
    // been decided yet, so the dot carries no name.
    const entersSplit = round(plan.at - LEG_PLACE - DWELL);
    schedule(round(entersSplit - LEG_CUT), () => {
      travel(Y_DATA_BOTTOM, Y_SPLIT_TOP, null, entersSplit, LEG_CUT, plan.kind, '', null);
    });

    // The lower lane. The key reads the row as it leaves the Split box, and
    // that is the instant the part is decided and the name goes on the dot.
    const leaves = round(plan.at - LEG_PLACE);
    schedule(leaves, () => {
      if (key === 'none') {
        problems.push(`${plan.at} something was routed while no key was named`);
        return;
      }
      const part = routeBy(key, plan.value);
      deliveries.push({ at: round(plan.at), kind: plan.kind, value: plan.value, key, part });
      travel(Y_SPLIT_BOTTOM, Y_PARTS_TOP, null, plan.at, LEG_PLACE, plan.kind, partName(part), 'ok');

      schedule(plan.at, () => {
        const before = load.get(part) ?? 0;
        load.set(part, before + 1);
        loadSeries.push({ at: round(plan.at), id: part, from: before, to: before + 1 });
        setAttr(plan.at, `part-${part}`, 'data-pt-load', String(before + 1));
        if (holding === 'empty') {
          holding = 'bands';
          setAttr(plan.at, 'stage', 'data-pt-parts', 'bands');
        }
        touch(plan.at, part, 'write');
        if (plan.cue) cue(plan.at, plan.cue);
        // The lamp is read after the count moves, never before, so what the
        // reader hears is the state the readout is already showing.
        settleHot(plan.at);
      });
    });
  }

  // --- the reads, routed by which half of the cut they need ----------------

  for (const plan of READS) {
    const leaves = round(plan.at - LEG_PLACE);
    schedule(leaves, () => {
      const part = plan.wide ? WIDE_HOME : NARROW_HOME;
      reads.push({ at: round(plan.at), wide: plan.wide, part });
      travel(Y_SPLIT_BOTTOM, Y_PARTS_TOP, Y_SPLIT_BOTTOM, plan.at, LEG_PLACE, 'read', partName(part), 'ok');
      schedule(plan.at, () => {
        touch(plan.at, part, 'read');
        cue(plan.at, 'success');
      });
    });
  }

  // --- what the scene holds up, and where it stops -------------------------

  for (const [at, value, hold] of MARK_AT) {
    schedule(at, () => {
      setAttr(at, 'stage', 'data-pt-mark', value);
      cue(at, 'state');
    });
    schedule(round(at + hold), () => setAttr(round(at + hold), 'stage', 'data-pt-mark', 'none'));
  }

  schedule(SETTLE_AT, () => {
    setAttr(SETTLE_AT, 'stage', 'data-pt-settled', 'on');
    cue(SETTLE_AT, 'success');
  });

  drain();

  const loads: Record<PartId, number> = { p1: load.get('p1') ?? 0, p2: load.get('p2') ?? 0 };
  return finish({ raw, fixed, journeys, deliveries, reads, verdicts, loads, loadSeries, problems });
}

// --- what has to be true for the picture to mean anything ------------------

interface RawSimulation {
  raw: AttrChange[];
  fixed: [number, SceneCue][];
  journeys: Journey[];
  deliveries: Delivery[];
  reads: Read[];
  verdicts: Verdict[];
  loads: Record<PartId, number>;
  loadSeries: { at: number; id: PartId; from: number; to: number }[];
  problems: string[];
}

function finish(sim: RawSimulation): Simulation {
  const { raw, fixed, journeys, deliveries, reads, verdicts, loads, loadSeries } = sim;
  const problems = [...sim.problems];

  // Every route, judged again from the rule alone. The pass above answered from
  // state it was carrying; this reads the plan straight, so a drift between the
  // two is a bug rather than a matter of opinion.
  for (const entry of deliveries) {
    const wanted = routeBy(entry.key, entry.value);
    if (entry.part !== wanted) {
      problems.push(`${entry.at} a ${entry.kind} on key ${entry.key} went to ${partName(entry.part)}, the rule says ${partName(wanted)}`);
    }
  }

  // A load is the count of what landed on that part and nothing else.
  for (const id of PART_IDS) {
    const counted = deliveries.filter((entry) => entry.part === id).length;
    if (loads[id] !== counted) problems.push(`${partName(id)} reads load ${loads[id]} for ${counted} arrivals`);
  }
  if (loads.p1 + loads.p2 !== deliveries.length) {
    problems.push(`the two loads total ${loads.p1 + loads.p2} for ${deliveries.length} arrivals`);
  }
  for (const step of loadSeries) {
    if (step.to !== step.from + 1) problems.push(`${step.at} a load moved from ${step.from} to ${step.to}`);
  }
  const highest = Math.max(loads.p1, loads.p2);
  if (highest !== MAX_LOAD) problems.push(`the busiest part ends on ${highest}, the stage draws up to ${MAX_LOAD}`);

  // The lamp says exactly what the rule says, at every instant either count
  // moved. Nothing else in the scene is allowed an opinion about it.
  for (const entry of verdicts) {
    const high = Math.max(entry.p1, entry.p2);
    const low = Math.min(entry.p1, entry.p2);
    const wanted = high >= HOT_FACTOR * low && high >= HOT_FLOOR;
    if (entry.lit !== wanted) {
      problems.push(`${entry.at} the lamp is ${entry.lit ? 'lit' : 'out'} on ${entry.p1}/${entry.p2}`);
    }
  }
  const flips: Verdict[] = [];
  verdicts.forEach((entry, index) => {
    const previous = index === 0 ? false : (verdicts[index - 1]?.lit ?? false);
    if (entry.lit !== previous) flips.push(entry);
  });
  if (flips.length !== 2 || flips[0]?.lit !== true || flips[1]?.lit !== false) {
    problems.push(`the lamp changed ${flips.length} times, the captions promise one warning and one recovery`);
  }
  for (const flip of flips) {
    if (flip.at < 18 || flip.at >= 24) problems.push(`the lamp changed at ${flip.at}, outside the fourth step`);
  }

  // The first step's claim, checked rather than asserted: while the table is
  // one thing, no part is holding anything and nothing has been sent anywhere.
  for (const entry of [...deliveries, ...reads]) {
    if (entry.at <= LIFT_AT) problems.push(`${entry.at} a part was reached while the table was still one thing`);
  }

  // The vertical cut is what routes the third step's reads, so the narrow one
  // never touches the wide part and the two of them never touch the same one.
  for (const entry of reads) {
    const wanted = entry.wide ? WIDE_HOME : NARROW_HOME;
    if (entry.part !== wanted) problems.push(`${entry.at} the ${entry.wide ? 'wide' : 'narrow'} read went to ${partName(entry.part)}`);
    if (entry.at < 12 || entry.at >= 18) problems.push(`a read landed at ${entry.at}, outside the third step`);
  }
  if (reads.length !== 2) problems.push(`${reads.length} reads were issued, the captions describe two`);
  if (new Set(reads.map((entry) => entry.part)).size !== reads.length) {
    problems.push('both reads touched the same part');
  }

  // The second step's key spreads and the fourth step's does not, and both are
  // read off the same table of arrivals rather than declared.
  const spread = new Set(deliveries.filter((entry) => entry.key === 'user').map((entry) => entry.part));
  if (spread.size !== PART_IDS.length) problems.push('the spreading key never reached both parts');
  const piled = deliveries.filter((entry) => entry.key === 'date');
  if (new Set(piled.map((entry) => entry.part)).size !== 1) problems.push('the date key spread its writes');
  if (!piled.some((entry) => routeBy('user', entry.value) !== entry.part)) {
    problems.push('no write under the date key carried a value the other key would have spread');
  }

  for (const journey of journeys) {
    if (journey.showAt < 0 || journey.hideAt > SCENE_DURATION) {
      problems.push(`a traveller runs off the end of the scene at ${journey.showAt}`);
    }
  }

  // A cue on a step boundary belongs to neither step, and two cues on top of
  // each other are one noise.
  fixed.sort((left, right) => left[0] - right[0]);
  fixed.forEach(([at], index) => {
    if (BOUNDARIES.some((edge) => Math.abs(at - edge) < BOUNDARY_GAP - EPS)) {
      problems.push(`a cue at ${at} sits on a step boundary`);
    }
    const previous = fixed[index - 1]?.[0];
    if (previous !== undefined && at - previous < MIN_CUE_GAP - EPS) {
      problems.push(`cues at ${previous} and ${at} are on top of each other`);
    }
  });

  if (problems.length > 0) throw new Error(`${ID} scene: ${[...new Set(problems)].join('; ')}`);

  // --- the discrete changes, in time order and collapsed ------------------

  // Two changes to one thing at one instant would render in insertion order
  // forwards and in reverse going backwards, so that single frame would depend
  // on which way the reader scrubbed. Only the one that applies is kept.
  const inTimeOrder = raw
    .map((entry, order) => ({ entry, order }))
    .sort((left, right) => left.entry.at - right.entry.at || left.order - right.order)
    .map(({ entry }) => entry);

  const folded: AttrChange[] = [];
  for (const entry of inTimeOrder) {
    collapseAtInstant(folded, entry, (change) => `${change.target}@${change.name}`);
  }

  const seen = new Map<string, string>(Object.entries(STAGE_STATE));
  const changes: AttrChange[] = [];
  for (const change of folded) {
    const key = `${change.target}@${change.name}`;
    if (seen.get(key) === change.value) continue;
    seen.set(key, change.value);
    changes.push(change);
  }

  journeys.sort((left, right) => left.showAt - right.showAt);

  return { changes, cues: fixed, journeys, deliveries, reads, verdicts, loads };
}

// --- the timeline ----------------------------------------------------------

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);
  const sim = simulate();

  // The captions name the figures the model produced. Nothing here places them:
  // if the schedule changes, this is what says the captions have stopped
  // describing the scene.
  const bands = sim.deliveries.filter((entry) => entry.kind === 'band');
  if (new Set(bands.map((entry) => entry.part)).size !== PART_IDS.length) {
    throw new Error(`${ID} scene: the second step promises a share for each part, the bands reached one`);
  }
  const piled = sim.deliveries.filter((entry) => entry.key === 'date');
  if (piled.length < 3) {
    throw new Error(`${ID} scene: the fourth step promises a run of writes on one part, it got ${piled.length}`);
  }
  const recovered = sim.verdicts.at(-1);
  if (!recovered || recovered.lit) {
    throw new Error(`${ID} scene: the fourth step promises the lamp goes out, it ends lit`);
  }

  const targets: Record<string, Element> = { stage };
  for (const id of PART_IDS) targets[`part-${id}`] = q(stage, `.pt-part--${id}`, ID);

  const parts = mountRequests(layer, sim.journeys.length, ID);
  const tl = createSceneTimeline();

  // --- everything the stage says about itself ------------------------------

  for (const change of sim.changes) {
    const target = targets[change.target];
    if (!target) throw new Error(`${ID} scene: nothing on the stage is called "${change.target}"`);
    attr(tl, target, change.name, change.value, change.at);
  }

  // --- what travels --------------------------------------------------------

  sim.journeys.forEach((journey, index) => {
    const request: RequestParts | undefined = parts[index];
    if (!request) return;

    // A dot is drawn as the kind of thing it carries, because a row band on its
    // way to a part, a new write landing on one, and a read that has to come
    // back are three different things travelling the same kind of line.
    request.group.classList.add(`pt-req--${journey.kind}`);

    if (journey.label) {
      const label = attachToRequest(
        request,
        'text',
        { class: 'scene-req-label pt-tag', x: '-36', y: '9', 'text-anchor': 'end' },
        journey.label,
      );
      gsap.set(label, { opacity: 1 });
    }

    parkRequest(request, journey.x, journey.y);
    showRequest(tl, request, journey.showAt);
    tl.to(
      request.group,
      { y: journey.to, duration: journey.duration, ease: 'none', immediateRender: false },
      journey.showAt,
    );

    if (journey.mark) markRequest(tl, request, journey.mark, journey.markAt);

    if (journey.back !== null) {
      // Only a read comes back, and it comes back carrying its answer.
      tl.to(
        request.group,
        { y: journey.back, duration: journey.duration, ease: 'none', immediateRender: false },
        journey.landAt,
      );
    }

    hideRequest(tl, request, journey.hideAt, journey.mark ? MARK_FADE : FADE);
  });

  // --- sound ---------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels ---------------------------------------------------------

  // The stage is complete on the first frame: one table with its grid drawn and
  // nothing growing over it, no axis chosen, no key named, two empty parts on
  // `load 0`, a quiet lamp and nothing in flight.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
