import gsap from 'gsap';
import {
  HOME,
  LOAD_PER_TILE,
  MAX_LOAD,
  MAX_MOVED,
  MAX_OK,
  NODE_IDS,
  PARTITION_IDS,
  SCENE_DURATION,
  STAGE_STATE,
  TILE_HOMES,
  X_LANE,
  Y_CLIENTS_BOTTOM,
  Y_MAP_TOP,
  Y_NODES_BOTTOM,
  Y_NODES_TOP,
  upper,
} from './stage';
import type { NodeId, PartitionId, Phase } from './stage';
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
 * Rebalancing scene: a 24 second, four step timeline.
 *
 * The same two rules as every other scene: every tween sits at an absolute
 * position, and every discrete change is a zero-duration tween on a `data-*`
 * attribute that GSAP reverts when the playhead moves back past it. Nothing here
 * is a continuous quantity — a `load` is one of eight steps, an owner is one of
 * three names, a tile position is one of the places that tile can sit — so every
 * frame is a set of stacked variants and scrubbing backwards lands on a value
 * rather than on a blend of two.
 *
 * Nothing the reader counts is authored. The scene is told six things: when the
 * saturated world's requests pile up and what each of them wants, when the third
 * node joins, when the naive proposal goes up and comes down, when each move
 * starts and finishes and between which two nodes, when each request is issued
 * and which partition it wants (and, for one of them, how stale its copy of the
 * map is), and when the scene stops.
 *
 * Everything else falls out of one pass. Ownership is a map from partition to
 * node that only a finished move edits; where a tile is drawn is that ownership
 * plus the tile's rank inside its node, so a tile is never between two places
 * and the `Map` rows can never disagree with the picture. A node's `load` is
 * `LOAD_PER_TILE` per partition it holds plus whatever is queued for it, so the
 * first step's saturation, the third node's idleness and the even bars at the
 * end are consequences rather than stage directions — and so are the three cues
 * the first step makes, which fire when the derived warning level changes, when
 * the first node goes over its bar, and when a load passes what the bar can
 * draw. Each request is answered by whoever owns its partition at the instant it
 * lands; a client holding an old copy of the map lands on the wrong node and is
 * sent onward instead of being failed. `ok n` counts answers and `moved n`
 * counts finished moves, and neither is written anywhere else.
 *
 * The scene draws no routing rule and no key. Which node a key belongs to is the
 * sharding scene's subject and which axis the data was cut along is the
 * partitioning scene's; this one starts after both of those are settled and is
 * only ever about what it costs to change where the partitions sit.
 */

const ID = 'rebalancing';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- how a traveller moves -------------------------------------------------

/** One speed for every leg any traveller takes, in pixels per second. */
const SPEED = 1250;

/** The upper lane: a request on its way to whoever the map names. */
const LEG_ASK = round((Y_NODES_TOP - Y_CLIENTS_BOTTOM) / SPEED);
/** The lower lane: an ownership update on its way to the map. */
const LEG_TELL = round((Y_MAP_TOP - Y_NODES_BOTTOM) / SPEED);

/** How long a node shows that it just answered, or just sent someone onward. */
const HIT_HOLD = 0.25;
/** How long the wrong node holds the caller before the right one answers. */
const REDIRECT_HOLD = 0.3;
/** How long a map row stays lit after it is rewritten. */
const ROW_HOLD = 0.4;

/** How long a traveller takes to go once it has nothing left to do. */
const MARK_FADE = 0.14;

// --- what the scene is told ------------------------------------------------

/**
 * The saturated world. Each entry is a request the two full nodes take in and do
 * not answer, so it stays on the node it was routed to and shows up in that
 * node's `load`. Nothing here says the bars go over: that is what happens when
 * three partitions and three unanswered requests land on one node.
 */
