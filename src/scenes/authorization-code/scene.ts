import gsap from 'gsap';
import {
  BAR_W,
  SCENE_DURATION,
  STAGE_STATE,
  X_BACK,
  X_FRONT,
  Y_ARRIVE,
  Y_AUTHZ,
  Y_RAIL,
  Y_REST,
  Y_TOKEN,
} from './stage';
import { q } from '../shared/dom';
import { hideRequest, markRequest, mountRequests, parkRequest, showRequest } from '../shared/request';
import type { RequestParts, RequestResult } from '../shared/request';
import { collapseAtInstant, createScheduler } from '../shared/simulation';
import { attr, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Authorization Code scene: a 24 second, four step timeline.
 *
 * Same two rules as the other scenes: every tween sits at an absolute position,
 * and every discrete change is a zero-duration tween on a `data-*` attribute
 * that GSAP reverts when the playhead moves back past it.
 *
 * Nothing the reader is asked to believe is authored. The scene is told when a
 * user clicks login, how long a login form is looked at, how long each party
 * waits before answering, how fast each channel is, whether the client has a
 * secret, whether it uses PKCE, and when an attacker copies what went past. One
 * pass over the whole 24 seconds produces everything else: which code exists,
 * whether it has been spent, what the server checks before it mints anything,
 * when an access token dies, which refresh token is the current one, and every
 * sound cue.
 *
 * The authorization server is the state of that pass. It holds at most one code,
 * which is minted at a login, spent by the first caller that can authenticate,
 * and worthless afterwards; the access token it mints carries a deadline; the
 * refresh token carries a generation, and only the newest generation is
 * accepted. A caller that presents a superseded one is not merely refused: the
 * server takes it as evidence the family has leaked and revokes all of it. That
 * is why the attacker's two attempts fail for different reasons without either
 * being written down — the first arrives after the code was spent and without a
 * secret, the second arrives one rotation too late.
 *
 * Lifetimes are compressed 450:1: an access token lives fifteen minutes, drawn
 * as two seconds, so a whole lifetime fits inside a step and can be watched
 * running out. The strip keeps saying `15 min`, because that is the number a
 * reader would configure.
 */

const ID = 'authorization-code';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- how far and how fast -------------------------------------------------

/**
 * Four speeds, in pixels per second. A navigation is the browser being sent
 * somewhere, a call is the app talking to `/token` on its own connection, an
 * API call carries a body and is the slowest of the three, and a leak is not a
 * request at all: it is a copy drifting out of a URL, so it moves slowest.
 */
const NAV_SPEED = 1150;
const CALL_SPEED = 1250;
const API_SPEED = 1400;
const LEAK_SPEED = 900;

/** How long each party takes to answer, and how long a marker stays up. */
const BROWSER_DWELL = 0.08;
const LOGIN_DWELL = 0.45;
const APP_DWELL = 0.25;
const API_DWELL = 0.3;
/** How long after a code lands in a browser the attacker reads it out. */
const THEFT_DELAY = 0.45;
/** How long the attacker sits on what it copied before trying it. */
const ATTACK_DWELL = 0.4;
/** How long the server takes to invalidate what a rotation replaced. */
const REVOKE_DELAY = 0.12;
const MARK_DWELL = 0.25;
const FADE = 0.15;
const FLASH_HOLD = 0.6;

/**
 * The access token's lifetime in scene seconds. Fifteen real minutes are two
 * seconds here, a 450:1 compression.
 */
const ACCESS_TTL = 2;

// --- what the scene is told -----------------------------------------------

interface StepPlan {
  at: number;
  end: number;
  /** Whether the client has a secret it can authenticate to `/token` with. */
  confidential: boolean;
  /** Whether the client proves possession of a per-login verifier instead. */
  pkce: boolean;
  /** When the user clicks login, for a step that starts from nothing. */
  login?: number;
  /** Whether the attacker copies the code out of the browser. */
  theft?: boolean;
  /** When the what-if flow runs: the tokens the front channel never carries. */
  ghost?: number;
  /** A step that opens on a login that already happened. */
  openWithTokens?: boolean;
  /** Whether the app calls the API once it has its tokens. */
  apiAfterTokens?: boolean;
  /** When the app calls the API, for a step that starts already holding one. */
  apiCalls?: number[];
  /** When the app redeems its refresh token. */
  refreshAt?: number;
  /** When the attacker replays the copy it is holding. */
  reuseAt?: number;
}

const PLANS: StepPlan[] = [
  { at: 0, end: 6, confidential: true, pkce: false, login: 0.3, apiAfterTokens: true },
  { at: 6, end: 12, confidential: true, pkce: false, login: 6.3, theft: true, ghost: 10.9 },
  { at: 12, end: 18, confidential: false, pkce: true, login: 12.3, theft: true },
  {
    at: 18,
    end: 24,
    confidential: false,
    pkce: true,
    openWithTokens: true,
    apiCalls: [18.3, 20.2, 22.4],
    refreshAt: 21.3,
    reuseAt: 22.5,
  },
];

// --- what the simulation produces -----------------------------------------

type Lane = 'front' | 'back';
type Kind = 'nav' | 'code' | 'exchange' | 'api' | 'steal' | 'attack' | 'ghost' | 'refresh';

interface Leg {
  at: number;
  x: number;
  y: number;
  duration: number;
}

interface Traveller {
  kind: Kind;
  lane: Lane;
  /** Every word the chip can show. Empty means a plain dot. */
  labels: string[];
  ghost: boolean;
  start: { x: number; y: number };
  showAt: number;
  legs: Leg[];
  /** Which word the chip shows, changed when what it carries changes. */
  carry: [number, string][];
  mark: [number, RequestResult] | null;
  fadeAt: number;
  /** Where and when the traveller is free next, while it is being built. */
  cursor: number;
  x: number;
  y: number;
}

interface AttrChange {
  at: number;
  target: string;
  name: string;
  value: string;
}

/** One stretch of the access token's life, as a fraction of the bar. */
interface LifeSegment {
  from: number;
  to: number;
  wFrom: number;
  wTo: number;
}

interface Simulation {
  travellers: Traveller[];
  attrs: AttrChange[];
  life: LifeSegment[];
  cues: [number, SceneCue][];
}

const laneX = (lane: Lane): number => (lane === 'front' ? X_FRONT : X_BACK);

// --- the simulation -------------------------------------------------------

function simulate(): Simulation {
  const travellers: Traveller[] = [];
  const raw: AttrChange[] = [];
  const cues: [number, SceneCue][] = [];
  const life: LifeSegment[] = [];

  const setAttr = (at: number, name: string, value: string): void => {
    raw.push({ at: round(at), target: 'stage', name: `data-${name}`, value });
  };
  const cue = (at: number, name: SceneCue): void => {
    cues.push([round(at), name]);
  };

  const { schedule, drain } = createScheduler();

  // --- the state one pass carries ----------------------------------------

  /** The one code the server has outstanding, and whether it is spent. */
  let code: { used: boolean; challenge: boolean } | null = null;
  /** When the access token the server last minted stops being accepted. */
  let accessExpiry = 0;
  /** The refresh generation the server accepts. Anything older is theft. */
  let refreshGen = 0;
  let familyRevoked = false;
  /** What the app is holding, and what the attacker copied. */
  let appRefreshGen = 0;
  let attackerCode = false;
  let attackerRefreshGen = 0;

  /** Flash guards: a later flash on the same label cancels the earlier one. */
  const flashSeq: Record<string, number> = {};
  const flash = (
    at: number,
    name: string,
    value: string,
    off: string,
    step: StepPlan,
    hold = FLASH_HOLD,
  ): void => {
    flashSeq[name] = (flashSeq[name] ?? 0) + 1;
    const seq = flashSeq[name];
    setAttr(at, name, value);
    const done = round(Math.min(at + hold, step.end));
    if (done <= at) return;
    schedule(done, () => {
      if (flashSeq[name] === seq) setAttr(done, name, off);
    });
  };

  // --- travellers --------------------------------------------------------

  const spawn = (
    kind: Kind,
    lane: Lane,
    at: number,
    y: number,
    labels: string[],
    ghost = false,
  ): Traveller => {
    const x = laneX(lane);
    const traveller: Traveller = {
      kind,
      lane,
      labels,
      ghost,
      start: { x, y },
      showAt: round(at),
      legs: [],
      carry: labels.length > 0 ? [[round(at), labels[0] ?? '']] : [],
      mark: null,
      fadeAt: round(at),
      cursor: round(at),
      x,
      y,
    };
    travellers.push(traveller);
    return traveller;
  };

  /** Moves a traveller along one axis and returns when it gets there. */
  const move = (traveller: Traveller, x: number, y: number, speed: number): number => {
    const distance = Math.abs(x - traveller.x) + Math.abs(y - traveller.y);
    const duration = round(distance / speed);
    traveller.legs.push({ at: traveller.cursor, x, y, duration });
    traveller.cursor = round(traveller.cursor + duration);
    traveller.x = x;
    traveller.y = y;
    traveller.fadeAt = traveller.cursor;
    return traveller.cursor;
  };

  /** The redirect hop: down to the rail, across it, and up into the other box. */
  const hop = (traveller: Traveller, lane: Lane): number => {
    move(traveller, traveller.x, Y_RAIL, NAV_SPEED);
    move(traveller, laneX(lane), Y_RAIL, NAV_SPEED);
    traveller.lane = lane;
    return move(traveller, laneX(lane), Y_REST, NAV_SPEED);
  };

  const pause = (traveller: Traveller, seconds: number): number => {
    traveller.cursor = round(traveller.cursor + seconds);
    return traveller.cursor;
  };

  const carry = (traveller: Traveller, at: number, label: string): void => {
    traveller.carry.push([round(at), label]);
  };

  const settle = (traveller: Traveller, at: number, result: RequestResult | null): number => {
    if (result) traveller.mark = [round(at), result];
    const gone = round(at + (result ? MARK_DWELL : 0));
    traveller.fadeAt = gone;
    return gone;
  };

  // --- what the server does with what it is given ------------------------

  /** Starts the access token's life over, and draws the stretch it has. */
  const mintAccess = (at: number, step: StepPlan): void => {
    accessExpiry = round(at + ACCESS_TTL);
    setAttr(at, 'access', 'live');
    setAttr(at, 'hold-access', 'held');
    const to = round(Math.min(accessExpiry, step.end));
    if (to > at) {
      life.push({
        from: round(at),
        to,
        wFrom: BAR_W,
        wTo: round((BAR_W * (accessExpiry - to)) / ACCESS_TTL),
      });
    }
    const deadline = accessExpiry;
    if (deadline > step.end) return;
    schedule(deadline, () => {
      // A token minted later has its own deadline, so this one is only still
      // the token if nothing has replaced it.
      if (accessExpiry !== deadline) return;
      setAttr(deadline, 'access', 'expired');
      setAttr(deadline, 'hold-access', 'expired');
      cue(deadline, 'trip');
    });
  };

  /** Everything a successful redemption hands over, code grant or refresh. */
  const mintAll = (at: number, step: StepPlan, rotate: boolean, silent = false): void => {
    mintAccess(at, step);
    setAttr(at, 'id', 'issued');
    refreshGen += 1;
    familyRevoked = false;
    setAttr(at, 'refresh', 'live');
    // A cut is not an event, so a step that opens already holding tokens does
    // not sound as though it had just been given them.
    if (!silent) cue(at, 'success');
    if (!rotate) return;
    // What the rotation replaced is dead from now on, and anyone still holding
    // a copy of it is holding evidence rather than a token.
    const stale = round(at + REVOKE_DELAY);
    if (stale >= step.end) return;
    schedule(stale, () => {
      if (attackerRefreshGen > 0 && attackerRefreshGen < refreshGen) {
        setAttr(stale, 'stolen', 'old');
      }
      cue(stale, 'trip');
    });
  };

  const revokeFamily = (at: number, step: StepPlan): void => {
    familyRevoked = true;
    setAttr(at, 'refresh', 'revoked');
    setAttr(at, 'hold-refresh', 'revoked');
    flash(at, 'verdict', 'revoked', 'none', step);
    cue(at, 'trip');
  };

  /**
   * `/token` with a code. The order of the checks is the order the server can
   * make them: it has to know who is calling before it looks at what they
   * brought.
   */
  const redeemCode = (
    at: number,
    step: StepPlan,
    caller: 'app' | 'attacker',
  ): 'ok' | 'no-secret' | 'no-verifier' | 'used' => {
    const authenticated = caller === 'app' ? step.confidential || step.pkce : false;
    if (!authenticated) return step.pkce ? 'no-verifier' : 'no-secret';
    if (!code || code.used) return 'used';
    code.used = true;
    setAttr(at, 'code', 'used');
    return 'ok';
  };

  /** `/token` with a refresh token, which is where a stolen copy shows up. */
  const redeemRefresh = (gen: number): 'ok' | 'revoked' | 'reused' => {
    if (familyRevoked) return 'revoked';
    if (gen !== refreshGen) return 'reused';
    return 'ok';
  };

  // --- one login ---------------------------------------------------------

  const login = (step: StepPlan, at: number): void => {
    schedule(at, () => {
      if (step.pkce) {
        setAttr(at, 'verifier', 'on');
        cue(at, 'state');
      }
      // The app sends the browser away, which is a hop through the rail.
      const nav = spawn('nav', 'back', at, Y_REST, step.pkce ? ['challenge'] : []);
      const atBrowser = hop(nav, 'front');
      schedule(atBrowser, () => {
        setAttr(atBrowser, 'url', 'authorize');
        cue(atBrowser, 'state');
      });
      pause(nav, BROWSER_DWELL);
      const atAuthz = move(nav, X_FRONT, Y_AUTHZ, NAV_SPEED);
      settle(nav, atAuthz, null);
      schedule(atAuthz, () => {
        code = { used: false, challenge: step.pkce };
        if (step.pkce) setAttr(atAuthz, 'challenge', 'on');
        flash(atAuthz, 'login', 'on', 'off', step, LOGIN_DWELL);
        cue(atAuthz, 'state');

        // The user types a password into the server, and only into the server.
        const issued = round(atAuthz + LOGIN_DWELL);
        schedule(issued, () => {
          setAttr(issued, 'code', 'issued');
          cue(issued, 'state');
          sendCode(step, issued);
        });
      });
    });
  };

  /** The code coming back: down the front channel, through the browser. */
  const sendCode = (step: StepPlan, at: number): void => {
    const carrier = spawn('code', 'front', at, Y_AUTHZ, ['code']);
    const atBrowser = move(carrier, X_FRONT, Y_REST, NAV_SPEED);
    schedule(atBrowser, () => {
      setAttr(atBrowser, 'url', 'code');
      cue(atBrowser, 'state');
      if (step.theft) steal(step, round(atBrowser + THEFT_DELAY));
    });
    pause(carrier, BROWSER_DWELL);
    const atApp = hop(carrier, 'back');
    settle(carrier, atApp, null);
    schedule(atApp, () => {
      cue(atApp, 'state');
      exchange(step, round(atApp + APP_DWELL));
    });
  };

  /** The app redeeming the code on a connection the browser never touches. */
  const exchange = (step: StepPlan, at: number): void => {
    const call = spawn('exchange', 'back', at, Y_REST, ['code', 'tokens']);
    const atToken = move(call, X_BACK, Y_TOKEN, CALL_SPEED);
    schedule(atToken, () => {
      const verdict = redeemCode(atToken, step, 'app');
      if (verdict !== 'ok') {
        flash(atToken, 'verdict', verdict, 'none', step);
        settle(call, atToken, 'fail');
        cue(atToken, 'failure');
        return;
      }
      flash(atToken, 'verdict', step.pkce ? 'verifier' : 'secret', 'none', step);
      mintAll(atToken, step, false);
      appRefreshGen = refreshGen;
      call.mark = [atToken, 'ok'];
      carry(call, atToken, 'tokens');
      const home = move(call, X_BACK, Y_REST, CALL_SPEED);
      settle(call, home, null);
      schedule(home, () => {
        setAttr(home, 'hold-access', 'held');
        setAttr(home, 'hold-id', 'held');
        setAttr(home, 'hold-refresh', 'held');
        if (step.pkce) setAttr(home, 'verifier', 'off');
        cue(home, 'state');
        if (step.apiAfterTokens) callApi(step, round(home + API_DWELL));
      });
    });
  };

  // --- what leaks, and what is done with it ------------------------------

  /** The copy that drifts out of the browser, which is what a URL costs. */
  const steal = (step: StepPlan, at: number): void => {
    schedule(at, () => {
      const copy = spawn('steal', 'front', at, Y_REST, ['code']);
      const landed = move(copy, X_FRONT, Y_ARRIVE, LEAK_SPEED);
      settle(copy, landed, null);
      schedule(landed, () => {
        attackerCode = true;
        setAttr(landed, 'attacker', 'active');
        setAttr(landed, 'stolen', 'code');
        cue(landed, 'state');
        attackWithCode(step, round(landed + ATTACK_DWELL));
      });
    });
  };

  const attackWithCode = (step: StepPlan, at: number): void => {
    schedule(at, () => {
      if (!attackerCode) return;
      const call = spawn('attack', 'front', at, Y_ARRIVE, ['code']);
      const atToken = move(call, X_FRONT, Y_TOKEN, CALL_SPEED);
      schedule(atToken, () => {
        // Two things are wrong with this call, and the reader is shown both:
        // the server says who it could not authenticate, and the attacker is
        // left holding a code that had already been spent.
        const spent = code === null || code.used;
        const verdict = redeemCode(atToken, step, 'attacker');
        flash(atToken, 'verdict', verdict, 'none', step);
        flash(atToken, 'note', spent ? 'used' : verdict, 'none', step);
        settle(call, atToken, 'fail');
        cue(atToken, 'failure');
      });
    });
  };

  /** The what-if: the same journey, carrying what it never carries. */
  const ghostFlow = (step: StepPlan, at: number): void => {
    schedule(at, () => {
      const ghost = spawn('ghost', 'front', at, Y_AUTHZ, ['access'], true);
      const landed = move(ghost, X_FRONT, Y_ARRIVE, LEAK_SPEED);
      ghost.fadeAt = round(Math.min(landed + 0.5, step.end - 0.2));
    });
  };

  // --- the API, which only ever sees an access token ---------------------

  const callApi = (step: StepPlan, at: number): void => {
    schedule(at, () => {
      const call = spawn('api', 'back', at, Y_REST, ['Bearer']);
      const landed = move(call, X_BACK, Y_ARRIVE, API_SPEED);
      schedule(landed, () => {
        const ok = landed < accessExpiry;
        settle(call, landed, ok ? 'ok' : 'fail');
        flash(landed, 'api', ok ? 'ok' : '401', 'idle', step);
        cue(landed, ok ? 'success' : 'failure');
      });
    });
  };

  // --- refreshing, and the reuse that ends the family --------------------

  const refresh = (step: StepPlan, at: number): void => {
    schedule(at, () => {
      const call = spawn('refresh', 'back', at, Y_REST, ['refresh', 'tokens']);
      const atToken = move(call, X_BACK, Y_TOKEN, CALL_SPEED);
      schedule(atToken, () => {
        const verdict = redeemRefresh(appRefreshGen);
        if (verdict !== 'ok') {
          flash(atToken, 'verdict', verdict, 'none', step);
          settle(call, atToken, 'fail');
          cue(atToken, 'failure');
          return;
        }
        flash(atToken, 'verdict', 'rotate', 'none', step);
        mintAll(atToken, step, true);
        appRefreshGen = refreshGen;
        call.mark = [atToken, 'ok'];
        carry(call, atToken, 'tokens');
        const home = move(call, X_BACK, Y_REST, CALL_SPEED);
        settle(call, home, null);
        schedule(home, () => {
          setAttr(home, 'hold-access', 'held');
          setAttr(home, 'hold-refresh', 'held');
          cue(home, 'state');
        });
      });
    });
  };

  const reuse = (step: StepPlan, at: number): void => {
    schedule(at, () => {
      if (attackerRefreshGen === 0) return;
      const call = spawn('attack', 'front', at, Y_ARRIVE, ['refresh']);
      const atToken = move(call, X_FRONT, Y_TOKEN, CALL_SPEED);
      schedule(atToken, () => {
        const verdict = redeemRefresh(attackerRefreshGen);
        flash(atToken, 'verdict', verdict, 'none', step);
        flash(atToken, 'note', verdict, 'none', step);
        settle(call, atToken, 'fail');
        cue(atToken, 'failure');
        if (verdict === 'reused') {
          const revoked = round(atToken + REVOKE_DELAY);
          if (revoked < step.end) schedule(revoked, () => revokeFamily(revoked, step));
        }
      });
    });
  };

  // --- the cut at the top of a step --------------------------------------

  const reset = (step: StepPlan): void => {
    const at = step.at;
    code = null;
    accessExpiry = 0;
    familyRevoked = false;
    appRefreshGen = 0;
    attackerCode = false;
    attackerRefreshGen = 0;

    setAttr(at, 'url', 'app');
    setAttr(at, 'login', 'off');
    setAttr(at, 'challenge', 'off');
    setAttr(at, 'verdict', 'none');
    setAttr(at, 'code', 'none');
    setAttr(at, 'access', 'none');
    setAttr(at, 'id', 'none');
    setAttr(at, 'refresh', 'none');
    setAttr(at, 'hold-access', 'none');
    setAttr(at, 'hold-id', 'none');
    setAttr(at, 'hold-refresh', 'none');
    setAttr(at, 'verifier', 'off');
    setAttr(at, 'note', 'none');
    setAttr(at, 'api', 'idle');
    setAttr(at, 'public', step.confidential ? 'off' : 'on');
    setAttr(at, 'attacker', step.openWithTokens ? 'active' : 'idle');
    setAttr(at, 'stolen', 'none');

    if (!step.openWithTokens) return;

    // The step opens on a login that already happened: the app is holding a
    // fresh set, and the attacker is holding a copy of the refresh token that
    // nothing has invalidated yet.
    code = { used: true, challenge: step.pkce };
    setAttr(at, 'code', 'used');
    mintAll(at, step, false, true);
    appRefreshGen = refreshGen;
    attackerRefreshGen = refreshGen;
    setAttr(at, 'hold-id', 'held');
    setAttr(at, 'hold-refresh', 'held');
    setAttr(at, 'stolen', 'refresh');
  };

  // --- the steps, one after another --------------------------------------

  for (const step of PLANS) {
    // The stage already starts in the state the first step opens on, so it is
    // the only one with nothing to clear.
    if (step.at > 0) schedule(step.at, () => reset(step));
    else schedule(step.at, () => setAttr(step.at, 'public', step.confidential ? 'off' : 'on'));

    if (step.login !== undefined) login(step, step.login);
    if (step.ghost !== undefined) ghostFlow(step, step.ghost);
    for (const at of step.apiCalls ?? []) callApi(step, at);
    if (step.refreshAt !== undefined) refresh(step, step.refreshAt);
    if (step.reuseAt !== undefined) reuse(step, step.reuseAt);
  }

  drain();

  // --- put the discrete changes in time order -----------------------------

  const inTimeOrder = raw
    .map((entry, order) => ({ entry, order }))
    .sort((left, right) => left.entry.at - right.entry.at || left.order - right.order)
    .map(({ entry }) => entry);

  const folded: AttrChange[] = [];
  for (const entry of inTimeOrder) {
    collapseAtInstant(folded, entry, (change) => `${change.target}@${change.name}`);
  }

  const seen = new Map<string, string>();
  for (const [key, value] of Object.entries(STAGE_STATE)) seen.set(key, value);
  const attrs: AttrChange[] = [];
  for (const change of folded) {
    const key = `${change.target}@${change.name}`;
    if (seen.get(key) === change.value) continue;
    seen.set(key, change.value);
    attrs.push(change);
  }

  cues.sort((left, right) => left[0] - right[0]);

  return { travellers, attrs, life, cues };
}

// --- the timeline ---------------------------------------------------------

const NS = 'http://www.w3.org/2000/svg';

/** How wide a carried chip is, and where its result marker sits inside it. */
const CHIP_W = 100;
const CHIP_H = 44;
const MARK_OFFSET = 30;

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

/** `Bearer` -> `bearer`, so a label can key a CSS rule. */
const slug = (label: string): string => label.toLowerCase();

/**
 * Dresses a request group as whatever it is carrying. A navigation is the
 * plain dot the shared runtime draws, because a redirect carries nothing but
 * itself; everything else is a plate with one word on it, and the word changes
 * when the thing it stands for does.
 */
function dressTraveller(parts: RequestParts, traveller: Traveller): void {
  const group = parts.group;
  group.setAttribute(
    'class',
    `scene-req ac-req ac-req--${traveller.kind}${traveller.ghost ? ' ac-req--ghost' : ''}`,
  );

  // The marker leans away from the node, so a result never lands on a label.
  const offset = traveller.lane === 'front' ? -MARK_OFFSET : MARK_OFFSET;
  gsap.set([parts.ok, parts.fail], { x: offset });

  if (traveller.labels.length === 0) return;

  gsap.set(parts.dot, { opacity: 0 });
  group.setAttribute('data-carry', traveller.labels[0] ?? '');
  addPart(group, 'rect', {
    class: 'ac-chip-bg',
    x: -CHIP_W / 2,
    y: -CHIP_H / 2,
    width: CHIP_W,
    height: CHIP_H,
    rx: 14,
  });
  for (const label of traveller.labels) {
    addPart(
      group,
      'text',
      { class: `ac-chip-text ac-chip-text--${slug(label)}`, x: 0, y: 7, 'text-anchor': 'middle' },
      label,
    );
  }
}

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);
  const lifeFill = q<SVGRectElement>(stage, '.ac-life-fill', ID);

  const sim = simulate();
  const parts = mountRequests(layer, sim.travellers.length, ID);

  const tl = createSceneTimeline();

  // --- discrete state -----------------------------------------------------

  for (const change of sim.attrs) attr(tl, stage, change.name, change.value, change.at);

  // --- the access token's life, drawn as a bar that empties ---------------

  for (const segment of sim.life) {
    if (segment.to <= segment.from) continue;
    tl.fromTo(
      lifeFill,
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
    parkRequest(request, traveller.start.x, traveller.start.y);
    if (traveller.labels.length > 0) gsap.set(request.dot, { opacity: 0 });

    showRequest(tl, request, traveller.showAt);
    for (const leg of traveller.legs) {
      tl.to(
        request.group,
        { x: leg.x, y: leg.y, duration: leg.duration, ease: 'none', immediateRender: false },
        leg.at,
      );
    }
    for (const [at, label] of traveller.carry.slice(1)) {
      attr(tl, request.group, 'data-carry', label, at);
    }
    if (traveller.mark) markRequest(tl, request, traveller.mark[1], traveller.mark[0]);
    hideRequest(tl, request, traveller.fadeAt, FADE);
  });

  // --- sound --------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels --------------------------------------------------------

  // The stage is complete on the first frame: a browser on the app's own page,
  // an app holding nothing, both endpoints of the authorization server, an
  // empty issue record, an idle attacker, an API, and nothing in flight.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
