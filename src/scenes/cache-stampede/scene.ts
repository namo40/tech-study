import {
  BASE_VERSION,
  MINI_CIRCUMFERENCE,
  RPS_PER_DOT,
  RPS_WINDOW,
  SCENE_DURATION,
  TTL_CIRCUMFERENCE,
  X_LANE,
  Y_CACHE,
  Y_CLIENT,
  Y_ORIGIN,
} from './stage';
import type { Badge } from './stage';
import { q, qa } from '../shared/dom';
import {
  haloRequest,
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
 * Cache Stampede scene: a 24 second, four step timeline.
 *
 * Same two rules as the other scenes: every tween sits at an absolute position,
 * and every discrete change is a zero-duration tween on a `data-*` attribute
 * that GSAP reverts when the playhead moves back past it.
 *
 * Nothing the reader watches is placed by hand. The scene is told when the
 * clients send, how long an entry lives, when the demonstration cuts an entry's
 * life short, how long the origin takes to recompute one value on its own, and
 * when each of the four ideas is switched on. One pass over the whole 24 seconds
 * turns that into everything else.
 *
 * Whether a request hits is never authored: it asks the entry what it holds at
 * the instant it arrives. The stampede is not drawn either — it is what happens
 * when seven arrivals in a row find the entry gone and no single flight to stop
 * them, and the origin's own slowness is the reason it grows, because each
 * recomputation takes longer for every other one already running. The gauge
 * counts those recomputations, the latency readout is the gauge read as time,
 * the `× n` chip is how many of them were computing the same value, and the
 * version on the chip is how many times the entry has been filled. The lane is
 * a single track, so a value can only travel back up it once the last request
 * has come off it — which is why the crowd has to finish arriving before the
 * refill can set out.
 */

const ID = 'cache-stampede';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- how a traveller moves -------------------------------------------------

/** Seconds a request takes from the Clients box down to the Cache node. */
const LEG_UPPER = 0.85;
/** Seconds it takes from the Cache node down to the Origin box. */
const LEG_LOWER = 0.55;
/** How long a request takes to fade once it has been answered or absorbed. */
const FADE = 0.12;

// --- what the scene is told ------------------------------------------------

/** One stretch of client traffic: the same cadence, for one key. */
interface Window {
  from: number;
  to: number;
  key: 'hot' | 'missing';
}

/**
 * The gap between two requests on the lane. It is the one number the offered
 * rate is read off: four dots a second, ten requests a dot, `rps 40`.
 */
const GAP = 0.25;

/**
 * When the clients send. The quiet stretches are the scene's four closing
 * holds plus the pause the crowd leaves behind while the origin catches up.
 */
const WINDOWS: Window[] = [
  { from: 0.3, to: 4.3, key: 'hot' },
  { from: 6.02, to: 7.52, key: 'hot' },
  { from: 9.85, to: 10.85, key: 'hot' },
  { from: 12.55, to: 13.8, key: 'hot' },
  { from: 15.5, to: 16.75, key: 'hot' },
  { from: 20.9, to: 21.65, key: 'missing' },
  { from: 21.9, to: 22.65, key: 'hot' },
];

/** How long an entry lives when nothing cuts it short. */
const TTL_LENGTH = 11;

/**
 * The fill that happened before the scene opened. It is placed so the ring is
 * exactly three fifths of the way through its life on the first frame, which
 * is what makes the first expiry land at 6.6 without anybody writing 6.6 down.
 */
const PRIME_FILL = -4.4;

/**
 * Moments the demonstration cuts the current entry's life short so the same
 * expiry can be watched again. Each one is tied to the entry that was alive
 * when it was booked, so an entry replaced early takes its recreation with it.
 */
const RECREATE = [13, 22.2];

/** Seconds the origin needs to recompute one value with nothing else running. */
const RECOMPUTE_BASE = 0.55;
/** Seconds each recomputation already in progress adds to a new one. */
const RECOMPUTE_PER_LOAD = 0.55;

/** When request coalescing is switched on. */
const SINGLE_FLIGHT_AT = 12.4;

/** When the jitter chip lights, and the lives it gives its three keys. */
const JITTER_AT = 18.3;
const MINI_TTLS = [2.7, 3.6, 4.5];

/** When the early refresh chip lights, and the share of a life it fires at. */
const EARLY_AT = 18.6;
const EARLY_FRACTION = 0.45;

/** When the negative caching chip lights and the missing key starts arriving. */
const NEGATIVE_AT = 20.8;

/** How often a live ring makes a sound as it winds down. */
const RING_CUE_EVERY = 2;
/** One hit in this many raises a sound, so a steady stream is not a rattle. */
const HIT_CUE_EVERY = 4;
/** Same, for the reflections a cached "not found" answers. */
const MISSING_CUE_EVERY = 2;
/** The closing chord, once the replayed spike has left the gauge flat. */
const FINALE_AT = 23.8;

// --- what one pass over the scene produces --------------------------------

type TravellerKind = 'hit' | 'stale' | 'missing' | 'charge' | 'refresh' | 'fill';

interface Traveller {
  kind: TravellerKind;
  /** When it leaves, and the two y values it travels between. */
  start: number;
  from: number;
  to: number;
  /** Set on a request that carries on down to the origin. */
  onward?: number;
  /** Whether it wears a ring while it travels. */
  ringed: boolean;
}

interface RingSegment {
  at: number;
  until: number;
  from: number;
  to: number;
}

interface Series<T> {
  at: number;
  value: T;
}

interface Simulation {
  travellers: Traveller[];
  badge: Series<Badge>[];
  value: Series<number>[];
  dup: Series<number>[];
  load: Series<number>[];
  rps: Series<number>[];
  chips: Series<string>[];
  ring: RingSegment[];
  mini: RingSegment[];
  cues: [number, SceneCue][];
}

/** Every request the clients send, worked out from the windows and the gap. */
function launches(): { at: number; key: 'hot' | 'missing' }[] {
  const out: { at: number; key: 'hot' | 'missing' }[] = [];
  for (const window of WINDOWS) {
    for (let at = window.from; at <= window.to + 1e-9; at = round(at + GAP)) {
      out.push({ at: round(at), key: window.key });
    }
  }
  return out.sort((left, right) => left.at - right.at);
}

/**
 * Walks the whole scene in time order.
 *
 * The entry is one small piece of state — the version it holds, whether it is
 * still inside its life, and which fill it belongs to — and every request that
 * reaches the cache asks it what it has. The origin is another: a set of
 * recomputations in progress, each of which took longer to start because of the
 * ones already there.
 */
function simulate(): Simulation {
  const travellers: Traveller[] = [];
  const badge: Series<Badge>[] = [];
  const value: Series<number>[] = [];
  const dup: Series<number>[] = [];
  const load: Series<number>[] = [];
  const rps: Series<number>[] = [];
  const chips: Series<string>[] = [];
  const ring: RingSegment[] = [];
  const mini: RingSegment[] = [];
  const cues: [number, SceneCue][] = [];

  /** The entry the whole scene is about. */
  let version = BASE_VERSION;
  let filledAt = PRIME_FILL;
  let expiresAt = 0;
  let generation = 0;
  let live = true;
  let badgeState: Badge = 'fresh';
  /** The next recreation still looking for an entry to shorten. */
  let nextCut = 0;

  /** The origin: how many recomputations are running, and how many were waste. */
  let running = 0;
  let duplicates = 0;

  /** Whether the ideas are on, and whether a "not found" answer is cached. */
  let singleFlight = false;
  let negative = false;
  /** Set while one request is out on behalf of everybody else. */
  let inFlight = false;
  /** Set while an answer is already on its way back up the lane. */
  let delivering = false;

  /** The last instant the lower lane has a request coming down it. */
  let laneBusyUntil = 0;

  let hits = 0;
  let missingSeen = 0;

  const push = <T>(series: Series<T>[], at: number, next: T): void =>
    collapseAtInstant(series, { at: round(at), value: next }, () => 'value');

  const cue = (at: number, name: SceneCue): void => {
    if (at < 0 || at > SCENE_DURATION) return;
    cues.push([round(at), name]);
  };

  const { schedule, drain } = createScheduler();

  // --- the entry ----------------------------------------------------------

  /**
   * Expiry an entry filled at `at` reaches. A recreation only shortens the
   * entry that is alive when its turn comes, and is spent whether or not that
   * entry lives long enough to reach it, so an entry refreshed early carries
   * its recreation away with it instead of dying to the one before.
   */
  const lifeOf = (at: number): number => {
    const cut = RECREATE[nextCut];
    if (cut !== undefined && cut > at && cut < at + TTL_LENGTH) {
      nextCut += 1;
      return round(cut);
    }
    return round(at + TTL_LENGTH);
  };

  /** The ring the scene is currently drawing, closed when the entry changes. */
  let openRing: { from: number; span: number } | null = null;

  const closeRing = (until: number): void => {
    if (!openRing) return;
    const { from, span } = openRing;
    openRing = null;
    const visibleFrom = Math.max(from, 0);
    const visibleTo = Math.min(until, SCENE_DURATION);
    if (visibleTo <= visibleFrom) return;
    ring.push({
      at: round(visibleFrom),
      until: round(visibleTo),
      from: round(TTL_CIRCUMFERENCE * ((visibleFrom - from) / span)),
      to: round(TTL_CIRCUMFERENCE * ((visibleTo - from) / span)),
    });
    for (let tick = from + RING_CUE_EVERY; tick < until - 1e-9; tick += RING_CUE_EVERY) {
      cue(round(tick), 'state');
    }
  };

  const openRingAt = (from: number, span: number): void => {
    openRing = { from, span };
  };

  const setBadge = (at: number, next: Badge): void => {
    if (badgeState === next) return;
    badgeState = next;
    push(badge, at, next);
  };

  const expire = (at: number): void => {
    live = false;
    setBadge(at, 'expired');
    cue(at, 'trip');
  };

  const fill = (at: number): void => {
    // An entry replaced early takes the rest of its ring with it.
    closeRing(at);
    generation += 1;
    version += 1;
    live = true;
    filledAt = at;
    expiresAt = lifeOf(at);
    push(value, at, version);
    setBadge(at, 'fresh');
    openRingAt(at, expiresAt - at);
    const mine = generation;
    if (expiresAt <= SCENE_DURATION) {
      schedule(expiresAt, () => {
        if (generation === mine) {
          closeRing(expiresAt);
          expire(expiresAt);
        }
      });
    }
  };

  // --- the origin ---------------------------------------------------------

  /**
   * Starts one recomputation. Its duration is not a constant: every other one
   * already running adds to it, which is why a crowd makes itself slower.
   */
  const recompute = (at: number, onReady: (ready: number) => void): void => {
    const before = running;
    const duration = round(RECOMPUTE_BASE + RECOMPUTE_PER_LOAD * before);
    running += 1;
    duplicates += 1;
    push(load, at, running);
    push(dup, at, duplicates);
    const ready = round(at + duration);
    schedule(ready, () => {
      running -= 1;
      push(load, ready, running);
      if (running % 2 === 0) cue(ready, 'state');
      if (running === 0) {
        duplicates = 0;
        push(dup, ready, 0);
      }
      onReady(ready);
    });
  };

  /**
   * Sends the answer back up the lane. One lane means one direction at a time,
   * so a value waits for the last request still coming down before it sets out.
   */
  const deliver = (ready: number): void => {
    delivering = true;
    const tryDepart = (at: number): void => {
      // More of the crowd may have joined the lane since the last look, so the
      // answer keeps standing aside until the way up is genuinely clear.
      if (laneBusyUntil > at) {
        const next = round(laneBusyUntil);
        schedule(next, () => tryDepart(next));
        return;
      }
      const lands = round(at + LEG_LOWER);
      travellers.push({ kind: 'fill', start: at, from: Y_ORIGIN, to: Y_CACHE, ringed: false });
      schedule(lands, () => {
        inFlight = false;
        delivering = false;
        fill(lands);
        cue(lands, 'success');
      });
    };
    tryDepart(ready);
  };

  // --- the requests -------------------------------------------------------

  for (const launch of launches()) {
    const reaches = round(launch.at + LEG_UPPER);
    schedule(reaches, () => {
      if (launch.key === 'missing') {
        // The missing key is only ever asked for once the "not found" answer is
        // itself in the cache, so these reflect off it the way a hit does.
        missingSeen += 1;
        travellers.push({
          kind: 'missing',
          start: launch.at,
          from: Y_CLIENT,
          to: Y_CACHE,
          ringed: false,
        });
        if (negative && missingSeen % MISSING_CUE_EVERY === 0) cue(reaches, 'state');
        return;
      }
      if (live) {
        hits += 1;
        travellers.push({ kind: 'hit', start: launch.at, from: Y_CLIENT, to: Y_CACHE, ringed: false });
        if (hits % HIT_CUE_EVERY === 0) cue(reaches, 'success');
        return;
      }
      if (singleFlight && inFlight) {
        // Somebody is already fetching, so this one takes the old value now.
        setBadge(reaches, 'stale');
        travellers.push({ kind: 'stale', start: launch.at, from: Y_CLIENT, to: Y_CACHE, ringed: true });
        cue(reaches, 'state');
        return;
      }
      if (singleFlight) inFlight = true;
      const arrives = round(reaches + LEG_LOWER);
      laneBusyUntil = Math.max(laneBusyUntil, round(arrives + FADE));
      travellers.push({
        kind: 'charge',
        start: launch.at,
        from: Y_CLIENT,
        to: Y_CACHE,
        onward: Y_ORIGIN,
        ringed: !singleFlight,
      });
      const protectedRun = singleFlight;
      schedule(arrives, () => {
        if (!protectedRun) cue(arrives, 'failure');
        recompute(arrives, (ready) => {
          // Only the first value back fills the entry; the rest were waste.
          if (!delivering && filledAt < arrives) deliver(ready);
        });
      });
    });
  }

  // --- the four ideas -----------------------------------------------------

  schedule(SINGLE_FLIGHT_AT, () => {
    singleFlight = true;
    push(chips, SINGLE_FLIGHT_AT, 'sf');
    cue(SINGLE_FLIGHT_AT, 'trip');
  });

  schedule(JITTER_AT, () => {
    push(chips, JITTER_AT, 'jitter');
    cue(JITTER_AT, 'state');
    cue(JITTER_AT, 'trip');
    MINI_TTLS.forEach((span) => {
      const until = round(JITTER_AT + span);
      mini.push({ at: JITTER_AT, until, from: 0, to: round(MINI_CIRCUMFERENCE) });
      cue(until, 'state');
    });
  });

  schedule(EARLY_AT, () => {
    push(chips, EARLY_AT, 'early');
    cue(EARLY_AT, 'state');
    // The refresh leaves once the entry has burnt through its life but one
    // share of it, which is a fraction rather than a time: a longer entry waits.
    const departs = round(expiresAt - EARLY_FRACTION * (expiresAt - filledAt));
    if (departs <= EARLY_AT || departs > SCENE_DURATION) return;
    schedule(departs, () => {
      if (!live) return;
      inFlight = true;
      cue(departs, 'trip');
      const arrives = round(departs + LEG_LOWER);
      laneBusyUntil = Math.max(laneBusyUntil, round(arrives + FADE));
      travellers.push({ kind: 'refresh', start: departs, from: Y_CACHE, to: Y_ORIGIN, ringed: true });
      schedule(arrives, () => {
        recompute(arrives, (ready) => {
          if (!delivering) deliver(ready);
        });
      });
    });
  });

  schedule(NEGATIVE_AT, () => {
    negative = true;
    push(chips, NEGATIVE_AT, 'neg');
    cue(NEGATIVE_AT, 'state');
    cue(NEGATIVE_AT, 'trip');
  });

  // The entry the scene opens on was filled before the scene was.
  expiresAt = lifeOf(PRIME_FILL);
  openRingAt(PRIME_FILL, expiresAt - PRIME_FILL);
  const primeExpiry = expiresAt;
  schedule(primeExpiry, () => {
    if (generation === 0) {
      closeRing(primeExpiry);
      expire(primeExpiry);
    }
  });

  drain();
  // Whatever the entry was doing when the scene ran out, the ring keeps doing.
  closeRing(SCENE_DURATION);

  // --- the readouts that are counts of what already happened --------------

  const events: [number, number][] = [];
  for (const launch of launches()) {
    events.push([launch.at, 1]);
    events.push([round(launch.at + RPS_WINDOW), -1]);
  }
  events.sort((left, right) => left[0] - right[0]);
  let inWindow = 0;
  for (const [at, delta] of events) {
    inWindow += delta;
    if (at > SCENE_DURATION) break;
    push(rps, at, inWindow * RPS_PER_DOT);
  }

  cue(FINALE_AT, 'success');
  cues.sort((left, right) => left[0] - right[0]);
  return { travellers, badge, value, dup, load, rps, chips, ring, mini, cues };
}

// --- the timeline ----------------------------------------------------------

/** How long a leg between two of the three bands takes. */
const legOf = (from: number): number => (from === Y_CLIENT ? LEG_UPPER : LEG_LOWER);

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const requestLayer = q<SVGGElement>(stage, '.scene-requests', ID);
  const ttlProgress = q<SVGCircleElement>(stage, '.cst-ttl-progress', ID);
  const miniProgress = qa<SVGCircleElement>(stage, '.cst-mini-progress');

  const sim = simulate();
  const requests = mountRequests(requestLayer, sim.travellers.length, ID);

  const tl = createSceneTimeline();

  // --- the readouts, straight from the simulation -------------------------

  for (const entry of sim.badge) attr(tl, stage, 'data-badge', entry.value, entry.at);
  for (const entry of sim.value) attr(tl, stage, 'data-value', String(entry.value), entry.at);
  for (const entry of sim.dup) attr(tl, stage, 'data-dup', String(entry.value), entry.at);
  for (const entry of sim.load) attr(tl, stage, 'data-load', String(entry.value), entry.at);
  for (const entry of sim.rps) attr(tl, stage, 'data-rps', String(entry.value), entry.at);
  for (const entry of sim.chips) attr(tl, stage, `data-${entry.value}`, 'on', entry.at);

  // --- the rings, which are drawn rather than switched --------------------

  const sweep = (target: SVGCircleElement, segment: RingSegment): void => {
    tl.fromTo(
      target,
      { attr: { 'stroke-dashoffset': segment.from } },
      {
        attr: { 'stroke-dashoffset': segment.to },
        duration: Math.max(round(segment.until - segment.at), 0.01),
        ease: 'none',
        immediateRender: false,
      },
      segment.at,
    );
  };

  for (const segment of sim.ring) sweep(ttlProgress, segment);
  sim.mini.forEach((segment, index) => {
    const target = miniProgress[index];
    if (target) sweep(target, segment);
  });

  // --- the travellers -----------------------------------------------------

  sim.travellers.forEach((traveller, index) => {
    const parts = requests[index];
    if (!parts) return;
    parkRequest(parts, X_LANE, traveller.from);

    const firstLeg = legOf(traveller.from);
    const reaches = round(traveller.start + firstLeg);
    showRequest(tl, parts, traveller.start);
    moveRequest(tl, parts, traveller.to, firstLeg, traveller.start);

    if (traveller.onward === undefined) {
      markRequest(tl, parts, 'ok', reaches);
      if (traveller.ringed) haloRequest(tl, parts, traveller.start, reaches, FADE);
      hideRequest(tl, parts, reaches, FADE);
      return;
    }

    const secondLeg = legOf(traveller.to);
    const arrives = round(reaches + secondLeg);
    moveRequest(tl, parts, traveller.onward, secondLeg, reaches);
    markRequest(tl, parts, 'ok', arrives);
    if (traveller.ringed) haloRequest(tl, parts, reaches, arrives, FADE);
    hideRequest(tl, parts, arrives, FADE);
  });

  // --- sounds and step labels ---------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // The stage is complete on the first frame: one hot key holding v7, its ring
  // three fifths of the way through, and an origin nobody is asking anything.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
