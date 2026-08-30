/**
 * Static stage markup for the Elasticity scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Three bands, one per layer that can
 * stretch, because the argument of the scene is that they stretch together:
 *   - y 0..440       kept empty for the step title card
 *   - y 440..680     Load: the demand gauge, which is the only thing in the
 *                    picture nobody in the cluster controls
 *   - y 880..1270    Pods: six capsule positions, the two readouts the
 *                    autoscaler works from, and the two words the row can say
 *                    about itself (`resize`, `pending`)
 *   - y 1500..1740   Nodes: three node cells with two pod slots each, the node
 *                    count, and the `drain` a node leaves on
 *
 * Two lanes and nothing else travels, both on x 540. The upper one carries a
 * sample of the demand from the Load box's bottom edge at 680 to the Pods box's
 * top edge at 880. The lower one carries a scheduling attempt from the Pods
 * box's bottom edge at 1270 to the Nodes box's top edge at 1500, and only at the
 * instants the scheduler actually tries to place a pod: a pod count changing is
 * a state change inside a box, not a message, and drawing it as traffic would
 * say the autoscaler talks to the nodes when what it does is ask for capacity.
 *
 * A traveller sweeps 26px around every point it reaches and a label keeps 30px
 * clear of that, so the lanes own x 484..596 from y 624 to y 936 and from y 1214
 * to y 1556. That is what fixes the rows: the Load band writes everything above
 * y 624, the Pods band everything below y 936 and above y 1214, and the Nodes
 * band everything below y 1556 or outside the column — the `Nodes` title and the
 * `nodes n` readout sit on y 1552 because they are left and right of x 540.
 *
 * Declared texture: the demand gauge, the six pod capsules, the two fixed
 * capacity frames, the three node cells and their six pod slots. Everything else
 * is a word or a number.
 *
 * A pod carries two attributes rather than one. `data-el-pod` is what the pod is
 * doing and decides how the capsule is drawn; `data-el-size` is how big its
 * request is and decides which of four rectangles is the capsule. Keeping them
 * apart is what lets a pod be re-sized visibly: it holds its old rectangle for
 * the whole restart and takes the new one when it comes back, which a single
 * attribute could not say without remembering what it used to be.
 */

import {
  VIEWBOX,
  clientBox,
  counterVariants,
  nodeFrame,
  requestsLayer,
  serviceBox,
  verticalLink,
} from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- geometry --------------------------------------------------------------

/** The one column both lanes run down, and the edges they run between. */
export const X_LANE = 540;
export const Y_LOAD_BOTTOM = 680;
export const Y_PODS_TOP = 880;
export const Y_PODS_BOTTOM = 1270;
export const Y_NODES_TOP = 1500;

/** The Load band: a title, the word `demand`, and the gauge it names. */
const LOAD = { x: 130, y: 440, w: 820, h: 240 };
const LOAD_TITLE_Y = 505;
const DEMAND_LABEL_Y = 600;
const GAUGE_X = 330;
export const GAUGE_W = 580;
const GAUGE_Y = 572;
const GAUGE_H = 36;

/** The Pods band: one title row, the capsule row, one row of words. */
const PODS = { x: 130, y: 880, w: 820, h: 390 };
const PODS_TITLE_Y = 986;
const CPU_X = 620;
const PODS_COUNT_X = 910;
const WORD_Y = 1216;
const RESIZE_X = 330;
const PENDING_X = 750;

/** Centre x of each capsule position, and the row's shared centre line. */
export const POD_X = [220, 348, 476, 604, 732, 860] as const;
/** How many capsules the row draws, which is the highest the count can go. */
export const POD_MAX = POD_X.length;
const POD_CY = 1090;

/** The frame that says the capacity is nailed down, drawn around the row. */
const FIXED = { x: 160, y: 1000, w: 760, h: 180 };

