import gsap from 'gsap';
import {
  LIFE_WIDTH,
  MAX_OK,
  POD_IDS,
  RESOURCE_IDS,
  ROLE_MAP,
  SCENE_DURATION,
  STAGE_STATE,
  X_ACCESS,
  X_CLOUD,
  X_PLATFORM,
  Y_MID_BOTTOM,
  Y_MID_TOP,
  Y_PODS_BOTTOM,
  Y_RES_TOP,
  podName,
} from './stage';
import type { Mark, PodId, ResourceId } from './stage';
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
 * Workload Identity scene: a 24 second, four step timeline.
 *
 * The same two rules as every other scene: every tween sits at an absolute
 * position, and every discrete change is a zero-duration tween on a `data-*`
 * attribute that GSAP reverts when the playhead moves back past it. The one
 * continuous quantity is a token's remaining life, and it is a width rather
 * than a colour so that scrubbing lands on a length instead of on a blend.
 *
 * Nothing the reader counts is authored. The scene is told eight things: when
 * the world of stored secrets is held up and dropped, when the copies of that
 * secret fan out and when the alarm peaks, when each pod starts, how long an
 * issued token lives and how long before expiry the platform replaces it, which
 * token is presented to the cloud and who each one was minted for, which
 * workload reaches for which resource, the map from workload to role, and the
 * four moments the captions stop on.
 *
 * Everything else falls out of one pass. A pod's token mounts one flight after
 * its birth notice lands; the next re-issue is booked the moment a token is
 * mounted, which is what makes rotation the default rather than an event; the
 * bar is what is left of the life the mount started; an exchange passes exactly
 * when the issuer is the one the cloud trusts *and* the audience names the
 * cloud, and is refused otherwise; an access passes exactly when the role map
 * gives that resource to that workload; `ok` is the count of everything that
 * passed. The refusal in the third step is not scripted to happen — it happens
 * because that token names somebody else, which is the only thing in the scene
 * that ever refuses an exchange, and the refusal in the fourth step happens
 * because the role map gives the database to the other workload.
 *
 * The two refusals are deliberately different failures and the scene keeps them
 * apart: the issuer stays trusted through the audience refusal, because the
 * token was genuine and simply not addressed to this cloud, and the role
 * refusal touches no token at all. Nothing anywhere in the scene is stored: the
 * pods hold a secret only while the first step's ghost is up, and from the
 * moment it drops the only credential on the stage is one the platform issued.
 */

const ID = 'workload-identity';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- how a traveller moves -------------------------------------------------

/** One speed for every leg any traveller takes, in pixels per second. */
const SPEED = 1250;

/** A flight between the Pods band and the middle band. */
const LEG_BAND = round((Y_MID_TOP - Y_PODS_BOTTOM) / SPEED);
/** A flight from the middle band down to the Resources band. */
const LEG_ACCESS = round((Y_RES_TOP - Y_MID_BOTTOM) / SPEED);
/** How long a traveller that carried no verdict takes to go. */
const FADE = 0.14;
/** A verdict is held longer, because the reader is meant to read it. */
const MARK_FADE = 0.3;

// --- what the scene is told ------------------------------------------------

/** The world where the credential is a string somebody wrote down. */
const GHOST_AT = 0.5;
const SPREAD_AT = 1.3;
const ALARM_AT = 2.1;
const GHOST_OFF = 3.0;

/**
 * When each workload starts. That is the whole of what the platform is told:
 * it started the pod, so it knows which workload this is, and the token follows
 * from the start rather than from anybody configuring anything.
 *
 * The odd hundredth is deliberate. Every re-issue is one instant where a
 * draining bar ends and a full one begins, and a sampling grid that landed
 * exactly on such an instant would read the frame differently depending on
 * which way it was scrubbed. Starting off the grid keeps every re-issue between
 * two samples instead of on one.
 */
const POD_STARTS: { pod: PodId; at: number }[] = [
  { pod: 'a', at: 6.51 },
  { pod: 'b', at: 8.81 },
];

/** How long an issued token lives, and how much of that life is never used. */
const TOKEN_TTL = 3.4;
const RENEW_LEAD = 0.36;

/** Which cloud a token has to name to be worth anything here. */
const CLOUD_AUDIENCE = 'cloud';