const GHOST_ARRIVALS: { at: number; partition: PartitionId }[] = [
  { at: 0.5, partition: 'p1' },
  { at: 0.9, partition: 'p4' },
  { at: 1.4, partition: 'p2' },
  { at: 1.8, partition: 'p5' },
  { at: 2.2, partition: 'p3' },
];

/** When the counterfactual is released, the third node joins, and moves become
 *  possible. One instant, because they are one beat. */
const LIFT_AT = 3.0;

/** When the proposal to reshuffle everything goes up, is struck out, and is
 *  replaced by the two moves the new node's share actually needs. */
const PLAN_AT: [number, 'naive' | 'rejected' | 'minimal' | 'none'][] = [
  [6.5, 'naive'],
  [7.4, 'rejected'],
  [7.9, 'minimal'],
  [10.4, 'none'],
];

/**
 * Every move: when it starts, what moves, from where to where, and whether the
 * shard is small enough to move in one go. A stateful move carries the three
 * instants that make it three beats instead of one — the copy runs until
 * `catchupAt`, the changes it missed replay until `switchAt`, ownership flips at
 * `switchAt`, and the move is finished at `done`.
 *
 * The two moves in the second step are the whole of what the new node's share
 * costs: one partition from each full node, and nothing else touched. The two
 * later ones trade a partition back the other way, which is what leaves all
 * three nodes carrying the same `load` at the end.
 */
interface MovePlan {
  start: number;
  partition: PartitionId;
  from: NodeId;
  to: NodeId;
  kind: 'simple' | 'stateful';
  catchupAt?: number;
  switchAt?: number;
  done: number;
}

const MOVES: MovePlan[] = [
  { start: 8.4, partition: 'p3', from: 'n1', to: 'n3', kind: 'simple', done: 9.2 },
  { start: 9.2, partition: 'p6', from: 'n2', to: 'n3', kind: 'simple', done: 10.2 },
  { start: 12.5, partition: 'p2', from: 'n1', to: 'n2', kind: 'simple', done: 16.2 },
  {
    start: 18.5,
    partition: 'p5',
    from: 'n2',
    to: 'n1',
    kind: 'stateful',
    catchupAt: 20.2,
    switchAt: 21.0,
    done: 21.8,
  },
];

/**
 * Every request, as the instant it reaches the Nodes box and the partition it
 * wants. `mapVersion` is how many ownership changes the client had seen when it
 * looked the partition up: `null` is a client reading the map now, a number is a
 * client working from a copy it took earlier. Nothing here says which node
 * answers — the map at the instant the request lands decides that, and a client
 * that resolved too early lands on the wrong node and is sent onward.
 */
const REQUESTS: {
  at: number;
  partition: PartitionId;
  mapVersion: number | null;
  cue: SceneCue | null;
}[] = [
  { at: 7.0, partition: 'p1', mapVersion: null, cue: null },
  { at: 7.8, partition: 'p4', mapVersion: null, cue: null },
  { at: 10.9, partition: 'p3', mapVersion: null, cue: null },
  { at: 13.4, partition: 'p2', mapVersion: null, cue: 'success' },
  { at: 14.4, partition: 'p6', mapVersion: 1, cue: 'state' },
  { at: 16.8, partition: 'p2', mapVersion: null, cue: null },
  { at: 19.4, partition: 'p5', mapVersion: null, cue: 'success' },
  { at: 21.8, partition: 'p5', mapVersion: null, cue: null },
];

/** The five things the scene holds up, and how long each is held for. */
const MARK_AT: [number, string, number][] = [
  [3.9, 'idle', 0.6],
  [4.8, 'data', 0.4],
  [11.0, 'untouched', 0.3],
  [15.4, 'truth', 0.6],
  [17.0, 'shelf', 0.4],
];

/** When the picture is called settled: even bars, a dark lamp, nothing moving. */
const SETTLE_AT = 22.4;

/** Above this many `load` steps a node is over what its bar can draw. */
const HOT_AT = 8;

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
type Kind = 'ask' | 'stale' | 'tell';

