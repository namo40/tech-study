import gsap from 'gsap';
import {
  ACCEPTS,
  CALLER_IDS,
  KEY_IDS,
  MAX_DENIED,
  MAX_OK,
  SCENE_DURATION,
  STAGE_STATE,
  X_CALL_1,
  X_CALL_2,
  X_KEYS,
  Y_CALLERS_BOTTOM,
  Y_KEYS_TOP,
  Y_SERVICE_BOTTOM,
  Y_SERVICE_TOP,
} from './stage';
import type { CallerId, KeyId, Mark } from './stage';
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
 * Key Rotation scene: a 24 second, four step timeline.
 *
 * The same two rules as every other scene: every tween sits at an absolute
 * position, and every discrete change is a zero-duration tween on a `data-*`
 * attribute that GSAP reverts when the playhead moves back past it. Nothing on
 * this stage is a continuous quantity, so nothing here is a width or an angle: a
 * key is issued or it is not, a set holds a key or it does not.
 *
 * Nothing the reader counts is authored. The scene is told six things: when each
 * key of the series is cut and when it stops being taken, when a copy of one got
 * loose, when each caller's deploy swaps the key it presents, when the world
 * without rotation is held up and dropped, when a call lands and what it carries,
 * and how deep the verifier's ring is.
 *
 * Everything else falls out of one pass. The accepted set is every key that has
 * been issued and not yet revoked; a call carrying a key passes exactly when that
 * key is in the set at the instant it arrives, and a call carrying a token passes
 * exactly when the key its `kid` names is still in the ring; `ok` and `denied`
 * are the counts of those two answers; the overlap windows are the gaps between
 * one key being issued and the previous one being revoked; and the emergency
 * window is the last of those gaps. The leaked key is not scripted to be refused
 * at the end — it is refused because by then it has been revoked, which is the
 * only thing that ever refuses anything here.
 *
 * The two lifecycles on one key are the point of the third step and they are
 * deliberately not the same rule. A key stops being accepted from callers the
 * moment it is revoked, but a key stays in the verification ring while tokens it
 * signed can still be in flight — which is why `accepts B` and `verify A+B` are
 * true at the same time, and why no rotation invalidates a token mid-life.
 */

const ID = 'key-rotation';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- how a traveller moves -------------------------------------------------

/** One speed for every leg any traveller takes, in pixels per second. */
const SPEED = 1000;

/** A call, from a caller's bottom edge to the Service's top edge. */
const LEG_CALL = round((Y_SERVICE_TOP - Y_CALLERS_BOTTOM) / SPEED);
/** A key-state change, from the Service's bottom edge to the Keys' top edge. */
const LEG_KEYS = round((Y_KEYS_TOP - Y_SERVICE_BOTTOM) / SPEED);
/** How long a traveller that carried no verdict takes to go. */
const FADE = 0.14;
/** A verdict is held longer, because the reader is meant to read it. */
const MARK_FADE = 0.3;

// --- what the scene is told ------------------------------------------------

/** One key of the series: when it was cut, and when it stopped being taken. */
interface KeyPlan {
  id: KeyId;
  issuedAt: number;
  revokedAt: number | null;
  /** An emergency rotation sounds like one; a scheduled one does not. */
  emergency: boolean;
}

/**
 * The whole schedule of the series. Key A is on the stage from the first frame,
 * which is what makes the first step's argument possible: it has always been
 * there, and in the world the ghost shows it always would be.
 */
const KEY_PLANS: KeyPlan[] = [
  { id: 'a', issuedAt: 0, revokedAt: 10.2, emergency: false },
  { id: 'b', issuedAt: 6.5, revokedAt: 20.8, emergency: false },
  { id: 'c', issuedAt: 19.3, revokedAt: null, emergency: true },
];

/** When a copy of a key got loose. */
const LEAKS: { key: KeyId; at: number }[] = [
  { key: 'a', at: 1.4 },
  { key: 'b', at: 18.5 },
];

/** When each caller's deploy swaps the key it presents. The two are apart. */
const MIGRATIONS: { caller: CallerId; key: KeyId; at: number }[] = [
  { caller: '1', key: 'b', at: 7.2 },
  { caller: '2', key: 'b', at: 9.2 },
  { caller: '1', key: 'c', at: 19.9 },
  { caller: '2', key: 'c', at: 20.2 },
];

/** What a call presents: a key of its own, or a token somebody signed. */
type Carry = { kind: 'key'; key: KeyId } | { kind: 'token'; kid: KeyId };

