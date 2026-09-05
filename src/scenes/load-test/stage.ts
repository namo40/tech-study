/**
 * Static stage markup for the Load Test scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. The bands are the usual ones, with
 * the node stretched because it is not a diagram here but a chart:
 *   - y 0..400      above the cropped viewBox (see shared VIEWBOX)
 *   - y 400..440    the frame's top padding; nothing is drawn here
 *   - y 440..680    Load generator: the virtual user count, the ramp stage it
 *                   is in, and the two arrival models step 4 compares
 *   - y 820..1330   Service: three readouts and the chart they are plotted on,
 *                   throughput and p95 against load, with the markers the run
 *                   works out for itself
 *   - y 1500..1740  Dependencies: three meters, replaced in step 4 by the two
 *                   data realism panels
 *
 * Two lanes rather than one. A request goes down at `X_DOWN`, crosses the top
 * edge of the node to `X_UP`, and comes back up, so a response and a request
 * never share a lane and two travellers never occupy the same point. The
 * crossing rides the node's own top edge, so every leg is axis-aligned and no
 * segment ever ends in mid-air.
 *
 * Geometry the timeline needs is exported rather than repeated: the chart is
 * three linear maps (`xOfVus`, `yOfRps`, `yOfP95`), and everything the run
 * draws on it goes through them.
 */

import {
  VIEWBOX,
  clientBox,
  counterVariants,
  nodeFrame,
  requestsLayer,
  serviceBox,
  trackAndFill,
  verticalLink,
} from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- lanes -----------------------------------------------------------------

/** The lane a request goes down and the lane a response comes back up. */
export const X_DOWN = 480;
export const X_UP = 600;
/** Where a request waits inside the generator, and the edge it turns on. */
export const Y_GEN = 620;
export const Y_NODE_TOP = 820;

const GEN_Y = 440;
const GEN_H = 240;
const NODE_Y = 820;
const NODE_H = 510;

// --- the chart -------------------------------------------------------------

/** Left and right edge of the plot, which are 0 and `VUS_AXIS_MAX` virtual users. */
export const CHART_X0 = 190;
export const CHART_X1 = 910;
export const CHART_TOP = 1022;
export const CHART_BOTTOM = 1242;

/** Full scale of each axis. The plot is clamped to these. */
export const VUS_AXIS_MAX = 400;
export const RPS_AXIS_MAX = 1200;
export const P95_AXIS_MAX = 800;

/** x of a load, in virtual users. */
export const xOfVus = (vus: number): number =>
  CHART_X0 + Math.min(vus, VUS_AXIS_MAX) * ((CHART_X1 - CHART_X0) / VUS_AXIS_MAX);

/** y of a throughput, read against the left axis. */
export const yOfRps = (rps: number): number =>
  CHART_BOTTOM - Math.min(rps, RPS_AXIS_MAX) * ((CHART_BOTTOM - CHART_TOP) / RPS_AXIS_MAX);

/** y of a latency, read against the right axis. */
export const yOfP95 = (ms: number): number =>
  CHART_BOTTOM - Math.min(ms, P95_AXIS_MAX) * ((CHART_BOTTOM - CHART_TOP) / P95_AXIS_MAX);

/** The objective the run measures itself against. */
export const SLO_P95_MS = 200;
/** Milliseconds a virtual user waits between two requests, in a closed model. */
export const THINK_MS = 200;
export const Y_SLO = yOfP95(SLO_P95_MS);

/** Label rows above the plot. Markers that can be shown together get their own. */
const ROW_1 = 940;
const ROW_2 = 972;
const ROW_3 = 1004;
export const MARKER_ROWS = { warmup: ROW_1, knee: ROW_1, max: ROW_2, sustainable: ROW_3 };

const READOUT_Y = 900;
const TICK_Y = 1274;
const AXIS_Y = 1306;

// --- counters --------------------------------------------------------------

/** Step of each readout, so a number walks rather than jumps. */
export const VUS_STEP = 10;
export const RPS_STEP = 25;
export const P95_STEP = 20;
export const WAIT_STEP = 10;
export const PCT_STEP = 5;

