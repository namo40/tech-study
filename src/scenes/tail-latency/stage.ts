/**
 * Static stage markup for the Tail Latency scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. The bands are the usual ones, with
 * the node stretched because it is not a diagram here but a chart:
 *   - y 0..440      kept empty for the step title card
 *   - y 440..680    Client box, one lane at x 540
 *   - y 820..1300   Service node: twenty latency bars, a millisecond axis, and
 *                   the percentile markers that are read off the bars
 *   - y 1500..1740  the two replicas a hedged call can be sent to
 *
 * The node starts 60px higher and ends 30px lower than its neighbours' because
 * twenty bars plus four label rows plus an axis do not fit in 390px. Every
 * builder takes its band as an argument for exactly this reason.
 *
 * Geometry the timeline needs is exported rather than repeated: a millisecond
 * is `MS_PX` pixels wide and `MS_SEC` seconds long, and those two numbers are
 * what turn a simulated latency into both a bar and a duration.
 */

import {
  VIEWBOX,
  chip,
  clientBox,
  counterVariants,
  nodeFrame,
  requestsLayer,
  serviceBox,
  verticalLink,
} from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

/** Rows in the chart. Steps 1 and 4 fill all of them, one per request. */
export const BAR_COUNT = 20;

/** Left edge of the chart, which is 0 ms. */
export const BAR_X = 190;
/** Pixels per millisecond. The whole scene reads latency off this one number. */
export const MS_PX = 1.4;
/** Scene seconds per millisecond, so a bar grows at the speed it happened. */
export const MS_SEC = 0.004;
/** Highest gridline, in milliseconds. */
export const AXIS_MAX_MS = 500;

/** Top bar, the step down to the next one, and how thick a bar is. */
export const BAR_Y = 996;
export const BAR_STEP = 12;
export const BAR_HEIGHT = 9;

/** Vertical extent of the percentile markers and the gridlines. */
export const CHART_TOP = 990;
export const CHART_BOTTOM = 1245;

/**
 * Baseline each marker hangs its label on. Markers that can be on screen at the
 * same time get rows of their own, so two of them landing on nearly the same
 * millisecond never write over each other: `page` and `target` reuse the bottom
 * row because neither is ever shown in a step where `mean` is.
 */
export const ROW_P99 = 902;
export const ROW_P95 = 928;
export const ROW_P50 = 954;
export const ROW_MEAN = 980;

/** The objective step 4 measures itself against, and the ceiling it puts on. */
export const TARGET_MS = 200;
export const TIMEOUT_MS = 250;
/** What answering from the fallback costs on top of the timeout. */
export const FALLBACK_MS = 2;

/** Share of calls the hedge budget allows, as a percentage. */
export const HEDGE_BUDGET_PERCENT = 5;

/** The lane requests travel down, and the stops along it. */
export const X_LANE = 540;
export const Y_CLIENT = 630;
export const Y_SERVICE = 790;
/** Where a hedged copy starts and ends, below the node so it never covers a bar. */
export const Y_REPLICA_EDGE = 1310;
export const Y_REPLICA = 1650;
export const X_REPLICA_A = 325;
export const X_REPLICA_B = 755;

/** Seconds a request spends on the lane between two stops. */
export const TRAVEL = 0.35;

/** x of a latency in the chart. */
export const msToX = (ms: number): number => BAR_X + ms * MS_PX;

/** A gridline and an axis label every hundred milliseconds. */
const GRID_MS = Array.from({ length: AXIS_MAX_MS / 100 + 1 }, (_value, index) => index * 100);

const bars = Array.from({ length: BAR_COUNT }, (_value, index) => index)
  .map(
    (index) =>
      `<rect class="scene-fill tl-bar tl-bar--${index}" data-bar-state="idle" x="${BAR_X}" y="${BAR_Y + index * BAR_STEP}" width="0" height="${BAR_HEIGHT}" rx="4" />`,
  )
  .join('\n    ');

const gridlines = GRID_MS.map(
  (ms) =>
    `<line class="tl-grid" x1="${msToX(ms)}" y1="${CHART_TOP}" x2="${msToX(ms)}" y2="${CHART_BOTTOM}" />`,
).join('\n    ');

const axisLabels = GRID_MS.map(
  (ms) => `<text class="scene-caption-label tl-axis" x="${msToX(ms)}" y="1276" text-anchor="middle">${ms}</text>`,
).join('\n    ');

/**
 * One percentile marker: a full height line with its name above it. The line
 * sits at x 0 and the whole group is translated, so a marker moves with a
 * single tween and its label can never drift away from its line.
 */
