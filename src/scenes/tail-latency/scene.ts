import {
  BAR_HEIGHT,
  BAR_STEP,
  BAR_X,
  BAR_Y,
  FALLBACK_MS,
  HEDGE_BUDGET_PERCENT,
  MS_PX,
  MS_SEC,
  SCENE_DURATION,
  STAGE_STATE,
  TARGET_MS,
  TIMEOUT_MS,
  TRAVEL,
  X_LANE,
  X_REPLICA_B,
  Y_CLIENT,
  Y_REPLICA,
  Y_REPLICA_EDGE,
  Y_SERVICE,
  msToX,
} from './stage';
import { q, qa } from '../shared/dom';
import {
  haloRequest,
  hideRequest,
  markRequest,
  mountRequests,
  moveRequest,
  parkRequest,
  showRequest,
} from '../shared/request';
import { collapseAtInstant } from '../shared/simulation';
import { attr, fadeAt, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Tail Latency scene: a 24 second, four step timeline.
 *
 * Same two rules as the other scenes: every tween sits at an absolute position,
 * and every discrete change is a zero-duration tween on a `data-*` attribute
 * that GSAP reverts when the playhead moves back past it.
 *
 * The chart is measured, not drawn. One list of latencies per step is the only
 * authored thing here; a bar's length, the seconds it takes to grow, where the
 * mean and the three percentile lines stand, how long a hedge waits before it
 * fires, how long a page waits for its slowest call, and whether the SLO is met
 * all fall out of that list through `MS_PX`, `MS_SEC` and `percentile`. Move a
 * number in `STEP_ONE` and every line that reads it moves with it.
 *
 * Like Rate Limiter and Bulkhead, this scene builds its events first, sorts
 * once and walks the result, rather than using `createScheduler`. Nothing here
 * books an event at a time that is not already known: a hedge fires exactly one
 * hedge delay after its page arrives, and the budget it is checked against is
 * decided by the pages before it. What does need ordering is the running
 * sample, because the percentile lines have to see the bars in the order they
 * settled, and a sort by settle time gives that directly.
 */

const ID = 'tail-latency';

/** Anything this slow or slower is what the tail is about. */
const SLOW_MS = TARGET_MS;

/** Seconds between two requests of the same stream. */
const REQUEST_GAP = 0.18;

/** Calls one page fans out to. */
const CALLS_PER_PAGE = 10;

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

/**
 * Twenty latencies in the order they arrive: nineteen ordinary ones and one
 * that is nearly ten times the median. Steps 1 and 4 measure this same list, so
 * the only difference the reader sees in step 4 is what the timeout does to it.
 */
const STEP_ONE = [44, 38, 51, 41, 35, 57, 43, 46, 33, 49, 55, 36, 42, 400, 31, 53, 45, 58, 40, 48];

/** Where the two streams start. Step 4 repeats step 1 against a timeout. */
const STEP_ONE_START = 0.3;
const STEP_FOUR_START = 18.3;

interface PagePlan {
  /** When the page's request leaves the client. */
  start: number;
  /** One latency per call, in call order. */
  calls: number[];
  /** What a second copy of a slow call costs, when one is sent. */
  hedgeMs: number;
}

/** Step 2: three pages of ten, each waiting on its slowest call. */
const FAN_OUT_PAGES: PagePlan[] = [
  { start: 6.15, calls: [44, 38, 51, 41, 35, 57, 400, 46, 33, 49], hedgeMs: 0 },
  { start: 8.65, calls: [42, 36, 48, 31, 53, 45, 58, 40, 34, 47], hedgeMs: 0 },
  { start: 9.75, calls: [39, 43, 300, 37, 50, 44, 32, 55, 41, 46], hedgeMs: 0 },
];

/** Step 3: the same shape, with a slow call raced against the other replica. */
const HEDGED_PAGES: PagePlan[] = [
  { start: 12.15, calls: [43, 37, 49, 41, 35, 52, 380, 45, 33, 47], hedgeMs: 90 },
  { start: 13.7, calls: [40, 44, 400, 38, 51, 34, 46, 57, 42, 36], hedgeMs: 84 },
  { start: 15.25, calls: [41, 45, 39, 390, 48, 33, 55, 43, 37, 50], hedgeMs: 96 },
];

/** When the chart is wiped: the start of a step, or of a page inside one. */
const RESET_STEP_TWO = 6;
const RESET_STEP_THREE = 12;
const RESET_STEP_FOUR = 18;
const RESETS = [
  RESET_STEP_TWO,
  FAN_OUT_PAGES[1]?.start ?? 0,
  FAN_OUT_PAGES[2]?.start ?? 0,
  RESET_STEP_THREE,
  HEDGED_PAGES[1]?.start ?? 0,
  HEDGED_PAGES[2]?.start ?? 0,
  RESET_STEP_FOUR,
];

/** When step 4 announces its verdict, which is after the last request is home. */
const VERDICT_AT = 22.9;
/** How long a percentile line stays thickened after it has been read out. */
const HOT_FOR = 0.8;

// --- statistics -----------------------------------------------------------

/**
 * Nearest rank, which is what a metrics backend does when it reads a histogram:
 * the p-th percentile is the smallest observation with at least p per cent of
 * the sample at or below it. With twenty samples p99 is the largest of them,
 * which is the whole point of the scene.
 */
function percentile(values: readonly number[], p: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) return 0;
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil((p / 100) * sorted.length)));
  return sorted[rank - 1] ?? 0;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

