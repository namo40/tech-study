import gsap from 'gsap';
import {
  ACCESS_LIST,
  MAX_OK,
  PATH_OF,
  POD_IDS,
  SCENE_DURATION,
  STAGE_STATE,
  X_DEPLOY,
  X_INJECT,
  Y_IMAGE_BOTTOM,
  Y_PODS_BOTTOM,
  Y_PODS_TOP,
  Y_STORE_TOP,
  podName,
} from './stage';
import type { Mark, Path, PodId, Version } from './stage';
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
 * Secret Injection scene: a 24 second, four step timeline.
 *
 * The same two rules as every other scene: every tween sits at an absolute
 * position, and every discrete change is a zero-duration tween on a `data-*`
 * attribute that GSAP reverts when the playhead moves back past it. This scene
 * has no continuous quantity at all — a version is 1 or 2, a slot holds one of
 * them or nothing — so every frame is a set of stacked variants and scrubbing
 * backwards lands on a value rather than on a blend of two.
 *
 * Nothing the reader counts is authored. The scene is told nine things: when
 * the baked secret is held up, when each copy of it appears and when the spread
 * stops being fixable, when the artifact is declared clean, when each pod is
 * deployed, when a delivery is asked for and along which path, which pods each
 * path may deliver to, when the store swaps the version, and when the
 * environment pod is restarted.
 *
 * Everything else falls out of one pass. A delivery is granted exactly when the
 * path's access list names the pod that asked, and refused otherwise; a granted
 * delivery carries whatever version the store is holding at the moment it
 * lands, which is why the two paths diverge after the swap without anybody
 * writing the divergence down; `ok` is the count of everything that was
 * granted. The refusal in the third step is not scripted to happen — it happens
 * because the file path's list names `pod B` and the reach came from `pod A`,
 * and that same list is what the fourth step's refresh rides through.
 *
 * The two paths are deliberately different and the scene keeps them apart. The
 * environment slot is filled once when its pod starts and cannot change again
 * without the pod being restarted, so the swap leaves it holding the old
 * version until the restart delivers the new one; the mounted file is refreshed
 * where it stands and its pod never stops. Nothing in the picture ever goes
 * back to the Image after the first step: the artifact is clean from 3.9 on,
 * and no version, list or restart touches it again.
 */

const ID = 'secret-injection';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- how a traveller moves -------------------------------------------------

/** One speed for every leg any traveller takes, in pixels per second. */
const SPEED = 1250;

/** A deployment falling from the Image to the Pods. */
const LEG_DEPLOY = round((Y_PODS_TOP - Y_IMAGE_BOTTOM) / SPEED);
/** A delivery climbing from the Store to the Pods. */
const LEG_INJECT = round((Y_STORE_TOP - Y_PODS_BOTTOM) / SPEED);
/** How long a traveller that carried no verdict takes to go. */
const FADE = 0.14;
/** A verdict is held longer, because the reader is meant to read it. */
const MARK_FADE = 0.3;

// --- what the scene is told ------------------------------------------------

/** The world where the credential is part of the artifact. */
const GHOST_AT = 0.5;
/** Each tick is one more place the image has been pulled to. */
const SPREAD_TICKS = [1.4, 1.7, 2.0];
const PEAK_AT = 2.2;
const LIFT_AT = 3.0;
const CLEAN_AT = 3.9;

/** When each workload is deployed. The image it comes from carries no secret. */
const POD_STARTS: { pod: PodId; at: number }[] = [
  { pod: 'a', at: 6.5 },
  { pod: 'b', at: 12.5 },
];

/**
 * Every delivery the scene asks for, as the pod that asked and the path it
 * asked along. Nothing here says what the answer is: the access list decides,
 * and the third reach is refused because the file path does not name `pod A`.
 * The last one is the restart's own delivery, and it lands exactly when the
 * restart finishes rather than a moment before or after.
 */
const INJECTIONS: { at: number; pod: PodId; path: Path }[] = [
  { at: 7.4, pod: 'a', path: 'env' },
  { at: 13.4, pod: 'b', path: 'file' },
  { at: 15.4, pod: 'a', path: 'file' },
  { at: 19.4, pod: 'b', path: 'file' },
  { at: 21.2, pod: 'a', path: 'env' },
];

