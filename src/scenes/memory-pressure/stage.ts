/**
 * Static stage markup for the Memory Pressure scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Three bands, one per party to the
 * thing that kills the container:
 *   - y 0..440       kept empty for the step title card
 *   - y 440..680     App: the rate it allocates at, and the `pooled` chip that
 *                    says where its big buffers come from
 *   - y 880..1270    Heap: the gauge that is the whole scene — how much of the
 *                    limit is in use, with `limit 512Mi` drawn at the end of
 *                    the track because the track *is* the limit — plus the
 *                    `used n Mi` reading, the `GC` lamp that burns while a
 *                    collection runs, and the two numbers that say what
 *                    pressure costs: `gc n/min` and `pause n ms`
 *   - y 1500..1740   Node: the container's state (`running`, `oomkilled`,
 *                    `restarting`) and `restarts n`
 *
 * One lane and no others: `X_LANE` at 540, from the App's bottom edge at 680 to
 * the Heap's top edge at 880, downward only. Allocation is the only thing that
 * travels here. Collections, the gauge, the lamp and the container's state are
 * drawn as state rather than as dots, because none of them is a message: a
 * collection is the heap changing, and an OOM kill is the kernel doing
 * something to the process from outside the diagram entirely.
 *
 * A traveller sweeps 26px around every point it reaches and a label keeps 30px
 * clear of that, so x 540 owns a 112px wide keep-out from y 624 to y 936. The
 * App therefore writes its row above y 624 and the Heap writes everything
 * below y 936, which is what fixes the two content rows in each box.
 *
 * The line from the Heap's bottom edge to the Node's top edge is drawn quiet.
 * Nothing travels on it, because it is not a route: it says the heap is inside
 * the container, which is the whole reason the limit can kill it. It is still
 * honest geometry — vertical, through the centre of both boxes it joins, ending
 * on their edges.
 *
 * Declared texture: the gauge track and fill, the limit line, and the three
 * chip plates. The gauge is the one thing here that is drawn as a quantity
 * rather than written as a word, because a heap near its ceiling is a picture
 * before it is a number.
 */