/** How long a hedge waits before it sends a second copy: the measured p95. */
const HEDGE_DELAY_MS = percentile(STEP_ONE, 95);

// --- what the simulation produces ----------------------------------------

type BarState = 'idle' | 'running' | 'fast' | 'slow' | 'cut' | 'hedge' | 'dropped';

interface BarRun {
  row: number;
  /** Where the bar starts on the axis. Only a hedge starts away from zero. */
  fromMs: number;
  /** How much time the bar covers. */
  ms: number;
  from: number;
  to: number;
  settled: BarState;
}

type MarkerName = 'mean' | 'p50' | 'p95' | 'p99' | 'page' | 'target';

const PERCENTILE_MARKERS = ['mean', 'p50', 'p95', 'p99'] as const;

interface MarkerUpdate {
  at: number;
  marker: MarkerName;
  x: number;
  shown: boolean;
}

/** One walk of the page marker, from zero to the answer that arrived last. */
interface PageSweep {
  at: number;
  ms: number;
}

interface RequestRun {
  kind: 'lane' | 'hedge';
  start: number;
  /** When the result marker pops. */
  turn: number;
  home: number;
  /** Seconds one leg of the journey takes. */
  leg: number;
  halo: boolean;
}

interface AttrChange {
  at: number;
  name: string;
  value: string;
}

interface ReplicaChange {
  at: number;
  replica: 'a' | 'b';
  state: 'idle' | 'busy';
}

/** Where the cross that marks a cancelled call is drawn. */
interface CancelMark {
  at: number;
  x: number;
  y: number;
}

interface Simulation {
  bars: BarRun[];
  markers: MarkerUpdate[];
  sweeps: PageSweep[];
  requests: RequestRun[];
  attrs: AttrChange[];
  replicas: ReplicaChange[];
  cancels: CancelMark[];
  cues: [number, SceneCue][];
}

/** One call of a stream, worked out before anything is sorted. */
interface StreamCall {
  row: number;
  arrive: number;
  settle: number;
  /** What the caller actually waited, which a timeout caps. */
  answer: number;
  cut: boolean;
}

// --- the simulation -------------------------------------------------------