/** When the environment's leaks are drawn, and when the freeze is named. */
const LEAK_AT = 9.4;
const HINT_AT = 10.4;
const HINT_OFF = 11.4;

/** When the access list is drawn on the store it has always belonged to. */
const ALLOW_AT = 14.4;

/** When the store swaps the version every delivery after it will carry. */
const SWAP_AT = 18.5;

/** The window the environment pod is down for, which is what a new value costs. */
const RESTART_FROM = 20.4;
const RESTART_TO = 21.2;

/** How long a refusal and a match stay up, long enough to read and no longer. */
const DENY_HOLD = 0.8;
const HIT_HOLD = 0.5;

/** The seven things the scene holds up, and how long each is held for. */
const MARK_AT: [number, Mark, number][] = [
  [CLEAN_AT, 'clean', 0.6],
  [4.8, 'delivery', 0.6],
  [8.4, 'anywhere', 0.6],
  [11.0, 'frozen', 0.5],
  [16.4, 'audit', 0.5],
  [17.0, 'managed', 0.5],
  [21.8, 'norebuild', 0.5],
];

/** When the picture is called settled: both paths on the store's version. */
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
type Kind = 'deploy' | 'env' | 'file' | 'refresh';

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

/** One delivery, judged. */
interface Delivery {
  at: number;
  pod: PodId;
  path: Path;
  granted: boolean;
  /** The version that arrived, or null when nothing did. */
  version: Version | null;
}

interface Simulation {
  changes: AttrChange[];
  cues: [number, SceneCue][];
  journeys: Journey[];
  deliveries: Delivery[];
  ok: number;
}

// --- the simulation --------------------------------------------------------