interface CallPlan {
  /** The moment the call lands, which is the moment the reader sees a verdict. */
  at: number;
  /** The lane it comes down. A stolen copy borrows a lane it does not own. */
  lane: CallerId;
  carries: Carry;
  /** True when the thing presented is a copy somebody else is holding. */
  stolen?: boolean;
}

/**
 * Every call the Service is asked to judge. Nothing here says what the answer
 * is: each of these lands, the set is read, and the answer is whatever the set
 * says. The two stolen calls present the same key twice over — once while it is
 * still accepted, once after it has been revoked — and the pair of answers is
 * the whole argument of the scene.
 */
const CALLS: CallPlan[] = [
  { at: 2.2, lane: '2', carries: { kind: 'key', key: 'a' }, stolen: true },
  { at: 4.0, lane: '1', carries: { kind: 'key', key: 'a' } },
  { at: 7.4, lane: '1', carries: { kind: 'key', key: 'b' } },
  { at: 8.4, lane: '2', carries: { kind: 'key', key: 'a' } },
  { at: 9.4, lane: '2', carries: { kind: 'key', key: 'b' } },
  { at: 13.4, lane: '1', carries: { kind: 'token', kid: 'a' } },
  { at: 15.4, lane: '1', carries: { kind: 'token', kid: 'b' } },
  { at: 20.1, lane: '1', carries: { kind: 'key', key: 'c' } },
  { at: 20.4, lane: '2', carries: { kind: 'key', key: 'c' } },
  { at: 21.15, lane: '2', carries: { kind: 'key', key: 'b' }, stolen: true },
  { at: 22.1, lane: '1', carries: { kind: 'key', key: 'c' } },
];

/** How many keys the verifier keeps: the one it signs with, and the one before. */
const RING_DEPTH = 2;

/** When the signing and verifying pair is first drawn. */
const RING_SHOWN_AT = 12.5;

/** When a token is signed with the current key, so its `kid` changes on screen. */
const MINT_AT = 14.6;

/** The world where the key is never replaced: held up, then dropped. */
const GHOST_AT = 0.5;
const GHOST_OFF = 3.2;

/** The four things the scene holds up, and how long each is held for. */
const MARK_AT: [number, Mark, number][] = [
  [4.8, 'edition', 0.6],
  [10.9, 'schedule', 0.6],
  [16.4, 'ring', 0.6],
  [21.6, 'discipline', 0.6],
];

/** When the picture is called settled: one key cut, accepted and alone. */
const SETTLE_AT = 22.7;

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
type Kind = 'plain' | 'leak' | 'token' | 'admin';

interface Journey {
  x: number;
  y: number;
  to: number;
  kind: Kind;
  /** A word that rides with the dot, naming what it is actually presenting. */
  label?: string;
  showAt: number;
  duration: number;
  mark: RequestResult | null;
  landAt: number;
}

interface Simulation {
  changes: AttrChange[];
  cues: [number, SceneCue][];
  journeys: Journey[];
  ok: number;
  denied: number;
  /** Every overlap window: from a key being issued to its predecessor going. */
  overlaps: { from: number; to: number }[];
}

// --- the simulation --------------------------------------------------------

