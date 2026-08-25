import gsap from 'gsap';
import {
  AXIS_MAX_MS,
  METER_W,
  MINI_COUNT,
  MS_PX,
  ROW_COUNT,
  ROW_H,
  SCENE_DURATION,
  SERVICE_X,
  STAGE_STATE,
  X_CLIENT,
  X_QUEUE,
  Y_ARRIVE,
  Y_CLIENT,
  Y_QUEUE_EDGE,
  Y_RAIL,
  msToX,
  rowY,
} from './stage';
import type { ServiceKey } from './stage';
import { q, qa } from '../shared/dom';
import { hideRequest, markRequest, mountRequests, parkRequest, showRequest } from '../shared/request';
import type { RequestParts, RequestResult } from '../shared/request';
import { collapseAtInstant, createScheduler } from '../shared/simulation';
import { attr, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Distributed Tracing scene: a 24 second, four step timeline.
 *
 * Same two rules as the other scenes: every tween sits at an absolute position,
 * and every discrete change is a zero-duration tween on a `data-*` attribute
 * that GSAP reverts when the playhead moves back past it.
 *
 * Nothing in the Trace panel is drawn by hand. The scene is told four things
 * and works out the rest: which services a request walks through, how long each
 * of them spends before it forwards or answers, how fast a hop travels, and
 * what the sampler is set to. One pass over the whole 24 seconds then produces
 * every span's start and end, the bar each span is drawn as and where on the
 * axis it sits, the trace id, what the message carries across the queue, the
 * link that ties the consumer back to the producer, which traces a sampler
 * keeps, how full the storage meter gets, and every sound cue.
 *
 * There is one conversion and everything hangs off it. A hop's flight time is
 * its distance in pixels over `SPEED`, and `MS_SEC` says how many scene seconds
 * one traced millisecond is worth, so `PX_PER_MS` turns a leg of the diagram
 * into a number of milliseconds in the trace. A span is therefore exactly as
 * long on the axis as the reader watched it take on the stage: the 800 ms
 * inside payments is 2.88 seconds of waiting and 384 pixels of orange bar, and
 * neither number was typed in.
 *
 * A trace's clock starts when its root span starts, not when the client sent
 * the request, which is both what a tracer does and what keeps the root bar
 * inside the axis.
 */

const ID = 'distributed-tracing';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- the one conversion ---------------------------------------------------

/** How fast a request crosses the diagram, in pixels per scene second. */
const SPEED = 1900;
/** Scene seconds one traced millisecond is worth. */
const MS_SEC = 0.0036;
/** Pixels a request covers in one traced millisecond. */
const PX_PER_MS = SPEED * MS_SEC;

/** The burst in step 4 runs faster, because ten of them have to fit. */
const BURST_SPEED = 2400;

/** How long a result marker or a flash stays up. */
const FADE = 0.2;
const FADE_FAST = 0.14;
const GUILTY_FLASH = 0.7;
/** How long a landed request keeps its marker before it goes. */
const HOME_HOLD = 0.35;

// --- what the scene is told -----------------------------------------------

/**
 * One service on a request's path. `pre` is the work it does before calling the
 * next one, `post` the work it does after that answer comes back, and `dwell`
 * is what the last service on the path spends instead, because it calls nobody.
 */
interface Hop {
  service: ServiceKey;
  pre?: number;
  post?: number;
  dwell?: number;
  /** The row the span is drawn on, and the name that row shows. */
  row: number;
  name: string;
  /** Whether the span is the one worth pointing at. */
  slow?: boolean;
  /** The line the service writes in its own log when it is reached. */
  log?: string;
}

/** A request the client makes, and everything it sets off. */
interface Plan {
  /** Absolute time the request leaves the Client. */
  at: number;
  hops: Hop[];
  /** Whether the services are instrumented at all. */
  traced: boolean;
  /** Milliseconds after the second hop answers that it publishes a message. */
  publishAfter?: number;
  /** The trace id and the baggage the context carries once there is one. */
  baggage?: boolean;
}

/** What the worker does with the message, once it takes it. */
interface WorkerPlan {
  /** Traced milliseconds, from the request leaving the Client, that it pulls. */
  pullAt: number;
  /** Work before it calls downstream, and after the answer comes back. */
  pre: number;
  post: number;
  consumeRow: number;
  callRow: number;
  /** How long the downstream call takes. */
  dwell: number;
}

/** One request in a step 4 burst: how long it took and whether it mattered. */
interface BurstCall {
  ms: number;
  kind: 'ok' | 'error' | 'slow';
}

/** How a burst decides what to keep. */
type Sampler = 'all' | 'head' | 'tail';

interface Burst {
  at: number;
  mode: Sampler;
  /** Which of every ten head sampling lets through. */
  headKeep: number;
}

const CHAIN: Hop[] = [
  { service: 'gateway', pre: 20, post: 20, row: 0, name: 'root', log: 'get' },
  { service: 'orders', pre: 15, post: 15, row: 1, name: 'load', log: 'load' },
  { service: 'payments', dwell: 800, row: 2, name: 'charge', slow: true, log: 'charge' },
];

const SHORT_CHAIN: Hop[] = [
  { service: 'gateway', pre: 20, post: 20, row: 0, name: 'root', log: 'get' },
  { service: 'orders', dwell: 230, row: 1, name: 'load', log: 'load' },
];

const WORKER: WorkerPlan = {
  pullAt: 720,
  pre: 80,
  post: 20,
  consumeRow: 2,
  callRow: 3,
  dwell: 160,
};

const PLANS: Plan[] = [
  { at: 0.3, hops: CHAIN, traced: false },
  { at: 6.05, hops: CHAIN, traced: true },
  { at: 12.1, hops: SHORT_CHAIN, traced: true, publishAfter: 60, baggage: true },
];

/** The ten calls a burst makes, the same ten each time so the samplers differ. */
const BURST_CALLS: BurstCall[] = [
  { ms: 140, kind: 'ok' },
  { ms: 175, kind: 'ok' },
  { ms: 130, kind: 'ok' },
  { ms: 210, kind: 'error' },
  { ms: 160, kind: 'ok' },
  { ms: 190, kind: 'ok' },
  { ms: 980, kind: 'slow' },
  { ms: 150, kind: 'ok' },
  { ms: 165, kind: 'ok' },
  { ms: 145, kind: 'ok' },
];

/** Seconds between two calls in a burst, and how long a service holds one. */
const BURST_GAP = 0.11;
const BURST_DWELL = 0.06;
/** How long the collector holds a trace before tail sampling rules on it. */
const TAIL_DECIDE = 0.35;

const BURSTS: Burst[] = [
  { at: 18.1, mode: 'all', headKeep: 4 },
  { at: 19.85, mode: 'head', headKeep: 4 },
  { at: 21.6, mode: 'tail', headKeep: 4 },
];

/** The services a burst spreads itself over, so no two calls share a lane. */
const BURST_TARGETS: ServiceKey[] = ['gateway', 'orders', 'payments'];

/** What the meter reads when a burst has kept every one of its ten traces. */
const METER_FULL = 0.9;

/** The doubt three uncorrelated log lines leave behind. */
const DOUBT_AT = 4.2;

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
  className: string;
  slow: boolean;
  start: Point;
  showAt: number;
  legs: Leg[];
  carry: [number, string][];
  mark: [number, RequestResult] | null;
  fadeAt: number;
  fade: number;
  /** Where and when the traveller is free next, while it is being built. */
  cursor: number;
  at: Point;
}

