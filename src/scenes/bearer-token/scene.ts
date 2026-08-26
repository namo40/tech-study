import {
  ATT_TOP,
  CLIENT_BOTTOM,
  GATES,
  FAIL_MAX,
  LANE_ATTACKER,
  LANE_CLIENT,
  NODE_BOTTOM,
  NODE_TOP,
  OK_MAX,
  SCENE_DURATION,
  SEGMENTS,
  STAGE_STATE,
  TTL_UNITS,
} from './stage';
import { q } from '../shared/dom';
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
 * Bearer Token scene: a 24 second, four step timeline.
 *
 * Same two rules as the other scenes: every tween sits at an absolute position,
 * and every discrete change is a zero-duration tween on a `data-*` attribute
 * that GSAP reverts when the playhead moves back past it.
 *
 * Nothing the reader counts is authored. The scene is told when each side sends
 * a request and whether the Client attaches a header to it, when the Client's
 * first token expires and how long a replacement lives, how long a countdown is
 * drawn for, when the token leaks, when it is revoked, and when the Client
 * rotates. Everything else falls out of one pass over the whole 24 seconds:
 * which gate answers what, whether a call ends 200 or 401, both counters, the
 * countdown, and which word the header chip is showing.
 *
 * The one thing worth stating plainly is what makes the third step work. The
 * Attacker is not given a token — it is given a copy of whatever the Client is
 * holding at the moment of the leak, and the copy keeps tracking the Client
 * until the leak is closed by revocation. That is why the same gates that pass
 * the Client pass the Attacker: the API is not comparing two callers, it is
 * looking at one token, twice.
 *
 * Gates are evaluated at the instant each plate flips rather than at the moment
 * the request landed, which is what lets the expiry the countdown is running
 * down catch a call that arrived while there was still life on it.
 */

const ID = 'bearer-token';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- what the scene is told -----------------------------------------------

/** When the Client sends, and whether it attaches the header. */
const CLIENT_SCHEDULE: readonly (readonly [number, boolean])[] = [
  [0.6, true],
  [2.8, false],
  [3.8, true],
  [7.0, true],
  [9.8, true],
  [14.4, true],
  [16.0, true],
  [20.5, true],
  [21.9, true],
];

/** When the Attacker sends. It only ever sends the copy it is holding. */
const ATTACKER_SCHEDULE: readonly number[] = [13.6, 15.425, 18.55];

/** When the token the scene opens on runs out. */
const FIRST_EXPIRES_AT = 16.2;
/** How long a token minted during the scene lives, in scene seconds. */
const TOKEN_LIFE = 8;
/** Scene seconds the `TTL n s` countdown is drawn over, once it is drawn. */
const TTL_SPAN = 3.8;
/** One second on the countdown label, in scene seconds. */
const TTL_STEP = TTL_SPAN / TTL_UNITS;

/** When a copy of the Client's token reaches the Attacker. */
const LEAK_AT = 12.4;
/** When the Attacker box is drawn, a beat after it has something to send. */
const ATTACKER_ON_AT = 12.8;
/** When the Attacker's copy stops being worth drawing. */
const ATTACKER_OFF_AT = 22.4;
/** When the `jti` gate is added and the token in play is put on a deny list. */
const REVOKE_AT = 18.4;
/** When the Client swaps the revoked token for a fresh one. */
const ROTATE_AT = 20.4;
/** How long the Client takes to fetch a replacement after an expiry refusal. */
const REISSUE_DELAY = 0.3;

/** The beats the second step spends taking the token apart. */
const PANEL_AT = 6.4;
const SEGMENT_AT = [6.8, 7.6, 8.4];
const CLAIMS_AT = 9;
const B64_AT = 10;

/** One speed for every leg any traveller takes, in pixels per second. */
const SPEED = 400;
const CLIENT_LEG = round((NODE_TOP - CLIENT_BOTTOM) / SPEED);
const ATTACKER_LEG = round((ATT_TOP - NODE_BOTTOM) / SPEED);
/** How long after landing the first gate answers, and each one after it. */
const GATE_STEP = 0.1;
/** How long after the last gate the API commits to an answer. */
const VERDICT_LAG = 0.4;
/** How long a call with no header waits before it is refused. */
const REFUSE_LAG = 0.1;
/** How long a result marker takes to go. */
const FADE = 0.3;

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

/** One call, as the timeline has to draw it. */
interface Flight {
  from: 'client' | 'attacker';
  depart: number;
  arrive: number;
  verdict: number;
  ok: boolean;
}

interface Simulation {
  attrs: AttrChange[];
  flights: Flight[];
  cues: [number, SceneCue][];
  /** Kept so the counters can be asserted against the stacks the stage wrote. */
  totals: { ok: number; fail: number };
}

