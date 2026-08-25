import gsap from 'gsap';
import {
  COLUMN_OF,
  EDGE_PATHS,
  HISTORY_CELLS,
  MAX_ATTEMPTS,
  PLACES,
  RING_CIRCUMFERENCE,
  REPLAY_W,
  SCENE_DURATION,
  STAGE_STATE,
  TIMER_SECONDS,
  X_EVENT,
  Y_EVENT,
  Y_HANDOFF,
  Y_RAIL,
} from './stage';
import type { StateKey } from './stage';
import { q } from '../shared/dom';
import { hideRequest, markRequest, mountRequests, parkRequest, showRequest } from '../shared/request';
import type { RequestParts } from '../shared/request';
import { collapseAtInstant, createScheduler } from '../shared/simulation';
import { attr, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * State Machine scene: a 24 second, four step timeline.
 *
 * Same two rules as the other scenes: every tween sits at an absolute position,
 * and every discrete change is a zero-duration tween on a `data-*` attribute
 * that GSAP reverts when the playhead moves back past it.
 *
 * Nothing the reader counts is authored. The scene is told six things: the
 * transition table, the four orders and the state each of them starts in, the
 * events that are sent and whether the payment guard holds when one of them is
 * a `pay`, when the process goes down and comes back, when the workflow engine
 * takes over and how long it waits for an approval, and which attempt of the
 * `ship` step fails.
 *
 * Everything else falls out of one pass over the whole 24 seconds. Whether an
 * event moves the machine is decided by looking the current state up in the
 * table, so the `ship` sent to a `Submitted` order is rejected because the
 * table has no row for it rather than because the scene says so. The row in the
 * store is written from whatever state the machine reaches; the timer is armed
 * on the way into `Submitted` and disarmed on the way out, so a `pay` that
 * arrives in time cancels it and a `Submitted` order nobody pays for reaches
 * the end of the arc and books itself a `timeout`. A restart hides the order
 * and puts it back where the stored row says it was. Under the engine, `ship`
 * becomes a step that is attempted until it succeeds, and every attempt, wait
 * and arrival is appended to the history the replay bar later sweeps.
 *
 * Two compressions of time, and they are not the same scale. The twenty four
 * hour timer is drawn as three scene seconds, which is eight real hours to the
 * scene second; the two day wait for an approval is drawn as two scene seconds,
 * which is one day to the scene second. A wait drawn at the timer's scale would
 * be six seconds long and would not fit in the step. Every label keeps the real
 * value.
 */

const ID = 'state-machine';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- how fast anything moves ----------------------------------------------

/** Pixels per second. An event travels faster than the machine turns. */
const EVENT_SPEED = 1500;
const ORDER_SPEED = 900;

/** How long a chip takes to disappear once it has been absorbed. */
const FADE = 0.18;
/** How long an edge, a guard, an action or a rejected node stays lit. */
const FLASH = 0.3;
/** How long after an entry action starts that it is heard. */
const ACTION_CUE = 0.12;
/** How long a restarted process takes to read the row back. */
const RESUME = 0.18;
/** How long the engine takes to sweep its history. */
const REPLAY = 0.56;
/** How long one attempt at a step takes, and how long the engine waits to retry. */
const ATTEMPT = 0.28;
const RETRY_DELAY = 0.2;
/** How long a refused event holds its cross before it goes. */
const REFUSED = 0.22;
/** Nothing is written after this, so the closing hold stays settled. */
const LAST_WRITE = 23.9;

// --- the shape of a chip --------------------------------------------------

const CHIP_H = 44;
const ORDER_W = 130;
/** A wide advance model, so a name is never wider than the chip carrying it. */
const CHAR_W = 11;
const CHIP_PAD = 12;
const CHIP_SLOT = 24;
const CHIP_GAP = 8;

const eventWidth = (label: string): number =>
  round(CHIP_PAD * 2 + CHIP_SLOT + CHIP_GAP + label.length * CHAR_W);

// --- the table ------------------------------------------------------------

type EventName = 'submit' | 'pay' | 'ship' | 'deliver' | 'cancel' | 'timeout' | 'approve';

interface Transition {
  event: EventName;
  to: StateKey;
  /** The edge the diagram draws this transition on. */
  edge: string;
  /** A condition that has to hold, named on the stage. */
  guard?: boolean;
  /** What runs on the way in. */
  action?: 'receipt' | 'refund';
}

/**
 * The specification. Anything not in here cannot happen: an event that finds no
 * row for the state the machine is in is rejected, and that is the whole of the
 * error handling.
 */
const TABLE: Record<StateKey, Transition[]> = {
  draft: [{ event: 'submit', to: 'submitted', edge: 'submit' }],
  submitted: [
    { event: 'pay', to: 'paid', edge: 'pay', guard: true, action: 'receipt' },
    { event: 'cancel', to: 'cancelled', edge: 'cancel-submitted' },
    { event: 'timeout', to: 'expired', edge: 'timeout' },
  ],
  paid: [
    { event: 'ship', to: 'shipped', edge: 'ship' },
    { event: 'cancel', to: 'cancelled', edge: 'cancel-paid', action: 'refund' },
  ],
  shipped: [{ event: 'deliver', to: 'delivered', edge: 'deliver' }],
  delivered: [],
  cancelled: [],
  expired: [],
};

// --- what the scene is told -----------------------------------------------

interface OrderPlan {
  id: string;
  /** When the order appears, and the state the store already has it in. */
  at: number;
  state: StateKey;
  /** When its story is over and it leaves the stage. */
  retire: number;
}

/** The four orders. Each one is gone before the next one arrives. */
const ORDERS: OrderPlan[] = [
  { id: '12', at: 0.3, state: 'draft', retire: 5.7 },
  { id: '13', at: 6.25, state: 'submitted', retire: 11.3 },
  { id: '14', at: 12.25, state: 'submitted', retire: 16.0 },
  { id: '15', at: 16.3, state: 'draft', retire: 23.64 },
];

interface EventPlan {
  at: number;
  name: EventName;
  /** Whether the payment has been confirmed, when the event is a `pay`. */
  guard?: boolean;
}

/** Every event the scene sends. The `timeout` is not here: the timer books it. */
const EVENTS: EventPlan[] = [
  { at: 0.5, name: 'submit' },
  { at: 2.1, name: 'ship' },
  { at: 2.9, name: 'pay', guard: true },
  { at: 3.9, name: 'ship' },
  { at: 4.8, name: 'deliver' },
  { at: 6.6, name: 'pay', guard: false },
  { at: 7.6, name: 'pay', guard: true },
  { at: 10.0, name: 'cancel' },
  { at: 16.5, name: 'submit' },
  { at: 17.2, name: 'pay', guard: true },
  { at: 20.3, name: 'approve' },
  { at: 22.82, name: 'deliver' },
];

/** When the process goes down and comes back. The second one is the engine's. */
const RESTARTS = [
  { down: 12.85, up: 13.45, replay: false },
  { down: 21.98, up: 22.22, replay: true },
];

/** When the engine takes over, and when it parks the order on an approval. */
const ENGINE_AT = 18.15;
const HOLD_AT = 18.3;
/** Which attempt of the `ship` step fails. */
const SHIP_FAILS = [1];

// --- what the simulation produces -----------------------------------------

interface Point {
  x: number;
  y: number;
}

interface Leg {
  at: number;
  x: number;
  y: number;
  duration: number;
}

interface Traveller {
  kind: 'order' | 'event';
  label: string;
  start: Point;
  legs: Leg[];
  /** Every instant it becomes visible, and every fade that takes it away. */
  shows: number[];
  hides: number[];
  mark: [number, 'ok' | 'fail'] | null;
}

interface AttrChange {
  at: number;
  target: string;
  name: string;
  value: string;
}

/** One run of the timer arc: how far it gets, and when it is wound back. */
interface RingRun {
  from: number;
  duration: number;
  fired: boolean;
  resetAt: number | null;
}

interface Simulation {
  travellers: Traveller[];
  attrs: AttrChange[];
  rings: RingRun[];
  replays: { from: number; to: number }[];
  cues: [number, SceneCue][];
}

// --- routes ---------------------------------------------------------------

/**
 * Turns a list of corners into legs. Repeated corners are dropped and two legs
 * on the same line are merged, so a journey never contains a leg of no length
 * and two legs that meet do so at one point.
 */
function legsOf(points: Point[], speed: number, start: number): Leg[] {
  const corners: Point[] = [];
  for (const point of points) {
    const last = corners[corners.length - 1];
    if (last && last.x === point.x && last.y === point.y) continue;
    const previous = corners[corners.length - 2];
    if (last && previous) {
      const straight =
        (previous.x === last.x && last.x === point.x) ||
        (previous.y === last.y && last.y === point.y);
      if (straight) corners.pop();
    }
    corners.push(point);
  }

  const legs: Leg[] = [];
  let at = start;
  for (let i = 1; i < corners.length; i += 1) {
    const from = corners[i - 1];
    const to = corners[i];
    if (!from || !to) continue;
    const distance = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
    const duration = round(distance / speed);
    legs.push({ at: round(at), x: to.x, y: to.y, duration });
    at = round(at + duration);
  }
  return legs;
}

const endOf = (legs: Leg[], fallback: number): number => {
  const last = legs[legs.length - 1];
  return last ? round(last.at + last.duration) : fallback;
};

/** An event leaves the one outlet, runs the rail, and drops onto a column. */
const eventRoute = (column: number): Point[] => [
  { x: X_EVENT, y: Y_EVENT },
  { x: X_EVENT, y: Y_RAIL },
  { x: column, y: Y_RAIL },
  { x: column, y: Y_HANDOFF },
];

/**
 * A transition runs from the berth it is in to the berth it is going to,
 * turning only where the edge itself turns. The edge's own ends are box edges,
 * so they are dropped: the berths are inside the boxes those edges touch.
 */
const transitionRoute = (edge: string, from: StateKey, to: StateKey): Point[] => {
  const path = EDGE_PATHS[edge] ?? [];
  const bends = path.slice(1, -1).map(([x, y]) => ({ x, y }));
  const source = PLACES[from];
  const target = PLACES[to];
  return [{ x: source.x, y: source.berth }, ...bends, { x: target.x, y: target.berth }];
};

// --- the simulation -------------------------------------------------------

function simulate(): Simulation {
  const travellers: Traveller[] = [];
  const raw: AttrChange[] = [];
  const cues: [number, SceneCue][] = [];
  const rings: RingRun[] = [];
  const replays: { from: number; to: number }[] = [];

  const setAttr = (at: number, target: string, name: string, value: string): void => {
    raw.push({ at: Math.min(round(at), LAST_WRITE), target, name, value });
  };
  const cue = (at: number, name: SceneCue): void => {
    const when = round(at);
    if (cues.some(([time]) => time === when)) return;
    cues.push([when, name]);
  };

  const { schedule, drain } = createScheduler();

  let state: StateKey = 'draft';
  let chip: Traveller | null = null;
  let engineOn = false;
  let holding = false;
  let history = 0;
  let ring: RingRun | null = null;
  let token = 0;

  // --- the timer ----------------------------------------------------------

  const disarmTimer = (at: number): void => {
    if (!ring) return;
    if (!ring.fired) ring.duration = round(Math.max(0, at - ring.from));
    ring.resetAt = round(at);
    ring = null;
    token += 1;
    setAttr(at, 'stage', 'data-timer', 'off');
    setAttr(at, 'stage', 'data-due', 'none');
  };

  const armTimer = (at: number): void => {
    token += 1;
    const mine = token;
    const run: RingRun = { from: round(at), duration: TIMER_SECONDS, fired: false, resetAt: null };
    ring = run;
    rings.push(run);
    setAttr(at, 'stage', 'data-timer', 'run');
    setAttr(at, 'stage', 'data-due', 'armed');

    const fireAt = round(at + TIMER_SECONDS);
    schedule(fireAt, () => {
      if (token !== mine || ring !== run) return;
      run.fired = true;
      setAttr(fireAt, 'stage', 'data-timer', 'fired');
      setAttr(fireAt, 'stage', 'data-due', 'fired');
      cue(fireAt, 'trip');
      send({ at: fireAt, name: 'timeout' });
    });
  };

  // --- the history the engine keeps ---------------------------------------

  const record = (at: number, kind: 'wait' | 'ok' | 'fail'): void => {
    if (!engineOn || history >= HISTORY_CELLS) return;
    history += 1;
    setAttr(at, `hist-${history}`, 'data-cell', kind);
    cue(at, kind === 'fail' ? 'failure' : 'state');
  };

  // --- one transition -----------------------------------------------------

  const arrive = (transition: Transition, at: number): void => {
    const from = state;
    state = transition.to;
    setAttr(at, 'stage', 'data-state', transition.to);
    setAttr(at, 'stage', 'data-store', transition.to);
    cue(at, transition.to === 'delivered' ? 'success' : 'state');

    if (from === 'submitted') disarmTimer(at);
    if (transition.to === 'submitted') armTimer(at);

    setAttr(at + FLASH, `edge-${transition.edge}`, 'data-edge-state', 'none');
    if (transition.guard) setAttr(at + FLASH, 'stage', 'data-guard', 'off');
    if (transition.action) {
      setAttr(at, 'stage', 'data-action', transition.action);
      cue(at + ACTION_CUE, 'state');
      setAttr(at + FLASH, 'stage', 'data-action', 'off');
    }
    if (engineOn) {
      record(at, 'ok');
      setAttr(at, 'stage', 'data-step', 'running');
    }
  };

  const move = (transition: Transition, at: number): void => {
    if (!chip) return;
    const legs = legsOf(transitionRoute(transition.edge, state, transition.to), ORDER_SPEED, at);
    chip.legs = [...chip.legs, ...legs];
    setAttr(at, `edge-${transition.edge}`, 'data-edge-state', 'run');
    if (transition.guard) setAttr(at, 'stage', 'data-guard', 'pass');
    const landed = endOf(legs, at);
    schedule(landed, () => arrive(transition, landed));
  };

  /**
   * A step the engine runs. It is attempted until it succeeds, and each attempt
   * that does not is written into the history before the next one starts.
   */
  const runStep = (transition: Transition, at: number, attempt: number): void => {
    setAttr(at, 'stage', 'data-step', transition.event);
    const done = round(at + ATTEMPT);
    schedule(done, () => {
      if (SHIP_FAILS.includes(attempt) && attempt < MAX_ATTEMPTS) {
        setAttr(done, `edge-${transition.edge}`, 'data-edge-state', 'fail');
        setAttr(done + FLASH, `edge-${transition.edge}`, 'data-edge-state', 'none');
        setAttr(done, 'stage', 'data-retry', String(attempt));
        cue(done, 'failure');
        record(done, 'fail');
        const next = round(done + RETRY_DELAY);
        schedule(next, () => runStep(transition, next, attempt + 1));
        return;
      }
      setAttr(done, 'stage', 'data-retry', '0');
      move(transition, done);
    });
  };

  // --- one event ----------------------------------------------------------

  const deliver = (plan: EventPlan, carrier: Traveller, at: number): void => {
    /** A chip absorbed by the machine goes at once; a refused one is held. */
    const settle = (extra: number): void => {
      carrier.hides.push(round(at + extra));
    };
    if (!chip) {
      settle(0);
      return;
    }

    if (holding && plan.name === 'approve') {
      settle(0);
      holding = false;
      setAttr(at, 'stage', 'data-hold', 'off');
      record(at, 'ok');
      const ship = TABLE.paid.find((entry) => entry.event === 'ship');
      if (ship) runStep(ship, at, 1);
      return;
    }

    const transition = TABLE[state].find((entry) => entry.event === plan.name);
    if (!transition) {
      settle(REFUSED);
      carrier.mark = [at, 'fail'];
      setAttr(at, 'stage', 'data-reject', state);
      setAttr(at + FLASH, 'stage', 'data-reject', 'none');
      cue(at, 'failure');
      return;
    }
    if (transition.guard && plan.guard === false) {
      settle(REFUSED);
      carrier.mark = [at, 'fail'];
      setAttr(at, `edge-${transition.edge}`, 'data-edge-state', 'deny');
      setAttr(at + FLASH, `edge-${transition.edge}`, 'data-edge-state', 'none');
      setAttr(at, 'stage', 'data-guard', 'fail');
      setAttr(at + FLASH, 'stage', 'data-guard', 'off');
      cue(at, 'failure');
      return;
    }
    settle(0);
    if (engineOn && transition.event === 'ship') {
      runStep(transition, at, 1);
      return;
    }
    move(transition, at);
  };

  const send = (plan: EventPlan): void => {
    if (!chip) return;
    const column = COLUMN_OF[state];
    const legs = legsOf(eventRoute(column), EVENT_SPEED, plan.at);
    const carrier: Traveller = {
      kind: 'event',
      label: plan.name,
      start: { x: X_EVENT, y: Y_EVENT },
      legs,
      shows: [round(plan.at)],
      hides: [],
      mark: null,
    };
    travellers.push(carrier);
    const landed = endOf(legs, plan.at);
    schedule(landed, () => deliver(plan, carrier, landed));
  };

  // --- the moments the scene is told about --------------------------------

  for (const plan of ORDERS) {
    schedule(plan.at, () => {
      state = plan.state;
      const arriving: Traveller = {
        kind: 'order',
        label: `order #${plan.id}`,
        start: { x: PLACES[plan.state].x, y: PLACES[plan.state].berth },
        legs: [],
        shows: [round(plan.at)],
        hides: [],
        mark: null,
      };
      chip = arriving;
      travellers.push(arriving);
      setAttr(plan.at, 'stage', 'data-state', plan.state);
      setAttr(plan.at, 'stage', 'data-order', plan.id);
      setAttr(plan.at, 'stage', 'data-store', plan.state);
      setAttr(plan.at, 'stage', 'data-step', 'running');
      cue(plan.at, 'state');
      if (plan.state === 'submitted') armTimer(plan.at);
    });

    schedule(plan.retire, () => {
      if (chip) chip.hides.push(round(plan.retire));
      chip = null;
      disarmTimer(plan.retire);
      setAttr(plan.retire, 'stage', 'data-step', 'idle');
    });
  }

  for (const plan of EVENTS) schedule(plan.at, () => send(plan));

  for (const restart of RESTARTS) {
    schedule(restart.down, () => {
      setAttr(restart.down, 'stage', 'data-proc', 'down');
      setAttr(restart.down, 'stage', 'data-step', 'restart');
      cue(restart.down, 'trip');
      if (chip) chip.hides.push(round(restart.down));
    });
    schedule(restart.up, () => {
      setAttr(restart.up, 'stage', 'data-proc', 'up');
      cue(restart.up, 'trip');
      const span = restart.replay ? REPLAY : RESUME;
      if (restart.replay) {
        setAttr(restart.up, 'stage', 'data-replay', 'on');
        setAttr(restart.up, 'stage', 'data-step', 'replay');
        replays.push({ from: round(restart.up), to: round(restart.up + span) });
      } else {
        setAttr(restart.up, 'stage', 'data-resume', 'on');
      }
      const back = round(restart.up + span);
      schedule(back, () => {
        setAttr(back, 'stage', restart.replay ? 'data-replay' : 'data-resume', 'off');
        setAttr(back, 'stage', 'data-step', 'running');
        if (chip) chip.shows.push(back);
        cue(back, 'state');
      });
    });
  }

  schedule(ENGINE_AT, () => {
    engineOn = true;
    setAttr(ENGINE_AT, 'stage', 'data-engine', 'on');
    cue(ENGINE_AT, 'trip');
  });

  schedule(HOLD_AT, () => {
    holding = true;
    setAttr(HOLD_AT, 'stage', 'data-hold', 'on');
    setAttr(HOLD_AT, 'stage', 'data-step', 'wait-for-approval');
    record(HOLD_AT, 'wait');
  });

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

  return { travellers, attrs, rings, replays, cues };
}

// --- the timeline ---------------------------------------------------------

const NS = 'http://www.w3.org/2000/svg';

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

/** Dresses a request group as the chip a traveller is drawn as. */
function buildChip(parts: RequestParts, traveller: Traveller): void {
  const order = traveller.kind === 'order';
  const width = order ? ORDER_W : eventWidth(traveller.label);
  const half = round(width / 2);
  const group = parts.group;

  group.setAttribute('class', `scene-req sm-chip sm-chip--${traveller.kind}`);

  addPart(group, 'rect', {
    class: 'sm-chip-bg',
    x: -half,
    y: -CHIP_H / 2,
    width,
    height: CHIP_H,
    rx: order ? 12 : CHIP_H / 2,
  });

  const textX = order ? 0 : round(-(CHIP_PAD + CHIP_SLOT + CHIP_GAP) / 2);
  addPart(
    group,
    'text',
    {
      class: `sm-chip-text sm-chip-text--${traveller.kind}`,
      x: textX,
      y: 7,
      'text-anchor': 'middle',
    },
    traveller.label,
  );

  if (!order) {
    const mx = round(half - CHIP_PAD - CHIP_SLOT / 2);
    gsap.set([parts.ok, parts.fail], { x: mx, y: 0 });
  }
}

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);
  const ringProgress = q<SVGCircleElement>(stage, '.sm-timer-progress', ID);
  const replayBar = q<SVGRectElement>(stage, '.sm-replay-bar', ID);

  const targets: Record<string, Element> = { stage };
  for (const key of Object.keys(EDGE_PATHS)) {
    targets[`edge-${key}`] = q<SVGGElement>(stage, `.sm-edge--${key}`, ID);
  }
  for (let index = 1; index <= HISTORY_CELLS; index += 1) {
    targets[`hist-${index}`] = q<SVGGElement>(stage, `.sm-cell--${index}`, ID);
  }

  const sim = simulate();
  const parts = mountRequests(layer, sim.travellers.length, ID);

  const tl = createSceneTimeline();

  // --- discrete state -----------------------------------------------------

  for (const change of sim.attrs) {
    const element = targets[change.target];
    if (!element) continue;
    attr(tl, element, change.name, change.value, change.at);
  }

  // --- the timer arc ------------------------------------------------------

  for (const run of sim.rings) {
    if (run.duration <= 0) continue;
    const reached = round(RING_CIRCUMFERENCE * (1 - run.duration / TIMER_SECONDS));
    tl.fromTo(
      ringProgress,
      { attr: { 'stroke-dashoffset': RING_CIRCUMFERENCE } },
      {
        attr: { 'stroke-dashoffset': reached },
        duration: run.duration,
        ease: 'none',
        immediateRender: false,
      },
      run.from,
    );
    if (run.resetAt !== null) {
      tl.set(
        ringProgress,
        { attr: { 'stroke-dashoffset': RING_CIRCUMFERENCE }, immediateRender: false },
        run.resetAt,
      );
    }
  }

  // --- the bar that sweeps the history ------------------------------------

  for (const sweep of sim.replays) {
    tl.fromTo(
      replayBar,
      { attr: { width: 0 } },
      {
        attr: { width: REPLAY_W },
        duration: round(sweep.to - sweep.from),
        ease: 'none',
        immediateRender: false,
      },
      sweep.from,
    );
    tl.set(replayBar, { attr: { width: 0 }, immediateRender: false }, sweep.to);
  }

  // --- what travels -------------------------------------------------------

  sim.travellers.forEach((traveller, index) => {
    const request = parts[index];
    if (!request) return;

    buildChip(request, traveller);
    parkRequest(request, traveller.start.x, traveller.start.y);
    gsap.set(request.dot, { opacity: 0 });

    for (const at of traveller.shows) showRequest(tl, request, at);
    for (const leg of traveller.legs) {
      tl.to(
        request.group,
        { x: leg.x, y: leg.y, duration: leg.duration, ease: 'none', immediateRender: false },
        leg.at,
      );
    }
    if (traveller.mark) markRequest(tl, request, traveller.mark[1], traveller.mark[0]);
    for (const at of traveller.hides) hideRequest(tl, request, at, FADE);
  });

  // --- sound --------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels --------------------------------------------------------

  // The stage is complete on the first frame: seven states, every edge between
  // them, the alphabet the machine accepts, an empty store row and an idle
  // process, with nothing travelling anywhere.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
