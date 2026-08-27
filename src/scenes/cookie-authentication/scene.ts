import {
  BAD_MAX,
  BROWSER_BOTTOM,
  COOKIE_TEXT,
  GATES,
  LANE_EVIL,
  LANE_SITE,
  NODE_TOP,
  OK_MAX,
  SCENE_DURATION,
  STAGE_STATE,
  UNAUTH_MAX,
} from './stage';
import type { Gate } from './stage';
import { q } from '../shared/dom';
import {
  attachToRequest,
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
 * Cookie Authentication scene: a 24 second, four step timeline.
 *
 * Same two rules as the other scenes: every tween sits at an absolute position,
 * and every discrete change is a zero-duration tween on a `data-*` attribute
 * that GSAP reverts when the playhead moves back past it.
 *
 * Nothing the reader counts is authored. The scene is told when each tab sends
 * and with what method, when the login response sets the cookie, when the
 * `SameSite=Lax` attribute is added, when the antiforgery token is put in the
 * form, when the origin check is turned on, and when a page script tries the
 * jar. Everything else falls out of one pass over the whole 24 seconds: whether
 * a request leaves carrying the cookie, what each gate answers, whether the
 * server says 200, 401 or 400, all three counters, and which word every badge
 * and tab is showing.
 *
 * The one rule worth stating plainly is the one the scene exists to teach. The
 * browser decides whether to attach the cookie, and it decides from two things
 * only: what the jar holds, and what kind of request this is. It never asks who
 * wrote the page. So a cookie with no `SameSite` rides everything, including a
 * form the attacker's page submits; a cookie marked `Lax` is held back from a
 * cross-site POST but still rides a cross-site top-level GET, which is the door
 * the fourth step has to close with something the attacker cannot read.
 *
 * Gates are evaluated at the instant each plate flips, and the attach decision
 * at the instant the request leaves, which is why a gate added while a request
 * is in flight still judges it.
 */

const ID = 'cookie-authentication';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- what the scene is told -----------------------------------------------

type Tab = 'site' | 'evil';
type Method = 'POST' | 'GET';

/** One thing the scene is told: a tab sends, at a time, with a method. */
interface Send {
  at: number;
  tab: Tab;
  method: Method;
  /** The anonymous sign-in call, which the gate row never sees. */
  login?: boolean;
}

const SCHEDULE: readonly Send[] = [
  { at: 0.6, tab: 'site', method: 'POST', login: true },
  { at: 2.2, tab: 'site', method: 'GET' },
  { at: 4.0, tab: 'site', method: 'GET' },
  { at: 7.2, tab: 'evil', method: 'POST' },
  { at: 7.8, tab: 'site', method: 'POST' },
  { at: 10.2, tab: 'evil', method: 'POST' },
  { at: 13.4, tab: 'evil', method: 'POST' },
  { at: 14.9, tab: 'evil', method: 'GET' },
  { at: 16.2, tab: 'site', method: 'POST' },
  { at: 19.4, tab: 'site', method: 'POST' },
  { at: 20.6, tab: 'evil', method: 'GET' },
  { at: 22.0, tab: 'site', method: 'POST' },
];

/** When a page script reaches for the jar, and how long the answer is held. */
const SCRIPT_READ_AT = 3.4;
const BOUNCE_HOLD = 0.6;
/** When the second tab is drawn, a beat before it has anything to send. */
const EVIL_TAB_AT = 6.4;
/** When the cookie is marked `SameSite=Lax` and the Server gains that gate. */
const SAMESITE_AT = 12.4;
/** When `Strict` is held up beside it. */
const STRICT_AT = 16.1;
/** When the antiforgery token goes into the form and the Server gains a gate. */
const TOKEN_AT = 18.4;
/** When the origin check is turned on and the defences are summed up. */
const ORIGIN_AT = 21.9;

/** One speed for every leg any traveller takes, in pixels per second. */
const SPEED = 500;
const LEG = round((NODE_TOP - BROWSER_BOTTOM) / SPEED);
/** How long after landing the first gate answers, and each one after it. */
const GATE_LEAD = 0.25;
const GATE_STEP = 0.09;
/** How long after the last gate the Server commits to an answer. */
const VERDICT_LAG = 0.2;
/** How long the anonymous sign-in call waits, having no gate to pass. */
const LOGIN_LAG = 0.2;
/** How long a response takes to go once it is home. */
const FADE = 0.25;

/** The shortest gap between two cues. Nothing in this scene is thinned by it. */
const CUE_GAP = 0.15;
/** Which cue wins when two land close enough together that only one can. */
const CUE_RANK: Record<SceneCue, number> = { failure: 0, trip: 1, success: 2, state: 3 };

// --- what the simulation produces -----------------------------------------

interface AttrChange {
  at: number;
  target: string;
  name: string;
  value: string;
}

/** One request, as the timeline has to draw it. */
interface Flight {
  tab: Tab;
  method: Method;
  login: boolean;
  depart: number;
  arrive: number;
  verdict: number;
  home: number;
  /** Whether the browser attached the cookie when this one left. */
  carries: boolean;
  ok: boolean;
  /** Ringed, for the one beat where a forged request being answered is news. */
  ring: boolean;
}

interface Simulation {
  attrs: AttrChange[];
  flights: Flight[];
  cues: [number, SceneCue][];
  /** Kept so the counters can be asserted against the stacks the stage wrote. */
  totals: { ok: number; unauth: number; bad: number };
}

// --- the simulation -------------------------------------------------------

function simulate(): Simulation {
  const raw: AttrChange[] = [];
  const flights: Flight[] = [];
  const candidates: [number, SceneCue][] = [];

  const setAttr = (at: number, target: string, name: string, value: string): void => {
    raw.push({ at: round(at), target, name, value });
  };
  const cue = (at: number, name: SceneCue): void => {
    candidates.push([round(at), name]);
  };

  /** The jar: one cookie, and whether it was stored with a SameSite rule. */
  const jar = { stored: false, sameSite: false };
  /** Whether the form the page renders carries a hidden antiforgery field. */
  let tokenInForm = false;
  /** The gates that exist. A gate that does not exist judges nothing. */
  const live = new Set<Gate>(['cookie']);
  /** Whether the reader has already heard a forged request being answered. */
  let forgedHeard = false;

  let okCount = 0;
  let unauthCount = 0;
  let badCount = 0;

  const { schedule, drain } = createScheduler();

  /**
   * The rule the whole scene is about. The browser attaches the cookie from
   * what the jar holds and what kind of request this is, and from nothing else:
   * with no SameSite rule it rides everything, with `Lax` it is held back from
   * a cross-site POST but still rides a cross-site top-level GET.
   */
  const attaches = (tab: Tab, method: Method): boolean => {
    if (!jar.stored) return false;
    if (!jar.sameSite) return true;
    if (tab === 'site') return true;
    return method === 'GET';
  };

  /** One request, from the moment its tab sends it. */
  const send = ({ at, tab, method, login = false }: Send): void => {
    const name = tab === 'site' ? 'data-ck-site' : 'data-ck-evil';
    setAttr(at, 'stage', name, method === 'POST' ? 'post' : 'get');

    // What it leaves with is decided here, by the browser, at send time.
    const carries = attaches(tab, method);
    const echoesToken = tokenInForm && tab === 'site';
    const arrive = round(at + LEG);

    schedule(arrive, () => {
      // The anonymous sign-in call meets no gate and is not counted: the row
      // counts what the gates answered, and they never saw this one.
      if (login) {
        const verdict = round(arrive + LOGIN_LAG);
        const home = round(verdict + LEG);
        flights.push({
          tab, method, login, depart: at, arrive, verdict, home, carries, ok: true, ring: false,
        });
        schedule(home, () => {
          jar.stored = true;
          setAttr(home, 'stage', 'data-ck-jar', 'stored');
          setAttr(home, 'stage', name, 'idle');
          cue(home, 'trip');
        });
        return;
      }

      // Each plate answers for itself, in the order a request meets them.
      const row = GATES.filter((gate) => live.has(gate));
      let firstFail: Gate | null = null;
      row.forEach((gate, index) => {
        const flip = round(arrive + GATE_LEAD + index * GATE_STEP);
        const ok =
          gate === 'cookie'
            ? carries
            : gate === 'samesite'
              ? tab === 'site' || method === 'GET'
              : gate === 'token'
                ? echoesToken
                : tab === 'site';
        if (!ok && firstFail === null) firstFail = gate;
        setAttr(flip, `gate-${gate}`, 'data-ck-gate', ok ? 'ok' : 'fail');
      });

      const verdict = round(arrive + GATE_LEAD + (row.length - 1) * GATE_STEP + VERDICT_LAG);
      const home = round(verdict + LEG);
      let ring = false;

      if (firstFail === null) {
        okCount += 1;
        setAttr(verdict, 'stage', 'data-ck-ok', String(okCount));
        if (tab === 'site') {
          cue(verdict, 'success');
        } else if (method === 'POST') {
          // The inversion the scene is built on: a forged request answered
          // correctly is the system working as designed, and that is the
          // danger. It is said once; a repeat is the same fact, not new news.
          cue(verdict, forgedHeard ? 'state' : 'failure');
          ring = !forgedHeard;
          forgedHeard = true;
        } else {
          // A cross-site navigation carrying the cookie is not forgery, it is
          // where the SameSite line was drawn.
          cue(verdict, 'state');
        }
      } else if (firstFail === 'cookie' || firstFail === 'samesite') {
        unauthCount += 1;
        setAttr(verdict, 'stage', 'data-ck-unauth', String(unauthCount));
        cue(verdict, 'success');
      } else {
        badCount += 1;
        setAttr(verdict, 'stage', 'data-ck-bad', String(badCount));
        cue(verdict, 'success');
      }

      flights.push({
        tab, method, login, depart: at, arrive, verdict, home, carries, ok: firstFail === null, ring,
      });
      setAttr(home, 'stage', name, 'idle');
    });
  };

  // --- everything the scene is told, booked in one queue -------------------

  schedule(SCRIPT_READ_AT, () => {
    setAttr(SCRIPT_READ_AT, 'stage', 'data-ck-httponly', 'blocked');
    cue(SCRIPT_READ_AT, 'state');
  });
  schedule(round(SCRIPT_READ_AT + BOUNCE_HOLD), () => {
    setAttr(round(SCRIPT_READ_AT + BOUNCE_HOLD), 'stage', 'data-ck-httponly', 'on');
  });

  schedule(EVIL_TAB_AT, () => {
    setAttr(EVIL_TAB_AT, 'stage', 'data-ck-evil', 'idle');
    cue(EVIL_TAB_AT, 'state');
  });

  schedule(SAMESITE_AT, () => {
    jar.sameSite = true;
    live.add('samesite');
    setAttr(SAMESITE_AT, 'stage', 'data-ck-samesite', 'lax');
    setAttr(SAMESITE_AT, 'gate-samesite', 'data-ck-gate', 'off');
    cue(SAMESITE_AT, 'trip');
  });

  schedule(STRICT_AT, () => {
    setAttr(STRICT_AT, 'stage', 'data-ck-strict', 'on');
    cue(STRICT_AT, 'state');
  });

  schedule(TOKEN_AT, () => {
    tokenInForm = true;
    live.add('token');
    setAttr(TOKEN_AT, 'stage', 'data-ck-form', 'on');
    setAttr(TOKEN_AT, 'gate-token', 'data-ck-gate', 'off');
    cue(TOKEN_AT, 'trip');
  });

  schedule(ORIGIN_AT, () => {
    live.add('origin');
    setAttr(ORIGIN_AT, 'gate-origin', 'data-ck-gate', 'off');
    setAttr(ORIGIN_AT, 'stage', 'data-ck-summary', 'on');
    cue(ORIGIN_AT, 'state');
  });

  for (const entry of SCHEDULE) schedule(entry.at, () => send(entry));

  drain();

  // --- the cues, ranked so a clash keeps the louder one --------------------

  candidates.sort((left, right) => CUE_RANK[left[1]] - CUE_RANK[right[1]] || left[0] - right[0]);
  const cues: [number, SceneCue][] = [];
  for (const candidate of candidates) {
    const clash = cues.some(([at]) => Math.abs(at - candidate[0]) + 1e-9 < CUE_GAP);
    if (!clash) cues.push(candidate);
  }
  cues.sort((left, right) => left[0] - right[0]);

  // --- put the discrete changes in time order ------------------------------

  const inTimeOrder = raw
    .map((entry, order) => ({ entry, order }))
    .sort((left, right) => left.entry.at - right.entry.at || left.order - right.order)
    .map(({ entry }) => entry);

  const folded: AttrChange[] = [];
  for (const entry of inTimeOrder) {
    collapseAtInstant(folded, entry, (change) => `${change.target}@${change.name}`);
  }

  const seen = new Map<string, string>(Object.entries(STAGE_STATE));
  const attrs: AttrChange[] = [];
  for (const change of folded) {
    const key = `${change.target}@${change.name}`;
    if (seen.get(key) === change.value) continue;
    seen.set(key, change.value);
    attrs.push(change);
  }

  flights.sort((left, right) => left.depart - right.depart);

  return { attrs, flights, cues, totals: { ok: okCount, unauth: unauthCount, bad: badCount } };
}

// --- the timeline ---------------------------------------------------------

/** The plate a traveller carries when the browser attached the cookie. */
const CARRY_BOX = { class: 'ck-carry-box', x: '26', y: '-19', width: '150', height: '38', rx: '12' };
const CARRY_TEXT = { class: 'scene-mono ck-carry-text', x: '101', y: '7', 'text-anchor': 'middle' };
/** The plate the sign-in response comes back with. */
const SET_BOX = { class: 'ck-set-box', x: '26', y: '-19', width: '166', height: '38', rx: '12' };
const SET_TEXT = { class: 'ck-set-text', x: '109', y: '7', 'text-anchor': 'middle' };

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const targets: Record<string, Element> = { stage };
  for (const gate of GATES) {
    targets[`gate-${gate}`] = q<SVGGElement>(stage, `.ck-gate--${gate}`, ID);
  }

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);
  const sim = simulate();
  if (sim.totals.ok > OK_MAX || sim.totals.unauth > UNAUTH_MAX || sim.totals.bad > BAD_MAX) {
    throw new Error(
      `${ID} scene: counters reach ${sim.totals.ok}/${sim.totals.unauth}/${sim.totals.bad}, past the stacks the stage wrote`,
    );
  }
  const parts = mountRequests(layer, sim.flights.length, ID);

  const tl = createSceneTimeline();

  // --- discrete state -----------------------------------------------------

  for (const change of sim.attrs) {
    const target = targets[change.target];
    if (target) attr(tl, target, change.name, change.value, change.at);
  }

  // --- what travels -------------------------------------------------------

  // Two lanes, and a request only ever runs the length of its own: down from
  // the tab that sent it to the Server's top edge, and back up the same lane
  // carrying whatever the Server answered.
  sim.flights.forEach((flight, index) => {
    const request = parts[index];
    if (!request) return;
    const lane = flight.tab === 'site' ? LANE_SITE : LANE_EVIL;

    parkRequest(request, lane, BROWSER_BOTTOM);
    showRequest(tl, request, flight.depart);
    moveRequest(tl, request, NODE_TOP, round(flight.arrive - flight.depart), flight.depart);
    markRequest(tl, request, flight.ok ? 'ok' : 'fail', flight.verdict);
    moveRequest(tl, request, BROWSER_BOTTOM, round(flight.home - flight.verdict), flight.verdict);
    hideRequest(tl, request, round(flight.home - FADE), FADE);
    if (flight.ring) haloRequest(tl, request, flight.verdict, round(flight.verdict + 0.5), 0.3);

    // The cookie the browser attached, drawn on the request that carries it and
    // gone the moment the Server has answered.
    if (flight.carries) {
      const box = attachToRequest(request, 'rect', CARRY_BOX);
      const text = attachToRequest(request, 'text', CARRY_TEXT, COOKIE_TEXT);
      tl.set([box, text], { opacity: 1, immediateRender: false }, flight.depart);
      tl.set([box, text], { opacity: 0, immediateRender: false }, flight.verdict);
    }

    // The sign-in answer, which is the only thing in the scene that puts a
    // cookie in the jar rather than spending one.
    if (flight.login) {
      const box = attachToRequest(request, 'rect', SET_BOX);
      const text = attachToRequest(request, 'text', SET_TEXT, 'Set-Cookie');
      tl.set([box, text], { opacity: 1, immediateRender: false }, flight.verdict);
      tl.set([box, text], { opacity: 0, immediateRender: false }, flight.home);
    }
  });

  // --- sound --------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels --------------------------------------------------------

  // The stage is complete on the first frame: the Browser with the one tab that
  // exists yet, an empty jar, the Server with the one gate it starts with, all
  // three counters at zero, and the form the page renders.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