// --- the simulation -------------------------------------------------------

/** A token, which is only ever three facts: who it is, when it dies, how it reads. */
interface Token {
  id: number;
  expiresAt: number;
  /** The rendering the header chip uses, which rotation changes. */
  render: 'token' | 'fresh';
}

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

  let nextId = 1;
  /** The token the Client is holding, which the header chip is showing. */
  let clientToken: Token = { id: nextId, expiresAt: FIRST_EXPIRES_AT, render: 'token' };
  /** The copy the Attacker is holding, once there is one. */
  let attackerToken: Token | null = null;
  /** Token ids the API has been told to stop honouring. */
  const revoked = new Set<number>();

  let okCount = 0;
  let failCount = 0;

  const { schedule, drain } = createScheduler();

  /** What the header chip reads while a call carrying `token` is out. */
  const renderOf = (token: Token | null): string => (token ? token.render : 'none');

  /**
   * The countdown. It is not a clock the scene starts and stops: it is a
   * reading of the Client's current token, drawn only in the last `TTL_SPAN`
   * before that token dies. A replacement with a full life left switches it off
   * by arithmetic rather than by an instruction.
   */
  const ttlValue = (token: Token, at: number): string => {
    const remaining = token.expiresAt - at;
    if (remaining > TTL_SPAN) return 'off';
    return String(Math.max(0, Math.min(TTL_UNITS, Math.ceil(remaining / TTL_STEP))));
  };

  /** Hands the Client a token and books every reading the countdown will take. */
  const issue = (at: number, render: 'token' | 'fresh'): void => {
    nextId += 1;
    const token: Token = { id: nextId, expiresAt: round(at + TOKEN_LIFE), render };
    clientToken = token;
    if (at >= LEAK_AT && at < REVOKE_AT) attackerToken = token;
    setAttr(at, 'stage', 'data-bt-hdr', renderOf(token));
    setAttr(at, 'stage', 'data-bt-ttl', ttlValue(token, at));
    bookCountdown(token, at);
  };

  /**
   * One reading per second the label can show, each one dropped if the token it
   * belongs to has already been replaced by the time it comes round.
   */
  const bookCountdown = (token: Token, from: number): void => {
    for (let n = TTL_UNITS; n >= 0; n -= 1) {
      const at = round(token.expiresAt - n * TTL_STEP);
      if (at <= from || at > SCENE_DURATION) continue;
      schedule(at, () => {
        if (clientToken !== token) return;
        setAttr(at, 'stage', 'data-bt-ttl', String(n));
      });
    }
  };

  /**
   * One call. The gates are not a decision taken when the request lands: each
   * plate answers for itself at the moment it flips, and the verdict is what
   * all of them together said.
   */
  const send = (from: 'client' | 'attacker', depart: number, carries: boolean): void => {
    const leg = from === 'client' ? CLIENT_LEG : ATTACKER_LEG;
    const arrive = round(depart + leg);
    const token = from === 'client' ? (carries ? clientToken : null) : attackerToken;

    // The header chip belongs to the Client, so only a Client call writes it:
    // it shows what that call is carrying while the call is out, and goes back
    // to what the Client is holding once the call is gone.
    const showHeader = (at: number, value: string): void => {
      if (from === 'client') setAttr(at, 'stage', 'data-bt-hdr', value);
    };
    showHeader(depart, renderOf(token));

    if (!token) {
      // Nothing to check, so nothing is checked: the gate row goes dark and the
      // call is refused in front of it.
      for (const gate of GATES) setAttr(arrive, `gate-${gate}`, 'data-bt-gate', 'off');
      const verdict = round(arrive + REFUSE_LAG);
      failCount += 1;
      setAttr(verdict, 'stage', 'data-bt-fail', String(failCount));
      cue(verdict, 'state');
      flights.push({ from, depart, arrive, verdict, ok: false });
      showHeader(round(verdict + FADE), renderOf(clientToken));
      return;
    }

    const jtiOn = arrive >= REVOKE_AT;
    const active = GATES.filter((gate) => gate !== 'jti' || jtiOn);
    let passed = true;
    active.forEach((gate, index) => {
      const at = round(arrive + (index + 1) * GATE_STEP);
      const ok =
        gate === 'exp' ? at < token.expiresAt : gate === 'jti' ? !revoked.has(token.id) : true;
      if (!ok) passed = false;
      setAttr(at, `gate-${gate}`, 'data-bt-gate', ok ? 'ok' : 'fail');
    });

    const verdict = round(arrive + active.length * GATE_STEP + VERDICT_LAG);
    if (passed) {
      okCount += 1;
      setAttr(verdict, 'stage', 'data-bt-ok', String(okCount));
      // The inversion the scene is built on: a leaked token answered correctly
      // is the system working as designed, and that is exactly the danger.
      cue(verdict, from === 'attacker' ? 'failure' : 'success');
    } else {
      failCount += 1;
      setAttr(verdict, 'stage', 'data-bt-fail', String(failCount));
      // A gate that refused is the gate doing its job, whoever was holding the
      // token, so the refusal sounds like the win it is.
      cue(verdict, 'success');
      if (from === 'client') {
        const at = round(verdict + REISSUE_DELAY);
        schedule(at, () => issue(at, clientToken.render));
      }
    }

    flights.push({ from, depart, arrive, verdict, ok: passed });
    showHeader(round(verdict + FADE), renderOf(clientToken));
  };

  // --- everything the scene is told, booked in one queue -------------------

  schedule(PANEL_AT, () => {
    setAttr(PANEL_AT, 'stage', 'data-bt-panel', 'on');
    cue(PANEL_AT, 'trip');
  });
  SEGMENT_AT.forEach((at, index) => {
    schedule(at, () => {
      setAttr(at, 'stage', 'data-bt-seg', SEGMENTS[index] ?? 'none');
      cue(at, 'state');
    });
  });
  schedule(CLAIMS_AT, () => {
    setAttr(CLAIMS_AT, 'stage', 'data-bt-claims', 'on');
    setAttr(CLAIMS_AT, 'stage', 'data-bt-seg', 'all');
    cue(CLAIMS_AT, 'state');
  });
  schedule(B64_AT, () => {
    setAttr(B64_AT, 'stage', 'data-bt-b64', 'on');
    cue(B64_AT, 'state');
  });

  schedule(LEAK_AT, () => {
    attackerToken = clientToken;
  });
  schedule(ATTACKER_ON_AT, () => {
    setAttr(ATTACKER_ON_AT, 'stage', 'data-bt-attacker', 'on');
    cue(ATTACKER_ON_AT, 'state');
  });
  schedule(ATTACKER_OFF_AT, () => {
    setAttr(ATTACKER_OFF_AT, 'stage', 'data-bt-attacker', 'off');
  });

  schedule(REVOKE_AT, () => {
    revoked.add(clientToken.id);
    setAttr(REVOKE_AT, 'stage', 'data-bt-jti', 'on');
    setAttr(REVOKE_AT, 'stage', 'data-bt-revoked', 'on');
    cue(REVOKE_AT, 'trip');
  });
  schedule(ROTATE_AT, () => {
    setAttr(ROTATE_AT, 'stage', 'data-bt-rotate', 'on');
    issue(ROTATE_AT, 'fresh');
    cue(ROTATE_AT, 'trip');
  });

  // The countdown on the token the scene opens holding.
  bookCountdown(clientToken, 0);

  for (const [at, carries] of CLIENT_SCHEDULE) schedule(at, () => send('client', at, carries));
  for (const at of ATTACKER_SCHEDULE) schedule(at, () => send('attacker', at, true));

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

  return { attrs, flights, cues, totals: { ok: okCount, fail: failCount } };
}