/** One span, as the panel draws it. */
interface SpanRun {
  row: number;
  name: string;
  /** Scene seconds the bar starts growing, and stops. */
  from: number;
  to: number;
  /** Where on the axis it sits, and how far it runs. */
  startMs: number;
  durMs: number;
  slow: boolean;
}

/** One of the ten rows a burst stacks, and what happened to it. */
interface MiniRun {
  row: number;
  at: number;
  ms: number;
  state: string;
}

/** A stretch of the storage meter filling or emptying. */
interface MeterSegment {
  from: number;
  to: number;
  wFrom: number;
  wTo: number;
}

interface AttrChange {
  at: number;
  target: string;
  name: string;
  value: string;
}

/** The dotted line from the span that sent the message to the one that took it. */
interface LinkRun {
  at: number;
  points: Point[];
}

interface Simulation {
  travellers: Traveller[];
  spans: SpanRun[];
  minis: MiniRun[];
  meter: MeterSegment[];
  links: LinkRun[];
  attrs: AttrChange[];
  cues: [number, SceneCue][];
  /** What the two labels written on a bar say, once the spans are known. */
  totals: { row: number; at: number; endMs: number; text: string }[];
}

// --- routes ---------------------------------------------------------------

const pathLength = (points: Point[]): number => {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1];
    const to = points[i];
    if (!from || !to) continue;
    total += Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
  }
  return total;
};

/** How many traced milliseconds a route takes, which is the only network model. */
const routeMs = (points: Point[]): number => pathLength(points) / PX_PER_MS;

