/**
 * Static stage markup for the State Machine scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. The bands are the usual ones, with
 * the node band taken down to y 1450 because the machine is a diagram rather
 * than a single widget, and the bottom band taken down to y 1830 because the
 * engine keeps a history under its timer:
 *   - y 0..440       kept empty for the step title card
 *   - y 440..680     Events: the alphabet of the machine, and the one outlet
 *                    every event leaves by
 *   - y 790          the event rail, and the three drops that reach a column
 *   - y 880..1450    the order lifecycle: seven state nodes on three rows, the
 *                    edges between them, and the guard and action tags
 *   - y 1500..1830   Store on the left, holding the row the state lives in,
 *                    and Process on the right, which becomes the workflow
 *                    engine with its timer, its history and its replay bar
 *
 * Everything travels on a lane, and every lane is horizontal or vertical.
 *
 * The columns are 300px apart and every node is 154 wide, so a lane down the
 * middle of one column clears the nodes either side of it by 8px with a 130
 * wide chip on it. That is what fixes the three rows: the active states sit on
 * row 1 at the column centres, the two states an order can be abandoned in sit
 * on row 2 half a column across, and the two states it can end in sit on row 3.
 * Every transition is then one leg or two, and the corner of a two-leg route is
 * a point that already lies on another edge — (390, `H1`) on the submit edge and
 * (690, `H1`) on the pay edge.
 *
 * The rule the whole layout is built around: a title never sits over a lane. A
 * row 1 node is only ever entered and left sideways, so it writes its name
 * above the berth; a row 2 or row 3 node is entered from above, so it writes
 * its name below the berth and leaves the top of itself clear. For the same
 * reason an event chip stops at y 856, above the frame, on the column of the
 * state it is delivered to: a drop into a node would cross that node's name,
 * and a drop to row 3 would cross the row 1 node standing over it.
 *
 * One number decides how long the timer takes: 24 real hours are drawn as
 * `TIMER_SECONDS` scene seconds, and the label keeps the real value.
 */

import {
  VIEWBOX,
  clientBox,
  counterVariants,
  nodeFrame,
  requestsLayer,
  serviceBox,
  timerRing,
  verticalLink,
} from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- the events band -------------------------------------------------------

const EVENTS_X = 200;
const EVENTS_W = 680;
const EVENTS_Y = 440;
const EVENTS_H = 240;
const EVENTS_TITLE_Y = 512;
const ALPHABET_Y = 556;

/** The one outlet every event leaves by, and the rail it drops onto. */
export const X_EVENT = 540;
export const Y_EVENT = 620;
export const Y_RAIL = 790;

/**
 * Where an event chip stops: above the frame, on the column of the state it is
 * delivered to. Nothing is written between the frame edge and here.
 */
export const Y_HANDOFF = 856;

// --- the lifecycle band ----------------------------------------------------

const FRAME_Y = 880;
const FRAME_H = 570;
export const FRAME_TOP = FRAME_Y;
export const FRAME_BOTTOM = FRAME_Y + FRAME_H;
const FRAME_LABEL_Y = 930;
const TAG_TOP_Y = 930;
const TAG_BOTTOM_Y = 1428;

/** The three column centres, which are also the three drop lanes from the rail. */
export const COL_LEFT = 240;
export const COL_MID = 540;
export const COL_RIGHT = 840;

/** The two half-column lanes, which only the order chip travels on. */
const COL_HALF_LEFT = 390;
const COL_HALF_RIGHT = 690;

const NODE_W = 154;
const NODE_H = 130;
const HALF_W = NODE_W / 2;

const ROW1_TOP = 950;
const ROW2_TOP = 1106;
const ROW3_TOP = 1262;

/** The berth of each row: where the order chip stands while it is in a state. */
export const H1 = ROW1_TOP + 96;
export const H2 = ROW2_TOP + 36;
export const H3 = ROW3_TOP + 36;

