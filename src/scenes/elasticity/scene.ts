import {
  CPU_TARGET,
  CPU_VALUES,
  DEMAND_LOAD,
  NODE_CAPACITY,
  NODE_MAX,
  POD_CAPACITY,
  POD_MAX,
  SCENE_DURATION,
  X_LANE,
  Y_LOAD_BOTTOM,
  Y_NODES_TOP,
  Y_PODS_BOTTOM,
  Y_PODS_TOP,
} from './stage';
import type { Demand, FlagState, GhostState, Mark, NodeState, PodSize, PodState } from './stage';
import { q } from '../shared/dom';
import { hideRequest, markRequest, mountRequests, parkRequest, showRequest } from '../shared/request';
import { createScheduler } from '../shared/simulation';
import { attr, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Elasticity scene: a 24 second, four step timeline.
 *
 * The two standing rules apply here as everywhere: every tween sits at an
 * absolute position, and every discrete change is a zero-duration tween on a
 * `data-*` attribute that GSAP reverts when the playhead moves back past it.
 *
 * Nothing the reader counts is authored. The scene is told the demand curve, the
 * two instants the capacity is pinned and released, the sizes the two mis-sized
 * pods are carrying, when the vertical autoscaler acts, how many pods a node
 * holds, and the lags a controller works under. One pass over the whole 24
 * seconds turns that into everything else: `cpu n%`, `pods n`, `nodes n`, which
 * capsule is drawn and how big, which node holds it, when `pending` appears,
 * when a node is added and when one is drained.
 *
 * Three derivations carry the argument. **Capacity is a function of the
 * reading, not a drawing.** One `evaluate()` reads the drawn `cpu n%`
 * and the pod count and returns `ceil(pods × cpu / target)` clamped to the
 * range; the same line adds replicas in the second step and removes them in the
 * fourth, and while the capacity is pinned it is not consulted at all, which is
 * the whole of the first step: the reading crosses the target and nothing
 * happens.
 *
 * **Scaling in is not the mirror of scaling out.** A reading above the target
 * books a replica after one reaction delay; a reading below it only arms a
 * cooldown, and the count is re-derived when the cooldown expires. The build
 * asserts that no removal ever lands earlier than a full cooldown after the
 * reading that asked for it, because a scene where the two directions look
 * symmetrical would be arguing for the restart storm the caption warns about.
 *
 * **Pods need somewhere to stand.** Placement is a real, if small, scheduler:
 * a new pod goes on the node holding the fewest pods that still has room, and
 * `pending` is what a pod is when there is no such node. The node count is not
 * authored either — a pending pod books a machine, and a node with no pods on it
 * is returned once the cluster has more nodes than the pod count needs. The
 * build asserts that `pending` appears exactly when the pods outnumber the
 * slots, and that nothing is ever drained out from under a pod.
 */

const ID = 'elasticity';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

const BOUNDARIES = [0, 6, 12, 18, 24];

// --- what the scene is told ------------------------------------------------

/** The demand curve: the only thing in the picture nobody in the cluster owns. */
const DEMAND_PLAN: [number, Demand][] = [
  [0, 'normal'],
  [0.5, 'peak'],
  [1.8, 'night'],
  [2.6, 'normal'],
  [6.5, 'rising'],
  [9.6, 'normal'],
  [18.4, 'peak'],
  [21.6, 'normal'],
];

/** The window in which the replica count is nailed down and cannot answer. */
const GHOST_ON = 0.5;
const GHOST_OFF = 2.6;

/** How long the average lags the load, and how long a controller takes to act. */
const METRIC_LAG = 0.5;
const REACT = 0.5;
/** How far apart replicas are added, so the reader sees three become four become five. */
const STEP_GAP = 0.5;
/** How long a reading below the target has to hold before anything is removed. */
const COOLDOWN = 0.7;

/** The node layer's own delays: booking a machine, placing on it, giving it back. */
const NODE_REACT = 0.5;
const PLACE = 0.4;
const DRAIN_REACT = 0.3;
const DRAIN_TIME = 0.3;

/** The clamps the autoscaler is configured with. */
const MIN_PODS = 3;
const MAX_PODS = POD_MAX;

/**
 * The two pods whose requests were written for a workload that has since moved,
 * and the instant the vertical autoscaler puts them right. The capsule keeps the
 * old rectangle for the whole restart, so the size the pod comes back at is a
 * change the reader watches rather than one they are told about.
 */
const MIS_SIZED: [number, number, PodSize, PodState, SceneCue][] = [
  [12.6, 1, 'small', 'starved', 'failure'],
  [12.9, 2, 'large', 'oversized', 'state'],
];
const RESIZE_AT = 14.0;
const RESIZE_TIME = 1.2;

/** When the scene holds a band up, for how long, and how it sounds. */
const MARK_PLAN: [number, number, Mark, SceneCue][] = [
  [3.4, 0.6, 'fit', 'success'],
  [4.4, 0.6, 'follow', 'state'],
  [16.2, 0.6, 'honest', 'state'],
];

/** When the picture calls itself settled, once nothing is left to change. */
const SETTLE_AT = 23.7;

/**
 * When a sample of the demand leaves the Load box. Nothing about what happens to
 * it is written here: whether it lands on a check or a cross is the reading the
 * pods are showing when it arrives.
 */
const SAMPLES = [
  0.6, 1.4, 2.0, 3.0, 3.9, 4.6,
  6.6, 7.4, 8.2, 9.0, 9.8, 10.6,
  12.4, 13.2, 14.4, 15.4, 16.4,
  18.6, 19.2, 20.0, 20.8, 21.6, 22.4,
];

/** How long a traveller takes to cross a lane, and how a result marker behaves. */
const LEG = 0.42;
const MARK_HOLD = 0.22;
const MARK_FADE = 0.14;

/** How close any cue may fall to another, and how close any of it to a boundary. */
const MIN_CUE_GAP = 0.2;
const BOUNDARY_GAP = 0.3;
const EPS = 1e-6;

// --- the rules the whole scene turns on ------------------------------------

/** The drawn reading: the load spread over the pods that are standing on a node. */
function reading(load: number, placed: number): number {
  if (placed <= 0) return 100;
  const raw = (load / (placed * POD_CAPACITY)) * 100;
  return Math.min(100, Math.round(raw / 5) * 5);
}

/** How many replicas that reading asks for, which is the only sizing rule here. */
function evaluate(placed: number, cpu: number): number {
  const want = Math.ceil((placed * cpu) / CPU_TARGET);
  return Math.max(MIN_PODS, Math.min(MAX_PODS, want));
}

// --- what one pass over the scene produces ---------------------------------

/** The two declared segments, each named for what travels down it. */
type Lane = 'demand' | 'schedule';

interface Traveller {
  lane: Lane;
  start: number;
  arrive: number;
  result: 'ok' | 'fail';
}

interface Series {
  at: number;
  value: string;
}

interface Fixed {
  at: number;
  name: SceneCue;
}

interface Simulation {
  flags: Record<string, Series[]>;
  pods: Series[][];
  sizes: Series[][];
  nodes: Series[][];
  travellers: Traveller[];
  cues: [number, SceneCue][];
  /** Read back by the build, so a drift in the derivation fails loudly. */
  scaleOuts: number;
  scaleIns: number;
  pendingSpells: number;
  drains: number;
}

// --- the simulation --------------------------------------------------------

/**
 * Walks the whole scene in time order.
 *
 * The ghost window is booked before the demand curve, so a demand change that
 * lands on the same instant reads a capacity that is already pinned. Everything
 * else is a chain: a demand change books a reading, a reading books a decision,
 * a decision books a replica, a replica books a placement, and a placement that
 * fails books a machine. Nothing in that chain is written down twice.
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
  const problems: string[] = [];
  const fix = (at: number, name: SceneCue): void => {
    if (at < 0 || at > SCENE_DURATION) return;
    fixed.push({ at: round(at), name });
  };

  // --- what the diagram is holding ----------------------------------------

  let load: number = DEMAND_LOAD.normal;
  let ghosting = false;
  let cpu = reading(load, 3);

  const podState: PodState[] = Array.from({ length: POD_MAX }, (_v, i) =>
    i < 3 ? 'running' : 'absent',
  );
  const podSize: PodSize[] = Array.from({ length: POD_MAX }, (_v, i) => (i < 3 ? 'std' : 'slot'));
  const nodePresent = Array.from({ length: NODE_MAX }, (_v, i) => i < 2);
  const nodeDraining = Array.from({ length: NODE_MAX }, () => false);
  const nodePods: number[][] = Array.from({ length: NODE_MAX }, () => []);

  let scaleOuts = 0;
  let scaleIns = 0;
  let pendingSpells = 0;
  let drains = 0;
  /** The reading that armed the cooldown, so the build can time the removal. */
  let armedAt = -1;
  let coolGen = 0;
  /** Every instant a replica actually joined the fleet, for the falling-reading check. */
  const joinedAt: number[] = [];
  /** The window between a machine arriving and a pod standing on it. */
  const placing: [number, number][] = [];

  const totalPods = (): number => podState.filter((state) => state !== 'absent').length;
  const placedPods = (): number =>
    podState.filter((state) => state !== 'absent' && state !== 'pending').length;
  const nodeTotal = (): number => nodePresent.filter(Boolean).length;

  const nodeStateOf = (index: number): NodeState => {
    if (!nodePresent[index]) return 'absent';
    if (nodeDraining[index]) return 'draining';
    const held = (nodePods[index] ?? []).length;
    if (held >= NODE_CAPACITY) return 'full';
    return held > 0 ? 'active' : 'empty';
  };

  const writePod = (index: number, at: number): void => {
    record(`pod-${index}`, at, podState[index] ?? 'absent');
    record(`size-${index}`, at, podSize[index] ?? 'slot');
  };
  const writeNode = (index: number, at: number): void =>
    record(`node-${index}`, at, nodeStateOf(index));
  const writeCounts = (at: number): void => {
    record('pods', at, String(totalPods()));
    record('nodes', at, String(nodeTotal()));
    record('pending', at, (podState.includes('pending') ? 'on' : 'off') satisfies FlagState);
    record('drain', at, (nodeDraining.some(Boolean) ? 'on' : 'off') satisfies FlagState);
  };

  /** The node holding the fewest pods that still has room, or nothing. */
  const placeOn = (): number => {
    let best = -1;
    for (let index = 0; index < NODE_MAX; index += 1) {
      if (!nodePresent[index] || nodeDraining[index]) continue;
      if ((nodePods[index] ?? []).length >= NODE_CAPACITY) continue;
      if (best < 0 || (nodePods[index] ?? []).length < (nodePods[best] ?? []).length) best = index;
    }
    return best;
  };

  const { schedule, drain: run } = createScheduler();

  // --- the opening state, which is the whole diagram -----------------------

  record('demand', 0, 'normal' satisfies Demand);
  record('cpu', 0, String(cpu));
  record('ghost', 0, 'off' satisfies GhostState);
  record('resize', 0, 'off' satisfies FlagState);
  record('mark', 0, 'none' satisfies Mark);
  record('settled', 0, 'off');
  nodePods[0] = [];
  nodePods[1] = [];
  for (let index = 0; index < 3; index += 1) {
    const node = placeOn();
    if (node < 0) problems.push(`the opening pod ${index + 1} had nowhere to stand`);
    else (nodePods[node] ?? []).push(index);
  }
  for (let index = 0; index < POD_MAX; index += 1) writePod(index, 0);
  for (let index = 0; index < NODE_MAX; index += 1) writeNode(index, 0);
  writeCounts(0);

  // --- the chain a reading sets off ---------------------------------------

  const travel = (lane: Lane, start: number, result: 'ok' | 'fail'): void => {
    const arrive = round(start + LEG);
    if (arrive > SCENE_DURATION) return;
    travellers.push({ lane, start: round(start), arrive, result });
  };

  const cancelCooldown = (): void => {
    armedAt = -1;
    coolGen += 1;
  };

  /** Books a reading of the average, which is the only number anything acts on. */
  const bookReading = (from: number): void => {
    const at = round(from + METRIC_LAG);
    if (at > SCENE_DURATION) return;
    schedule(at, () => {
      const before = cpu;
      cpu = reading(load, placedPods());
      record('cpu', at, String(cpu));
      if (!(CPU_VALUES as readonly number[]).includes(cpu)) {
        problems.push(`the reading at ${at} is ${cpu}%, which the stage cannot draw`);
      }
      if (before !== cpu) {
        // A pinned fleet has no answer to give, so a reading it cannot act on
        // is the failure or the waste rather than a crossing.
        if (ghosting) fix(at, cpu >= 100 ? 'failure' : 'state');
        else if (before <= CPU_TARGET && cpu > CPU_TARGET) fix(at, 'state');
        else if (before > CPU_TARGET && cpu <= CPU_TARGET) fix(at, 'success');
      }
      autoscale(at);
    });
  };

  /** Gives a node back once the cluster has more of them than the pods need. */
  const considerDrain = (at: number): void => {
    if (nodeTotal() <= Math.ceil(totalPods() / NODE_CAPACITY)) return;
    const idle = nodePresent.findIndex(
      (present, index) => present && !nodeDraining[index] && (nodePods[index] ?? []).length === 0,
    );
    if (idle < 0) return;
    const opens = round(at + DRAIN_REACT);
    schedule(opens, () => {
      if ((nodePods[idle] ?? []).length > 0) return;
      if (nodeTotal() <= Math.ceil(totalPods() / NODE_CAPACITY)) return;
      nodeDraining[idle] = true;
      drains += 1;
      writeNode(idle, opens);
      writeCounts(opens);
      fix(opens, 'state');
      const gone = round(opens + DRAIN_TIME);
      schedule(gone, () => {
        if ((nodePods[idle] ?? []).length > 0) {
          problems.push(`node ${idle + 1} was drained at ${gone} with pods still on it`);
        }
        nodeDraining[idle] = false;
        nodePresent[idle] = false;
        writeNode(idle, gone);
        writeCounts(gone);
      });
    });
  };

  /** Puts every pending pod on a node, if one has appeared with room on it. */
  const placePending = (at: number): void => {
    let moved = false;
    for (let index = 0; index < POD_MAX; index += 1) {
      if (podState[index] !== 'pending') continue;
      const node = placeOn();
      if (node < 0) continue;
      (nodePods[node] ?? []).push(index);
      podState[index] = 'running';
      joinedAt.push(round(at));
      writePod(index, at);
      writeNode(node, at);
      moved = true;
    }
    if (!moved) return;
    writeCounts(at);
    fix(at, 'success');
    travel('schedule', at, 'ok');
    bookReading(at);
    considerDrain(at);
  };

  /** A pending pod books a machine, which is the whole of the cluster autoscaler. */
  const bookNode = (from: number): void => {
    const at = round(from + NODE_REACT);
    if (at > SCENE_DURATION) return;
    schedule(at, () => {
      if (!podState.includes('pending')) return;
      const free = nodePresent.findIndex((present) => !present);
      if (free < 0) return;
      nodePresent[free] = true;
      nodePods[free] = [];
      writeNode(free, at);
      writeCounts(at);
      fix(at, 'trip');
      considerDrain(at);
      placing.push([at, round(at + PLACE)]);
      schedule(round(at + PLACE), () => placePending(round(at + PLACE)));
    });
  };

  const addPod = (at: number): void => {
    const index = podState.findIndex((state) => state === 'absent');
    if (index < 0) return;
    const node = placeOn();
    podSize[index] = 'std';
    if (node < 0) {
      podState[index] = 'pending';
      pendingSpells += 1;
      writePod(index, at);
      writeCounts(at);
      fix(at, 'state');
      travel('schedule', at, 'fail');
      bookNode(at);
      return;
    }
    (nodePods[node] ?? []).push(index);
    podState[index] = 'running';
    joinedAt.push(round(at));
    writePod(index, at);
    writeNode(node, at);
    writeCounts(at);
    fix(at, 'success');
    travel('schedule', at, 'ok');
    bookReading(at);
  };

  const removePods = (at: number, count: number): void => {
    const touched = new Set<number>();
    for (let n = 0; n < count; n += 1) {
      let index = -1;
      for (let i = POD_MAX - 1; i >= 0; i -= 1) {
        if (podState[i] !== 'absent') {
          index = i;
          break;
        }
      }
      if (index < 0) break;
      const node = nodePods.findIndex((held) => held.includes(index));
      if (node >= 0) {
        nodePods[node] = (nodePods[node] ?? []).filter((pod) => pod !== index);
        touched.add(node);
      }
      podState[index] = 'absent';
      podSize[index] = 'slot';
      writePod(index, at);
    }
    for (const node of touched) writeNode(node, at);
    writeCounts(at);
    fix(at, 'state');
    scaleIns += 1;
    bookReading(at);
    considerDrain(at);
  };

  /** The one place a replica count is decided, in either direction. */
  function autoscale(at: number): void {
    if (ghosting) return;
    const want = evaluate(placedPods(), cpu);
    const have = totalPods();
    if (want > have) {
      cancelCooldown();
      scaleOuts += 1;
      for (let n = 0; n < want - have; n += 1) {
        const when = round(at + REACT + n * STEP_GAP);
        if (when > SCENE_DURATION) break;
        schedule(when, () => addPod(when));
      }
      return;
    }
    if (want === have) {
      cancelCooldown();
      return;
    }
    if (armedAt >= 0) return;
    armedAt = at;
    const gen = coolGen;
    const fires = round(at + COOLDOWN);
    schedule(fires, () => {
      if (gen !== coolGen) return;
      armedAt = -1;
      const stillWant = evaluate(placedPods(), cpu);
      const stillHave = totalPods();
      if (stillWant >= stillHave) return;
      if (fires - at < COOLDOWN - EPS) {
        problems.push(`a scale-in landed ${round(fires - at)}s after the reading at ${at}`);
      }
      removePods(fires, stillHave - stillWant);
    });
  }

  // --- the events the scene is told about, booked in that order -------------

  // The capacity is pinned first, so a demand change landing on the same
  // instant reads a fleet that already cannot answer it.
  schedule(GHOST_ON, () => {
    ghosting = true;
    record('ghost', GHOST_ON, 'peak' satisfies GhostState);
    fix(GHOST_ON, 'state');
  });
  schedule(GHOST_OFF, () => {
    ghosting = false;
    record('ghost', GHOST_OFF, 'off' satisfies GhostState);
    fix(GHOST_OFF, 'trip');
    autoscale(GHOST_OFF);
  });

  for (const [at, level] of DEMAND_PLAN) {
    if (at <= 0) continue;
    schedule(at, () => {
      load = DEMAND_LOAD[level];
      record('demand', at, level);
      // While the fleet is pinned the frame says which of the day's two
      // failures the reader is looking at, and that is all it can say.
      if (ghosting) record('ghost', at, level === 'night' ? 'idle' : 'peak');
      if (at !== GHOST_ON && at !== GHOST_OFF) fix(at, 'state');
      bookReading(at);
    });
  }

  for (const [at, index, size, state, cue] of MIS_SIZED) {
    schedule(at, () => {
      podState[index] = state;
      podSize[index] = size;
      writePod(index, at);
      fix(at, cue);
    });
  }

  schedule(RESIZE_AT, () => {
    for (const [, index] of MIS_SIZED) {
      podState[index] = 'resizing';
      writePod(index, RESIZE_AT);
    }
    record('resize', RESIZE_AT, 'on' satisfies FlagState);
    fix(RESIZE_AT, 'trip');
  });

  const resized = round(RESIZE_AT + RESIZE_TIME);
  schedule(resized, () => {
    for (const [, index] of MIS_SIZED) {
      podState[index] = 'running';
      podSize[index] = 'std';
      writePod(index, resized);
    }
    record('resize', resized, 'off' satisfies FlagState);
    fix(resized, 'success');
  });

  for (const [at, hold, mark, cue] of MARK_PLAN) {
    schedule(at, () => {
      record('mark', at, mark);
      fix(at, cue);
    });
    schedule(round(at + hold), () => record('mark', round(at + hold), 'none' satisfies Mark));
  }

  schedule(SETTLE_AT, () => {
    record('settled', SETTLE_AT, 'on');
    fix(SETTLE_AT, 'success');
  });

  // A sample of the demand carries no verdict of its own: it lands on whatever
  // the pods are reading when it gets there.
  for (const at of SAMPLES) {
    schedule(round(at + LEG), () => travel('demand', at, cpu >= 100 ? 'fail' : 'ok'));
  }

  // --- run it --------------------------------------------------------------

  run();

  // --- the invariants, checked as rules rather than as pictures -------------

  if (scaleOuts !== 2) problems.push(`${scaleOuts} scale-outs, the scene is about two`);
  if (scaleIns !== 2) problems.push(`${scaleIns} scale-ins, the scene is about two`);
  if (pendingSpells !== 1) {
    problems.push(`${pendingSpells} pods went pending, the scene is about exactly one`);
  }
  if (drains !== 1) problems.push(`${drains} nodes were drained, the scene is about exactly one`);

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
  for (const key of ['demand', 'cpu', 'pods', 'nodes', 'pending', 'resize', 'drain', 'ghost', 'mark', 'settled']) {
    flags[key] = seriesOf(key);
  }
  const pods = Array.from({ length: POD_MAX }, (_v, index) => seriesOf(`pod-${index}`));
  const sizes = Array.from({ length: POD_MAX }, (_v, index) => seriesOf(`size-${index}`));
  const nodes = Array.from({ length: NODE_MAX }, (_v, index) => seriesOf(`node-${index}`));

  // Walk the finished series and check the picture against the rules it came
  // from: the counters against the shapes, `pending` against the arithmetic, a
  // drained node against what is standing on it.
  const valueAt = (series: Series[], at: number): string => {
    let held = series[0]?.value ?? '';
    for (const entry of series) if (entry.at <= at + EPS) held = entry.value;
    return held;
  };
  const instants = [...new Set(raw.map((entry) => entry.at))].sort((a, b) => a - b);
  for (const at of instants) {
    const drawnPods = pods.filter((series) => valueAt(series, at) !== 'absent').length;
    const drawnNodes = nodes.filter((series) => valueAt(series, at) !== 'absent').length;
    const countedPods = Number(valueAt(flags.pods ?? [], at));
    const countedNodes = Number(valueAt(flags.nodes ?? [], at));
    if (drawnPods !== countedPods) {
      problems.push(`at ${at} the row draws ${drawnPods} capsules and the readout says ${countedPods}`);
    }
    if (drawnNodes !== countedNodes) {
      problems.push(`at ${at} the row draws ${drawnNodes} cells and the readout says ${countedNodes}`);
    }
    const drawnPending = pods.some((series) => valueAt(series, at) === 'pending');
    const overSlots = countedPods > countedNodes * NODE_CAPACITY;
    // A pod is pending exactly while the fleet outnumbers the slots, plus the
    // one placement delay between a machine arriving and the pod standing on it.
    if (overSlots && !drawnPending) {
      problems.push(`at ${at} ${countedPods} pods want ${countedNodes * NODE_CAPACITY} slots and nothing is pending`);
    }
    if (drawnPending && !overSlots && !placing.some(([from, to]) => at >= from - EPS && at <= to + EPS)) {
      problems.push(`at ${at} a pod is pending with ${countedNodes * NODE_CAPACITY} slots free of it`);
    }
    if ((valueAt(flags.pending ?? [], at) === 'on') !== drawnPending) {
      problems.push(`at ${at} the pending mark disagrees with the capsules`);
    }
    const sized = pods.map((series, index) => [valueAt(series, at), valueAt(sizes[index] ?? [], at)]);
    for (const [state, size] of sized) {
      if ((state === 'absent') !== (size === 'slot')) {
        problems.push(`at ${at} a capsule is ${state} but drawn as ${size}`);
      }
    }
  }

  // A reading only ever falls when a replica joins at a constant demand, which
  // is the whole reason adding one is worth doing.
  const cpuSeries = flags.cpu ?? [];
  for (const at of joinedAt) {
    if (DEMAND_PLAN.some(([when]) => when > at && when <= round(at + METRIC_LAG))) continue;
    const before = Number(valueAt(cpuSeries, at - EPS));
    const after = Number(valueAt(cpuSeries, round(at + METRIC_LAG)));
    if (!(after < before)) {
      problems.push(`the reading did not fall when a replica joined at ${at}: ${before} then ${after}`);
    }
  }

  if (problems.length > 0) throw new Error(`${ID} scene: ${problems.join('; ')}`);

  // --- the cues ------------------------------------------------------------

  const accepted = fixed
    .filter((entry) => !BOUNDARIES.some((edge) => Math.abs(entry.at - edge) < BOUNDARY_GAP - EPS))
    .sort((left, right) => left.at - right.at)
    .filter(
      (entry, index, list) =>
        index === 0 || entry.at - (list[index - 1]?.at ?? -99) >= MIN_CUE_GAP - EPS,
    );
  if (accepted.length !== fixed.length) {
    throw new Error(
      `${ID} scene: ${fixed.length - accepted.length} cues the scene has to make were crowded out`,
    );
  }

  const cues: [number, SceneCue][] = accepted.map((entry) => [entry.at, entry.name]);
  travellers.sort((left, right) => left.start - right.start);

  return { flags, pods, sizes, nodes, travellers, cues, scaleOuts, scaleIns, pendingSpells, drains };
}