interface Journey {
  y: number;
  to: number;
  kind: Kind;
  label: string;
  showAt: number;
  duration: number;
  markAt: number;
  hideAt: number;
}

/** One request, once the map has answered for it. */
interface Serve {
  at: number;
  partition: PartitionId;
  /** Where the client went first, which is only ever wrong when it was stale. */
  landed: NodeId;
  /** Who actually answered, which is always the owner at the serving instant. */
  server: NodeId;
  redirected: boolean;
  okAt: number;
  ok: number;
}

/** One finished move, with the counts it left behind. */
interface Done {
  at: number;
  partition: PartitionId;
  from: NodeId;
  to: NodeId;
  kind: 'simple' | 'stateful';
  moved: number;
}

/** Ownership and the drawn loads, at every instant either of them changed. */
interface Frame {
  at: number;
  owners: Record<PartitionId, NodeId>;
  positions: Record<PartitionId, string>;
  loads: Record<NodeId, number>;
}

interface Simulation {
  changes: AttrChange[];
  cues: [number, SceneCue][];
  journeys: Journey[];
  serves: Serve[];
  dones: Done[];
  frames: Frame[];
}

// --- the simulation --------------------------------------------------------

/**
 * Where every tile is drawn, read off ownership alone. A node's tiles are its
 * partitions in name order, packed from the top, so no node ever shows a hole
 * and no tile is ever drawn in two places.
 */
function placementsOf(owners: Record<PartitionId, NodeId>): Record<PartitionId, string> {
  const out = {} as Record<PartitionId, string>;
  for (const node of NODE_IDS) {
    const held = PARTITION_IDS.filter((id) => owners[id] === node);
    held.forEach((id, index) => {
      out[id] = `${node}-${index}`;
    });
  }
  return out;
}