/** The Nodes band: a title row, the cells, and the word a cell leaves on. */
const NODES = { x: 280, y: 1500, w: 520, h: 240 };
const NODES_TITLE_X = 320;
const NODES_TITLE_Y = 1560;
const NODES_COUNT_X = 760;
export const NODE_X = [374, 540, 706] as const;
/** How many cells the row draws, which is the highest the node count can go. */
export const NODE_MAX = NODE_X.length;
const NODE_W = 148;
const NODE_Y = 1586;
const NODE_H = 86;
const SLOT_SIDE = 44;
const SLOT_Y = 1607;
const SLOT_DX = 30;
const DRAIN_X = NODE_X[2];
const DRAIN_Y = 1712;

/** The four rectangles a capsule can be, keyed by the request size it draws. */
const CAPSULE: Record<string, { w: number; h: number }> = {
  slot: { w: 96, h: 108 },
  small: { w: 76, h: 72 },
  std: { w: 96, h: 108 },
  large: { w: 112, h: 144 },
};

// --- what the stage can say about itself -----------------------------------

/** How much work each demand level asks for, in units of one pod's capacity. */
export const DEMAND_LOAD = { night: 45, normal: 135, rising: 225, peak: 300 } as const;
export type Demand = keyof typeof DEMAND_LOAD;
export const DEMAND_LEVELS = ['night', 'normal', 'rising', 'peak'] as const;

/** How wide the gauge is drawn for each level: the load as a share of the peak. */
const GAUGE_FILL: Record<Demand, number> = {
  night: Math.round((DEMAND_LOAD.night / DEMAND_LOAD.peak) * GAUGE_W),
  normal: Math.round((DEMAND_LOAD.normal / DEMAND_LOAD.peak) * GAUGE_W),
  rising: Math.round((DEMAND_LOAD.rising / DEMAND_LOAD.peak) * GAUGE_W),
  peak: GAUGE_W,
};

/** What one pod can serve, so a percentage is a percentage of something. */
export const POD_CAPACITY = 100;

/** The utilisation the autoscaler is aiming at, as a percentage. */
export const CPU_TARGET = 60;

/**
 * Every `cpu n%` the scene can draw. The simulation derives the number and then
 * checks it is one of these, so a change to the demand levels or the pod
 * capacity fails the build rather than quietly drawing a blank readout.
 */
export const CPU_VALUES = [15, 25, 35, 45, 55, 60, 75, 100] as const;

/** How many pods one node holds. Two nodes therefore hold four. */
export const NODE_CAPACITY = 2;

/** What a pod is doing, which is what decides how its capsule is drawn. */
export const POD_STATES = ['absent', 'running', 'starved', 'oversized', 'pending', 'resizing'] as const;
export type PodState = (typeof POD_STATES)[number];

/** How big a pod's request is, which is which rectangle the capsule is. */
export const POD_SIZES = ['slot', 'small', 'std', 'large'] as const;
export type PodSize = (typeof POD_SIZES)[number];

/** What a node cell is: not there, there and idle, holding pods, or leaving. */
export const NODE_STATES = ['absent', 'empty', 'active', 'full', 'draining'] as const;
export type NodeState = (typeof NODE_STATES)[number];

/** Whether the capacity is nailed down, and to which of the day's two failures. */
export const GHOST_STATES = ['off', 'peak', 'idle'] as const;
export type GhostState = (typeof GHOST_STATES)[number];

/** What the scene is holding up for a moment, drawn on the bands themselves. */
export const MARKS = ['none', 'fit', 'follow', 'honest'] as const;
export type Mark = (typeof MARKS)[number];

/** A word the row can say about itself, which is either said or not. */
export const FLAG_STATES = ['off', 'on'] as const;
export type FlagState = (typeof FLAG_STATES)[number];

/**
 * What every `data-*` on the stage starts at, keyed by the target the timeline
 * addresses it through. The markup below is written from this, so the opening
 * frame is the whole diagram already settled — three pods at 45% of a 60%
 * target, two nodes holding them, nothing pending and nothing in flight — and
 * the timeline never restates a value that is already there.
 */