import {
  VIEWBOX,
  chip,
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

// --- geometry --------------------------------------------------------------

/** The one lane: allocation leaving the App and landing on the Heap. */
export const X_LANE = 540;
export const Y_APP_BOTTOM = 680;
export const Y_HEAP_TOP = 880;

/** The quiet line that says the heap is inside the container. */
const Y_HEAP_BOTTOM = 1270;
const Y_NODE_TOP = 1500;

/** The App band. */
const APP = { x: 130, y: 440, w: 820, h: 240 };
const APP_TITLE_X = 170;
const APP_TITLE_Y = 505;
/** One row, above the lane's keep-out: the rate, and where buffers come from. */
const ALLOC_X = 170;
const APP_ROW_Y = 596;
const POOLED_CHIP = { x: 700, y: 552, w: 230, h: 60 };
const POOLED_TEXT_Y = 592;

/** The Heap band. */
const HEAP = { y: 880, h: 390 };
const HEAP_LABEL_Y = 940;

/**
 * The gauge. The track is the limit: its left edge is an empty heap and its
 * right edge is 512 Mi, so "the gauge reaches the end" and "the container is
 * over its limit" are the same event rather than two things drawn near each
 * other. The limit line sits on that right edge and carries the figure.
 */
const GAUGE_X = 170;
export const GAUGE_W = 620;
const GAUGE_Y = 980;
const GAUGE_H = 44;
const LIMIT_X = GAUGE_X + GAUGE_W;
const LIMIT_Y0 = 968;
const LIMIT_Y1 = 1036;

/** The reading under the gauge, and the limit it is measured against. */
const HEAP_ROW_Y = 1082;

/** The collection row: the lamp, how often it burns, and what it costs. */
const LAMP_CHIP = { x: 170, y: 1116, w: 130, h: 60 };
const HEAP_ROW_2_Y = 1156;
const GC_RATE_X = 340;
const PAUSE_X = 620;

/** The Node band. */
const NODE = { x: 280, y: 1500, w: 520, h: 240 };
const NODE_TITLE_Y = 1580;
const BADGE_CHIP = { x: 310, y: 1616, w: 240, h: 66 };
const BADGE_TEXT_Y = 1659;
const RESTARTS_X = 580;
const NODE_ROW_Y = 1659;

// --- what the stage can say about itself -----------------------------------

/**
 * The container's memory limit, in mebibytes. Everything the gauge shows is a
 * share of this, and the kill is the moment the reading reaches it.
 */
export const LIMIT_MI = 512;

/** How much of the gauge one mebibyte is worth. */
export const gaugeWidth = (mi: number): number =>
  Number(((GAUGE_W * Math.max(0, Math.min(mi, LIMIT_MI))) / LIMIT_MI).toFixed(2));

/** Step of the `used` readout, so the number walks rather than jumps. */
export const USED_STEP = 8;
export const USED_VARIANTS = LIMIT_MI / USED_STEP + 1;
export const usedIndex = (mi: number): number =>
  Math.max(0, Math.min(USED_VARIANTS - 1, Math.round(mi / USED_STEP)));

/** The largest reading each of the two collection numbers can show. */
export const GC_MAX = 60;
export const PAUSE_MAX = 20;
export const gcIndex = (perMinute: number): number =>
  Math.max(0, Math.min(GC_MAX, Math.round(perMinute)));
export const pauseIndex = (ms: number): number => Math.max(0, Math.min(PAUSE_MAX, Math.round(ms)));

/** How many times the container may be killed and come back. */
export const RESTART_MAX = 2;

/**
 * The rungs the allocation readout rests on: what the workload asks for while
 * it is calm, while it is under load, and once its buffers come from a pool —
 * plus the zero a container that is not running allocates at.
 */
export const ALLOC_RATES = [0, 15, 20, 60] as const;

/** What the container is doing. There is no `failing`: it is killed or it is not. */
export const CONTAINER_STATES = ['running', 'oomkilled', 'restarting'] as const;
export type ContainerState = (typeof CONTAINER_STATES)[number];

/**
 * How the gauge reads itself. `warn` is the heap living near its ceiling and
 * `limit` is the reading having reached the end of the track. Neither adds a
 * word to the diagram: the gauge changes colour, because the number under it
 * already says what it is.
 */
export const LEVELS = ['calm', 'warn', 'limit'] as const;
export type Level = (typeof LEVELS)[number];

/** A lamp is either lit or it is not. */
export const LAMPS = ['off', 'on'] as const;
export type Lamp = (typeof LAMPS)[number];

/** Whether the App's big buffers are rented from a pool. */
export const POOLED = ['off', 'on'] as const;
export type Pooled = (typeof POOLED)[number];

/**
 * What the heap is holding on the first frame: a warm process a third of the
 * way into its limit, breathing. The simulation starts here rather than at
 * zero, so the opening frame is a service that has been up for a while.
 */
export const OPENING_USED = 165;

/**
 * What every `data-*` on the stage starts at. The markup below is written from
 * these, so the first frame is the whole diagram in its opening state — a
 * running container, a heap a third full, a collector nobody notices — and the
 * timeline never has to restate what is already there.
 */
export const STAGE_STATE: Record<string, string> = {
  'data-mp-alloc': '20',
  'data-mp-used': String(usedIndex(OPENING_USED)),
  'data-mp-gc': '4',
  'data-mp-pause': '2',
  'data-mp-lamp': 'off',
  'data-mp-pooled': 'off',
  'data-mp-container': 'running',
  'data-mp-restarts': '0',
  'data-mp-level': 'calm',
};

// --- markup ----------------------------------------------------------------

/** Non-breaking spaces, so a monospaced label keeps its gaps in SVG. */
const mono = (text: string): string => text.replace(/ /g, '&#160;');

/**
 * A readout whose values are a ladder rather than a run of integers. Like every
 * other counter it is one text element per value stacked on one spot, with the
 * widget class hiding all of them and the state picking the one that shows.
 */
const ladderVariants = (
  values: readonly number[],
  x: number,
  y: number,
  className: string,
  format: (value: number) => string,
  indent = 4,
): string =>
  values
    .map(
      (value) =>
        `<text class="scene-counter ${className} ${className}--${value}" x="${x}" y="${y}">${format(value)}</text>`,
    )
    .join(`\n${' '.repeat(indent)}`);

/**
 * A plate with one word per state stacked on it. Nothing interpolates, so
 * scrubbing backwards is exact and neither theme has a colour to average.
 */
const wordChip = (
  name: string,
  states: readonly string[],
  box: { x: number; y: number; w: number; h: number },
  textY: number,
  wordOf: (state: string) => string = (state) => state,
  indent = 4,
): string => {
  const centre = box.x + box.w / 2;
  const text = states
    .map(
      (state) =>
        `<text class="scene-counter mp-${name} mp-${name}--${state}" x="${centre}" y="${textY}" text-anchor="middle">${wordOf(state)}</text>`,
    )
    .join(`\n${' '.repeat(indent + 2)}`);
  return chip({
    x: box.x,
    y: box.y,
    width: box.w,
    height: box.h,
    rx: 18,
    className: `mp-chip-${name}`,
    variant: 'outline',
    text,
    indent,
  });
};

/** What the App is allocating at, which is the one lever the scene is about. */
const allocReadout = ladderVariants(ALLOC_RATES, ALLOC_X, APP_ROW_Y, 'mp-alloc', (value) =>
  mono(`alloc ${value} MB/s`),
);

/** How much of the limit the heap is holding. */
const usedReadout = counterVariants({
  x: GAUGE_X,
  y: HEAP_ROW_Y,
  className: 'mp-used',
  count: USED_VARIANTS,
  format: (n) => mono(`used ${n * USED_STEP} Mi`),
  indent: 4,
});

/** How often the collector runs, and what one run costs. */
const gcRateReadout = counterVariants({
  x: GC_RATE_X,
  y: HEAP_ROW_2_Y,
  className: 'mp-gcrate',
  count: GC_MAX + 1,
  format: (n) => mono(`gc ${n}/min`),
  indent: 4,
});

const pauseReadout = counterVariants({
  x: PAUSE_X,
  y: HEAP_ROW_2_Y,
  className: 'mp-pause',
  count: PAUSE_MAX + 1,
  format: (n) => mono(`pause ${n} ms`),
  indent: 4,
});

/** How many times the container has been killed and brought back. */
const restartsReadout = counterVariants({
  x: RESTARTS_X,
  y: NODE_ROW_Y,
  className: 'mp-restarts',
  count: RESTART_MAX + 1,
  format: (n) => mono(`restarts ${n}`),
  indent: 4,
});

const stageAttrs = Object.entries(STAGE_STATE)
  .map(([name, value]) => `${name}="${value}"`)
  .join(' ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageAttrs} aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_LANE, Y_APP_BOTTOM, Y_HEAP_TOP, 'scene-link mp-lane')}
  ${verticalLink(X_LANE, Y_HEAP_BOTTOM, Y_NODE_TOP, 'scene-link mp-inside')}

  ${clientBox({
    x: APP.x,
    width: APP.w,
    y: APP.y,
    height: APP.h,
    title: 'App',
    titleX: APP_TITLE_X,
    titleY: APP_TITLE_Y,
    titleAnchor: null,
    extraClass: 'mp-app',
    children: `
    ${allocReadout}

    ${wordChip('pooled', ['on'], POOLED_CHIP, POOLED_TEXT_Y, () => 'pooled')}`,
  })}

  ${nodeFrame({
    y: HEAP.y,
    height: HEAP.h,
    label: 'Heap',
    labelY: HEAP_LABEL_Y,
    children: `    ${trackAndFill({
      x: GAUGE_X,
      y: GAUGE_Y,
      width: GAUGE_W,
      height: GAUGE_H,
      rx: GAUGE_H / 2,
      className: 'mp-gauge',
      fillWidth: gaugeWidth(OPENING_USED),
      indent: 4,
    })}
    <line class="mp-limit-line" x1="${LIMIT_X}" y1="${LIMIT_Y0}" x2="${LIMIT_X}" y2="${LIMIT_Y1}" />

    ${usedReadout}

    <text class="mp-limit-label" x="${LIMIT_X}" y="${HEAP_ROW_Y}" text-anchor="end">${mono(`limit ${LIMIT_MI}Mi`)}</text>

    ${wordChip('lamp', LAMPS, LAMP_CHIP, HEAP_ROW_2_Y, () => 'GC')}

    ${gcRateReadout}

    ${pauseReadout}`,
  })}

  ${serviceBox({
    x: NODE.x,
    width: NODE.w,
    y: NODE.y,
    height: NODE.h,
    title: 'Node',
    titleY: NODE_TITLE_Y,
    className: 'scene-service mp-node',
    children: `
    ${wordChip('badge', CONTAINER_STATES, BADGE_CHIP, BADGE_TEXT_Y)}

    ${restartsReadout}`,
  })}

  ${requestsLayer()}
</svg>`;