function simulate(): Simulation {
  const raw: AttrChange[] = [];
  const fixed: [number, SceneCue][] = [];
  const journeys: Journey[] = [];
  const deliveries: Delivery[] = [];
  const problems: string[] = [];

  const setAttr = (at: number, target: string, name: string, value: string): void => {
    raw.push({ at: round(at), target, name, value });
  };
  const cue = (at: number, name: SceneCue): void => {
    fixed.push([round(at), name]);
  };

  /** The version the store is holding. Every delivery reads it, none set it. */
  let version: Version = '1';
  /** What each pod's slot holds, and whether the pod is up. */
  const slot = new Map<PodId, Version | null>();
  const running = new Set<PodId>();
  /** When each pod last started or finished restarting, which is the only
   *  moment its environment slot is allowed to take a different value. */
  const startedAt = new Map<PodId, number>();
  let ok = 0;
  const okSeries: number[] = [];
  /** Every slot write the run produced, for the assertions below. */
  const writes: { at: number; pod: PodId; from: Version | null; to: Version | null }[] = [];

  const travel = (
    x: number,
    y: number,
    to: number,
    landAt: number,
    duration: number,
    kind: Kind,
    label: string,
    mark: RequestResult | null,
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
      markAt: round(landAt),
    });
  };

  /** Writes a pod's slot and records the write, so nothing changes unseen. */
  const write = (at: number, pod: PodId, to: Version | null): void => {
    const from = slot.get(pod) ?? null;
    if (from === to) return;
    writes.push({ at: round(at), pod, from, to });
    slot.set(pod, to);
    setAttr(at, `pod-${pod}`, 'data-sj-slot', to === null ? 'empty' : `v${to}`);
  };

  const { schedule, drain } = createScheduler();

  // --- the world where the secret is part of the artifact -----------------

  schedule(GHOST_AT, () => {
    setAttr(GHOST_AT, 'stage', 'data-sj-image', 'baked');
    cue(GHOST_AT, 'state');
  });

  SPREAD_TICKS.forEach((at, index) => {
    schedule(at, () => {
      setAttr(at, 'stage', 'data-sj-spread', String(index + 1));
      // Only the first tick is heard. The copies after it are the same event
      // again, and a spread that announced itself three times would be three
      // noises rather than one argument.
      if (index === 0) cue(at, 'state');
    });
  });

  schedule(PEAK_AT, () => {
    setAttr(PEAK_AT, 'stage', 'data-sj-spread', 'peak');
    cue(PEAK_AT, 'failure');
  });

  schedule(LIFT_AT, () => {
    setAttr(LIFT_AT, 'stage', 'data-sj-image', 'plain');
    setAttr(LIFT_AT, 'stage', 'data-sj-spread', 'off');
    setAttr(LIFT_AT, 'stage', 'data-sj-mode', 'on');
    cue(LIFT_AT, 'trip');
  });

  schedule(CLEAN_AT, () => {
    setAttr(CLEAN_AT, 'stage', 'data-sj-image', 'clean');
  });

  // --- deployments ---------------------------------------------------------

  for (const start of POD_STARTS) {
    schedule(start.at, () => {
      const landed = round(start.at + LEG_DEPLOY);
      travel(X_DEPLOY, Y_IMAGE_BOTTOM, Y_PODS_TOP, landed, LEG_DEPLOY, 'deploy', podName(start.pod), null);
      cue(start.at, 'state');
      schedule(landed, () => {
        running.add(start.pod);
        startedAt.set(start.pod, landed);
        setAttr(landed, `pod-${start.pod}`, 'data-sj-run', 'on');
      });
    });
  }

  // --- the environment's price --------------------------------------------

  schedule(LEAK_AT, () => {
    setAttr(LEAK_AT, 'pod-a', 'data-sj-leak', 'on');
    cue(LEAK_AT, 'state');
  });

  schedule(HINT_AT, () => {
    setAttr(HINT_AT, 'pod-a', 'data-sj-restart', 'hint');
    cue(HINT_AT, 'state');
  });
  schedule(HINT_OFF, () => setAttr(HINT_OFF, 'pod-a', 'data-sj-restart', 'none'));

  // --- the list, drawn on the store it has always belonged to -------------

  schedule(ALLOW_AT, () => {
    setAttr(ALLOW_AT, 'stage', 'data-sj-allow', 'on');
    cue(ALLOW_AT, 'state');
  });

  // --- rotation ------------------------------------------------------------

  schedule(SWAP_AT, () => {
    version = '2';
    setAttr(SWAP_AT, 'stage', 'data-sj-version', '2');
    // Nothing is pushed. Whoever is holding an older version is simply holding
    // an older version, and the picture has to say so until a delivery fixes it.
    for (const pod of POD_IDS) {
      if (PATH_OF[pod] === 'env' && slot.get(pod) !== null && slot.get(pod) !== version) {
        setAttr(SWAP_AT, `pod-${pod}`, 'data-sj-stale', 'on');
        setAttr(SWAP_AT, `pod-${pod}`, 'data-sj-restart', 'due');
      }
    }
    cue(SWAP_AT, 'state');
  });

  schedule(RESTART_FROM, () => {
    running.delete('a');
    setAttr(RESTART_FROM, 'pod-a', 'data-sj-run', 'off');
    setAttr(RESTART_FROM, 'pod-a', 'data-sj-restart', 'running');
    // A restarting pod holds nothing: the environment it had went with the
    // process, which is exactly why the new value has to be delivered again.
    // It stops being stale at the same instant, because an empty slot is not
    // holding an old value — it is not holding anything.
    setAttr(RESTART_FROM, 'pod-a', 'data-sj-stale', 'off');
    write(RESTART_FROM, 'a', null);
    cue(RESTART_FROM, 'state');
  });

  schedule(RESTART_TO, () => {
    running.add('a');
    startedAt.set('a', RESTART_TO);
    setAttr(RESTART_TO, 'pod-a', 'data-sj-run', 'on');
    setAttr(RESTART_TO, 'pod-a', 'data-sj-restart', 'none');
  });

  // --- every delivery, judged by the list ---------------------------------

  for (const plan of INJECTIONS) {
    const leaves = round(plan.at - LEG_INJECT);
    schedule(leaves, () => {
      const granted = (ACCESS_LIST[plan.path] ?? []).includes(plan.pod);
      if (!granted) return;
      // A refused reach never leaves the store, so only a granted one travels.
      // Whether the pod is already holding something is what tells a refresh
      // from a first delivery, and the two are drawn differently because one
      // costs a restart and the other does not.
      const kind: Kind = slot.get(plan.pod) ? 'refresh' : plan.path;
      travel(X_INJECT, Y_STORE_TOP, Y_PODS_BOTTOM, plan.at, LEG_INJECT, kind, podName(plan.pod), 'ok');
    });

    schedule(plan.at, () => {
      const granted = (ACCESS_LIST[plan.path] ?? []).includes(plan.pod);
      deliveries.push({ at: plan.at, pod: plan.pod, path: plan.path, granted, version: granted ? version : null });
      if (!granted) {
        setAttr(plan.at, 'stage', 'data-sj-deny', 'on');
        setAttr(plan.at, `pod-${plan.pod}`, 'data-sj-refused', 'on');
        cue(plan.at, 'state');
        const clears = round(plan.at + DENY_HOLD);
        schedule(clears, () => {
          setAttr(clears, 'stage', 'data-sj-deny', 'off');
          setAttr(clears, `pod-${plan.pod}`, 'data-sj-refused', 'off');
        });
        return;
      }
      if (!running.has(plan.pod)) {
        problems.push(`${plan.at} pod ${plan.pod} was delivered to while it was not running`);
      }
      const since = startedAt.get(plan.pod);
      if (since === undefined || since > plan.at) {
        problems.push(`${plan.at} pod ${plan.pod} was delivered to before it started`);
      }
      // The environment is filled once, while the slot is still empty, and
      // frozen after that. Only a restart empties it again, so a write to a
      // filled environment slot would be the scene contradicting its caption.
      if (PATH_OF[plan.pod] === 'env' && slot.get(plan.pod)) {
        problems.push(`${plan.at} the environment of pod ${plan.pod} changed without a restart`);
      }
      write(plan.at, plan.pod, version);
      ok += 1;
      okSeries.push(ok);
      setAttr(plan.at, 'stage', 'data-sj-ok', String(ok));
      cue(plan.at, 'success');
      if (plan.path === 'file' && plan.at > ALLOW_AT) {
        // The list is what let this through, so the list is what lights up —
        // but only once the scene has drawn it. The mount in the third step
        // passed on the same list and simply passed before it was on screen.
        setAttr(plan.at, 'stage', 'data-sj-allow', 'hit');
        const clears = round(plan.at + HIT_HOLD);
        schedule(clears, () => setAttr(clears, 'stage', 'data-sj-allow', 'on'));
      }
    });
  }

  // --- what the scene holds up, and where it stops ------------------------

  for (const [at, value, hold] of MARK_AT) {
    schedule(at, () => {
      setAttr(at, 'stage', 'data-sj-mark', value);
      cue(at, 'state');
    });
    schedule(round(at + hold), () => setAttr(round(at + hold), 'stage', 'data-sj-mark', 'none'));
  }

  schedule(SETTLE_AT, () => {
    setAttr(SETTLE_AT, 'stage', 'data-sj-settled', 'on');
    cue(SETTLE_AT, 'success');
  });

  drain();

  // --- what has to be true for the picture to mean anything ---------------

  // The first step's claim, checked rather than asserted: while the baked
  // secret is up, the copy in the image is the only credential anywhere.
  for (const entry of writes) {
    if (entry.at <= LIFT_AT) problems.push(`a slot was filled at ${entry.at}, while the image still carried the secret`);
  }

  // Every verdict, judged again from the list alone. The pass above answered
  // from state it was carrying; this reads the plan straight, so a drift
  // between the two is a bug rather than a matter of opinion.
  for (const entry of deliveries) {
    const wanted = (ACCESS_LIST[entry.path] ?? []).includes(entry.pod);
    if (entry.granted !== wanted) {
      problems.push(`${entry.at} ${podName(entry.pod)} was ${entry.granted ? 'delivered to' : 'refused'} on the ${entry.path} path against the list`);
    }
    if (!entry.granted && entry.version !== null) problems.push(`${entry.at} a refusal delivered a version`);
  }
  const refused = deliveries.filter((entry) => !entry.granted);
  if (refused.length !== 1) problems.push(`${refused.length} reaches were refused`);
  for (const entry of refused) {
    if ((ACCESS_LIST[entry.path] ?? []).includes(entry.pod)) problems.push(`${entry.at} a pod on the list was refused`);
    if (writes.some((w) => w.at === entry.at)) problems.push(`${entry.at} a refusal wrote to a slot`);
  }
  for (const path of ['env', 'file'] as const) {
    if (!deliveries.some((entry) => entry.granted && entry.path === path)) {
      problems.push(`nothing was ever delivered along the ${path} path`);
    }
  }

  // A delivery carries the version the store was holding when it landed, and
  // nothing else in the scene ever writes a slot.
  for (const entry of deliveries) {
    if (!entry.granted) continue;
    const expected = entry.at < SWAP_AT ? '1' : '2';
    if (entry.version !== expected) {
      problems.push(`${entry.at} a delivery carried v${entry.version} while the store held v${expected}`);
    }
  }

  // The two paths diverge for exactly as long as the restart takes, and the
  // mounted file is never behind the store once its refresh has landed.
  const refresh = deliveries.find((entry) => entry.granted && entry.path === 'file' && entry.at > SWAP_AT);
  if (!refresh) problems.push('the mounted file never caught up with the store');
  else if (refresh.at >= RESTART_TO) problems.push('the mounted file did not refresh before the restart finished');
  const envCatchUp = deliveries.find((entry) => entry.granted && entry.path === 'env' && entry.at > SWAP_AT);
  if (!envCatchUp) problems.push('the environment never caught up with the store');
  else if (envCatchUp.at !== RESTART_TO) problems.push('the environment caught up somewhere other than the restart');

  for (let index = 1; index < okSeries.length; index += 1) {
    if ((okSeries[index] ?? 0) < (okSeries[index - 1] ?? 0)) problems.push('ok went backwards');
  }
  if (ok !== MAX_OK) problems.push(`${ok} deliveries passed, the stage draws ${MAX_OK}`);
  for (const pod of POD_IDS) {
    if (slot.get(pod) !== '2') problems.push(`${podName(pod)} ends holding ${slot.get(pod) ?? 'nothing'}`);
  }

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

  return { changes, cues: fixed, journeys, deliveries, ok };
}

