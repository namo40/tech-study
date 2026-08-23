import {
  ATTEMPT_MS,
  BAR_W,
  BUDGET_MS,
  CONNECT_MS,
  GAUGE_W,
  LABEL_DY,
  METER_W,
  MS,
  PATIENCE,
  SCENE_DURATION,
  STAGE_STATE,
  THREAD_COUNT,
  X_DB,
  X_HTTP,
  X_LANE,
  Y_CLIENT,
  Y_DEP,
  Y_FORK,
  Y_SERVICE,
} from './stage';
import { q, qa } from '../shared/dom';
import {
  attachToRequest,
  hideRequest,
  markRequest,
  mountRequests,
  parkRequest,
  showRequest,
  type RequestResult,
} from '../shared/request';
import { collapseAtInstant, createScheduler } from '../shared/simulation';
import { attr, fadeAt, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Request Timeout scene: a 24 second, four step timeline.
 *
 * Same two rules as the other scenes: every tween sits at an absolute position,
 * and every discrete change is a zero-duration tween on a `data-*` attribute
 * that GSAP reverts when the playhead moves back past it.
 *
 * Nothing the reader counts is authored. The scene says only when each request
 * leaves the client, which dependency each of its calls goes to, how many
 * milliseconds that dependency needs, and what the dependency does once the
 * caller has stopped waiting. Everything else falls out of one run over the
 * whole 24 seconds: which thread each request holds and when it gives it back,
 * how far each dependency's bar gets, which ceiling fires and when, how much of
 * the deadline is left at every hundred milliseconds, how far past the deadline
 * the second run of step 3 gets, and how full the waiting meter is.
 *
 * Two things are worth spelling out.
 *
 * The clocks. A call's ceiling runs from the moment the Service dispatches it,
 * except that a call which has to open a connection first is covered by
 * `CONNECT_MS` until it is connected and by `ATTEMPT_MS` afterwards: that is
 * what makes them three settings rather than one. A request that runs on a
 * deadline instead gets `BUDGET_MS` when it arrives, and each of its calls is
 * bounded by whatever is left of it. That is the whole point of step 3, so the
 * contrast run asks for a fresh ceiling instead, and it ends up past the
 * deadline by exactly the connect time nobody accounted for.
 *
 * The waiting meter. It is not a per-request bar. It fills while the client has
 * anything outstanding and empties when it has nothing, so step 1 fills it to
 * the top with three requests that never come back and every other step barely
 * moves it. `PATIENCE` is the only quantity in the scene not measured in
 * milliseconds, because it measures a person rather than a network.
 */

const ID = 'request-timeout';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- how long a leg takes -------------------------------------------------

/** Client box to the Service, and back. */
const LEG_CLIENT = 0.25;
/** The Service down to a dependency, split so the sideways move clears the node. */
const TO_FORK = 0.1;
const FORK = 0.06;
const TO_BOX = 0.09;
/** The whole leg between the Service and a box, either way. */
const LEG_DEP = round(TO_FORK + FORK + TO_BOX);
/** How long a cancellation takes to reach the dependency. */
const CANCEL_LAG = 0.1;
/** How long a bar takes to clear once its box goes idle. */
const CLEAR = 0.15;
/** How long a cancelled bar stands still before it is cleared away. */
const CANCEL_HOLD = 0.25;
/** How long a ceiling stays lit after it has fired. */
const LIT = 0.5;
/** How long after a request is home the waiting meter drops back to nothing. */
const METER_RESET = 0.15;

// --- what the scene is told -----------------------------------------------

type Target = 'db' | 'http';
/** What a dependency does once the caller has stopped waiting for it. */
type Ending = 'clear' | 'ghost' | 'cancel';

interface CallPlan {
  target: Target;
  /** Milliseconds of work the dependency needs once it is connected. */
  work: number;
  /** Milliseconds spent opening the connection first. */
  connect?: number;
  /** The dependency stops at this share of its work and never finishes. */
  hang?: number;
  /** It never connects at all. */
  noConnect?: boolean;
  /** What becomes of the work after the caller has gone. Defaults to `clear`. */
  ending?: Ending;
}

interface RequestPlan {
  /** When the request leaves the client. */
  start: number;
  /** The calls it makes, one after another. */
  calls: CallPlan[];
  /**
   * Whether the request runs on a deadline, and whether its second call is
   * given what is left of that deadline or a ceiling of its own.
   */
  deadline?: 'propagate' | 'fresh';
}

/** The one dependency latency the scene reuses: slower than any ceiling on it. */
const SLOW = 900;

const REQUESTS: RequestPlan[] = [
  // Step 1: no ceilings at all. Three calls into a dependency that hangs.
  { start: 0.4, calls: [{ target: 'http', work: SLOW, hang: 0.3 }] },
  { start: 1.2, calls: [{ target: 'http', work: SLOW, hang: 0.3 }] },
  { start: 2.0, calls: [{ target: 'http', work: SLOW, hang: 0.3 }] },
  // Step 2: the same hang under a per-attempt ceiling, a connection that never
  // opens, and a call that answers well inside every ceiling.
  { start: 6.4, calls: [{ target: 'http', work: SLOW, hang: 0.3 }] },
  { start: 8.4, calls: [{ target: 'http', work: SLOW, noConnect: true }] },
  { start: 10.0, calls: [{ target: 'db', work: 200 }] },
  // Step 3: one deadline across two calls, then the same two calls with a fresh
  // ceiling on the second one instead of the budget that was left.
  {
    start: 12.2,
    deadline: 'propagate',
    calls: [
      { target: 'db', work: 50 },
      { target: 'http', work: SLOW },
    ],
  },
  {
    start: 14.8,
    deadline: 'fresh',
    calls: [
      { target: 'db', work: 50 },
      { target: 'http', work: SLOW, connect: 100 },
    ],
  },
  // Step 4: the same timeout twice, once without a cancellation and once with.
  { start: 18.4, calls: [{ target: 'http', work: SLOW, ending: 'ghost' }] },
  { start: 20.95, calls: [{ target: 'http', work: SLOW, ending: 'cancel' }] },
];

/** When step 1 is cleared away, which is the only thing the scene resets. */
const RESET_AT = 6.0;
/** When the three ceilings are configured, which is what step 2 opens on. */
const LIMITS_AT = 6.1;

// --- what the run produces ------------------------------------------------

interface AttrChange {
  at: number;
  key: string;
  name: string;
  value: string;
}

/** A bar, meter or gauge moving from one width to another. */
interface WidthSpan {
  key: string;
  at: number;
  duration: number;
  from: number;
  to: number;
}

interface Leg {
  at: number;
  duration: number;
  x?: number;
  y?: number;
}

interface Journey {
  start: number;
  legs: Leg[];
  marks: [number, RequestResult][];
  /** Times a result marker goes back to being a plain dot. */
  clears: number[];
  /** What the request carries, and between which times. */
  labels: [string, number, number][];
  /** When it stops being on the stage. */
  endAt: number;
  /** True for a request the reset took away rather than one that came home. */
  abandoned: boolean;
}

interface Run {
  attrs: AttrChange[];
  widths: WidthSpan[];
  journeys: Journey[];
  /** The answer nobody is waiting for, when the scene produces one. */
  ghost?: { from: number; to: number };
  cues: [number, SceneCue][];
}

const laneOf = (target: Target): number => (target === 'db' ? X_DB : X_HTTP);

/**
 * Runs the whole scene once.
 *
 * A request takes the lowest free thread when it arrives and gives it back when
 * it leaves for the client, whichever way it ended. A dependency's bar belongs
 * to the call that started it, so a second call arriving at a box that is
 * already stuck does not restart it: that is why three hung calls in step 1
 * look like one frozen bar and three held threads.
 */
function simulate(): Run {
  const attrs: AttrChange[] = [];
  const widths: WidthSpan[] = [];
  const journeys: Journey[] = REQUESTS.map((plan) => ({
    start: plan.start,
    legs: [],
    marks: [],
    clears: [],
    labels: [],
    endAt: plan.start,
    abandoned: false,
  }));
  const cues: [number, SceneCue][] = [];
  let ghost: Run['ghost'];

  const threads: (number | null)[] = Array.from({ length: THREAD_COUNT }, () => null);
  /** Requests the client is still waiting on. */
  const outstanding = new Set<number>();
  /** When the current wait began, or null while the client waits on nothing. */
  let waitFrom: number | null = null;
  let gaveUp = false;
  /** Whether a box is showing a call, so a later one cannot restart a stuck bar. */
  const boxBusy: Record<Target, boolean> = { db: false, http: false };
  /** How wide each bar currently is, so a clear starts from where it stopped. */
  const barAt: Record<Target, number> = { db: 0, http: 0 };

  const { schedule, drain } = createScheduler();

  const set = (at: number, key: string, name: string, value: string): void =>
    collapseAtInstant(
      attrs,
      { at: round(at), key, name, value },
      (change) => `${change.key}@${change.name}`,
    );

  const cue = (at: number, name: SceneCue): void => {
    cues.push([round(at), name]);
  };

  const width = (key: string, at: number, duration: number, from: number, to: number): void => {
    widths.push({ key, at: round(at), duration: round(duration), from, to });
  };

  /** Moves one dependency's bar, and remembers where it ended up. */
  const bar = (target: Target, at: number, duration: number, to: number): void => {
    width(`bar-${target}`, at, duration, barAt[target], to);
    barAt[target] = to;
  };

  // --- the waiting meter, which is one continuous quantity ----------------

  const meterStart = (at: number): void => {
    if (waitFrom !== null) return;
    waitFrom = at;
    const opened = at;
    schedule(round(at + PATIENCE), () => {
      if (waitFrom !== opened || outstanding.size === 0) return;
      const at2 = round(opened + PATIENCE);
      width('meter', opened, PATIENCE, 0, METER_W);
      set(at2, 'stage', 'data-wait', 'gave');
      cue(at2, 'trip');
      gaveUp = true;
      waitFrom = null;
    });
  };

  /** Closes off the stretch the client has been waiting, and empties the meter. */
  const meterStop = (at: number): void => {
    if (waitFrom === null) return;
    const elapsed = round(at - waitFrom);
    width('meter', waitFrom, elapsed, 0, Math.min(1, elapsed / PATIENCE) * METER_W);
    width('meter', round(at + METER_RESET), 0, 0, 0);
    waitFrom = null;
  };

  // --- threads ------------------------------------------------------------

  const takeThread = (at: number, index: number): number => {
    const slot = threads.findIndex((holder) => holder === null);
    if (slot < 0) return -1;
    threads[slot] = index;
    set(at, `thread-${slot}`, 'data-slot-state', 'busy');
    if (threads.every((holder) => holder !== null)) cue(at, 'state');
    return slot;
  };

  // --- one request --------------------------------------------------------

  const depart = (index: number): void => {
    const plan = REQUESTS[index];
    const journey = journeys[index];
    if (!plan || !journey) return;

    journey.legs.push({ at: plan.start, duration: LEG_CLIENT, y: Y_SERVICE });
    outstanding.add(index);
    meterStart(plan.start);

    const arrive = round(plan.start + LEG_CLIENT);
    schedule(arrive, () => {
      const slot = takeThread(arrive, index);
      const hasDeadline = plan.deadline !== undefined;
      const budgetEnd = hasDeadline ? round(arrive + BUDGET_MS * MS) : null;

      if (budgetEnd !== null) {
        set(arrive, 'stage', 'data-deadline', 'on');
        width('gauge', arrive, round(BUDGET_MS * MS), GAUGE_W, 0);
        for (let left = BUDGET_MS; left >= 0; left -= 100) {
          set(round(arrive + (BUDGET_MS - left) * MS), 'stage', 'data-budget', String(left));
        }
        cue(arrive, 'state');
        // A deadline that runs out while the request is still going is the
        // whole argument of step 3, so it is checked rather than scripted.
        schedule(budgetEnd, () => {
          if (!outstanding.has(index) || plan.deadline !== 'fresh') return;
          set(budgetEnd, 'stage', 'data-deadline', 'over');
          set(budgetEnd, 'stage', 'data-wait', 'over');
          cue(budgetEnd, 'trip');
        });
      }

      /** Sends the request home either way, and gives the thread back. */
      const goHome = (at: number, result: RequestResult): void => {
        journey.legs.push({ at, duration: LEG_CLIENT, y: Y_CLIENT });
        if (slot >= 0) {
          threads[slot] = null;
          set(at, `thread-${slot}`, 'data-slot-state', 'free');
        }
        const home = round(at + LEG_CLIENT);
        journey.endAt = home;
        cue(home, result === 'ok' ? 'success' : 'failure');
        outstanding.delete(index);
        if (outstanding.size === 0 && !gaveUp) meterStop(home);
        if (budgetEnd === null) return;
        // How far past the deadline the request actually got, drawn as the
        // gauge filling back up in the colour of a limit that was blown.
        if (at > budgetEnd && plan.deadline === 'fresh') {
          const over = round(at - budgetEnd);
          width('gauge', budgetEnd, over, 0, (over / MS / BUDGET_MS) * GAUGE_W);
          for (let past = 100; past <= Math.round(over / MS); past += 100) {
            set(round(budgetEnd + past * MS), 'stage', 'data-budget', `over${past / 100}`);
          }
          set(home, 'stage', 'data-wait', 'idle');
        }
        set(home, 'stage', 'data-deadline', 'off');
        set(home, 'stage', 'data-budget', 'off');
        width('gauge', home, 0, GAUGE_W, GAUGE_W);
      };

      /** Dispatches call `step` and books everything that could end it. */
      const call = (step: number, from: number): void => {
        const spec = plan.calls[step];
        if (!spec) return;
        const target = spec.target;
        const lane = laneOf(target);
        const last = step === plan.calls.length - 1;

        journey.legs.push({ at: from, duration: TO_FORK, y: Y_FORK });
        journey.legs.push({ at: round(from + TO_FORK), duration: FORK, x: lane });
        journey.legs.push({ at: round(from + TO_FORK + FORK), duration: TO_BOX, y: Y_DEP });
        const atBox = round(from + LEG_DEP);
        const connectFor = spec.noConnect ? 0 : (spec.connect ?? 0) * MS;
        const connected = round(atBox + connectFor);
        const workFor = round(spec.work * MS);

        // Whether this call owns the box's bar, or joined a stuck one.
        const mine = !boxBusy[target];
        if (mine) {
          boxBusy[target] = true;
          if (spec.noConnect) set(atBox, target, 'data-work', 'connecting');
          else if (connectFor > 0) {
            set(atBox, target, 'data-work', 'connecting');
            set(connected, target, 'data-work', 'running');
          } else set(atBox, target, 'data-work', 'running');
        }

        /** Hands the box back, whatever it was doing. */
        const release = (at: number): void => {
          if (!mine) return;
          boxBusy[target] = false;
          set(at, target, 'data-work', 'idle');
        };

        // When the work would be done, and when a ceiling would cut it off.
        const hang = spec.hang;
        const workEnd = spec.noConnect || hang !== undefined ? null : round(connected + workFor);
        const hangEnd = hang === undefined ? null : round(connected + workFor * hang);
        if (mine && hangEnd !== null && hang !== undefined) {
          bar(target, connected, round(hangEnd - connected), hang * BAR_W);
          set(hangEnd, target, 'data-work', 'stalled');
        }

        let limitEnd: number | null = null;
        let limitName: 'connect' | 'attempt' | 'deadline' | null = null;
        if (plan.deadline === 'propagate' && budgetEnd !== null) {
          // Everything this request does shares one clock, so a call is only
          // allowed what is left of it.
          limitEnd = budgetEnd;
          limitName = 'deadline';
        } else if (plan.start >= LIMITS_AT) {
          if (spec.noConnect) {
            limitEnd = round(from + CONNECT_MS * MS);
            limitName = 'connect';
          } else {
            // One attempt is the whole call, unless a connection had to be
            // opened first: then the connect ceiling covered that part.
            limitEnd = round(((spec.connect ?? 0) > 0 ? connected : from) + ATTEMPT_MS * MS);
            limitName = 'attempt';
          }
        }

        if (workEnd !== null && (limitEnd === null || workEnd <= limitEnd)) {
          if (mine) bar(target, connected, workFor, BAR_W);
          schedule(workEnd, () => {
            journey.marks.push([workEnd, 'ok']);
            release(workEnd);
            if (mine) bar(target, workEnd, CLEAR, 0);
            journey.legs.push({ at: workEnd, duration: TO_BOX, y: Y_FORK });
            journey.legs.push({ at: round(workEnd + TO_BOX), duration: FORK, x: X_LANE });
            journey.legs.push({
              at: round(workEnd + TO_BOX + FORK),
              duration: TO_FORK,
              y: Y_SERVICE,
            });
            const back = round(workEnd + LEG_DEP);
            if (last) {
              goHome(back, 'ok');
              return;
            }
            // Half an answer: the marker goes away, and a request on a shared
            // deadline carries what is left of it down to the next call.
            journey.clears.push(back);
            if (budgetEnd !== null && plan.deadline === 'propagate') {
              const left = Math.round((budgetEnd - back) / MS);
              journey.labels.push([`${left} ms`, back, round(back + LEG_DEP)]);
              cue(back, 'state');
            }
            call(step + 1, back);
          });
          return;
        }

        // Nothing ends this call: step 1 has no ceilings, so the reset does.
        if (limitEnd === null) return;

        const fired = limitEnd;
        schedule(fired, () => {
          journey.marks.push([fired, 'fail']);
          journey.labels.push(['timeout', fired, round(fired + LEG_DEP + LEG_CLIENT)]);
          cue(fired, 'trip');
          if (limitName === 'connect' || limitName === 'attempt') {
            set(fired, 'stage', 'data-limit', limitName);
            set(round(fired + LIT), 'stage', 'data-limit', 'none');
          }
          if (limitName === 'deadline') set(fired, 'stage', 'data-deadline', 'spent');

          journey.legs.push({ at: fired, duration: TO_BOX, y: Y_FORK });
          journey.legs.push({ at: round(fired + TO_BOX), duration: FORK, x: X_LANE });
          journey.legs.push({ at: round(fired + TO_BOX + FORK), duration: TO_FORK, y: Y_SERVICE });
          goHome(round(fired + LEG_DEP), 'fail');

          if (!mine) return;
          const ending = spec.ending ?? 'clear';
          if (ending === 'clear') {
            if (hangEnd === null && !spec.noConnect) {
              bar(target, connected, round(fired - connected), ((fired - connected) / workFor) * BAR_W);
            }
            release(fired);
            if (!spec.noConnect) bar(target, fired, CLEAR, 0);
            return;
          }
          if (ending === 'cancel') {
            // The cut is only real once the token has got there.
            const cut = round(fired + CANCEL_LAG);
            boxBusy[target] = false;
            bar(target, connected, round(cut - connected), ((cut - connected) / workFor) * BAR_W);
            set(cut, target, 'data-work', 'cancelled');
            cue(cut, 'state');
            bar(target, round(cut + CANCEL_HOLD), CLEAR, 0);
            set(round(cut + LIT + 0.2), target, 'data-work', 'idle');
            return;
          }
          // Nobody is waiting any more, but the dependency does not know that.
          const finish = round(connected + workFor);
          set(fired, target, 'data-work', 'ghost');
          bar(target, connected, workFor, BAR_W);
          schedule(finish, () => {
            boxBusy[target] = false;
            set(finish, target, 'data-work', 'idle');
            bar(target, finish, CLEAR, 0);
            ghost = { from: finish, to: round(finish + LEG_DEP) };
            cue(round(finish + LEG_DEP), 'failure');
          });
        });
      };

      call(0, arrive);
    });
  };

  REQUESTS.forEach((plan, index) => schedule(plan.start, () => depart(index)));

  // The two scenario events. Everything step 1 left behind goes away, and then
  // the ceilings step 2 is about are configured.
  schedule(RESET_AT, () => {
    for (const index of outstanding) {
      const journey = journeys[index];
      if (!journey) continue;
      journey.abandoned = true;
      journey.endAt = RESET_AT;
    }
    outstanding.clear();
    waitFrom = null;
    gaveUp = false;
    for (let slot = 0; slot < THREAD_COUNT; slot += 1) {
      threads[slot] = null;
      set(RESET_AT, `thread-${slot}`, 'data-slot-state', 'free');
    }
    for (const target of ['db', 'http'] as Target[]) {
      boxBusy[target] = false;
      set(RESET_AT, target, 'data-work', 'idle');
      bar(target, RESET_AT, 0, 0);
    }
    set(RESET_AT, 'stage', 'data-wait', 'idle');
    width('meter', RESET_AT, 0, 0, 0);
  });
  schedule(LIMITS_AT, () => {
    set(LIMITS_AT, 'stage', 'data-limits', 'on');
    cue(LIMITS_AT, 'state');
  });

  drain();

  // Same instant, same element: keep the change that ends up applying, then
  // drop anything that writes a value the stage already holds.
  attrs.sort((left, right) => left.at - right.at);
  const applied = new Map<string, string>();
  const folded: AttrChange[] = [];
  for (let i = 0; i < attrs.length; i += 1) {
    const change = attrs[i];
    if (!change) continue;
    const id = `${change.key}@${change.name}`;
    const next = attrs[i + 1];
    if (next && next.at === change.at && `${next.key}@${next.name}` === id) continue;
    const held = applied.get(id) ?? STAGE_STATE[id];
    if (held === change.value) continue;
    applied.set(id, change.value);
    folded.push(change);
  }

  cues.sort((left, right) => left[0] - right[0]);
  const heard: [number, SceneCue][] = [];
  for (const entry of cues) {
    const previous = heard[heard.length - 1];
    if (previous && previous[0] === entry[0] && previous[1] === entry[1]) continue;
    heard.push(entry);
  }

  return { attrs: folded, widths, journeys, ghost, cues: heard };
}

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const requestLayer = q<SVGGElement>(stage, '.scene-requests', ID);
  const threadEls = qa<SVGRectElement>(stage, '.rq-thread');
  const targets: Record<string, Element> = {
    stage,
    db: q<SVGGElement>(stage, '.rq-dep--db', ID),
    http: q<SVGGElement>(stage, '.rq-dep--http', ID),
  };
  threadEls.forEach((element, index) => {
    targets[`thread-${index}`] = element;
  });
  const fills: Record<string, Element> = {
    meter: q<SVGRectElement>(stage, '.rq-meter-fill', ID),
    gauge: q<SVGRectElement>(stage, '.rq-gauge-fill', ID),
    'bar-db': q<SVGRectElement>(stage, '.rq-bar--db-fill', ID),
    'bar-http': q<SVGRectElement>(stage, '.rq-bar--http-fill', ID),
  };

  const sim = simulate();
  const requests = mountRequests(requestLayer, REQUESTS.length + 1, ID);
  const tl = createSceneTimeline();

  // --- discrete state -----------------------------------------------------

  for (const change of sim.attrs) {
    const target = targets[change.key];
    if (target) attr(tl, target, change.name, change.value, change.at);
  }

  // --- everything that has a width ----------------------------------------

  for (const span of sim.widths) {
    const fill = fills[span.key];
    if (!fill) continue;
    if (span.duration <= 0) {
      tl.set(fill, { attr: { width: span.to }, immediateRender: false }, span.at);
      continue;
    }
    tl.fromTo(
      fill,
      { attr: { width: span.from } },
      { attr: { width: span.to }, duration: span.duration, ease: 'none', immediateRender: false },
      span.at,
    );
  }

  // --- requests -----------------------------------------------------------

  sim.journeys.forEach((journey, index) => {
    const parts = requests[index];
    if (!parts) return;
    parkRequest(parts, X_LANE, Y_CLIENT);
    showRequest(tl, parts, journey.start);

    for (const leg of journey.legs) {
      const to: Record<string, number> = {};
      if (leg.y !== undefined) to.y = leg.y;
      if (leg.x !== undefined) to.x = leg.x;
      tl.to(parts.group, { ...to, duration: leg.duration, ease: 'none' }, leg.at);
    }

    for (const [at, result] of journey.marks) markRequest(tl, parts, result, at);
    for (const at of journey.clears) {
      tl.set(parts.ok, { opacity: 0, immediateRender: false }, at);
      tl.set(parts.dot, { opacity: 1, immediateRender: false }, at);
    }

    for (const [text, from, to] of journey.labels) {
      const label = attachToRequest(
        parts,
        'text',
        { class: 'rq-carry', x: '0', y: String(LABEL_DY), 'text-anchor': 'middle' },
        text,
      );
      tl.set(label, { opacity: 1, immediateRender: false }, from);
      tl.set(label, { opacity: 0, immediateRender: false }, to);
    }

    hideRequest(
      tl,
      parts,
      journey.endAt,
      journey.abandoned ? 0.12 : fadeAt(journey.endAt, SCENE_DURATION),
    );
  });

  // The answer that turns up after the caller has gone, which is what a timeout
  // without a cancellation actually leaves behind.
  const ghostParts = requests[REQUESTS.length];
  if (sim.ghost && ghostParts) {
    const { from, to } = sim.ghost;
    ghostParts.group.classList.add('rq-ghost');
    parkRequest(ghostParts, X_HTTP, Y_DEP);
    showRequest(tl, ghostParts, from);
    tl.to(ghostParts.group, { y: Y_FORK, duration: TO_BOX, ease: 'none' }, from);
    tl.to(ghostParts.group, { x: X_LANE, duration: FORK, ease: 'none' }, round(from + TO_BOX));
    tl.to(
      ghostParts.group,
      { y: Y_SERVICE, duration: TO_FORK, ease: 'none' },
      round(from + TO_BOX + FORK),
    );
    hideRequest(tl, ghostParts, to, 0.2);
  }

  // --- sound --------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // The stage is complete on the first frame: three free threads, two idle
  // dependencies, an empty waiting meter and no ceilings anywhere, which is
  // exactly what a remote call with no timeout on it looks like.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
