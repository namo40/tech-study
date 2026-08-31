import {
  LUMPS,
  OK_MAX,
  SCENE_DURATION,
  SHIP_MAX,
  STAGE_STATE,
  X_IN,
  X_LOG,
  X_OUT,
  Y_BACKENDS_TOP,
  Y_POD_BOTTOM,
  Y_POD_TOP,
  Y_TRAFFIC_BOTTOM,
} from './stage';
import type { AmbState, AppState, LifeState, Lump, LumpHome, Mark, SideState, SvcState, WireState } from './stage';
import { q } from '../shared/dom';
import { hideRequest, markRequest, mountRequests, parkRequest, showRequest } from '../shared/request';
import type { RequestParts, RequestResult } from '../shared/request';
import { collapseAtInstant, createScheduler } from '../shared/simulation';
import { attr, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Sidecar scene: a 24 second, four step timeline.
 *
 * The same two rules as every other scene: every tween sits at an absolute
 * position, and every discrete change is a zero-duration tween on a `data-*`
 * attribute that GSAP reverts when the playhead moves back past it. Nothing here
 * is a continuous quantity — a lump is in one seat or the other, a lamp is up or
 * down, a chip is encrypted or it is not, `ok n` is a whole number — so every
 * frame is a set of stacked variants and scrubbing backwards lands on a value
 * rather than on a blend of two.
 *
 * Nothing the reader reads is authored. The scene is told when each lump grows
 * inside the app, when the app next door goes up and comes down, when the pod
 * grows its second seat, when the sidecar attaches, when the lumps move across,
 * when the shared lifetime is demonstrated, when each request is made and
 * whether it needs a backend, when the sidecar ships a batch of logs, when the
 * far service has its blip, how long the ambassador waits before retrying, and
 * when the picture is called settled.
 *
 * Everything else falls out of one pass over the current topology. A request
 * arrives encrypted and is terminated by whatever is in the second seat, crosses
 * the loopback as plaintext, and is answered by the app; a request that needs a
 * backend is handed to the ambassador, and what happens out there — an attempt
 * that lands inside the blip window and fails, a retry that lands outside it and
 * does not — is read off the clock rather than written down. That is why the app
 * is recorded as having made exactly one call while the stage shows two
 * attempts, and why the lumps' new home is never restated: the same three chips
 * are drawn in both seats and the lump's own state says which one is up.
 *
 * The scene does not own the retry policy — how many attempts, how long to back
 * off, which failures deserve one — which is the retry scene's subject. It owns
 * only the fact that the policy moved out of the application and into the
 * container beside it. Nor does it own the lifecycle of a long-running worker
 * inside a host, which is the background service scene's; here both containers
 * share one lifetime and the whole point is that the reader can never catch the
 * two lamps disagreeing.
 */

const ID = 'sidecar';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- how a traveller moves -------------------------------------------------

/** One speed for every leg any traveller takes, in pixels per second. */
const SPEED = 500;

/** The inbound lane, ridden down by a request and back up by its answer. */
const LEG_IN = round((Y_POD_TOP - Y_TRAFFIC_BOTTOM) / SPEED);
/** The two lower lanes, which are the same length as each other. */
const LEG_LOW = round((Y_BACKENDS_TOP - Y_POD_BOTTOM) / SPEED);

/** How long a traveller takes to go once it has nothing left to do. */
const MARK_FADE = 0.14;

/** The halo diameter two travellers on one column must always keep between them. */
const HALO = 52;

// --- what the scene is told ------------------------------------------------

/** When each cross-cutting lump grows inside the application's own code. */
const LUMP_AT: [number, Lump[]][] = [
  [0.5, ['tls']],
  [1.3, ['log', 'retry']],
];

/** When the same lumps appear again in the app next door, and when that is dropped. */
const DUP_AT = 2.2;
const SPLIT_AT = 3.0;

/** When the sidecar takes the second seat, and when the lumps move into it. */
const ATTACH_AT = 6.5;
const MOVE_AT = 7.4;

/** The restart that proves one lifetime: both containers down, then both up. */
const LIFE_DOWN_AT = 9.8;
const LIFE_UP_AT = 10.2;

/**
 * Every request: when it is made, and whether answering it needs a backend.
 * Nothing here says what happens to it — the second seat decides that, and after
 * the ambassador is on duty the third request goes out through it without a
 * single line of this table changing.
 */
interface RequestPlan {
  at: number;
  backend: boolean;
}

const INBOUND: RequestPlan[] = [
  { at: 12.5, backend: false },
  { at: 14.5, backend: false },
  { at: 18.6, backend: true },
];

/** What the sidecar spends terminating, and what the loopback hop costs. */
const TERMINATE = 0.35;
const HANDOVER = 0.18;

/** What the app spends answering, delegating, and finishing once an answer is back. */
const APP_WORK = 0.18;
const APP_CALL = 0.08;
const APP_FINISH = 0.16;

/** What the ambassador spends putting a call on the wire, and before retrying. */
const LAUNCH = 0.09;
const RETRY_DELAY = 0.24;

/** What the far service spends answering a call it is willing to answer. */
const SVC_COST = 0.1;

/** The one window in which the far service is not answering. */
const SVC_BLIP: [number, number] = [20.1, 20.3];

/** When the sidecar sends the batch of log lines it has collected. */
const LOG_SHIP_AT = [14.39, 16.39];

/** When the outward-facing role is put on the sidecar. */
const AMB_ON_AT = 18.35;

/** The six things the scene holds up, and how long each is held for. */
const MARK_AT: [number, Mark, number][] = [
  [3.9, 'notapp', 0.6],
  [4.8, 'seat', 0.4],
  [8.6, 'life', 0.5],
  [10.6, 'thin', 0.4],
  [11.0, 'apart', 0.35],
  [17.2, 'nocode', 0.4],
];

/** When the picture is called settled: the platform's work living beside the app. */
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

/** Which lane a traveller rides, which is also what kind of thing it is. */
type Lane = 'in' | 'log' | 'out';

/**
 * One traveller: down a lane, held at the far edge while whatever it asked for
 * happens, and — for the two lanes that carry an answer — back up the same lane.
 * A log shipment is the same shape with the return leg left off, because nobody
 * waits for a log line.
 */
interface Journey {
  lane: Lane;
  x: number;
  home: number;
  far: number;
  startAt: number;
  leg: number;
  dwell: number;
  returns: boolean;
  markAt: number | null;
  result: RequestResult;
  hideAt: number;
  /** For an inbound request: whether it is still encrypted, and when it stops being. */
  chip: 'locked' | null;
  flipAt: number | null;
}

/** One request, once the scene has run it to the end. */
interface Answered {
  at: number;
  backend: boolean;
  answeredAt: number;
  ok: number;
}

/** One call the ambassador put on the wire, and what came of it. */
interface Attempt {
  at: number;
  landsAt: number;
  ok: boolean;
}

interface Simulation {
  changes: AttrChange[];
  cues: [number, SceneCue][];
  journeys: Journey[];
  answered: Answered[];
  attempts: Attempt[];
  appCalls: number;
  shipped: number;
}

// --- the simulation --------------------------------------------------------

function simulate(): Simulation {
  const raw: AttrChange[] = [];
  const fixed: [number, SceneCue][] = [];
  const journeys: Journey[] = [];
  const answered: Answered[] = [];
  const attempts: Attempt[] = [];
  const problems: string[] = [];

  const setAttr = (at: number, target: string, name: string, value: string): void => {
    raw.push({ at: round(at), target, name, value });
  };
  const cue = (at: number, name: SceneCue): void => {
    fixed.push([round(at), name]);
  };
  const stage = (at: number, name: string, value: string): void => {
    setAttr(at, 'stage', `data-sc-${name}`, value);
  };

  let pod = 'solo';
  let dup = 'off';
  let appState: AppState = 'fat';
  let side: SideState = 'gone';
  let amb: AmbState = 'off';
  let wire: WireState = 'off';
  let gate = 'idle';
  let okValue = 0;
  let svc: SvcState = 'idle';
  let shipped = 0;
  let markValue: Mark = 'none';
  let life: LifeState = 'up';
  let appCalls = 0;
  const home: Record<Lump, LumpHome> = { tls: 'none', log: 'none', retry: 'none' };

  const { schedule, drain } = createScheduler();

  /** One setter per thing the stage says, each of which refuses a no-op. */
  const write = (
    at: number,
    name: string,
    want: string,
    read: () => string,
    keep: (value: string) => void,
  ): void => {
    if (read() === want) return;
    keep(want);
    stage(at, name, want);
  };
  const setPod = (at: number, want: string): void =>
    write(at, 'pod', want, () => pod, (v) => { pod = v; });
  const setDup = (at: number, want: string): void =>
    write(at, 'dup', want, () => dup, (v) => { dup = v; });
  const setApp = (at: number, want: AppState): void =>
    write(at, 'app', want, () => appState, (v) => { appState = v as AppState; });
  const setSide = (at: number, want: SideState): void =>
    write(at, 'side', want, () => side, (v) => { side = v as SideState; });
  const setAmb = (at: number, want: AmbState): void =>
    write(at, 'amb', want, () => amb, (v) => { amb = v as AmbState; });
  const setWire = (at: number, want: WireState): void =>
    write(at, 'wire', want, () => wire, (v) => { wire = v as WireState; });
  const setGate = (at: number, want: string): void =>
    write(at, 'gate', want, () => gate, (v) => { gate = v; });
  const setSvc = (at: number, want: SvcState): void =>
    write(at, 'svc', want, () => svc, (v) => { svc = v as SvcState; });
  const setMark = (at: number, want: Mark): void =>
    write(at, 'mark', want, () => markValue, (v) => { markValue = v as Mark; });
  const setLump = (at: number, id: Lump, want: LumpHome): void =>
    write(at, id, want, () => home[id], (v) => { home[id] = v as LumpHome; });

  /** One lifetime for both containers, so both lamps are written in one breath. */
  const setLife = (at: number, want: LifeState): void => {
    if (life === want) return;
    life = want;
    setAttr(at, 'box-app', 'data-sc-life', want);
    setAttr(at, 'box-side', 'data-sc-life', want);
  };

  /** The counter. It only ever counts an answer that got back out to Traffic. */
  const setOk = (at: number, want: number): void => {
    if (want > OK_MAX) {
      problems.push(`${round(at)} the readout was asked for ok ${want}, which the stage never drew`);
      return;
    }
    if (okValue === want) return;
    okValue = want;
    stage(at, 'ok', String(want));
  };

  /** One mark per batch of log lines that landed in the collector. */
  const setShipped = (at: number, want: number): void => {
    if (want > SHIP_MAX) {
      problems.push(`${round(at)} the collector was asked to hold ${want} marks`);
      return;
    }
    if (shipped === want) return;
    shipped = want;
    stage(at, 'logs', String(want));
  };

  // --- what every service needs, written into every service ------------------

  for (const [at, ids] of LUMP_AT) {
    schedule(at, () => {
      for (const id of ids) setLump(at, id, 'app');
      cue(at, 'state');
    });
  }

  // The same lumps again, in the app next door, in another language. It is drawn
  // in the seat the sidecar will later take, because that is the seat the whole
  // argument is about.
  schedule(DUP_AT, () => {
    if (LUMPS.some((id) => home[id] !== 'app')) {
      problems.push(`${DUP_AT} the ghost copied lumps the app does not have`);
      return;
    }
    setDup(DUP_AT, 'on');
    cue(DUP_AT, 'failure');
  });

  schedule(SPLIT_AT, () => {
    setDup(SPLIT_AT, 'off');
    setPod(SPLIT_AT, 'pair');
    setSide(SPLIT_AT, 'empty');
    cue(SPLIT_AT, 'trip');
  });

  // --- the second container, and what moves into it -------------------------

  schedule(ATTACH_AT, () => {
    if (pod !== 'pair') {
      problems.push(`${ATTACH_AT} something attached to a pod with one seat`);
      return;
    }
    setSide(ATTACH_AT, 'idle');
    setWire(ATTACH_AT, 'idle');
    cue(ATTACH_AT, 'state');
  });

  schedule(MOVE_AT, () => {
    if (side === 'gone' || side === 'empty') {
      problems.push(`${MOVE_AT} the lumps moved into a seat with nothing in it`);
      return;
    }
    for (const id of LUMPS) setLump(MOVE_AT, id, 'side');
    setApp(MOVE_AT, 'slim');
    cue(MOVE_AT, 'state');
  });

  schedule(LIFE_DOWN_AT, () => {
    setLife(LIFE_DOWN_AT, 'down');
    cue(LIFE_DOWN_AT, 'state');
  });

  schedule(LIFE_UP_AT, () => {
    setLife(LIFE_UP_AT, 'up');
    cue(LIFE_UP_AT, 'success');
  });

  // --- the outward-facing role ----------------------------------------------

  schedule(AMB_ON_AT, () => {
    if (side === 'gone' || side === 'empty') {
      problems.push(`${AMB_ON_AT} the role was given to an empty seat`);
      return;
    }
    setAmb(AMB_ON_AT, 'on');
    cue(AMB_ON_AT, 'state');
  });

  // --- what the ambassador does out there -----------------------------------

  /**
   * One attempt at the far service. Whether it works is read off the clock: a
   * call that lands inside the blip window does not come back, and one that
   * lands outside it does. Nothing says "this one fails".
   */
  const callOut = (at: number, done: (backAt: number) => void): void => {
    const launch = round(at + LAUNCH);
    const lands = round(launch + LEG_LOW);
    const ok = lands < SVC_BLIP[0] - EPS || lands > SVC_BLIP[1] + EPS;
    attempts.push({ at: round(at), landsAt: lands, ok });
    schedule(launch, () => {
      setWire(launch, 'idle');
    });
    if (!ok) {
      journeys.push({
        lane: 'out',
        x: X_OUT,
        home: Y_POD_BOTTOM,
        far: Y_BACKENDS_TOP,
        startAt: launch,
        leg: LEG_LOW,
        dwell: 0,
        returns: false,
        markAt: lands,
        result: 'fail',
        hideAt: lands,
        chip: null,
        flipAt: null,
      });
      schedule(lands, () => {
        setSvc(lands, 'fail');
        cue(lands, 'state');
      });
      const again = round(lands + RETRY_DELAY);
      schedule(again, () => {
        setSvc(again, 'idle');
        callOut(round(again - LAUNCH), done);
      });
      return;
    }
    const back = round(lands + SVC_COST);
    const homeAt = round(back + LEG_LOW);
    journeys.push({
      lane: 'out',
      x: X_OUT,
      home: Y_POD_BOTTOM,
      far: Y_BACKENDS_TOP,
      startAt: launch,
      leg: LEG_LOW,
      dwell: SVC_COST,
      returns: true,
      markAt: back,
      result: 'ok',
      hideAt: homeAt,
      chip: null,
      flipAt: null,
    });
    schedule(lands, () => setSvc(lands, 'busy'));
    schedule(back, () => {
      setSvc(back, 'ok');
      cue(back, 'success');
      const clear = round(back + 0.34);
      schedule(clear, () => setSvc(clear, 'idle'));
    });
    schedule(homeAt, () => done(homeAt));
  };

  // --- what a request does --------------------------------------------------

  INBOUND.forEach((plan) => {
    schedule(plan.at, () => {
      if (side === 'gone' || side === 'empty') {
        problems.push(`${plan.at} a request arrived with nothing in the pod to terminate it`);
        return;
      }
      setGate(plan.at, 'live');
      cue(plan.at, 'state');

      const lands = round(plan.at + LEG_IN);
      const terminated = round(lands + TERMINATE);
      const taken = round(terminated + HANDOVER);

      schedule(terminated, () => {
        // The sidecar takes the encryption off and puts the request on the pod's
        // own loopback. From here on the app is only ever offered plaintext.
        setSide(terminated, 'busy');
        setWire(terminated, 'plain');
        cue(terminated, 'state');
      });

      schedule(taken, () => {
        setSide(taken, 'idle');
        setWire(taken, 'idle');
        setApp(taken, 'serving');
      });

      /** The answer going back out, and the traveller that carries it. */
      const close = (finish: number): void => {
        const arrives = round(finish + LEG_IN);
        journeys.push({
          lane: 'in',
          x: X_IN,
          home: Y_TRAFFIC_BOTTOM,
          far: Y_POD_TOP,
          startAt: round(plan.at),
          leg: LEG_IN,
          dwell: round(finish - lands),
          returns: true,
          markAt: arrives,
          result: 'ok',
          hideAt: arrives,
          chip: 'locked',
          flipAt: terminated,
        });
        schedule(finish, () => setApp(finish, 'slim'));
        schedule(arrives, () => {
          setOk(arrives, okValue + 1);
          setGate(arrives, 'idle');
          cue(arrives, 'success');
          answered.push({ at: round(plan.at), backend: plan.backend, answeredAt: arrives, ok: okValue });
        });
      };

      if (!plan.backend) {
        close(round(taken + APP_WORK));
        return;
      }

      // The app calls what it believes is a local service. It hands the call
      // across the same loopback and then waits: whatever the ambassador has to
      // do out there, the app makes exactly one call and gets one answer.
      const calls = round(taken + APP_CALL);
      schedule(calls, () => {
        if (amb === 'off') {
          problems.push(`${calls} the app called out with no ambassador on duty`);
          return;
        }
        appCalls += 1;
        setApp(calls, 'calling');
        setAmb(calls, 'working');
        setSide(calls, 'busy');
        setWire(calls, 'plain');
        cue(calls, 'state');
        callOut(calls, (backAt) => {
          setAmb(backAt, 'on');
          setSide(backAt, 'idle');
          setApp(backAt, 'serving');
          setWire(backAt, 'plain');
          const finish = round(backAt + APP_FINISH);
          schedule(finish, () => setWire(finish, 'idle'));
          close(finish);
        });
      });
    });
  });

  // --- what the sidecar ships out the back ----------------------------------

  for (const at of LOG_SHIP_AT) {
    schedule(at, () => {
      if (home.log !== 'side') {
        problems.push(`${at} a log shipment left a pod whose logging is still in the app`);
        return;
      }
      setSide(at, 'busy');
      const lands = round(at + LEG_LOW);
      journeys.push({
        lane: 'log',
        x: X_LOG,
        home: Y_POD_BOTTOM,
        far: Y_BACKENDS_TOP,
        startAt: round(at),
        leg: LEG_LOW,
        dwell: 0,
        returns: false,
        markAt: lands,
        result: 'ok',
        hideAt: lands,
        chip: null,
        flipAt: null,
      });
      schedule(lands, () => {
        setShipped(lands, shipped + 1);
        setSide(lands, 'idle');
        cue(lands, 'success');
      });
    });
  }

  // --- what the scene holds up, and where it stops --------------------------

  for (const [at, value, hold] of MARK_AT) {
    schedule(at, () => {
      setMark(at, value);
      cue(at, 'state');
    });
    schedule(round(at + hold), () => setMark(round(at + hold), 'none'));
  }

  schedule(SETTLE_AT, () => {
    stage(SETTLE_AT, 'settled', 'on');
    cue(SETTLE_AT, 'success');
  });

  drain();

  return finish({ raw, fixed, journeys, answered, attempts, appCalls, shipped, problems });
}

// --- what has to be true for the picture to mean anything ------------------

interface RawSimulation {
  raw: AttrChange[];
  fixed: [number, SceneCue][];
  journeys: Journey[];
  answered: Answered[];
  attempts: Attempt[];
  appCalls: number;
  shipped: number;
  problems: string[];
}

/** Where a traveller is at `t`: down the lane, held at the far edge, back up. */
const whereAt = (journey: Journey, t: number): number => {
  const span = journey.far - journey.home;
  const d = t - journey.startAt;
  if (d <= 0) return journey.home;
  if (d <= journey.leg) return journey.home + span * (d / journey.leg);
  if (!journey.returns) return journey.far;
  if (d <= journey.leg + journey.dwell) return journey.far;
  const back = d - journey.leg - journey.dwell;
  if (back >= journey.leg) return journey.home;
  return journey.far - span * (back / journey.leg);
};

/** Turns a series of changes into the windows in which one value is held. */
const windowsOf = (
  changes: AttrChange[],
  name: string,
  initial: string,
  wanted: (value: string) => boolean,
): [number, number][] => {
  const points: [number, string][] = [[0, initial]];
  for (const change of changes) {
    if (change.name === name) points.push([change.at, change.value]);
  }
  const out: [number, number][] = [];
  for (let i = 0; i < points.length; i += 1) {
    const entry = points[i];
    if (!entry || !wanted(entry[1])) continue;
    out.push([entry[0], points[i + 1]?.[0] ?? SCENE_DURATION]);
  }
  return out;
};

function finish(sim: RawSimulation): Simulation {
  const { raw, fixed, journeys, answered, attempts, appCalls, shipped } = sim;
  const problems = [...sim.problems];

  // Every request answered once, and answered by whatever was in the pod at the
  // instant it arrived.
  if (answered.length !== INBOUND.length) {
    problems.push(`${answered.length} of ${INBOUND.length} requests were answered`);
  }
  for (const plan of INBOUND) {
    const answers = answered.filter((entry) => entry.at === round(plan.at));
    if (answers.length !== 1) {
      problems.push(`the request at ${plan.at} was answered ${answers.length} times`);
      continue;
    }
    const answer = answers[0];
    if (!answer) continue;
    if (answer.answeredAt <= plan.at) {
      problems.push(`the request at ${plan.at} was answered before it was made`);
    }
    if (plan.at < ATTACH_AT) {
      problems.push(`${plan.at} a request arrived before there was a sidecar to terminate it`);
    }
  }
  if (answered.at(-1)?.ok !== INBOUND.length) {
    problems.push(`the readout finished on ok ${answered.at(-1)?.ok}`);
  }

  // The whole fourth step: the app made one call, the ambassador made two, and
  // the one that failed is not the one the app was handed back.
  const wantsBackend = INBOUND.filter((plan) => plan.backend).length;
  if (appCalls !== wantsBackend) {
    problems.push(`the app made ${appCalls} calls for ${wantsBackend} requests that needed one`);
  }
  if (attempts.length !== 2) {
    problems.push(`the ambassador made ${attempts.length} attempts, not two`);
  }
  if (attempts.filter((entry) => !entry.ok).length !== 1) {
    problems.push(`${attempts.filter((entry) => !entry.ok).length} attempts failed, not one`);
  }
  if (attempts.at(-1)?.ok !== true) {
    problems.push('the ambassador handed back an answer it never got');
  }
  for (const attempt of attempts) {
    const inside = attempt.landsAt >= SVC_BLIP[0] - EPS && attempt.landsAt <= SVC_BLIP[1] + EPS;
    if (inside === attempt.ok) {
      problems.push(`the attempt landing at ${attempt.landsAt} was decided against the clock`);
    }
  }
  if (shipped !== LOG_SHIP_AT.length) {
    problems.push(`${shipped} of ${LOG_SHIP_AT.length} log shipments landed`);
  }

  // --- the discrete changes, in time order and collapsed -------------------

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

  // The readout counts answers, the collector counts shipments, and neither
  // ever counts anything else: both go up by one at a time and never come down.
  let held = 0;
  for (const change of changes) {
    if (change.name !== 'data-sc-ok') continue;
    const value = Number(change.value);
    if (value !== held + 1) problems.push(`${change.at} the readout went from ok ${held} to ok ${value}`);
    held = value;
  }
  let marks = 0;
  for (const change of changes) {
    if (change.name !== 'data-sc-logs') continue;
    const value = Number(change.value);
    if (value !== marks + 1) problems.push(`${change.at} the collector went from ${marks} to ${value}`);
    marks = value;
  }

  // One lifetime means one write: the two lamps are never touched apart.
  const byInstant = new Map<number, Set<string>>();
  for (const change of changes) {
    if (change.name !== 'data-sc-life') continue;
    const at = byInstant.get(change.at) ?? new Set<string>();
    at.add(`${change.target}=${change.value}`);
    byInstant.set(change.at, at);
  }
  for (const [at, set] of byInstant) {
    const values = new Set([...set].map((entry) => entry.split('=')[1]));
    if (set.size !== 2 || values.size !== 1) {
      problems.push(`${at} the two lifetime lamps were written apart: ${[...set].join(' ')}`);
    }
  }

  // A lump only ever moves one way, and none is left in the app after the move.
  for (const id of LUMPS) {
    const order = ['none', 'app', 'side'];
    let reached = 0;
    for (const change of changes) {
      if (change.name !== `data-sc-${id}`) continue;
      const want = order.indexOf(change.value);
      if (want !== reached + 1) {
        problems.push(`${change.at} ${id} went from ${order[reached]} to ${change.value}`);
      }
      reached = want;
      if (change.value === 'app' && change.at > MOVE_AT) {
        problems.push(`${change.at} ${id} moved back into the app`);
      }
    }
    if (reached !== 2) problems.push(`${id} never reached the sidecar`);
  }

  // The app is only ever offered plaintext: no window in which it is holding a
  // request overlaps a window in which that request is still encrypted.
  const busyApp = windowsOf(changes, 'data-sc-app', 'fat', (v) => v === 'serving' || v === 'calling');
  for (const journey of journeys) {
    if (journey.chip !== 'locked' || journey.flipAt === null) continue;
    for (const [from, to] of busyApp) {
      if (from < journey.flipAt - EPS && to > journey.startAt + EPS) {
        problems.push(`${from} the app was handed a request that was still encrypted`);
      }
    }
  }
  for (const [from] of windowsOf(changes, 'data-sc-wire', 'off', (v) => v === 'plain')) {
    if (from < ATTACH_AT) problems.push(`${from} the loopback carried plaintext with no sidecar on it`);
  }

  // Every traveller rides one of the three declared lanes, end to end.
  for (const journey of journeys) {
    const span = round(journey.startAt + (journey.returns ? 2 : 1) * journey.leg + journey.dwell);
    if (Math.abs(span - journey.hideAt) > 0.001) {
      problems.push(`a traveller from ${journey.startAt} is taken away at ${journey.hideAt}, not ${span}`);
    }
    if (journey.lane === 'in' && journey.x !== X_IN) problems.push('an inbound traveller left its lane');
    if (journey.lane === 'log' && journey.x !== X_LOG) problems.push('a log shipment left its lane');
    if (journey.lane === 'out' && journey.x !== X_OUT) problems.push('an outbound call left its lane');
    if (journey.startAt < ATTACH_AT) {
      problems.push(`${journey.startAt} something travelled with nothing in the second seat`);
    }
    if (journey.startAt < 0 || journey.hideAt + MARK_FADE > SCENE_DURATION) {
      problems.push(`a traveller runs off the end of the scene at ${journey.startAt}`);
    }
  }

  // Two travellers on one column, measured rather than assumed, and measured
  // across directions because the outbound column carries traffic each way.
  for (const lane of ['in', 'log', 'out'] as const) {
    const onLane = journeys
      .filter((journey) => journey.lane === lane)
      .sort((l, r) => l.startAt - r.startAt);
    for (let a = 0; a < onLane.length; a += 1) {
      for (let b = a + 1; b < onLane.length; b += 1) {
        const left = onLane[a];
        const right = onLane[b];
        if (!left || !right) continue;
        const from = Math.max(left.startAt, right.startAt);
        const to = Math.min(left.hideAt + MARK_FADE, right.hideAt + MARK_FADE);
        if (to <= from) continue;
        for (let t = from; t <= to + EPS; t = round(t + 0.01)) {
          const apart = Math.abs(whereAt(left, t) - whereAt(right, t));
          if (apart < HALO - EPS) {
            problems.push(
              `travellers from ${left.startAt} and ${right.startAt} are ${apart.toFixed(0)}px apart at ${round(t)}`,
            );
            t = to;
          }
        }
      }
    }
  }

  // A cue on a step boundary belongs to neither step, and two cues on top of
  // each other are one noise.
  fixed.sort((left, right) => left[0] - right[0]);
  const cues: [number, SceneCue][] = [];
  for (const entry of fixed) {
    const previous = cues.at(-1);
    if (previous && previous[0] === entry[0]) continue;
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

  journeys.sort((left, right) => left.startAt - right.startAt);

  return { changes, cues, journeys, answered, attempts, appCalls, shipped };
}

// --- the timeline ----------------------------------------------------------

/** The seal an encrypted request carries, and the plain rules left once it is off. */
const CHIP_GLYPHS: [string, string, string][] = [
  ['circle', 'sc-lock-ring', ''],
  [
    'path',
    'sc-lock',
    'M -8 -1 L -8 10 L 8 10 L 8 -1 Z M -4.5 -1 L -4.5 -6 A 4.5 4.5 0 0 1 4.5 -6 L 4.5 -1',
  ],
  ['path', 'sc-plain', 'M -9 -4 L 9 -4 M -9 3 L 4 3'],
];

/**
 * Adds one decoration to a request group, left for CSS rather than inline style
 * and inserted under the result markers so a check is never drawn over.
 */
function decorate(parts: RequestParts, tag: string, className: string, d: string): void {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  element.setAttribute('class', className);
  if (d) element.setAttribute('d', d);
  else element.setAttribute('r', '24');
  parts.group.insertBefore(element, parts.ok);
}

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);
  const sim = simulate();

  // The captions name the figures the model produced. Nothing here places them:
  // if the schedule changes, this is what says the captions have stopped
  // describing the scene.
  if (sim.answered.filter((entry) => entry.backend).length !== 1) {
    throw new Error(`${ID} scene: the fourth step promises exactly one call that leaves the pod`);
  }
  if (sim.appCalls !== 1 || sim.attempts.length !== 2) {
    throw new Error(`${ID} scene: the fourth step promises one call answered after two attempts`);
  }
  if (sim.shipped !== 2) {
    throw new Error(`${ID} scene: the third step promises the sidecar ships what it collected`);
  }
  if (sim.journeys.filter((journey) => journey.lane === 'log').length !== 2) {
    throw new Error(`${ID} scene: the log lane carries something other than the two shipments`);
  }

  const targets: Record<string, Element> = {
    stage,
    'box-app': q(stage, '.sc-box--app', ID),
    'box-side': q(stage, '.sc-box--side', ID),
  };

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

    request.group.classList.add(`sc-req--${journey.lane}`);

    // An inbound request wears its encryption. The seal comes off where the
    // sidecar takes it off and nowhere else, which is the whole third step.
    if (journey.chip !== null && journey.flipAt !== null) {
      for (const [tag, className, d] of CHIP_GLYPHS) decorate(request, tag, className, d);
      request.group.setAttribute('data-sc-chip', journey.chip);
      attr(tl, request.group, 'data-sc-chip', 'plain', journey.flipAt);
    }

    parkRequest(request, journey.x, journey.home);
    showRequest(tl, request, journey.startAt);
    tl.to(
      request.group,
      { y: journey.far, duration: journey.leg, ease: 'none', immediateRender: false },
      journey.startAt,
    );
    if (journey.returns) {
      tl.to(
        request.group,
        { y: journey.home, duration: journey.leg, ease: 'none', immediateRender: false },
        round(journey.startAt + journey.leg + journey.dwell),
      );
    }

    if (journey.markAt !== null) markRequest(tl, request, journey.result, journey.markAt);
    hideRequest(tl, request, journey.hideAt, MARK_FADE);
  });

  // --- sound ---------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels ---------------------------------------------------------

  // The stage is complete on the first frame: a quiet gate and `ok 0` in
  // Traffic, a pod drawn around one seat holding an `app` with nothing in it
  // yet, no wiring, an idle `svc`, an empty `logs` card, and nothing in flight.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
