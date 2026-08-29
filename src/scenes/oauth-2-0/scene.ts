import gsap from 'gsap';
import {
  ACCESS_TTL,
  BAR_W,
  LOW_WATER,
  MAX_OK,
  SCENE_DURATION,
  STAGE_STATE,
  X_API,
  X_AUTH,
  Y_APP_BOTTOM,
  Y_MID_BOTTOM,
  Y_MID_TOP,
  Y_USER_TOP,
} from './stage';
import type { Mark } from './stage';
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
 * OAuth 2.0 scene: a 24 second, four step timeline.
 *
 * The same two rules as every other scene: every tween sits at an absolute
 * position, and every discrete change is a zero-duration tween on a `data-*`
 * attribute that GSAP reverts when the playhead moves back past it. The one
 * thing that is drawn rather than switched is the `expires` bar, because a
 * token's remaining life is a genuinely continuous quantity and watching it run
 * out is half of what the third step is about.
 *
 * Nothing the reader counts is authored. The scene is told eight things: when
 * the password ghost appears and when it is dismissed, when each of the two
 * logins starts and which scopes it asks for, how long an access token lives,
 * when the App calls the API, when it redeems its refresh token, when the
 * stolen copy of the old refresh token is replayed, when the scene holds
 * something up, and when it settles.
 *
 * Everything else falls out of one pass. The expiry moment is the issue time
 * plus the lifetime; `401` is what a call gets when it arrives after that
 * moment; the rotation index is how many times the family has been redeemed;
 * the family-wide revocation is what the server does when a refresh token it
 * has already seen comes back; and `ok` is the count of calls that carried a
 * token that was actually alive. The theft is not scripted to be caught — it is
 * caught because the ticket it presents is one the server has already spent.
 */

const ID = 'oauth-2-0';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- how a traveller moves ------------------------------------------------

/** One speed for every leg any traveller takes, in pixels per second. */
const SPEED = 1000;

/** The two top lanes, App to Auth Server and App to API, both 200px. */
const LEG_TOP = round((Y_MID_TOP - Y_APP_BOTTOM) / SPEED);
/** The consent lane, Auth Server down to the User. */
const LEG_USER = round((Y_USER_TOP - Y_MID_BOTTOM) / SPEED);
/** How long a traveller takes to go once it has arrived. */
const FADE = 0.12;
/** How long an API call is held while the API checks what it was given. */
const DWELL_OK = 0.3;
/** A refusal comes back faster, because nothing had to be looked up. */
const DWELL_FAIL = 0.15;
/** How long the server takes to decide a replayed refresh token is a replay. */
const DWELL_STEAL = 0.3;

// --- what the scene is told -----------------------------------------------

/** The old way: the App holding a password, and the moment OAuth replaces it. */
const GHOST_AT = 0.5;
const GHOST_OFF = 1.4;
/** The first step argues the shape of delegation before the second runs it. */
const DEMO_CONSENT_REQUEST = 2.0;
const DEMO_CONSENT = 2.8;
const DEMO_SCOPE = 3.6;
const DEMO_NEVER = 4.6;
/** Where the argument is cleared, so the real login starts from nothing. */
const DEMO_CLEAR = 5.4;

interface Login {
  /** When the App sends the user to the authorization server. */
  start: number;
  /** The first login walks the code flow; the second is a re-authentication. */
  full: boolean;
  /** Whether `openid` is among the scopes asked for. */
  openid: boolean;
}

/** The two times the user is sent to the authorization server. */
const LOGINS: Login[] = [
  { start: 6.4, full: true, openid: false },
  { start: 18.4, full: false, openid: true },
];

/** When the App calls the API. Whether the call works is not authored. */
const CALLS = [9.2, 10.5, 13.85, 15.6, 20.1, 21.7];

/** When the App redeems the refresh token it is holding. */
const REFRESH_AT = 14.7;
/** When somebody replays the copy of the refresh token they stole. */
const REPLAY_AT = 16.6;

/** The beat between an id token landing and the App reading it out loud. */
const CARD_DELAY = 0.5;

/** The three things the scene holds up, and how long each is held for. */
const MARK_AT: [number, Mark, number][] = [
  [10.4, 'expiry', 0.7],
  [17.5, 'once', 0.4],
  [21.4, 'identity', 0.6],
];

