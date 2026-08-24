import gsap from 'gsap';
import {
  BAR_W,
  SCENE_DURATION,
  STAGE_STATE,
  X_CURL,
  X_TAB,
  Y_API_TOP,
  Y_ARRIVE,
  Y_GATE,
  Y_REST,
  Y_SAME,
} from './stage';
import { q } from '../shared/dom';
import { hideRequest, markRequest, mountRequests, parkRequest, showRequest } from '../shared/request';
import type { RequestParts, RequestResult } from '../shared/request';
import { collapseAtInstant, createScheduler } from '../shared/simulation';
import { attr, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * CORS scene: a 24 second, four step timeline.
 *
 * Same two rules as the other scenes: every tween sits at an absolute position,
 * and every discrete change is a zero-duration tween on a `data-*` attribute
 * that GSAP reverts when the playhead moves back past it.
 *
 * Nothing the reader is asked to believe is authored. The scene is told what
 * the server's policy is when a step opens, when that policy changes, and when
 * a tab or a shell fetches something — the method, whether it asks for
 * credentials, whether it carries an antiforgery token. One pass over the whole
 * 24 seconds produces everything else: whether a request needs a preflight at
 * all, whether the browser already has one cached and can skip it, what the
 * server puts in `Access-Control-Allow-Origin`, whether the gate lets the
 * answer through, whether the request even reaches the server, how many the
 * server has handled, and every sound cue.
 *
 * The two halves of the pass never share a rule, which is the whole point of
 * the scene. The server decides whether to *do* the work: it turns a
 * state-changing call away at the door when antiforgery is on and the call
 * cannot prove where it came from, and otherwise it handles it and counts it.
 * The browser decides, separately and afterwards, whether the page may *read*
 * the answer: an exact origin match, or a wildcard when no cookies are
 * involved, and nothing else. A request that the browser will refuse to let the
 * page read has still been run by the server, which is why the counter goes up
 * behind a blocked response.
 *
 * The preflight cache is the one piece of state with a clock on it. A preflight
 * that comes back with the method the page asked for writes the allow list down
 * with a deadline, and a later call for a method already on that list skips the
 * question entirely. `Access-Control-Max-Age: 3600` is compressed 735:1 so a
 * whole hour fits inside a step and can be watched running out; the label keeps
 * saying `Max-Age 1 h`, because that is the number a reader would configure.
 */

const ID = 'cors';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- how far and how fast -------------------------------------------------

/**
 * Three speeds, in pixels per second. A request carries a body and goes down at
 * one rate, the answer comes back heavier and slower, and a preflight is an
 * empty question with an empty answer, so it is much the fastest of the three.
 */
const DOWN_SPEED = 1700;
const UP_SPEED = 1400;
const OPT_SPEED = 2600;

/** How long each party takes, and how long a marker or a flash stays up. */
const SERVER_DWELL = 0.12;
const OPT_DWELL = 0.08;
const GATE_DWELL = 0.12;
const DOOR_DWELL = 0.08;
const SAME_ORIGIN_DWELL = 0.35;
/** How long the browser sits on a preflight answer before sending the real one. */
const PREFLIGHT_GAP = 0.3;
const FADE = 0.18;
const FADE_BLOCKED = 0.3;
const FADE_FAST = 0.15;
const VERDICT_HOLD = 0.9;
const NOTE_HOLD = 1.2;
const HIT_HOLD = 0.5;
const CACHE_HIT_HOLD = 0.6;
/** How much of a step a flash may still be showing at the very end of it. */
const FLASH_MARGIN = 0.05;

/** One hour of `Access-Control-Max-Age`, in scene seconds. */
const MAX_AGE_SCENE = 4.9;

const SHOP = 'https://shop.example';
const EVIL = 'https://evil.example';

// --- what the scene is told -----------------------------------------------

/** The server's CORS policy, plus the two things that are not CORS at all. */
interface Policy {
  /** Origins that may read an answer. `*` means any, and only without cookies. */
  origins: string[];
  allowCredentials: boolean;
  /** Methods a preflight is answered with. */
  methods: string[];
  headers: string[];
  /** Whether a preflight answer may be cached, and for how long. */
  maxAge: number;
  /** How the session cookie is declared, which decides cross-site attachment. */
  sameSite: 'None' | 'Lax';
  /** Whether a state-changing call has to prove where it came from. */
  antiforgery: boolean;
}

interface PolicyChange {
  at: number;
  set: Partial<Policy>;
}

interface Fetch {
  at: number;
  /** Which tab made the call, or the shell, which is not a browser at all. */
  from: 'shop' | 'evil' | 'curl';
  method: 'GET' | 'PUT' | 'DELETE' | 'POST';
  /** A call back to the page's own origin never involves CORS. */
  sameOrigin?: boolean;
  /** Whether the call asks for the user's cookies to go with it. */
  credentials?: boolean;
  /** A JSON body is what takes a call out of the simple set. */
  json?: boolean;
  /** Whether the page could read an antiforgery token to send along. */
  token?: boolean;
}

interface StepPlan {
  at: number;
  end: number;
  /** The policy the step opens on. */
  policy: Policy;
  changes: PolicyChange[];
  fetches: Fetch[];
}

const OPEN_POLICY: Policy = {
  origins: [],
  allowCredentials: false,
  methods: [],
  headers: [],
  maxAge: 0,
  sameSite: 'None',
  antiforgery: false,
};

const NAMED_POLICY: Policy = {
  ...OPEN_POLICY,
  origins: [SHOP],
  allowCredentials: true,
};

const PREFLIGHT_POLICY: Policy = {
  ...NAMED_POLICY,
  methods: ['GET', 'PUT'],
  headers: ['Content-Type'],
  maxAge: 3600,
};

const PLANS: StepPlan[] = [
  {
    at: 0,
    end: 6,
    policy: OPEN_POLICY,
    changes: [],
    fetches: [
      { at: 0.4, from: 'shop', method: 'GET', sameOrigin: true },
      { at: 1.8, from: 'shop', method: 'GET' },
      { at: 3.6, from: 'shop', method: 'GET' },
    ],
  },
  {
    at: 6,
    end: 12,
    policy: OPEN_POLICY,
    changes: [
      { at: 6.2, set: { origins: [SHOP], allowCredentials: true } },
      { at: 8.65, set: { origins: ['*'] } },
      { at: 10.0, set: { origins: [SHOP] } },
    ],
    fetches: [
      { at: 6.6, from: 'shop', method: 'GET' },
      { at: 8.8, from: 'shop', method: 'GET', credentials: true },
      { at: 10.15, from: 'shop', method: 'GET', credentials: true },
    ],
  },
  {
    at: 12,
    end: 18,
    policy: NAMED_POLICY,
    changes: [
      { at: 12.1, set: { methods: ['GET', 'PUT'], headers: ['Content-Type'], maxAge: 3600 } },
    ],
    fetches: [
      { at: 12.2, from: 'shop', method: 'PUT', json: true },
      { at: 15.0, from: 'shop', method: 'PUT', json: true },
      { at: 16.85, from: 'shop', method: 'DELETE', json: true },
    ],
  },
  {
    at: 18,
    end: 24,
    policy: PREFLIGHT_POLICY,
    changes: [{ at: 21.0, set: { sameSite: 'Lax', antiforgery: true } }],
    fetches: [
      { at: 18.2, from: 'curl', method: 'GET' },
      { at: 19.4, from: 'evil', method: 'POST', credentials: true },
      { at: 21.4, from: 'evil', method: 'POST', credentials: true },
      { at: 22.1, from: 'shop', method: 'POST', credentials: true, token: true },
    ],
  },
];

// --- what the simulation produces -----------------------------------------

type Lane = 'tab' | 'curl';

interface Leg {
  at: number;
  y: number;
  duration: number;
}

interface Traveller {
  lane: Lane;
  kind: 'fetch' | 'preflight' | 'direct' | 'same';
  /** Whether it is drawn as a plate. A shell request is a plain dot. */
  chip: boolean;
  /** Every word the plate can show, and every word the small plate under it can. */
  methods: string[];
  tags: string[];
  start: number;
  showAt: number;
  legs: Leg[];
  carry: [number, string][];
  tagged: [number, string][];
  mark: [number, RequestResult] | null;
  fadeAt: number;
  fade: number;
  /** Where and when the traveller is free next, while it is being built. */
  cursor: number;
  y: number;
}

interface AttrChange {
  at: number;
  name: string;
  value: string;
}

/** One stretch of a cached preflight's life, as a fraction of the bar. */
interface BarSegment {
  from: number;
  to: number;
  wFrom: number;
  wTo: number;
}

interface Simulation {
  travellers: Traveller[];
  attrs: AttrChange[];
  bars: BarSegment[];
  cues: [number, SceneCue][];
}

const laneX = (lane: Lane): number => (lane === 'tab' ? X_TAB : X_CURL);

/** The origin a call is made from, or nothing when it is not made by a page. */
const originOf = (from: Fetch['from']): string | null =>
  from === 'shop' ? SHOP : from === 'evil' ? EVIL : null;

/**
 * The simple set: what a page could already have sent with a form before CORS
 * existed, which is exactly what needs no permission asked in advance.
 */
const isSimple = (fetch: Fetch): boolean =>
  (fetch.method === 'GET' || fetch.method === 'POST') && !fetch.json;

/** Whether a call is one the server would be sorry to run for a stranger. */
const changesState = (fetch: Fetch): boolean => fetch.method !== 'GET';

// --- the simulation -------------------------------------------------------

function simulate(): Simulation {
  const travellers: Traveller[] = [];
  const raw: AttrChange[] = [];
  const cues: [number, SceneCue][] = [];
  const bars: BarSegment[] = [];

  const setAttr = (at: number, name: string, value: string): void => {
    raw.push({ at: round(at), name: `data-${name}`, value });
  };
  const cue = (at: number, name: SceneCue): void => {
    cues.push([round(at), name]);
  };

  const { schedule, drain } = createScheduler();

  // --- the state one pass carries ----------------------------------------

  /** What the server is configured to allow, right now. */
  let policy: Policy = { ...OPEN_POLICY };
  /** How many real requests the server has run in this step. */
  let handled = 0;
  /** The one preflight answer the browser is holding, and when it dies. */
  let cache: { methods: string[]; expiry: number } | null = null;
  /** What the browser has written down, so a repeat is not announced twice. */
  let shownOrigin = 'none';
  let shownAcao = 'hidden';

  /** Flash guards: a later flash on the same label cancels the earlier one. */
  const flashSeq: Record<string, number> = {};
  const flash = (
    at: number,
    name: string,
    value: string,
    off: string,
    step: StepPlan,
    hold: number,
  ): void => {
    flashSeq[name] = (flashSeq[name] ?? 0) + 1;
    const seq = flashSeq[name];
    setAttr(at, name, value);
    const done = round(Math.min(at + hold, step.end - FLASH_MARGIN));
    if (done <= at) return;
    schedule(done, () => {
      if (flashSeq[name] === seq) setAttr(done, name, off);
    });
  };

  /** Writes the policy out as the five rows of the server's table. */
  const showPolicy = (at: number): void => {
    setAttr(
      at,
      'origins',
      policy.origins.length === 0 ? 'none' : policy.origins[0] === '*' ? 'any' : 'shop',
    );
    setAttr(at, 'methods', policy.methods.length === 0 ? 'none' : 'set');
    setAttr(at, 'headers', policy.headers.length === 0 ? 'none' : 'set');
    setAttr(at, 'samesite', policy.sameSite === 'Lax' ? 'lax' : 'none');
    setAttr(at, 'antiforgery', policy.antiforgery ? 'on' : 'off');
  };

  // --- travellers --------------------------------------------------------

  const spawn = (
    kind: Traveller['kind'],
    lane: Lane,
    at: number,
    methods: string[],
    tags: string[],
    tag: string,
  ): Traveller => {
    const traveller: Traveller = {
      lane,
      kind,
      chip: methods.length > 0,
      methods,
      tags,
      start: Y_REST,
      showAt: round(at),
      legs: [],
      carry: methods.length > 0 ? [[round(at), methods[0] ?? '']] : [],
      tagged: [[round(at), tag]],
      mark: null,
      fadeAt: round(at),
      fade: FADE,
      cursor: round(at),
      y: Y_REST,
    };
    travellers.push(traveller);
    return traveller;
  };

  /** Moves a traveller along the lane and returns when it gets there. */
  const move = (traveller: Traveller, y: number, speed: number): number => {
    const duration = round(Math.abs(y - traveller.y) / speed);
    traveller.legs.push({ at: traveller.cursor, y, duration });
    traveller.cursor = round(traveller.cursor + duration);
    traveller.y = y;
    traveller.fadeAt = traveller.cursor;
    return traveller.cursor;
  };

  const pause = (traveller: Traveller, seconds: number): number => {
    traveller.cursor = round(traveller.cursor + seconds);
    traveller.fadeAt = traveller.cursor;
    return traveller.cursor;
  };

  const land = (traveller: Traveller, at: number, fade: number): void => {
    traveller.fadeAt = round(at);
    traveller.fade = fade;
  };

  // --- what the browser writes down on the way past ----------------------

  /** The gate notes the origin a request went out with, once per value. */
  const recordOrigin = (at: number, origin: string): void => {
    const value = origin === SHOP ? 'shop' : 'evil';
    if (shownOrigin === value) return;
    shownOrigin = value;
    setAttr(at, 'origin', value);
    cue(at, 'state');
  };

  /**
   * The gate reads the answer's headers. What the server sent is decided here
   * rather than carried by the response, because it is the policy at the moment
   * the answer was written that matters.
   */
  const readHeaders = (at: number, origin: string, credentials: boolean): string => {
    const named = policy.origins.includes(origin);
    const wildcard = policy.origins.includes('*');
    const acao = named ? 'origin' : wildcard ? 'wildcard' : 'none';
    const acac = credentials && policy.allowCredentials && acao === 'origin';
    setAttr(at, 'acac', acac ? 'on' : 'off');
    if (shownAcao !== acao) {
      shownAcao = acao;
      setAttr(at, 'acao', acao);
      cue(at, 'state');
    }
    return acao;
  };

  /**
   * The one rule the browser applies to an answer: an exact origin, or a
   * wildcard when no cookies were involved, and nothing else.
   */
  const judge = (acao: string, credentials: boolean): 'allowed' | 'blocked' | 'credentials' => {
    if (acao === 'none') return 'blocked';
    if (acao === 'wildcard') return credentials ? 'credentials' : 'allowed';
    return 'allowed';
  };

  // --- one call, from the moment it is made ------------------------------

  const step4Note = (step: StepPlan, at: number, value: string): void => {
    flash(at, 'note', value, 'none', step, NOTE_HOLD);
  };

  /** The answer coming back up the lane, and what the gate does with it. */
  const bringBack = (
    step: StepPlan,
    traveller: Traveller,
    fetch: Fetch,
    origin: string,
  ): void => {
    const gateAt = move(traveller, Y_GATE, UP_SPEED);
    schedule(gateAt, () => {
      const acao = readHeaders(gateAt, origin, fetch.credentials === true);
      const verdictAt = round(gateAt + GATE_DWELL);
      schedule(verdictAt, () => {
        const verdict = judge(acao, fetch.credentials === true);
        flash(verdictAt, 'verdict', verdict, 'none', step, VERDICT_HOLD);
        pause(traveller, GATE_DWELL);
        if (verdict === 'allowed') {
          traveller.mark = [verdictAt, 'ok'];
          cue(verdictAt, 'success');
          setAttr(verdictAt, 'gate', 'open');
          setAttr(verdictAt, 'console', 'off');
          const homeAt = move(traveller, Y_REST, UP_SPEED);
          land(traveller, homeAt, FADE);
          schedule(round(homeAt + FADE), () => setAttr(round(homeAt + FADE), 'gate', 'closed'));
          return;
        }
        traveller.mark = [verdictAt, 'fail'];
        cue(verdictAt, 'failure');
        setAttr(verdictAt, 'console', 'on');
        flash(verdictAt, 'gate', 'blocked', 'closed', step, VERDICT_HOLD);
        land(traveller, verdictAt, FADE_BLOCKED);
      });
    });
  };

  /** The real request: down the lane, past the door, and back if it is run. */
  const sendReal = (step: StepPlan, fetch: Fetch, at: number): void => {
    const origin = originOf(fetch.from);
    const lane: Lane = fetch.from === 'curl' ? 'curl' : 'tab';
    const cookie =
      fetch.credentials === true ? (policy.sameSite === 'None' ? 'cookie' : 'dropped') : 'none';
    const tag = fetch.token === true ? 'token' : cookie;
    const traveller = spawn(
      'fetch',
      lane,
      at,
      lane === 'tab' ? [fetch.method, 'response'] : [],
      lane === 'tab' ? ['cookie', 'token'] : [],
      tag,
    );
    if (lane === 'tab') setAttr(at, 'tab', fetch.from === 'evil' ? 'evil' : 'shop');

    if (origin !== null) {
      const gateDownAt = round(at + (Y_GATE - Y_REST) / DOWN_SPEED);
      schedule(gateDownAt, () => recordOrigin(gateDownAt, origin));
    }

    const doorAt = move(traveller, Y_API_TOP, DOWN_SPEED);
    schedule(doorAt, () => {
      // The server's own rule, which has nothing to do with the browser: a call
      // that changes something has to say where it came from once antiforgery
      // is on, and a stranger cannot.
      const refused = changesState(fetch) && policy.antiforgery && fetch.token !== true;
      if (refused) {
        const markAt = round(doorAt + DOOR_DWELL);
        pause(traveller, DOOR_DWELL);
        traveller.mark = [markAt, 'fail'];
        cue(markAt, 'failure');
        step4Note(step, markAt, 'refused');
        land(traveller, markAt, FADE_BLOCKED);
        return;
      }

      const arriveAt = move(traveller, Y_ARRIVE, DOWN_SPEED);
      schedule(arriveAt, () => {
        handled += 1;
        setAttr(arriveAt, 'handled', String(handled));
        cue(arriveAt, 'state');
        // A call the server runs for an origin it would never let read the
        // answer is the whole shape of a cross-site forgery.
        if (origin !== null && changesState(fetch) && !policy.origins.includes(origin)) {
          flash(arriveAt, 'hit', 'on', 'off', step, HIT_HOLD);
          step4Note(step, arriveAt, 'executed');
        }
        pause(traveller, SERVER_DWELL);
        const turnAt = traveller.cursor;
        if (traveller.chip) {
          traveller.carry.push([turnAt, 'response']);
          traveller.tagged.push([turnAt, 'none']);
        }
        if (origin === null) {
          // Nothing to judge: the shell reads whatever came back.
          traveller.mark = [turnAt, 'ok'];
          cue(turnAt, 'success');
          const homeAt = move(traveller, Y_REST, UP_SPEED);
          land(traveller, homeAt, FADE);
          return;
        }
        bringBack(step, traveller, fetch, origin);
      });
    });
  };

  /** The question the browser asks first, when the call is not a simple one. */
  const sendPreflight = (step: StepPlan, fetch: Fetch, at: number): void => {
    const origin = originOf(fetch.from);
    const traveller = spawn(
      'preflight',
      'tab',
      at,
      ['OPTIONS'],
      [fetch.method],
      fetch.method.toLowerCase(),
    );
    setAttr(at, 'tab', fetch.from === 'evil' ? 'evil' : 'shop');

    if (origin !== null) {
      const gateDownAt = round(at + (Y_GATE - Y_REST) / OPT_SPEED);
      schedule(gateDownAt, () => recordOrigin(gateDownAt, origin));
    }

    const arriveAt = move(traveller, Y_ARRIVE, OPT_SPEED);
    schedule(arriveAt, () => {
      // A preflight is the browser's own question, so the server never counts
      // it as work it did for the page.
      pause(traveller, OPT_DWELL);
      const recordAt = move(traveller, Y_GATE, OPT_SPEED);
      schedule(recordAt, () => {
        const allowed = policy.methods.includes(fetch.method);
        if (allowed) {
          cache = { methods: [...policy.methods], expiry: round(recordAt + MAX_AGE_SCENE) };
          setAttr(recordAt, 'cache', 'live');
          cue(recordAt, 'state');
          const dies = cache.expiry;
          const to = round(Math.min(dies, step.end));
          if (to > recordAt) {
            const kept = (to - recordAt) / MAX_AGE_SCENE;
            bars.push({ from: recordAt, to, wFrom: BAR_W, wTo: round(BAR_W * (1 - kept)) });
          }
          schedule(dies, () => {
            if (cache && cache.expiry === dies) {
              cache = null;
              setAttr(dies, 'cache', 'empty');
            }
          });
          land(traveller, recordAt, FADE_FAST);
          const realAt = round(recordAt + PREFLIGHT_GAP);
          schedule(realAt, () => sendReal(step, fetch, realAt));
          return;
        }
        const verdictAt = round(recordAt + GATE_DWELL);
        schedule(verdictAt, () => {
          pause(traveller, GATE_DWELL);
          traveller.mark = [verdictAt, 'fail'];
          cue(verdictAt, 'failure');
          flash(verdictAt, 'verdict', 'method', 'none', step, VERDICT_HOLD);
          flash(verdictAt, 'gate', 'blocked', 'closed', step, VERDICT_HOLD);
          setAttr(verdictAt, 'console', 'on');
          land(traveller, verdictAt, FADE_BLOCKED);
        });
      });
    });
  };

  /**
   * A call to the page's own origin. It turns around in the gap above the node,
   * because the server that answered it is `shop.example` itself and the gate
   * plays no part: nothing here was ever cross-origin.
   */
  const sendSameOrigin = (fetch: Fetch, at: number): void => {
    const traveller = spawn('same', 'tab', at, [fetch.method, 'response'], [], 'none');
    setAttr(at, 'same', 'on');
    move(traveller, Y_SAME, DOWN_SPEED);
    pause(traveller, SAME_ORIGIN_DWELL);
    const turnAt = traveller.cursor;
    traveller.carry.push([turnAt, 'response']);
    traveller.mark = [turnAt, 'ok'];
    cue(turnAt, 'success');
    const homeAt = move(traveller, Y_REST, UP_SPEED);
    land(traveller, homeAt, FADE);
    setAttr(round(homeAt + FADE), 'same', 'off');
  };

  /** What the browser does with a call, before anything has travelled. */
  const startFetch = (step: StepPlan, fetch: Fetch): void => {
    if (fetch.sameOrigin) {
      sendSameOrigin(fetch, fetch.at);
      return;
    }
    if (fetch.from === 'curl') {
      setAttr(fetch.at, 'curl', 'active');
      sendReal(step, fetch, fetch.at);
      return;
    }
    if (isSimple(fetch)) {
      sendReal(step, fetch, fetch.at);
      return;
    }
    const usable = cache !== null && cache.expiry > fetch.at && cache.methods.includes(fetch.method);
    if (usable) {
      flash(fetch.at, 'cache', 'hit', 'live', step, CACHE_HIT_HOLD);
      sendReal(step, fetch, fetch.at);
      return;
    }
    sendPreflight(step, fetch, fetch.at);
  };

  // --- what a step opens on ----------------------------------------------

  const reset = (step: StepPlan): void => {
    const at = step.at;
    policy = { ...step.policy };
    handled = 0;
    cache = null;
    shownOrigin = 'none';
    shownAcao = 'hidden';
    setAttr(at, 'tab', 'shop');
    setAttr(at, 'console', 'off');
    setAttr(at, 'same', 'off');
    setAttr(at, 'curl', 'idle');
    setAttr(at, 'gate', 'closed');
    setAttr(at, 'origin', 'none');
    setAttr(at, 'acao', 'hidden');
    setAttr(at, 'acac', 'off');
    setAttr(at, 'verdict', 'none');
    setAttr(at, 'cache', 'empty');
    setAttr(at, 'handled', '0');
    setAttr(at, 'hit', 'off');
    setAttr(at, 'note', 'none');
    showPolicy(at);
  };

  // --- the steps, one after another --------------------------------------

  for (const step of PLANS) {
    schedule(step.at, () => reset(step));
    for (const change of step.changes) {
      schedule(change.at, () => {
        policy = { ...policy, ...change.set };
        showPolicy(change.at);
        cue(change.at, 'trip');
      });
    }
    for (const fetch of step.fetches) {
      schedule(fetch.at, () => startFetch(step, fetch));
    }
  }

  drain();

  // --- put the discrete changes in time order -----------------------------

  const inTimeOrder = raw
    .map((entry, order) => ({ entry, order }))
    .sort((left, right) => left.entry.at - right.entry.at || left.order - right.order)
    .map(({ entry }) => entry);

  const folded: AttrChange[] = [];
  for (const entry of inTimeOrder) {
    collapseAtInstant(folded, entry, (change) => change.name);
  }

  const seen = new Map<string, string>();
  for (const [key, value] of Object.entries(STAGE_STATE)) {
    seen.set(key.slice('stage@'.length), value);
  }
  const attrs: AttrChange[] = [];
  for (const change of folded) {
    if (seen.get(change.name) === change.value) continue;
    seen.set(change.name, change.value);
    attrs.push(change);
  }

  cues.sort((left, right) => left[0] - right[0]);

  return { travellers, attrs, bars, cues };
}

// --- the timeline ---------------------------------------------------------

const NS = 'http://www.w3.org/2000/svg';

/** The plate a request is drawn as, and the smaller one it carries under it. */
const CHIP_W = 150;
const CHIP_H = 44;
const TAG_W = 110;
const TAG_H = 32;
const TAG_DY = 36;
const MARK_OFFSET = 50;

/** Adds one element to a traveller, styled from CSS rather than inline. */
function addPart(
  group: SVGGElement,
  tag: string,
  attributes: Record<string, string | number>,
  text?: string,
): SVGElement {
  const element = document.createElementNS(NS, tag) as SVGElement;
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, String(value));
  }
  if (text !== undefined) element.textContent = text;
  group.appendChild(element);
  return element;
}

