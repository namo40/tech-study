/**
 * Static stage markup for the Poison Message scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Four bands, arranged around the one
 * thing the scene is about — a message that fails every time it is handled, and
 * what that costs everyone standing behind it:
 *   - y 0..400        above the cropped viewBox (see shared VIEWBOX)
 *   - y 400..440      the frame's top padding; nothing is drawn here
 *   - y 440..680      the Queue, drawn as a row of message cells with the head
 *                     on the LEFT, the poison cell marked `bad`, and the two
 *                     readings that say what the blockage costs: `depth n` and
 *                     `age n s`, the wait of the message at the head
 *   - y 880..1270     the Consumer on the left with its result mark, `attempt n`
 *                     for the delivery count of whatever is being retried, and
 *                     `ok n` / `fail n`; the Retry box on the right with its
 *                     delay-queue cells and the `delay n s` timer ring
 *   - y 1500..1740    the dead-letter queue, with the isolated message, `dead n`
 *                     and the `alert` lamp
 *
 * Three lane segments and no others, every one axis aligned:
 *   - `X_WORK` (310) between the bottom of the Queue and the top of the
 *     Consumer. It is the only lane that carries traffic both ways: a delivery
 *     goes down it and a failed delivery comes back up it, because a redelivery
 *     is the same message returning rather than a new one. The schedule keeps
 *     the two apart — the poison message is the only thing that ever comes back,
 *     and it is never on the lane at the same time as anything else.
 *   - `Y_SIDE` (1075) from the right edge of the Consumer to the left edge of
 *     the Retry box, which is the move that saves the main line.
 *   - `X_DEAD` (770) from the bottom of the Retry box into the top edge of the
 *     dead-letter queue, once the retry budget is spent.
 *
 * Re-injection from Retry back to the Queue is a state change rather than a
 * traveller: the timer fires and the cell reappears at the back of the row.
 *
 * A traveller sweeps 26px around every point it reaches and a label keeps 30px
 * clear of that, so the three segments own three keep-outs: x 254..366 from
 * y 624 to y 936; x 434..646 from y 1019 to y 1131; and x 714..826 from y 1214
 * to y 1556. That is what decides the layout. The Queue keeps its title and its
 * two readings on one baseline above the cell row, well clear of the column
 * below it. The Consumer names itself below y 936 rather than at the top of its
 * box, and stacks its three readings down the left margin where the side lane
 * does not reach. The Retry box holds its cells and its ring to the right of
 * x 646. The dead-letter queue writes everything below y 1600, under the point
 * the last lane stops.
 *
 * Declared texture: the six Queue cells, the two Retry cells and the two DLQ
 * cells. A cell says where a message is standing and whether it is the poison
 * one; the word `bad` rides with that message and is written once, wherever it
 * currently is, including on the dot while it is travelling.
 */

import {
  VIEWBOX,
  clientBox,
  counterVariants,
  requestsLayer,
  serviceBox,
  timerRing,
  verticalLink,
} from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- geometry --------------------------------------------------------------

/** The three lanes, and the five edges they run between. */
export const X_WORK = 310;
export const Y_QUEUE_BOTTOM = 680;
export const Y_MID_TOP = 880;
export const Y_SIDE = 1075;
export const X_CONSUMER_RIGHT = 490;
export const X_RETRY_LEFT = 590;
export const X_DEAD = 770;
export const Y_MID_BOTTOM = 1270;
export const Y_DLQ_TOP = 1500;

/** The Queue band, and the row of cells inside it. */
const QUEUE = { x: 130, y: 440, w: 820, h: 240 };
const QUEUE_TITLE_X = 152;
const READ_Y = 502;
const DEPTH_X = 640;
const AGE_X = 930;
export const CELL_XS = [215, 345, 475, 605, 735, 865] as const;
export const QUEUE_CELLS = CELL_XS.length;
const CELL_W = 110;
const CELL_H = 64;
const CELL_Y = 546;
const CELL_TEXT_Y = 588;