/** When the picture is called settled: three tokens held, the alarm reset. */
const SETTLE_AT = 22.7;

/** The shortest gap between any two cues, and how quiet a step boundary is. */
const MIN_CUE_GAP = 0.2;
const BOUNDARY_GAP = 0.3;
const BOUNDARIES = [0, 6, 12, 18, 24];
const EPS = 1e-6;

// --- what the simulation produces -----------------------------------------

/** One discrete change. Every one of them is written on the stage root. */
interface AttrChange {
  at: number;
  name: string;
  value: string;
}

/** One leg of a journey: where it goes and how long it takes. */
interface Leg {
  to: number;
  at: number;
  duration: number;
}

/** How a traveller is drawn: an ordinary dot, the old way, or a stolen ticket. */
type Kind = 'plain' | 'ghost' | 'steal';

interface Journey {
  x: number;
  y: number;
  kind: Kind;
  /** A word that rides with the dot, on the side that keeps it on the stage. */
  label?: { text: string; side: 'left' | 'right' };
  showAt: number;
  legs: Leg[];
  mark: { result: RequestResult; at: number } | null;
  fadeAt: number;
}

/** One run of the life bar: the width it sweeps and the seconds it takes. */
interface LifeSweep {
  at: number;
  until: number;
  from: number;
  to: number;
}

interface Simulation {
  attrs: AttrChange[];
  cues: [number, SceneCue][];
  journeys: Journey[];
  life: LifeSweep[];
  /** Moments the bar is emptied outright, because a token was killed early. */
  lifeZeros: number[];
  ok: number;
  denials: number;
  /** When the family was revoked, which has to be inside the third step. */
  revokedAt: number;
}

/** The life bar's current run, open until the token it belongs to dies. */
type Sweep = { at: number; issuedAt: number } | null;

/** One access token, which is the only thing in the scene that expires. */
interface Access {
  issuedAt: number;
  family: number;
  expiresAt: number;
  dead: boolean;
}

// --- the simulation -------------------------------------------------------