// --- the timeline ---------------------------------------------------------

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const targets: Record<string, Element> = { stage };
  for (const gate of GATES) {
    targets[`gate-${gate}`] = q<SVGGElement>(stage, `.bt-gate--${gate}`, ID);
  }

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);
  const sim = simulate();
  if (sim.totals.ok > OK_MAX || sim.totals.fail > FAIL_MAX) {
    throw new Error(
      `${ID} scene: counters reach ${sim.totals.ok}/${sim.totals.fail}, past the stacks the stage wrote`,
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

  // Two lanes, and a request only ever runs the length of its own. A Client
  // call leaves the Client's bottom edge and stops on the API's top edge; the
  // Attacker's leaves its own top edge and climbs to the API's bottom edge.
  sim.flights.forEach((flight, index) => {
    const request = parts[index];
    if (!request) return;
    const fromClient = flight.from === 'client';
    const lane = fromClient ? LANE_CLIENT : LANE_ATTACKER;
    const start = fromClient ? CLIENT_BOTTOM : ATT_TOP;
    const end = fromClient ? NODE_TOP : NODE_BOTTOM;

    parkRequest(request, lane, start);
    showRequest(tl, request, flight.depart);
    moveRequest(tl, request, end, round(flight.arrive - flight.depart), flight.depart);
    markRequest(tl, request, flight.ok ? 'ok' : 'fail', flight.verdict);
    hideRequest(tl, request, flight.verdict, FADE);
  });

  // --- sound --------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels --------------------------------------------------------

  // The stage is complete on the first frame: the Client is holding a token and
  // the call that will carry it, the gate row is drawn and idle, both counters
  // read zero, and the token is laid out in three parts at the bottom.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