export const STAGE_STATE: Record<string, string> = {
  'stage@data-el-demand': 'normal',
  'stage@data-el-cpu': '45',
  'stage@data-el-pods': '3',
  'stage@data-el-nodes': '2',
  'stage@data-el-pending': 'off',
  'stage@data-el-resize': 'off',
  'stage@data-el-drain': 'off',
  'stage@data-el-ghost': 'off',
  'stage@data-el-mark': 'none',
  'stage@data-el-settled': 'off',
};
for (let index = 1; index <= POD_MAX; index += 1) {
  const running = index <= 3;
  STAGE_STATE[`pod-${index}@data-el-pod`] = running ? 'running' : 'absent';
  STAGE_STATE[`pod-${index}@data-el-size`] = running ? 'std' : 'slot';
}
STAGE_STATE['node-1@data-el-node'] = 'full';
STAGE_STATE['node-2@data-el-node'] = 'active';
STAGE_STATE['node-3@data-el-node'] = 'absent';

// --- markup ----------------------------------------------------------------

/** Non-breaking spaces, so a readout keeps its gaps in SVG. */
const mono = (text: string): string => text.replace(/ /g, '&#160;');

/**
 * A stack of text elements on one spot, one per value the readout can hold,
 * hidden by a base rule and revealed one at a time by the current `data-*`.
 * `counterVariants` numbers its variants from zero; this one names them after
 * the value, which is what a readout with an authored set of values needs.
 */
const valueVariants = (
  x: number,
  y: number,
  className: string,
  values: readonly (string | number)[],
  format: (value: string | number) => string,
  anchor: string | null,
  indent: number,
): string =>
  values
    .map(
      (value) =>
        `<text class="scene-counter ${className} ${className}--${value}" x="${x}" y="${y}"${anchor ? ` text-anchor="${anchor}"` : ''}>${format(value)}</text>`,
    )
    .join(`\n${' '.repeat(indent)}`);

/** The gauge: a fixed track with one fill per level, only one of them shown. */
const gaugeFills = DEMAND_LEVELS.map(
  (level) =>
    `<rect class="scene-fill el-gauge el-gauge--${level}" x="${GAUGE_X}" y="${GAUGE_Y}" width="${GAUGE_FILL[level]}" height="${GAUGE_H}" rx="${GAUGE_H / 2}" />`,
).join('\n    ');

/** One capsule position: the four rectangles it can be, all on one centre. */
const podCapsule = (index: number): string => {
  const cx = POD_X[index] ?? 0;
  const running = index < 3;
  const rects = POD_SIZES.map((size) => {
    const { w, h } = CAPSULE[size] ?? { w: 0, h: 0 };
    return `<rect class="el-body el-body--${size}" x="${cx - w / 2}" y="${POD_CY - h / 2}" width="${w}" height="${h}" rx="22" />`;
  }).join('\n      ');
  return `<g class="el-pod el-pod--${index + 1}" data-el-pod="${running ? 'running' : 'absent'}" data-el-size="${running ? 'std' : 'slot'}">
      ${rects}
    </g>`;
};

/** One node cell: the outline, the two pod slots in it, and its ghost. */
const nodeCell = (index: number): string => {
  const cx = NODE_X[index] ?? 0;
  const state: NodeState = index === 0 ? 'full' : index === 1 ? 'active' : 'absent';
  const slots = [-SLOT_DX, SLOT_DX]
    .map(
      (dx, slot) =>
        `<rect class="el-slot el-slot--${slot + 1}" x="${cx + dx - SLOT_SIDE / 2}" y="${SLOT_Y}" width="${SLOT_SIDE}" height="${SLOT_SIDE}" rx="10" />`,
    )
    .join('\n      ');
  return `<g class="el-node el-node--${index + 1}" data-el-node="${state}">
      <rect class="el-node-ghost" x="${cx - NODE_W / 2}" y="${NODE_Y}" width="${NODE_W}" height="${NODE_H}" rx="18" />
      <rect class="el-node-box" x="${cx - NODE_W / 2}" y="${NODE_Y}" width="${NODE_W}" height="${NODE_H}" rx="18" />
      ${slots}
    </g>`;
};