function simulate(): Simulation {
  const raw: AttrChange[] = [];
  const fixed: [number, SceneCue][] = [];
  const journeys: Journey[] = [];
  const serves: Serve[] = [];
  const dones: Done[] = [];
  const frames: Frame[] = [];
  const problems: string[] = [];

  const setAttr = (at: number, target: string, name: string, value: string): void => {
    raw.push({ at: round(at), target, name, value });
  };
  const cue = (at: number, name: SceneCue): void => {
    fixed.push([round(at), name]);
  };

  /** Who owns what, which only a finished move edits. */
  const owners = { ...HOME } as Record<PartitionId, NodeId>;
  /** One snapshot per ownership change, so a stale client can be answered. */
  const versions: Record<PartitionId, NodeId>[] = [{ ...owners }];
  /** What each node is holding for callers it has not answered. */
  const backlog: Record<NodeId, number> = { n1: 0, n2: 0, n3: 0 };
  /** Which moves are in flight, which is what the lamp reads. */
  const flight = new Set<PartitionId>();

  let joined = false;
  let ghost = false;
  let warn = 'off';
  let lampOn = false;
  let hotSeen = false;
  let ok = 0;
  let moved = 0;
  const nodeState: Record<NodeId, string> = { n1: 'active', n2: 'active', n3: 'absent' };
  const nodeRole: Record<NodeId, string> = { n1: 'idle', n2: 'idle', n3: 'idle' };
  const drawnLoad: Record<NodeId, number> = { n1: 6, n2: 6, n3: 0 };
  const placed: Record<PartitionId, string> = placementsOf(owners);
  frames.push({ at: 0, owners: { ...owners }, positions: { ...placed }, loads: { ...drawnLoad } });

  const { schedule, drain } = createScheduler();

  /** What a node is carrying before the bar has to give up drawing it. */
  const rawLoad = (node: NodeId): number =>
    LOAD_PER_TILE * PARTITION_IDS.filter((id) => owners[id] === node).length + backlog[node];

  /**
   * Reads every node off ownership and the backlog, and writes down whatever has
   * changed. This is the only place a `load`, a node state or the warning level
   * is ever set, and the only place the first step's three noises come from.
   */
  const refresh = (at: number): void => {
    let peak = 0;
    for (const node of NODE_IDS) {
      const value = rawLoad(node);
      peak = Math.max(peak, value);
      const shown = Math.min(value, MAX_LOAD);
      if (drawnLoad[node] !== shown) {
        drawnLoad[node] = shown;
        setAttr(at, `node-${node}`, 'data-rb-load', String(shown));
      }
      const held = PARTITION_IDS.filter((id) => owners[id] === node).length;
      const want =
        node === 'n3' && !joined ? 'absent' : value >= HOT_AT ? 'hot' : held === 0 ? 'empty' : 'active';
      if (nodeState[node] !== want) {
        const first = want === 'hot' && !hotSeen;
        nodeState[node] = want;
        setAttr(at, `node-${node}`, 'data-rb-node', want);
        if (first) {
          hotSeen = true;
          cue(at, 'state');
        }
      }
    }
    const wantWarn = peak > MAX_LOAD ? 'peak' : peak > LOAD_PER_TILE * 3 ? 'rising' : 'off';
    if (wantWarn !== warn) {
      const wasOff = warn === 'off';
      warn = wantWarn;
      setAttr(at, 'stage', 'data-rb-warn', wantWarn);
      if (wantWarn === 'peak') cue(at, 'failure');
      else if (wasOff && wantWarn !== 'off') cue(at, 'state');
    }
    frames.push({
      at: round(at),
      owners: { ...owners },
      positions: { ...placed },
      loads: { ...drawnLoad },
    });
  };

  /** Draws every tile where ownership now says it belongs. */
  const replace = (at: number): void => {
    const next = placementsOf(owners);
    for (const id of PARTITION_IDS) {
      const where = next[id];
      if (placed[id] === where) continue;
      placed[id] = where;
      setAttr(at, `tile-${id}`, 'data-rb-pos', where);
    }
  };

  /**
   * Reads the lamp and every node's part in the move off what is actually in
   * flight. Both are derived rather than set by hand, so a move that starts on
   * the instant another one finishes leaves the lamp lit and hands the role
   * over in one frame, whichever order the two events happen to run in. The
   * noise the lamp makes is not made here: it is read back off the collapsed
   * changes, so an off and an on at one instant is silence rather than a click.
   */
  const lamp = (at: number): void => {
    const want = flight.size > 0;
    if (want !== lampOn) {
      lampOn = want;
      setAttr(at, 'stage', 'data-rb-moving', want ? 'on' : 'off');
    }
    const roles: Record<NodeId, string> = { n1: 'idle', n2: 'idle', n3: 'idle' };
    for (const move of MOVES) {
      if (!flight.has(move.partition)) continue;
      roles[move.from] = 'source';
      roles[move.to] = 'target';
    }
    for (const node of NODE_IDS) {
      if (nodeRole[node] === roles[node]) continue;
      nodeRole[node] = roles[node];
      setAttr(at, `node-${node}`, 'data-rb-role', roles[node]);
    }
  };

  /** Says a node just did something, and takes the word back once it is read. */
  const hit = (at: number, node: NodeId, how: 'serve' | 'redirect', hold: number): void => {
    setAttr(at, `node-${node}`, 'data-rb-hit', how);
    schedule(round(at + hold), () => setAttr(round(at + hold), `node-${node}`, 'data-rb-hit', 'off'));
  };

  const travel = (
    y: number,
    to: number,
    landAt: number,
    duration: number,
    kind: Kind,
    label: string,
    markAt: number,
  ): void => {
    journeys.push({
      y,
      to,
      kind,
      label,
      showAt: round(landAt - duration),
      duration,
      markAt: round(markAt),
      hideAt: round(markAt),
    });
  };

  /** Rewrites one map row, and sends the update down the lower lane to it. */
  const publish = (at: number, id: PartitionId, to: NodeId): void => {
    owners[id] = to;
    versions.push({ ...owners });
    setAttr(at, `row-${id}`, 'data-rb-own', to);
    setAttr(at, `row-${id}`, 'data-rb-row', 'fresh');
    schedule(round(at + ROW_HOLD), () =>
      setAttr(round(at + ROW_HOLD), `row-${id}`, 'data-rb-row', 'idle'),
    );
    travel(Y_NODES_BOTTOM, Y_MAP_TOP, at, LEG_TELL, 'tell', upper(id), at);
    replace(at);
    refresh(at);
  };

  // --- the world nobody can add capacity to --------------------------------

  for (const arrival of GHOST_ARRIVALS) {
    schedule(arrival.at, () => {
      if (!ghost) {
        ghost = true;
        setAttr(arrival.at, 'stage', 'data-rb-ghost', 'on');
      }
      const node = owners[arrival.partition];
      backlog[node] += 1;
      const queued = NODE_IDS.reduce((sum, id) => sum + backlog[id], 0);
      setAttr(arrival.at, 'stage', 'data-rb-queue', String(queued));
      refresh(arrival.at);
    });
  }

  schedule(LIFT_AT, () => {
    ghost = false;
    joined = true;
    for (const node of NODE_IDS) backlog[node] = 0;
    setAttr(LIFT_AT, 'stage', 'data-rb-ghost', 'off');
    setAttr(LIFT_AT, 'stage', 'data-rb-queue', '0');
    setAttr(LIFT_AT, 'stage', 'data-rb-mode', 'rebalance');
    refresh(LIFT_AT);
    cue(LIFT_AT, 'trip');
  });

  // --- the proposal, and the plan that replaces it -------------------------

  for (const [at, plan] of PLAN_AT) {
    schedule(at, () => {
      setAttr(at, 'stage', 'data-rb-plan', plan);
      if (plan === 'naive' || plan === 'rejected') cue(at, 'state');
    });
  }

  // --- the moves -----------------------------------------------------------

  const phase = (at: number, id: PartitionId, value: Phase): void => {
    setAttr(at, `tile-${id}`, 'data-rb-phase', value);
  };

  for (const move of MOVES) {
    schedule(move.start, () => {
      flight.add(move.partition);
      phase(move.start, move.partition, move.kind === 'stateful' ? 'copy' : 'moving');
      setAttr(move.start, `row-${move.partition}`, 'data-rb-row', 'moving');
      setAttr(move.start, `node-${move.from}`, 'data-rb-role', 'source');
      setAttr(move.start, `node-${move.to}`, 'data-rb-role', 'target');
      lamp(move.start);
    });

    const flipAt = move.kind === 'stateful' ? (move.switchAt ?? move.done) : move.done;

    if (move.kind === 'stateful') {
      const catchupAt = move.catchupAt ?? move.done;
      schedule(catchupAt, () => {
        phase(catchupAt, move.partition, 'catchup');
        cue(catchupAt, 'state');
      });
      schedule(flipAt, () => {
        phase(flipAt, move.partition, 'switch');
        publish(flipAt, move.partition, move.to);
        cue(flipAt, 'state');
      });
    } else {
      schedule(flipAt, () => publish(flipAt, move.partition, move.to));
    }

    schedule(move.done, () => {
      flight.delete(move.partition);
      phase(move.done, move.partition, 'settled');
      setAttr(move.done, `node-${move.from}`, 'data-rb-role', 'idle');
      setAttr(move.done, `node-${move.to}`, 'data-rb-role', 'idle');
      moved += 1;
      setAttr(move.done, 'stage', 'data-rb-moved', String(moved));
      dones.push({
        at: round(move.done),
        partition: move.partition,
        from: move.from,
        to: move.to,
        kind: move.kind,
        moved,
      });
      lamp(move.done);
      cue(move.done, 'success');
    });
  }

  // --- the requests, answered by whoever owns the partition ----------------

  for (const plan of REQUESTS) {
    const leaves = round(plan.at - LEG_ASK);
    schedule(leaves, () => {
      // The client resolves the partition when it sends, from whichever copy of
      // the map it is holding. That is the only authored thing about a request.
      const snapshot = versions[plan.mapVersion ?? versions.length - 1];
      const landed = snapshot?.[plan.partition] ?? owners[plan.partition];
      schedule(plan.at, () => {
        const server = owners[plan.partition];
        const redirected = landed !== server;
        const okAt = round(plan.at + (redirected ? REDIRECT_HOLD : 0));
        if (redirected) hit(plan.at, landed, 'redirect', REDIRECT_HOLD);
        hit(okAt, server, 'serve', HIT_HOLD);
        travel(
          Y_CLIENTS_BOTTOM,
          Y_NODES_TOP,
          plan.at,
          LEG_ASK,
          redirected ? 'stale' : 'ask',
          upper(plan.partition),
          okAt,
        );
        if (plan.cue) cue(plan.at, plan.cue);
        schedule(okAt, () => {
          ok += 1;
          setAttr(okAt, 'stage', 'data-rb-ok', String(ok));
          serves.push({
            at: round(plan.at),
            partition: plan.partition,
            landed,
            server,
            redirected,
            okAt,
            ok,
          });
        });
      });
    });
  }

  // --- what the scene holds up, and where it stops -------------------------

  for (const [at, value, hold] of MARK_AT) {
    schedule(at, () => {
      setAttr(at, 'stage', 'data-rb-mark', value);
      cue(at, 'state');
    });
    schedule(round(at + hold), () => setAttr(round(at + hold), 'stage', 'data-rb-mark', 'none'));
  }

  schedule(SETTLE_AT, () => {
    setAttr(SETTLE_AT, 'stage', 'data-rb-settled', 'on');
    cue(SETTLE_AT, 'success');
  });

  drain();

  return finish({ raw, fixed, journeys, serves, dones, frames, problems });
}

