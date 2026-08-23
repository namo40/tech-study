import gsap from 'gsap';
import {
  BEHIND_MAX,
  LOAD_W,
  PANEL_W,
  ROUTE_W,
  SAVED_MAX,
  SCENE_DURATION,
  STAGE_STATE,
  TABLE_ROWS,
  TIME_W,
  VIEW_ROW_COUNT,
  WRITE_COUNT,
  X_BASE,
  X_ROUTE_FROM,
  X_ROUTE_TO,
  X_TRUNK,
  X_VIEW,
  Y_ARRIVE,
  Y_CLIENT,
  Y_RAIL,
  Y_ROUTE,
} from './stage';
import { q } from '../shared/dom';
import {
  attachToRequest,
  haloRequest,
  hideRequest,
  markRequest,
  mountRequests,
  parkRequest,
  showRequest,
} from '../shared/request';
import type { RequestParts } from '../shared/request';
import { collapseAtInstant, createScheduler } from '../shared/simulation';
import { attr, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Materialized View scene: a 24 second, four step timeline.
 *
 * Same two rules as the other scenes: every tween sits at an absolute position,
 * and every discrete change is a zero-duration tween on a `data-*` attribute
 * that GSAP reverts when the playhead moves back past it.
 *
 * Nothing the reader counts is authored. The scene is told six things: how many
 * rows each base table holds, how fast the database reads rows sequentially and
 * how fast it reads them through an index, when each dashboard read leaves,
 * when each order is written, when the view is first built and when its timer
 * fires, and when the refresh policy changes from a schedule to per-write.
 *
 * Everything else falls out of one pass over the whole 24 seconds. How long a
 * query takes is its rows divided by the rate its plan reads at, which is also
 * how long each base table is lit while it is scanned and how far the time bar
 * fills. How busy the database is climbs while any read, refresh or apply is
 * running and drains when none is, so the meter and the two spikes in it are
 * consequences of the schedule rather than key frames. How far the view is
 * behind is the writes that have landed since it was last caught up, which is
 * what makes the read at 14.0 answer with rows that are visibly wrong, and what
 * the incremental hops take back one row at a time. `saved scans` is the reads
 * the view answered instead of the base tables, and the three cost bars are the
 * scene's own tallies: rows per query before the view against rows per query
 * after it, rows re-read per refresh, and rows stored.
 */

const ID = 'materialized-view';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- how a request moves --------------------------------------------------

/**
 * One speed for every leg of every journey, in pixels per second.
 *
 * A fixed speed rather than a fixed duration per leg is what keeps requests off
 * each other: everything leaves the same point on the same trunk, so two that
 * left `d` seconds apart stay `SPEED * d` apart for as long as they share the
 * route, whichever store each is bound for.
 */
const SPEED = 3000;

const DROP_TO_RAIL = (Y_RAIL - Y_CLIENT) / SPEED;
const ACROSS_BASE = (X_TRUNK - X_BASE) / SPEED;
const ACROSS_VIEW = (X_VIEW - X_TRUNK) / SPEED;
const DROP_TO_STORE = (Y_ARRIVE - Y_RAIL) / SPEED;

/** How long a result marker stays before the request goes. */
const FADE = 0.2;
/** How long a write is absorbed for once it has landed. */
const WRITE_FADE = 0.18;

// --- how long the database takes ------------------------------------------

/** Rows the base tables hold together, which is what a full scan reads. */
const SCAN_TOTAL = TABLE_ROWS.reduce((sum, rows) => sum + rows, 0);

/**
 * The two rates a plan can read at. A sequential scan gets through a million
 * rows in a second and a half; an index read of the view gets through its
 * thirty in a tenth. Every duration in the scene is a row count divided by one
 * of these two numbers, which is why the bar and the lit tables always agree.
 */
const SCAN_RATE = SCAN_TOTAL / 1.5;
const READ_RATE = VIEW_ROW_COUNT / 0.1;

/** The longest query the scene runs, which is what the time bar is scaled to. */
const SLOWEST_QUERY = SCAN_TOTAL / SCAN_RATE;
/** How long the time bar takes to drop back once a query has finished. */
const BAR_RESET = 0.15;

/** How long an `orders` glyph stays lit when a write lands on it. */
const WRITE_FLASH = 0.2;
/** How long one row takes to cross the refresh route. */
const HOP = 0.3;

// --- how the load meter moves ---------------------------------------------

/**
 * Rows a second the database can read before it is at its limit. It is the one
 * number the meter is scaled to: a scan reads `SCAN_RATE` rows a second, which
 * is why a million row query pushes the meter to eighty per cent and a thirty
 * row read does not move it.
 */
const CAPACITY = 1_250_000;
/**
 * How fast the meter drains once nothing is running. It empties in a quarter
 * of a second, because it is a gauge of the work in flight rather than an
 * average: a query that ends has stopped costing anything.
 */
const LOAD_DRAIN = 4;

// --- what the scene is told -----------------------------------------------

interface ReadPlan {
  /** When the read leaves the dashboard. */
  start: number;
  /**
   * An ad-hoc question the view does not answer. Every other read is the
   * dashboard's, and takes whichever plan is available when it arrives.
   */
  adHoc?: boolean;
}

const READS: ReadPlan[] = [
  // Step 1: the same question three times, against the base tables.
  { start: 0.3 },
  { start: 2.0 },
  { start: 3.7 },
  // Step 2: the same question five times, against the view.
  { start: 8.0 },
  { start: 8.8 },
  { start: 9.6 },
  { start: 10.4 },
  { start: 11.2 },
  // Step 3: one read while the view is behind, one after it is caught up.
  { start: 13.6 },
  { start: 17.0 },
  // Step 4: a steady dashboard, and one question nobody materialised.
  { start: 18.8 },
  { start: 19.44 },
  { start: 20.08 },
  { start: 20.72 },
  { start: 21.36 },
  { start: 22.0 },
  { start: 22.2, adHoc: true },
];

/** When each order is written. Each one adds a row to `orders`. */
const WRITES: number[] = [12.3, 12.8, 13.3, 16.2, 16.7, 19.76, 21.04];

/** When the view is first built, and when its timer next fires. */
const BUILD_AT = 6.2;
const TIMER_AT = 14.4;
/** When the refresh policy stops being a schedule and becomes one hop a write. */
const INCREMENTAL_AT = 16;
/** When the cost panel opens. */
const PANEL_AT = 18.2;

// --- what the simulation produces -----------------------------------------

/** Where a read ends up, and what it costs once it gets there. */
interface Outcome {
  /** The store it is routed to, which decides both its lane and its plan. */
  store: 'base' | 'view';
  across: number;
  arriveAt: number;
  resolveAt: number;
  /** True when it read the base tables, which is what the halo marks. */
  slow: boolean;
  /** True when the view answered it with rows a write had already replaced. */
  wrong: boolean;
}

interface WriteOutcome {
  arriveAt: number;
}

interface AttrChange {
  at: number;
  key: string;
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
  outcomes: Outcome[];
  writes: WriteOutcome[];
  /** Every hop, in the order they leave, one request group each. */
  hops: number[];
  attrs: AttrChange[];
  load: Segment[];
  time: Segment[];
  refresh: Segment[];
  costs: Segment[][];
  cues: [number, SceneCue][];
}

// --- the load meter -------------------------------------------------------

/** One stretch of work: rows read at a steady rate between two instants. */
interface Work {
  from: number;
  to: number;
  rate: number;
}

/**
 * The load meter as a continuous piecewise line.
 *
 * It climbs at the share of the database's capacity the work in flight is using
 * and drains at a fixed rate when there is none, clamped to the bar. Returning
 * the whole curve rather than a set of key frames is what lets the meter be
 * tweened without any frame being placed by hand, and what makes the two
 * refresh spikes exactly as tall as the query spikes they replaced.
 */
function loadCurve(work: Work[], end: number): Segment[] {
  const edges = new Set<number>([0, end]);
  for (const item of work) {
    if (item.from < end) edges.add(round(item.from));
    if (item.to < end) edges.add(round(item.to));
  }
  const points = [...edges].sort((left, right) => left - right);

  const segments: Segment[] = [];
  let value = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index] ?? 0;
    const to = points[index + 1] ?? 0;
    const busy = work.reduce(
      (sum, item) => (item.from <= from && item.to > from ? sum + item.rate : sum),
      0,
    );
    const slope = busy > 0 ? busy / CAPACITY : -LOAD_DRAIN;
    let at = from;
    let level = value;
    // A clamp is a kink, so the stretch is split where the bar fills or empties.
    const limit = slope > 0 ? 1 : 0;
    const reach = slope === 0 ? Infinity : at + (limit - level) / slope;
    if (reach > at && reach < to) {
      segments.push({ from: at, to: round(reach), vFrom: level, vTo: limit });
      at = round(reach);
      level = limit;
      segments.push({ from: at, to, vFrom: level, vTo: level });
    } else {
      const next = Math.max(0, Math.min(1, level + slope * (to - at)));
      segments.push({ from: at, to, vFrom: level, vTo: next });
      level = next;
    }
    value = level;
  }
  return segments;
}