export const VUS_MAX = 400;
export const RPS_MAX = 1200;
export const P95_MAX = 1500;
export const WAIT_MAX = 200;
export const ERRORS_MAX = 8;

/** Thousands separators, so a four figure rate reads as one. */
export const fmt = (value: number): string =>
  Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const variantCount = (max: number, step: number): number => max / step + 1;

// --- the generator ---------------------------------------------------------

const GAUGE_X = 170;
export const GAUGE_W = 240;
const GAUGE_Y = 590;
const GAUGE_H = 24;

const vusCounter = counterVariants({
  x: GAUGE_X,
  y: 566,
  className: 'lt-vus',
  count: variantCount(VUS_MAX, VUS_STEP),
  format: (n) => `VUs ${fmt(n * VUS_STEP)}`,
  indent: 4,
});

const stageWords = ['ramp', 'hold', 'soak']
  .map(
    (word) =>
      `<text class="scene-flash lt-stage-word lt-stage-word--${word}" x="940" y="500" text-anchor="end">${word === 'soak' ? 'soak 2 h' : word}</text>`,
  )
  .join('\n    ');

// --- the service -----------------------------------------------------------

const rpsCounter = counterVariants({
  x: 400,
  y: READOUT_Y,
  className: 'lt-rps',
  count: variantCount(RPS_MAX, RPS_STEP),
  format: (n) => `rps ${fmt(n * RPS_STEP)}`,
  indent: 4,
});

const p95Counter = counterVariants({
  x: 590,
  y: READOUT_Y,
  className: 'lt-p95',
  count: variantCount(P95_MAX, P95_STEP),
  format: (n) => `p95 ${fmt(n * P95_STEP)} ms`,
  indent: 4,
});

const errorsCounter = counterVariants({
  x: 910,
  y: READOUT_Y,
  className: 'lt-errors',
  count: ERRORS_MAX + 1,
  format: (n) => `errors ${n}%`,
  anchor: 'end',
  indent: 4,
});

const ticks = [0, 100, 200, 300, 400]
  .map(
    (vus) =>
      `<line class="lt-grid" x1="${xOfVus(vus)}" y1="${CHART_TOP}" x2="${xOfVus(vus)}" y2="${CHART_BOTTOM}" />`,
  )
  .join('\n    ');

const tickLabels = [0, 100, 200, 300, 400]
  .map(
    (vus) =>
      `<text class="scene-caption-label lt-tick" x="${xOfVus(vus)}" y="${TICK_Y}" text-anchor="middle">${vus}</text>`,
  )
  .join('\n    ');

/**
 * One marker: a full height line with its name above it. The line sits at x 0
 * and the whole group is translated, so a marker moves with a single tween and
 * its label can never drift away from its line.
 */
const marker = (name: keyof typeof MARKER_ROWS, label: string, anchor = 'middle'): string =>
  `<g class="lt-marker lt-marker--${name}" data-shown="0">
      <line class="lt-line lt-line--${name}" x1="0" y1="${CHART_TOP}" x2="0" y2="${CHART_BOTTOM}" />
      <text class="lt-marker-label lt-marker-label--${name}" x="0" y="${MARKER_ROWS[name]}" text-anchor="${anchor}">${label}</text>
    </g>`;

// --- the dependency meters -------------------------------------------------

const DEP_Y = 1500;
const DEP_H = 240;
const DEP_W = 260;
export const METER_W = 188;
const METER_H = 26;
const TITLE_Y = 1556;
const METER_Y = 1596;
const VALUE_Y = 1676;
const FLAG_Y = 1712;

const poolTitle = counterVariants({
  x: 166,
  y: TITLE_Y,
  className: 'lt-pool-count',
  count: 11,
  format: (n) => `DB pool ${n}/10`,
  indent: 4,
});

const poolWaiting = counterVariants({
  x: 166,
  y: VALUE_Y,
  className: 'lt-waiting',
  count: variantCount(WAIT_MAX, WAIT_STEP),
  format: (n) => `waiting ${fmt(n * WAIT_STEP)}`,
  indent: 4,
});