const clientToService = (service: ServiceKey): Point[] => [
  { x: X_CLIENT, y: Y_CLIENT },
  { x: X_CLIENT, y: Y_RAIL },
  { x: SERVICE_X[service], y: Y_RAIL },
  { x: SERVICE_X[service], y: Y_ARRIVE },
];

const serviceToClient = (service: ServiceKey): Point[] =>
  [...clientToService(service)].reverse();

const serviceToService = (from: ServiceKey, to: ServiceKey): Point[] => [
  { x: SERVICE_X[from], y: Y_ARRIVE },
  { x: SERVICE_X[from], y: Y_RAIL },
  { x: SERVICE_X[to], y: Y_RAIL },
  { x: SERVICE_X[to], y: Y_ARRIVE },
];

const serviceToQueue = (from: ServiceKey): Point[] => [
  { x: SERVICE_X[from], y: Y_ARRIVE },
  { x: SERVICE_X[from], y: Y_RAIL },
  { x: X_QUEUE, y: Y_RAIL },
  { x: X_QUEUE, y: Y_QUEUE_EDGE },
];

const queueToWorker = (): Point[] => [
  { x: X_QUEUE, y: Y_QUEUE_EDGE },
  { x: X_QUEUE, y: Y_ARRIVE },
];

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

/** Formats a millisecond count the way a trace viewer would print it. */
const printMs = (ms: number): string => {
  const whole = Math.round(ms);
  return `${whole >= 1000 ? `${Math.floor(whole / 1000)},${String(whole % 1000).padStart(3, '0')}` : String(whole)} ms`;
};

// --- the simulation -------------------------------------------------------