/** The seven states, in the spelling the diagram shows. */
export const STATES = [
  'draft',
  'submitted',
  'paid',
  'shipped',
  'delivered',
  'cancelled',
  'expired',
] as const;
export type StateKey = (typeof STATES)[number];

interface NodePlace {
  x: number;
  top: number;
  berth: number;
  label: string;
  /** Row 1 writes its name above the berth; rows 2 and 3 write it below. */
  titleAbove: boolean;
}

export const PLACES: Record<StateKey, NodePlace> = {
  draft: { x: COL_LEFT, top: ROW1_TOP, berth: H1, label: 'Draft', titleAbove: true },
  submitted: { x: COL_MID, top: ROW1_TOP, berth: H1, label: 'Submitted', titleAbove: true },
  paid: { x: COL_RIGHT, top: ROW1_TOP, berth: H1, label: 'Paid', titleAbove: true },
  expired: { x: COL_HALF_LEFT, top: ROW2_TOP, berth: H2, label: 'Expired', titleAbove: false },
  cancelled: { x: COL_HALF_RIGHT, top: ROW2_TOP, berth: H2, label: 'Cancelled', titleAbove: false },
  delivered: { x: COL_MID, top: ROW3_TOP, berth: H3, label: 'Delivered', titleAbove: false },
  shipped: { x: COL_RIGHT, top: ROW3_TOP, berth: H3, label: 'Shipped', titleAbove: false },
};

/**
 * The drop lane an event is delivered on. Row 1 states have a lane of their
 * own; the rows below are reached over the lane of the column they sit under,
 * because only three lanes leave the rail.
 */
export const COLUMN_OF: Record<StateKey, number> = {
  draft: COL_LEFT,
  submitted: COL_MID,
  paid: COL_RIGHT,
  expired: COL_MID,
  cancelled: COL_RIGHT,
  delivered: COL_MID,
  shipped: COL_RIGHT,
};

/** The corners a two-leg transition may turn at. Both lie on another edge. */
export const JUNCTIONS: [number, number][] = [
  [COL_HALF_LEFT, H1],
  [COL_HALF_RIGHT, H1],
];

/** Every edge of the machine, as the list of corners it is drawn through. */
export const EDGE_PATHS: Record<string, [number, number][]> = {
  submit: [
    [COL_LEFT + HALF_W, H1],
    [COL_MID - HALF_W, H1],
  ],
  pay: [
    [COL_MID + HALF_W, H1],
    [COL_RIGHT - HALF_W, H1],
  ],
  timeout: [
    [COL_MID - HALF_W, H1],
    [COL_HALF_LEFT, H1],
    [COL_HALF_LEFT, ROW2_TOP],
  ],
  'cancel-submitted': [
    [COL_MID + HALF_W, H1],
    [COL_HALF_RIGHT, H1],
    [COL_HALF_RIGHT, ROW2_TOP],
  ],
  'cancel-paid': [
    [COL_RIGHT - HALF_W, H1],
    [COL_HALF_RIGHT, H1],
    [COL_HALF_RIGHT, ROW2_TOP],
  ],
  ship: [
    [COL_RIGHT, ROW1_TOP + NODE_H],
    [COL_RIGHT, ROW3_TOP],
  ],
  deliver: [
    [COL_RIGHT - HALF_W, H3],
    [COL_MID + HALF_W, H3],
  ],
};

// --- the bottom band -------------------------------------------------------

const STORE_X = 130;
const STORE_W = 390;
const BOTTOM_Y = 1500;
const BOTTOM_H = 330;
const STORE_CX = STORE_X + STORE_W / 2;
const STORE_TITLE_Y = 1562;
const ROW_X = 158;
const ROW_W = 334;
const ROW_H = 68;
const ROW_A_Y = 1600;
const ROW_B_Y = 1696;
const ROW_A_TEXT_Y = 1640;
const ROW_B_TEXT_Y = 1736;
const ID_X = 178;
const DOT_X = 232;
const VALUE_X = 254;

