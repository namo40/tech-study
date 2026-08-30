import {
  MAX_DONE,
  QUEUE_SLOTS,
  REPLY_FAST_INDEX,
  REPLY_GHOST_INDEX,
  REPLY_VALUES,
  SCENE_DURATION,
  STAGE_STATE,
  TIMEOUT_MS,
  X_LANE,
  Y_APP_BOTTOM,
  Y_HOST_BOTTOM,
  Y_HOST_TOP,
  Y_JOBS_TOP,
} from './stage';
import type { LifeState, Mark, Scale } from './stage';
import { q } from '../shared/dom';
import { hideRequest, markRequest, mountRequests, parkRequest, showRequest } from '../shared/request';
import type { RequestParts } from '../shared/request';
import { collapseAtInstant, createScheduler } from '../shared/simulation';
import { attr, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Background Service scene: a 24 second, four step timeline.
 *
 * The same two rules as every other scene: every tween sits at an absolute
 * position, and every discrete change is a zero-duration tween on a `data-*`
 * attribute that GSAP reverts when the playhead moves back past it. There is no
 * continuous quantity anywhere here on purpose — a queue is a count and a reply
 * time is a number, and both are drawn as stacks of text so that scrubbing lands
 * on the value rather than on an average of two.
 *
 * Nothing the reader counts is authored. The scene is told ten things: when the
 * report is being built inside the request and at which moments the reader looks
 * at the clock, when each request hands work over, when the host starts the
 * service and when it tells it to stop, how long one job takes the loop, when
 * the loop moves out into its own process, when the app is restarting and when
 * the worker is, when a second instance appears, when the lease is taken, and
 * the four moments the captions stop on.
 *
 * Everything else falls out of one pass. The reply doubles at every tick the
 * request is still doing the work itself, and the client gives up at exactly the
 * tick that passes `TIMEOUT_MS` rather than at a moment somebody picked. `queue`
 * is arrivals minus takes, so it climbs on its own whenever the service is not
 * running and nothing anywhere says "buffer now". A stop signal turns into
 * `stopping` when there is a job in the service's hands and into `stopped` when
 * there is not, which is the whole of what graceful shutdown means: the lamp
 * says `stopped` only once the job in hand has landed on the strip. `done` is
 * the count of jobs that landed. Whether a take runs twice is read off the world
 * at the moment of the take — two instances and no lease — so the lease is what
 * changes the answer rather than a flag saying the answer changed.
 *
 * The ledger is checked rather than asserted: at every change, the jobs handed
 * over equal the ones done plus the ones queued plus the one in hand plus the
 * one in flight. That is what makes "no work was lost" a fact about the run and
 * not a caption.
 */

const ID = 'background-service';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- how a traveller moves -------------------------------------------------

/** One speed for every leg any traveller takes, in pixels per second. */
const SPEED = 1250;

/** A flight from the App down to the Host, and from the Host down to the Jobs. */
const LEG_WORK = round((Y_HOST_TOP - Y_APP_BOTTOM) / SPEED);
const LEG_DONE = round((Y_JOBS_TOP - Y_HOST_BOTTOM) / SPEED);
/** How long a traveller that carried no verdict takes to go. */
const FADE = 0.14;
/** A completed job is held longer, because the reader is meant to read it. */
const MARK_FADE = 0.3;
/** The halo around a traveller, which is what keeps two of them apart. */
const HALO = 26;

// --- what the scene is told ------------------------------------------------

/**
 * The moments the reader looks at the clock while the report is being built
 * inside the request. The first tick is where the ghost starts; each one after
 * it doubles the reply, and the client gives up at whichever tick passes the
 * timeout. Nothing here says which one that is.
 */
const REPLY_TICKS = [0.5, 1.4, 2.2];

/** When the App stops doing the work itself and starts handing it over. */
const HANDOFF_AT = 3.0;

/** When each request leaves the App. What it costs the caller follows. */
const ARRIVALS = [3.8, 6.2, 7.5, 8.7, 14.65, 15.2, 15.55, 19.64, 20.7];

/** How long one job takes the loop, and how long the service takes to come up. */
const SERVICE_TIME = 1.2;
const SPIN_UP = 0.4;

/** Every time the host starts the service, and the cue the moment deserves. */
interface StartSignal {
  at: number;
  /** Sounded when the lamp reaches `start`. */
  startCue: SceneCue | null;
  /** Sounded when the loop reaches `running`. */
  runCue: SceneCue | null;
}

const START_SIGNALS: StartSignal[] = [
  { at: 6.5, startCue: 'state', runCue: 'state' },
  { at: 12.5, startCue: 'trip', runCue: null },
  { at: 15.4, startCue: null, runCue: 'success' },
];

/**
 * Every time the host tells the service to stop. What the lamp does next is not
 * here: it depends on whether there is a job in the service's hands.
 */
const STOP_SIGNALS = [9.8, 14.8];

/** When the loop moves out of the Host and becomes its own process. */
const SPLIT_AT = 12.5;

/** The window the app is restarting in. The worker is not part of it. */
const APP_RESTART = { from: 13.6, to: 14.5 };

/** When a second instance of the worker appears, and when the lease is taken. */
const SCALE_AT = 19.65;
const LEASE_AT = 20.6;

/** The three things the scene holds up, and how long each is held for. */
const MARK_AT: [number, Mark, number][] = [
  [4.7, 'split', 0.6],
  [16.8, 'apart', 0.6],
  [21.6, 'truth', 0.6],
];

/** When the picture is called settled: nothing queued, nothing in flight. */
const SETTLE_AT = 22.6;

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
type Kind = 'work' | 'done' | 'dup';

interface Journey {
  y: number;
  to: number;
  kind: Kind;
  showAt: number;
  duration: number;
  landAt: number;
  marked: boolean;
}

/** One job the loop picked up, and whether a second instance picked it up too. */
interface Job {
  id: number;
  duplicate: boolean;
}

/** One row of the books, written every time any of the four buckets moves. */
interface LedgerRow {
  at: number;
  handed: number;
  done: number;
  queued: number;
  hand: number;
  flying: number;
  life: LifeState;
}

interface Simulation {
  changes: AttrChange[];
  cues: [number, SceneCue][];
  journeys: Journey[];
  ledger: LedgerRow[];
  takes: { at: number; id: number; duplicate: boolean; scale: Scale; lease: boolean }[];
  stops: { at: number; through: LifeState; landed: number | null }[];
  done: number;
  maxQueue: number;
}

// --- the simulation --------------------------------------------------------

function simulate(): Simulation {
  const raw: AttrChange[] = [];
  const fired: [number, SceneCue][] = [];
  const journeys: Journey[] = [];
  const ledger: LedgerRow[] = [];
  const problems: string[] = [];

  const setAttr = (at: number, target: string, name: string, value: string): void => {
    raw.push({ at: round(at), target, name, value });
  };
  const cue = (at: number, name: SceneCue): void => {
    fired.push([round(at), name]);
  };

  let queue = 0;
  let done = 0;
  let handed = 0;
  let flying = 0;
  let inHand: Job | null = null;
  let life: LifeState = 'idle';
  let scale: Scale = 'one';
  let lease = false;
  let jobId = 0;
  let maxQueue = 0;

  const doneSeries: number[] = [];
  const takes: { at: number; id: number; duplicate: boolean; scale: Scale; lease: boolean }[] = [];
  const stops: { at: number; through: LifeState; landed: number | null }[] = [];
  const queueMoves: { at: number; from: number; to: number; life: LifeState }[] = [];

  const book = (at: number): void => {
    ledger.push({
      at: round(at),
      handed,
      done,
      queued: queue,
      hand: inHand ? 1 : 0,
      flying,
      life,
    });
  };

  /** Writes the queue depth and the slots that depth fills. */
  const setQueue = (at: number, value: number): void => {
    queueMoves.push({ at: round(at), from: queue, to: value, life });
    queue = value;
    if (value > maxQueue) maxQueue = value;
    setAttr(at, 'stage', 'data-bs-queue', String(value));
    for (let index = 1; index <= QUEUE_SLOTS; index += 1) {
      setAttr(at, `slot-${index}`, 'data-bs-slot', index <= value ? 'held' : 'free');
    }
    book(at);
  };

  const setLife = (at: number, value: LifeState): void => {
    life = value;
    setAttr(at, 'stage', 'data-bs-life', value);
  };

  const { schedule, drain } = createScheduler();

  /**
   * The loop, and the only place a job is ever picked up. It runs when the lamp
   * says `running`, when nothing is already in hand, and when there is something
   * to take — which is why `stopping` needs no flag of its own to stop taking,
   * and why a queue grows by itself while the service is down.
   */
  const tryTake = (at: number): void => {
    if (life !== 'running' || inHand !== null || queue === 0) return;
    // Read off the world, not off a script: two instances and no lease is what
    // makes one job run twice, and the lease is the only thing that changes it.
    const duplicate = scale === 'two' && !lease;
    jobId += 1;
    const job: Job = { id: jobId, duplicate };
    inHand = job;
    setQueue(at, queue - 1);
    setAttr(at, 'stage', 'data-bs-hand', 'on');
    takes.push({ at: round(at), id: job.id, duplicate, scale, lease });
    if (duplicate) {
      setAttr(at, 'stage', 'data-bs-twice', 'on');
      cue(at, 'failure');
    }
    const ends = round(at + SERVICE_TIME);
    schedule(ends, () => finish(ends, job));
  };

  /**
   * A job leaving the service. The lamp does not reach `stopped` here: the job
   * is off the loop but not yet on the strip, and shutting down before it lands
   * is exactly the lost work the second step is about.
   */
  const finish = (at: number, job: Job): void => {
    inHand = null;
    flying += 1;
    setAttr(at, 'stage', 'data-bs-hand', 'off');
    book(at);

    const land = round(at + LEG_DONE);
    journeys.push({
      y: Y_HOST_BOTTOM,
      to: Y_JOBS_TOP,
      kind: job.duplicate ? 'dup' : 'done',
      showAt: at,
      duration: LEG_DONE,
      landAt: land,
      marked: true,
    });

    schedule(land, () => {
      flying -= 1;
      done += 1;
      doneSeries.push(done);
      setAttr(land, 'stage', 'data-bs-done', String(done));
      setAttr(land, `mark-${done}`, 'data-bs-done-mark', 'on');
      if (job.duplicate) setAttr(land, `mark-${done}`, 'data-bs-dup', 'on');
      book(land);
      cue(land, 'success');
      if (life === 'stopping') {
        setLife(land, 'stopped');
        const stop = stops[stops.length - 1];
        if (stop) stop.landed = land;
        cue(land, 'success');
      }
    });

    tryTake(at);
  };

  // --- the report built inside the request ---------------------------------

  REPLY_TICKS.forEach((at, tick) => {
    schedule(at, () => {
      const index = REPLY_GHOST_INDEX + tick;
      const ms = REPLY_VALUES[index];
      if (ms === undefined) {
        problems.push(`the reply readout has no variant ${index}`);
        return;
      }
      const late = ms > TIMEOUT_MS;
      setAttr(at, 'stage', 'data-bs-reply', String(index));
      setAttr(at, 'stage', 'data-bs-work', late ? 'timeout' : 'long');
      cue(at, late ? 'failure' : 'state');
    });
  });

  schedule(HANDOFF_AT, () => {
    setAttr(HANDOFF_AT, 'stage', 'data-bs-work', 'hand');
    setAttr(HANDOFF_AT, 'stage', 'data-bs-mode', 'delegate');
    cue(HANDOFF_AT, 'trip');
  });

  // --- requests that hand their work over ----------------------------------

  ARRIVALS.forEach((at, index) => {
    schedule(at, () => {
      if (at >= APP_RESTART.from && at < APP_RESTART.to) {
        problems.push(`a request left the App at ${at}, while the app was restarting`);
      }
      const land = round(at + LEG_WORK);
      journeys.push({
        y: Y_APP_BOTTOM,
        to: Y_HOST_TOP,
        kind: 'work',
        showAt: at,
        duration: LEG_WORK,
        landAt: land,
        marked: false,
      });
      // The caller is answered as the work leaves, which is the whole point.
      setAttr(at, 'stage', 'data-bs-reply', String(REPLY_FAST_INDEX));
      // The first handoff is the pattern being shown; every one after it is the
      // same event again, and an ordinary world should not announce it.
      if (index === 0) cue(at, 'success');
      schedule(land, () => {
        handed += 1;
        setQueue(land, queue + 1);
        tryTake(land);
      });
    });
  });

  // --- the lifetime contract -----------------------------------------------

  for (const signal of START_SIGNALS) {
    schedule(signal.at, () => {
      setLife(signal.at, 'start');
      if (signal.startCue) cue(signal.at, signal.startCue);
      const runs = round(signal.at + SPIN_UP);
      schedule(runs, () => {
        setLife(runs, 'running');
        if (signal.runCue) cue(runs, signal.runCue);
        tryTake(runs);
      });
    });
  }

  for (const at of STOP_SIGNALS) {
    schedule(at, () => {
      if (life !== 'running' && life !== 'start') {
        problems.push(`a stop signal at ${at} reached a service that was ${life}`);
        return;
      }
      // The one rule of graceful shutdown, and the only place it is written: a
      // job in hand is finished first, so the lamp cannot say `stopped` while
      // there is still work the service accepted and has not delivered.
      const through: LifeState = inHand ? 'stopping' : 'stopped';
      stops.push({ at: round(at), through, landed: through === 'stopped' ? round(at) : null });
      setLife(at, through);
      cue(at, 'state');
    });
  }

  // --- the loop moves out, and the app restarts under it -------------------

  schedule(SPLIT_AT, () => setAttr(SPLIT_AT, 'stage', 'data-bs-place', 'split'));

  schedule(APP_RESTART.from, () => {
    setAttr(APP_RESTART.from, 'stage', 'data-bs-app', 'down');
    cue(APP_RESTART.from, 'state');
  });
  schedule(APP_RESTART.to, () => setAttr(APP_RESTART.to, 'stage', 'data-bs-app', 'up'));

  // --- two instances, and the lease that settles them ----------------------

  schedule(SCALE_AT, () => {
    scale = 'two';
    setAttr(SCALE_AT, 'stage', 'data-bs-scale', 'two');
  });

  schedule(LEASE_AT, () => {
    lease = true;
    setAttr(LEASE_AT, 'stage', 'data-bs-lease', 'on');
    setAttr(LEASE_AT, 'stage', 'data-bs-twice', 'off');
    cue(LEASE_AT, 'state');
  });

  // --- what the scene holds up, and where it stops -------------------------

  for (const [at, value, hold] of MARK_AT) {
    schedule(at, () => {
      setAttr(at, 'stage', 'data-bs-mark', value);
      cue(at, 'state');
    });
    schedule(round(at + hold), () => setAttr(round(at + hold), 'stage', 'data-bs-mark', 'none'));
  }

  schedule(SETTLE_AT, () => {
    setAttr(SETTLE_AT, 'stage', 'data-bs-settled', 'on');
    cue(SETTLE_AT, 'success');
  });

  drain();
  book(SCENE_DURATION);

  // --- what has to be true for the picture to mean anything ---------------

  // The books, checked at every moment any bucket moved. A job that was handed
  // over is queued, in the service's hands, on its way to the strip, or done,
  // and it is exactly one of those.
  for (const row of ledger) {
    const total = row.done + row.queued + row.hand + row.flying;
    if (total !== row.handed) {
      problems.push(`at ${row.at} ${row.handed} jobs were handed over and ${total} can be accounted for`);
    }
    if (row.queued < 0) problems.push(`the queue was ${row.queued} at ${row.at}`);
    if (row.queued > QUEUE_SLOTS) {
      problems.push(`the queue reached ${row.queued} at ${row.at}, the stage draws ${QUEUE_SLOTS} slots`);
    }
  }

  for (let index = 1; index < doneSeries.length; index += 1) {
    if ((doneSeries[index] ?? 0) < (doneSeries[index - 1] ?? 0)) problems.push('done went backwards');
  }
  if (done > MAX_DONE) problems.push(`${done} jobs were done, the strip draws ${MAX_DONE}`);
  if (done !== handed) problems.push(`${handed} jobs were handed over and ${done} were done`);
  if (queue !== 0 || inHand !== null || flying !== 0) {
    problems.push(`the scene ends with ${queue} queued, ${inHand ? 1 : 0} in hand and ${flying} in flight`);
  }

  // A queue only ever grows while the service is not running. Nothing tells it
  // to buffer; there is simply nothing taking anything out of it.
  for (const move of queueMoves) {
    if (move.life !== 'running' && move.to < move.from) {
      problems.push(`the queue fell at ${move.at} while the service was ${move.life}`);
    }
  }

  // Both shapes of shutdown have to appear, and the graceful one has to be the
  // one that had something in hand.
  const graceful = stops.filter((stop) => stop.through === 'stopping');
  if (graceful.length !== 1) problems.push(`${graceful.length} stop signals found a job in hand`);
  for (const stop of graceful) {
    if (stop.landed === null) problems.push(`the service never left "stopping" after ${stop.at}`);
    else if (stop.landed <= stop.at) problems.push(`"stopped" landed at ${stop.landed}, before the job did`);
  }
  if (!stops.some((stop) => stop.through === 'stopped')) {
    problems.push('no stop signal ever found the service empty-handed');
  }

  // Exactly one job ran twice, it ran before the lease, and nothing after the
  // lease did — with a second instance still up, so the lease is what changed.
  const doubled = takes.filter((take) => take.duplicate);
  if (doubled.length !== 1) problems.push(`${doubled.length} jobs were taken twice`);
  for (const take of doubled) {
    if (take.at > LEASE_AT) problems.push(`a job was taken twice at ${take.at}, after the lease`);
  }
  const afterLease = takes.filter((take) => take.at > LEASE_AT && take.scale === 'two');
  if (afterLease.length === 0) problems.push('no job was taken while two instances were up and the lease was held');
  if (afterLease.some((take) => take.duplicate)) problems.push('the lease did not stop the second instance');

  // The reply the first step balloons is a doubling, and exactly one value on
  // the ladder is past what the client will wait for.
  for (let index = REPLY_GHOST_INDEX + 1; index < REPLY_VALUES.length; index += 1) {
    if ((REPLY_VALUES[index] ?? 0) !== (REPLY_VALUES[index - 1] ?? 0) * 2) {
      problems.push(`the reply ladder does not double at ${index}`);
    }
  }
  if (REPLY_TICKS.length !== REPLY_VALUES.length - 1) {
    problems.push(`${REPLY_TICKS.length} ticks were authored for ${REPLY_VALUES.length - 1} ghost replies`);
  }
  if (REPLY_VALUES.filter((ms) => ms > TIMEOUT_MS).length !== 1) {
    problems.push('the reply ladder does not cross the timeout exactly once');
  }

  // Two travellers on one column, closer than their haloes, would read as one.
  const sorted = [...journeys].sort((left, right) => left.showAt - right.showAt);
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (!previous || !current) continue;
    const previousGone = previous.landAt + (previous.marked ? MARK_FADE : FADE);
    if (current.showAt >= previousGone) continue;
    for (let t = current.showAt; t <= previousGone; t = round(t + 0.01)) {
      const a = previous.y + (previous.to - previous.y) * Math.min(1, Math.max(0, (t - previous.showAt) / previous.duration));
      const b = current.y + (current.to - current.y) * Math.min(1, Math.max(0, (t - current.showAt) / current.duration));
      if (Math.abs(a - b) < HALO * 2) {
        problems.push(`two travellers were ${Math.abs(a - b).toFixed(0)}px apart at ${t}`);
        break;
      }
    }
  }
  for (const journey of journeys) {
    if (journey.showAt < 0 || journey.landAt > SCENE_DURATION) {
      problems.push(`a traveller runs off the end of the scene at ${journey.showAt}`);
    }
    for (const edge of BOUNDARIES) {
      const gone = journey.landAt + (journey.marked ? MARK_FADE : FADE);
      if (journey.showAt < edge && gone > edge) problems.push(`a traveller crosses the boundary at ${edge}`);
    }
  }

  // A cue on a step boundary belongs to neither step, and two cues on top of
  // each other are one noise. Two of the same kind on one instant are folded,
  // because a job that lands and a lamp that changes because it landed are one
  // thing happening.
  fired.sort((left, right) => left[0] - right[0]);
  const cues: [number, SceneCue][] = [];
  for (const entry of fired) {
    const previous = cues[cues.length - 1];
    if (previous && previous[0] === entry[0]) {
      if (previous[1] !== entry[1]) problems.push(`a ${previous[1]} and a ${entry[1]} cue share ${entry[0]}`);
      continue;
    }
    cues.push(entry);
  }
  cues.forEach(([at], index) => {
    if (BOUNDARIES.some((edge) => Math.abs(at - edge) < BOUNDARY_GAP - EPS)) {
      problems.push(`a cue at ${at} sits on a step boundary`);
    }
    const previous = cues[index - 1]?.[0];
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

  return { changes, cues, journeys, ledger, takes, stops, done, maxQueue };
}

// --- the timeline ----------------------------------------------------------

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);
  const sim = simulate();

  // The captions name the figures the model produced. Nothing here places them:
  // if the schedule changes, this is what says the captions have stopped
  // describing the scene.
  const graceful = sim.stops.find((stop) => stop.through === 'stopping');
  if (!graceful || graceful.at < 6 || graceful.at >= 12) {
    throw new Error(`${ID} scene: the graceful shutdown did not land in the second step`);
  }
  const doubled = sim.takes.find((take) => take.duplicate);
  if (!doubled || doubled.at < 18 || doubled.at >= 24) {
    throw new Error(`${ID} scene: the duplicate run did not land in the fourth step`);
  }

  const targets: Record<string, Element> = { stage };
  for (let index = 1; index <= QUEUE_SLOTS; index += 1) {
    targets[`slot-${index}`] = q(stage, `.bs-slot--${index}`, ID);
  }
  for (let index = 1; index <= MAX_DONE; index += 1) {
    targets[`mark-${index}`] = q(stage, `.bs-mark--${index}`, ID);
  }

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

    // Work going down to the queue, a job coming off the loop, and the one job
    // two instances both finished are three different things travelling the
    // same column.
    request.group.classList.add(`bs-req--${journey.kind}`);

    parkRequest(request, X_LANE, journey.y);
    showRequest(tl, request, journey.showAt);
    tl.to(
      request.group,
      { y: journey.to, duration: journey.duration, ease: 'none', immediateRender: false },
      journey.showAt,
    );

    if (journey.marked) {
      markRequest(tl, request, 'ok', journey.landAt);
      hideRequest(tl, request, journey.landAt, MARK_FADE);
    } else {
      hideRequest(tl, request, journey.landAt, FADE);
    }
  });

  // --- sound ---------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels ---------------------------------------------------------

  // The stage is complete on the first frame: one request answering in 20 ms
  // with nothing going on inside it, a service the host has not started, an
  // empty queue, an empty done strip and nothing in flight.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
