/**
 * Static stage markup for the Horizontal Pod Autoscaler scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. The bands are the usual ones, with
 * the pod row given the allowed extension because the backlog the pods have not
 * got to yet is drawn under them:
 *   - y 0..440       kept empty for the step title card
 *   - y 440..680     the latency panel, and the Clients box traffic leaves from
 *   - y 880..1270    the autoscaler: what it is configured with, the formula it
 *                    evaluates with the values it read, and the window that
 *                    holds a scale-in back
 *   - y 1400         the fan rail, the only row a request changes column on
 *   - y 1500..1740   eight pod slots, each with a startup ring and a CPU meter
 *   - y 1766..1840   the queue depth the pods are behind by
 *
 * One trunk and one rail, and nothing travels anywhere else. The trunk leaves
 * the Clients box at `X_CLIENT` and drops to `Y_RAIL`; the rail runs between the
 * outer pod lanes, and each pod lane drops from the rail to the top edge of its
 * box. Every leg is vertical or horizontal, consecutive legs share their
 * endpoint exactly, and the trunk meets the rail at a point the rail passes
 * through, so no segment ever ends inside a box.
 *
 * `X_CLIENT` is 828 rather than the usual 540 for one reason: the autoscaler
 * evaluates a formula wide enough to need the whole left of its node. A dot has
 * a halo of 26 and labels keep 30px off it, so the trunk reserves x 772..884 for
 * the full height of the node, and everything the node says is written left of
 * x 710. 828 also sits exactly halfway between the pod 7 and pod 8 lanes, so the
 * trunk never runs alongside a lane it is not part of.
 *
 * Inside a pod the rows are decided the same way. A dot stands at `Y_ARRIVE`, so
 * the startup ring sits above it and the CPU meter below it, and the word the
 * pod says about itself is written below the meter, 43px clear of the dot.
 */

import {
  VIEWBOX,
  clientBox,
  counterVariants,
  nodeFrame,
  requestsLayer,
  serviceBox,
  timerRing,
  trackAndFill,
  verticalLink,
} from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- geometry --------------------------------------------------------------

/** The lane every request leaves on, and where it waits before it does. */
export const X_CLIENT = 828;
export const Y_CLIENT = 620;

/** Bottom edge of the Clients box and top edge of the autoscaler node. */
const CLIENT_BOTTOM = 680;
const NODE_Y = 880;
const NODE_H = 390;
const NODE_BOTTOM = NODE_Y + NODE_H;

/** The rail the trunk fans out on, below the node and above the pods. */
export const Y_RAIL = 1400;

/** Centre x of each pod slot, which is also the lane it is reached on. */
export const POD_X = [178, 278, 378, 478, 578, 678, 778, 878];
/** How many slots the row draws, which is the `max` the autoscaler is given. */
export const POD_COUNT = POD_X.length;
const POD_W = 92;
const POD_Y = 1500;
const POD_H = 240;

/** Where a request stands while the pod it reached is answering it. */
export const Y_ARRIVE = 1630;

/** Ends of the fan rail, which are the outermost lanes it has to reach. */
const RAIL_LEFT = POD_X[0] ?? 0;
const RAIL_RIGHT = POD_X[POD_COUNT - 1] ?? 0;

/** Rows inside a pod: the startup ring, the CPU meter, the word it says. */
const START_CY = 1560;
const START_R = 30;
const CPU_Y = 1668;
const CPU_H = 16;
/** Full width of a pod's CPU meter, which the fill is a percentage of. */
export const CPU_W = 68;
const STATUS_Y = 1714;

/** The backlog readout under the row, and the bar that draws it. */
const QUEUE_LABEL_Y = 1786;
const QUEUE_BAR_X = 170;
export const QUEUE_BAR_W = 750;
const QUEUE_BAR_Y = 1812;
const QUEUE_BAR_H = 28;

/** The latency panel, left of the Clients box in the top band. */
const LAT_X = 130;
const LAT_W = 400;
const LAT_BAR_X = 170;
export const LAT_BAR_W = 320;
const LAT_BAR_Y = 556;
const LAT_BAR_H = 28;

/** Rows inside the node, all of them left of the trunk's 30px margin. */
const NODE_LABEL_Y = 938;
const CONFIG_Y = 1000;
const SHAPE_Y = 1068;
const LIVE_Y = 1126;
const DESIRED_Y = 1222;
const RIGHT_EDGE = 710;
const LEFT_EDGE = 170;
/** The two clamps, written left of the note that says what a percent is of. */
const LIMIT_MIN_X = 250;
const LIMIT_MAX_X = 355;

/** Where each field of the evaluated formula is centred. */
const F_N = 300;
const F_TIMES = 336;
const F_AVG = 400;
const F_SLASH = 470;
const F_TARGET = 528;
const F_CLOSE = 586;
const F_EQUALS = 622;
const F_DESIRED = 658;