/** The Consumer band: the mark it shows for one result, and its three readings. */
const CONSUMER = { x: 130, y: 880, w: 360, h: 390 };
const CON_TITLE_X = 152;
const CON_TITLE_Y = 1000;
const TICK = { cx: 430, cy: 950, r: 38 };
const ATTEMPT_Y = 1085;
const OK_Y = 1150;
const FAIL_Y = 1215;

/** The Retry band: the delay queue, and the timer the wait is drawn as. */
const RETRY = { x: 590, y: 880, w: 360, h: 390 };
const RETRY_TITLE_X = 612;
const RETRY_TITLE_Y = 948;
export const RETRY_XS = [690, 820] as const;
export const RETRY_CELLS = RETRY_XS.length;
const RETRY_CELL_Y = 1000;
const RETRY_CELL_H = 60;
const RETRY_TEXT_Y = 1042;
const RING = { cx: 690, cy: 1160, r: 46 };
const DELAY_X = 930;
const DELAY_Y = 1174;

/** The dead-letter queue: where the poison message is put, and the lamp. */
const DLQ = { x: 280, y: 1500, w: 520, h: 240 };
const DLQ_TITLE_X = 302;
const DLQ_TITLE_Y = 1562;
export const DLQ_XS = [385, 555] as const;
export const DLQ_CELLS = DLQ_XS.length;
const DLQ_CELL_W = 150;
const DLQ_CELL_H = 60;
const DLQ_CELL_Y = 1600;
const DLQ_TEXT_Y = 1642;
const DEAD_X = 302;
const DEAD_Y = 1706;
const LAMP = { cx: 652, cy: 1697, r: 16 };
const ALERT_X = 778;

// --- what the stage can say about itself -----------------------------------

/** Highest reading each counter reaches, which is how many variants it draws. */
export const MAX_DEPTH = QUEUE_CELLS;
export const MAX_ATTEMPT = 8;
export const MAX_OK = 12;
export const MAX_FAIL = 8;
export const MAX_DEAD = 1;

/**
 * The head-of-line wait, sampled rather than ticked. A readout with one variant
 * per tenth of a second would be a hundred text elements on one spot, so the
 * simulation floors the true wait to one of these and the scene asserts that it
 * never computes anything else.
 */
export const AGE_STEPS = [0, 2, 4, 6, 8] as const;

/** The two waits the delay queue hands out, named by the policy they carry. */
export const DELAYS = [5, 15] as const;

/** What a Queue cell is: empty, holding a message, or holding the poison one. */
export const CELL_STATES = ['none', 'held', 'bad'] as const;
export type CellState = (typeof CELL_STATES)[number];

/** What a Retry cell is: empty, or holding the message that is waiting out a delay. */
export const SLOT_STATES = ['none', 'wait'] as const;
export type SlotState = (typeof SLOT_STATES)[number];

/** What a DLQ cell is: empty, or holding the message that ran out of attempts. */
export const DRAWER_STATES = ['none', 'dead'] as const;
export type DrawerState = (typeof DRAWER_STATES)[number];

/** What the scene is holding up for a moment, if anything. */
export const MARKS = ['none', 'promise', 'cost', 'isolated'] as const;
export type Mark = (typeof MARKS)[number];

/** What the Consumer's result mark is showing, if anything. */
export const TICKS = ['off', 'ok', 'fail'] as const;
export type Tick = (typeof TICKS)[number];

/**
 * What every `data-*` on the stage starts at. The markup is written from these,
 * so the first frame is the whole diagram in its opening state — two messages
 * waiting, a head that has not aged, nothing retried, nothing dead — and the
 * timeline never restates it.
 */