const PROC_X = 560;
const PROC_W = 390;
const PROC_CX = PROC_X + PROC_W / 2;
const PROC_TITLE_Y = 1562;
const RING_CX = 628;
const RING_CY = 1640;
const RING_R = 40;
const RING_LABEL_Y = 1716;
const READOUT_X = 700;
const READOUT_Y = 1636;
const RETRY_Y = 1676;
const HIST_LABEL_X = 586;
const HIST_LABEL_Y = 1760;
const REPLAY_LABEL_Y = 1806;

/** Six history cells, of which the scene fills five. */
export const HISTORY_CELLS = 6;
const CELL_X = 690;
const CELL_W = 34;
const CELL_GAP = 6;
const CELL_Y = 1738;
const CELL_H = 40;
export const REPLAY_W = HISTORY_CELLS * CELL_W + (HISTORY_CELLS - 1) * CELL_GAP;

/** The lanes that join the three bands. */
export const X_STORE_LINK = STORE_CX;
export const X_PROC_LINK = PROC_CX;

/** How many attempts the engine makes at a step before it gives up. */
export const MAX_ATTEMPTS = 3;

/**
 * How long the twenty four hour timer takes on the stage. Eight real hours to
 * the scene second; the label keeps the real value.
 */
export const TIMER_SECONDS = 3;

/** The circumference the ring's progress circle is offset by. */
export const RING_CIRCUMFERENCE = Number((2 * Math.PI * RING_R).toFixed(2));

/**
 * What every `data-*` on the stage starts at. The markup below is written from
 * this, so a change that writes a value something already holds can be dropped
 * rather than tweened.
 */
export const STAGE_STATE: Record<string, string> = {
  'stage@data-state': 'none',
  'stage@data-reject': 'none',
  'stage@data-guard': 'off',
  'stage@data-action': 'off',
  'stage@data-hold': 'off',
  'stage@data-order': 'none',
  'stage@data-store': 'none',
  'stage@data-due': 'none',
  'stage@data-timer': 'off',
  'stage@data-resume': 'off',
  'stage@data-proc': 'up',
  'stage@data-engine': 'off',
  'stage@data-step': 'idle',
  'stage@data-retry': '0',
  'stage@data-replay': 'off',
  'edge-submit@data-edge-state': 'none',
  'edge-pay@data-edge-state': 'none',
  'edge-timeout@data-edge-state': 'none',
  'edge-cancel-submitted@data-edge-state': 'none',
  'edge-cancel-paid@data-edge-state': 'none',
  'edge-ship@data-edge-state': 'none',
  'edge-deliver@data-edge-state': 'none',
  'hist-1@data-cell': 'none',
  'hist-2@data-cell': 'none',
  'hist-3@data-cell': 'none',
  'hist-4@data-cell': 'none',
  'hist-5@data-cell': 'none',
  'hist-6@data-cell': 'none',
};

// --- markup ----------------------------------------------------------------

/** One state node: a box, a berth the order chip stands in, and a name. */
const stateNode = (key: StateKey): string => {
  const place = PLACES[key];
  const titleY = place.titleAbove ? place.top + 36 : place.top + 106;
  return `<g class="sm-node sm-node--${key}">
      <rect class="scene-box sm-node-box" x="${place.x - HALF_W}" y="${place.top}" width="${NODE_W}" height="${NODE_H}" rx="22" />
      <text class="scene-node-label sm-node-title" x="${place.x}" y="${titleY}" text-anchor="middle">${place.label}</text>
    </g>`;
};

/** One edge, drawn through its corners with a head pointing into the target. */
const edge = (key: string): string => {
  const points = EDGE_PATHS[key] ?? [];
  const last = points[points.length - 1];
  const previous = points[points.length - 2];
  const d = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
  let head = '';
  if (last && previous) {
    const [lx, ly] = last;
    const [px, py] = previous;
    const size = 11;
    head =
      py === ly
        ? px < lx
          ? `M ${lx} ${ly} L ${lx - size} ${ly - size} M ${lx} ${ly} L ${lx - size} ${ly + size}`
          : `M ${lx} ${ly} L ${lx + size} ${ly - size} M ${lx} ${ly} L ${lx + size} ${ly + size}`
        : `M ${lx} ${ly} L ${lx - size} ${ly - size} M ${lx} ${ly} L ${lx + size} ${ly - size}`;
  }
  return `<g class="sm-edge sm-edge--${key}" data-edge-state="none">
      <path class="sm-edge-line" d="${d}" />
      <path class="sm-edge-head" d="${head}" />
    </g>`;
};