function simulate(): Simulation {
  const travellers: Traveller[] = [];
  const spans: SpanRun[] = [];
  const minis: MiniRun[] = [];
  const meter: MeterSegment[] = [];
  const links: LinkRun[] = [];
  const totals: Simulation['totals'] = [];
  const raw: AttrChange[] = [];
  const cues: [number, SceneCue][] = [];

  const setAttr = (at: number, target: string, name: string, value: string): void => {
    raw.push({ at: round(at), target, name: `data-${name}`, value });
  };
  const cue = (at: number, name: SceneCue): void => {
    cues.push([round(at), name]);
  };

  const { schedule, drain } = createScheduler();

  // --- travellers --------------------------------------------------------

  const spawn = (className: string, at: number, start: Point, carry: string): Traveller => {
    const traveller: Traveller = {
      className,
      slow: false,
      start,
      showAt: round(at),
      legs: [],
      carry: [[round(at), carry]],
      mark: null,
      fadeAt: round(at),
      fade: FADE,
      cursor: round(at),
      at: start,
    };
    travellers.push(traveller);
    return traveller;
  };

  const travel = (traveller: Traveller, points: Point[], speed: number): number => {
    const legs = legsOf(points, speed, traveller.cursor);
    traveller.legs.push(...legs);
    const last = legs[legs.length - 1];
    if (last) {
      traveller.cursor = round(last.at + last.duration);
      traveller.at = { x: last.x, y: last.y };
    }
    traveller.fadeAt = traveller.cursor;
    return traveller.cursor;
  };

  const wait = (traveller: Traveller, seconds: number): number => {
    traveller.cursor = round(traveller.cursor + seconds);
    traveller.fadeAt = traveller.cursor;
    return traveller.cursor;
  };

  // --- one traced request ------------------------------------------------

  /**
   * Walks a chain of services and records what happened, in traced
   * milliseconds counted from the moment the request left the Client. Nothing
   * about the drawing is decided here: this is only the request's own story.
   */
  const walk = (
    plan: Plan,
  ): { arrive: number[]; respond: number[]; home: number; rootStart: number } => {
    const hops = plan.hops;
    const last = hops.length - 1;
    const arrive: number[] = [];
    const respond: number[] = [];

    const first = hops[0];
    if (!first) return { arrive, respond, home: 0, rootStart: 0 };

    arrive[0] = routeMs(clientToService(first.service));
    for (let i = 1; i <= last; i += 1) {
      const from = hops[i - 1];
      const to = hops[i];
      if (!from || !to) continue;
      arrive[i] =
        (arrive[i - 1] ?? 0) + (from.pre ?? 0) + routeMs(serviceToService(from.service, to.service));
    }

    respond[last] = (arrive[last] ?? 0) + (hops[last]?.dwell ?? 0);
    for (let i = last - 1; i >= 0; i -= 1) {
      const below = hops[i + 1];
      const here = hops[i];
      if (!below || !here) continue;
      respond[i] =
        (respond[i + 1] ?? 0) + routeMs(serviceToService(below.service, here.service)) + (here.post ?? 0);
    }

    const home = (respond[0] ?? 0) + routeMs(serviceToClient(first.service));
    return { arrive, respond, home, rootStart: arrive[0] ?? 0 };
  };

  /**
   * Books one span: the row it is drawn on, the bar's place on the axis, the
   * two attribute changes that open and close the row, and the two sounds.
   */
  const addSpan = (span: SpanRun): void => {
    spans.push(span);
    setAttr(span.from, `row-${span.row}`, 'row', span.name);
    setAttr(span.from, `row-${span.row}`, 'bar', 'running');
    cue(span.from, 'state');
    setAttr(span.to, `row-${span.row}`, 'bar', span.slow ? 'slow' : 'done');
    cue(span.to, span.slow ? 'failure' : 'state');
  };

  /** The request itself: down the chain, a wait at the bottom, and back up. */
  const runRequest = (plan: Plan): void => {
    const hops = plan.hops;
    const last = hops.length - 1;
    const { arrive, respond, rootStart } = walk(plan);
    const sec = (ms: number): number => round(plan.at + ms * MS_SEC);

    const traveller = spawn('dt-req', plan.at, { x: X_CLIENT, y: Y_CLIENT }, 'none');

    const first = hops[0];
    if (!first) return;

    travel(traveller, clientToService(first.service), SPEED);
    for (let i = 0; i <= last; i += 1) {
      const hop = hops[i];
      if (!hop) continue;
      const at = sec(arrive[i] ?? 0);
      const off = sec(respond[i] ?? 0);

      if (hop.log) {
        setAttr(at, 'stage', `log-${hop.service}`, hop.log);
        // In the first step the log line is the only thing that happens, so it
        // is what the sound belongs to; later it shares an instant with a span.
        if (!plan.traced) cue(at, 'state');
      }
      setAttr(at, `svc-${hop.service}`, 'svc', 'busy');
      setAttr(off, `svc-${hop.service}`, 'svc', 'idle');

      if (plan.traced) {
        if (i === 0) {
          // The first instrumented service is the one that mints the id, and
          // that is the same instant the request starts carrying the header.
          setAttr(at, 'stage', 'traceid', 'minted');
          cue(at, 'trip');
          traveller.carry.push([at, plan.baggage === true ? 'tp-bag' : 'tp']);
        }
        addSpan({
          row: hop.row,
          name: hop.name,
          from: at,
          to: off,
          startMs: (arrive[i] ?? 0) - rootStart,
          durMs: (respond[i] ?? 0) - (arrive[i] ?? 0),
          slow: hop.slow === true,
        });
      }

      if (i < last) {
        const next = hops[i + 1];
        if (!next) continue;
        wait(traveller, (hop.pre ?? 0) * MS_SEC);
        travel(traveller, serviceToService(hop.service, next.service), SPEED);
      } else {
        wait(traveller, (hop.dwell ?? 0) * MS_SEC);
      }
    }

    for (let i = last; i > 0; i -= 1) {
      const here = hops[i];
      const above = hops[i - 1];
      if (!here || !above) continue;
      travel(traveller, serviceToService(here.service, above.service), SPEED);
      wait(traveller, (above.post ?? 0) * MS_SEC);
    }
    const homeAt = travel(traveller, serviceToClient(first.service), SPEED);

    traveller.mark = [homeAt, 'ok'];
    traveller.slow = hops.some((hop) => hop.slow === true);
    traveller.fadeAt = round(homeAt + HOME_HOLD);
    cue(homeAt, 'success');

    // The bar the reader is meant to blame, pointed at once the trace is whole.
    if (plan.traced) {
      const guilty = spans.find((span) => span.slow && span.from >= plan.at);
      if (guilty) {
        const flashAt = round(sec(respond[0] ?? 0) + 0.05);
        setAttr(flashAt, `row-${guilty.row}`, 'bar', 'guilty');
        setAttr(round(flashAt + GUILTY_FLASH), `row-${guilty.row}`, 'bar', 'slow');
      }
    }

    // Three logs and nothing joining them is the whole of the first step.
    if (!plan.traced) {
      schedule(DOUBT_AT, () => {
        setAttr(DOUBT_AT, 'stage', 'doubt', 'on');
        cue(DOUBT_AT, 'state');
      });
    }
  };

  /** The message orders leaves behind, and the worker that picks it up later. */
  const runMessage = (plan: Plan, worker: WorkerPlan): void => {
    const hops = plan.hops;
    const producer = hops[hops.length - 1];
    const first = hops[0];
    if (!producer || !first) return;
    const { respond, rootStart } = walk(plan);
    const sec = (ms: number): number => round(plan.at + ms * MS_SEC);

    // The message goes out just after the request it belongs to has been
    // answered, which is why the consumer is linked to the trace and not
    // nested inside it: by then the producing span has already closed.
    const publishMs = (respond[hops.length - 1] ?? 0) + (plan.publishAfter ?? 0);
    const publishAt = sec(publishMs);

    const message = spawn(
      'dt-req dt-req--message',
      publishAt,
      { x: SERVICE_X[producer.service], y: Y_ARRIVE },
      'tp-bag',
    );
    setAttr(publishAt, 'stage', 'log-orders', 'publish');
    cue(publishAt, 'state');
    const inQueueAt = travel(message, serviceToQueue(producer.service), SPEED);
    message.fadeAt = inQueueAt;
    message.fade = FADE_FAST;
    setAttr(inQueueAt, 'slot-0', 'slot-state', 'busy');

    // The worker takes it well after the request that produced it went home.
    const pullAt = sec(worker.pullAt);
    setAttr(pullAt, 'slot-0', 'slot-state', 'free');
    const carried = spawn(
      'dt-req dt-req--message',
      pullAt,
      { x: X_QUEUE, y: Y_QUEUE_EDGE },
      'tp-bag',
    );
    const consumeStartMs = worker.pullAt + routeMs(queueToWorker());
    const consumeStartAt = travel(carried, queueToWorker(), SPEED);
    carried.fadeAt = consumeStartAt;
    carried.fade = FADE_FAST;

    setAttr(consumeStartAt, 'stage', 'log-worker', 'consume');
    setAttr(consumeStartAt, 'svc-worker', 'svc', 'busy');
    setAttr(consumeStartAt, 'stage', 'link', 'on');
    cue(consumeStartAt, 'trip');

    // The worker's own downstream call, which is where the baggage ends up.
    const callAt = round(consumeStartAt + worker.pre * MS_SEC);
    const call = spawn('dt-req', callAt, { x: SERVICE_X.worker, y: Y_ARRIVE }, 'tp-bag');
    const chargeStartMs = consumeStartMs + worker.pre + routeMs(serviceToService('worker', 'payments'));
    const chargeStartAt = travel(call, serviceToService('worker', 'payments'), SPEED);
    setAttr(chargeStartAt, 'stage', 'log-payments', 'tenant');
    setAttr(chargeStartAt, 'svc-payments', 'svc', 'busy');
    cue(chargeStartAt, 'state');
    const chargeEndAt = wait(call, worker.dwell * MS_SEC);
    call.mark = [chargeEndAt, 'ok'];
    setAttr(chargeEndAt, 'svc-payments', 'svc', 'idle');
    const backAt = travel(call, serviceToService('payments', 'worker'), SPEED);
    call.fadeAt = backAt;
    call.fade = FADE_FAST;

    const consumeEndAt = round(backAt + worker.post * MS_SEC);
    setAttr(consumeEndAt, 'svc-worker', 'svc', 'idle');

    addSpan({
      row: worker.consumeRow,
      name: 'consume',
      from: consumeStartAt,
      to: consumeEndAt,
      startMs: consumeStartMs - rootStart,
      durMs: (consumeEndAt - consumeStartAt) / MS_SEC,
      slow: false,
    });

    addSpan({
      row: worker.callRow,
      name: 'charge',
      from: chargeStartAt,
      to: chargeEndAt,
      startMs: chargeStartMs - rootStart,
      durMs: worker.dwell,
      slow: false,
    });

    // The link runs from the end of the span that published to the start of
    // the span that took it, which is where the two ends of the message are.
    const producerEndMs = (respond[hops.length - 1] ?? 0) - rootStart;
    links.push({
      at: consumeStartAt,
      points: [
        { x: msToX(producerEndMs), y: rowY(producer.row) + ROW_H / 2 },
        { x: msToX(producerEndMs), y: rowY(worker.consumeRow) + ROW_H / 2 },
        { x: msToX(consumeStartMs - rootStart), y: rowY(worker.consumeRow) + ROW_H / 2 },
      ],
    });
  };

  // --- a burst of traffic, and what a sampler keeps ----------------------

  /** How much of the meter `count` stored traces take up. */
  const meterFor = (count: number): number =>
    round((METER_W * METER_FULL * count) / BURST_CALLS.length);

  const runBurst = (burst: Burst): void => {
    const openAt = round(burst.at - 0.06);
    setAttr(openAt, 'stage', 'mode', burst.mode);
    setAttr(openAt, 'stage', 'panel', 'mini');
    for (let i = 0; i < MINI_COUNT; i += 1) setAttr(openAt, `mini-${i}`, 'mini', 'hidden');
    meter.push({ from: openAt, to: openAt, wFrom: 0, wTo: 0 });
    cue(openAt, 'trip');

    let stored = 0;
    let meterAt = openAt;
    let meterW = 0;
    const moveMeter = (at: number, to: number): void => {
      if (at <= meterAt) {
        meter.push({ from: at, to: at, wFrom: to, wTo: to });
        meterW = to;
        return;
      }
      meter.push({ from: meterAt, to: at, wFrom: meterW, wTo: to });
      meterAt = at;
      meterW = to;
    };

    let lastHome = openAt;

    BURST_CALLS.forEach((call, index) => {
      const leaveAt = round(burst.at + index * BURST_GAP);
      // Head sampling rules before the request has been anywhere, so it can
      // only go on the counter; nothing about this call is known yet.
      const sampledUp = burst.mode === 'all' || (burst.mode === 'head' && index === burst.headKeep);
      const traveller = spawn(
        'dt-req dt-req--burst',
        leaveAt,
        { x: X_CLIENT, y: Y_CLIENT },
        burst.mode === 'head' ? (sampledUp ? 'sampled' : 'unsampled') : 'none',
      );
      traveller.slow = call.kind === 'slow';
      // The burst is one way traffic: every call is absorbed by the service it
      // reached, so the lane never carries an answer back into the next call.
      const target = BURST_TARGETS[index % BURST_TARGETS.length] ?? 'gateway';
      travel(traveller, clientToService(target), BURST_SPEED);
      const homeAt = wait(traveller, BURST_DWELL);
      traveller.fadeAt = homeAt;
      traveller.fade = FADE_FAST;
      lastHome = Math.max(lastHome, homeAt);

      // A trace is written down when it ends, which is when its last span does.
      schedule(homeAt, () => {
        if (burst.mode === 'head' && !sampledUp) {
          // The one trace anybody wanted is the one head sampling threw away
          // before it could know that it mattered.
          if (call.kind === 'ok') return;
          minis.push({ row: index, at: homeAt, ms: call.ms, state: 'dropped' });
          setAttr(homeAt, `mini-${index}`, 'mini', 'dropped');
          setAttr(round(homeAt + 0.45), `mini-${index}`, 'mini', 'hidden');
          cue(homeAt, 'failure');
          return;
        }
        stored += 1;
        const state = burst.mode === 'tail' ? 'held' : call.kind;
        minis.push({ row: index, at: homeAt, ms: call.ms, state });
        setAttr(homeAt, `mini-${index}`, 'mini', state);
        moveMeter(homeAt, meterFor(stored));
        cue(homeAt, burst.mode === 'head' ? 'success' : 'state');
      });
    });

    if (burst.mode !== 'tail') return;

    // Tail sampling waits until every trace is complete and then rules on what
    // it can finally see: the failure and the outlier stay, the rest go.
    schedule(round(burst.at + 3), () => {
      const decideAt = round(lastHome + TAIL_DECIDE);
      let kept = 0;
      BURST_CALLS.forEach((call, index) => {
        if (call.kind === 'ok') {
          setAttr(decideAt, `mini-${index}`, 'mini', 'hidden');
          return;
        }
        kept += 1;
        setAttr(decideAt, `mini-${index}`, 'mini', call.kind);
        cue(decideAt, 'success');
      });
      moveMeter(decideAt, meterFor(kept));
    });
  };

  // --- what a step opens on ----------------------------------------------

  const reset = (at: number): void => {
    setAttr(at, 'stage', 'traceid', 'none');
    setAttr(at, 'stage', 'doubt', 'off');
    setAttr(at, 'stage', 'mode', 'off');
    setAttr(at, 'stage', 'link', 'off');
    setAttr(at, 'stage', 'panel', 'named');
    setAttr(at, 'stage', 'log-gateway', 'none');
    setAttr(at, 'stage', 'log-orders', 'none');
    setAttr(at, 'stage', 'log-payments', 'none');
    setAttr(at, 'stage', 'log-worker', 'none');
    for (const service of ['gateway', 'orders', 'payments', 'worker']) {
      setAttr(at, `svc-${service}`, 'svc', 'idle');
    }
    for (let i = 0; i < 3; i += 1) setAttr(at, `slot-${i}`, 'slot-state', 'free');
    for (let i = 0; i < ROW_COUNT; i += 1) {
      setAttr(at, `row-${i}`, 'row', 'none');
      setAttr(at, `row-${i}`, 'bar', 'hidden');
    }
    for (let i = 0; i < MINI_COUNT; i += 1) setAttr(at, `mini-${i}`, 'mini', 'hidden');
  };

  // --- the steps, one after another --------------------------------------

  for (const step of STEPS) schedule(step.time, () => reset(step.time));
  for (const plan of PLANS) schedule(plan.at - 0.001, () => runRequest(plan));
  const messagePlan = PLANS[2];
  if (messagePlan) schedule(messagePlan.at - 0.001, () => runMessage(messagePlan, WORKER));
  for (const burst of BURSTS) schedule(burst.at - 0.06, () => runBurst(burst));

  drain();

  // --- the numbers the panel writes on two of its bars --------------------

  for (const span of spans) {
    if (!span.slow && span.name !== 'root') continue;
    totals.push({
      row: span.row,
      at: span.to,
      endMs: span.startMs + span.durMs,
      text: printMs(span.durMs),
    });
  }

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
  for (const [key, value] of Object.entries(STAGE_STATE)) {
    const at = key.indexOf('@');
    seen.set(`${key.slice(0, at)}@${key.slice(at + 1)}`, value);
  }
  const attrs: AttrChange[] = [];
  for (const change of folded) {
    const key = `${change.target}@${change.name}`;
    if (seen.get(key) === change.value) continue;
    seen.set(key, change.value);
    attrs.push(change);
  }

  spans.sort((left, right) => left.from - right.from);
  minis.sort((left, right) => left.at - right.at);
  meter.sort((left, right) => left.from - right.from);
  cues.sort((left, right) => left[0] - right[0]);
  // Two passes can land the same sound on the same instant, and a cue played
  // twice in one frame is heard as one louder cue rather than as two events.
  const played: [number, SceneCue][] = [];
  for (const entry of cues) {
    const last = played[played.length - 1];
    if (last && last[0] === entry[0] && last[1] === entry[1]) continue;
    played.push(entry);
  }

  return { travellers, spans, minis, meter, links, attrs, cues: played, totals };
}

