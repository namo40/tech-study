/**
 * Static stage markup for the Event Sourcing scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Four boxes, arranged around the one
 * thing the scene is about — the log:
 *   - y 0..440        kept empty for the step title card
 *   - y 440..680      App: the two commands it can send, `add` and `pay`
 *   - y 880..1270     Order on the left, which is the aggregate: the state card
 *                     `items n`, the `paid` badge, and the `replaying` badge it
 *                     raises while it is rebuilding itself. Log on the right,
 *                     which is the truth: `seq n`, the `snap @ n` card, and the
 *                     append-only column of event rows
 *   - y 1500..1740    Readers: the `projection` and `audit` chips, and `rows n`
 *
 * Three lanes and no others, and every one of them is axis aligned and runs
 * through the centre of the boxes it joins. A command goes down `X_CMD` from the
 * App's bottom edge to the Order's top edge and the acknowledgement comes back
 * up the same column. An append crosses `Y_BUS` from the Order's right edge to
 * the Log's left edge, and a replay read crosses the same 100px the other way:
 * the lane carries one direction at a time, which is the difference between
 * writing an event down and reading it back. An event on its way to a derived
 * view goes down `X_FEED` from the Log's bottom edge and is absorbed inside the
 * Readers' top edge.
 *
 * A traveller sweeps 26px around every point it reaches and a label keeps 30px
 * clear of that, so the three lanes own three keep-outs: x 254..366 from y 624
 * to y 936, x 434..646 from y 1019 to y 1131, and x 714..826 from y 1214 to
 * y 1556. That is what decides the layout. The App writes its name on the left
 * and its two command chips on the right, both above the first keep-out. The
 * Order keeps every one of its readouts left of x 434, so the append lane's
 * sweep never reaches a word. The Log starts its column at x 660, right of the
 * same sweep, and stops it at y 1204, above the feed lane's. The Readers name
 * themselves left of x 714 and put both chips below y 1556.
 *
 * The six event rows are a declared texture column: they are bars rather than
 * labels, because the log's argument is that it only ever grows, and the only
 * things that read the column are the count of written rows — which is `seq` by
 * construction — and which of them a replay is folding right now.
 */

import {
  VIEWBOX,
  chip,
  clientBox,
  counterVariants,
  requestsLayer,
  serviceBox,
  verticalLink,
} from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- geometry --------------------------------------------------------------

/** The command lane: the App's centre column, down to the Order and back up. */
export const X_CMD = 310;
export const Y_APP = 680;
export const Y_ORDER = 880;

/** The append lane, crossed one way by a write and the other by a read. */
export const Y_BUS = 1075;
export const X_ORDER_RIGHT = 490;
export const X_LOG_LEFT = 590;

/** The feed lane: the Log's centre column, down into the Readers. */
export const X_FEED = 770;
export const Y_LOG_BOTTOM = 1270;
export const Y_READERS = 1500;

/** The App band. */
const APP = { x: 130, y: 440, w: 820, h: 240 };
const APP_TITLE_X = 170;
const APP_TITLE_Y = 512;
const ADD_CHIP = { x: 600, y: 580, w: 140, h: 60 };
const PAY_CHIP = { x: 780, y: 580, w: 140, h: 60 };
const CMD_TEXT_Y = 618;

/** The Order band: the aggregate, and everything it says about itself. */
const ORDER = { x: 130, y: 880, w: 360, h: 390 };
const ORDER_LABEL_X = 152;
const ORDER_LABEL_Y = 934;
const CARD = { x: 152, y: 990, w: 272, h: 84 };
const CARD_TEXT_X = 288;
const CARD_TEXT_Y = 1044;
const PAID_CHIP = { x: 152, y: 1094, w: 162, h: 60 };
const PAID_TEXT_Y = 1133;
const REPLAY_CHIP = { x: 152, y: 1174, w: 242, h: 60 };
const REPLAY_TEXT_Y = 1213;

/** The Log band: the readout, the snapshot card, and the column of events. */
const LOG = { x: 590, y: 880, w: 360, h: 390 };
const LOG_LABEL_X = 612;
const LOG_LABEL_Y = 934;
const SEQ_X = 928;
const SEQ_Y = 934;
const SNAP_CARD = { x: 660, y: 962, w: 268, h: 60 };
const SNAP_TEXT_X = 794;
const SNAP_TEXT_Y = 1001;
const ROW_X = 660;
const ROW_W = 268;
const ROW_H = 22;
const ROW_PITCH = 28;
const ROW_TOP = 1042;

