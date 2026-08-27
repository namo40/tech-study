import gsap from 'gsap';
import {
  FAIL_KIND,
  IDS,
  LANE_Y,
  ROW_COUNT,
  SCENE_DURATION,
  STAGE_STATE,
  WINDOW_ROWS,
  X_GLYPH,
  X_ORDERS_EDGE,
  X_ORDERS_IN,
  X_PAY_IN,
  X_WEB_EDGE,
} from './stage';
import type { IdKey, LineKind } from './stage';
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
 * Correlation ID scene: a 24 second, four step timeline.
 *
 * Same two rules as the other scenes: every tween sits at an absolute position,
 * and every discrete change is a zero-duration tween on a `data-*` attribute
 * that GSAP reverts when the playhead moves back past it.
 *
 * Nothing in the log pane is placed by hand. The scene is told five flows and
 * seven instants, and one pass over the whole 24 seconds produces the rest: which
 * row each line lands on and in what order, the id chip each row carries, how
 * far the tail has scrolled, how many lines the filter matches, which rows the
 * filter dims, where every traveller is at every moment, and every sound cue.
 *
 * A flow is one business request walking Web, Orders and Payments. It is told
 * when it starts, which id is stamped on the lines it writes, whether it is a
 * checkout (which publishes, so it writes four lines) or a cart (which writes
 * three), whether its payment fails, and how long it sits in the queue. Every
 * other time in the scene is that start time plus a fixed offset, and every
 * offset is either a distance over `SPEED` or the work a service does, so a
 * flow that starts a second later has all of it a second later.
 *
 * The order of the log is therefore not authored either. Two flows overlap on
 * purpose, and the pane fills from whichever of them happened to reach its next
 * hop first — which is the whole point of the first step, and why the lines are
 * interleaved without anybody having interleaved them.
 *
 * The window is what makes `matches 9` true twice over. The tail holds twenty
 * lines and shows the last twelve, and the twelve on screen when the filter is
 * applied are exactly the twelve written in steps 2 and 3: nine carrying
 * `7f3a`, three carrying `91c2`. The readout counts rows, not intentions.
 */

const ID = 'correlation-id';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- how a flow moves and how long it takes -------------------------------

/** How fast a traveller crosses the lane, in pixels per second. */
const SPEED = 160;

const HOP_A = round((X_ORDERS_IN - X_WEB_EDGE) / SPEED);
const HOP_B_IN = round((X_GLYPH - X_ORDERS_EDGE) / SPEED);
const HOP_B_OUT = round((X_PAY_IN - X_GLYPH) / SPEED);

/** What Orders does before it hands the flow on, measured from the flow start. */
const ORDERS_LOG = 0.6;
const ORDERS_OUT = 1.0;

/** What Payments does once the message reaches it. */
const PAY_LOG = 0.1;
const FAIL_LOG = 0.55;

/** How long a result marker stays up, and how long the fade takes. */
const HOLD = 0.15;
const FADE = 0.1;

/** Two log lines closer together than this share one accumulation cue. */
const SAMPLE_GAP = 1.3;

// --- what the scene is told -----------------------------------------------

/** A checkout publishes to the queue and says so; a cart does not. */
type FlowKind = 'checkout' | 'cart';

interface FlowPlan {
  /** When the flow leaves Web, which is also when it writes its first line. */
  at: number;
  /** The id stamped on every line it writes, or none at all. */
  id: IdKey | null;
  kind: FlowKind;
  /** Whether the payment at the end of it fails. */
  fails: boolean;
  /** Seconds the message waits inside the queue glyph. */
  dwell: number;
  /** Set when the id is minted at the edge, which is a moment worth hearing. */
  mints?: boolean;
}

/**
 * The five flows. The first two carry no id at all, which is what makes their
 * eight lines unattributable; the next two are the pair that gets one each; the
 * last is the `7f3a` flow whose payment fails, and it waits far longer in the
 * queue because the async gap is what step 3 is about.
 */
const FLOWS: FlowPlan[] = [
  { at: 0.35, id: null, kind: 'cart', fails: false, dwell: 0.35 },
  { at: 1.35, id: null, kind: 'checkout', fails: true, dwell: 0.35 },
  { at: 6.4, id: '7f3a', kind: 'checkout', fails: false, dwell: 0.35, mints: true },
  { at: 8.2, id: '91c2', kind: 'cart', fails: false, dwell: 0.35, mints: true },
  { at: 12.6, id: '7f3a', kind: 'checkout', fails: true, dwell: 1.6 },
];

/** The lines each kind of flow writes, in the order it writes them. */
const FIRST_LINE: Record<FlowKind, LineKind> = { checkout: 'checkout', cart: 'cart' };
const ORDERS_LINE: Record<FlowKind, LineKind> = { checkout: 'create', cart: 'reserve' };
const PAY_LINE: Record<FlowKind, LineKind> = { checkout: 'charge', cart: 'authorize' };