const marker = (name: string, labelY: number, label: string, extra = ''): string =>
  `<g class="tl-marker tl-marker--${name}" data-shown="0">
      <line class="tl-line tl-line--${name}" x1="0" y1="${CHART_TOP}" x2="0" y2="${CHART_BOTTOM}" />
      <text class="tl-marker-label tl-marker-label--${name}" x="0" y="${labelY}" text-anchor="middle">${label}</text>${extra}
    </g>`;

/** The SLO verdict rides on the p99 marker, because that is what it judges. */
const sloVerdict = `
      <text class="tl-slo-label" x="86" y="${ROW_P99}" text-anchor="start">SLO</text>
      <g class="tl-slo tl-slo--ok" transform="translate(180 ${ROW_P99 - 8})">
        <path class="tl-slo-glyph" d="M -9 1 L -3 8 L 10 -7" />
      </g>
      <g class="tl-slo tl-slo--bad" transform="translate(180 ${ROW_P99 - 8})">
        <path class="tl-slo-glyph" d="M -8 -8 L 8 8 M 8 -8 L -8 8" />
      </g>`;

const hedgeCount = counterVariants({
  x: 910,
  y: 864,
  className: 'tl-hedged',
  count: 3,
  anchor: 'end',
  format: (n) => `hedge ${n}/30`,
});

/** Baseline of the row the timeout is cut on, which is request 14 of twenty. */
const CUT_ROW = 13;
const CUT_TEXT_Y = BAR_Y + CUT_ROW * BAR_STEP + BAR_HEIGHT / 2 + 8;

const fallbackChip = chip({
  x: 650,
  y: CUT_TEXT_Y - 22,
  width: 160,
  height: 32,
  rx: 12,
  className: 'tl-fallback',
  variant: 'outline',
  text: `<text class="tl-fallback-text" x="730" y="${CUT_TEXT_Y}" text-anchor="middle">fallback</text>`,
});

/**
 * What every `data-*` on the stage root starts at. The markup is written from
 * this, and the timeline compares its first change to each name against it, so
 * a step that resets something already in its resting state writes nothing.
 */
export const STAGE_STATE: Record<string, string> = {
  'data-calls': 'off',
  'data-replicas': 'off',
  'data-hedged': '0',
  'data-budget': 'off',
  'data-fanout': 'off',
  'data-timeout': 'off',
  'data-fallback': 'off',
  'data-cancel': 'off',
  'data-slo': 'none',
  'data-p99': 'calm',
};

const stageState = Object.entries(STAGE_STATE)
  .map(([name, value]) => `${name}="${value}"`)
  .join(' ');

const replica = (letter: string, x: number): string =>
  serviceBox({
    x,
    width: 350,
    title: `replica ${letter}`,
    titleY: 1570,
    className: `tl-replica tl-replica--${letter}`,
    attrs: ' data-replica-state="idle"',
    boxClass: 'scene-box tl-replica-box',
  });

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageState} aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_LANE, 680, 820)}
  ${verticalLink(X_REPLICA_A, 1300, 1500)}
  ${verticalLink(X_REPLICA_B, 1300, 1500)}

  ${clientBox({
    title: 'Client',
    titleY: 505,
    children: `
    <text class="scene-flash tl-calls" x="${X_LANE}" y="562" text-anchor="middle">10 calls</text>`,
  })}

  ${nodeFrame({
    y: 820,
    height: 480,
    label: 'Service',
    labelY: 864,
    children: `    ${hedgeCount}
    <text class="scene-flash tl-budget" x="910" y="896" text-anchor="end">budget ${HEDGE_BUDGET_PERCENT}%</text>

    ${gridlines}

    ${bars}

    ${marker('mean', ROW_MEAN, 'mean')}
    ${marker('p50', ROW_P50, 'p50')}
    ${marker('p95', ROW_P95, 'p95')}
    ${marker('p99', ROW_P99, 'p99', sloVerdict)}
    ${marker('page', ROW_MEAN, 'page')}
    ${marker('target', ROW_MEAN, `p99 target ${TARGET_MS} ms`)}

    <text class="scene-flash tl-timeout" x="556" y="${CUT_TEXT_Y}">timeout</text>
    ${fallbackChip}
    <text class="tl-cancel" x="0" y="0">×</text>
    <text class="scene-flash tl-fanout" x="930" y="1186" text-anchor="end">1 - 0.99^10 ≈ 10%</text>

    ${axisLabels}
    <text class="scene-caption-label tl-axis" x="920" y="1276" text-anchor="start">ms</text>`,
  })}

  ${replica('A', 150)}

  ${replica('B', 580)}

  ${requestsLayer()}
</svg>`;