/** The Readers band. */
const READERS = { x: 280, y: 1500, w: 520, h: 240 };
const READERS_TITLE_X = 310;
const READERS_TITLE_Y = 1566;
const PROJ_CHIP = { x: 310, y: 1606, w: 246, h: 60 };
const AUDIT_CHIP = { x: 576, y: 1606, w: 122, h: 60 };
const CHIP_TEXT_Y = 1645;
const ROWS_X = 310;
const ROWS_Y = 1712;

// --- what the stage can count to -------------------------------------------

/** Events the log holds by the end, which is how many rows it is drawn with. */
export const MAX_SEQ = 6;
/** Highest reading of the state card, and of the projection's row count. */
export const MAX_ITEMS = 4;
export const MAX_ROWS = 6;

/** A lamp is either lit or it is not. */
export const LAMPS = ['off', 'on'] as const;
export type Lamp = (typeof LAMPS)[number];

/** What one event row can be: unwritten, written, being folded, behind a snapshot. */
export const ROW_STATES = ['none', 'on', 'read', 'snap'] as const;
export type RowState = (typeof ROW_STATES)[number];

/**
 * What every `data-*` on the stage starts at. The markup below is written from
 * these, so the first frame is the whole diagram in its opening state — an
 * empty aggregate, an empty log, no snapshot, no derived view — and the
 * timeline never has to restate what is already there.
 */
export const STAGE_STATE: Record<string, string> = {
  'data-es-items': '0',
  'data-es-paid': 'off',
  'data-es-replay': 'off',
  'data-es-seq': '0',
  'data-es-snap': 'off',
  'data-es-proj': 'off',
  'data-es-audit': 'off',
  'data-es-rows': '0',
  'data-es-settled': 'off',
};

/** What every row starts at, for the same reason. */
export const ROW_STATE: RowState = 'none';

// --- markup ----------------------------------------------------------------

/** Non-breaking spaces, so a monospaced label keeps its gaps in SVG. */
const mono = (text: string): string => text.replace(/ /g, '&#160;');

/**
 * A lamp with its own word written on it: one text element per state, stacked
 * on the same spot, with the widget class hiding both and the state picking the
 * one that shows. Nothing interpolates, so scrubbing backwards is exact.
 */
const lamp = (
  name: string,
  word: string,
  box: { x: number; y: number; w: number; h: number },
  textY: number,
  indent = 4,
): string => {
  const centre = box.x + box.w / 2;
  const text = LAMPS.map(
    (state) =>
      `<text class="scene-counter es-${name} es-${name}--${state}" x="${centre}" y="${textY}" text-anchor="middle">${word}</text>`,
  ).join(`\n${' '.repeat(indent + 2)}`);
  return chip({
    x: box.x,
    y: box.y,
    width: box.w,
    height: box.h,
    rx: 18,
    className: `es-chip-${name}`,
    variant: 'outline',
    text,
    indent,
  });
};

/** One of the two commands the App can send, named on a plate of its own. */
const command = (
  name: string,
  word: string,
  box: { x: number; y: number; w: number; h: number },
): string =>
  chip({
    x: box.x,
    y: box.y,
    width: box.w,
    height: box.h,
    rx: 18,
    className: `es-chip-${name}`,
    variant: 'outline',
    text: `<text class="scene-mono es-cmd-word" x="${box.x + box.w / 2}" y="${CMD_TEXT_Y}" text-anchor="middle">${word}</text>`,
  });

/** How many items the aggregate believes it is holding. */
const itemsReadout = counterVariants({
  x: CARD_TEXT_X,
  y: CARD_TEXT_Y,
  className: 'es-items',
  count: MAX_ITEMS + 1,
  anchor: 'middle',
  format: (n) => mono(`items ${n}`),
  indent: 4,
});

/** How many events the log holds, which is the only number that is authored. */
const seqReadout = counterVariants({
  x: SEQ_X,
  y: SEQ_Y,
  className: 'es-seq',
  count: MAX_SEQ + 1,
  anchor: 'end',
  format: (n) => mono(`seq ${n}`),
  indent: 4,
});