export const STAGE_STATE: Record<string, string> = {
  'data-pm-depth': '2',
  'data-pm-age': '0',
  'data-pm-peak': 'off',
  'data-pm-attempt': '0',
  'data-pm-ok': '0',
  'data-pm-fail': '0',
  'data-pm-delay': 'off',
  'data-pm-dead': '0',
  'data-pm-alert': 'off',
  'data-pm-mark': 'none',
  'data-pm-tick': 'off',
  'data-pm-settled': 'off',
};

/**
 * What every cell starts at. The scene opens on a line that is keeping up, so
 * two messages are already standing in the Queue and everything else is empty.
 */
export const CELL_START: readonly CellState[] = ['held', 'held', 'none', 'none', 'none', 'none'];
export const SLOT_STATE: SlotState = 'none';
export const DRAWER_STATE: DrawerState = 'none';

// --- markup ----------------------------------------------------------------

const pad = (n: number): string => `\n${' '.repeat(n)}`;

/**
 * One Queue cell: the box a message stands in, and the word that marks the one
 * message that cannot be handled. The word is a variant the cell state reveals,
 * so it is written once on the stage wherever the poison message happens to be.
 */
const queueCells = CELL_XS.map(
  (centre, index) =>
    `<g class="pm-cell pm-cell--${index}" data-pm-cell="${CELL_START[index] ?? 'none'}">
        <rect class="scene-slot pm-cell-box" x="${centre - CELL_W / 2}" y="${CELL_Y}" width="${CELL_W}" height="${CELL_H}" rx="14" />
        <text class="pm-bad" x="${centre}" y="${CELL_TEXT_Y}" text-anchor="middle">bad</text>
      </g>`,
).join(pad(6));

/** One Retry cell: the same idea, for the message that is waiting out a delay. */
const retryCells = RETRY_XS.map(
  (centre, index) =>
    `<g class="pm-slot pm-slot--${index}" data-pm-slot="${SLOT_STATE}">
        <rect class="scene-slot pm-slot-box" x="${centre - CELL_W / 2}" y="${RETRY_CELL_Y}" width="${CELL_W}" height="${RETRY_CELL_H}" rx="14" />
        <text class="pm-bad" x="${centre}" y="${RETRY_TEXT_Y}" text-anchor="middle">bad</text>
      </g>`,
).join(pad(6));

/** One DLQ cell: the drawer the message is isolated in, history and all. */
const drawerCells = DLQ_XS.map(
  (centre, index) =>
    `<g class="pm-drawer pm-drawer--${index}" data-pm-drawer="${DRAWER_STATE}">
        <rect class="scene-slot pm-drawer-box" x="${centre - DLQ_CELL_W / 2}" y="${DLQ_CELL_Y}" width="${DLQ_CELL_W}" height="${DLQ_CELL_H}" rx="14" />
        <text class="pm-bad" x="${centre}" y="${DLQ_TEXT_Y}" text-anchor="middle">bad</text>
      </g>`,
).join(pad(6));

const depthReadout = counterVariants({
  x: DEPTH_X,
  y: READ_Y,
  className: 'pm-depth',
  count: MAX_DEPTH + 1,
  format: (n) => `depth ${n}`,
  indent: 4,
});

/** The head-of-line wait, one variant per sampled value. */
const ageReadout = AGE_STEPS.map(
  (n) =>
    `<text class="scene-counter pm-age pm-age--${n}" x="${AGE_X}" y="${READ_Y}" text-anchor="end">age ${n} s</text>`,
).join(pad(4));

const attemptReadout = counterVariants({
  x: CON_TITLE_X,
  y: ATTEMPT_Y,
  className: 'pm-attempt',
  count: MAX_ATTEMPT + 1,
  format: (n) => `attempt ${n}`,
  indent: 4,
});

const okReadout = counterVariants({
  x: CON_TITLE_X,
  y: OK_Y,
  className: 'pm-ok',
  count: MAX_OK + 1,
  format: (n) => `ok ${n}`,
  indent: 4,
});

const failReadout = counterVariants({
  x: CON_TITLE_X,
  y: FAIL_Y,
  className: 'pm-fail',
  count: MAX_FAIL + 1,
  format: (n) => `fail ${n}`,
  indent: 4,
});