// --- the timeline ----------------------------------------------------------

/** Where a traveller starts, the one coordinate its segment moves, and how far. */
const LANES: Record<Lane, { x: number; y: number; to: number }> = {
  demand: { x: X_LANE, y: Y_LOAD_BOTTOM, to: Y_PODS_TOP },
  schedule: { x: X_LANE, y: Y_PODS_BOTTOM, to: Y_NODES_TOP },
};

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);
  const podElements = Array.from({ length: POD_MAX }, (_v, index) =>
    q<SVGGElement>(stage, `.el-pod--${index + 1}`, ID),
  );
  const nodeElements = Array.from({ length: NODE_MAX }, (_v, index) =>
    q<SVGGElement>(stage, `.el-node--${index + 1}`, ID),
  );

  const sim = simulate();
  if (sim.scaleOuts !== 2 || sim.scaleIns !== 2) {
    throw new Error(`${ID} scene: ${sim.scaleOuts} scale-outs and ${sim.scaleIns} scale-ins`);
  }
  if (sim.pendingSpells !== 1 || sim.drains !== 1) {
    throw new Error(`${ID} scene: ${sim.pendingSpells} pending pods and ${sim.drains} drains`);
  }

  const parts = mountRequests(layer, sim.travellers.length, ID);
  const tl = createSceneTimeline();

  // --- everything the stage says about itself ------------------------------

  for (const [name, series] of Object.entries(sim.flags)) {
    for (const entry of series) attr(tl, stage, `data-el-${name}`, entry.value, entry.at);
  }
  sim.pods.forEach((series, index) => {
    const element = podElements[index];
    if (!element) return;
    for (const entry of series) attr(tl, element, 'data-el-pod', entry.value, entry.at);
  });
  sim.sizes.forEach((series, index) => {
    const element = podElements[index];
    if (!element) return;
    for (const entry of series) attr(tl, element, 'data-el-size', entry.value, entry.at);
  });
  sim.nodes.forEach((series, index) => {
    const element = nodeElements[index];
    if (!element) return;
    for (const entry of series) attr(tl, element, 'data-el-node', entry.value, entry.at);
  });

  // --- what travels --------------------------------------------------------

  sim.travellers.forEach((plan, index) => {
    const request = parts[index];
    if (!request) return;
    const lane = LANES[plan.lane];

    // A dot is drawn as the lane it belongs to, because a sample of the demand
    // and a scheduler asking for room are different kinds of thing.
    request.group.classList.add(`el-carry--${plan.lane}`);
    parkRequest(request, lane.x, lane.y);

    showRequest(tl, request, plan.start);
    tl.to(
      request.group,
      {
        y: lane.to,
        duration: round(plan.arrive - plan.start),
        ease: 'none',
        immediateRender: false,
      },
      plan.start,
    );
    markRequest(tl, request, plan.result, plan.arrive);
    hideRequest(tl, request, round(plan.arrive + MARK_HOLD), MARK_FADE);
  });

  // --- sound ---------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels ---------------------------------------------------------

  // The stage is complete on the first frame: a demand gauge at its ordinary
  // level, three pods at 45% of a 60% target, two nodes holding them, nothing
  // pending, nothing draining and nothing in flight.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
