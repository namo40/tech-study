import {
  GRACE_CIRCUMFERENCE,
  MIN_AVAILABLE,
  POD_X,
  REPLICAS,
  REQ_MAX,
  SCENE_DURATION,
  STAGE_STATE,
  Y_DRAIN_BOTTOM,
  Y_POD_TOP,
} from './stage';
import type { DrainState, GraceState, KillState, LampState, PodState } from './stage';
import { q } from '../shared/dom';
import {
  hideRequest,
  markRequest,
  mountRequests,
  moveRequest,
  parkRequest,
  showRequest,
} from '../shared/request';
import { createScheduler } from '../shared/simulation';
import { attr, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Pod Disruption Budget scene: a 24 second, four step timeline.
 *
 * The two standing rules apply here as everywhere: every tween sits at an
 * absolute position, and every discrete change is a zero-duration tween on a
 * `data-*` attribute that GSAP reverts when the playhead moves back past it.
 * The two grace rings are the exception and are drawn rather than written — a
 * `stroke-dashoffset` sweep with `ease: 'none'`, which is a quantity and
 * reverses exactly.
 *
 * Nothing on this stage is placed by hand. The scene is told what a drain, a
 * budget and a pod are, and one pass over the whole 24 seconds derives the rest:
 *
 *   1. what the drain wants — two named pods gone, and how often it comes back
 *      to ask again about the one it did not get;
 *   2. the rule: `minAvailable 2` against three replicas. How many evictions may
 *      run at once is never written down. It is `ready - minAvailable` minus the
 *      evictions already booked, recomputed from the live count every time a pod
 *      changes what it says about itself, which is where "one at a time" comes
 *      from;
 *   3. what a pod is holding when it is told to leave, and how long each of
 *      those requests still needs. The remaining service times are a heavy tail,
 *      because that is what they are: four of the five are gone in two seconds
 *      and the fifth takes as long as the other four together. That single
 *      request is why a grace period is a number rather than a formality;
 *   4. the ritual's own durations — the preStop hook, the grace period, and the
 *      moment a process with nothing left to do exits;
 *   5. how long the node takes to act on the first eviction it accepts, and how
 *      long a replacement takes to be scheduled and to become ready.
 *
 * Everything the reader counts falls out of walking that: which pod is evicted
 * and when, what `held` reads, what `ready n/3` reads at every instant, every
 * badge transition, every `req n`, when the grace ring turns amber, when the
 * deadline would have fallen, and — the point of the whole scene — when the
 * second eviction is allowed to start. **The second eviction is not a
 * timestamp.** It begins at the first retry that finds three pods ready again,
 * so moving the replacement's startup moves it, and setting `minAvailable` to 3
 * would mean it never begins at all.
 *
 * The `SLO` lamp is likewise never written by hand: it is `ready >= 2`,
 * evaluated at every change. If the derivation ever dropped `ready` to one, the
 * lamp would go out on its own and the assertion below would stop the build —
 * which is the only way a scene can claim an invariant rather than assert one.
 *
 * Two compressions, both declared, neither of which touches a label.
 *
 * **The replay.** The second eviction runs the same ritual as the first at
 * `REPLAY_RATE` times the speed, because the reader has already watched it once
 * and the fourth step is about what the budget bought rather than about the
 * ritual. Every duration in it is the first one's divided by that rate — the
 * hook, the service times, the grace, the exit — so the second ring reaches
 * exactly the same fraction of its sweep as the first before its pod goes.
 *
 * **The counterfactual.** The `SIGKILL` mark is drawn at the instant the first
 * pod's deadline would have fallen, and it is drawn once: it is an aside about a
 * road not taken, not an event. It is also suppressed when there is no room to
 * clear it before the closing frame, which is why the second deadline passes in
 * silence rather than crowding the settle.
 */

const ID = 'pod-disruption-budget';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

const BOUNDARIES = [0, 6, 12, 18, 24];

/** Times are rounded to milliseconds, so a gap of exactly the minimum is one. */
const EPS = 1e-6;

// --- what the scene is told: the drain -------------------------------------

/** The pods the drain asks for, in the order it asks for them. */
const WANTED = [0, 1];

/** When the `drain node` card arrives, and how long the budget takes to answer. */
const DRAIN_AT = 1.0;
const VERDICT_AFTER = 0.8;

/** How often the drain comes back about an eviction the budget would not grant. */
const RETRY_EVERY = 1.2;

/** When an approval leaves the Drain, and how long it takes to reach a pod. */
const DISPATCH_AFTER = 0.6;
const SIGNAL_TRAVEL = 0.6;
/** How long the approval's tick stays on the pod it reached, and fades over. */
const MARK_HOLD = 0.25;
const MARK_FADE = 0.22;

// --- what the scene is told: the fleet --------------------------------------

/**
 * How many requests are in flight across the whole Deployment. Each ready pod
 * holds its share, so a pod that stops being ready hands its share to the others
 * rather than dropping it — which is why the two survivors read `req 7` for the
 * whole of the middle of the scene.
 */
const LOAD = 14;

// --- what the scene is told: the ritual -------------------------------------

/**
 * How long the node spends between accepting its first eviction and starting to
 * terminate the pod: cordoning, and waiting for the endpoint lists that still
 * name it to catch up. It is paid once. By the time the second eviction is
 * granted the node is already draining, so that one starts where it lands.
 */
const NODE_WAKE = 3.5;

/** The preStop hook's own duration: stop taking work, empty the connections. */
const PRESTOP = 2.5;

/**
 * The remaining service times of what a pod is still holding, as a Pareto tail:
 * the k-th shortest of `n` needs `SERVICE_FLOOR * ((n+1)/(n+1-k))^(1/TAIL_ALPHA)`
 * seconds more. The shape is the whole argument of the third step — the median
 * request is gone almost at once and the last one takes six seconds, so a grace
 * period set from the average is a grace period that kills something.
 */
const SERVICE_FLOOR = 0.93;
const TAIL_ALPHA = 0.92;

/** `terminationGracePeriodSeconds`, and the share of it after which it warns. */
const GRACE = 8.4;
const GRACE_WARN = 0.7;

/** How long after its last request a process with nothing left to do exits. */
const EXIT_AFTER = 1.0;

/** How long the controller takes to schedule a replacement, and it to be ready. */
const REPLACE_AFTER = 4.4;
const STARTUP = 1.0;

/** The rate the second eviction's ritual is replayed at. */
const REPLAY_RATE = 3.42;

// --- what the scene is told: the counterfactual and the close ---------------

/** How long the `SIGKILL` mark is held, and the clear air the close needs. */
const GHOST_HOLD = 1.5;
const SETTLE_QUIET = 1.0;

/** When the budget states its case, and when the diagram is called settled. */
const CONFIRM_AFTER = 0.4;
const SETTLE_AFTER = 1.0;

// --- what the scene is told: the sound --------------------------------------

/** How often a running grace ring is worth hearing, at the first ritual's pace. */
const TIMER_TICK = 2.4;
/** How close any cue may fall to another, and to a step boundary. */
const MIN_CUE_GAP = 0.2;
const BOUNDARY_GAP = 0.3;

// --- what one pass over the scene produces ---------------------------------

interface Change {
  at: number;
  /** `stage`, or `pod-1`..`pod-3`. */
  target: string;
  name: string;
  value: string;
}

interface Sweep {
  pod: number;
  from: number;
  to: number;
}

interface Mover {
  pod: number;
  start: number;
  land: number;
}

interface Cue {
  at: number;
  name: SceneCue;
  /** 1 is an event the scene is about, 2 is a reading that followed from one. */
  tier: number;
}

interface Eviction {
  pod: number;
  startedAt: number;
  deadline: number;
  goneAt: number;
  rate: number;
}

interface Simulation {
  changes: Change[];
  sweeps: Sweep[];
  movers: Mover[];
  cues: [number, SceneCue][];
  /** Read back by the build, so a drift in the derivation fails loudly. */
  evictions: Eviction[];
  readySeries: [number, number][];
  ghostAt: number | null;
  settledAt: number;
  finalReady: number;
}

// --- the model --------------------------------------------------------------

/** The share of the load one ready pod holds when `ready` of them are ready. */
const shareOf = (ready: number): number => (ready > 0 ? Math.round(LOAD / ready) : 0);

/** Seconds the `rank`-th shortest of `n` in-flight requests still needs. */
const remainingService = (rank: number, n: number): number =>
  SERVICE_FLOOR * Math.pow((n + 1) / (n + 1 - rank), 1 / TAIL_ALPHA);

/**
 * Walks the whole scene in time order.
 *
 * One `createScheduler` pass runs it: the drain's ask books the budget's first
 * verdict, a verdict books an approval, an approval books the signal that
 * carries it, the signal books the ritual, and each stage of the ritual books
 * the next. Booked events run earliest first, so the retry that lands at the
 * instant a replacement becomes ready sees three ready pods rather than two.
 *
 * Nothing here writes a picture. Every readout on the stage — `held n`,
 * `ready n/3`, the `SLO` lamp, every `req n` — is recomputed from the pods after
 * each change and written only when it actually differs, so the diagram is a
 * consequence of the model rather than a second copy of it.
 */
function simulate(): Simulation {
  const { schedule, drain } = createScheduler();

  const changes: Change[] = [];
  const held: Record<string, string> = { ...STAGE_STATE };
  const write = (at: number, target: string, name: string, value: string): void => {
    const key = `${target}@${name}`;
    if (held[key] === value) return;
    held[key] = value;
    changes.push({ at: round(at), target, name, value });
  };
  // `held` starts at what the markup carries, so the pass writes only what the
  // static stage does not already say.

  const sweeps: Sweep[] = [];
  const movers: Mover[] = [];
  const evictions: Eviction[] = [];
  const anchors: Cue[] = [];
  const readySeries: [number, number][] = [[0, REPLICAS]];
  const cue = (at: number, name: SceneCue, tier = 1): void => {
    anchors.push({ at: round(at), name, tier });
  };

  // --- what the diagram is holding -----------------------------------------

  /** What each pod says about itself, and what it is still holding. */
  const state: PodState[] = POD_X.map(() => 'ready');
  const inflight: number[] = POD_X.map(() => shareOf(REPLICAS));

  /** Evictions the drain still wants, and the ones it has been granted. */
  const queue: number[] = [];
  const booked = new Set<number>();
  let ghostAt: number | null = null;
  let ghostDrawn = false;
  let settledAt = SCENE_DURATION;

  const readyCount = (): number => state.filter((word) => word === 'ready').length;

  /**
   * The readouts, all of them a consequence of the pods. `ready n/3` is the
   * count of pods saying `ready`; the lamp is that count against the rule; a
   * ready pod's `req` is its share of the load, and a leaving pod's is whatever
   * it has not finished yet.
   */
  const settle = (at: number): void => {
    const ready = readyCount();
    const share = shareOf(ready);
    for (let index = 0; index < state.length; index += 1) {
      const word = state[index];
      const leaving = word === 'preStop' || word === 'term';
      // A ready pod holds its share; a leaving pod holds what it has not
      // finished; a slot that is empty or filling holds nothing.
      const value = word === 'ready' ? share : leaving ? (inflight[index] ?? 0) : 0;
      if (value > REQ_MAX) throw new Error(`${ID} scene: pod ${index + 1} holds ${value} requests`);
      const before = held[`pod-${index + 1}@data-pdb-req`];
      write(at, `pod-${index + 1}`, 'data-pdb-req', String(value));
      if (before !== String(value)) cue(at, 'state', 2);
    }
    write(at, 'stage', 'data-pdb-ready', String(ready));
    write(at, 'stage', 'data-pdb-slo', (ready >= MIN_AVAILABLE ? 'on' : 'off') satisfies LampState);
    write(at, 'stage', 'data-pdb-held', String(queue.length));
    // The claim the whole page makes, checked rather than asserted. If the
    // derivation ever took the fleet below the rule the lamp would go out on its
    // own, and the scene would be arguing against itself.
    if (ready < MIN_AVAILABLE) {
      throw new Error(`${ID} scene: ready fell to ${ready} at ${round(at)}, below minAvailable`);
    }
    const last = readySeries[readySeries.length - 1];
    if (last && last[0] === round(at)) last[1] = ready;
    else readySeries.push([round(at), ready]);
  };

  /** What the budget will allow right now, which nobody writes down. */
  const allowance = (): number => {
    const standing = [...booked].filter((pod) => state[pod] === 'ready').length;
    return Math.max(0, readyCount() - MIN_AVAILABLE - standing);
  };

  // --- the ritual -----------------------------------------------------------

  /**
   * One pod's departure, from the moment the node starts terminating it. The
   * hook, the signal, the deadline and the exit are all measured from here, and
   * `rate` is the only thing that differs between the first and the second.
   */
  const ritual = (at: number, pod: number, rate: number): void => {
    const target = `pod-${pod + 1}`;
    const holding = inflight[pod] ?? 0;
    const grace = GRACE / rate;
    const deadline = round(at + grace);

    state[pod] = 'preStop';
    booked.delete(pod);
    write(at, target, 'data-pdb-pod', 'preStop' satisfies PodState);
    write(at, target, 'data-pdb-grace', 'on' satisfies GraceState);
    sweeps.push({ pod, from: round(at), to: deadline });
    cue(at, 'trip');
    settle(at);

    // The hook is a fixed length of time, because that is what a hook is.
    const sigterm = round(at + PRESTOP / rate);
    schedule(sigterm, () => {
      state[pod] = 'term';
      write(sigterm, target, 'data-pdb-pod', 'term' satisfies PodState);
      cue(sigterm, 'state');
      settle(sigterm);
    });

    // Each request the pod is still holding finishes when it finishes. The last
    // one is the one the grace period is really for, so it is the only one the
    // scene calls a success.
    for (let rank = 1; rank <= holding; rank += 1) {
      const done = round(at + remainingService(rank, holding) / rate);
      schedule(done, () => {
        inflight[pod] = holding - rank;
        cue(done, rank === holding ? 'success' : 'state', rank === holding ? 1 : 2);
        settle(done);
        if (rank !== holding) return;

        const goneAt = round(done + EXIT_AFTER / rate);
        schedule(goneAt, () => {
          state[pod] = 'gone';
          write(goneAt, target, 'data-pdb-pod', 'gone' satisfies PodState);
          write(goneAt, target, 'data-pdb-grace', 'off' satisfies GraceState);
          cue(goneAt, 'state');
          settle(goneAt);
          evictions.push({ pod, startedAt: round(at), deadline, goneAt, rate });

          // The drain has what it asked for. The card goes quiet, the budget
          // states its case, and a second later the diagram is settled — all of
          // it measured from the last departure rather than written down.
          if (evictions.length === WANTED.length) {
            write(goneAt, 'stage', 'data-pdb-drain', 'idle' satisfies DrainState);
            const confirmAt = round(goneAt + CONFIRM_AFTER);
            settledAt = round(goneAt + SETTLE_AFTER);
            schedule(confirmAt, () => cue(confirmAt, 'success'));
            schedule(settledAt, () => cue(settledAt, 'success'));
          }

          // The replacement is the Deployment's business, not the budget's: a
          // replica is missing, so one is scheduled.
          const startingAt = round(goneAt + REPLACE_AFTER);
          const readyAt = round(startingAt + STARTUP);
          if (readyAt >= SCENE_DURATION - SETTLE_QUIET) return;
          schedule(startingAt, () => {
            state[pod] = 'starting';
            write(startingAt, target, 'data-pdb-pod', 'starting' satisfies PodState);
            cue(startingAt, 'state');
            settle(startingAt);
          });
          schedule(readyAt, () => {
            state[pod] = 'ready';
            write(readyAt, target, 'data-pdb-pod', 'ready' satisfies PodState);
            cue(readyAt, 'success');
            settle(readyAt);
          });
        });
      });
    }

    // The ring turns amber with three tenths of the grace left, and ticks while
    // it runs. Both are readings of the same arc, so both are anchored to it.
    const warnAt = round(at + grace * GRACE_WARN);
    schedule(warnAt, () => {
      if (state[pod] === 'gone') return;
      write(warnAt, target, 'data-pdb-grace', 'warn' satisfies GraceState);
      cue(warnAt, 'state', 2);
    });
    for (let tick = 1; ; tick += 1) {
      const beat = round(at + (TIMER_TICK * tick) / rate);
      if (beat >= deadline) break;
      schedule(beat, () => {
        if (state[pod] === 'gone') return;
        cue(beat, 'state', 2);
      });
    }

    // The other ending, drawn once and only when there is room to clear it.
    schedule(deadline, () => {
      if (ghostDrawn || deadline + GHOST_HOLD + SETTLE_QUIET > SCENE_DURATION) return;
      ghostDrawn = true;
      ghostAt = deadline;
      write(deadline, target, 'data-pdb-kill', 'on' satisfies KillState);
      cue(deadline, 'failure');
      const clearAt = round(deadline + GHOST_HOLD);
      schedule(clearAt, () => write(clearAt, target, 'data-pdb-kill', 'off' satisfies KillState));
    });
  };

  // --- the budget -----------------------------------------------------------

  /**
   * One evaluation. It reads the fleet, works out what it may allow, and grants
   * that many of the evictions still waiting. Everything else stays in the
   * queue, which is what `held n` counts.
   */
  const evaluate = (at: number): void => {
    let room = allowance();
    while (room > 0 && queue.length > 0) {
      const pod = queue.shift();
      if (pod === undefined) break;
      room -= 1;
      booked.add(pod);
      const first = movers.length === 0;
      cue(at, first ? 'state' : 'trip');

      const leaves = round(at + (first ? DISPATCH_AFTER : 0));
      const lands = round(leaves + SIGNAL_TRAVEL);
      movers.push({ pod, start: leaves, land: lands });

      // The first eviction waits for the node to cordon and for the endpoint
      // lists to catch up; by the second the node is already draining.
      const wake = first ? NODE_WAKE : 0;
      if (wake > 0) schedule(lands, () => cue(lands, 'state'));
      const rate = first ? 1 : REPLAY_RATE;
      const startsAt = round(lands + wake);
      schedule(startsAt, () => ritual(startsAt, pod, rate));
    }
    settle(at);
  };

  // --- the drain ------------------------------------------------------------

  schedule(DRAIN_AT, () => {
    write(DRAIN_AT, 'stage', 'data-pdb-drain', 'active' satisfies DrainState);
    for (const pod of WANTED) queue.push(pod);
    cue(DRAIN_AT, 'trip');
  });

  // The drain does not give up: it comes back about what it did not get, and one
  // of those retries is the moment the whole scene turns on.
  for (let k = 0; ; k += 1) {
    const at = round(DRAIN_AT + VERDICT_AFTER + RETRY_EVERY * k);
    if (at > SCENE_DURATION) break;
    schedule(at, () => {
      if (queue.length > 0) evaluate(at);
    });
  }

  schedule(0, () => settle(0));
  drain();

  return {
    changes: collapse(changes),
    sweeps,
    movers,
    cues: schedule_cues(anchors),
    evictions,
    readySeries,
    ghostAt,
    settledAt,
    finalReady: readyCount(),
  };
}

/**
 * Two changes to one attribute at one instant would render in insertion order
 * forwards and in reverse going backwards, so that single frame would depend on
 * which way the reader scrubbed. Only the one that ends up applying is kept.
 */
function collapse(changes: Change[]): Change[] {
  const ordered: Change[] = [];
  for (const entry of changes) {
    let replaced = false;
    for (let i = ordered.length - 1; i >= 0; i -= 1) {
      const candidate = ordered[i];
      if (!candidate || candidate.at !== entry.at) break;
      if (candidate.target === entry.target && candidate.name === entry.name) {
        candidate.value = entry.value;
        replaced = true;
        break;
      }
    }
    if (!replaced) ordered.push(entry);
  }
  return ordered;
}

/**
 * The sound. The events the scene is about are placed first and the readings
 * that followed from them fill in around them, so a run of `req` numbers never
 * pushes a badge transition off the soundtrack. Anything that would crowd a cue
 * already kept, or a step boundary, is dropped rather than moved.
 */
function schedule_cues(anchors: Cue[]): [number, SceneCue][] {
  const kept: number[] = [];
  const out: [number, SceneCue][] = [];
  const clear = (at: number): boolean =>
    at > 0 &&
    at < SCENE_DURATION &&
    !BOUNDARIES.some((edge) => Math.abs(at - edge) < BOUNDARY_GAP - EPS) &&
    kept.every((other) => Math.abs(at - other) >= MIN_CUE_GAP - EPS);
  const byTime = (left: Cue, right: Cue): number => left.at - right.at;
  for (const tier of [1, 2]) {
    for (const entry of anchors.filter((item) => item.tier === tier).sort(byTime)) {
      if (!clear(entry.at)) continue;
      kept.push(entry.at);
      out.push([entry.at, entry.name]);
    }
  }
  out.sort((left, right) => left[0] - right[0]);
  return out;
}

// --- the timeline ----------------------------------------------------------

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);
  const pods = POD_X.map((_x, index) =>
    q<SVGGElement>(stage, `.pdb-pod--${index + 1}`, ID),
  );
  const rings = pods.map((pod) => q<SVGCircleElement>(pod, '.pdb-grace-progress', ID));

  const sim = simulate();

  // The captions name derived moments and the steps they belong to. Nothing here
  // places them: if the budget, the load or the ritual is changed, this is what
  // says the captions have stopped describing the scene.
  const [first, second] = sim.evictions;
  if (sim.evictions.length !== WANTED.length || !first || !second) {
    throw new Error(`${ID} scene: ${sim.evictions.length} evictions, want ${WANTED.length}`);
  }
  if (first.pod !== WANTED[0] || second.pod !== WANTED[1]) {
    throw new Error(
      `${ID} scene: the drain got pods ${first.pod}/${second.pod}, not ${WANTED.join('/')}`,
    );
  }
  if (first.startedAt <= 6 || first.startedAt >= 12) {
    throw new Error(`${ID} scene: the first ritual began at ${first.startedAt}, not inside step 2`);
  }
  if (first.goneAt <= 12 || first.goneAt >= 18) {
    throw new Error(`${ID} scene: the first pod went at ${first.goneAt}, not inside step 3`);
  }
  if (first.goneAt >= first.deadline) {
    throw new Error(
      `${ID} scene: the first pod took until ${first.goneAt} against a deadline of ${first.deadline}`,
    );
  }
  if (second.startedAt <= 18 || second.goneAt >= SCENE_DURATION - SETTLE_QUIET) {
    throw new Error(
      `${ID} scene: the second ritual ran ${second.startedAt}..${second.goneAt}, not inside step 4`,
    );
  }
  if (sim.ghostAt === null || sim.ghostAt <= 12 || sim.ghostAt >= 18) {
    throw new Error(`${ID} scene: the counterfactual fell at ${sim.ghostAt}, not inside step 3`);
  }
  // The claim the fourth step makes, read back off the derived series rather
  // than off the story: at no ten millisecond sample were fewer than two ready.
  let worst = REPLICAS;
  for (let at = 0; at <= SCENE_DURATION + EPS; at = round(at + 0.01)) {
    let ready = REPLICAS;
    for (const [when, value] of sim.readySeries) {
      if (when <= at + EPS) ready = value;
    }
    worst = Math.min(worst, ready);
  }
  if (worst < MIN_AVAILABLE) {
    throw new Error(`${ID} scene: ready reached ${worst}, below minAvailable ${MIN_AVAILABLE}`);
  }
  if (sim.finalReady !== MIN_AVAILABLE) {
    throw new Error(`${ID} scene: it settled at ready ${sim.finalReady}, want ${MIN_AVAILABLE}`);
  }
  if (sim.settledAt >= SCENE_DURATION - BOUNDARY_GAP) {
    throw new Error(`${ID} scene: it settled at ${sim.settledAt}, too close to the end`);
  }
  // One approval per lane, and never two on one lane at once, because a lane is
  // 200px long and a request is 52px across.
  const lanes = new Set(sim.movers.map((mover) => mover.pod));
  if (lanes.size !== sim.movers.length) {
    throw new Error(`${ID} scene: ${sim.movers.length} approvals over ${lanes.size} lanes`);
  }

  const parts = mountRequests(layer, sim.movers.length, ID);

  const tl = createSceneTimeline();

  // --- everything the stage says about itself ------------------------------

  for (const change of sim.changes) {
    const target = change.target === 'stage' ? stage : pods[Number(change.target.slice(4)) - 1];
    if (!target) throw new Error(`${ID} scene: no target for ${change.target}`);
    attr(tl, target, change.name, change.value, change.at);
  }

  // --- the grace rings, which are a quantity rather than a word ------------

  for (const sweep of sim.sweeps) {
    const ring = rings[sweep.pod];
    if (!ring) continue;
    tl.fromTo(
      ring,
      { attr: { 'stroke-dashoffset': GRACE_CIRCUMFERENCE } },
      {
        attr: { 'stroke-dashoffset': 0 },
        duration: Math.max(0.01, Math.min(sweep.to - sweep.from, SCENE_DURATION - sweep.from)),
        ease: 'none',
        immediateRender: false,
      },
      sweep.from,
    );
  }

  // --- the approvals -------------------------------------------------------

  sim.movers.forEach((mover, index) => {
    const item = parts[index];
    if (!item) return;
    const lane = POD_X[mover.pod] ?? 0;
    parkRequest(item, lane, Y_DRAIN_BOTTOM);
    showRequest(tl, item, mover.start);
    moveRequest(tl, item, Y_POD_TOP, round(mover.land - mover.start), mover.start);
    markRequest(tl, item, 'ok', mover.land);
    hideRequest(tl, item, round(mover.land + MARK_HOLD), MARK_FADE);
  });

  // --- sound ---------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels ---------------------------------------------------------

  // The stage is complete on the first frame: three ready pods each holding
  // their share of the load, a budget with one disruption to spare, a drain that
  // has not asked for anything yet, and nothing in the air.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