/** The stabilisation ring and the caption that names the window it draws. */
const RING_CX = 660;
const RING_CY = 1200;
const RING_R = 42;
const RING_LABEL_X = 600;
const RING_LABEL_Y = 1170;

/** Arrival rates the traffic curve steps between, in requests per second. */
export const RPS_VALUES = [20, 45, 60, 120] as const;

/** The backlog readouts, which the continuous bar is drawn behind. */
export const QUEUE_STEP = 25;
export const QUEUE_MAX = 400;
const QUEUE_VARIANTS = QUEUE_MAX / QUEUE_STEP + 1;

/**
 * What every `data-*` on the stage starts at, keyed by the target the timeline
 * addresses it through. The markup below is written from this, so a change that
 * writes a value something already holds can be dropped rather than tweened.
 */
export const STAGE_STATE: Record<string, string> = {
  'stage@data-metric': 'cpu',
  'stage@data-tick': 'off',
  'stage@data-stabilizing': 'off',
  'stage@data-latency': 'fast',
  'stage@data-rps': '20',
  'stage@data-avg': '35',
  'stage@data-qavg': '0',
  'stage@data-queue': '0',
  'stage@data-replicas': '2',
  'stage@data-desired': '2',
  'stage@data-request-note': 'off',
};
for (let index = 1; index <= POD_COUNT; index += 1) {
  STAGE_STATE[`pod-${index}@data-pod`] = index <= 2 ? 'ready' : 'absent';
}

// --- markup ----------------------------------------------------------------

/** One pod slot: a startup ring, a CPU meter, and the word it says about itself. */
const pod = (index: number): string => {
  const centre = POD_X[index] ?? 0;
  const state = index < 2 ? 'ready' : 'absent';
  return serviceBox({
    x: centre - POD_W / 2,
    width: POD_W,
    y: POD_Y,
    height: POD_H,
    title: 'starting',
    titleX: centre,
    titleY: STATUS_Y,
    titleClass: 'scene-flash hpa-status hpa-status--starting',
    className: `hpa-pod hpa-pod--${index + 1}`,
    attrs: ` data-pod="${state}"`,
    boxClass: 'scene-box hpa-pod-box',
    children: `
    <text class="scene-flash hpa-status hpa-status--ready" x="${centre}" y="${STATUS_Y}" text-anchor="middle">ready</text>
    ${timerRing({
      cx: centre,
      cy: START_CY,
      r: START_R,
      className: 'hpa-start',
      groupClass: 'hpa-start',
    })}
    ${trackAndFill({
      x: centre - CPU_W / 2,
      y: CPU_Y,
      width: CPU_W,
      height: CPU_H,
      rx: CPU_H / 2,
      className: 'hpa-cpu',
    })}`,
  });
};

/** The lane one pod is reached on, from the rail down to its top edge. */
const podLane = (index: number): string =>
  verticalLink(POD_X[index] ?? 0, Y_RAIL, POD_Y, 'scene-link hpa-lane');

const rpsText = RPS_VALUES.map(
  (value) =>
    `<text class="scene-counter hpa-rps hpa-rps--${value}" x="${X_CLIENT}" y="552" text-anchor="middle">rps ${value}</text>`,
).join('\n    ');

const latencyWords = ['fast', 'slow', 'overload']
  .map(
    (word) =>
      `<text class="scene-flash hpa-lat-word hpa-lat-word--${word}" x="${LAT_X + LAT_W / 2}" y="640" text-anchor="middle">${word}</text>`,
  )
  .join('\n    ');

const configLines = [
  ['cpu', 'target CPU 60%'],
  ['queue', 'target queue depth 100 / pod'],
]
  .map(
    ([key, text]) =>
      `<text class="hpa-config hpa-config--${key}" x="${LEFT_EDGE}" y="${CONFIG_Y}">${text}</text>`,
  )
  .join('\n    ');

/** The average the autoscaler read, in whichever unit it was reading it in. */
const avgCpu = counterVariants({
  x: F_AVG,
  y: LIVE_Y,
  className: 'hpa-avg',
  max: 100,
  format: (n) => `${n}%`,
  anchor: 'middle',
  indent: 8,
});

const avgQueue = counterVariants({
  x: F_AVG,
  y: LIVE_Y,
  className: 'hpa-qavg',
  count: QUEUE_VARIANTS,
  format: (n) => `${n * QUEUE_STEP}`,
  anchor: 'middle',
  indent: 8,
});

const queueReadout = counterVariants({
  x: QUEUE_BAR_X,
  y: QUEUE_LABEL_Y,
  className: 'hpa-queue',
  count: QUEUE_VARIANTS,
  format: (n) => `queue depth ${n * QUEUE_STEP}`,
  indent: 2,
});

const replicaField = counterVariants({
  x: F_N,
  y: LIVE_Y,
  className: 'hpa-replicas',
  max: POD_COUNT,
  format: (n) => `${n}`,
  anchor: 'middle',
  indent: 6,
});