// --- the timeline ----------------------------------------------------------

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);
  const sim = simulate();

  // The captions name the figures the model produced. Nothing here places them:
  // if the schedule changes, this is what says the captions have stopped
  // describing the scene.
  const denied = sim.deliveries.filter((entry) => !entry.granted);
  if (denied.length !== 1) {
    throw new Error(`${ID} scene: the captions promise one refusal, the model produced ${denied.length}`);
  }
  const deniedAt = denied[0]?.at ?? 0;
  if (deniedAt < 12 || deniedAt >= 18) {
    throw new Error(`${ID} scene: the refusal landed at ${deniedAt}, outside the third step`);
  }
  const rotated = sim.deliveries.filter((entry) => entry.granted && entry.at >= 18);
  if (rotated.length !== 2) {
    throw new Error(`${ID} scene: the fourth step promises both paths catching up, ${rotated.length} did`);
  }

  const targets: Record<string, Element> = { stage };
  for (const id of POD_IDS) targets[`pod-${id}`] = q(stage, `.sj-pod--${id}`, ID);

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

    // A dot is drawn as the kind of thing it carries, because a deployment, a
    // value filling an environment, a file being mounted and a file being
    // refreshed where it stands are four different things travelling the same
    // kind of line.
    request.group.classList.add(`sj-req--${journey.kind}`);

    const label = attachToRequest(
      request,
      'text',
      { class: 'scene-req-label sj-tag', x: '-36', y: '9', 'text-anchor': 'end' },
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

  // The stage is complete on the first frame: an untouched image, two pods that
  // have not started and hold nothing, a store on version 1 with its list
  // undrawn, no refusal, nothing counted and nothing in flight.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