/** The row the store holds: an order id, a separator, and a state. */
const storeValue = (): string => {
  const ids = ['12', '13', '14', '15']
    .map(
      (id) =>
        `<text class="scene-mono sm-row-id sm-row-id--${id}" x="${ID_X}" y="${ROW_A_TEXT_Y}">#${id}</text>`,
    )
    .join('\n      ');
  const values = STATES.map(
    (key) =>
      `<text class="scene-mono sm-row-state sm-row-state--${key}" x="${VALUE_X}" y="${ROW_A_TEXT_Y}">state = ${PLACES[key].label}</text>`,
  ).join('\n      ');
  return `${ids}
      <text class="scene-mono sm-row-dot" x="${DOT_X}" y="${ROW_A_TEXT_Y}">&#183;</text>
      ${values}`;
};

/** One cell of the history strip. */
const historyCell = (index: number): string => {
  const x = CELL_X + index * (CELL_W + CELL_GAP);
  const cx = x + CELL_W / 2;
  const cy = CELL_Y + CELL_H / 2;
  return `<g class="sm-cell sm-cell--${index + 1}" data-cell="none">
      <rect class="sm-cell-bg" x="${x}" y="${CELL_Y}" width="${CELL_W}" height="${CELL_H}" rx="10" />
      <path class="sm-cell-glyph sm-cell-glyph--wait" d="M ${cx - 8} ${cy} L ${cx + 8} ${cy}" />
      <path class="sm-cell-glyph sm-cell-glyph--ok" d="M ${cx - 8} ${cy} L ${cx - 2} ${cy + 6} L ${cx + 8} ${cy - 7}" />
      <path class="sm-cell-glyph sm-cell-glyph--fail" d="M ${cx - 7} ${cy - 7} L ${cx + 7} ${cy + 7} M ${cx + 7} ${cy - 7} L ${cx - 7} ${cy + 7}" />
    </g>`;
};

const stepReadout = ['idle', 'running', 'restart', 'wait for approval', 'ship', 'deliver', 'replay']
  .map(
    (label) =>
      `<text class="sm-readout sm-readout--${label.replace(/ /g, '-')}" x="${READOUT_X}" y="${READOUT_Y}">${label}</text>`,
  )
  .join('\n    ');