const deadReadout = counterVariants({
  x: DEAD_X,
  y: DEAD_Y,
  className: 'pm-dead',
  count: MAX_DEAD + 1,
  format: (n) => `dead ${n}`,
  indent: 4,
});

/** The wait the delay queue is currently serving, named by its policy value. */
const delayReadout = DELAYS.map(
  (n) =>
    `<text class="scene-counter pm-delay pm-delay--d${n}" x="${DELAY_X}" y="${DELAY_Y}" text-anchor="end">delay ${n} s</text>`,
).join(pad(4));

const stageAttrs = Object.entries(STAGE_STATE)
  .map(([name, value]) => `${name}="${value}"`)
  .join(' ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageAttrs} aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_WORK, Y_QUEUE_BOTTOM, Y_MID_TOP, 'scene-link pm-lane-work')}
  <line class="scene-link pm-lane-side" x1="${X_CONSUMER_RIGHT}" y1="${Y_SIDE}" x2="${X_RETRY_LEFT}" y2="${Y_SIDE}" />
  ${verticalLink(X_DEAD, Y_MID_BOTTOM, Y_DLQ_TOP, 'scene-link pm-lane-dead')}

  ${clientBox({
    x: QUEUE.x,
    width: QUEUE.w,
    y: QUEUE.y,
    height: QUEUE.h,
    title: 'Queue',
    titleX: QUEUE_TITLE_X,
    titleY: READ_Y,
    titleAnchor: null,
    extraClass: 'pm-queue',
    children: `
    ${depthReadout}

    ${ageReadout}

    <g>
      ${queueCells}
    </g>`,
  })}

  ${serviceBox({
    x: CONSUMER.x,
    width: CONSUMER.w,
    y: CONSUMER.y,
    height: CONSUMER.h,
    title: 'Consumer',
    titleX: CON_TITLE_X,
    titleY: CON_TITLE_Y,
    titleAnchor: null,
    className: 'scene-node pm-consumer',
    children: `
    <g class="pm-tick" transform="translate(${TICK.cx} ${TICK.cy})">
      <circle class="pm-tick-bg" r="${TICK.r}" />
      <path class="pm-tick-glyph pm-tick-glyph--ok" d="M -17 2 L -6 15 L 18 -13" />
      <path class="pm-tick-glyph pm-tick-glyph--fail" d="M -15 -15 L 15 15 M 15 -15 L -15 15" />
    </g>

    ${attemptReadout}

    ${okReadout}

    ${failReadout}`,
  })}

  ${serviceBox({
    x: RETRY.x,
    width: RETRY.w,
    y: RETRY.y,
    height: RETRY.h,
    title: 'Retry',
    titleX: RETRY_TITLE_X,
    titleY: RETRY_TITLE_Y,
    titleAnchor: null,
    className: 'scene-node pm-retry',
    children: `
    <g>
      ${retryCells}
    </g>

    ${timerRing({ cx: RING.cx, cy: RING.cy, r: RING.r, className: 'pm-ring', groupClass: 'pm-ring' })}

    ${delayReadout}`,
  })}

  ${serviceBox({
    x: DLQ.x,
    width: DLQ.w,
    y: DLQ.y,
    height: DLQ.h,
    title: 'DLQ',
    titleX: DLQ_TITLE_X,
    titleY: DLQ_TITLE_Y,
    titleAnchor: null,
    className: 'scene-service pm-dlq',
    children: `
    <g>
      ${drawerCells}
    </g>

    <circle class="pm-lamp" cx="${LAMP.cx}" cy="${LAMP.cy}" r="${LAMP.r}" />
    <text class="pm-alert" x="${ALERT_X}" y="${DEAD_Y}" text-anchor="end">alert</text>

    ${deadReadout}`,
  })}

  ${requestsLayer()}
</svg>`;