/** `PUT` -> `put`, so a label can key a CSS rule. */
const slug = (label: string): string => label.toLowerCase();

/**
 * Dresses a request group as whatever it is. A call from the shell is the plain
 * dot the shared runtime draws, because nothing about it is a browser's
 * business; a call from a page is a plate with the method on it, which becomes
 * `response` when it turns around, and under it the small plate that says what
 * the browser attached.
 */
function dressTraveller(parts: RequestParts, traveller: Traveller): void {
  const group = parts.group;
  group.setAttribute('class', `scene-req cors-req cors-req--${traveller.kind}`);
  group.setAttribute('data-tag', traveller.tagged[0]?.[1] ?? 'none');

  if (!traveller.chip) return;

  gsap.set(parts.dot, { opacity: 0 });
  gsap.set([parts.ok, parts.fail], { x: MARK_OFFSET });
  group.setAttribute('data-method', traveller.methods[0] ?? '');

  addPart(group, 'rect', {
    class: 'cors-chip-bg',
    x: -CHIP_W / 2,
    y: -CHIP_H / 2,
    width: CHIP_W,
    height: CHIP_H,
    rx: 14,
  });
  for (const label of traveller.methods) {
    addPart(
      group,
      'text',
      {
        class: `cors-chip-text cors-chip-text--${slug(label)}`,
        x: 0,
        y: 7,
        'text-anchor': 'middle',
      },
      label,
    );
  }

  if (traveller.tags.length === 0) return;
  const tag = document.createElementNS(NS, 'g') as SVGGElement;
  tag.setAttribute('class', 'cors-tag');
  group.appendChild(tag);
  addPart(tag, 'rect', {
    class: 'cors-tag-bg',
    x: -TAG_W / 2,
    y: TAG_DY - TAG_H / 2,
    width: TAG_W,
    height: TAG_H,
    rx: 10,
  });
  for (const label of traveller.tags) {
    addPart(
      tag,
      'text',
      {
        class: `cors-tag-text cors-tag-text--${slug(label)}`,
        x: 0,
        y: TAG_DY + 6,
        'text-anchor': 'middle',
      },
      label,
    );
  }
  addPart(tag, 'line', {
    class: 'cors-tag-strike',
    x1: -TAG_W / 2 + 12,
    y1: TAG_DY,
    x2: TAG_W / 2 - 12,
    y2: TAG_DY,
  });
}

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);
  const maxAgeFill = q<SVGRectElement>(stage, '.cors-maxage-fill', ID);

  const sim = simulate();
  const parts = mountRequests(layer, sim.travellers.length, ID);

  const tl = createSceneTimeline();

  // --- discrete state -----------------------------------------------------

  for (const change of sim.attrs) attr(tl, stage, change.name, change.value, change.at);

  // --- how long a cached preflight still has, drawn as a bar that empties --

  for (const segment of sim.bars) {
    if (segment.to <= segment.from) continue;
    tl.fromTo(
      maxAgeFill,
      { attr: { width: segment.wFrom } },
      {
        attr: { width: segment.wTo },
        duration: round(segment.to - segment.from),
        ease: 'none',
        immediateRender: false,
      },
      segment.from,
    );
  }

  // --- what travels -------------------------------------------------------

  sim.travellers.forEach((traveller, index) => {
    const request = parts[index];
    if (!request) return;

    dressTraveller(request, traveller);
    parkRequest(request, laneX(traveller.lane), traveller.start);
    if (traveller.chip) gsap.set(request.dot, { opacity: 0 });

    showRequest(tl, request, traveller.showAt);
    for (const leg of traveller.legs) {
      if (leg.duration <= 0) continue;
      tl.to(
        request.group,
        { y: leg.y, duration: leg.duration, ease: 'none', immediateRender: false },
        leg.at,
      );
    }
    for (const [at, label] of traveller.carry.slice(1)) {
      attr(tl, request.group, 'data-method', label, at);
    }
    for (const [at, value] of traveller.tagged.slice(1)) {
      attr(tl, request.group, 'data-tag', value, at);
    }
    if (traveller.mark) markRequest(tl, request, traveller.mark[1], traveller.mark[0]);
    hideRequest(tl, request, traveller.fadeAt, traveller.fade);
  });

  // --- sound --------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels --------------------------------------------------------

  // The stage is complete on the first frame: a browser with both its tabs, a
  // shell that is not one, the gate closed, an empty policy table, a server
  // that has handled nothing, and nothing in flight.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
