import gsap from 'gsap';
import {
  LARGE_ROWS,
  SCENE_DURATION,
  SMALL_ROWS,
  TIME_CELL,
  TIME_CELLS,
  Y_CLIENT,
  Y_DB,
} from './stage';
import { q, qa } from '../shared/dom';
import {
  attachToRequest,
  hideRequest,
  mountRequests,
  moveRequest,
  parkRequest,
  showRequest,
} from '../shared/request';
import type { SceneBuildOptions, SceneInstance, SceneModule, SceneStep } from '../types';

/**
 * N+1 Query scene: a 24 second, four step timeline.
 *
 * Same two rules as the other scenes: every tween sits at an absolute position,
 * and every discrete change is a zero-duration tween on a `data-*` attribute
 * that GSAP reverts when the playhead moves back past it.
 *
 * Nothing about the counters is authored. Each query is one dot; the simulation
 * counts them as they pass the node, counts the round trips as they reach the
 * database, and grows the time bar by what each trip costs. The point of the
 * scene falls out of that arithmetic rather than being asserted: the same code
 * over twenty rows makes twenty-one trips, and the bar runs off the end.
 */

const ID = 'n-plus-1-query';

/** The lane every query travels along. */
const X = 540;
/** y of the node a query passes on its way down. */
const Y_NODE = 1075;

/** How long a counter or log line takes to appear. Zero: they are attributes. */
const TIME_GROW = 0.2;

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

interface QueryPlan {
  start: number;
  /** Legs: app to node, node to database, database back to app. */
  toNode: number;
  toDb: number;
  toApp: number;
  /** Index into the stage's log lines, or -1 for a query that adds no line. */
  log: number;
  /** Cells of time this round trip costs. */
  cost: number;
  /** Height of the result chip it carries home. */
  chip: number;
  /** What the result does to the list. */
  loadsRows?: boolean;
  fillsSlot?: number;
  fillsAll?: boolean;
}

const query = (start: number, extra: Partial<QueryPlan> = {}): QueryPlan => ({
  start,
  toNode: 0.4,
  toDb: 0.4,
  toApp: 0.6,
  log: -1,
  cost: 1,
  chip: 6,
  ...extra,
});

const QUERIES: QueryPlan[] = [
  // Step 1: one query for the list, then one per row.
  query(0.4, { log: 0, chip: 10, loadsRows: true }),
  ...Array.from({ length: 5 }, (_v, i) =>
    query(round(2.1 + i * 0.6), { log: i + 1, chip: 5, fillsSlot: i }),
  ),
  // Step 2: the same shape over twenty rows, and much faster arrivals.
  query(6.3, { toNode: 0.15, toDb: 0.15, toApp: 0.3, log: 6, chip: 12, loadsRows: true }),
  ...Array.from({ length: LARGE_ROWS }, (_v, i) =>
    query(round(6.9 + i * 0.2), {
      toNode: 0.2,
      toDb: 0.2,
      toApp: 0.2,
      log: i < 5 ? i + 7 : i === 5 ? 12 : -1,
      chip: 4,
      fillsSlot: i,
    }),
  ),
  // Step 3: one query with a join, and a fatter result.
  query(12.5, { toApp: 0.9, log: 13, cost: 1.5, chip: 26, loadsRows: true, fillsAll: true }),
  // Step 4: a projection carries only the columns that are used.
  query(18.4, { toApp: 0.7, log: 14, chip: 8, loadsRows: true, fillsAll: true }),
  // Step 4: a list query and one batched lookup.
  query(20.6, { toNode: 0.2, toDb: 0.2, toApp: 0.2, log: 15, chip: 6, loadsRows: true }),
  query(21.4, { toNode: 0.4, toDb: 0.2, toApp: 0.4, log: 16, chip: 8, fillsAll: true }),
];

interface ResetSpec {
  at: number;
  rows: number;
  mode: string;
}

/** The moments the scene starts a fresh demonstration. */
const RESETS: ResetSpec[] = [
  { at: 6, rows: LARGE_ROWS, mode: 'none' },
  { at: 12, rows: LARGE_ROWS, mode: 'include' },
  { at: 18, rows: LARGE_ROWS, mode: 'select' },
  { at: 20.6, rows: LARGE_ROWS, mode: 'in' },
];

/** When the database finally buckles, at the end of step 2. */
const SHAKE_AT = 11.3;

function round(value: number): number {
  return Number(value.toFixed(3));
}

const fadeAt = (home: number): number => Math.max(0.05, Math.min(0.15, SCENE_DURATION - home));

interface Simulation {
  queries: [number, number][];
  trips: [number, number][];
  overflow: [number, string][];
  rows: [number, number][];
  mode: [number, string][];
  /** Width of the time bar, as `[time, cells]` steps. */
  time: [number, number][];
  /** Log lines becoming visible or being cleared. */
  log: { at: number; line: number; shown: number }[];
  /** Row boxes and customer slots, per list. */
  rowState: { at: number; large: boolean; index: number; on: number }[];
  slotState: { at: number; large: boolean; index: number; on: number }[];
  /** Per query: when it reaches the node, the database, and home. */
  legs: { atNode: number; atDb: number; atHome: number }[];
}