function simulate(): Simulation {
  const bars: BarRun[] = [];
  const sweeps: PageSweep[] = [];
  const requests: RequestRun[] = [];
  const replicas: ReplicaChange[] = [];
  const cancels: CancelMark[] = [];
  const cues: [number, SceneCue][] = [];

  /** Raw changes, in the order they were worked out rather than in time order. */
  const rawAttrs: AttrChange[] = [];
  const rawMarkers: MarkerUpdate[] = [];

  const cue = (at: number, name: SceneCue): void => {
    cues.push([round(at), name]);
  };
  const setAttr = (at: number, name: string, value: string): void => {
    rawAttrs.push({ at: round(at), name, value });
  };
  const setMarker = (at: number, marker: MarkerName, x: number, shown: boolean): void => {
    rawMarkers.push({ at: round(at), marker, x, shown });
  };

  /** A request that travels down the lane and comes back with an answer. */
  const laneRequest = (start: number, turn: number, slow: boolean): void => {
    const home = round(turn + TRAVEL);
    requests.push({ kind: 'lane', start: round(start), turn: round(turn), home, leg: TRAVEL, halo: slow });
    cue(home, 'success');
  };

  const addBar = (bar: BarRun): void => {
    bars.push(bar);
    // The sound belongs to the moment the reader sees the bar stop, not to the
    // moment the simulation decided how long it would be.
    if (bar.settled === 'slow') cue(bar.to, 'failure');
  };

  // --- a stream of single requests, which is what steps 1 and 4 are -------

  const runStream = (startAt: number, latencies: readonly number[], timeout: boolean): number => {
    const calls: StreamCall[] = latencies.map((ms, index) => {
      const start = round(startAt + index * REQUEST_GAP);
      const arrive = round(start + TRAVEL);
      const cut = timeout && ms > TIMEOUT_MS;
      // A timeout does not make a call fast. The caller waits the whole timeout
      // and then pays for the fallback on top of it.
      const answer = cut ? TIMEOUT_MS + FALLBACK_MS : ms;
      const settle = round(arrive + answer * MS_SEC);

      if (cut) {
        const at = round(arrive + TIMEOUT_MS * MS_SEC);
        setAttr(at, 'data-timeout', 'on');
        setAttr(at, 'data-fallback', 'on');
        cue(at, 'trip');
      }
      laneRequest(start, settle, answer >= SLOW_MS);
      return { row: index, arrive, settle, answer, cut };
    });

    // The lines are read off the bars that have settled, in the order they
    // settled, so the reader watches the tail drag the mean and p99 rightwards.
    const samples: number[] = [];
    for (const call of [...calls].sort((left, right) => left.settle - right.settle)) {
      addBar({
        row: call.row,
        fromMs: 0,
        ms: call.answer,
        from: call.arrive,
        to: call.settle,
        settled: call.cut ? 'cut' : call.answer >= SLOW_MS ? 'slow' : 'fast',
      });
      samples.push(call.answer);
      setMarker(call.settle, 'mean', msToX(mean(samples)), true);
      setMarker(call.settle, 'p50', msToX(percentile(samples, 50)), true);
      setMarker(call.settle, 'p95', msToX(percentile(samples, 95)), true);
      setMarker(call.settle, 'p99', msToX(percentile(samples, 99)), true);
    }

    return calls.reduce((latest, call) => Math.max(latest, call.settle), startAt);
  };

  // --- pages that fan out, which is what steps 2 and 3 are ----------------

  /**
   * Runs one step's worth of pages. The hedge budget is owned here rather than
   * by the simulation, because a budget is a share of the traffic in the window
   * it is set for: step 3's thirty calls, not every call in the scene.
   */
  const runPages = (pages: readonly PagePlan[], hedging: boolean, resets: readonly number[]): void => {
    let hedgesSent = 0;
    let callsSent = 0;

    const runPage = (page: PagePlan, resetAt: number): void => {
      const arrive = round(page.start + TRAVEL);
      callsSent += CALLS_PER_PAGE;

      /** How long the page waits, which is the slowest of its ten answers. */
      let pageMs = 0;

      page.calls.forEach((ms, call) => {
        // Ten calls take every other row, which leaves the row under each of
        // them free for the second copy that may be sent after it.
        const row = call * 2;
        const slowEnough = hedging && ms > HEDGE_DELAY_MS;
        const checkAt = round(arrive + HEDGE_DELAY_MS * MS_SEC);

        // The budget counts the hedges already sent against the calls already
        // made, so it can run out part way through a step.
        const withinBudget = (hedgesSent / callsSent) * 100 <= HEDGE_BUDGET_PERCENT;

        if (!slowEnough || !withinBudget) {
          if (slowEnough) setAttr(checkAt, 'data-budget', 'on');
          const settle = round(arrive + ms * MS_SEC);
          pageMs = Math.max(pageMs, ms);
          addBar({
            row,
            fromMs: 0,
            ms,
            from: arrive,
            to: settle,
            settled: ms >= SLOW_MS ? 'slow' : 'fast',
          });
          return;
        }

        hedgesSent += 1;
        setAttr(checkAt, 'data-hedged', String(hedgesSent));
        cue(checkAt, 'state');

        const total = HEDGE_DELAY_MS + page.hedgeMs;
        const done = round(arrive + total * MS_SEC);
        pageMs = Math.max(pageMs, total);

        replicas.push({ at: checkAt, replica: 'b', state: 'busy' });
        replicas.push({ at: done, replica: 'b', state: 'idle' });

        const leg = round((page.hedgeMs * MS_SEC) / 3);
        requests.push({
          kind: 'hedge',
          start: checkAt,
          turn: round(checkAt + leg * 2),
          home: round(checkAt + leg * 3),
          leg,
          halo: true,
        });

        // The second copy answered, so the first one is cancelled where it had
        // got to: its bar keeps the length it reached and goes grey.
        addBar({ row, fromMs: 0, ms: total, from: arrive, to: done, settled: 'dropped' });
        addBar({
          row: row + 1,
          fromMs: HEDGE_DELAY_MS,
          ms: page.hedgeMs,
          from: checkAt,
          to: done,
          settled: 'hedge',
        });
        cancels.push({
          at: done,
          x: msToX(total) + 16,
          y: BAR_Y + row * BAR_STEP + BAR_HEIGHT / 2 + 8,
        });
        setAttr(done, 'data-cancel', 'on');
      });

      // The page marker is a clock: it walks right at the speed the page waits,
      // and stops on the answer that arrived last.
      const done = round(arrive + pageMs * MS_SEC);
      sweeps.push({ at: arrive, ms: pageMs });
      setMarker(arrive, 'page', BAR_X, true);
      setMarker(resetAt, 'page', BAR_X, false);
      setAttr(resetAt, 'data-cancel', 'off');
      replicas.push({ at: arrive, replica: 'a', state: 'busy' });
      replicas.push({ at: done, replica: 'a', state: 'idle' });
      laneRequest(page.start, done, pageMs >= SLOW_MS);
    };

    pages.forEach((page, index) => runPage(page, resets[index] ?? SCENE_DURATION));
  };

  // --- the four steps -----------------------------------------------------

  // Step 1. The chart starts empty, which is what the first frame has to be.
  const lastSettle = runStream(STEP_ONE_START, STEP_ONE, false);
  // The slow bar is the last one to stop, so that is the moment the tail
  // becomes visible. The line thickens rather than pulses, so a reader
  // scrubbing back through it sees it thin again.
  setAttr(lastSettle, 'data-p99', 'hot');
  setAttr(lastSettle + HOT_FOR, 'data-p99', 'calm');

  // Step 2. Ten calls per page, and the page waits for the slowest of them.
  setAttr(RESET_STEP_TWO, 'data-calls', 'on');
  for (const marker of PERCENTILE_MARKERS) setMarker(RESET_STEP_TWO, marker, BAR_X, false);
  runPages(FAN_OUT_PAGES, false, RESETS.slice(1, 4));
  const fanOutAt = round(
    (FAN_OUT_PAGES[2]?.start ?? 0) +
      TRAVEL +
      Math.max(...(FAN_OUT_PAGES[2]?.calls ?? [0])) * MS_SEC,
  );
  setAttr(fanOutAt, 'data-fanout', 'on');

  // Step 3. The hedge delay is the p95 step 1 measured, not a number chosen to
  // make the drawing work.
  setAttr(RESET_STEP_THREE, 'data-fanout', 'off');
  setAttr(RESET_STEP_THREE, 'data-replicas', 'on');
  setMarker(RESET_STEP_THREE, 'p95', msToX(HEDGE_DELAY_MS), true);
  runPages(HEDGED_PAGES, true, RESETS.slice(4, 7));

  // Step 4. The same twenty latencies again, with a ceiling on them.
  setAttr(RESET_STEP_FOUR, 'data-calls', 'off');
  setAttr(RESET_STEP_FOUR, 'data-replicas', 'off');
  setAttr(RESET_STEP_FOUR, 'data-hedged', '0');
  setAttr(RESET_STEP_FOUR, 'data-budget', 'off');
  setMarker(RESET_STEP_FOUR, 'p95', BAR_X, false);
  setMarker(RESET_STEP_FOUR, 'target', msToX(TARGET_MS), true);
  runStream(STEP_FOUR_START, STEP_ONE, true);

  // The verdict is the comparison the whole step exists to make.
  const measured = STEP_ONE.map((ms) => (ms > TIMEOUT_MS ? TIMEOUT_MS + FALLBACK_MS : ms));
  const finalP99 = percentile(measured, 99);
  const met = finalP99 <= TARGET_MS;
  setAttr(VERDICT_AT, 'data-slo', met ? 'ok' : 'bad');
  setAttr(VERDICT_AT, 'data-p99', 'hot');
  setAttr(VERDICT_AT + HOT_FOR, 'data-p99', 'calm');
  cue(VERDICT_AT, met ? 'success' : 'failure');

  // --- put the discrete changes in time order -----------------------------

  /**
   * Both series below are written out of order and can name the same element
   * twice at one instant, so each is sorted, folded down to the change that
   * ends up applying, and stripped of anything that does not change. Two
   * zero-duration tweens on one element at one instant would otherwise make
   * that frame depend on which way the reader scrubbed.
   */
  const inTimeOrder = <T extends { at: number }>(series: readonly T[]): T[] =>
    series
      .map((entry, index) => ({ entry, index }))
      .sort((left, right) => left.entry.at - right.entry.at || left.index - right.index)
      .map(({ entry }) => entry);

  /** Guard (B): fold everything recorded at this instant for the same element. */
  const collapsed = <T extends { at: number }>(series: readonly T[], keyFn: (item: T) => unknown): T[] => {
    const out: T[] = [];
    for (const entry of inTimeOrder(series)) collapseAtInstant(out, entry, keyFn);
    return out;
  };

  /** Drops a change that writes the value the element already holds. */
  const changesOnly = <T>(
    series: readonly T[],
    keyFn: (item: T) => string,
    valueFn: (item: T) => string,
    initial: Readonly<Record<string, string>> = {},
  ): T[] => {
    const seen = new Map<string, string>(Object.entries(initial));
    const out: T[] = [];
    for (const entry of series) {
      const key = keyFn(entry);
      const value = valueFn(entry);
      if (seen.get(key) === value) continue;
      seen.set(key, value);
      out.push(entry);
    }
    return out;
  };

  const attrs = changesOnly(
    collapsed(rawAttrs, (change) => change.name),
    (change) => change.name,
    (change) => change.value,
    STAGE_STATE,
  );
  const markers = changesOnly(
    collapsed(rawMarkers, (update) => update.marker),
    (update) => update.marker,
    (update) => `${update.x}/${update.shown}`,
  );

  cues.sort((left, right) => left[0] - right[0]);

  return { bars, markers, sweeps, requests, attrs, replicas, cancels, cues };
}