// --- the simulation -------------------------------------------------------

function simulate(): Simulation {
  const outcomes: Outcome[] = READS.map(() => ({
    store: 'base' as const,
    across: ACROSS_BASE,
    arriveAt: 0,
    resolveAt: 0,
    slow: false,
    wrong: false,
  }));
  const writes: WriteOutcome[] = WRITES.map(() => ({ arriveAt: 0 }));
  const hops: number[] = [];

  const raw: AttrChange[] = [];
  const cues: [number, SceneCue][] = [];
  const work: Work[] = [];
  const time: Segment[] = [];
  const refresh: Segment[] = [];
  const costs: Segment[][] = [[], [], []];

  const setAttr = (at: number, key: string, name: string, value: string): void => {
    raw.push({ at: round(at), key, name, value });
  };
  const cue = (at: number, name: SceneCue): void => {
    cues.push([round(at), name]);
  };

  /**
   * The bar in the node: it fills for as long as the query runs, then drops.
   * A query that starts while the last one is still dropping cuts that drop
   * short, so the bar is never the sum of two tweens fighting over one width.
   */
  const runBar = (from: number, duration: number): void => {
    const start = round(from);
    const previous = time[time.length - 1];
    if (previous && previous.to > start) previous.to = start;
    const width = round((duration / SLOWEST_QUERY) * TIME_W);
    time.push({ from: start, to: round(start + duration), vFrom: 0, vTo: width });
    time.push({
      from: round(start + duration),
      to: round(start + duration + BAR_RESET),
      vFrom: width,
      vTo: 0,
    });
  };

  /** Lighting the tables a plan reads, each for as long as its rows take. */
  const lightTables = (from: number, indices: number[]): void => {
    let at = from;
    for (const index of indices) {
      const rows = TABLE_ROWS[index] ?? 0;
      const until = round(at + rows / SCAN_RATE);
      setAttr(at, `table-${index + 1}`, 'data-table', 'scan');
      setAttr(until, `table-${index + 1}`, 'data-table', 'idle');
      at = until;
    }
  };

  // --- state the simulation carries ---------------------------------------

  /** Rows in `orders`, which every write adds one to. */
  let orders = TABLE_ROWS[0] ?? 0;
  /** Rows the view is behind by, and how many of those are already crossing. */
  let behind = 0;
  let inFlight = 0;
  /** Reads the view answered instead of the base tables. */
  let saved = 0;
  /** Whether the view exists and can be read. */
  let usable = false;
  /** Whether a write books its own hop rather than waiting for the timer. */
  let incremental = false;

  /** Rows per dashboard query, tallied on each side of the view being built. */
  let beforeRows = 0;
  let beforeCount = 0;
  let afterRows = 0;
  let afterCount = 0;
  /** Rows a refresh re-reads, tallied over the refreshes the scene runs. */
  let refreshRows = 0;
  let refreshCount = 0;

  const totalRows = (): number => orders + (TABLE_ROWS[1] ?? 0) + (TABLE_ROWS[2] ?? 0);

  /**
   * Staleness as the reader sees it: rows that have landed and are not on their
   * way across. A row crossing the route is late rather than forgotten, so the
   * view keeps saying `fresh` while `behind` counts it.
   */
  const writeLag = (at: number): void => {
    setAttr(at, 'stage', 'data-behind', String(Math.min(behind, BEHIND_MAX)));
    if (!usable) return;
    setAttr(at, 'stage', 'data-view', behind - inFlight > 0 ? 'stale' : 'fresh');
  };

  const { schedule, drain } = createScheduler();

  /** A refresh: it re-reads every base row and rewrites the view's thirty. */
  const runRefresh = (at: number, first: boolean): void => {
    const rows = totalRows();
    const duration = round(rows / SCAN_RATE);
    const done = round(at + duration);
    refreshRows += rows;
    refreshCount += 1;

    setAttr(at, 'stage', 'data-refresh', 'full');
    setAttr(done, 'stage', 'data-refresh', 'off');
    if (first) setAttr(at, 'stage', 'data-view', 'building');
    lightTables(at, [0, 1, 2]);
    work.push({ from: at, to: done, rate: SCAN_RATE });
    refresh.push({ from: at, to: done, vFrom: 0, vTo: ROUTE_W });
    refresh.push({ from: done, to: round(done + BAR_RESET), vFrom: ROUTE_W, vTo: 0 });
    cue(at, 'trip');

    schedule(done, () => {
      usable = true;
      // Everything that had landed by now is in the rows the refresh just wrote.
      behind = inFlight;
      setAttr(done, 'stage', 'data-plan', 'read');
      setAttr(done, 'stage', 'data-view', 'fresh');
      writeLag(done);
      cue(done, 'trip');
      if (first) setAttr(done, 'stage', 'data-timer', 'on');
    });
  };

  schedule(BUILD_AT, () => runRefresh(BUILD_AT, true));

  schedule(TIMER_AT, () => {
    setAttr(TIMER_AT, 'stage', 'data-timer', 'off');
    runRefresh(TIMER_AT, false);
  });

  schedule(INCREMENTAL_AT, () => {
    incremental = true;
    cue(INCREMENTAL_AT, 'trip');
  });

  schedule(PANEL_AT, () => {
    setAttr(PANEL_AT, 'stage', 'data-panel', 'on');
    cue(PANEL_AT, 'state');
  });

  // --- the writes ---------------------------------------------------------

  WRITES.forEach((start, index) => {
    const arriveAt = round(start + DROP_TO_RAIL + ACROSS_BASE + DROP_TO_STORE);
    const outcome = writes[index];
    if (!outcome) return;
    outcome.arriveAt = arriveAt;

    schedule(arriveAt, () => {
      orders += 1;
      behind += 1;
      setAttr(arriveAt, 'stage', 'data-orders', String(Math.min(orders - (TABLE_ROWS[0] ?? 0), WRITE_COUNT)));
      setAttr(arriveAt, 'table-1', 'data-table', 'write');
      setAttr(round(arriveAt + WRITE_FLASH), 'table-1', 'data-table', 'idle');
      cue(arriveAt, 'state');

      if (!incremental) {
        writeLag(arriveAt);
        return;
      }
      // Per-write refresh: the row books its own crossing straight away.
      inFlight += 1;
      const landAt = round(arriveAt + HOP);
      hops.push(arriveAt);
      writeLag(arriveAt);
      setAttr(arriveAt, 'stage', 'data-refresh', 'inc');
      setAttr(landAt, 'stage', 'data-refresh', 'off');
      work.push({ from: arriveAt, to: landAt, rate: 1 / HOP });

      schedule(landAt, () => {
        inFlight -= 1;
        behind -= 1;
        writeLag(landAt);
        cue(landAt, 'trip');
      });
    });
  });

  // --- the reads ----------------------------------------------------------

  READS.forEach((plan, index) => {
    const outcome = outcomes[index];
    if (!outcome) return;
    // The store is chosen when the read reaches the rail, so a view that is
    // still being built is not one the reader can be sent to.
    const decideAt = round(plan.start + DROP_TO_RAIL);

    schedule(decideAt, () => {
      const useView = usable && plan.adHoc !== true;
      outcome.store = useView ? 'view' : 'base';
      outcome.across = useView ? ACROSS_VIEW : ACROSS_BASE;
      const arriveAt = round(decideAt + outcome.across + DROP_TO_STORE);
      outcome.arriveAt = arriveAt;

      const rows = useView ? VIEW_ROW_COUNT : plan.adHoc === true ? totalRows() - orders : totalRows();
      const rate = useView ? READ_RATE : SCAN_RATE;
      const duration = round(rows / rate);
      const resolveAt = round(arriveAt + duration);
      outcome.resolveAt = resolveAt;
      outcome.slow = !useView;

      work.push({ from: arriveAt, to: resolveAt, rate });
      runBar(arriveAt, duration);

      if (useView) {
        setAttr(arriveAt, 'stage', 'data-read', 'on');
        setAttr(resolveAt, 'stage', 'data-read', 'off');
        // The view answers with the rows it holds, so a read that arrives while
        // rows are missing gets an answer that is visibly out of date.
        outcome.wrong = behind - inFlight > 0;
        saved += 1;
        setAttr(resolveAt, 'stage', 'data-saved', String(Math.min(saved, SAVED_MAX)));
      } else {
        lightTables(arriveAt, plan.adHoc === true ? [1, 2] : [0, 1, 2]);
        if (plan.adHoc === true) {
          setAttr(arriveAt, 'stage', 'data-plan', 'adhoc');
          setAttr(resolveAt, 'stage', 'data-plan', usable ? 'read' : 'scan');
        }
      }

      if (plan.adHoc !== true) {
        if (usable) {
          afterRows += rows;
          afterCount += 1;
        } else {
          beforeRows += rows;
          beforeCount += 1;
        }
      }

      schedule(resolveAt, () => {
        cue(resolveAt, outcome.wrong ? 'failure' : 'success');
      });
    });
  });

  drain();

  // --- the cost panel, once every query has been counted ------------------

  /**
   * The three bars are the scene's own tallies, each scaled to the largest
   * value it reaches: rows a dashboard query read before the view existed
   * against what one reads now, rows a refresh re-reads, and rows stored.
   */
  const beforeQuery = beforeCount > 0 ? beforeRows / beforeCount : 0;
  const afterQuery = afterCount > 0 ? afterRows / afterCount : 0;
  const meanRefresh = refreshCount > 0 ? refreshRows / refreshCount : 0;
  const PANEL_SWING = 0.8;
  const bar = (value: number, max: number): number => round((value / max) * PANEL_W);

  const pairs: [number, number][] = [
    [0, bar(VIEW_ROW_COUNT, VIEW_ROW_COUNT)],
    [0, bar(meanRefresh, SCAN_TOTAL)],
    [bar(beforeQuery, SCAN_TOTAL), bar(afterQuery, SCAN_TOTAL)],
  ];
  pairs.forEach((pair, index) => {
    costs[index]?.push({
      from: PANEL_AT,
      to: round(PANEL_AT + PANEL_SWING),
      vFrom: pair[0],
      vTo: pair[1],
    });
  });

  // The query bar keeps reading the last query once the comparison has played,
  // which is what puts the ad-hoc scan back on it at the end of the scene.
  let queryAt = round(PANEL_AT + PANEL_SWING);
  let queryWidth = pairs[2]?.[1] ?? 0;
  for (const outcome of outcomes) {
    if (outcome.resolveAt <= queryAt) continue;
    const rows =
      outcome.store === 'view'
        ? VIEW_ROW_COUNT
        : (outcome.resolveAt - outcome.arriveAt) * SCAN_RATE;
    const width = bar(rows, SCAN_TOTAL);
    if (width === queryWidth) continue;
    costs[2]?.push({
      from: outcome.resolveAt,
      to: round(outcome.resolveAt + BAR_RESET),
      vFrom: queryWidth,
      vTo: width,
    });
    queryAt = round(outcome.resolveAt + BAR_RESET);
    queryWidth = width;
  }

  // --- the meters ---------------------------------------------------------

  const load = loadCurve(work, SCENE_DURATION).map((segment) => ({
    from: segment.from,
    to: segment.to,
    vFrom: round(segment.vFrom * LOAD_W),
    vTo: round(segment.vTo * LOAD_W),
  }));

  // --- put the discrete changes in time order -----------------------------

  const inTimeOrder = raw
    .map((entry, order) => ({ entry, order }))
    .sort((left, right) => left.entry.at - right.entry.at || left.order - right.order)
    .map(({ entry }) => entry);

  const folded: AttrChange[] = [];
  for (const entry of inTimeOrder) {
    collapseAtInstant(folded, entry, (change) => `${change.key}@${change.name}`);
  }

  const seen = new Map<string, string>(Object.entries(STAGE_STATE));
  const attrs: AttrChange[] = [];
  for (const change of folded) {
    const id = `${change.key}@${change.name}`;
    if (seen.get(id) === change.value) continue;
    seen.set(id, change.value);
    attrs.push(change);
  }

  cues.sort((left, right) => left[0] - right[0]);

  return { outcomes, writes, hops, attrs, load, time, refresh, costs, cues };
}

