import {
  BOX_IDS,
  CHIP_IDS,
  LANE_PREFIX,
  LANE_SLOTS,
  LIFETIMES,
  OK_MAX,
  ROW_IDS,
  SCENE_DURATION,
  STAGE_STATE,
  X_LANE,
  Y_APP_BOTTOM,
  Y_CONTAINER_BOTTOM,
  Y_CONTAINER_TOP,
  Y_INSTANCES_TOP,
} from './stage';
import type { Ghost, Lifetime, Mark } from './stage';
import { q } from '../shared/dom';
import { haloRequest, hideRequest, markRequest, mountRequests, parkRequest, showRequest } from '../shared/request';
import { createScheduler } from '../shared/simulation';
import { attr, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Dependency Injection scene: a 24 second, four step timeline.
 *
 * The same two rules as every other scene: every tween sits at an absolute
 * position, and every discrete change is a zero-duration tween on a `data-*`
 * attribute that GSAP reverts when the playhead moves back past it. Nothing on
 * this stage is a continuous quantity — a registration row is registered or it
 * is not, an instance slot is in one of five states, a lamp is in one of two or
 * three — so every frame is a set of stacked variants and scrubbing backwards
 * lands on a value rather than on a blend of two.
 *
 * Nothing the reader counts is authored. The scene is told when the ghost wires
 * itself and when it is taken away, when the registration rows come on, when
 * the lifetime badges are shown, when each request leaves and when its answer
 * pops, when its scope closes, when `build` runs and when the host shuts down.
 * It is also told the one thing a container cannot work out for itself: the
 * **injection plan**, meaning which lifetimes each request's graph touches and
 * how many transient dependencies it declares. Endpoints differ, so this
 * differs, and it is the reason the three lanes grow at three rates.
 *
 * Everything else falls out of one pass over that, under the lifetime rules
 * themselves. **A singleton** is made the first time anything asks for it and
 * handed out unchanged after that, so its lane never holds more than one live
 * instance and the second request gets a `reused` frame rather than a second
 * box. **A scoped instance** is made once per open scope and disposed when that
 * scope closes, so its lane gains exactly one box per request. **A transient**
 * is made once per injection, never reused and never looked up again, so its
 * lane gains one box per declared dependency. **Disposal** runs in reverse
 * order of creation, at every scope close and again at shutdown, and the model
 * refuses a schedule where it does not.
 *
 * Three things the model will not let the timeline pretend. A disposed instance
 * never comes back, because the ledger of what was made is the whole picture of
 * the third step. A registration never changes after `build`, because that is
 * what building the container means. And a touch point in the first step's
 * ghost is never lit on a wire that is not drawn, because the argument of that
 * step is that the wires are the work.
 *
 * This scene does not own the direction rule. Hexagonal Architecture owns which
 * way a dependency may point and where the composition root sits; what is owned
 * here is the mechanism that realises it — the registrations, the graph built
 * to order, the three lifetimes, and the container's own life. Background
 * Service owns the practice of opening a scope inside a singleton, which is the
 * applied half of the same subject.
 */

const ID = 'dependency-injection';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- how a traveller moves -------------------------------------------------

/** Seconds a request takes from App to Container: 200px. */
const CALL_LEG = 0.22;
/** Seconds the making indication takes from Container to Instances: 230px. */
const MAKE_LEG = 0.25;
/** How long a traveller takes to go once it is answered or absorbed. */
const FADE = 0.06;
/** The halo diameter two travellers on one column must always keep between them. */
const HALO = 52;

/** How long after it arrives a request's scope is opened. */
const OPEN_AFTER = 0.03;
/** The gap between one instance being made and the next. */
const MAKE_STEP = 0.1;
/** How long after the last instance the assembled graph is called built. */
const BUILT_AFTER = 0.1;
/** How long a `new` or `reused` frame is held before the instance settles. */
const SETTLE_AFTER = 0.3;
/** The gap between one instance being disposed and the next. */
const DISPOSE_STEP = 0.1;

// --- what the scene is told ------------------------------------------------

/** The ghost of the first step, and the instant it is taken away. */
const GHOST_PLAN: [number, Ghost][] = [
  [0, 'nodes'],
  [0.5, 'near'],
  [1.4, 'deep'],
  [2.2, 'lit'],
  [3.0, 'off'],
];

/** Which wires each ghost stage draws, and which touch points it lights. */
const GHOST_WIRES: Record<Ghost, number[]> = {
  nodes: [],
  near: [1],
  deep: [1, 2, 3],
  lit: [1, 2, 3],
  off: [],
};
const GHOST_TOUCHES: Record<Ghost, number[]> = {
  nodes: [],
  near: [],
  deep: [],
  lit: [1, 2, 3],
  off: [],
};

/** When asking stops being the same act as making. */
const SEPARATE_AT = 3.0;

/** When each registration row is written. */
const ROWS_ON: number[] = [6.5, 6.72, 6.94];

/** When the three lifetime badges are shown. */
const BADGES_AT = 12.5;

/**
 * When the container is built and the registrations close. It sits just after
 * the last row is written and before the first request leaves, because that is
 * the order a host does it in: everything is registered, the container is
 * built, and only then is anything served. Nothing may change a registration
 * from here on, which the run is checked against.
 */
const BUILD_AT = 7.1;

/** The shutdown: the lamp, the last instance released, and the door shut. */
const SHUTDOWN_AT = 21.0;
const SHUTDOWN_STEP = 0.45;
const SHUTDOWN_DONE = 22.0;

/** When the picture is called settled: forward, quiet and empty. */
const SETTLE_AT = 22.4;

/** The four things the scene holds up, and how long each is held for. */
const MARK_AT: [number, Mark, number][] = [
  [3.9, 'declare', 0.5],
  [4.8, 'onePlace', 0.5],
  [11.0, 'oneLine', 0.35],
  [17.0, 'grow', 0.45],
];

/**
 * The requests, and the injection plan of each.
 *
 * `transients` is the number of transient dependencies that request's graph
 * declares, which is the only thing that differs between them: the two in the
 * second step reach a small endpoint that declares one, the two in the third
 * step reach a wider one that declares two, and the last goes back to the small
 * one. Every request touches the singleton and the scoped registration exactly
 * once, because that is what those lifetimes mean.
 */
interface RequestPlan {
  /** When the request leaves the App band. */
  depart: number;
  /** When the container starts walking the constructor chain. */
  walkAt: number;
  /** When the answer pops at the container. */
  okAt: number;
  /** When the request's scope is closed. */
  closeAt: number;
  transients: number;
}

const REQUESTS: RequestPlan[] = [
  { depart: 7.4, walkAt: 8.2, okAt: 9.2, closeAt: 9.7, transients: 1 },
  { depart: 9.6, walkAt: 10.12, okAt: 10.45, closeAt: 10.67, transients: 1 },
  { depart: 13.4, walkAt: 13.92, okAt: 14.4, closeAt: 14.7, transients: 2 },
  { depart: 15.2, walkAt: 15.72, okAt: 16.2, closeAt: 16.5, transients: 2 },
  { depart: 19.15, walkAt: 19.67, okAt: 19.98, closeAt: 20.22, transients: 1 },
];

/** The request whose scope is opened and closed out loud, in the fourth step. */
const SCOPE_SHOWN = 4;

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

/** What a traveller is carrying, which is also how it is drawn. */
type RideKind = 'call' | 'make';

/** One traveller, on one column, in one or two directions. */
interface Ride {
  kind: RideKind;
  from: number;
  to: number;
  startAt: number;
  leg: number;
  /** Absolute time the result marker is put on, and the up leg starts. */
  markAt: number | null;
  /** Absolute time the traveller starts fading. */
  fadeAt: number;
  /** The window the waiting halo is drawn over, for a request being served. */
  halo: [number, number] | null;
}

/** One instance, once the model has worked out that it had to exist. */
interface Instance {
  id: string;
  life: Lifetime;
  /** Which request's graph asked for it. */
  request: number;
  madeAt: number;
  disposedAt: number;
}

interface Simulation {
  changes: AttrChange[];
  cues: [number, SceneCue][];
  rides: Ride[];
  instances: Instance[];
  /** Reported rather than drawn: what the run actually produced. */
  made: Record<Lifetime, number>;
  reuses: number;
  disposeOrders: string[];
  okTotal: number;
}

const laneOfLife = (life: Lifetime): string => LANE_PREFIX[life];

// --- the simulation --------------------------------------------------------

function simulate(): Simulation {
  const raw: AttrChange[] = [];
  const cueList: [number, SceneCue][] = [];
  const rides: Ride[] = [];
  const instances: Instance[] = [];
  const problems: string[] = [];
  const disposeOrders: string[] = [];

  const setAttr = (at: number, target: string, name: string, value: string): void => {
    raw.push({ at: round(at), target, name, value });
  };
  const stage = (at: number, name: string, value: string): void => {
    setAttr(at, 'stage', `data-di-${name}`, value);
  };
  const cue = (at: number, name: SceneCue): void => {
    cueList.push([round(at), name]);
  };

  /** How many instances each lane has been asked for, which names its next slot. */
  const used: Record<Lifetime, number> = { singleton: 0, scoped: 0, transient: 0 };
  /** The one live singleton, once something has asked for it. */
  let singleton: Instance | null = null;
  let reuses = 0;
  let okValue = 0;

  const { schedule, drain } = createScheduler();

  // --- what the stage is told, ahead of anything that is derived -----------

  stage(0, 'mode', 'direct');
  stage(0, 'ghost', 'nodes');
  stage(0, 'assembly', 'idle');
  stage(0, 'scope', 'closed');
  stage(0, 'lifetimes', 'off');
  stage(0, 'build', 'off');
  stage(0, 'dispose', 'off');
  stage(0, 'ok', '0');
  stage(0, 'mark', 'none');
  stage(0, 'settled', 'off');
  for (const id of ROW_IDS) setAttr(0, id, 'data-di-row', 'blank');
  for (const id of CHIP_IDS) setAttr(0, id, 'data-di-chip', 'idle');
  for (const id of BOX_IDS) setAttr(0, id, 'data-di-box', 'off');

  for (const [at, ghost] of GHOST_PLAN) {
    if (at === 0) continue;
    schedule(at, () => {
      stage(at, 'ghost', ghost);
      if (ghost === 'off') return;
      cue(at, ghost === 'lit' ? 'failure' : 'state');
    });
  }

  schedule(SEPARATE_AT, () => {
    stage(SEPARATE_AT, 'mode', 'injected');
    cue(SEPARATE_AT, 'trip');
  });

  ROWS_ON.forEach((at, index) => {
    const id = ROW_IDS[index];
    if (!id) return;
    schedule(at, () => {
      setAttr(at, id, 'data-di-row', 'on');
      if (index === 0) cue(at, 'state');
    });
  });

  schedule(BADGES_AT, () => {
    stage(BADGES_AT, 'lifetimes', 'on');
    cue(BADGES_AT, 'state');
  });

  schedule(BUILD_AT, () => {
    stage(BUILD_AT, 'build', 'on');
    cue(BUILD_AT, 'state');
  });

  for (const [at, mark, hold] of MARK_AT) {
    schedule(at, () => {
      stage(at, 'mark', mark);
      stage(round(at + hold), 'mark', 'none');
      cue(at, 'state');
    });
  }

  // --- one request, and everything the lifetime rules make of it -----------

  REQUESTS.forEach((plan, index) => {
    const arriveAt = round(plan.depart + CALL_LEG);
    const openAt = round(arriveAt + OPEN_AFTER);
    const makeDepart = round(plan.walkAt - MAKE_LEG);
    const landsAt = round(plan.okAt + CALL_LEG);
    const chip = CHIP_IDS[index % CHIP_IDS.length];

    if (makeDepart < openAt - EPS) {
      problems.push(`request ${index + 1} starts making at ${plan.walkAt} before its scope opens`);
    }

    schedule(plan.depart, () => {
      rides.push({
        kind: 'call',
        from: Y_APP_BOTTOM,
        to: Y_CONTAINER_TOP,
        startAt: plan.depart,
        leg: CALL_LEG,
        markAt: plan.okAt,
        fadeAt: landsAt,
        halo: [arriveAt, plan.okAt],
      });
      if (chip) setAttr(plan.depart, chip, 'data-di-chip', 'live');
    });

    schedule(openAt, () => {
      stage(openAt, 'scope', 'open');
      if (index === SCOPE_SHOWN) cue(openAt, 'state');
    });

    schedule(makeDepart, () => {
      rides.push({
        kind: 'make',
        from: Y_CONTAINER_BOTTOM,
        to: Y_INSTANCES_TOP,
        startAt: makeDepart,
        leg: MAKE_LEG,
        markAt: null,
        fadeAt: plan.walkAt,
        halo: null,
      });
    });

    // The graph is walked one declared need at a time, and each need that is
    // reached is resolved under whatever its registration says its lifetime is.
    schedule(plan.walkAt, () => {
      stage(plan.walkAt, 'assembly', 'w1');
      cue(plan.walkAt, 'state');
    });
    schedule(round(plan.walkAt + MAKE_STEP), () => {
      stage(round(plan.walkAt + MAKE_STEP), 'assembly', 'w2');
    });
    schedule(round(plan.walkAt + 2 * MAKE_STEP), () => {
      stage(round(plan.walkAt + 2 * MAKE_STEP), 'assembly', 'w3');
    });

    /** Puts one instance in its lane, or hands back the one that already exists. */
    const resolve = (life: Lifetime, at: number): void => {
      const already = singleton;
      if (life === 'singleton' && already) {
        reuses += 1;
        setAttr(at, already.id, 'data-di-box', 'reused');
        setAttr(round(at + SETTLE_AFTER), already.id, 'data-di-box', 'live');
        return;
      }
      used[life] += 1;
      if (used[life] > LANE_SLOTS) {
        problems.push(`${at} the ${life} lane was asked for instance ${used[life]}, which the stage never drew`);
        return;
      }
      const made: Instance = {
        id: `${laneOfLife(life)}${used[life]}`,
        life,
        request: index,
        madeAt: at,
        disposedAt: Number.POSITIVE_INFINITY,
      };
      instances.push(made);
      if (life === 'singleton') singleton = made;
      setAttr(at, made.id, 'data-di-box', 'new');
      setAttr(round(at + SETTLE_AFTER), made.id, 'data-di-box', 'live');
    };

    schedule(plan.walkAt, () => resolve('singleton', plan.walkAt));
    schedule(round(plan.walkAt + MAKE_STEP), () => resolve('scoped', round(plan.walkAt + MAKE_STEP)));
    for (let n = 0; n < plan.transients; n += 1) {
      const at = round(plan.walkAt + (2 + n) * MAKE_STEP);
      schedule(at, () => resolve('transient', at));
    }

    const builtAt = round(plan.walkAt + (1 + plan.transients) * MAKE_STEP + BUILT_AFTER);
    schedule(builtAt, () => {
      stage(builtAt, 'assembly', 'built');
    });
    if (builtAt > plan.okAt + EPS) {
      problems.push(`request ${index + 1} answers at ${plan.okAt} before its graph is built at ${builtAt}`);
    }

    schedule(plan.okAt, () => cue(plan.okAt, 'success'));

    schedule(landsAt, () => {
      okValue += 1;
      if (okValue > OK_MAX) {
        problems.push(`${landsAt} the readout was asked for ok ${okValue}, which the stage never drew`);
      } else {
        stage(landsAt, 'ok', String(okValue));
      }
      if (chip) setAttr(landsAt, chip, 'data-di-chip', 'ok');
    });

    // Closing the scope releases everything the scope itself owns, newest
    // first. The singleton is not one of those: it belongs to the container.
    schedule(plan.closeAt, () => {
      stage(plan.closeAt, 'scope', 'closed');
      stage(plan.closeAt, 'assembly', 'idle');
      cue(plan.closeAt, 'success');
      const owned = instances
        .filter((made) => made.request === index && made.life !== 'singleton')
        .sort((left, right) => right.madeAt - left.madeAt);
      owned.forEach((made, n) => {
        const at = round(plan.closeAt + n * DISPOSE_STEP);
        made.disposedAt = at;
        setAttr(at, made.id, 'data-di-box', 'disposed');
      });
      disposeOrders.push(`scope ${index + 1} @${plan.closeAt}: ${owned.map((made) => made.id).join(' ')}`);
    });
  });

  // --- the container's own life --------------------------------------------

  schedule(SHUTDOWN_AT, () => {
    stage(SHUTDOWN_AT, 'dispose', 'run');
    cue(SHUTDOWN_AT, 'state');
    const held = instances
      .filter((made) => !Number.isFinite(made.disposedAt))
      .sort((left, right) => right.madeAt - left.madeAt);
    held.forEach((made, n) => {
      const at = round(SHUTDOWN_AT + SHUTDOWN_STEP + n * DISPOSE_STEP);
      made.disposedAt = at;
      setAttr(at, made.id, 'data-di-box', 'disposed');
      if (n === 0) cue(at, 'state');
    });
    disposeOrders.push(`shutdown @${SHUTDOWN_AT}: ${held.map((made) => made.id).join(' ')}`);
  });

  schedule(SHUTDOWN_DONE, () => {
    stage(SHUTDOWN_DONE, 'dispose', 'done');
    cue(SHUTDOWN_DONE, 'success');
  });

  schedule(SETTLE_AT, () => {
    stage(SETTLE_AT, 'settled', 'on');
    cue(SETTLE_AT, 'success');
  });

  drain();

  return finish({ raw, cueList, rides, instances, problems, disposeOrders, used, reuses, okValue });
}

// --- what the stage actually says, once the run has been audited ------------

interface RawRun {
  raw: AttrChange[];
  cueList: [number, SceneCue][];
  rides: Ride[];
  instances: Instance[];
  problems: string[];
  disposeOrders: string[];
  used: Record<Lifetime, number>;
  reuses: number;
  okValue: number;
}

function finish(run: RawRun): Simulation {
  const { raw, rides, instances, problems, disposeOrders } = run;

  // --- the no-ops taken out, and the same-instant ties collapsed -----------

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
  const changes: AttrChange[] = [];
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

  // --- the cues -------------------------------------------------------------

  const cues = run.cueList.slice().sort((left, right) => left[0] - right[0]);
  cues.forEach(([at], index) => {
    if (BOUNDARIES.some((edge) => Math.abs(at - edge) < BOUNDARY_GAP - EPS)) {
      problems.push(`a cue at ${at} sits on a step boundary`);
    }
    const previous = cues[index - 1]?.[0];
    if (previous !== undefined && at - previous < MIN_CUE_GAP - EPS) {
      problems.push(`cues at ${previous} and ${at} are on top of each other`);
    }
  });

  // --- the lifetime rules, checked against what the run produced -----------

  // A touch point is never lit on a wire the ghost has not drawn.
  for (const change of changes) {
    if (change.name !== 'data-di-ghost') continue;
    const ghost = change.value as Ghost;
    const wires = new Set(GHOST_WIRES[ghost]);
    for (const touch of GHOST_TOUCHES[ghost]) {
      if (!wires.has(touch)) problems.push(`${change.at} touch point ${touch} is lit with no wire under it`);
    }
  }

  // Building the container closes the registrations, so nothing about them
  // moves afterwards.
  for (const change of changes) {
    if (change.name === 'data-di-row' && change.at >= BUILD_AT - EPS) {
      problems.push(`${change.at} a registration changed after build`);
    }
  }

  const instantsOf = (id: string): [number, string][] =>
    changes
      .filter((change) => change.target === id && change.name === 'data-di-box')
      .map((change) => [change.at, change.value] as [number, string]);

  // A disposed instance never comes back, and no slot is ever made twice.
  for (const id of BOX_IDS) {
    const series = instantsOf(id);
    let seenDisposed = false;
    let makes = 0;
    for (const [at, value] of series) {
      if (value === 'disposed') seenDisposed = true;
      else if (seenDisposed) problems.push(`${at} ${id} came back after it was disposed`);
      if (value === 'new') makes += 1;
    }
    if (makes > 1) problems.push(`${id} was made ${makes} times`);
  }

  // The singleton lane never holds more than one live instance, and no lane is
  // ever asked for a slot the stage did not draw.
  const liveAt = (life: Lifetime, at: number): number =>
    instances.filter(
      (made) => made.life === life && made.madeAt <= at + EPS && made.disposedAt > at + EPS,
    ).length;
  const instants = [...new Set([0, ...changes.map((change) => change.at), ...BOUNDARIES, SCENE_DURATION])].sort(
    (left, right) => left - right,
  );
  for (const at of instants) {
    if (liveAt('singleton', at) > 1) problems.push(`${at} the singleton lane holds more than one instance`);
  }
  for (const life of LIFETIMES) {
    if (run.used[life] > LANE_SLOTS) problems.push(`the ${life} lane overflowed its ${LANE_SLOTS} slots`);
  }

  // A scoped instance lives exactly as long as the scope its request opened,
  // and a transient is never handed out twice.
  for (const made of instances) {
    const plan = REQUESTS[made.request];
    if (!plan) continue;
    const openAt = round(plan.depart + CALL_LEG + OPEN_AFTER);
    if (made.life === 'scoped') {
      if (made.madeAt < openAt - EPS) problems.push(`${made.id} was made before its scope opened`);
      if (made.disposedAt < plan.closeAt - EPS) problems.push(`${made.id} went before its scope closed`);
      const next = REQUESTS[made.request + 1];
      const nextOpen = next ? round(next.depart + CALL_LEG + OPEN_AFTER) : SCENE_DURATION;
      if (made.disposedAt > nextOpen + EPS) problems.push(`${made.id} outlived its scope`);
    }
    if (made.life === 'transient' && instantsOf(made.id).some(([, value]) => value === 'reused')) {
      problems.push(`${made.id} was reused, which a transient never is`);
    }
    if (made.life !== 'singleton' && !Number.isFinite(made.disposedAt)) {
      problems.push(`${made.id} was never released`);
    }
  }

  // Disposal runs in reverse order of creation, every time it runs.
  for (const line of disposeOrders) {
    const ids = line.slice(line.indexOf(':') + 1).trim().split(/\s+/).filter(Boolean);
    const made = ids.map((id) => instances.find((entry) => entry.id === id)?.madeAt ?? NaN);
    for (let n = 1; n < made.length; n += 1) {
      const before = made[n - 1];
      const now = made[n];
      if (before === undefined || now === undefined || !(before > now)) {
        problems.push(`disposal is out of order: ${line}`);
      }
    }
  }

  // --- the lanes ------------------------------------------------------------

  const endsOf = (ride: Ride): number[] =>
    ride.kind === 'call' ? [Y_APP_BOTTOM, Y_CONTAINER_TOP] : [Y_CONTAINER_BOTTOM, Y_INSTANCES_TOP];
  const goneAt = (ride: Ride): number => round(ride.fadeAt + FADE);
  const whereAt = (ride: Ride, at: number): number => {
    if (at <= ride.startAt) return ride.from;
    const down = Math.min(at, ride.startAt + ride.leg);
    const y = ride.from + ((ride.to - ride.from) * (down - ride.startAt)) / ride.leg;
    if (ride.markAt === null || at <= ride.markAt) return y;
    const up = Math.min(at, ride.markAt + ride.leg);
    return ride.to + ((ride.from - ride.to) * (up - ride.markAt)) / ride.leg;
  };

  for (const ride of rides) {
    const ends = endsOf(ride);
    if (!ends.includes(ride.from) || !ends.includes(ride.to)) {
      problems.push(`a ${ride.kind} leg at ${ride.startAt} does not end on a box edge`);
    }
    if (ride.startAt < 0 || goneAt(ride) > SCENE_DURATION) {
      problems.push(`a traveller runs off the end of the scene at ${ride.startAt}`);
    }
  }

  let closest = Infinity;
  let closestName = '';
  for (let a = 0; a < rides.length; a += 1) {
    for (let b = a + 1; b < rides.length; b += 1) {
      const left = rides[a];
      const right = rides[b];
      if (!left || !right) continue;
      const from = Math.max(left.startAt, right.startAt);
      const to = Math.min(goneAt(left), goneAt(right));
      if (to <= from) continue;
      for (let t = from; t <= to + EPS; t = round(t + 0.01)) {
        const apart = Math.abs(whereAt(left, t) - whereAt(right, t));
        if (apart < closest) {
          closest = apart;
          closestName = `${left.kind}@${left.startAt} and ${right.kind}@${right.startAt} at ${round(t)}`;
        }
      }
    }
  }
  if (closest < HALO - EPS) {
    problems.push(`two travellers come ${closest.toFixed(0)}px apart (${closestName})`);
  }

  // --- the boundaries and the closing frame --------------------------------

  for (const edge of BOUNDARIES) {
    for (const ride of rides) {
      if (ride.startAt < edge - EPS && goneAt(ride) > edge + EPS) {
        problems.push(`something is in flight on the boundary at ${edge}`);
      }
    }
    if (valueAt('stage', 'data-di-mark', edge) !== 'none') {
      problems.push(`a highlight is up on the boundary at ${edge}`);
    }
    if (valueAt('stage', 'data-di-scope', edge) !== 'closed') {
      problems.push(`a scope is open on the boundary at ${edge}`);
    }
    if (valueAt('stage', 'data-di-assembly', edge) !== 'idle') {
      problems.push(`a graph is half assembled on the boundary at ${edge}`);
    }
  }
  if (valueAt('stage', 'data-di-dispose', SCENE_DURATION) !== 'done') {
    problems.push('the scene does not end with the container released');
  }
  if (valueAt('stage', 'data-di-settled', SCENE_DURATION) !== 'on') {
    problems.push('the scene does not end settled');
  }
  if (valueAt('stage', 'data-di-build', SCENE_DURATION) !== 'on') {
    problems.push('the scene does not end with the registrations closed');
  }
  for (const made of instances) {
    if (valueAt(made.id, 'data-di-box', SCENE_DURATION) !== 'disposed') {
      problems.push(`${made.id} is still holding on at the end of the scene`);
    }
  }

  if (problems.length > 0) throw new Error(`${ID} scene: ${[...new Set(problems)].join('; ')}`);

  rides.sort((left, right) => left.startAt - right.startAt);
  instances.sort((left, right) => left.madeAt - right.madeAt);
  return {
    changes,
    cues,
    rides,
    instances,
    made: { ...run.used },
    reuses: run.reuses,
    disposeOrders,
    okTotal: run.okValue,
  };
}

// --- the timeline ----------------------------------------------------------

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);
  const sim = simulate();

  // The captions name the figures the model produced. Nothing here places them:
  // if the injection plan changes, this is what says the captions have stopped
  // describing the scene.
  if (sim.made.singleton !== 1) {
    throw new Error(`${ID} scene: the captions promise one singleton and the run made ${sim.made.singleton}`);
  }
  if (sim.made.scoped !== REQUESTS.length) {
    throw new Error(`${ID} scene: scoped should be one per request and the run made ${sim.made.scoped}`);
  }
  if (sim.made.transient <= sim.made.scoped) {
    throw new Error(`${ID} scene: the third step promises transient growing faster than scoped`);
  }
  if (sim.reuses < 2) {
    throw new Error(`${ID} scene: the third step promises one singleton answering more than one request`);
  }

  const targets = new Map<string, Element>();
  targets.set('stage', stage);
  for (const id of ROW_IDS) targets.set(id, q<SVGGElement>(stage, `.di-row--${id}`, ID));
  for (const id of CHIP_IDS) targets.set(id, q<SVGGElement>(stage, `.di-slot--${id}`, ID));
  for (const id of BOX_IDS) targets.set(id, q<SVGGElement>(stage, `.di-box--${id}`, ID));

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
    group.group.classList.add(`di-req--${ride.kind}`);

    parkRequest(group, X_LANE, ride.from);
    showRequest(tl, group, ride.startAt);
    tl.to(
      group.group,
      { y: ride.to, duration: ride.leg, ease: 'none', immediateRender: false },
      ride.startAt,
    );
    if (ride.markAt !== null) {
      markRequest(tl, group, 'ok', ride.markAt);
      tl.to(
        group.group,
        { y: ride.from, duration: ride.leg, ease: 'none', immediateRender: false },
        ride.markAt,
      );
    }
    if (ride.halo) haloRequest(tl, group, ride.halo[0], ride.halo[1], 0.12);
    hideRequest(tl, group, ride.fadeAt, FADE);
  });

  // --- sound ---------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels ---------------------------------------------------------

  // The stage is complete on the first frame: four classes nothing has wired
  // yet, three empty registration rows, no lifetimes declared, twenty-one empty
  // instance slots, a scope that has never opened and nothing in flight.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