// --- what has to be true for the picture to mean anything ------------------

interface RawSimulation {
  raw: AttrChange[];
  fixed: [number, SceneCue][];
  journeys: Journey[];
  serves: Serve[];
  dones: Done[];
  frames: Frame[];
  problems: string[];
}

/**
 * Who owns what at `at`, worked out from the move plan alone. The pass above
 * answered from state it was carrying; this reads the plan straight, so a drift
 * between the two is a bug rather than a matter of opinion.
 */
function ownersAt(at: number): Record<PartitionId, NodeId> {
  const owners = { ...HOME } as Record<PartitionId, NodeId>;
  for (const move of MOVES) {
    const flip = move.kind === 'stateful' ? (move.switchAt ?? move.done) : move.done;
    if (at >= flip) owners[move.partition] = move.to;
  }
  return owners;
}

function finish(sim: RawSimulation): Simulation {
  const { raw, fixed, journeys, serves, dones, frames } = sim;
  const problems = [...sim.problems];

  // Every answer, judged again from the plan alone: the node that replied is
  // the node the map named at the instant the request landed, and the only
  // request that was sent onward is the one whose client held an old map.
  for (const entry of serves) {
    const wanted = ownersAt(entry.at)[entry.partition];
    if (entry.server !== wanted) {
      problems.push(`${entry.at} ${upper(entry.partition)} was answered by ${upper(entry.server)}, the map says ${upper(wanted)}`);
    }
    if (entry.redirected && entry.landed === entry.server) {
      problems.push(`${entry.at} a request was sent onward to the node it was already on`);
    }
    if (!entry.redirected && entry.landed !== entry.server) {
      problems.push(`${entry.at} a request landed on ${upper(entry.landed)} and was answered by ${upper(entry.server)} without being sent onward`);
    }
  }
  if (serves.length !== REQUESTS.length) {
    problems.push(`${serves.length} of ${REQUESTS.length} requests were answered`);
  }
  const redirects = serves.filter((entry) => entry.redirected);
  if (redirects.length !== 1) problems.push(`${redirects.length} requests were sent onward, the captions describe one`);
  const stale = REQUESTS.filter((entry) => entry.mapVersion !== null);
  if (redirects.length !== stale.length) problems.push('a request with a current map was still sent onward');
  serves.forEach((entry, index) => {
    if (entry.ok !== index + 1) problems.push(`${entry.at} the answer count went to ${entry.ok} on answer ${index + 1}`);
    if (entry.ok > MAX_OK) problems.push(`the answer count reaches ${entry.ok}, the stage draws up to ${MAX_OK}`);
  });

  // The moves: every one finished, counted once, and counted only when it did.
  if (dones.length !== MOVES.length) problems.push(`${dones.length} of ${MOVES.length} moves finished`);
  dones.forEach((entry, index) => {
    const plan = MOVES[index];
    if (!plan || plan.partition !== entry.partition || plan.to !== entry.to) {
      problems.push(`${entry.at} a move finished that was not the one planned`);
    }
    if (entry.moved !== index + 1) problems.push(`${entry.at} the move count went to ${entry.moved} on move ${index + 1}`);
    if (entry.moved > MAX_MOVED) problems.push(`the move count reaches ${entry.moved}, the stage draws up to ${MAX_MOVED}`);
  });

  // The proposal is a picture and nothing else: between the instant it goes up
  // and the instant the first real move starts, nothing on the stage moves.
  const preview = frames.filter((entry) => entry.at > PLAN_AT[0][0] && entry.at < MOVES[0].start);
  for (const entry of preview) {
    const before = frames.filter((f) => f.at <= PLAN_AT[0][0]).at(-1);
    if (before && PARTITION_IDS.some((id) => before.positions[id] !== entry.positions[id])) {
      problems.push(`${entry.at} the proposal moved a partition`);
    }
  }

  // The map and the picture are the same fact. A tile sits where ownership says
  // and nowhere else, no two tiles share a place, and a place is one the stage
  // actually drew for that partition.
  for (const entry of frames) {
    const wanted = placementsOf(entry.owners);
    for (const id of PARTITION_IDS) {
      if (entry.positions[id] !== wanted[id]) {
        problems.push(`${entry.at} ${upper(id)} is drawn at ${entry.positions[id]} and owned at ${wanted[id]}`);
      }
      if (!(TILE_HOMES[id] ?? []).includes(entry.positions[id] ?? '')) {
        problems.push(`${entry.at} ${upper(id)} is drawn at ${entry.positions[id]}, which the stage never drew`);
      }
    }
    if (new Set(PARTITION_IDS.map((id) => entry.positions[id])).size !== PARTITION_IDS.length) {
      problems.push(`${entry.at} two partitions are drawn in one place`);
    }
    for (const node of NODE_IDS) {
      const value = entry.loads[node];
      if (value < 0 || value > MAX_LOAD) problems.push(`${entry.at} ${upper(node)} reads a load of ${value}`);
    }
  }

  // The fourth step's whole claim: while the replica is filling, the original is
  // still answering, and the pause is the switch rather than the copy.
  const heavy = MOVES.find((move) => move.kind === 'stateful');
  if (!heavy) problems.push('no move is heavy enough to need three beats');
  else {
    const during = serves.filter(
      (entry) => entry.partition === heavy.partition && entry.at > heavy.start && entry.at < (heavy.switchAt ?? heavy.done),
    );
    if (during.length === 0) problems.push('nothing was asked of the heavy shard while it was being copied');
    for (const entry of during) {
      if (entry.server !== heavy.from) {
        problems.push(`${entry.at} the heavy shard was answered by ${upper(entry.server)} during the copy`);
      }
    }
    const after = serves.filter((entry) => entry.partition === heavy.partition && entry.at > (heavy.switchAt ?? heavy.done));
    if (after.length === 0 || after.some((entry) => entry.server !== heavy.to)) {
      problems.push('nothing was asked of the heavy shard once the new owner had it');
    }
  }

  // The last frame: every node carrying the same share, nothing in flight.
  const last = frames.at(-1);
  if (!last) problems.push('the simulation produced no frames');
  else if (new Set(NODE_IDS.map((node) => last.loads[node])).size !== 1) {
    problems.push(`the scene ends on loads ${NODE_IDS.map((node) => last.loads[node]).join('/')}`);
  }

  for (const journey of journeys) {
    if (journey.showAt < 0 || journey.hideAt + MARK_FADE > SCENE_DURATION) {
      problems.push(`a traveller runs off the end of the scene at ${journey.showAt}`);
    }
  }

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

  // The lamp's noise, read back off the changes that survived. A move that
  // starts on the instant another one ends leaves no change here at all, so it
  // makes no noise, which is what the reader sees: one lamp that stayed lit.
  for (const change of changes) {
    if (change.target !== 'stage' || change.name !== 'data-rb-moving') continue;
    if (change.value === 'on') fixed.push([change.at, 'state']);
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

  journeys.sort((left, right) => left.showAt - right.showAt);

  return { changes, cues: fixed, journeys, serves, dones, frames };
}

// --- the timeline ----------------------------------------------------------

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);
  const sim = simulate();

  // The captions name the figures the model produced. Nothing here places them:
  // if the schedule changes, this is what says the captions have stopped
  // describing the scene.
  const share = sim.dones.filter((entry) => entry.to === 'n3');
  if (share.length !== 2) {
    throw new Error(`${ID} scene: the second step promises the new node takes two partitions, it took ${share.length}`);
  }
  const untouched = PARTITION_IDS.filter((id) => !sim.dones.some((entry) => entry.partition === id));
  if (untouched.length !== 2) {
    throw new Error(`${ID} scene: the scene ends with ${untouched.length} partitions never touched`);
  }
  const closing = sim.frames.at(-1);
  if (!closing || PARTITION_IDS.some((id) => closing.owners[id] !== ownersAt(SCENE_DURATION)[id])) {
    throw new Error(`${ID} scene: the closing ownership is not the one the plan ends on`);
  }

  const targets: Record<string, Element> = { stage };
  for (const id of NODE_IDS) targets[`node-${id}`] = q(stage, `.rb-node--${id}`, ID);
  for (const id of PARTITION_IDS) {
    targets[`tile-${id}`] = q(stage, `.rb-tile--${id}`, ID);
    targets[`row-${id}`] = q(stage, `.rb-row--${id}`, ID);
  }

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

    // A dot is drawn as the kind of thing it carries, because a request going
    // where the map says, a request going where an old map said, and an
    // ownership update on its way to the map are three different things
    // travelling the same kind of line.
    request.group.classList.add(`rb-req--${journey.kind}`);

    const label = attachToRequest(
      request,
      'text',
      { class: 'scene-req-label rb-tag', x: '-36', y: '9', 'text-anchor': 'end' },
      journey.label,
    );
    gsap.set(label, { opacity: 1 });

    parkRequest(request, X_LANE, journey.y);
    showRequest(tl, request, journey.showAt);
    tl.to(
      request.group,
      { y: journey.to, duration: journey.duration, ease: 'none', immediateRender: false },
      journey.showAt,
    );

    markRequest(tl, request, 'ok', journey.markAt);
    hideRequest(tl, request, journey.hideAt, MARK_FADE);
  });

  // --- sound ---------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels ---------------------------------------------------------

  // The stage is complete on the first frame: two nodes holding three
  // partitions each at `load` 6, a third node not there yet, a map that agrees
  // with the tiles, `ok 0`, `moved 0`, a dark lamp and nothing in flight.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