/** One token held up to the cloud, and the audience it was minted for. */
interface ExchangePlan {
  /** When the pod raises the token, which the reader sees on the capsule. */
  raise: number;
  /** When the token reaches the cloud. */
  arrive: number;
  /** How long the cloud spends on it before it says anything. */
  dwell: number;
  pod: PodId;
  audience: string;
}

/**
 * The two exchanges. Nothing here says what the answer is: each token lands, the
 * two names on it are read, and the answer is whatever they say. The second one
 * came from the same trusted issuer as the first, which is exactly why the
 * audience is the name that has to be checked.
 */
const EXCHANGES: ExchangePlan[] = [
  { raise: 12.5, arrive: 13.4, dwell: 1.0, pod: 'a', audience: CLOUD_AUDIENCE },
  { raise: 15.6, arrive: 16.4, dwell: 0, pod: 'b', audience: 'other' },
];

/** Every reach for a resource. The role map, not this list, decides each one. */
const ACCESSES: { at: number; pod: PodId; resource: ResourceId }[] = [
  { at: 19.4, pod: 'a', resource: 'storage' },
  { at: 20.2, pod: 'b', resource: 'db' },
  { at: 21.0, pod: 'a', resource: 'db' },
];

/** When the role map is drawn on the resources it is a map of. */
const ROLES_AT = 18.5;

/** How long a refusal stays up, long enough to read and no longer. */
const DENY_HOLD = 0.8;
const CROSS_HOLD = 0.6;

/** The six things the scene holds up, and how long each is held for. */
const MARK_AT: [number, Mark, number][] = [
  [4.0, 'clean', 0.6],
  [4.8, 'issued', 0.6],
  [7.6, 'life', 0.6],
  [10.9, 'nohands', 0.6],
  [17.0, 'federation', 0.6],
  [21.8, 'share', 0.5],
];

/** When the picture is called settled: each workload holding its own share. */
const SETTLE_AT = 22.4;

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
type Kind = 'birth' | 'mount' | 'renew' | 'present' | 'foreign' | 'access';

interface Journey {
  x: number;
  y: number;
  to: number;
  kind: Kind;
  /** The workload the traveller belongs to, which rides with the dot. */
  label: string;
  showAt: number;
  duration: number;
  mark: RequestResult | null;
  /** When the dot stops moving, and when its verdict is written. */
  landAt: number;
  markAt: number;
}

/** One life of one token: from the moment it mounts to the moment it is replaced. */
interface Life {
  pod: PodId;
  from: number;
  to: number;
}

interface Simulation {
  changes: AttrChange[];
  cues: [number, SceneCue][];
  journeys: Journey[];
  lives: Life[];
  ok: number;
  denials: { at: number; reason: 'audience' | 'role' }[];
}

// --- the simulation --------------------------------------------------------