const cpuValue = counterVariants({
  x: 446,
  y: VALUE_Y,
  className: 'lt-cpu-value',
  count: variantCount(100, PCT_STEP),
  format: (n) => `busy ${n * PCT_STEP}%`,
  indent: 4,
});

const memValue = counterVariants({
  x: 726,
  y: VALUE_Y,
  className: 'lt-mem-value',
  count: variantCount(100, PCT_STEP),
  format: (n) => `heap ${n * PCT_STEP}%`,
  indent: 4,
});

const meterBox = (
  key: string,
  x: number,
  title: string,
  value: string,
  flag: string,
  bar: string,
): string =>
  serviceBox({
    x,
    width: DEP_W,
    y: DEP_Y,
    height: DEP_H,
    title,
    titleX: x + 36,
    titleY: TITLE_Y,
    titleClass: 'scene-node-label',
    titleAnchor: null,
    className: `lt-meter lt-meter--${key}`,
    attrs: ' data-meter="calm"',
    boxClass: 'scene-box lt-meter-box',
    children: `
    ${bar}
    ${value}${flag}`,
  });

const meterBar = (key: string, x: number, fillWidth = 0): string =>
  trackAndFill({
    x: x + 36,
    y: METER_Y,
    width: METER_W,
    height: METER_H,
    rx: METER_H / 2,
    className: `lt-${key}`,
    fillWidth,
  });

/** The heap the service starts on, which is where its meter starts too. */
export const MEM_BASE_PCT = 40;

// --- the data realism panels ----------------------------------------------

const PANEL_W = 400;
const PANEL_ROWS = { name: 1556, cache: 1600, rps: 1648, p95: 1686, verdict: 1726 };

const panel = (key: string, x: number, name: string, cache: string, verdict: string): string =>
  serviceBox({
    x,
    width: PANEL_W,
    y: DEP_Y,
    height: DEP_H,
    title: name,
    titleX: x + 36,
    titleY: PANEL_ROWS.name,
    titleClass: 'scene-node-label',
    titleAnchor: null,
    className: `lt-panel lt-panel--${key}`,
    boxClass: `scene-box lt-panel-box lt-panel-box--${key}`,
    children: `
    <text class="scene-caption-label lt-panel-cache" x="${x + 36}" y="${PANEL_ROWS.cache}">${cache}</text>
    <text class="scene-mono lt-panel-rps lt-panel-rps--${key}" x="${x + 36}" y="${PANEL_ROWS.rps}">rps</text>
    <text class="scene-mono lt-panel-p95 lt-panel-p95--${key}" x="${x + 36}" y="${PANEL_ROWS.p95}">p95</text>
    <text class="lt-panel-verdict lt-panel-verdict--${key}" x="${x + 36}" y="${PANEL_ROWS.verdict}">${verdict}</text>`,
  });

// --- state -----------------------------------------------------------------

/**
 * What every `data-*` on the stage root starts at. The markup is written from
 * this, and the run compares its first change to each name against it, so a
 * step that writes a value the stage already holds writes nothing.
 */
export const STAGE_STATE: Record<string, string> = {
  'data-vus': '0',
  'data-rps': '0',
  'data-p95': 'none',
  'data-p95v': '0',
  'data-errors': '0',
  'data-pool': '0',
  'data-waiting': '0',
  'data-cpu': '0',
  'data-mem': '8',
  'data-stage': 'idle',
  'data-model': 'off',
  'data-panels': 'off',
  'data-slo': 'off',
  'data-lit': 'none',
};