const retryCounter = counterVariants({
  x: READOUT_X,
  y: RETRY_Y,
  className: 'sm-retry',
  count: MAX_ATTEMPTS + 1,
  format: (n) => (n === 0 ? '' : `retry ${n}/${MAX_ATTEMPTS}`),
  indent: 4,
});

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" data-state="none" data-reject="none" data-guard="off" data-action="off" data-hold="off" data-order="none" data-store="none" data-due="none" data-timer="off" data-resume="off" data-proc="up" data-engine="off" data-step="idle" data-retry="0" data-replay="off" aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_EVENT, EVENTS_Y + EVENTS_H, Y_RAIL)}
  <line class="scene-link" x1="${COL_LEFT}" y1="${Y_RAIL}" x2="${COL_RIGHT}" y2="${Y_RAIL}" />
  ${verticalLink(COL_LEFT, Y_RAIL, FRAME_TOP)}
  ${verticalLink(COL_MID, Y_RAIL, FRAME_TOP)}
  ${verticalLink(COL_RIGHT, Y_RAIL, FRAME_TOP)}
  ${verticalLink(X_STORE_LINK, FRAME_BOTTOM, BOTTOM_Y, 'scene-link sm-store-link')}
  ${verticalLink(X_PROC_LINK, FRAME_BOTTOM, BOTTOM_Y)}

  ${clientBox({
    x: EVENTS_X,
    width: EVENTS_W,
    y: EVENTS_Y,
    height: EVENTS_H,
    title: 'Events',
    titleY: EVENTS_TITLE_Y,
    children: `
    <text class="sm-alphabet" x="${X_EVENT}" y="${ALPHABET_Y}" text-anchor="middle">submit &#183; pay &#183; ship &#183; deliver &#183; cancel &#183; timeout &#183; approve</text>`,
  })}

  ${nodeFrame({
    y: FRAME_Y,
    height: FRAME_H,
    label: 'Order lifecycle',
    labelY: FRAME_LABEL_Y,
    labelClass: 'scene-node-label sm-frame-label',
    children: `    <text class="sm-tag sm-tag--guard" x="420" y="${TAG_TOP_Y}">guard: payment confirmed</text>
    <text class="sm-tag sm-tag--action" x="700" y="${TAG_TOP_Y}">action: send receipt</text>
    <text class="sm-tag sm-tag--refund" x="170" y="${TAG_BOTTOM_Y}">action: refund</text>
    <text class="sm-tag sm-tag--timeout" x="430" y="${TAG_BOTTOM_Y}">timeout after 24 h</text>

    ${Object.keys(EDGE_PATHS)
      .map((key) => edge(key))
      .join('\n    ')}

    ${STATES.map((key) => stateNode(key)).join('\n    ')}`,
  })}

  ${serviceBox({
    x: STORE_X,
    width: STORE_W,
    y: BOTTOM_Y,
    height: BOTTOM_H,
    title: 'Store',
    titleX: STORE_CX,
    titleY: STORE_TITLE_Y,
    className: 'sm-store',
    children: `
    <rect class="sm-row-bg sm-row-bg--a" x="${ROW_X}" y="${ROW_A_Y}" width="${ROW_W}" height="${ROW_H}" rx="16" />
    <rect class="sm-row-bg sm-row-bg--b" x="${ROW_X}" y="${ROW_B_Y}" width="${ROW_W}" height="${ROW_H}" rx="16" />
    ${storeValue()}
    <text class="scene-mono sm-due sm-due--armed" x="${ID_X}" y="${ROW_B_TEXT_Y}">timer &#183; due in 24 h</text>
    <text class="scene-mono sm-due sm-due--fired" x="${ID_X}" y="${ROW_B_TEXT_Y}">timer &#183; fired</text>`,
  })}

  ${serviceBox({
    x: PROC_X,
    width: PROC_W,
    y: BOTTOM_Y,
    height: BOTTOM_H,
    title: 'Process',
    titleX: PROC_CX,
    titleY: PROC_TITLE_Y,
    titleClass: 'scene-node-title sm-proc-title sm-proc-title--process',
    className: 'sm-proc',
    children: `
    <text class="scene-node-title sm-proc-title sm-proc-title--engine" x="${PROC_CX}" y="${PROC_TITLE_Y}" text-anchor="middle">Workflow engine</text>
    ${timerRing({
      cx: RING_CX,
      cy: RING_CY,
      r: RING_R,
      className: 'sm-timer',
      labelText: 'timer 24 h',
      labelY: RING_LABEL_Y,
      labelClass: 'scene-caption-label sm-timer-label',
    })}
    ${stepReadout}
    ${retryCounter}
    <text class="scene-caption-label sm-hist-label" x="${HIST_LABEL_X}" y="${HIST_LABEL_Y}">history</text>
    <text class="scene-caption-label sm-replay-label" x="${HIST_LABEL_X}" y="${REPLAY_LABEL_Y}">replay</text>
    ${Array.from({ length: HISTORY_CELLS }, (_value, index) => historyCell(index)).join('\n    ')}
    <rect class="sm-replay-bar" x="${CELL_X}" y="${CELL_Y}" width="0" height="${CELL_H}" rx="10" />`,
  })}

  ${requestsLayer()}
</svg>`;