function simulate(): Simulation {
  const raw: AttrChange[] = [];
  const fixed: [number, SceneCue][] = [];
  const journeys: Journey[] = [];
  const lives: Life[] = [];
  const problems: string[] = [];

  const setAttr = (at: number, target: string, name: string, value: string): void => {
    raw.push({ at: round(at), target, name, value });
  };
  const cue = (at: number, name: SceneCue): void => {
    fixed.push([round(at), name]);
  };

  /** When each pod's current token was issued. Absent means it holds nothing. */
  const issuedAt = new Map<PodId, number>();
  /** Whether the cloud has decided the platform's issuer is one it trusts. */
  let issuerTrusted = false;
  let ok = 0;
  const okSeries: number[] = [];
  const denials: { at: number; reason: 'audience' | 'role' }[] = [];
  /** Every verdict the scene reached, for the assertions below. */
  const exchanged: { at: number; pod: PodId; audience: string; passed: boolean }[] = [];
  const reached: { at: number; pod: PodId; resource: ResourceId; passed: boolean }[] = [];
  const reissues: { pod: PodId; at: number; age: number }[] = [];

  const travel = (
    x: number,
    y: number,
    to: number,
    landAt: number,
    duration: number,
    kind: Kind,
    label: string,
    mark: RequestResult | null,
    markAt?: number,
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
      markAt: round(markAt ?? landAt),
    });
  };

  /** How much of a pod's token is left at `at`, in seconds. */
  const remaining = (pod: PodId, at: number): number => {
    const since = issuedAt.get(pod);
    return since === undefined ? -1 : TOKEN_TTL - (at - since);
  };

  const { schedule, drain } = createScheduler();

  /** The mint lights while a token is on its way up the lane, and no longer. */
  const mintWindow = (from: number, to: number): void => {
    setAttr(from, 'stage', 'data-wi-mint', 'issue');
    setAttr(to, 'stage', 'data-wi-mint', 'idle');
  };

  /**
   * A token arriving at a pod. Mounting one books the next one, which is the
   * whole of what "rotation is the default state of the world" means here:
   * nothing outside this function ever decides that a token should be replaced.
   */
  const mount = (pod: PodId, at: number, first: boolean): void => {
    const previous = issuedAt.get(pod);
    if (previous !== undefined) {
      reissues.push({ pod, at, age: round(at - previous) });
      lives.push({ pod, from: previous, to: at });
      // The scene stops on the first replacement, because that is the moment
      // the argument lands. Every one after it is the same event again, and a
      // world where rotation is ordinary should not announce it every time.
      if (reissues.length === 1) cue(at, 'success');
    }
    issuedAt.set(pod, at);
    if (first) setAttr(at, `pod-${pod}`, 'data-wi-cred', 'token');

    const next = round(at + TOKEN_TTL - RENEW_LEAD);
    if (next >= SCENE_DURATION) return;
    const leaves = round(next - LEG_BAND);
    schedule(leaves, () => {
      mintWindow(leaves, next);
      travel(X_PLATFORM, Y_MID_TOP, Y_PODS_BOTTOM, next, LEG_BAND, 'renew', podName(pod), null);
    });
    schedule(next, () => mount(pod, next, false));
  };

  // --- the world of stored secrets ----------------------------------------

  schedule(GHOST_AT, () => {
    setAttr(GHOST_AT, 'stage', 'data-wi-ghost', 'on');
    for (const pod of POD_IDS) setAttr(GHOST_AT, `pod-${pod}`, 'data-wi-cred', 'secret');
    cue(GHOST_AT, 'state');
  });

  schedule(SPREAD_AT, () => {
    for (const pod of POD_IDS) setAttr(SPREAD_AT, `pod-${pod}`, 'data-wi-spread', 'on');
    cue(SPREAD_AT, 'state');
  });

  schedule(ALARM_AT, () => {
    setAttr(ALARM_AT, 'stage', 'data-wi-alarm', 'on');
    cue(ALARM_AT, 'failure');
  });

  schedule(GHOST_OFF, () => {
    setAttr(GHOST_OFF, 'stage', 'data-wi-ghost', 'off');
    setAttr(GHOST_OFF, 'stage', 'data-wi-alarm', 'off');
    for (const pod of POD_IDS) {
      setAttr(GHOST_OFF, `pod-${pod}`, 'data-wi-cred', 'none');
      setAttr(GHOST_OFF, `pod-${pod}`, 'data-wi-spread', 'off');
    }
    cue(GHOST_OFF, 'trip');
  });

  // --- identity issued at birth -------------------------------------------

  for (const start of POD_STARTS) {
    schedule(start.at, () => {
      const landed = round(start.at + LEG_BAND);
      travel(X_PLATFORM, Y_PODS_BOTTOM, Y_MID_TOP, landed, LEG_BAND, 'birth', podName(start.pod), null);
      // The platform answers only once the birth notice is off the column, so
      // the lane carries one traveller at a time in either direction.
      const leaves = round(landed + FADE);
      const arrives = round(leaves + LEG_BAND);
      schedule(leaves, () => {
        mintWindow(leaves, arrives);
        travel(X_PLATFORM, Y_MID_TOP, Y_PODS_BOTTOM, arrives, LEG_BAND, 'mount', podName(start.pod), null);
      });
      schedule(arrives, () => {
        mount(start.pod, arrives, true);
        // The first pod to be handed one is the pattern being shown; the second
        // is the argument, because the two are not the same identity.
        cue(arrives, start.pod === POD_STARTS[0]?.pod ? 'state' : 'success');
      });
    });
  }

  // --- the exchange, and the two names it reads ---------------------------

  for (const plan of EXCHANGES) {
    schedule(plan.raise, () => {
      const own = plan.audience === CLOUD_AUDIENCE;
      setAttr(plan.raise, `pod-${plan.pod}`, 'data-wi-raise', own ? 'own' : 'foreign');
      if (remaining(plan.pod, plan.raise) <= 0) {
        problems.push(`${plan.raise} pod ${plan.pod} presented a token that had expired`);
      }
      cue(plan.raise, 'state');
    });

    schedule(plan.arrive, () => {
      // The issuer is decided once and stays decided: a token minted for
      // somebody else still came from the issuer this cloud trusts, and that is
      // exactly why the audience is the name that has to be read.
      if (!issuerTrusted) {
        issuerTrusted = true;
        setAttr(plan.arrive, 'stage', 'data-wi-issuer', 'trusted');
      }
      if (plan.dwell > 0) {
        setAttr(plan.arrive, 'stage', 'data-wi-aud', 'check');
        cue(plan.arrive, 'state');
      }
    });

    const verdict = round(plan.arrive + plan.dwell);
    schedule(verdict, () => {
      const passed = issuerTrusted && plan.audience === CLOUD_AUDIENCE;
      exchanged.push({ at: verdict, pod: plan.pod, audience: plan.audience, passed });
      // The dot waits at the cloud for as long as the cloud takes, and the
      // marker it ends on is the verdict rather than an authored outcome.
      travel(
        X_CLOUD,
        Y_PODS_BOTTOM,
        Y_MID_TOP,
        plan.arrive,
        LEG_BAND,
        plan.audience === CLOUD_AUDIENCE ? 'present' : 'foreign',
        podName(plan.pod),
        passed ? 'ok' : 'fail',
        verdict,
      );
      setAttr(verdict, 'stage', 'data-wi-aud', passed ? 'ok' : 'bad');
      setAttr(verdict, `pod-${plan.pod}`, 'data-wi-raise', 'off');
      if (passed) {
        ok += 1;
        okSeries.push(ok);
        setAttr(verdict, 'stage', 'data-wi-ok', String(ok));
        cue(verdict, 'success');
      } else {
        denials.push({ at: verdict, reason: 'audience' });
        setAttr(verdict, 'stage', 'data-wi-deny', 'on');
        cue(verdict, 'state');
        const clears = round(verdict + DENY_HOLD);
        schedule(clears, () => {
          setAttr(clears, 'stage', 'data-wi-deny', 'off');
          setAttr(clears, 'stage', 'data-wi-aud', 'idle');
        });
      }
    });
  }

  // --- one role each -------------------------------------------------------

  schedule(ROLES_AT, () => {
    setAttr(ROLES_AT, 'stage', 'data-wi-roles', 'on');
    cue(ROLES_AT, 'state');
  });

  for (const plan of ACCESSES) {
    schedule(plan.at, () => {
      // The one rule of the fourth step. A workload opens the resource its role
      // names and nothing else, and no list of expected answers is consulted.
      const passed = ROLE_MAP[plan.pod] === plan.resource;
      reached.push({ at: plan.at, pod: plan.pod, resource: plan.resource, passed });
      if (remaining(plan.pod, plan.at) <= 0) {
        problems.push(`${plan.at} pod ${plan.pod} reached out with a token that had expired`);
      }
      if (passed) {
        travel(
          X_ACCESS,
          Y_MID_BOTTOM,
          Y_RES_TOP,
          plan.at,
          LEG_ACCESS,
          'access',
          podName(plan.pod),
          'ok',
        );
        setAttr(plan.at, `card-${plan.resource}`, 'data-wi-access', 'granted');
        ok += 1;
        okSeries.push(ok);
        setAttr(plan.at, 'stage', 'data-wi-ok', String(ok));
        cue(plan.at, 'success');
      } else {
        // A refusal here never leaves the cloud, so nothing travels: what the
        // reader sees is the cloud saying no and the badge that says whose the
        // resource is.
        denials.push({ at: plan.at, reason: 'role' });
        setAttr(plan.at, 'stage', 'data-wi-deny', 'on');
        setAttr(plan.at, 'stage', 'data-wi-cross', `${plan.pod}-${plan.resource}`);
        cue(plan.at, 'state');
        const clears = round(plan.at + CROSS_HOLD);
        schedule(clears, () => {
          setAttr(clears, 'stage', 'data-wi-deny', 'off');
          setAttr(clears, 'stage', 'data-wi-cross', 'none');
        });
      }
    });
  }

  // --- what the scene holds up, and where it stops ------------------------

  for (const [at, value, hold] of MARK_AT) {
    schedule(at, () => {
      setAttr(at, 'stage', 'data-wi-mark', value);
      cue(at, 'state');
    });
    schedule(round(at + hold), () => setAttr(round(at + hold), 'stage', 'data-wi-mark', 'none'));
  }

  schedule(SETTLE_AT, () => {
    setAttr(SETTLE_AT, 'stage', 'data-wi-settled', 'on');
    cue(SETTLE_AT, 'success');
  });

  drain();

  // Whatever each pod is holding when the scene ends is still alive, and the
  // bar has to say so, so the last life runs to the end rather than stopping.
  for (const pod of POD_IDS) {
    const since = issuedAt.get(pod);
    if (since !== undefined) lives.push({ pod, from: since, to: SCENE_DURATION });
  }
  lives.sort((left, right) => left.from - right.from);

  // --- what has to be true for the picture to mean anything ---------------

  // The first step's claim, checked rather than asserted: while the ghost is up
  // the only credential anywhere is the stored one, because the first token is
  // not issued until long after the ghost has been dropped.
  const firstMount = lives[0]?.from ?? SCENE_DURATION;
  if (firstMount <= GHOST_OFF) {
    problems.push(`a token existed at ${firstMount}, while the stored secret was still the story`);
  }

  // Every exchange, judged again from the outside. The pass above answered from
  // state it was carrying; this reads the plan straight, so a drift between the
  // two is a bug rather than a matter of opinion.
  for (const entry of exchanged) {
    const wanted = entry.audience === CLOUD_AUDIENCE;
    if (entry.passed !== wanted) {
      problems.push(
        `${entry.at} a token for "${entry.audience}" was ${entry.passed ? 'exchanged' : 'refused'}, the audience says otherwise`,
      );
    }
  }
  const mismatched = exchanged.filter((entry) => entry.audience !== CLOUD_AUDIENCE);
  if (mismatched.length !== 1) problems.push(`${mismatched.length} tokens named another audience`);
  if (mismatched.some((entry) => entry.passed)) problems.push('a token minted for somebody else was exchanged');
  if (!exchanged.some((entry) => entry.passed)) problems.push('no exchange ever passed');
  if (!issuerTrusted) problems.push('the cloud never decided about the issuer');

  // Every reach, judged again from the role map alone.
  for (const entry of reached) {
    const wanted = ROLE_MAP[entry.pod] === entry.resource;
    if (entry.passed !== wanted) {
      problems.push(`${entry.at} pod ${entry.pod} was ${entry.passed ? 'let into' : 'kept out of'} ${entry.resource}`);
    }
  }
  if (!reached.some((entry) => !entry.passed)) problems.push('nothing was ever kept out of a resource');
  for (const pod of POD_IDS) {
    if (!reached.some((entry) => entry.pod === pod && entry.passed)) {
      problems.push(`pod ${pod} never reached the resource its role opens`);
    }
  }

  // A token is replaced before it expires, and every life is therefore shorter
  // than the lifetime it was issued with. That is what makes the bar honest:
  // it never empties, because nothing ever runs on an expired token.
  for (const entry of reissues) {
    if (entry.age >= TOKEN_TTL) {
      problems.push(`pod ${entry.pod} ran ${entry.age}s on a token that lives ${TOKEN_TTL}s`);
    }
  }
  for (const life of lives) {
    if (life.to - life.from >= TOKEN_TTL) problems.push(`a token life at ${life.from} outlived its lifetime`);
  }
  if (reissues.length === 0) problems.push('no token was ever re-issued');

  for (let index = 1; index < okSeries.length; index += 1) {
    if ((okSeries[index] ?? 0) < (okSeries[index - 1] ?? 0)) problems.push('ok went backwards');
  }
  if (ok !== MAX_OK) problems.push(`${ok} verdicts passed, the stage draws ${MAX_OK}`);

  for (const journey of journeys) {
    if (journey.showAt < 0 || journey.markAt > SCENE_DURATION) {
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
  // forwards and in reverse going backwards, so that single frame would depend
  // on which way the reader scrubbed. Only the one that applies is kept.
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

  return { changes, cues: fixed, journeys, lives, ok, denials };
}

// --- the timeline ----------------------------------------------------------

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);
  const sim = simulate();

  // The captions name the figures the model produced. Nothing here places them:
  // if the schedule changes, this is what says the captions have stopped
  // describing the scene.
  const audience = sim.denials.filter((entry) => entry.reason === 'audience');
  const role = sim.denials.filter((entry) => entry.reason === 'role');
  if (audience.length !== 1 || role.length !== 1) {
    throw new Error(
      `${ID} scene: the captions promise one refusal of each kind, the model produced ` +
        `${audience.length} on the audience and ${role.length} on the role`,
    );
  }
  const audienceAt = audience[0]?.at ?? 0;
  const roleAt = role[0]?.at ?? 0;
  if (audienceAt < 12 || audienceAt >= 18) {
    throw new Error(`${ID} scene: the audience refusal landed at ${audienceAt}, outside the third step`);
  }
  if (roleAt < 18 || roleAt >= 24) {
    throw new Error(`${ID} scene: the role refusal landed at ${roleAt}, outside the fourth step`);
  }

  const targets: Record<string, Element> = { stage };
  for (const id of POD_IDS) targets[`pod-${id}`] = q(stage, `.wi-pod--${id}`, ID);
  for (const id of RESOURCE_IDS) targets[`card-${id}`] = q(stage, `.wi-card--${id}`, ID);

  const parts = mountRequests(layer, sim.journeys.length, ID);
  const tl = createSceneTimeline();

  // --- everything the stage says about itself ------------------------------

  for (const change of sim.changes) {
    const target = targets[change.target];
    if (!target) throw new Error(`${ID} scene: nothing on the stage is called "${change.target}"`);
    attr(tl, target, change.name, change.value, change.at);
  }

  // --- what is left of a token's life --------------------------------------

  // The only continuous quantity on the stage. Each life is one tween from a
  // full bar to whatever is left when the platform replaces it, so the bar is
  // derived from the lifetime rather than drawn to look short.
  const fills: Record<string, SVGRectElement> = {};
  for (const id of POD_IDS) fills[id] = q<SVGRectElement>(stage, `.wi-pod--${id} .wi-life-fill`, ID);

  for (const life of sim.lives) {
    const fill = fills[life.pod];
    if (!fill) continue;
    const spent = round(life.to - life.from);
    const left = round(LIFE_WIDTH * Math.max(0, 1 - spent / TOKEN_TTL));
    tl.fromTo(
      fill,
      { attr: { width: LIFE_WIDTH } },
      { attr: { width: left }, duration: spent, ease: 'none', immediateRender: false },
      life.from,
    );
  }

  // --- what travels --------------------------------------------------------

  sim.journeys.forEach((journey, index) => {
    const request: RequestParts | undefined = parts[index];
    if (!request) return;

    // A dot is drawn as the kind of thing it carries, because a birth notice, a
    // token being mounted, a token being replaced, a token held up for exchange,
    // a token minted for somebody else and a granted reach are six different
    // things travelling the same kind of line.
    request.group.classList.add(`wi-req--${journey.kind}`);

    const label = attachToRequest(
      request,
      'text',
      { class: 'scene-req-label wi-tag', x: '-36', y: '9', 'text-anchor': 'end' },
      journey.label,
    );
    gsap.set(label, { opacity: 1 });

    parkRequest(request, journey.x, journey.y);
    showRequest(tl, request, journey.showAt);
    tl.to(
      request.group,
      { y: journey.to, duration: journey.duration, ease: 'none', immediateRender: false },
      journey.showAt,
    );

    if (journey.mark) {
      markRequest(tl, request, journey.mark, journey.markAt);
      hideRequest(tl, request, journey.markAt, MARK_FADE);
    } else {
      hideRequest(tl, request, journey.landAt, FADE);
    }
  });

  // --- sound ---------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels ---------------------------------------------------------

  // The stage is complete on the first frame: two pods holding nothing, an
  // issuer nobody has decided about, a mint at rest, an audience check with
  // nothing to check, nothing counted, two resources nobody owns yet and
  // nothing in flight.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
