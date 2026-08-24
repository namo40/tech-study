import gsap from 'gsap';
import {
  BAR_W,
  MAX_ATTEMPTS,
  NODE_BOTTOM,
  SCENE_DURATION,
  SERVICES,
  SERVICE_X,
  STAGE_STATE,
  X_TRUNK,
  Y_ARRIVE,
  Y_CLIENT,
  Y_HANDOFF,
  Y_RAIL,
  Y_SAGA,
} from './stage';
import type { ServiceKey } from './stage';
import { q, qa } from '../shared/dom';
import { hideRequest, markRequest, mountRequests, parkRequest, showRequest } from '../shared/request';
import type { RequestParts } from '../shared/request';
import { collapseAtInstant, createScheduler } from '../shared/simulation';
import { attr, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Saga scene: a 24 second, four step timeline.
 *
 * Same two rules as the other scenes: every tween sits at an absolute position,
 * and every discrete change is a zero-duration tween on a `data-*` attribute
 * that GSAP reverts when the playhead moves back past it.
 *
 * Nothing the reader counts is authored. The scene is told six things: the
 * sequence of steps a saga is made of and how each of them is undone, when each
 * order leaves the Client and whether it is run by subscriptions or by a
 * coordinator, which step fails on which attempt and whether that failure is
 * permanent or passing, when the coordination band changes hands and when the
 * pivot is marked, when the board is cleared for the next thing to show, and
 * how fast a request, an event and a command travel.
 *
 * Everything else falls out of one pass over the whole 24 seconds. A local
 * transaction takes as long as it takes; the row a service writes appears when
 * that transaction commits and stays until something undoes it; the next
 * message leaves at the instant the previous one is acknowledged, so the whole
 * chain of five orders is a single continuous chain of bookings rather than a
 * list of times. What a failure costs is a consequence of where it lands: an
 * order that fails with two steps behind it pays for two compensations in
 * reverse, and the same failure past the pivot, once the pivot is marked, pays
 * for retries forward instead until the step succeeds. The saga state, the
 * retry count and every sound cue are read off that one pass.
 */

const ID = 'saga';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- how far and how fast -------------------------------------------------

/**
 * Three speeds, in pixels per second, and they are not the same on purpose. A
 * request is answered on the connection it arrived on, an event is broadcast
 * and picked up by whoever subscribed, and a command is addressed to one
 * service and answered directly: the bus is the slow one of the three.
 */
const REQ_SPEED = 2600;
const EVENT_SPEED = 800;
const COMMAND_SPEED = 2600;

/** How long a local transaction takes, and how long its commit takes to show. */
const LOCAL_TX = 0.28;
const COMMIT_GAP = 0.12;
/** How long a result stays on a service, and how long its bar takes to clear. */
const MARK_HOLD = 0.5;
const BAR_DRAIN = 0.15;
/**
 * How long a coordinator holds an answer before it acts on it, and how long it
 * waits before trying a failed step again. The first is also what keeps two
 * chips apart at the edge of the Saga box: an answer has finished dissolving
 * into the coordinator by the time the next command leaves it.
 */
const COORD_GAP = 0.1;
const RETRY_DELAY = 0.25;
/** How long a request takes to disappear, and how long a message chip does. */
const FADE = 0.18;
const CHIP_FADE = 0.1;

// --- the shape of a chip --------------------------------------------------

const CHIP_H = 52;
/** A wide advance model, so a chip is never narrower than the name inside it. */
const CHAR_W = 11.2;
const CHIP_PAD = 12;
const CHIP_SLOT = 26;
const CHIP_GAP = 8;

const chipWidth = (label: string): number =>
  round(CHIP_PAD * 2 + CHIP_SLOT + CHIP_GAP + label.length * CHAR_W);

// --- what a saga is made of -----------------------------------------------

type StepKey = 'create' | 'charge' | 'reserve' | 'confirm';

interface Compensation {
  /** The row the service is left holding once the step is undone. */
  record: string;
  /** What it publishes afterwards, when nobody is coordinating. */
  event?: string;
  /** What a coordinator sends to ask for it. */
  command: string;
}

interface SagaStep {
  key: StepKey;
  service: ServiceKey;
  /** The row the service writes when the step commits. */
  record: string;
  /** The state the saga has reached once the step is done. */
  state: string;
  /** What the service publishes when the step commits. */
  event?: string;
  /** What it publishes when the step fails. */
  failureEvent?: string;
  /** What a coordinator sends to ask for the step. */
  command: string;
  compensation?: Compensation;
}

const CREATE: SagaStep = {
  key: 'create',
  service: 'order',
  record: 'open',
  state: 'submitted',
  event: 'OrderPlaced',
  command: 'Create',
  compensation: { record: 'cancelled', command: 'Cancel' },
};

const CHARGE: SagaStep = {
  key: 'charge',
  service: 'payment',
  record: 'charged',
  state: 'paid',
  event: 'PaymentCompleted',
  command: 'Charge',
  compensation: { record: 'refunded', event: 'PaymentRefunded', command: 'Refund' },
};

const RESERVE: SagaStep = {
  key: 'reserve',
  service: 'inventory',
  record: 'reserved',
  state: 'reserved',
  event: 'StockReserved',
  failureEvent: 'ReservationFailed',
  command: 'Reserve',
  compensation: { record: 'released', command: 'Release' },
};

const CONFIRM: SagaStep = {
  key: 'confirm',
  service: 'order',
  record: 'confirmed',
  state: 'confirmed',
  command: 'Confirm',
};

/**
 * The two ways the same saga runs. Without a coordinator the Client's own call
 * is the first step, so Order opens the row itself; with one, the coordinator
 * holds the order until the last step confirms it.
 */
const CHOREOGRAPHY: SagaStep[] = [CREATE, CHARGE, RESERVE, CONFIRM];
const ORCHESTRATION: SagaStep[] = [CHARGE, RESERVE, CONFIRM];

// --- what the scene is told -----------------------------------------------

type Mode = 'choreography' | 'orchestration';

interface Injection {
  step: StepKey;
  attempt: number;
  /** A permanent failure is compensated; a passing one can be tried again. */
  kind: 'permanent' | 'passing';
}

interface OrderPlan {
  /** When the order leaves the Client. */
  send: number;
  mode: Mode;
  failures: Injection[];
}

/** The five orders the scene runs, and the only failures in it. */
const ORDERS: OrderPlan[] = [
  { send: 0.4, mode: 'choreography', failures: [] },
  {
    send: 6.25,
    mode: 'choreography',
    failures: [{ step: 'reserve', attempt: 1, kind: 'permanent' }],
  },
  {
    send: 12.3,
    mode: 'orchestration',
    failures: [{ step: 'reserve', attempt: 1, kind: 'permanent' }],
  },
  { send: 15.05, mode: 'orchestration', failures: [] },
  {
    send: 18.1,
    mode: 'orchestration',
    failures: [
      { step: 'reserve', attempt: 1, kind: 'passing' },
      { step: 'reserve', attempt: 2, kind: 'passing' },
    ],
  },
];

/** When the coordination band changes hands, and when the pivot is marked. */
const MODE_AT = 12;
const PIVOT_AT = 18;
/** When the board is cleared for the next thing the scene shows. */
const RESETS = [6, 12, 18];

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

type Kind = 'request' | 'event' | 'command';

interface Traveller {
  kind: Kind;
  label: string;
  start: Point;
  showAt: number;
  legs: Leg[];
  fadeAt: number;
  /** Discrete state written on the traveller itself. */
  states: [number, string][];
  /** The result marker a request ends on. */
  mark: [number, 'ok' | 'fail'] | null;
}

interface AttrChange {
  at: number;
  target: string;
  name: string;
  value: string;
}

interface Segment {
  from: number;
  to: number;
  vFrom: number;
  vTo: number;
}

interface Simulation {
  travellers: Traveller[];
  attrs: AttrChange[];
  bars: Record<ServiceKey, Segment[]>;
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

const clientToService = (service: ServiceKey): Point[] => [
  { x: X_TRUNK, y: Y_CLIENT },
  { x: X_TRUNK, y: Y_RAIL },
  { x: SERVICE_X[service], y: Y_RAIL },
  { x: SERVICE_X[service], y: Y_ARRIVE },
];

const clientToSaga: Point[] = [
  { x: X_TRUNK, y: Y_CLIENT },
  { x: X_TRUNK, y: Y_SAGA },
];

const eventRoute = (from: ServiceKey, to: ServiceKey): Point[] => [
  { x: SERVICE_X[from], y: Y_HANDOFF },
  { x: SERVICE_X[from], y: Y_RAIL },
  { x: SERVICE_X[to], y: Y_RAIL },
  { x: SERVICE_X[to], y: Y_HANDOFF },
];

const commandRoute = (to: ServiceKey): Point[] => [
  { x: X_TRUNK, y: NODE_BOTTOM },
  { x: X_TRUNK, y: Y_RAIL },
  { x: SERVICE_X[to], y: Y_RAIL },
  { x: SERVICE_X[to], y: Y_HANDOFF },
];

const reverse = (points: Point[]): Point[] => points.slice().reverse();

// --- the simulation -------------------------------------------------------

function simulate(): Simulation {
  const travellers: Traveller[] = [];
  const raw: AttrChange[] = [];
  const cues: [number, SceneCue][] = [];
  const bars: Record<ServiceKey, Segment[]> = { order: [], payment: [], inventory: [] };

  const setAttr = (at: number, target: string, name: string, value: string): void => {
    raw.push({ at: round(at), target, name, value });
  };
  const cue = (at: number, name: SceneCue): void => {
    cues.push([round(at), name]);
  };

  const { schedule, drain } = createScheduler();

  // --- the moments the scene is told about --------------------------------

  for (const at of RESETS) {
    schedule(at, () => {
      for (const key of SERVICES) setAttr(at, `rec-${key}`, 'data-rec', 'none');
      setAttr(at, 'stage', 'data-state', 'none');
    });
  }

  schedule(MODE_AT, () => {
    setAttr(MODE_AT, 'stage', 'data-mode', 'orchestration');
    cue(MODE_AT, 'trip');
  });

  schedule(PIVOT_AT, () => {
    setAttr(PIVOT_AT, 'stage', 'data-pivot', 'on');
  });

  // --- one local transaction ----------------------------------------------

  /**
   * Runs the bar, writes the row if there is one to write, and leaves the
   * result on the service. Returns the instant the result shows, which is when
   * whatever is waiting on it may move.
   */
  const runLocalTx = (
    service: ServiceKey,
    at: number,
    undoing: boolean,
    record: string | null,
    ok: boolean,
  ): number => {
    const barEnd = round(at + LOCAL_TX);
    const markAt = round(barEnd + COMMIT_GAP);
    const idleAt = round(markAt + MARK_HOLD);

    setAttr(at, `svc-${service}`, 'data-tx', undoing ? 'undo-run' : 'run');
    bars[service].push({ from: round(at), to: barEnd, vFrom: 0, vTo: BAR_W });

    if (ok && record) {
      setAttr(barEnd, `rec-${service}`, 'data-rec', record);
      cue(barEnd, 'state');
    }

    const result = !ok ? 'fail' : undoing ? 'undo' : 'ok';
    setAttr(markAt, `svc-${service}`, 'data-tx', result);
    cue(markAt, result === 'ok' ? 'success' : result === 'fail' ? 'failure' : 'trip');

    setAttr(idleAt, `svc-${service}`, 'data-tx', 'idle');
    bars[service].push({ from: idleAt, to: round(idleAt + BAR_DRAIN), vFrom: BAR_W, vTo: 0 });
    return markAt;
  };

  // --- one message --------------------------------------------------------

  const sendChip = (
    kind: Kind,
    label: string,
    points: Point[],
    at: number,
    result?: string,
  ): Traveller => {
    const speed = kind === 'event' ? EVENT_SPEED : COMMAND_SPEED;
    const legs = legsOf(points, speed, at);
    const start = points[0] ?? { x: X_TRUNK, y: Y_RAIL };
    const traveller: Traveller = {
      kind,
      label,
      start,
      showAt: round(at),
      legs,
      fadeAt: endOf(legs, at),
      states: result ? [[round(at), result]] : [],
      mark: null,
    };
    travellers.push(traveller);
    return traveller;
  };

  // --- one order ----------------------------------------------------------

  const runOrder = (plan: OrderPlan): void => {
    const choreographed = plan.mode === 'choreography';
    const outward = choreographed ? clientToService('order') : clientToSaga;
    const legs = legsOf(outward, REQ_SPEED, plan.send);
    const request: Traveller = {
      kind: 'request',
      label: '',
      start: { x: X_TRUNK, y: Y_CLIENT },
      showAt: plan.send,
      legs,
      fadeAt: endOf(legs, plan.send),
      states: [],
      mark: null,
    };
    travellers.push(request);

    const arriveAt = endOf(legs, plan.send);
    const attempts = new Map<StepKey, number>();
    const done: SagaStep[] = [];

    /** The Client is answered from wherever the order has been waiting. */
    const goHome = (at: number, ok: boolean): void => {
      const home = legsOf(
        choreographed ? reverse(clientToService('order')) : reverse(clientToSaga),
        REQ_SPEED,
        at,
      );
      request.legs = [...request.legs, ...home];
      const back = endOf(home, at);
      request.mark = [back, ok ? 'ok' : 'fail'];
      request.fadeAt = back;
      cue(back, ok ? 'success' : 'failure');
    };

    const failureAt = (step: SagaStep, attempt: number): Injection | undefined =>
      plan.failures.find((entry) => entry.step === step.key && entry.attempt === attempt);

    // --- nobody in charge: each service publishes, the next one reacts -----

    const runEventStep = (index: number, at: number): void => {
      const step = CHOREOGRAPHY[index];
      if (!step) return;
      const failure = failureAt(step, 1);
      const ok = failure === undefined;
      const markAt = runLocalTx(step.service, at, false, step.record, ok);

      if (ok) {
        done.push(step);
        const next = CHOREOGRAPHY[index + 1];
        if (!next || !step.event) {
          goHome(markAt, true);
          return;
        }
        const chip = sendChip('event', step.event, eventRoute(step.service, next.service), markAt);
        const lands = endOf(chip.legs, markAt);
        schedule(lands, () => runEventStep(index + 1, lands));
        return;
      }

      const back = done.slice().reverse();
      const first = back[0];
      if (!first || !step.failureEvent) {
        goHome(markAt, false);
        return;
      }
      const chip = sendChip(
        'event',
        step.failureEvent,
        eventRoute(step.service, first.service),
        markAt,
        'fail',
      );
      const lands = endOf(chip.legs, markAt);
      schedule(lands, () => runEventUndo(0, back, lands));
    };

    const runEventUndo = (index: number, back: SagaStep[], at: number): void => {
      const step = back[index];
      const compensation = step?.compensation;
      if (!step || !compensation) return;
      const markAt = runLocalTx(step.service, at, true, compensation.record, true);

      const next = back[index + 1];
      if (!next || !compensation.event) {
        goHome(markAt, false);
        return;
      }
      const chip = sendChip(
        'event',
        compensation.event,
        eventRoute(step.service, next.service),
        markAt,
        'undo',
      );
      const lands = endOf(chip.legs, markAt);
      schedule(lands, () => runEventUndo(index + 1, back, lands));
    };

    // --- a coordinator: it sends every command and records every answer ----

    const sendCommand = (index: number, at: number, delay = COORD_GAP): void => {
      const step = ORCHESTRATION[index];
      if (!step) return;
      const attempt = (attempts.get(step.key) ?? 0) + 1;
      attempts.set(step.key, attempt);

      const departAt = round(at + delay);
      const chip = sendChip('command', step.command, commandRoute(step.service), departAt);
      const lands = endOf(chip.legs, departAt);

      schedule(lands, () => {
        const failure = failureAt(step, attempt);
        const ok = failure === undefined;
        const markAt = runLocalTx(step.service, lands, false, step.record, ok);
        chip.states.push([markAt, ok ? 'ok' : 'fail']);
        const home = legsOf(reverse(commandRoute(step.service)), COMMAND_SPEED, markAt);
        chip.legs = [...chip.legs, ...home];
        const answered = endOf(home, markAt);
        chip.fadeAt = answered;

        schedule(answered, () => {
          if (ok) {
            done.push(step);
            setAttr(answered, 'stage', 'data-state', step.state);
            cue(answered, step.state === 'confirmed' ? 'success' : 'state');
            if (ORCHESTRATION[index + 1]) sendCommand(index + 1, answered);
            else goHome(answered, true);
            return;
          }
          // Past the pivot a passing failure is worth trying again, because
          // there is no way back; anything else is undone in reverse.
          const pivoted = answered >= PIVOT_AT;
          if (pivoted && failure?.kind === 'passing' && attempt < MAX_ATTEMPTS) {
            setAttr(answered, 'stage', 'data-retry', String(attempt));
            cue(answered, 'trip');
            schedule(answered, () => sendCommand(index, answered, RETRY_DELAY));
            return;
          }
          undoCommands(0, done.slice().reverse(), answered);
        });
      });
    };

    const undoCommands = (index: number, back: SagaStep[], at: number): void => {
      const step = back[index];
      const compensation = step?.compensation;
      if (!step || !compensation) {
        setAttr(at, 'stage', 'data-state', 'cancelled');
        cue(at, 'state');
        goHome(at, false);
        return;
      }

      const departAt = round(at + COORD_GAP);
      const chip = sendChip('command', compensation.command, commandRoute(step.service), departAt);
      const lands = endOf(chip.legs, departAt);

      schedule(lands, () => {
        const markAt = runLocalTx(step.service, lands, true, compensation.record, true);
        chip.states.push([markAt, 'undo']);
        const home = legsOf(reverse(commandRoute(step.service)), COMMAND_SPEED, markAt);
        chip.legs = [...chip.legs, ...home];
        const answered = endOf(home, markAt);
        chip.fadeAt = answered;
        schedule(answered, () => undoCommands(index + 1, back, answered));
      });
    };

    if (choreographed) {
      schedule(arriveAt, () => runEventStep(0, arriveAt));
    } else {
      schedule(arriveAt, () => {
        setAttr(arriveAt, 'stage', 'data-state', 'submitted');
        cue(arriveAt, 'state');
        sendCommand(0, arriveAt);
      });
    }
  };

  for (const plan of ORDERS) runOrder(plan);

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

  return { travellers, attrs, bars, cues };
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

/** The check, cross and back arrow a command chip can come back with. */
function resultMark(group: SVGGElement, kind: 'ok' | 'fail' | 'undo', mx: number): void {
  const marker = addPart(group, 'g', { class: `sg-chip-mark sg-chip-mark--${kind}` }) as SVGGElement;
  addPart(marker, 'circle', { class: 'sg-chip-mark-bg', cx: mx, cy: 0, r: 13 });
  const glyph =
    kind === 'ok'
      ? `M ${mx - 6} 0 L ${mx - 2} 5 L ${mx + 6} -6`
      : kind === 'fail'
        ? `M ${mx - 5} -5 L ${mx + 5} 5 M ${mx + 5} -5 L ${mx - 5} 5`
        : `M ${mx + 6} 0 L ${mx - 6} 0 M ${mx - 1} -5 L ${mx - 6} 0 L ${mx - 1} 5`;
  addPart(marker, 'path', { class: 'sg-chip-mark-glyph', d: glyph });
}

/** Dresses a request group as a message chip carrying a name. */
function buildChip(parts: RequestParts, traveller: Traveller): void {
  const width = chipWidth(traveller.label);
  const half = round(width / 2);
  const event = traveller.kind === 'event';
  const group = parts.group;

  group.setAttribute('class', `scene-req sg-chip sg-chip--${traveller.kind}`);
  group.setAttribute('data-result', 'none');

  addPart(group, 'rect', {
    class: 'sg-chip-bg',
    x: -half,
    y: -CHIP_H / 2,
    width,
    height: CHIP_H,
    rx: event ? CHIP_H / 2 : 10,
  });

  if (event) {
    const dx = round(-half + CHIP_PAD + CHIP_SLOT / 2);
    addPart(group, 'path', {
      class: 'sg-chip-diamond',
      d: `M ${dx} -11 L ${dx + 11} 0 L ${dx} 11 L ${dx - 11} 0 Z`,
    });
  } else {
    const mx = round(half - CHIP_PAD - CHIP_SLOT / 2);
    resultMark(group, 'ok', mx);
    resultMark(group, 'fail', mx);
    resultMark(group, 'undo', mx);
  }

  const textX = event
    ? round((CHIP_PAD + CHIP_SLOT + CHIP_GAP) / 2)
    : round(-(CHIP_PAD + CHIP_SLOT + CHIP_GAP) / 2);
  addPart(
    group,
    'text',
    { class: 'sg-chip-text', x: textX, y: 6, 'text-anchor': 'middle' },
    traveller.label,
  );
}

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);
  const barFills = qa<SVGRectElement>(stage, '.sg-bar-fill');

  const targets: Record<string, Element> = { stage };
  SERVICES.forEach((key) => {
    targets[`svc-${key}`] = q<SVGGElement>(stage, `.sg-svc--${key}`, ID);
    targets[`rec-${key}`] = q<SVGGElement>(stage, `.sg-rec--${key}`, ID);
  });

  const sim = simulate();
  const parts = mountRequests(layer, sim.travellers.length, ID);

  const tl = createSceneTimeline();

  // --- discrete state -----------------------------------------------------

  for (const change of sim.attrs) {
    const element = targets[change.target];
    if (!element) continue;
    attr(tl, element, change.name, change.value, change.at);
  }

  // --- the bar each local transaction fills -------------------------------

  SERVICES.forEach((key, index) => {
    const fill = barFills[index];
    if (!fill) return;
    for (const segment of sim.bars[key]) {
      if (segment.to <= segment.from || segment.vFrom === segment.vTo) continue;
      tl.fromTo(
        fill,
        { attr: { width: segment.vFrom } },
        {
          attr: { width: segment.vTo },
          duration: round(segment.to - segment.from),
          ease: 'none',
          immediateRender: false,
        },
        segment.from,
      );
    }
  });

  // --- what travels -------------------------------------------------------

  sim.travellers.forEach((traveller, index) => {
    const request = parts[index];
    if (!request) return;

    if (traveller.kind !== 'request') {
      buildChip(request, traveller);
      gsap.set([request.dot, request.ok, request.fail], { opacity: 0 });
    }

    parkRequest(request, traveller.start.x, traveller.start.y);
    if (traveller.kind !== 'request') gsap.set(request.dot, { opacity: 0 });

    showRequest(tl, request, traveller.showAt);
    for (const leg of traveller.legs) {
      tl.to(
        request.group,
        { x: leg.x, y: leg.y, duration: leg.duration, ease: 'none', immediateRender: false },
        leg.at,
      );
    }
    for (const [at, value] of traveller.states) {
      attr(tl, request.group, 'data-result', value, at);
    }
    if (traveller.mark) markRequest(tl, request, traveller.mark[1], traveller.mark[0]);
    hideRequest(tl, request, traveller.fadeAt, traveller.kind === 'request' ? FADE : CHIP_FADE);
  });

  // --- sound --------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels --------------------------------------------------------

  // The stage is complete on the first frame: the bus and its subscriptions,
  // three services with empty bars and no rows written, and nothing in flight.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