function simulate(): Simulation {
  const raw: AttrChange[] = [];
  const fixed: [number, SceneCue][] = [];
  const journeys: Journey[] = [];
  const problems: string[] = [];

  const setAttr = (at: number, target: string, name: string, value: string): void => {
    raw.push({ at: round(at), target, name, value });
  };
  const cue = (at: number, name: SceneCue): void => {
    fixed.push([round(at), name]);
  };

  /** Keys that have been cut, in the order they were cut. */
  const issued: KeyId[] = [];
  /** Keys the Service will take from a caller right now. */
  const live = new Set<KeyId>();
  /** Keys carrying the `leaked` mark, and whether the ghost raised them. */
  const leaked = new Map<KeyId, boolean>();
  let ghostOn = false;
  let ringShown = false;
  let ok = 0;
  let denied = 0;
  const okSeries: number[] = [];
  const deniedSeries: number[] = [];
  /** Every call the Service answered, for the assertions below. */
  const answered: { at: number; carried: KeyId; token: boolean; passed: boolean }[] = [];

  const laneX = (lane: CallerId): number => (lane === '1' ? X_CALL_1 : X_CALL_2);

  /** The set the Service accepts, spelled the way the readout draws it. */
  const acceptsId = (): string => (['a', 'b', 'c'] as const).filter((k) => live.has(k)).join('');

  /** The keys the verifier keeps, newest last. Depth, not lifetime, bounds it. */
  const ring = (): KeyId[] => issued.slice(-RING_DEPTH);

  /** The one key new signatures are made with, which is always the newest cut. */
  const signer = (): KeyId | undefined => issued[issued.length - 1];

  const writeAccepts = (at: number): void => {
    const id = acceptsId();
    if (!ACCEPTS.some((entry) => entry.id === id)) {
      problems.push(`${at} the accepted set is {${id}}, which the readout cannot draw`);
    }
    setAttr(at, 'stage', 'data-kr-accepts', id);
  };

  /** The pair the third step is about, written only once it is being shown. */
  const writeRing = (at: number): void => {
    if (!ringShown) return;
    const current = signer();
    const keys = ring();
    if (!current || !keys.includes(current)) {
      problems.push(`${at} the ring does not hold the key it signs with`);
      return;
    }
    if (keys.length > RING_DEPTH) problems.push(`${at} the ring holds ${keys.length} keys`);
    setAttr(at, 'stage', 'data-kr-sign', current);
    setAttr(at, 'stage', 'data-kr-verify', keys.join(''));
  };

  /** A traveller on one of the two upper lanes, or on the lower one. */
  const travel = (
    x: number,
    y: number,
    to: number,
    landAt: number,
    duration: number,
    kind: Kind,
    mark: RequestResult | null,
    label?: string,
  ): void => {
    journeys.push({
      x,
      y,
      to,
      kind,
      label,
      showAt: round(landAt - duration),
      duration,
      mark,
      landAt: round(landAt),
    });
  };

  const { schedule, drain } = createScheduler();

  // --- the keys of the series ---------------------------------------------

  for (const plan of KEY_PLANS) {
    if (plan.issuedAt <= 0) {
      // Key A is already cut on the first frame, so the stage draws it rather
      // than the timeline: the opening picture is a running system, not an
      // empty one, and that is what the ghost has something to say about.
      issued.push(plan.id);
      live.add(plan.id);
      continue;
    }
    schedule(plan.issuedAt, () => {
      const at = plan.issuedAt;
      issued.push(plan.id);
      live.add(plan.id);
      setAttr(at, `card-${plan.id}`, 'data-kr-card', 'active');
      writeAccepts(at);
      writeRing(at);
      travel(X_KEYS, Y_SERVICE_BOTTOM, Y_KEYS_TOP, at, LEG_KEYS, 'admin', null);
      cue(at, plan.emergency ? 'trip' : 'state');
    });
  }

  for (const plan of KEY_PLANS) {
    if (plan.revokedAt === null) continue;
    const at = plan.revokedAt;
    schedule(at, () => {
      live.delete(plan.id);
      setAttr(at, `card-${plan.id}`, 'data-kr-card', 'revoked');
      writeAccepts(at);
      travel(X_KEYS, Y_SERVICE_BOTTOM, Y_KEYS_TOP, at, LEG_KEYS, 'admin', null);
      cue(at, 'state');
    });
  }

  // --- the world without rotation -----------------------------------------

  schedule(GHOST_AT, () => {
    ghostOn = true;
    setAttr(GHOST_AT, 'stage', 'data-kr-ghost', 'on');
    cue(GHOST_AT, 'state');
  });

  schedule(GHOST_OFF, () => {
    ghostOn = false;
    setAttr(GHOST_OFF, 'stage', 'data-kr-ghost', 'off');
    // A leak the ghost raised goes with the ghost, because it was an argument
    // about a world rather than a thing that happened in this one.
    for (const [key, fromGhost] of leaked) {
      if (!fromGhost) continue;
      leaked.delete(key);
      setAttr(GHOST_OFF, `card-${key}`, 'data-kr-leak', 'off');
    }
    cue(GHOST_OFF, 'trip');
  });

  for (const leak of LEAKS) {
    schedule(leak.at, () => {
      leaked.set(leak.key, ghostOn);
      setAttr(leak.at, `card-${leak.key}`, 'data-kr-leak', 'on');
      // Inside the ghost's world a leak is part of an argument; outside it, it
      // is the thing the rest of the scene has to answer for.
      cue(leak.at, ghostOn ? 'state' : 'failure');
    });
  }

  // --- the deploys ---------------------------------------------------------

  for (const move of MIGRATIONS) {
    schedule(move.at, () => {
      setAttr(move.at, `caller-${move.caller}`, 'data-kr-holds', move.key);
    });
  }

  // --- signing, and the ring that verifies --------------------------------

  schedule(RING_SHOWN_AT, () => {
    ringShown = true;
    writeRing(RING_SHOWN_AT);
    cue(RING_SHOWN_AT, 'state');
  });

  schedule(MINT_AT, () => {
    const current = signer();
    if (!current) return;
    setAttr(MINT_AT, 'stage', 'data-kr-kid', current);
    cue(MINT_AT, 'state');
  });

  // --- the calls -----------------------------------------------------------

  for (const call of CALLS) {
    schedule(call.at, () => {
      const token = call.carries.kind === 'token';
      const carried = call.carries.kind === 'key' ? call.carries.key : call.carries.kid;
      // The one rule in the scene. A key is taken while it is issued and not
      // revoked; a signature is checked while the key that made it is still in
      // the ring. Nothing else decides anything.
      const passed = token ? ring().includes(carried) : live.has(carried);
      answered.push({ at: call.at, carried, token, passed });

      travel(
        laneX(call.lane),
        Y_CALLERS_BOTTOM,
        Y_SERVICE_TOP,
        call.at,
        LEG_CALL,
        call.stolen ? 'leak' : token ? 'token' : 'plain',
        passed ? 'ok' : 'fail',
        call.stolen ? `key ${carried.toUpperCase()}` : undefined,
      );

      if (token) setAttr(call.at, 'stage', 'data-kr-kid', carried);

      if (passed) {
        ok += 1;
        okSeries.push(ok);
        setAttr(call.at, 'stage', 'data-kr-ok', String(ok));
      } else {
        denied += 1;
        deniedSeries.push(denied);
        setAttr(call.at, 'stage', 'data-kr-denied', String(denied));
      }

      // A stolen copy that works is the failure the whole pattern exists to
      // put a clock on; a stolen copy that no longer works is the clock having
      // run, which is a change of state rather than an alarm.
      if (call.stolen) cue(call.at, passed ? 'failure' : 'state');
      else cue(call.at, 'success');
    });
  }

  // --- what the scene holds up, and where it stops ------------------------

  for (const [at, value, hold] of MARK_AT) {
    schedule(at, () => {
      setAttr(at, 'stage', 'data-kr-mark', value);
      cue(at, 'state');
    });
    schedule(round(at + hold), () => setAttr(round(at + hold), 'stage', 'data-kr-mark', 'none'));
  }

  schedule(SETTLE_AT, () => {
    setAttr(SETTLE_AT, 'stage', 'data-kr-settled', 'on');
    cue(SETTLE_AT, 'success');
  });

  drain();

  // --- what has to be true for the picture to mean anything ---------------

  /**
   * The schedule, read again from the outside. The pass above answered every
   * call from state it was carrying; this recomputes the same answer straight
   * from the key plans, so a drift between the two is a bug rather than a
   * matter of opinion.
   */
  const acceptedAt = (key: KeyId, at: number): boolean => {
    const plan = KEY_PLANS.find((entry) => entry.id === key);
    if (!plan) return false;
    return plan.issuedAt <= at && (plan.revokedAt === null || at < plan.revokedAt);
  };

  for (const call of answered) {
    if (call.token) continue;
    const wanted = acceptedAt(call.carried, call.at);
    if (call.passed !== wanted) {
      problems.push(
        `${call.at} a call carrying key ${call.carried} was ${call.passed ? 'let through' : 'refused'}, the schedule says otherwise`,
      );
    }
  }

  // Every overlap: from the moment the next key is cut to the moment the one
  // before it is revoked. Rotation without one of these is an outage.
  const overlaps: { from: number; to: number }[] = [];
  for (let index = 1; index < KEY_PLANS.length; index += 1) {
    const previous = KEY_PLANS[index - 1];
    const next = KEY_PLANS[index];
    if (!previous || !next || previous.revokedAt === null) continue;
    if (previous.revokedAt <= next.issuedAt) {
      problems.push(`key ${previous.id} was revoked before key ${next.id} was issued`);
      continue;
    }
    overlaps.push({ from: next.issuedAt, to: previous.revokedAt });
  }
  for (const window of overlaps) {
    const refused = answered.filter(
      (call) => !call.passed && call.at >= window.from && call.at <= window.to,
    );
    if (refused.length > 0) {
      problems.push(`a caller was refused at ${refused[0]?.at} inside the overlap`);
    }
  }

  // A key is only revoked once nothing is still calling with it.
  for (const plan of KEY_PLANS) {
    if (plan.revokedAt === null) continue;
    const late = answered.filter(
      (call) => !call.token && call.carried === plan.id && call.passed && call.at > (plan.revokedAt ?? 0),
    );
    if (late.length > 0) problems.push(`key ${plan.id} was taken after it was revoked`);
  }

  // The leaked key stops working the moment the window closes, and this is the
  // only place in the scene where anything is refused at all. A leak the ghost
  // raised is not counted, because it was dropped along with the ghost; a
  // signature is not counted either, because the ring is a different lifetime
  // and the third step is the one that argues for it.
  for (const leak of LEAKS.filter((entry) => entry.at > GHOST_OFF)) {
    const plan = KEY_PLANS.find((entry) => entry.id === leak.key);
    if (!plan || plan.revokedAt === null) continue;
    const after = answered.filter(
      (call) => !call.token && call.carried === leak.key && call.at > (plan.revokedAt ?? 0) && call.passed,
    );
    if (after.length > 0) problems.push(`the leaked key ${leak.key} passed ${after.length} calls after revocation`);
  }

  // The third step's claim: a token signed by a key older than the signing key
  // still verifies, and the key it names is not the key anything is signed with.
  const olderKid = answered.find((call) => {
    if (!call.token || !call.passed) return false;
    const current = KEY_PLANS.filter((plan) => plan.issuedAt <= call.at).slice(-1)[0];
    return current !== undefined && current.id !== call.carried;
  });
  if (!olderKid) problems.push('no token signed by an older key was ever verified');
  else if (olderKid.at < 12 || olderKid.at >= 18) {
    problems.push(`the old signature verified at ${olderKid.at}, outside the third step`);
  }

  for (let index = 1; index < okSeries.length; index += 1) {
    if ((okSeries[index] ?? 0) < (okSeries[index - 1] ?? 0)) problems.push('ok went backwards');
  }
  for (let index = 1; index < deniedSeries.length; index += 1) {
    if ((deniedSeries[index] ?? 0) < (deniedSeries[index - 1] ?? 0)) problems.push('denied went backwards');
  }
  if (ok !== MAX_OK) problems.push(`${ok} calls were let through, the stage draws ${MAX_OK}`);
  if (denied !== MAX_DENIED) problems.push(`${denied} calls were refused, the stage draws ${MAX_DENIED}`);

  for (const journey of journeys) {
    if (journey.showAt < 0 || journey.landAt > SCENE_DURATION) {
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
  // forwards and in reverse backwards, so that single frame would depend on
  // which way the reader scrubbed. Only the one that ends up applying is kept.
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

  return { changes, cues: fixed, journeys, ok, denied, overlaps };
}

// --- the timeline ----------------------------------------------------------

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);
  const sim = simulate();

  // The captions name the figures the model produced. Nothing here places them:
  // if the schedule changes, this is what says the captions have stopped
  // describing the scene.
  const emergency = sim.overlaps[sim.overlaps.length - 1];
  const planned = sim.overlaps[0];
  if (!planned || !emergency) throw new Error(`${ID} scene: the series never overlapped`);
  if (!(emergency.to - emergency.from < planned.to - planned.from)) {
    throw new Error(
      `${ID} scene: the caption says the emergency window is the shorter one, the model says ` +
        `${round(emergency.to - emergency.from)}s against ${round(planned.to - planned.from)}s`,
    );
  }

  const targets: Record<string, Element> = { stage };
  for (const id of CALLER_IDS) targets[`caller-${id}`] = q(stage, `.kr-caller--${id}`, ID);
  for (const id of KEY_IDS) targets[`card-${id}`] = q(stage, `.kr-card--${id}`, ID);

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

    // A dot is drawn as the kind of thing it carries, because a caller's key, a
    // signed token, a stolen copy and a key-store change are four different
    // things travelling the same kind of line.
    request.group.classList.add(`kr-req--${journey.kind}`);

    if (journey.label) {
      const label = attachToRequest(
        request,
        'text',
        { class: 'scene-req-label kr-tag', x: '-36', y: '9', 'text-anchor': 'end' },
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

    if (journey.mark) {
      markRequest(tl, request, journey.mark, journey.landAt);
      hideRequest(tl, request, journey.landAt, MARK_FADE);
    } else {
      hideRequest(tl, request, journey.landAt, FADE);
    }
  });

  // --- sound ---------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels ---------------------------------------------------------

  // The stage is complete on the first frame: one key cut and accepted, two
  // slots still empty, both callers holding that key, nothing signed, nothing
  // counted and nothing in flight.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