function simulate(): Simulation {
  const raw: AttrChange[] = [];
  const fixed: [number, SceneCue][] = [];
  const journeys: Journey[] = [];
  const life: LifeSweep[] = [];
  const lifeZeros: number[] = [];
  const problems: string[] = [];

  const setAttr = (at: number, name: string, value: string): void => {
    raw.push({ at: round(at), name, value });
  };
  const cue = (at: number, name: SceneCue): void => {
    fixed.push([round(at), name]);
  };

  /** A dot travelling one lane, from `y` to `to`, at one speed. */
  const travel = (
    x: number,
    y: number,
    to: number,
    at: number,
    duration: number,
    kind: Kind = 'plain',
    label?: { text: string; side: 'left' | 'right' },
  ): Journey => {
    const journey: Journey = {
      x,
      y,
      kind,
      label,
      showAt: round(at),
      legs: [{ to, at: round(at), duration }],
      mark: null,
      fadeAt: round(at + duration),
    };
    journeys.push(journey);
    return journey;
  };

  let access: Access | null = null;
  let family = 0;
  let index = 0;
  let ok = 0;
  let denials = 0;
  let scopeShown = false;
  let revokedAt: number | null = null;
  /** Every refresh token ever spent, so a second use of one is visible. */
  const spent = new Set<string>();
  const revokedFamilies = new Set<number>();
  /** The sweep the life bar is running, still waiting for the token to die. */
  let openSweep: Sweep = null;

  // Everything above is written from inside scheduled tasks, so what these two
  // hold once the pass is over is only knowable through a read.
  const heldAccess = (): Access | null => access;
  const heldSweep = (): Sweep => openSweep;

  const { schedule, drain } = createScheduler();

  /** Closes the life bar's run at the moment the token it belonged to died. */
  const endLife = (at: number, zero: boolean): void => {
    if (!openSweep) return;
    const spentFraction = Math.min(1, (at - openSweep.issuedAt) / ACCESS_TTL);
    const width = round(BAR_W * (1 - spentFraction));
    // A revocation stops the bar early, so the run ends on the width the token
    // still had and a separate change empties it a frame later. Keeping the two
    // apart is what stops one instant from depending on the scrub direction.
    const until = zero ? round(at - 0.01) : round(at);
    life.push({ at: openSweep.at, until: Math.max(until, openSweep.at + 0.01), from: BAR_W, to: width });
    if (zero) lifeZeros.push(round(at));
    openSweep = null;
  };

  /** The access token's own clock running out, which is the design working. */
  const expire = (at: number): void => {
    if (!access || access.dead) return;
    access.dead = true;
    setAttr(at, 'data-oa-access', 'expired');
    setAttr(at, 'data-oa-life', 'spent');
    endLife(at, false);
    cue(at, 'state');
  };

  /**
   * What the server does when a refresh token it has already spent comes back:
   * it cannot tell the thief from the app, so it assumes the worst and kills
   * everything descended from that login.
   */
  const revokeFamily = (at: number, which: number): void => {
    revokedFamilies.add(which);
    revokedAt = at;
    setAttr(at, 'data-oa-revoked', 'on');
    setAttr(at, 'data-oa-refresh', 'revoked');
    setAttr(at, 'data-oa-family', '0');
    setAttr(at, 'data-oa-consent', 'off');
    if (access && !access.dead && access.family === which) {
      access.dead = true;
      setAttr(at, 'data-oa-access', 'revoked');
      setAttr(at, 'data-oa-life', 'none');
      endLife(at, true);
    }
    cue(at, 'failure');
  };

  /** Starts the clock on a freshly issued access token. */
  const startAccess = (at: number): void => {
    access = { issuedAt: at, family, expiresAt: round(at + ACCESS_TTL), dead: false };
    openSweep = { at, issuedAt: at };
    setAttr(at, 'data-oa-life', 'live');
    const low = round(at + ACCESS_TTL * LOW_WATER);
    const dead = round(at + ACCESS_TTL);
    const mine = access;
    schedule(low, () => {
      if (access !== mine || mine.dead || low > SCENE_DURATION) return;
      setAttr(low, 'data-oa-life', 'low');
      // A warning after the picture has settled is a colour, not an event.
      if (low < SETTLE_AT) cue(low, 'state');
    });
    schedule(dead, () => {
      if (access !== mine || mine.dead || dead > SCENE_DURATION) return;
      expire(dead);
    });
  };

  /** A login that finished: a new family, and the first token of it. */
  const issueFromLogin = (at: number, login: Login): void => {
    family += 1;
    index = 1;
    setAttr(at, 'data-oa-access', 'live');
    setAttr(at, 'data-oa-refresh', 'live');
    setAttr(at, 'data-oa-family', String(index));
    setAttr(at, 'data-oa-401', 'off');
    if (login.openid) {
      setAttr(at, 'data-oa-id', 'live');
      // The card is the App reading the token, which is a beat after holding it.
      const readAt = round(at + CARD_DELAY);
      schedule(readAt, () => {
        setAttr(readAt, 'data-oa-idcard', 'on');
        cue(readAt, 'state');
      });
    }
    startAccess(at);
    cue(at, 'success');
  };

  /** A redemption that was accepted: the same family, one index further on. */
  const rotate = (at: number): void => {
    index += 1;
    setAttr(at, 'data-oa-access', 'live');
    setAttr(at, 'data-oa-refresh', 'live');
    setAttr(at, 'data-oa-family', String(index));
    setAttr(at, 'data-oa-401', 'off');
    startAccess(at);
    cue(at, 'success');
  };

  /**
   * Presenting a refresh token. The ticket is a family and an index, and the
   * server's whole rule is that it accepts each one exactly once.
   */
  const present = (at: number, ticket: { family: number; index: number }): boolean => {
    const key = `${ticket.family}:${ticket.index}`;
    if (revokedFamilies.has(ticket.family) || spent.has(key)) {
      revokeFamily(at, ticket.family);
      return false;
    }
    spent.add(key);
    return true;
  };

  // --- the first step: the argument ---------------------------------------

  schedule(GHOST_AT, () => {
    setAttr(GHOST_AT, 'data-oa-ghost', 'on');
    cue(GHOST_AT, 'state');
  });
  const ghost = travel(X_API, Y_APP_BOTTOM, Y_MID_TOP, GHOST_AT, LEG_TOP, 'ghost');
  ghost.fadeAt = GHOST_OFF;

  schedule(GHOST_OFF, () => {
    setAttr(GHOST_OFF, 'data-oa-ghost', 'off');
    cue(GHOST_OFF, 'trip');
  });

  schedule(DEMO_CONSENT_REQUEST, () => {
    travel(X_AUTH, Y_MID_BOTTOM, Y_USER_TOP, DEMO_CONSENT_REQUEST, LEG_USER);
    cue(DEMO_CONSENT_REQUEST, 'state');
  });

  schedule(DEMO_CONSENT, () => {
    setAttr(DEMO_CONSENT, 'data-oa-consent', 'on');
    cue(DEMO_CONSENT, 'state');
  });

  schedule(DEMO_SCOPE, () => {
    setAttr(DEMO_SCOPE, 'data-oa-scope', 'read');
    cue(DEMO_SCOPE, 'state');
  });

  schedule(DEMO_NEVER, () => {
    setAttr(DEMO_NEVER, 'data-oa-ghost', 'never');
    cue(DEMO_NEVER, 'state');
  });

  schedule(DEMO_CLEAR, () => {
    setAttr(DEMO_CLEAR, 'data-oa-ghost', 'off');
    setAttr(DEMO_CLEAR, 'data-oa-consent', 'off');
    setAttr(DEMO_CLEAR, 'data-oa-scope', 'none');
  });

  // --- the logins ----------------------------------------------------------

  for (const login of LOGINS) {
    const s = login.start;
    schedule(s, () => {
      travel(X_AUTH, Y_APP_BOTTOM, Y_MID_TOP, s, LEG_TOP);
      cue(s, login.full ? 'state' : 'trip');
      if (login.openid) setAttr(round(s + LEG_TOP), 'data-oa-openid', 'on');
    });

    const askAt = round(s + (login.full ? 0.4 : 0.35));
    schedule(askAt, () => {
      travel(X_AUTH, Y_MID_BOTTOM, Y_USER_TOP, askAt, LEG_USER);
      cue(askAt, 'state');
    });

    const consentAt = round(s + (login.full ? 0.7 : 0.65));
    schedule(consentAt, () => {
      setAttr(consentAt, 'data-oa-consent', 'on');
      cue(consentAt, 'state');
    });

    if (login.full) {
      const codeAt = round(s + 1.0);
      schedule(codeAt, () => {
        travel(X_AUTH, Y_MID_TOP, Y_APP_BOTTOM, codeAt, LEG_TOP, 'plain', {
          text: 'code',
          side: 'right',
        });
        cue(codeAt, 'state');
      });
      const swapAt = round(s + 1.4);
      schedule(swapAt, () => {
        travel(X_AUTH, Y_APP_BOTTOM, Y_MID_TOP, swapAt, LEG_TOP, 'plain', {
          text: 'code',
          side: 'right',
        });
        cue(round(swapAt + LEG_TOP), 'success');
      });
    }

    const sendAt = round(s + (login.full ? 1.8 : 0.7));
    const landAt = round(sendAt + LEG_TOP);
    schedule(sendAt, () => {
      travel(X_AUTH, Y_MID_TOP, Y_APP_BOTTOM, sendAt, LEG_TOP);
    });
    schedule(landAt, () => issueFromLogin(landAt, login));
  }

  // --- the calls -----------------------------------------------------------

  for (const start of CALLS) {
    schedule(start, () => {
      const arriveAt = round(start + LEG_TOP);
      const live =
        access !== null &&
        !access.dead &&
        arriveAt < access.expiresAt &&
        !revokedFamilies.has(access.family);
      const dwell = live ? DWELL_OK : DWELL_FAIL;
      const markAt = round(arriveAt + dwell);
      const homeAt = round(markAt + LEG_TOP);
      journeys.push({
        x: X_API,
        y: Y_APP_BOTTOM,
        kind: 'plain',
        showAt: start,
        legs: [
          { to: Y_MID_TOP, at: start, duration: LEG_TOP },
          { to: Y_APP_BOTTOM, at: markAt, duration: LEG_TOP },
        ],
        mark: { result: live ? 'ok' : 'fail', at: markAt },
        fadeAt: homeAt,
      });

      if (live && !scopeShown) {
        scopeShown = true;
        setAttr(arriveAt, 'data-oa-scope', 'read');
        cue(arriveAt, 'state');
      }

      schedule(markAt, () => {
        if (live) {
          ok += 1;
          setAttr(markAt, 'data-oa-ok', String(ok));
          cue(markAt, 'success');
          if (access && revokedFamilies.has(access.family)) {
            problems.push(`${markAt} a call succeeded on a revoked family`);
          }
        } else {
          denials += 1;
          setAttr(markAt, 'data-oa-401', 'on');
          cue(markAt, 'failure');
        }
      });
    });
  }

  // --- the redemption, and the replay of the ticket it spent ---------------

  schedule(REFRESH_AT, () => {
    travel(X_AUTH, Y_APP_BOTTOM, Y_MID_TOP, REFRESH_AT, LEG_TOP);
    cue(REFRESH_AT, 'trip');
    const arriveAt = round(REFRESH_AT + LEG_TOP);
    const ticket = { family, index };
    schedule(arriveAt, () => {
      if (!present(arriveAt, ticket)) return;
      const sendAt = round(arriveAt + 0.2);
      const landAt = round(sendAt + LEG_TOP);
      travel(X_AUTH, Y_MID_TOP, Y_APP_BOTTOM, sendAt, LEG_TOP);
      schedule(landAt, () => rotate(landAt));
    });
  });

  schedule(REPLAY_AT, () => {
    const arriveAt = round(REPLAY_AT + LEG_TOP);
    const markAt = round(arriveAt + DWELL_STEAL);
    const homeAt = round(markAt + LEG_TOP);
    journeys.push({
      x: X_AUTH,
      y: Y_APP_BOTTOM,
      kind: 'steal',
      label: { text: 'reuse', side: 'left' },
      showAt: REPLAY_AT,
      legs: [
        { to: Y_MID_TOP, at: REPLAY_AT, duration: LEG_TOP },
        { to: Y_APP_BOTTOM, at: markAt, duration: LEG_TOP },
      ],
      mark: { result: 'fail', at: markAt },
      fadeAt: homeAt,
    });
    cue(REPLAY_AT, 'state');
    // The stolen copy is the first refresh token of the first family, which is
    // exactly the one the app already redeemed. Nothing here decides that it
    // will be caught; the server catches it because the ticket is spent.
    schedule(markAt, () => {
      if (present(markAt, { family: 1, index: 1 })) {
        problems.push(`${markAt} the replayed refresh token was accepted`);
      }
    });
  });

  // --- what the scene holds up, and where it stops -------------------------

  for (const [at, value, hold] of MARK_AT) {
    schedule(at, () => {
      setAttr(at, 'data-oa-mark', value);
      cue(at, 'state');
    });
    schedule(round(at + hold), () => setAttr(round(at + hold), 'data-oa-mark', 'none'));
  }

  schedule(SETTLE_AT, () => {
    setAttr(SETTLE_AT, 'data-oa-settled', 'on');
    setAttr(SETTLE_AT, 'data-oa-revoked', 'off');
    cue(SETTLE_AT, 'success');
  });

  drain();

  // The last token is still alive when the scene stops, so its bar has to be
  // swept all the way to the end rather than left hanging on a dead tween.
  const lastSweep = heldSweep();
  if (lastSweep) {
    const spentFraction = Math.min(1, (SCENE_DURATION - lastSweep.issuedAt) / ACCESS_TTL);
    life.push({
      at: lastSweep.at,
      until: SCENE_DURATION,
      from: BAR_W,
      to: round(BAR_W * (1 - spentFraction)),
    });
    openSweep = null;
  }

  // --- what has to be true for the picture to mean anything ---------------

  if (ok !== MAX_OK) problems.push(`${ok} calls were let through, the stage draws ${MAX_OK}`);
  if (denials !== 1) problems.push(`${denials} calls were refused, the scene tells one story about that`);
  if (revokedAt === null) problems.push('the replayed refresh token never revoked its family');
  else if (revokedAt < 12 || revokedAt >= 18) {
    problems.push(`the family was revoked at ${revokedAt}, outside the third step`);
  }
  if (family !== 2) problems.push(`${family} families were issued, the scene tells two logins`);
  if (spent.size !== 1) problems.push(`${spent.size} refresh tokens were spent, expected one`);
  const held = heldAccess();
  if (held === null || held.dead) problems.push('the scene ends without a live access token');
  else if (held.family !== 2) problems.push('the scene ends holding a token of the revoked family');
  if (problems.length > 0) throw new Error(`${ID} scene: ${problems.join('; ')}`);

  // --- the cues -----------------------------------------------------------

  const cues: [number, SceneCue][] = [];
  for (const entry of [...fixed].sort((left, right) => left[0] - right[0])) {
    if (BOUNDARIES.some((edge) => Math.abs(entry[0] - edge) < BOUNDARY_GAP - EPS)) continue;
    const previous = cues[cues.length - 1];
    if (previous && entry[0] - previous[0] < MIN_CUE_GAP - EPS) continue;
    cues.push(entry);
  }

  // --- the discrete changes, in time order and collapsed ------------------

  const inTimeOrder = raw
    .map((entry, order) => ({ entry, order }))
    .sort((left, right) => left.entry.at - right.entry.at || left.order - right.order)
    .map(({ entry }) => entry);

  const folded: AttrChange[] = [];
  for (const entry of inTimeOrder) collapseAtInstant(folded, entry, (change) => change.name);

  const seen = new Map<string, string>(Object.entries(STAGE_STATE));
  const attrs: AttrChange[] = [];
  for (const change of folded) {
    if (seen.get(change.name) === change.value) continue;
    seen.set(change.name, change.value);
    attrs.push(change);
  }

  journeys.sort((left, right) => left.showAt - right.showAt);
  life.sort((left, right) => left.at - right.at);

  lifeZeros.sort((left, right) => left - right);

  return { attrs, cues, journeys, life, lifeZeros, ok, denials, revokedAt: revokedAt ?? 0 };
}