/**
 * Counts what the code actually costs. Queries are counted as they pass the
 * node, round trips as they reach the database, and the bar grows by whatever
 * each trip is worth.
 */
function simulate(): Simulation {
  const queries: [number, number][] = [];
  const trips: [number, number][] = [];
  const overflow: [number, string][] = [];
  const rows: [number, number][] = [];
  const mode: [number, string][] = [];
  const time: [number, number][] = [];
  const log: { at: number; line: number; shown: number }[] = [];
  const rowState: { at: number; large: boolean; index: number; on: number }[] = [];
  const slotState: { at: number; large: boolean; index: number; on: number }[] = [];
  const legs: { atNode: number; atDb: number; atHome: number }[] = [];

  let queryCount = 0;
  let tripCount = 0;
  let cells = 0;
  let large = false;
  const shownLines = new Set<number>();

  /*
   * Two changes to the same thing at one instant would render in insertion
   * order going forwards and in reverse going backwards, so that frame would
   * depend on which way the reader scrubbed. Collapse them.
   */
  const pushPair = <T>(series: [number, T][], at: number, next: T): void => {
    const previous = series[series.length - 1];
    if (previous && previous[0] === at) previous[1] = next;
    else series.push([at, next]);
  };
  const pushKeyed = <T extends { at: number }>(series: T[], entry: T, same: (a: T, b: T) => boolean): void => {
    for (let i = series.length - 1; i >= 0; i -= 1) {
      const candidate = series[i];
      if (!candidate || candidate.at !== entry.at) break;
      if (same(candidate, entry)) {
        series[i] = entry;
        return;
      }
    }
    series.push(entry);
  };
  const setLog = (at: number, line: number, shown: number): void => {
    pushKeyed(log, { at, line, shown }, (a, b) => a.line === b.line);
    if (shown) shownLines.add(line);
    else shownLines.delete(line);
  };
  const setRow = (at: number, index: number, on: number): void => {
    pushKeyed(rowState, { at, large, index, on }, (a, b) => a.large === b.large && a.index === b.index);
  };
  const setSlot = (at: number, index: number, on: number): void => {
    pushKeyed(slotState, { at, large, index, on }, (a, b) => a.large === b.large && a.index === b.index);
  };

  interface Task {
    at: number;
    order: number;
    run: () => void;
  }
  const tasks: Task[] = [];
  let order = 0;
  const schedule = (at: number, run: () => void): void => {
    order += 1;
    tasks.push({ at: round(at), order, run });
  };

  pushPair(rows, 0, SMALL_ROWS);
  pushPair(mode, 0, 'none');
  pushPair(queries, 0, 0);
  pushPair(trips, 0, 0);
  pushPair(time, 0, 0);
  pushPair(overflow, 0, 'off');

  for (const reset of RESETS) {
    schedule(reset.at, () => {
      queryCount = 0;
      tripCount = 0;
      cells = 0;
      pushPair(queries, reset.at, 0);
      pushPair(trips, reset.at, 0);
      pushPair(time, reset.at, 0);
      pushPair(overflow, reset.at, 'off');
      pushPair(mode, reset.at, reset.mode);
      // Clearing the list means clearing whichever list is on screen.
      const count = large ? LARGE_ROWS : SMALL_ROWS;
      for (let i = 0; i < count; i += 1) {
        setRow(reset.at, i, 0);
        setSlot(reset.at, i, 0);
      }
      for (const line of Array.from(shownLines)) setLog(reset.at, line, 0);
      if (reset.rows !== (large ? LARGE_ROWS : SMALL_ROWS)) {
        large = reset.rows === LARGE_ROWS;
        pushPair(rows, reset.at, reset.rows);
      }
    });
  }

  for (const plan of QUERIES) {
    const atNode = round(plan.start + plan.toNode);
    const atDb = round(atNode + plan.toDb);
    const atHome = round(atDb + plan.toApp);
    legs.push({ atNode, atDb, atHome });

    schedule(atNode, () => {
      queryCount += 1;
      pushPair(queries, atNode, queryCount);
      if (plan.log >= 0) setLog(atNode, plan.log, 1);
    });

    schedule(atDb, () => {
      tripCount += 1;
      cells += plan.cost;
      pushPair(trips, atDb, tripCount);
      pushPair(time, atDb, Math.min(cells, TIME_CELLS));
      if (cells > TIME_CELLS) pushPair(overflow, atDb, 'on');
    });

    schedule(atHome, () => {
      const count = large ? LARGE_ROWS : SMALL_ROWS;
      if (plan.loadsRows) for (let i = 0; i < count; i += 1) setRow(atHome, i, 1);
      if (plan.fillsAll) for (let i = 0; i < count; i += 1) setSlot(atHome, i, 1);
      if (plan.fillsSlot !== undefined) setSlot(atHome, plan.fillsSlot, 1);
    });
  }

  const done = new Set<Task>();
  for (;;) {
    let next: Task | undefined;
    for (const task of tasks) {
      if (done.has(task)) continue;
      if (!next || task.at < next.at || (task.at === next.at && task.order < next.order)) next = task;
    }
    if (!next) break;
    done.add(next);
    next.run();
  }

  return { queries, trips, overflow, rows, mode, time, log, rowState, slotState, legs };
}

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const smallRows = qa<SVGRectElement>(stage, '.nq-list--small .nq-row-box');
  const smallSlots = qa<SVGRectElement>(stage, '.nq-list--small .nq-slot');
  const largeRows = qa<SVGRectElement>(stage, '.nq-list--large .nq-row-box');
  const largeSlots = qa<SVGRectElement>(stage, '.nq-list--large .nq-slot');
  const logEls = qa<SVGTextElement>(stage, '.nq-log');
  const timeFill = q<SVGRectElement>(stage, '.nq-time-fill', ID);
  const dbBox = q<SVGGElement>(stage, '.nq-db', ID);
  const requestLayer = q<SVGGElement>(stage, '.scene-requests', ID);

  const sim = simulate();
  const requests = mountRequests(requestLayer, QUERIES.length, ID);

  const tl = gsap.timeline({ paused: true });

  const attr = (name: string, value: string, at: number): void => {
    tl.set(stage, { attr: { [name]: value }, immediateRender: false }, at);
  };

  // --- counters, log and list, straight from the simulation ---------------

  for (const [at, value] of sim.queries) attr('data-queries', String(value), at);
  for (const [at, value] of sim.trips) attr('data-trips', String(value), at);
  for (const [at, value] of sim.overflow) attr('data-overflow', value, at);
  for (const [at, value] of sim.rows) attr('data-rows', String(value), at);
  for (const [at, value] of sim.mode) {
    attr('data-mode', value, at);
    if (value !== 'none') tl.call(() => cue('trip'), undefined, at);
  }

  for (const entry of sim.log) {
    const element = logEls[entry.line];
    if (!element) continue;
    tl.set(element, { attr: { 'data-log-shown': String(entry.shown) }, immediateRender: false }, entry.at);
  }
  for (const entry of sim.rowState) {
    const element = (entry.large ? largeRows : smallRows)[entry.index];
    if (!element) continue;
    tl.set(element, { attr: { 'data-row-loaded': String(entry.on) }, immediateRender: false }, entry.at);
  }
  for (const entry of sim.slotState) {
    const element = (entry.large ? largeSlots : smallSlots)[entry.index];
    if (!element) continue;
    tl.set(element, { attr: { 'data-slot-filled': String(entry.on) }, immediateRender: false }, entry.at);
  }

  // The bar is the only thing here that measures what the code really costs.
  for (const [at, cells] of sim.time) {
    const width = round(cells * TIME_CELL);
    if (cells === 0) tl.set(timeFill, { attr: { width: 0 }, immediateRender: false }, at);
    else {
      tl.to(
        timeFill,
        { attr: { width }, duration: TIME_GROW, ease: 'power2.out', immediateRender: false },
        at,
      );
    }
  }

  // --- queries --------------------------------------------------------------

  QUERIES.forEach((plan, index) => {
    const parts = requests[index];
    const leg = sim.legs[index];
    if (!parts || !leg) return;
    parkRequest(parts, X, Y_CLIENT);
    showRequest(tl, parts, plan.start);

    // The result comes back as a chip as thick as the rows it is carrying.
    const chip = attachToRequest(parts, 'rect', {
      class: 'scene-req-chip-box',
      x: '-15',
      y: String(-plan.chip / 2),
      width: '30',
      height: String(plan.chip),
      rx: '3',
    });

    moveRequest(tl, parts, Y_NODE, plan.toNode, plan.start);
    moveRequest(tl, parts, Y_DB, plan.toDb, leg.atNode);
    tl.call(() => cue('state'), undefined, leg.atDb);
    // On the way back it is a result, not a query.
    tl.set(parts.dot, { opacity: 0, immediateRender: false }, leg.atDb);
    tl.set(chip, { opacity: 1, immediateRender: false }, leg.atDb);
    moveRequest(tl, parts, Y_CLIENT, plan.toApp, leg.atDb);
    tl.call(() => cue('success'), undefined, leg.atHome);
    hideRequest(tl, parts, leg.atHome, fadeAt(leg.atHome));
  });

  // The database finally buckles under twenty-one round trips.
  tl.to(dbBox, { x: 9, duration: 0.07, repeat: 5, yoyo: true, ease: 'none' }, SHAKE_AT);
  tl.call(() => cue('failure'), undefined, SHAKE_AT);

  // --- step labels ---------------------------------------------------------

  // The stage is complete on the first frame: five empty rows, nothing counted.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  // Pin the total length so the scrub bar covers the closing hold.
  tl.to({}, { duration: 0.01 }, SCENE_DURATION - 0.01);

  // Render once in each direction so every zero-duration tween records its
  // start value before a reader can scrub backwards past it.
  tl.progress(1, true).progress(0, true).pause();

  return { tl, steps: STEPS };
}

const scene: SceneModule = {
  id: ID,
  duration: SCENE_DURATION,
  build,
};

export default scene;