/** When the id is shown riding the header, and then the message property. */
const HEADER_AT = 13.2;
const PROP_AT = 14.4;

/** The filter, and what the reader is given time to read once it lands. */
const FILTER_ON = 18.4;
const FILTER_READ = 18.7;
const FILTER_OFF = 22.0;

/** When the sampler is shown, and when the trace it dropped is shown missing. */
const SAMPLING_AT = 20.0;
const TRACE_AT = 20.8;

// --- what the simulation produces -----------------------------------------

interface Leg {
  at: number;
  x: number;
  duration: number;
}

interface Traveller {
  /** The flow it belongs to, which is the only thing that colours it. */
  flow: IdKey | 'none';
  startX: number;
  showAt: number;
  legs: Leg[];
  mark: [number, RequestResult] | null;
  fadeAt: number;
}

interface AttrChange {
  at: number;
  target: string;
  name: string;
  value: string;
}

interface Simulation {
  travellers: Traveller[];
  attrs: AttrChange[];
  cues: [number, SceneCue][];
}

// --- the simulation -------------------------------------------------------

function simulate(): Simulation {
  const travellers: Traveller[] = [];
  const raw: AttrChange[] = [];
  const cues: [number, SceneCue][] = [];

  const setAttr = (at: number, target: string, name: string, value: string): void => {
    raw.push({ at: round(at), target, name, value });
  };
  const cue = (at: number, name: SceneCue): void => {
    cues.push([round(at), name]);
  };

  /** The id each row ended up carrying, which is what the filter reads. */
  const rowId: (IdKey | null)[] = [];
  /** Instants a line landed without a cue of its own, sampled for sound later. */
  const quietLines: number[] = [];
  let written = 0;
  let scroll = 0;

  /**
   * Writes one line into the tail. The row is wherever the tail had got to, the
   * scroll is whatever keeps the last twelve rows in the pane, and neither is
   * decided anywhere else.
   */
  const writeLine = (at: number, kind: LineKind, id: IdKey | null): void => {
    if (written >= ROW_COUNT) return;
    const row = written;
    written += 1;
    rowId[row] = id;

    setAttr(at, `row-${row}`, 'data-cid-line', kind);
    if (id) setAttr(at, `row-${row}`, 'data-cid-id', id);

    const want = Math.max(0, written - WINDOW_ROWS);
    if (want !== scroll) {
      scroll = want;
      setAttr(at, 'stage', 'data-cid-scroll', String(scroll));
    }

    if (kind === FAIL_KIND) cue(at, 'failure');
    else quietLines.push(round(at));
  };

  const { schedule, drain } = createScheduler();

  // --- one flow -----------------------------------------------------------

  /**
   * Everything one request sets off. The two travellers are the two hops the
   * reader watches: Web to Orders along the open lane, and Orders to Payments
   * through the queue glyph, which is one journey with a wait in the middle
   * rather than two, because the message is the same message either side.
   */
  const runFlow = (flow: FlowPlan): void => {
    const { at, id, kind, fails, dwell } = flow;
    if (flow.mints) cue(at, 'trip');

    travellers.push({
      flow: id ?? 'none',
      startX: X_WEB_EDGE,
      showAt: at,
      legs: [{ at, x: X_ORDERS_IN, duration: HOP_A }],
      mark: null,
      fadeAt: round(at + HOP_A),
    });

    writeLine(at, FIRST_LINE[kind], id);
    schedule(round(at + ORDERS_LOG), () => {
      writeLine(round(at + ORDERS_LOG), ORDERS_LINE[kind], id);
    });

    const outAt = round(at + ORDERS_OUT);
    schedule(outAt, () => {
      if (kind === 'checkout') writeLine(outAt, 'publish', id);

      const glyphAt = round(outAt + HOP_B_IN);
      const leaveAt = round(glyphAt + dwell);
      const landAt = round(leaveAt + HOP_B_OUT);

      travellers.push({
        flow: id ?? 'none',
        startX: X_ORDERS_EDGE,
        showAt: outAt,
        legs: [
          { at: outAt, x: X_GLYPH, duration: HOP_B_IN },
          { at: leaveAt, x: X_PAY_IN, duration: HOP_B_OUT },
        ],
        mark: [landAt, fails ? 'fail' : 'ok'],
        fadeAt: round(landAt + HOLD),
      });

      const payAt = round(landAt + PAY_LOG);
      schedule(payAt, () => {
        writeLine(payAt, PAY_LINE[kind], id);
        if (!fails) return;
        const failAt = round(payAt + FAIL_LOG);
        schedule(failAt, () => writeLine(failAt, FAIL_KIND, id));
      });
    });
  };

  for (const flow of FLOWS) schedule(flow.at, () => runFlow(flow));

  // --- what the id rides on, once the reader is looking at it -------------

  schedule(HEADER_AT, () => {
    setAttr(HEADER_AT, 'stage', 'data-cid-header', 'carry');
    cue(HEADER_AT, 'state');
  });

  schedule(PROP_AT, () => {
    setAttr(PROP_AT, 'stage', 'data-cid-prop', 'carry');
    cue(PROP_AT, 'state');
  });

  // --- the filter, which is only ever a reading of the rows ---------------

  schedule(FILTER_ON, () => {
    setAttr(FILTER_ON, 'stage', 'data-cid-filter', 'on');
    let matches = 0;
    for (let row = 0; row < written; row += 1) {
      if (rowId[row] === IDS[0]) matches += 1;
      else setAttr(FILTER_ON, `row-${row}`, 'data-cid-dim', 'on');
    }
    setAttr(FILTER_ON, 'stage', 'data-cid-matches', String(matches));
    cue(FILTER_ON, 'trip');
    schedule(FILTER_READ, () => cue(FILTER_READ, 'success'));
  });

  schedule(SAMPLING_AT, () => {
    setAttr(SAMPLING_AT, 'stage', 'data-cid-sampling', 'on');
    setAttr(SAMPLING_AT, 'stage', 'data-cid-trace', 'on');
    cue(SAMPLING_AT, 'state');
  });

  schedule(TRACE_AT, () => {
    setAttr(TRACE_AT, 'stage', 'data-cid-trace', 'none');
    cue(TRACE_AT, 'state');
  });

  schedule(FILTER_OFF, () => {
    setAttr(FILTER_OFF, 'stage', 'data-cid-filter', 'off');
    setAttr(FILTER_OFF, 'stage', 'data-cid-matches', '0');
    for (let row = 0; row < written; row += 1) {
      if (rowId[row] !== IDS[0]) setAttr(FILTER_OFF, `row-${row}`, 'data-cid-dim', 'off');
    }
    cue(FILTER_OFF, 'trip');
  });

  drain();

  // --- the accumulation cue, sampled rather than counted ------------------

  const spoken = new Set(cues.map(([at]) => at));
  quietLines.sort((left, right) => left - right);
  let lastSample = -Infinity;
  for (const at of quietLines) {
    if (spoken.has(at)) continue;
    if (at - lastSample < SAMPLE_GAP) continue;
    lastSample = at;
    cue(at, 'state');
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
  for (const [key, value] of Object.entries(STAGE_STATE)) seen.set(key, value);

  const attrs: AttrChange[] = [];
  for (const change of folded) {
    const key = `${change.target}@${change.name}`;
    if (seen.get(key) === change.value) continue;
    seen.set(key, change.value);
    attrs.push(change);
  }

  cues.sort((left, right) => left[0] - right[0]);
  travellers.sort((left, right) => left.showAt - right.showAt);

  return { travellers, attrs, cues };
}

// --- the timeline ---------------------------------------------------------

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const targets: Record<string, Element> = { stage };
  for (let row = 0; row < ROW_COUNT; row += 1) {
    targets[`row-${row}`] = q<SVGGElement>(stage, `.cid-row--${row}`, ID);
  }

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);
  const sim = simulate();
  const parts = mountRequests(layer, sim.travellers.length, ID);

  const tl = createSceneTimeline();

  // --- discrete state -----------------------------------------------------

  for (const change of sim.attrs) {
    const target = targets[change.target];
    if (target) attr(tl, target, change.name, change.value, change.at);
  }

  // --- what travels -------------------------------------------------------

  sim.travellers.forEach((traveller, index) => {
    const request: RequestParts | undefined = parts[index];
    if (!request) return;

    request.group.setAttribute('class', 'scene-req cid-req');
    request.group.setAttribute('data-cid-flow', traveller.flow);
    if (traveller.flow !== 'none') {
      const label = attachToRequest(
        request,
        'text',
        { class: 'scene-req-label cid-req-id', x: '0', y: '40', 'text-anchor': 'middle' },
        traveller.flow,
      );
      gsap.set(label, { opacity: 1 });
    }

    parkRequest(request, traveller.startX, LANE_Y);
    showRequest(tl, request, traveller.showAt);
    for (const leg of traveller.legs) {
      tl.to(
        request.group,
        { x: leg.x, duration: leg.duration, ease: 'none', immediateRender: false },
        leg.at,
      );
    }
    if (traveller.mark) markRequest(tl, request, traveller.mark[1], traveller.mark[0]);
    hideRequest(tl, request, traveller.fadeAt, FADE);
  });

  // --- sound --------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels --------------------------------------------------------

  // The stage is complete on the first frame: three services with the lane
  // drawn between them, the queue glyph in the gap, both wire chips naming what
  // they carry and carrying nothing, an empty log tail, an empty filter box
  // reading `matches 0`, and nothing in flight.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