const stageState = Object.entries(STAGE_STATE)
  .map(([name, value]) => `${name}="${value}"`)
  .join(' ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageState} aria-hidden="true" focusable="false">
  <defs>
    <clipPath id="lt-chart-clip">
      <rect class="lt-clip" x="${CHART_X0}" y="${CHART_TOP - 8}" width="0" height="${CHART_BOTTOM - CHART_TOP + 16}" />
    </clipPath>
  </defs>

  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_DOWN, GEN_Y + GEN_H, NODE_Y)}
  ${verticalLink(X_UP, GEN_Y + GEN_H, NODE_Y)}

  ${clientBox({
    x: 130,
    width: 820,
    y: GEN_Y,
    height: GEN_H,
    title: 'Load generator',
    titleX: 170,
    titleY: 500,
    titleClass: 'scene-node-label',
    titleAnchor: null,
    extraClass: 'lt-gen',
    children: `
    ${vusCounter}
    ${trackAndFill({
      x: GAUGE_X,
      y: GAUGE_Y,
      width: GAUGE_W,
      height: GAUGE_H,
      rx: GAUGE_H / 2,
      className: 'lt-gauge',
    })}
    ${stageWords}
    <text class="lt-model lt-model--closed" x="940" y="566" text-anchor="end">think time ${THINK_MS} ms</text>
    <text class="lt-model lt-model--open" x="940" y="620" text-anchor="end">arrival rate</text>`,
  })}

  ${nodeFrame({
    y: NODE_Y,
    height: NODE_H,
    label: 'Service',
    labelY: READOUT_Y,
    children: `    ${rpsCounter}
    <text class="scene-counter lt-p95-none" x="590" y="${READOUT_Y}">p95 n/a</text>
    ${p95Counter}
    ${errorsCounter}

    ${ticks}
    <line class="lt-baseline" x1="${CHART_X0}" y1="${CHART_BOTTOM}" x2="${CHART_X1}" y2="${CHART_BOTTOM}" />

    <g class="lt-plot" clip-path="url(#lt-chart-clip)">
      <polyline class="lt-curve lt-curve--tp-warm" points="" />
      <polyline class="lt-curve lt-curve--p95-warm" points="" />
      <polyline class="lt-curve lt-curve--tp" points="" />
      <polyline class="lt-curve lt-curve--p95" points="" />
    </g>

    <g class="lt-slo">
      <line class="lt-slo-line" x1="${CHART_X0}" y1="${Y_SLO}" x2="${CHART_X1}" y2="${Y_SLO}" />
      <text class="lt-slo-label" x="${CHART_X1}" y="${Y_SLO + 24}" text-anchor="end">SLO p95 &lt; ${SLO_P95_MS} ms</text>
    </g>

    ${marker('warmup', 'warm-up')}
    ${marker('knee', 'knee')}
    ${marker('max', 'max', 'end')}
    ${marker('sustainable', 'sustainable')}

    <text class="lt-legend lt-legend--tp" x="${CHART_X0}" y="${ROW_3}">throughput</text>
    <text class="lt-legend lt-legend--p95" x="${CHART_X1}" y="${ROW_3}" text-anchor="end">p95</text>

    ${tickLabels}
    <text class="scene-caption-label lt-axis" x="${(CHART_X0 + CHART_X1) / 2}" y="${AXIS_Y}" text-anchor="middle">load</text>`,
  })}

  <text class="scene-node-label lt-row-label lt-row-label--deps" x="170" y="1450">Dependencies</text>
  <text class="scene-node-label lt-row-label lt-row-label--panels" x="170" y="1450">Data realism</text>

  <g class="lt-deps">
    ${meterBox('pool', 130, '', `${poolTitle}\n    ${poolWaiting}`, `\n    <text class="scene-flash lt-flag lt-flag--pool" x="166" y="${FLAG_Y}">saturated</text>`, meterBar('pool', 130))}

    ${meterBox('cpu', 410, 'Thread pool', cpuValue, '', meterBar('cpu', 410))}

    ${meterBox('mem', 690, 'memory', memValue, `\n    <text class="scene-flash lt-flag lt-flag--mem" x="726" y="${FLAG_Y}">leak?</text>`, meterBar('mem', 690, (METER_W * MEM_BASE_PCT) / 100))}
  </g>

  <g class="lt-panels">
    ${panel('hot', 130, '1 id', 'cache 100%', 'not real')}

    ${panel('real', 550, '10k ids', 'cache 60%', 'real')}
  </g>

  ${requestsLayer()}
</svg>`;