const desiredField = counterVariants({
  x: F_DESIRED,
  y: LIVE_Y,
  className: 'hpa-des',
  max: POD_COUNT,
  format: (n) => `${n}`,
  anchor: 'middle',
  indent: 6,
});

const desiredRow = counterVariants({
  x: LEFT_EDGE,
  y: DESIRED_Y,
  className: 'hpa-desired',
  max: POD_COUNT,
  format: (n) => `desired ${n}`,
  indent: 4,
});

/** One of the parts of the formula that never changes. */
const literal = (x: number, text: string): string =>
  `<text class="scene-mono hpa-live hpa-live-fixed" x="${x}" y="${LIVE_Y}" text-anchor="middle">${text}</text>`;

/** `ceil(` opens the line, so it is set from the left margin rather than centred. */
const opener = `<text class="scene-mono hpa-live hpa-live-fixed" x="${LEFT_EDGE}" y="${LIVE_Y}">ceil(</text>`;

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" data-metric="cpu" data-tick="off" data-stabilizing="off" data-latency="fast" data-rps="20" data-avg="35" data-qavg="0" data-queue="0" data-replicas="2" data-desired="2" data-request-note="off" aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_CLIENT, CLIENT_BOTTOM, NODE_Y)}
  ${verticalLink(X_CLIENT, NODE_BOTTOM, Y_RAIL)}
  <line class="scene-link" x1="${RAIL_LEFT}" y1="${Y_RAIL}" x2="${RAIL_RIGHT}" y2="${Y_RAIL}" />
  ${POD_X.map((_x, index) => podLane(index)).join('\n  ')}

  ${serviceBox({
    x: LAT_X,
    width: LAT_W,
    y: 440,
    height: 240,
    title: 'latency',
    titleX: LAT_BAR_X,
    titleY: 500,
    titleClass: 'scene-node-label',
    titleAnchor: null,
    className: 'hpa-latency',
    children: `
    ${trackAndFill({
      x: LAT_BAR_X,
      y: LAT_BAR_Y,
      width: LAT_BAR_W,
      height: LAT_BAR_H,
      rx: LAT_BAR_H / 2,
      className: 'hpa-lat',
    })}
    ${latencyWords}`,
  })}

  ${clientBox({
    x: 708,
    width: 240,
    title: 'Clients',
    titleX: X_CLIENT,
    titleY: 500,
    children: `
    ${rpsText}`,
  })}

  ${nodeFrame({
    y: NODE_Y,
    height: NODE_H,
    label: 'HPA',
    labelY: NODE_LABEL_Y,
    children: `    <text class="scene-caption-label hpa-limits" x="${LIMIT_MIN_X}" y="${NODE_LABEL_Y}">min 2</text>
    <text class="scene-caption-label hpa-limits" x="${LIMIT_MAX_X}" y="${NODE_LABEL_Y}">max 8</text>
    <text class="scene-flash hpa-request-note" x="${RIGHT_EDGE}" y="${NODE_LABEL_Y}" text-anchor="end">requests: 500m</text>
    ${configLines}

    <text class="scene-mono hpa-formula" x="${LEFT_EDGE}" y="${SHAPE_Y}">desired = ceil(n × avg / target)</text>

    <g class="hpa-live-row">
      ${opener}
      ${literal(F_TIMES, '×')}
      ${literal(F_SLASH, '/')}
      ${literal(F_CLOSE, ')')}
      ${literal(F_EQUALS, '=')}
      ${replicaField}
      <g class="hpa-avg-cpu">
        ${avgCpu}
      </g>
      <g class="hpa-avg-queue">
        ${avgQueue}
      </g>
      <text class="scene-mono hpa-live hpa-target hpa-target--cpu" x="${F_TARGET}" y="${LIVE_Y}" text-anchor="middle">60%</text>
      <text class="scene-mono hpa-live hpa-target hpa-target--queue" x="${F_TARGET}" y="${LIVE_Y}" text-anchor="middle">100</text>
      ${desiredField}
    </g>

    ${desiredRow}
    <text class="scene-caption-label hpa-window-label" x="${RING_LABEL_X}" y="${RING_LABEL_Y}" text-anchor="end">stabilization 5 min</text>
    ${timerRing({
      cx: RING_CX,
      cy: RING_CY,
      r: RING_R,
      className: 'hpa-window',
      groupClass: 'hpa-window',
    })}`,
  })}

  <text class="scene-node-label hpa-row-label" x="${LEFT_EDGE}" y="1330">Pods</text>

  ${POD_X.map((_x, index) => pod(index)).join('\n\n  ')}

  ${queueReadout}
  ${trackAndFill({
    x: QUEUE_BAR_X,
    y: QUEUE_BAR_Y,
    width: QUEUE_BAR_W,
    height: QUEUE_BAR_H,
    rx: QUEUE_BAR_H / 2,
    className: 'hpa-queue',
    indent: 2,
  })}

  ${requestsLayer()}
</svg>`;