const stageAttrs = Object.entries(STAGE_STATE)
  .filter(([key]) => key.startsWith('stage@'))
  .map(([key, value]) => `${key.slice('stage@'.length)}="${value}"`)
  .join(' ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageAttrs} aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_LANE, Y_LOAD_BOTTOM, Y_PODS_TOP, 'scene-link el-lane el-lane--demand')}
  ${verticalLink(X_LANE, Y_PODS_BOTTOM, Y_NODES_TOP, 'scene-link el-lane el-lane--schedule')}

  ${clientBox({
    x: LOAD.x,
    width: LOAD.w,
    y: LOAD.y,
    height: LOAD.h,
    title: 'Load',
    titleX: 170,
    titleY: LOAD_TITLE_Y,
    titleClass: 'el-band',
    titleAnchor: null,
    extraClass: 'el-load',
    children: `
    <text class="el-word" x="170" y="${DEMAND_LABEL_Y}">demand</text>
    <rect class="scene-track el-gauge-track" x="${GAUGE_X}" y="${GAUGE_Y}" width="${GAUGE_W}" height="${GAUGE_H}" rx="${GAUGE_H / 2}" />
    ${gaugeFills}`,
  })}

  ${nodeFrame({
    y: PODS.y,
    height: PODS.h,
    label: 'Pods',
    labelY: PODS_TITLE_Y,
    labelClass: 'el-band',
    children: `    ${valueVariants(CPU_X, PODS_TITLE_Y, 'el-cpu', CPU_VALUES, (n) => mono(`cpu ${n}%`), 'middle', 4)}

    ${counterVariants({
      x: PODS_COUNT_X,
      y: PODS_TITLE_Y,
      className: 'el-pods',
      max: POD_MAX,
      format: (n) => mono(`pods ${n}`),
      anchor: 'end',
      indent: 4,
    })}

    <rect class="el-fixed el-fixed--peak" x="${FIXED.x}" y="${FIXED.y}" width="${FIXED.w}" height="${FIXED.h}" rx="26" />
    <rect class="el-fixed el-fixed--idle" x="${FIXED.x}" y="${FIXED.y}" width="${FIXED.w}" height="${FIXED.h}" rx="26" />

    ${POD_X.map((_x, index) => podCapsule(index)).join('\n\n    ')}

    <text class="el-word el-resize el-resize--on" x="${RESIZE_X}" y="${WORD_Y}" text-anchor="middle">resize</text>
    <text class="el-word el-pending el-pending--on" x="${PENDING_X}" y="${WORD_Y}" text-anchor="middle">pending</text>`,
  })}

  ${serviceBox({
    x: NODES.x,
    width: NODES.w,
    y: NODES.y,
    height: NODES.h,
    title: 'Nodes',
    titleX: NODES_TITLE_X,
    titleY: NODES_TITLE_Y,
    titleClass: 'el-band',
    titleAnchor: null,
    className: 'scene-service el-nodes',
    children: `
    ${counterVariants({
      x: NODES_COUNT_X,
      y: NODES_TITLE_Y,
      className: 'el-nodecount',
      max: NODE_MAX,
      format: (n) => mono(`nodes ${n}`),
      anchor: 'end',
      indent: 4,
    })}

    ${NODE_X.map((_x, index) => nodeCell(index)).join('\n\n    ')}

    <text class="el-word el-drain el-drain--on" x="${DRAIN_X}" y="${DRAIN_Y}" text-anchor="middle">drain</text>`,
  })}

  ${requestsLayer()}
</svg>`;