// --- the timeline ---------------------------------------------------------

const NS = 'http://www.w3.org/2000/svg';

/** The plate a traveller carries its context on. */
const CHIP_W = 130;
const CHIP_H = 24;
const CHIP_TOP = 14;

const CARRY_TEXT: [string, string][] = [
  ['tp', 'traceparent'],
  ['tp-bag', 'tp + baggage'],
  ['sampled', 'sampled'],
  ['unsampled', 'not sampled'],
];

function addPart(
  parent: SVGElement,
  tag: string,
  attributes: Record<string, string | number>,
  text?: string,
): SVGElement {
  const element = document.createElementNS(NS, tag) as SVGElement;
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, String(value));
  }
  if (text !== undefined) element.textContent = text;
  parent.appendChild(element);
  return element;
}

/** Dresses a request group as a dot with the header plate hanging under it. */
function dressTraveller(parts: RequestParts, traveller: Traveller): void {
  const group = parts.group;
  group.setAttribute('class', `scene-req ${traveller.className}`);
  group.setAttribute('data-carry', traveller.carry[0]?.[1] ?? 'none');
  if (traveller.slow) group.setAttribute('data-slow', '1');

  const chip = document.createElementNS(NS, 'g') as SVGGElement;
  chip.setAttribute('class', 'dt-carry');
  group.appendChild(chip);
  addPart(chip, 'rect', {
    class: 'dt-carry-bg',
    x: -CHIP_W / 2,
    y: CHIP_TOP,
    width: CHIP_W,
    height: CHIP_H,
    rx: 8,
  });
  for (const [value, label] of CARRY_TEXT) {
    addPart(
      chip,
      'text',
      {
        class: `scene-mono dt-carry-text dt-carry-text--${value}`,
        x: 0,
        y: CHIP_TOP + 17,
        'text-anchor': 'middle',
      },
      label,
    );
  }
}

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);
  const linkLayer = q<SVGGElement>(stage, '.dt-links', ID);
  const meterFill = q<SVGRectElement>(stage, '.dt-meter-fill', ID);
  const rowEls = qa<SVGGElement>(stage, '.dt-row');
  const barEls = rowEls.map((row) => q<SVGRectElement>(row, '.dt-bar', ID));
  const miniEls = qa<SVGRectElement>(stage, '.dt-mini');
  const slotEls = qa<SVGRectElement>(stage, '.dt-slot');
  const serviceEls = new Map<string, SVGGElement>();
  for (const key of ['gateway', 'orders', 'payments', 'worker']) {
    serviceEls.set(key, q<SVGGElement>(stage, `.dt-svc--${key}`, ID));
  }

  const target = (name: string): Element => {
    if (name === 'stage') return stage;
    if (name.startsWith('svc-')) return serviceEls.get(name.slice(4)) ?? stage;
    if (name.startsWith('slot-')) return slotEls[Number(name.slice(5))] ?? stage;
    if (name.startsWith('row-')) return rowEls[Number(name.slice(4))] ?? stage;
    if (name.startsWith('mini-')) return miniEls[Number(name.slice(5))] ?? stage;
    return stage;
  };

  const sim = simulate();
  const parts = mountRequests(layer, sim.travellers.length, ID);

  const tl = createSceneTimeline();

  // --- discrete state -----------------------------------------------------

  for (const change of sim.attrs) attr(tl, target(change.target), change.name, change.value, change.at);

  // --- the waterfall, which is only ever a drawing of the spans ------------

  for (const span of sim.spans) {
    const element = barEls[span.row];
    if (!element) continue;
    const width = round(span.durMs * MS_PX);
    tl.set(
      element,
      { attr: { x: round(msToX(span.startMs)), width: 0 }, immediateRender: false },
      span.from,
    );
    tl.fromTo(
      element,
      { attr: { width: 0 } },
      {
        attr: { width },
        duration: round(Math.max(0.01, span.to - span.from)),
        ease: 'none',
        immediateRender: false,
      },
      span.from,
    );
  }

  // The bars the ten traces of a burst are stacked as: no name, no axis of
  // their own, just how long each one took.
  for (const mini of sim.minis) {
    const element = miniEls[mini.row];
    if (!element) continue;
    if (mini.ms > 0) {
      tl.set(
        element,
        {
          attr: { x: round(msToX(0)), width: round(Math.min(mini.ms, AXIS_MAX_MS) * MS_PX) },
          immediateRender: false,
        },
        mini.at,
      );
    }
  }

  // --- the number written on the two bars worth reading -------------------

  for (const total of sim.totals) {
    const row = rowEls[total.row];
    if (!row) continue;
    const label = addPart(
      row,
      'text',
      {
        class: 'scene-mono dt-total',
        x: round(msToX(total.endMs) - 8),
        y: rowY(total.row) + 14,
        'text-anchor': 'end',
      },
      total.text,
    ) as SVGTextElement;
    gsap.set(label, { opacity: 0 });
    tl.set(label, { opacity: 1, immediateRender: false }, total.at);
    tl.set(label, { opacity: 0, immediateRender: false }, Math.floor(total.at / 6) * 6 + 6);
  }

  // --- the link, which is what a message hop leaves in a trace -------------

  for (const link of sim.links) {
    const path = link.points
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${round(point.x)} ${round(point.y)}`)
      .join(' ');
    addPart(linkLayer, 'path', { class: 'dt-link', d: path });
  }

  // --- what keeping traces costs ------------------------------------------

  for (const segment of sim.meter) {
    if (segment.to <= segment.from) {
      tl.set(meterFill, { attr: { width: segment.wTo }, immediateRender: false }, segment.from);
      continue;
    }
    tl.fromTo(
      meterFill,
      { attr: { width: segment.wFrom } },
      {
        attr: { width: segment.wTo },
        duration: round(segment.to - segment.from),
        ease: 'none',
        immediateRender: false,
      },
      segment.from,
    );
  }
  for (const step of STEPS) {
    tl.set(meterFill, { attr: { width: 0 }, immediateRender: false }, step.time);
  }

  // --- what travels -------------------------------------------------------

  sim.travellers.forEach((traveller, index) => {
    const request = parts[index];
    if (!request) return;

    dressTraveller(request, traveller);
    parkRequest(request, traveller.start.x, traveller.start.y);

    showRequest(tl, request, traveller.showAt);
    for (const leg of traveller.legs) {
      if (leg.duration <= 0) continue;
      tl.to(
        request.group,
        { x: leg.x, y: leg.y, duration: leg.duration, ease: 'none', immediateRender: false },
        leg.at,
      );
    }
    for (const [at, value] of traveller.carry.slice(1)) {
      attr(tl, request.group, 'data-carry', value, at);
    }
    if (traveller.mark) markRequest(tl, request, traveller.mark[1], traveller.mark[0]);
    hideRequest(tl, request, traveller.fadeAt, traveller.fade);
  });

  // --- sound --------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels --------------------------------------------------------

  // The stage is complete on the first frame: a Client, a broker with an empty
  // queue, four services with nothing logged, an empty Trace panel that has no
  // trace id to key anything on, and nothing in flight.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