/** How many events the projection has folded in. */
const rowsReadout = counterVariants({
  x: ROWS_X,
  y: ROWS_Y,
  className: 'es-rows',
  count: MAX_ROWS + 1,
  format: (n) => mono(`rows ${n}`),
  indent: 2,
});

/**
 * The snapshot card: a plate that is not there at all until one is stored, and
 * then names the sequence number it was taken at. One text per number it could
 * name, so the card never has to be rewritten.
 */
const snapCard = `<g class="es-snap">
    <rect class="scene-chip-outline es-snap-bg" x="${SNAP_CARD.x}" y="${SNAP_CARD.y}" width="${SNAP_CARD.w}" height="${SNAP_CARD.h}" rx="18" />
    ${Array.from({ length: MAX_SEQ }, (_value, index) => index + 1)
      .map(
        (n) =>
          `<text class="scene-counter scene-mono es-snap-text es-snap-text--${n}" x="${SNAP_TEXT_X}" y="${SNAP_TEXT_Y}" text-anchor="middle">${mono(`snap @ ${n}`)}</text>`,
      )
      .join('\n    ')}
  </g>`;

/**
 * The log itself. One bar per event the scene will ever append, drawn from the
 * top down because that is the direction the log grows in, and carrying no name
 * of its own: what a row says is only whether it has been written, whether a
 * replay is folding it right now, and whether a snapshot has made reading it
 * unnecessary.
 */
const rows = Array.from(
  { length: MAX_SEQ },
  (_value, index) =>
    `<rect class="es-row es-row--${index + 1}" data-es-row="${ROW_STATE}" x="${ROW_X}" y="${ROW_TOP + index * ROW_PITCH}" width="${ROW_W}" height="${ROW_H}" rx="6" />`,
).join('\n    ');

const stageAttrs = Object.entries(STAGE_STATE)
  .map(([name, value]) => `${name}="${value}"`)
  .join(' ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageAttrs} aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_CMD, Y_APP, Y_ORDER)}
  <line class="scene-link es-lane-bus" x1="${X_ORDER_RIGHT}" y1="${Y_BUS}" x2="${X_LOG_LEFT}" y2="${Y_BUS}" />
  ${verticalLink(X_FEED, Y_LOG_BOTTOM, Y_READERS, 'scene-link es-lane-feed')}

  ${clientBox({
    x: APP.x,
    width: APP.w,
    y: APP.y,
    height: APP.h,
    title: 'App',
    titleX: APP_TITLE_X,
    titleY: APP_TITLE_Y,
    titleAnchor: null,
    children: `
    ${command('add', 'add', ADD_CHIP)}

    ${command('pay', 'pay', PAY_CHIP)}`,
  })}

  ${serviceBox({
    x: ORDER.x,
    width: ORDER.w,
    y: ORDER.y,
    height: ORDER.h,
    title: 'Order',
    titleX: ORDER_LABEL_X,
    titleY: ORDER_LABEL_Y,
    titleClass: 'scene-node-label',
    titleAnchor: null,
    className: 'scene-node es-order',
    children: `
    <rect class="es-card" x="${CARD.x}" y="${CARD.y}" width="${CARD.w}" height="${CARD.h}" rx="20" />
    ${itemsReadout}

    ${lamp('paid', 'paid', PAID_CHIP, PAID_TEXT_Y)}

    ${lamp('replay', 'replaying', REPLAY_CHIP, REPLAY_TEXT_Y)}`,
  })}

  ${serviceBox({
    x: LOG.x,
    width: LOG.w,
    y: LOG.y,
    height: LOG.h,
    title: 'Log',
    titleX: LOG_LABEL_X,
    titleY: LOG_LABEL_Y,
    titleClass: 'scene-node-label',
    titleAnchor: null,
    className: 'scene-node es-log',
    children: `
    ${seqReadout}

    ${snapCard}

    ${rows}`,
  })}

  ${serviceBox({
    x: READERS.x,
    width: READERS.w,
    y: READERS.y,
    height: READERS.h,
    title: 'Readers',
    titleX: READERS_TITLE_X,
    titleY: READERS_TITLE_Y,
    titleAnchor: null,
    className: 'scene-service es-readers',
    children: `
    ${lamp('proj', 'projection', PROJ_CHIP, CHIP_TEXT_Y)}

    ${lamp('audit', 'audit', AUDIT_CHIP, CHIP_TEXT_Y)}

  ${rowsReadout}`,
  })}

  ${requestsLayer()}
</svg>`;
