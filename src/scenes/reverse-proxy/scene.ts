import {
  SCENE_DURATION,
  SLOTS,
  X_API,
  X_APP,
  X_CLIENT,
  Y_BACKEND,
  Y_CLIENT,
  Y_PROXY_BOTTOM,
  Y_PROXY_TOP,
} from './stage';
import type { Route, Slot } from './stage';
import { q, qa } from '../shared/dom';
import {
  hideRequest,
  markRequest,
  mountRequests,
  moveRequest,
  parkRequest,
  showRequest,
} from '../shared/request';
import { collapseAtInstant, createScheduler } from '../shared/simulation';
import { attr, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Reverse Proxy scene: a 24 second, four step timeline.
 *
 * Same two rules as the other scenes: every tween sits at an absolute position,
 * and every discrete change is a zero-duration tween on a `data-*` attribute
 * that GSAP reverts when the playhead moves back past it.
 *
 * Nothing the reader watches is placed by hand. The scene is told when each
 * client request leaves and what path it asks for, when the seat takes on each
 * piece of boundary work, when `a1` stops answering and when it comes back, and
 * how often the proxy probes. One pass over the whole 24 seconds turns that
 * into everything else: which row of the route card lights, which instance the
 * work goes to, what colour each health dot is, which requests the limiter
 * trims, and where every sound falls.
 *
 * Three derivations carry the scene. The route is a lookup, not a script: the
 * path is matched against the card and the row that matched is the row that
 * lights. The instance is whatever the proxy's own probe view says is up, which
 * is why the reader can watch `a1` die at one instant and the routing change at
 * a later one — the gap between them is the probe interval, not a number the
 * scene was given. And the limiter is a bucket of three tokens refilling one
 * every 1.2 seconds, so which requests of the burst survive is arithmetic that
 * happens at the door.
 */

const ID = 'reverse-proxy';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- how a traveller moves -------------------------------------------------

/** Seconds a hop takes between Clients and the proxy, and between the proxy
    and a service. Both are the same speed; the lanes differ in length. */
const OUT_LEG = 0.3;
const IN_LEG = 0.32;
/** Seconds the seat spends matching a route before the inner hop leaves. */
const ROUTE_WORK = 0.1;
/** Seconds a service spends on the request before it answers. */
const SERVE = 0.16;
/** Seconds the seat spends handing the answer back out. */
const RESP_WORK = 0.08;
/** How long a traveller takes to fade once it is absorbed or answered. */
const FADE = 0.08;

// --- what the scene is told ------------------------------------------------

type Path = Route;

interface Ask {
  /** When the request leaves Clients. */
  at: number;
  /** What it asks for, which is what the route card is matched against. */
  path: Path;
  /** Whether it carries a token. Only matters once `auth` is on the seat. */
  token: boolean;
}

/**
 * The traffic, and nothing else about it. Every request is one line: when it
 * left, what it asked for, and whether it brought a token.
 */
const ASKS: Ask[] = [
  { at: 0.5, path: 'app', token: true },
  { at: 2.9, path: 'api', token: true },
  { at: 7.0, path: 'app', token: true },
  { at: 9.8, path: 'app', token: true },
  { at: 13.6, path: 'app', token: true },
  { at: 16.1, path: 'app', token: true },
  { at: 18.6, path: 'app', token: false },
  { at: 19.9, path: 'api', token: true },
  { at: 20.1, path: 'app', token: true },
  { at: 20.3, path: 'app', token: true },
  { at: 20.5, path: 'api', token: true },
  { at: 20.7, path: 'app', token: true },
  { at: 21.95, path: 'reports', token: true },
];

/** When the seat takes each piece of work on, and when a label earns its place. */
const TLS_AT = 6.4;
const HTTPS_AT = 6.8;
const HTTP_AT = 7.6;
const XFF_AT = 8.2;
const AUTH_AT = 18.4;
const LIMIT_AT = 19.8;
const THIRD_ROUTE_AT = 21.1;

/** The window the two `private` badges are held up in. */
const PRIVATE_FROM = 4.8;
const PRIVATE_TO = 5.4;

/** How long a refusal stays on the door once it has been written there. */
const REJECT_HOLD = 0.7;

/** The two unkind moments: `a1` stops answering, and `a1` comes back. */
const CRASH = 12.5;
const RECOVER = 15.5;

/** How often the seat looks at its backends, and when the first look happens. */
const PROBE_EVERY = 0.6;
const PROBE_PHASE = 0.4;

/**
 * The limiter: a bucket this deep, refilling one token this often. Two is not
 * a decoration. A service lane can only carry one request at a time without
 * two of them travelling through each other, so a seat that admits more of a
 * burst than its lanes can hold is not drawing what it claims to be drawing.
 */
const BUCKET = 2;
const REFILL_EVERY = 1.2;

/**
 * How close two sounds of the same origin may fall. A burst is meant to read as
 * one event rather than a rattle, so a run of round trips landing together
 * sounds once, and so does a run of refusals.
 */
const SUCCESS_GAP = 0.35;
const ROUTE_CUE_GAP = 0.5;
const BLOCK_CUE_GAP = 0.5;

// --- what one pass over the scene produces --------------------------------

/** A client hop is absorbed by the seat, refused at the door, or trimmed there. */
type Ending = 'absorbed' | 'refused' | 'trimmed' | 'answered';

interface Traveller {
  kind: 'down' | 'inner' | 'up';
  lane: number;
  start: number;
  ending: Ending;
}

interface Series<T> {
  at: number;
  value: T;
}

interface Span {
  from: number;
  to: number;
  route: Route;
}

interface Simulation {
  travellers: Traveller[];
  route: Series<string>[];
  flags: Record<string, Series<string>[]>;
  slotState: Record<Slot, Series<string>[]>;
  slotHealth: Record<Slot, Series<string>[]>;
  probeHealth: Record<Slot, Series<string>[]>;
  cues: [number, SceneCue][];
  /** Reported rather than drawn: what the door let through and what it did not. */
  passed: number;
  refused: number;
  trimmed: number;
}

/** Which lane a matched route sends the inner hop down. */
const laneOf = (route: Route): number => (route === 'app' ? X_APP : X_API);

/**
 * Walks the whole scene in time order.
 *
 * The seat holds three small pieces of state: the route card, what its last
 * probe said about each instance, and how many tokens are left in the bucket.
 * Every request that reaches the door asks all three, in the order a real proxy
 * would ask them — is this caller allowed in, is there room for it, and where
 * does this path go — and the answers are the only thing that decides what the
 * reader sees.
 */
function simulate(): Simulation {
  const travellers: Traveller[] = [];
  const spans: Span[] = [];
  const flags: Record<string, Series<string>[]> = {
    routes: [],
    tls: [],
    https: [],
    http: [],
    xff: [],
    auth: [],
    quota: [],
    refuse: [],
    private: [],
  };
  const slotState: Record<Slot, Series<string>[]> = { a1: [], a2: [] };
  const slotHealth: Record<Slot, Series<string>[]> = { a1: [], a2: [] };
  const probeHealth: Record<Slot, Series<string>[]> = { a1: [], a2: [] };
  const cues: [number, SceneCue][] = [];

  /** Reality, and what the seat currently believes about it. */
  const live: Record<Slot, boolean> = { a1: true, a2: true };
  const seen: Record<Slot, boolean> = { a1: true, a2: true };
  /** How many requests each instance is holding, so two do not fight over a row. */
  const busy: Record<Slot, number> = { a1: 0, a2: 0 };

  /** The bucket, and the instant it was last drawn from. */
  let tokens = BUCKET;
  let bucketAt = LIMIT_AT;

  let passed = 0;
  let refused = 0;
  let trimmed = 0;

  const push = <T>(series: Series<T>[], at: number, next: T): void =>
    collapseAtInstant(series, { at: round(at), value: next }, () => 'value');

  const cue = (at: number, name: SceneCue): void => {
    if (at < 0 || at > SCENE_DURATION) return;
    cues.push([round(at), name]);
  };

  /** The last time a sound of each kind that can arrive in a run was raised. */
  let lastSuccess = -99;
  let lastRouteCue = -99;
  let lastBlockCue = -99;

  const successCue = (at: number): void => {
    if (at - lastSuccess < SUCCESS_GAP) return;
    lastSuccess = at;
    cue(at, 'success');
  };

  const { schedule, drain } = createScheduler();

  // --- the seat's view of its backends ------------------------------------

  /** Every probe the seat makes, whether or not it learns anything from one. */
  for (let at = PROBE_PHASE; at <= SCENE_DURATION; at = round(at + PROBE_EVERY)) {
    const when = at;
    schedule(when, () => {
      for (const slot of SLOTS) {
        if (seen[slot] === live[slot]) continue;
        seen[slot] = live[slot];
        push(probeHealth[slot], when, live[slot] ? 'up' : 'down');
        cue(when, 'state');
      }
    });
  }

  // --- one request, from the door inwards ---------------------------------

  const takeToken = (at: number): boolean => {
    tokens = Math.min(BUCKET, tokens + (at - bucketAt) / REFILL_EVERY);
    bucketAt = at;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };

  /** The instance the seat hands `/app` to: the first one its probes call up. */
  const pick = (): Slot | null => SLOTS.find((slot) => seen[slot]) ?? null;

  const setSlot = (slot: Slot, at: number, value: string): void =>
    push(slotState[slot], at, value);

  function arrive(ask: Ask, at: number): void {
    // 1. The caller. `auth` refuses a request that brought no token, at the door.
    if (flagOn('auth', at) && !ask.token) {
      refused += 1;
      travellers.push({ kind: 'down', lane: X_CLIENT, start: ask.at, ending: 'refused' });
      push(flags.refuse, at, 'on');
      push(flags.refuse, Math.min(at + REJECT_HOLD, SCENE_DURATION), 'off');
      cue(at, 'failure');
      return;
    }

    // 2. The load. Over the limit is trimmed at the door too, but quietly.
    if (flagOn('quota', at) && !takeToken(at)) {
      trimmed += 1;
      travellers.push({ kind: 'down', lane: X_CLIENT, start: ask.at, ending: 'trimmed' });
      if (at - lastBlockCue >= BLOCK_CUE_GAP) {
        lastBlockCue = at;
        cue(at, 'state');
      }
      return;
    }

    // 3. The path. The row that matches is the row that lights, and the lane it
    //    names is the lane the inner hop goes down.
    passed += 1;
    travellers.push({ kind: 'down', lane: X_CLIENT, start: ask.at, ending: 'absorbed' });

    const lane = laneOf(ask.path);
    const innerFrom = round(at + ROUTE_WORK);
    const reaches = round(innerFrom + IN_LEG);
    const answers = round(reaches + SERVE);
    const backAt = round(answers + IN_LEG);
    const outFrom = round(backAt + RESP_WORK);
    const home = round(outFrom + OUT_LEG);

    spans.push({ from: at, to: reaches, route: ask.path });
    travellers.push({ kind: 'inner', lane, start: innerFrom, ending: 'answered' });
    travellers.push({ kind: 'up', lane: X_CLIENT, start: outFrom, ending: 'answered' });

    // The instance is chosen here, and says so for as long as it holds the work.
    const slot = ask.path === 'app' ? pick() : null;
    if (slot) {
      busy[slot] += 1;
      if (busy[slot] === 1) setSlot(slot, at, 'serving');
      schedule(backAt, () => {
        busy[slot] -= 1;
        if (busy[slot] === 0) setSlot(slot, backAt, live[slot] ? 'idle' : 'down');
      });
    }

    schedule(home, () => successCue(home));
  }

  /** Whether a flag the scene switches on once is on at `at`. */
  function flagOn(name: string, at: number): boolean {
    const series = flags[name] ?? [];
    let value = 'off';
    for (const entry of series) {
      if (entry.at > at) break;
      value = String(entry.value);
    }
    return value === 'on';
  }

  // --- the schedule the scene is given ------------------------------------

  schedule(TLS_AT, () => {
    push(flags.tls, TLS_AT, 'on');
    cue(TLS_AT, 'trip');
  });
  schedule(HTTPS_AT, () => push(flags.https, HTTPS_AT, 'on'));
  schedule(HTTP_AT, () => {
    push(flags.http, HTTP_AT, 'on');
    cue(HTTP_AT, 'state');
  });
  schedule(XFF_AT, () => {
    push(flags.xff, XFF_AT, 'on');
    cue(XFF_AT, 'state');
  });
  schedule(AUTH_AT, () => {
    push(flags.auth, AUTH_AT, 'on');
    cue(AUTH_AT, 'trip');
  });
  schedule(LIMIT_AT, () => {
    push(flags.quota, LIMIT_AT, 'on');
    bucketAt = LIMIT_AT;
    tokens = BUCKET;
    cue(LIMIT_AT, 'trip');
  });
  schedule(THIRD_ROUTE_AT, () => {
    push(flags.routes, THIRD_ROUTE_AT, '3');
    cue(THIRD_ROUTE_AT, 'state');
  });

  schedule(PRIVATE_FROM, () => {
    push(flags.private, PRIVATE_FROM, 'pulse');
    cue(PRIVATE_FROM, 'state');
  });
  schedule(PRIVATE_TO, () => push(flags.private, PRIVATE_TO, 'on'));

  schedule(CRASH, () => {
    live.a1 = false;
    push(slotHealth.a1, CRASH, 'down');
    setSlot('a1', CRASH, 'down');
    cue(CRASH, 'failure');
  });

  schedule(RECOVER, () => {
    live.a1 = true;
    push(slotHealth.a1, RECOVER, 'up');
    setSlot('a1', RECOVER, busy.a1 > 0 ? 'serving' : 'idle');
  });

  for (const ask of ASKS) {
    const at = round(ask.at + OUT_LEG);
    schedule(at, () => arrive(ask, at));
  }

  drain();

  // --- the row that is lit -------------------------------------------------

  /**
   * Several requests can be in the router at once, and only one row can be lit,
   * so the lit row is the one the most recent arrival matched, for as long as
   * that request is still on its way in. When the last of them has reached its
   * service, the card goes quiet again.
   */
  const route: Series<string>[] = [];
  const marks = [
    ...spans.map((span, index) => ({ at: span.from, open: true, index })),
    ...spans.map((span, index) => ({ at: span.to, open: false, index })),
  ].sort((left, right) => left.at - right.at || Number(left.open) - Number(right.open));

  const open: number[] = [];
  let shown = 'none';
  let lastRow = 'none';
  for (const mark of marks) {
    if (mark.open) open.push(mark.index);
    else {
      const where = open.indexOf(mark.index);
      if (where >= 0) open.splice(where, 1);
    }
    const top = open[open.length - 1];
    const next = top === undefined ? 'none' : (spans[top]?.route ?? 'none');
    if (next === shown) continue;
    shown = next;
    push(route, mark.at, next);
    if (next === 'none' || next === lastRow) continue;
    lastRow = next;
    if (mark.at - lastRouteCue < ROUTE_CUE_GAP) continue;
    lastRouteCue = mark.at;
    cue(mark.at, 'state');
  }

  cues.sort((left, right) => left[0] - right[0]);

  return {
    travellers,
    route,
    flags,
    slotState,
    slotHealth,
    probeHealth,
    cues,
    passed,
    refused,
    trimmed,
  };
}

// --- the timeline ----------------------------------------------------------

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const requestLayer = q<SVGGElement>(stage, '.scene-requests', ID);

  const sim = simulate();
  const requests = mountRequests(requestLayer, sim.travellers.length, ID);

  const tl = createSceneTimeline();

  // --- everything the stage says about itself -----------------------------

  for (const entry of sim.route) attr(tl, stage, 'data-picked', entry.value, entry.at);
  for (const [name, series] of Object.entries(sim.flags)) {
    for (const entry of series) attr(tl, stage, `data-${name}`, entry.value, entry.at);
  }
  // The two instance rows and the two probe rows are written in `SLOTS` order,
  // so the row an index names is the instance the simulation named.
  const rows = qa<SVGGElement>(stage, '.rvp-inst');
  const probes = qa<SVGGElement>(stage, '.rvp-probe');
  SLOTS.forEach((slot, index) => {
    const row = rows[index];
    if (row) {
      for (const entry of sim.slotState[slot]) attr(tl, row, 'data-inst', entry.value, entry.at);
      const dots = qa(row, 'circle');
      for (const entry of sim.slotHealth[slot]) {
        attr(tl, dots, 'data-health-state', entry.value, entry.at);
      }
    }
    const probe = probes[index];
    if (!probe) return;
    const eyes = qa(probe, 'circle');
    for (const entry of sim.probeHealth[slot]) {
      attr(tl, eyes, 'data-health-state', entry.value, entry.at);
    }
  });

  // --- the travellers -----------------------------------------------------

  sim.travellers.forEach((traveller, index) => {
    const parts = requests[index];
    if (!parts) return;

    if (traveller.kind === 'inner') {
      const reaches = round(traveller.start + IN_LEG);
      const answers = round(reaches + SERVE);
      const home = round(answers + IN_LEG);
      parkRequest(parts, traveller.lane, Y_PROXY_BOTTOM);
      showRequest(tl, parts, traveller.start);
      moveRequest(tl, parts, Y_BACKEND, IN_LEG, traveller.start);
      markRequest(tl, parts, 'ok', answers);
      moveRequest(tl, parts, Y_PROXY_BOTTOM, IN_LEG, answers);
      hideRequest(tl, parts, home, FADE);
      return;
    }

    if (traveller.kind === 'up') {
      const home = round(traveller.start + OUT_LEG);
      parkRequest(parts, X_CLIENT, Y_PROXY_TOP);
      showRequest(tl, parts, traveller.start);
      moveRequest(tl, parts, Y_CLIENT, OUT_LEG, traveller.start);
      markRequest(tl, parts, 'ok', home);
      hideRequest(tl, parts, home, FADE);
      return;
    }

    // A client hop. It always reaches the door; what happens there differs.
    const door = round(traveller.start + OUT_LEG);
    parkRequest(parts, X_CLIENT, Y_CLIENT);
    showRequest(tl, parts, traveller.start);
    moveRequest(tl, parts, Y_PROXY_TOP, OUT_LEG, traveller.start);

    if (traveller.ending === 'absorbed') {
      hideRequest(tl, parts, door, FADE);
      return;
    }

    markRequest(tl, parts, 'fail', door);
    if (traveller.ending === 'trimmed') {
      // Over the limit: the door closes on it and it never enters the system.
      hideRequest(tl, parts, door, FADE);
      return;
    }
    // Refused: the answer the client gets is the refusal, and it travels back.
    const back = round(door + OUT_LEG);
    moveRequest(tl, parts, Y_CLIENT, OUT_LEG, door);
    hideRequest(tl, parts, back, FADE);
  });

  // --- sounds and step labels ---------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // The stage is complete on the first frame: a seat with two routes on its
  // card, two healthy instances behind it, and no boundary work taken on yet.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