// --- the timeline ---------------------------------------------------------

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const barEls = qa<SVGRectElement>(stage, '.tl-bar');
  const markerEls: Record<MarkerName, SVGGElement> = {
    mean: q<SVGGElement>(stage, '.tl-marker--mean', ID),
    p50: q<SVGGElement>(stage, '.tl-marker--p50', ID),
    p95: q<SVGGElement>(stage, '.tl-marker--p95', ID),
    p99: q<SVGGElement>(stage, '.tl-marker--p99', ID),
    page: q<SVGGElement>(stage, '.tl-marker--page', ID),
    target: q<SVGGElement>(stage, '.tl-marker--target', ID),
  };
  const replicaEls: Record<'a' | 'b', SVGGElement> = {
    a: q<SVGGElement>(stage, '.tl-replica--A', ID),
    b: q<SVGGElement>(stage, '.tl-replica--B', ID),
  };
  const cancelEl = q<SVGTextElement>(stage, '.tl-cancel', ID);
  const requestLayer = q<SVGGElement>(stage, '.scene-requests', ID);

  const sim = simulate();
  const requests = mountRequests(requestLayer, sim.requests.length, ID);

  const tl = createSceneTimeline();

  // --- the chart ----------------------------------------------------------

  for (const at of RESETS) {
    for (const element of barEls) {
      tl.set(
        element,
        { attr: { x: BAR_X, width: 0, 'data-bar-state': 'idle' }, immediateRender: false },
        at,
      );
    }
  }

  for (const bar of sim.bars) {
    const element = barEls[bar.row];
    if (!element) continue;
    tl.set(
      element,
      { attr: { x: msToX(bar.fromMs), 'data-bar-state': 'running' }, immediateRender: false },
      bar.from,
    );
    tl.fromTo(
      element,
      { attr: { width: 0 } },
      {
        attr: { width: bar.ms * MS_PX },
        duration: bar.to - bar.from,
        ease: 'none',
        immediateRender: false,
      },
      bar.from,
    );
    tl.set(element, { attr: { 'data-bar-state': bar.settled }, immediateRender: false }, bar.to);
  }

  // --- the lines that read the chart --------------------------------------

  for (const update of sim.markers) {
    const element = markerEls[update.marker];
    if (update.marker === 'page') {
      // The page marker sweeps rather than jumps, so its position is a tween
      // and only its visibility is written as an attribute here.
      attr(tl, element, 'data-shown', update.shown ? '1' : '0', update.at);
      continue;
    }
    tl.set(
      element,
      { x: update.x, attr: { 'data-shown': update.shown ? '1' : '0' }, immediateRender: false },
      update.at,
    );
  }

  for (const sweep of sim.sweeps) {
    tl.fromTo(
      markerEls.page,
      { x: BAR_X },
      { x: msToX(sweep.ms), duration: sweep.ms * MS_SEC, ease: 'none', immediateRender: false },
      sweep.at,
    );
  }

  // --- discrete state -----------------------------------------------------

  for (const change of sim.attrs) attr(tl, stage, change.name, change.value, change.at);
  for (const change of sim.replicas) {
    attr(tl, replicaEls[change.replica], 'data-replica-state', change.state, change.at);
  }
  for (const mark of sim.cancels) {
    tl.set(cancelEl, { attr: { x: mark.x, y: mark.y }, immediateRender: false }, mark.at);
  }

  // --- requests -----------------------------------------------------------

  sim.requests.forEach((run, index) => {
    const parts = requests[index];
    if (!parts) return;

    if (run.kind === 'hedge') {
      // A hedged copy leaves from below the node, so it never covers a bar.
      parkRequest(parts, X_REPLICA_B, Y_REPLICA_EDGE);
      showRequest(tl, parts, run.start);
      moveRequest(tl, parts, Y_REPLICA, run.leg, run.start);
      markRequest(tl, parts, 'ok', run.turn);
      moveRequest(tl, parts, Y_REPLICA_EDGE, run.leg, run.turn);
      haloRequest(tl, parts, run.start, run.home, 0.15);
      hideRequest(tl, parts, run.home, 0.15);
      return;
    }

    parkRequest(parts, X_LANE, Y_CLIENT);
    showRequest(tl, parts, run.start);
    moveRequest(tl, parts, Y_SERVICE, run.leg, run.start);
    markRequest(tl, parts, 'ok', run.turn);
    moveRequest(tl, parts, Y_CLIENT, run.leg, run.turn);
    if (run.halo) haloRequest(tl, parts, run.turn, run.home, 0.15);
    hideRequest(tl, parts, run.home, fadeAt(run.home, SCENE_DURATION));
  });

  // --- sound --------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels --------------------------------------------------------

  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