// --- the timeline ---------------------------------------------------------

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);
  const fill = q<SVGRectElement>(stage, '.oa-life-fill', ID);
  const sim = simulate();

  const parts = mountRequests(layer, sim.journeys.length, ID);

  const tl = createSceneTimeline();

  // --- discrete state -----------------------------------------------------

  for (const change of sim.attrs) attr(tl, stage, change.name, change.value, change.at);

  // --- the one continuous readout -----------------------------------------

  gsap.set(fill, { attr: { width: 0 } });
  for (const sweep of sim.life) {
    tl.fromTo(
      fill,
      { attr: { width: sweep.from } },
      {
        attr: { width: sweep.to },
        duration: Math.max(round(sweep.until - sweep.at), 0.01),
        ease: 'none',
        immediateRender: false,
      },
      sweep.at,
    );
  }
  for (const at of sim.lifeZeros) {
    tl.set(fill, { attr: { width: 0 }, immediateRender: false }, at);
  }

  // --- what travels -------------------------------------------------------

  sim.journeys.forEach((journey, index) => {
    const request: RequestParts | undefined = parts[index];
    if (!request) return;

    if (journey.kind !== 'plain') request.group.classList.add(`oa-req-${journey.kind}`);

    if (journey.label) {
      const left = journey.label.side === 'left';
      const label = attachToRequest(
        request,
        'text',
        {
          class: 'scene-req-label oa-tag',
          x: left ? '-36' : '36',
          y: '9',
          ...(left ? { 'text-anchor': 'end' } : {}),
        },
        journey.label.text,
      );
      gsap.set(label, { opacity: 1 });
    }

    parkRequest(request, journey.x, journey.y);
    showRequest(tl, request, journey.showAt);
    for (const leg of journey.legs) {
      tl.to(
        request.group,
        { y: leg.to, duration: leg.duration, ease: 'none', immediateRender: false },
        leg.at,
      );
    }
    if (journey.mark) markRequest(tl, request, journey.mark.result, journey.mark.at);
    hideRequest(tl, request, journey.fadeAt, FADE);
  });

  // --- sound --------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels --------------------------------------------------------

  // The stage is complete on the first frame: an App with an empty wallet, a
  // server that has issued nothing, an API that has answered nothing, a User
  // who has not been asked, and nothing in flight.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