// --- the timeline ---------------------------------------------------------

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const targets: Record<string, Element> = { stage };
  for (let index = 1; index <= TABLE_ROWS.length; index += 1) {
    targets[`table-${index}`] = q<SVGGElement>(stage, `.mv-table--${index}`, ID);
  }
  const timeFill = q<SVGRectElement>(stage, '.mv-time-fill', ID);
  const loadFill = q<SVGRectElement>(stage, '.mv-load-fill', ID);
  const refreshFill = q<SVGRectElement>(stage, '.mv-refresh-fill', ID);
  const costFills = [1, 2, 3].map((n) => q<SVGRectElement>(stage, `.mv-cost-${n}-fill`, ID));
  const ring = q<SVGCircleElement>(stage, '.mv-timer-progress', ID);
  const layer = q<SVGGElement>(stage, '.scene-requests', ID);

  const sim = simulate();
  const parts = mountRequests(layer, READS.length + WRITES.length + sim.hops.length, ID);
  const reads = parts.slice(0, READS.length);
  const writes = parts.slice(READS.length, READS.length + WRITES.length);
  const hops = parts.slice(READS.length + WRITES.length);

  const tl = createSceneTimeline();

  // --- discrete state -----------------------------------------------------

  for (const change of sim.attrs) {
    const element = targets[change.key];
    if (!element) continue;
    attr(tl, element, change.name, change.value, change.at);
  }

  // --- the bars -----------------------------------------------------------

  const widen = (element: Element, segments: { from: number; to: number; vFrom: number; vTo: number }[]): void => {
    for (const segment of segments) {
      if (segment.to <= segment.from || segment.vFrom === segment.vTo) continue;
      tl.fromTo(
        element,
        { attr: { width: segment.vFrom } },
        {
          attr: { width: segment.vTo },
          duration: segment.to - segment.from,
          ease: 'none',
          immediateRender: false,
        },
        segment.from,
      );
    }
  };

  widen(timeFill, sim.time);
  widen(loadFill, sim.load);
  widen(refreshFill, sim.refresh);
  sim.costs.forEach((segments, index) => {
    const element = costFills[index];
    if (element) widen(element, segments);
  });

  // --- the refresh timer --------------------------------------------------

  // The ring starts when the view is first fresh and completes when the timer
  // fires, so the arc is the interval rather than a number chosen to look right.
  const ringFrom = round(BUILD_AT + SCAN_TOTAL / SCAN_RATE);
  const circumference = Number(ring.getAttribute('stroke-dasharray') ?? 0);
  tl.fromTo(
    ring,
    { attr: { 'stroke-dashoffset': circumference } },
    {
      attr: { 'stroke-dashoffset': 0 },
      duration: TIMER_AT - ringFrom,
      ease: 'none',
      immediateRender: false,
    },
    ringFrom,
  );

  // --- what travels -------------------------------------------------------

  const move = (target: RequestParts, vars: gsap.TweenVars, duration: number, at: number): void => {
    tl.to(target.group, { ...vars, duration, ease: 'none', immediateRender: false }, at);
  };

  READS.forEach((plan, index) => {
    const request = reads[index];
    const outcome = sim.outcomes[index];
    if (!request || !outcome) return;

    const lane = outcome.store === 'view' ? X_VIEW : X_BASE;
    const decideAt = round(plan.start + DROP_TO_RAIL);
    // The three legs meet at the instants the simulation rounded to, so the
    // corner is one point rather than two legs overlapping by a fraction of it.
    const turnAt = round(decideAt + outcome.across);
    parkRequest(request, X_TRUNK, Y_CLIENT);

    showRequest(tl, request, plan.start);
    move(request, { y: Y_RAIL }, decideAt - plan.start, plan.start);
    move(request, { x: lane }, turnAt - decideAt, decideAt);
    move(request, { y: Y_ARRIVE }, outcome.arriveAt - turnAt, turnAt);

    // A read that had to go through the base tables is ringed while it waits,
    // which is the only difference the reader can see between the two plans.
    if (outcome.slow) haloRequest(tl, request, outcome.arriveAt, outcome.resolveAt, FADE);

    markRequest(tl, request, outcome.wrong ? 'fail' : 'ok', outcome.resolveAt);
    hideRequest(tl, request, outcome.resolveAt, FADE);
  });

  WRITES.forEach((start, index) => {
    const request = writes[index];
    const outcome = sim.writes[index];
    if (!request || !outcome) return;

    const square = attachToRequest(request, 'rect', {
      class: 'scene-req-square mv-write',
      x: '-15',
      y: '-15',
      width: '30',
      height: '30',
      rx: '6',
    });
    parkRequest(request, X_TRUNK, Y_CLIENT);
    gsap.set(request.dot, { opacity: 0 });
    gsap.set(square, { opacity: 1 });

    const decideAt = round(start + DROP_TO_RAIL);
    const turnAt = round(decideAt + ACROSS_BASE);
    showRequest(tl, request, start);
    move(request, { y: Y_RAIL }, decideAt - start, start);
    move(request, { x: X_BASE }, turnAt - decideAt, decideAt);
    move(request, { y: Y_ARRIVE }, outcome.arriveAt - turnAt, turnAt);
    hideRequest(tl, request, outcome.arriveAt, WRITE_FADE);
  });

  sim.hops.forEach((start, index) => {
    const request = hops[index];
    if (!request) return;

    const diamond = attachToRequest(request, 'path', {
      class: 'mv-hop',
      d: 'M 0 -16 L 16 0 L 0 16 L -16 0 Z',
    });
    parkRequest(request, X_ROUTE_FROM, Y_ROUTE);
    gsap.set(request.dot, { opacity: 0 });
    gsap.set(diamond, { opacity: 1 });

    showRequest(tl, request, start);
    move(request, { x: X_ROUTE_TO }, HOP, start);
    hideRequest(tl, request, round(start + HOP), WRITE_FADE);
  });

  // --- sound --------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels --------------------------------------------------------

  // The stage is complete on the first frame: three base tables with their row
  // counts, an outline where the view will be, and a plan that scans.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
