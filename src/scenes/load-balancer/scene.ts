import {
  LANE_COUNT,
  METER_MAX,
  METER_W,
  SCENE_DURATION,
  SERVER_X,
  SHARES,
  STAGE_STATE,
  X_CLIENT,
  Y_CLIENT,
  Y_RAIL,
  Y_SERVER,
  laneX,
} from './stage';
import { q, qa } from '../shared/dom';
import { hideRequest, haloRequest, markRequest, mountRequests, parkRequest, showRequest } from '../shared/request';
import type { RequestParts, RequestResult } from '../shared/request';
import { collapseAtInstant, createScheduler } from '../shared/simulation';
import { attr, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Load Balancer scene: a 24 second, four step timeline.
 *
 * Same two rules as the other scenes: every tween sits at an absolute position,
 * and every discrete change is a zero-duration tween on a `data-*` attribute
 * that GSAP reverts when the playhead moves back past it.
 *
 * Nothing about the balancing is authored. Each request says only when it
 * leaves the client and whether it is one of the slow ones; each server says
 * only when it breaks, when it is repaired and when it joins. Everything the
 * reader counts falls out of one pass over the whole 24 seconds: which server
 * takes which request, which connection lane it stands in, how many connections
 * each server is holding, how far each meter has filled, which probe fails,
 * when a server leaves the rotation and comes back, and which requests come
 * back with a cross because they were routed to a server that had already
 * stopped answering.
 *
 * Two derived quantities are worth naming. A request is slower when it lands on
 * a server that is already holding connections, so the "slow" ones in step 2
 * are not marked by hand: they are the ones whose service time came out above
 * the base cost. And the balancer never sees a server break — it only sees the
 * probes fail — which is why the requests between the fault and the second
 * probe are the ones that fail.
 */

const ID = 'load-balancer';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- how a request moves --------------------------------------------------

/**
 * One speed for every leg of every journey, in pixels per second.
 *
 * A fixed speed rather than a fixed duration per leg is what keeps requests off
 * each other. Everything leaves the same point on the same lane, so two
 * requests that left `d` seconds apart stay `SPEED * d` apart for as long as
 * they are on the shared part of the route, whichever server each is bound for.
 * The cost is that a request bound for the far server arrives a little later
 * than one bound for the near server, which is true of the real thing as well.
 */
const SPEED = 2800;

/** Client to the rail, and rail to the server once the lane is known. */
const DROP_TO_RAIL = (Y_RAIL - Y_CLIENT) / SPEED;
const DROP_TO_SERVER = (Y_SERVER - Y_RAIL) / SPEED;

/** How long a result marker stays before the request goes. */
const FADE = 0.2;

// --- how long a server takes ----------------------------------------------

/** What an ordinary request costs, and what one of the slow ones costs. */
const WORK = 0.4;
const SLOW_WORK = 2.4;
/** What a server that has stopped answering costs before it gives up. */
const FAIL_WORK = 0.45;
/**
 * Contention: every connection a server is already holding makes the next one
 * this much slower. It is what turns "three slow requests on one server" into
 * something the reader can see happening rather than something asserted.
 */
const CONTENTION = 0.1;

// --- how the load meters move ---------------------------------------------

/**
 * A meter chases the share of its server's connection lanes that are in use.
 * It climbs quickly and falls slowly, so the reader can still read how busy a
 * server has been a moment after it went quiet, which is what makes the four
 * meters comparable at the end of the scene.
 */
const RATE_UP = 3;
const RATE_DOWN = 0.22;
/** Where a meter reads as busy, and where it reads as too full. */
const LOAD_BUSY = 0.5;
const LOAD_HOT = 0.85;

/** How long the lanes into the chosen server stay lit. */
const PICK_FLASH = 0.18;
/** How long a probe pulse is drawn around a health dot. */
const PROBE_FLASH = 0.2;
/** How long `in` stays up after a server rejoins the rotation. */
const REJOIN_FLASH = 1;

// --- what the scene is told -----------------------------------------------

interface RequestPlan {
  /** When the request leaves the client. */
  start: number;
  /** One of the expensive ones. Everything else costs `WORK`. */
  slow?: boolean;
}

const evenly = (from: number, gap: number, count: number, slow: number[] = []): RequestPlan[] =>
  Array.from({ length: count }, (_value, n) => ({
    start: round(from + gap * n),
    ...(slow.includes(n) ? { slow: true } : {}),
  }));

const REQUESTS: RequestPlan[] = [
  // Step 1: uniform work, and a rotation that has nothing to think about.
  ...evenly(0.4, 0.3, 15),
  // Step 2: every third request is an expensive one, and the rotation puts all
  // three of them on the same server because that is where the turn falls.
  ...evenly(6.2, 0.3, 8, [1, 4, 7]),
  // Step 2, after the switch: three expensive ones in a row, against a table
  // that already knows where the last three went.
  ...evenly(8.8, 0.4, 6, [0, 2, 4]),
  // Step 3: steady traffic across a fault, a pair of failed probes and a repair.
  ...evenly(12.2, 0.3, 17),
  // Step 4: three requests while the new server is still warming, then the ramp.
  ...evenly(18.2, 0.4, 3),
  ...evenly(19.6, 0.2, 16),
];

/** When the balancer stops taking turns and starts reading the table. */
const POLICY_AT = 8.6;

/** What happens to the servers themselves, away from any single request. */
interface ServerEvent {
  at: number;
  server: number;
  kind: 'break' | 'repair' | 'join';
}

const SERVER_EVENTS: ServerEvent[] = [
  { at: 12.4, server: 0, kind: 'break' },
  { at: 15.6, server: 0, kind: 'repair' },
  { at: 18.3, server: 3, kind: 'join' },
];

/** First probe of each server, and the interval every probe after it keeps. */
const PROBE_FIRST = [1, 1, 1, 18.5];
const PROBE_INTERVAL = 1;
/** Consecutive results that take a server out of the rotation, or put it back. */
const PROBE_THRESHOLD = 2;

/** The share of the traffic a warming server is given, and when each step lands. */
const SHARE_STEPS: [number, number][] = [
  [19.6, 1 / 8],
  [20.6, 1 / 6],
  [21.4, 1 / 5],
  [22.2, 1 / 4],
];
/** When the new server stops being treated as warming. */
const WARM_END = 22.9;

// --- what the simulation produces -----------------------------------------

interface Outcome {
  server: number;
  lane: number;
  /** When the balancer picks, which is when the request reaches the rail. */
  decideAt: number;
  arriveAt: number;
  resolveAt: number;
  fadeAt: number;
  result: RequestResult;
  /** True when contention made this request cost more than its base work. */
  slowed: boolean;
}

interface AttrChange {
  at: number;
  key: string;
  name: string;
  value: string;
}

interface Segment {
  from: number;
  to: number;
  vFrom: number;
  vTo: number;
}

interface Simulation {
  outcomes: Outcome[];
  attrs: AttrChange[];
  meters: Segment[][];
  cues: [number, SceneCue][];
}

// --- the load meters ------------------------------------------------------

interface Ramp {
  from: number;
  to: number;
  vFrom: number;
  vTo: number;
}

/**
 * One server's meter as a continuous piecewise line. The target is the share of
 * its lanes that are in use; the value walks towards it at one rate going up
 * and a slower one coming down. Returning the whole curve rather than a set of
 * key frames is what lets the meter be tweened without any frame being placed
 * by hand.
 */
function meterCurve(counts: readonly [number, number][], end: number): Ramp[] {
  const ramps: Ramp[] = [];
  let at = 0;
  let value = 0;

  const walk = (until: number, target: number): void => {
    while (at < until) {
      if (value === target) {
        ramps.push({ from: at, to: until, vFrom: value, vTo: value });
        at = until;
        return;
      }
      const up = value < target;
      const rate = up ? RATE_UP : RATE_DOWN;
      const reach = at + Math.abs(target - value) / rate;
      if (reach < until) {
        ramps.push({ from: at, to: reach, vFrom: value, vTo: target });
        at = reach;
        value = target;
      } else {
        const next = value + (up ? 1 : -1) * rate * (until - at);
        ramps.push({ from: at, to: until, vFrom: value, vTo: next });
        at = until;
        value = next;
      }
    }
  };

  for (let index = 0; index < counts.length; index += 1) {
    const entry = counts[index];
    if (!entry) continue;
    const next = counts[index + 1];
    const target = entry[1] / METER_MAX;
    walk(Math.min(next ? next[0] : end, end), target);
  }
  walk(end, 0);

  return ramps;
}

// --- the simulation -------------------------------------------------------

type Health = 'up' | 'recovering' | 'down';

interface ServerState {
  present: boolean;
  broken: boolean;
  /** What the balancer believes, which only the probes ever change. */
  health: Health;
  /** Whether the balancer is still sending it anything. */
  rotating: boolean;
  /** Consecutive probe results of the same kind, and what kind they were. */
  streak: number;
  streakOk: boolean;
  /** Which request is standing in each connection lane, or null. */
  lanes: (number | null)[];
  warming: boolean;
}

function simulate(): Simulation {
  const servers: ServerState[] = SERVER_X.map((_x, index) => ({
    present: index < SERVER_X.length - 1,
    broken: false,
    health: index < SERVER_X.length - 1 ? 'up' : 'down',
    rotating: index < SERVER_X.length - 1,
    streak: 0,
    streakOk: index < SERVER_X.length - 1,
    lanes: Array.from({ length: LANE_COUNT }, () => null),
    warming: false,
  }));

  const outcomes: Outcome[] = REQUESTS.map(() => ({
    server: 0,
    lane: 0,
    decideAt: 0,
    arriveAt: 0,
    resolveAt: 0,
    fadeAt: 0,
    result: 'ok' as RequestResult,
    slowed: false,
  }));

  const raw: AttrChange[] = [];
  const cues: [number, SceneCue][] = [];
  const counts: [number, number][][] = SERVER_X.map(() => [[0, 0]]);

  const setAttr = (at: number, key: string, name: string, value: string): void => {
    raw.push({ at: round(at), key, name, value });
  };
  const cue = (at: number, name: SceneCue): void => {
    cues.push([round(at), name]);
  };

  /** Connections a server is holding, which is what both readouts are drawn from. */
  const held = (index: number): number =>
    (servers[index]?.lanes ?? []).filter((value) => value !== null).length;

  const writeCount = (at: number, index: number): void => {
    const value = held(index);
    setAttr(at, `row-${index + 1}`, 'data-active', String(value));
    const series = counts[index];
    if (!series) return;
    const last = series[series.length - 1];
    if (last && last[0] === round(at)) last[1] = value;
    else series.push([round(at), value]);
  };

  const setHealth = (at: number, index: number, health: Health): void => {
    const server = servers[index];
    if (!server || server.health === health) return;
    server.health = health;
    setAttr(at, `server-${index + 1}`, 'data-health', health);
    cue(at, 'trip');
  };

  /**
   * Membership of the rotation, which is a slower thing than the health dot:
   * one bad probe colours the dot, but it takes `PROBE_THRESHOLD` of them in a
   * row to stop the balancer sending anything, and as many good ones to start
   * again. That gap is the whole of step 3.
   */
  const setRotating = (at: number, index: number, rotating: boolean): void => {
    const server = servers[index];
    if (!server || server.rotating === rotating) return;
    server.rotating = rotating;
    const key = `server-${index + 1}`;
    if (!rotating) {
      setAttr(at, key, 'data-verdict', 'unhealthy');
      setAttr(at, key, 'data-rotation', 'out');
      setAttr(at, `row-${index + 1}`, 'data-row', 'out');
      return;
    }
    setAttr(at, key, 'data-verdict', server.warming ? 'warm' : 'none');
    setAttr(at, key, 'data-rotation', 'in');
    setAttr(at + REJOIN_FLASH, key, 'data-rotation', 'none');
    setAttr(at, `row-${index + 1}`, 'data-row', 'in');
  };

  /** A server the balancer will consider: in the rotation, present, not full. */
  const eligible = (index: number): boolean => {
    const server = servers[index];
    return (
      server !== undefined && server.present && server.rotating && held(index) < LANE_COUNT
    );
  };

  const freeLane = (index: number): number => {
    const server = servers[index];
    if (!server) return 0;
    const lane = server.lanes.findIndex((value) => value === null);
    return lane < 0 ? 0 : lane;
  };

  const { schedule, drain } = createScheduler();

  let policy: 'round-robin' | 'least-connections' = 'round-robin';
  let cursor = 0;
  let share = 0;
  let credit = 0;

  /** The policy itself, over whichever servers the caller offers it. */
  const pick = (from: readonly number[]): number => {
    if (policy === 'round-robin') {
      for (let step = 0; step < SERVER_X.length; step += 1) {
        const candidate = (cursor + step) % SERVER_X.length;
        if (from.includes(candidate)) {
          cursor = (candidate + 1) % SERVER_X.length;
          return candidate;
        }
      }
      return from[0] ?? 0;
    }
    let best = from[0] ?? 0;
    let fewest = held(best);
    for (const candidate of from) {
      const value = held(candidate);
      if (value < fewest) {
        best = candidate;
        fewest = value;
      }
    }
    // Ties rotate, so an idle pair is not always read left to right.
    const tied = from.filter((n) => held(n) === fewest);
    if (tied.length > 1) {
      for (let step = 0; step < SERVER_X.length; step += 1) {
        const candidate = (cursor + step) % SERVER_X.length;
        if (tied.includes(candidate)) {
          best = candidate;
          break;
        }
      }
    }
    cursor = (best + 1) % SERVER_X.length;
    return best;
  };

  /**
   * Last resort, for the frame where nothing is in the rotation: a balancer
   * with no healthy destination still has to put the request somewhere, and it
   * puts it on whichever server has room. This scene never reaches it, but a
   * request with nowhere to stand would be a request drawn on top of another.
   */
  const spare = (): number => {
    const room = SERVER_X.map((_x, n) => n).filter(
      (n) => servers[n]?.present === true && held(n) < LANE_COUNT,
    );
    return room.length > 0 ? pick(room) : 0;
  };

  // --- the deployment itself ----------------------------------------------

  schedule(POLICY_AT, () => {
    policy = 'least-connections';
    setAttr(POLICY_AT, 'stage', 'data-policy', 'least-connections');
    cue(POLICY_AT, 'state');
  });

  for (const [at, value] of SHARE_STEPS) {
    schedule(at, () => {
      share = value;
      const label = SHARES[SHARE_STEPS.findIndex((step) => step[0] === at)] ?? '1/8';
      setAttr(at, 'stage', 'data-share', label);
      cue(at, 'state');
    });
  }

  schedule(WARM_END, () => {
    const server = servers[SERVER_X.length - 1];
    if (!server) return;
    server.warming = false;
    share = 0;
    setAttr(WARM_END, 'stage', 'data-share', 'off');
    if (server.rotating) setAttr(WARM_END, `server-${SERVER_X.length}`, 'data-verdict', 'none');
  });

  for (const event of SERVER_EVENTS) {
    schedule(event.at, () => {
      const server = servers[event.server];
      if (!server) return;
      const key = `server-${event.server + 1}`;
      if (event.kind === 'break') {
        server.broken = true;
        setAttr(event.at, key, 'data-server', 'broken');
        cue(event.at, 'trip');
        return;
      }
      if (event.kind === 'repair') {
        server.broken = false;
        setAttr(event.at, key, 'data-server', 'live');
        cue(event.at, 'trip');
        return;
      }
      server.present = true;
      server.warming = true;
      setAttr(event.at, 'stage', 'data-fourth', 'live');
      setAttr(event.at, key, 'data-server', 'live');
      setAttr(event.at, key, 'data-verdict', 'warm');
      cue(event.at, 'trip');
    });
  }

  // --- the probes ---------------------------------------------------------

  for (let index = 0; index < SERVER_X.length; index += 1) {
    const first = PROBE_FIRST[index] ?? PROBE_INTERVAL;
    for (let at = first; at < SCENE_DURATION; at = round(at + PROBE_INTERVAL)) {
      const when = at;
      schedule(when, () => {
        const server = servers[index];
        if (!server || !server.present) return;
        const ok = !server.broken;
        const key = `server-${index + 1}`;
        setAttr(when, key, 'data-probe', ok ? 'pass' : 'fail');
        setAttr(when + PROBE_FLASH, key, 'data-probe', 'off');
        if (server.streakOk === ok) server.streak += 1;
        else {
          server.streakOk = ok;
          server.streak = 1;
        }
        if (!ok) {
          if (server.streak >= PROBE_THRESHOLD) {
            setHealth(when, index, 'down');
            setRotating(when, index, false);
          } else {
            setHealth(when, index, 'recovering');
          }
          return;
        }
        if (server.streak >= PROBE_THRESHOLD) {
          setHealth(when, index, 'up');
          setRotating(when, index, true);
        } else if (!server.rotating) {
          setHealth(when, index, 'recovering');
        }
      });
    }
  }

  // --- one request at a time ----------------------------------------------

  REQUESTS.forEach((plan, index) => {
    const outcome = outcomes[index];
    if (!outcome) return;
    const decideAt = round(plan.start + DROP_TO_RAIL);
    outcome.decideAt = decideAt;

    schedule(decideAt, () => {
      // The balancer chooses when the request reaches it, so a server that
      // failed a probe a moment ago is already out of the running.
      const order = SERVER_X.map((_x, n) => n).filter((n) => eligible(n));
      const warm = SERVER_X.length - 1;
      const warming = servers[warm]?.warming === true && order.includes(warm);
      let chosen = order[0] ?? spare();

      if (warming) {
        // A warming server is given a share of the traffic rather than a turn:
        // the credit is what turns "one in eight" into whole requests.
        credit += share;
        const rest = order.filter((n) => n !== warm);
        if (credit >= 1) {
          credit -= 1;
          chosen = warm;
        } else if (rest.length > 0) {
          chosen = pick(rest);
        }
      } else if (order.length > 0) {
        chosen = pick(order);
      }

      const server = servers[chosen];
      if (!server) return;
      const lane = freeLane(chosen);
      server.lanes[lane] = index;
      outcome.server = chosen;
      outcome.lane = lane;

      const before = held(chosen) - 1;
      const base = server.broken ? FAIL_WORK : plan.slow === true ? SLOW_WORK : WORK;
      const work = round(base * (1 + CONTENTION * before));
      outcome.slowed = !server.broken && before >= LANE_COUNT - 1;
      outcome.result = server.broken ? 'fail' : 'ok';

      const across = Math.abs(laneX(chosen, lane) - X_CLIENT) / SPEED;
      outcome.arriveAt = round(decideAt + across + DROP_TO_SERVER);
      outcome.resolveAt = round(outcome.arriveAt + work);
      outcome.fadeAt = round(outcome.resolveAt + FADE);

      writeCount(decideAt, chosen);
      setAttr(decideAt, 'stage', 'data-pick', String(chosen + 1));
      setAttr(decideAt + PICK_FLASH, 'stage', 'data-pick', 'none');

      schedule(outcome.resolveAt, () => {
        cue(outcome.resolveAt, outcome.result === 'ok' ? 'success' : 'failure');
      });
      schedule(outcome.fadeAt, () => {
        const holder = servers[chosen];
        if (holder) holder.lanes[lane] = null;
        writeCount(outcome.fadeAt, chosen);
      });
    });
  });

  drain();

  // --- the meters, once every connection is known -------------------------

  const meters: Segment[][] = [];
  for (let index = 0; index < SERVER_X.length; index += 1) {
    const series = counts[index] ?? [[0, 0]];
    series.sort((left, right) => left[0] - right[0]);
    const ramps = meterCurve(series, SCENE_DURATION);
    const segments: Segment[] = [];
    let level = 'calm';
    for (const ramp of ramps) {
      segments.push({
        from: round(ramp.from),
        to: round(ramp.to),
        vFrom: round(ramp.vFrom * METER_W),
        vTo: round(ramp.vTo * METER_W),
      });
      // The border reads off the same curve as the bar, so the two can never
      // disagree about how full a server is.
      const bandOf = (value: number): string =>
        value >= LOAD_HOT ? 'hot' : value >= LOAD_BUSY ? 'busy' : 'calm';
      if (bandOf(ramp.vFrom) !== level) {
        level = bandOf(ramp.vFrom);
        setAttr(ramp.from, `server-${index + 1}`, 'data-load', level);
      }
      if (bandOf(ramp.vTo) !== level) {
        const target = bandOf(ramp.vTo);
        const edge = target === 'hot' || level === 'hot' ? LOAD_HOT : LOAD_BUSY;
        const span = ramp.to - ramp.from;
        const crossing =
          ramp.vTo === ramp.vFrom
            ? ramp.to
            : ramp.from + (span * (edge - ramp.vFrom)) / (ramp.vTo - ramp.vFrom);
        level = target;
        setAttr(crossing, `server-${index + 1}`, 'data-load', level);
      }
    }
    meters.push(segments);
  }

  // --- put the discrete changes in time order -----------------------------

  const inTimeOrder = raw
    .map((entry, order) => ({ entry, order }))
    .sort((left, right) => left.entry.at - right.entry.at || left.order - right.order)
    .map(({ entry }) => entry);

  const folded: AttrChange[] = [];
  for (const entry of inTimeOrder) {
    collapseAtInstant(folded, entry, (change) => `${change.key}@${change.name}`);
  }

  const seen = new Map<string, string>(Object.entries(STAGE_STATE));
  const attrs: AttrChange[] = [];
  for (const change of folded) {
    const id = `${change.key}@${change.name}`;
    if (seen.get(id) === change.value) continue;
    seen.set(id, change.value);
    attrs.push(change);
  }

  cues.sort((left, right) => left[0] - right[0]);

  return { outcomes, attrs, meters, cues };
}

// --- the timeline ---------------------------------------------------------

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const targets: Record<string, Element> = { stage };
  for (let index = 1; index <= SERVER_X.length; index += 1) {
    targets[`server-${index}`] = q<SVGGElement>(stage, `.lb-server--${index}`, ID);
    targets[`row-${index}`] = q<SVGGElement>(stage, `.lb-row--${index}`, ID);
  }
  const fills = qa<SVGRectElement>(stage, '.lb-meter-fill');
  const layer = q<SVGGElement>(stage, '.scene-requests', ID);

  const sim = simulate();
  const requests = mountRequests(layer, REQUESTS.length, ID);

  const tl = createSceneTimeline();

  // --- discrete state -----------------------------------------------------

  for (const change of sim.attrs) {
    const element = targets[change.key];
    if (!element) continue;
    attr(tl, element, change.name, change.value, change.at);
  }

  // --- the load meters ----------------------------------------------------

  sim.meters.forEach((segments, index) => {
    const element = fills[index];
    if (!element) return;
    for (const segment of segments) {
      if (segment.to <= segment.from || segment.vFrom === segment.vTo) continue;
      tl.fromTo(
        element,
        { attr: { width: segment.vFrom } },
        {
          attr: { width: segment.vTo },
          duration: segment.to - segment.from,
          ease: 'none',
          immediateRender: false,
        },
        segment.from,
      );
    }
  });

  // --- requests -----------------------------------------------------------

  const move = (
    parts: RequestParts,
    vars: gsap.TweenVars,
    duration: number,
    at: number,
  ): void => {
    tl.to(parts.group, { ...vars, duration, ease: 'none', immediateRender: false }, at);
  };

  REQUESTS.forEach((plan, index) => {
    const parts = requests[index];
    const outcome = sim.outcomes[index];
    if (!parts || !outcome) return;

    const lane = laneX(outcome.server, outcome.lane);
    const across = Math.abs(lane - X_CLIENT) / SPEED;
    parkRequest(parts, X_CLIENT, Y_CLIENT);

    showRequest(tl, parts, plan.start);
    move(parts, { y: Y_RAIL }, DROP_TO_RAIL, plan.start);
    move(parts, { x: lane }, across, outcome.decideAt);
    move(parts, { y: Y_SERVER }, DROP_TO_SERVER, round(outcome.decideAt + across));

    // A request that took longer than its base cost is ringed from the moment
    // it reaches the server it had to share.
    if (outcome.slowed) haloRequest(tl, parts, outcome.arriveAt, outcome.resolveAt, FADE);

    markRequest(tl, parts, outcome.result, outcome.resolveAt);
    hideRequest(tl, parts, outcome.resolveAt, FADE);
  });

  // --- sound --------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels --------------------------------------------------------

  // The stage is complete on the first frame: three servers in the rotation
  // with empty meters, a fourth still an outline, and the rotation on turns.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
