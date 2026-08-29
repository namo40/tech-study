/**
 * Static stage markup for the Ordering scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Four bands, arranged around the one
 * question the scene asks — ordered with respect to what:
 *   - y 0..440        kept empty for the step title card
 *   - y 440..680      Producer: the events it emits, laid left to right in the
 *                     order it emitted them and coloured by the key each one
 *                     carries. The Producer knows the order; nothing downstream
 *                     is obliged to keep it
 *   - y 880..1270     the two partitions. P0 on the left with its log row, the
 *                     key it owns, and the `hot` gauge that reads its backlog;
 *                     P1 on the right with its own log row and its own key. In
 *                     the first step a bridge joins the two rows into one log
 *                     and the keys are not written at all, because there is no
 *                     routing rule yet
 *   - y 1500..1740    Consumers: the strip of results in the order they were
 *                     processed, the verdict on that order, and `balance n`
 *
 * Four lane segments and no others, every one axis aligned. An event goes down
 * `X_P0` or `X_P1` from the Producer's bottom edge to the partition top edge,
 * routed by its key; a processed event goes down the same two columns from the
 * partition bottom edge into the Consumers box. `X_P0` and `X_P1` are the centre
 * columns of P0 and P1, which is what makes the routing legible: the lane an
 * event takes is the partition it lands in.
 *
 * A traveller sweeps 26px around every point it reaches and a label keeps 30px
 * clear of that, so the four segments own four keep-outs: x 254..366 and
 * x 714..826 from y 624 to y 936, and the same two columns from y 1214 to
 * y 1556. That is what decides the layout. The Producer writes its name and its
 * event row above y 624. P0 and P1 name themselves at y 936 on the far left of
 * their boxes, and keep everything else between y 960 and y 1200. The Consumers
 * box centres its title between the two lanes and holds the result strip below
 * y 1590, where neither lane reaches.
 *
 * Declared texture: the Producer's event row, the two partition log rows, the
 * bridge and its two ghost cells, the `hot` gauge, and the Consumers result
 * strip. None of them carries a number. Which event is which is its position in
 * the row, because position is the only thing this scene is about; writing the
 * sequence twice is what would let the two copies disagree.
 */

import { VIEWBOX, chip, clientBox, requestsLayer, serviceBox, verticalLink } from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- geometry --------------------------------------------------------------

/** The two lane columns, each the centre of the partition it feeds. */
export const X_P0 = 310;
export const X_P1 = 770;

export const Y_PRODUCER_BOTTOM = 680;
export const Y_PART_TOP = 880;
export const Y_PART_BOTTOM = 1270;
export const Y_CONSUMERS_TOP = 1500;

/** The Producer band. */
const PRODUCER = { x: 130, y: 440, w: 820, h: 240 };
const PRODUCER_TITLE_X = 170;
const PRODUCER_TITLE_Y = 512;

/** Every event the Producer emits, in the order it emitted them. */
export const EMITS = 19;
const EMIT_X0 = 145;
const EMIT_PITCH = 42;
const EMIT_W = 34;
const EMIT_Y = 556;
const EMIT_H = 40;

/** The two partition boxes. */
const P0 = { x: 130, y: 880, w: 360, h: 390 };
const P1 = { x: 590, y: 880, w: 360, h: 390 };
const P0_TITLE_X = 152;
const P1_TITLE_X = 612;
const PART_TITLE_Y = 948;
const KEY_Y = 1010;

/** One log row per partition. P0 holds the popular key, so it is drawn longer. */
export const P0_CELLS = 11;
export const P1_CELLS = 6;
const CELL_W = 24;
const CELL_PITCH = 30;
const CELL_Y = 1040;
const CELL_H = 44;
const P0_CELL_X0 = 148;
const P1_CELL_X0 = 608;

/** The first step's single log: two cells joined into one row by a bridge. */
const GHOST_W = 64;
const GHOST_LEFT_X = 148;
const GHOST_RIGHT_X = 608;
const BRIDGE_Y = 1062;

/** The gauge that reads P0's backlog, and the word under which it reads it. */
const HOT_X = 152;
const HOT_Y = 1174;
const GAUGE = { x: 230, y: 1146, w: 230, h: 40 };
const GAUGE_WIDTHS: Record<Level, number> = { calm: 62, warm: 146, hot: 230 };

/** The Consumers band. */
const CONSUMERS = { x: 280, y: 1500, w: 520, h: 240 };
const CONSUMERS_TITLE_Y = 1560;

/** One slot per processed event, filled in the order they were processed. */
export const SLOTS = 19;
const SLOT_X0 = 305;
const SLOT_PITCH = 25;
const SLOT_W = 19;
const SLOT_Y = 1600;
const SLOT_H = 34;

const VERDICT_PLATE = { x: 306, y: 1662, w: 210, h: 54 };
const VERDICT_TEXT_Y = 1698;
const BALANCE_X = 546;
const BALANCE_Y = 1700;

// --- what the stage can say about itself -----------------------------------

/**
 * Whether the middle band is one log or two partitions. `single` is the first
 * step, where nothing routes by key and the bridge joins the two rows.
 */
export const MODES = ['single', 'keyed'] as const;
export type Mode = (typeof MODES)[number];

/** How the gauge reads P0's backlog. Three levels, none of them interpolated. */
export const LEVELS = ['calm', 'warm', 'hot'] as const;
export type Level = (typeof LEVELS)[number];

/** The verdict on the order the Consumers processed things in. */
export const VERDICTS = ['ordered', 'reordered'] as const;
export type Verdict = (typeof VERDICTS)[number];

/** What a Producer event is: not emitted yet, or carrying one of the two keys. */
export const EMIT_STATES = ['none', 'k7', 'k9'] as const;
export type EmitState = (typeof EMIT_STATES)[number];

/** What a log cell is: unwritten, appended and waiting, or processed. */
export const CELL_STATES = ['none', 'live', 'done'] as const;
export type CellState = (typeof CELL_STATES)[number];

/**
 * What a result slot is. `oops` is a slot filled by an event that arrived out
 * of its key's publish order, which is the one thing the strip has to say that
 * a key colour cannot.
 */
export const SLOT_STATES = ['none', 'k7', 'k9', 'oops'] as const;
export type SlotState = (typeof SLOT_STATES)[number];

/** What the scene is holding up for a moment, if anything. */
export const MARKS = ['none', 'keys', 'cost', 'design'] as const;
export type Mark = (typeof MARKS)[number];

/**
 * Every balance the account passes through, in the order it reaches them. The
 * readout is one text element per value with the state picking one, so the
 * simulation asserts that every balance it computes is in this list and a drift
 * in the amounts fails the build rather than blanking the readout.
 */
export const BALANCES = [0, -30, 70, 170, 140, 240, 210, 310, 280, 380, 350, 450, 420, 520] as const;

/** The class suffix for a balance, since a class cannot start with a minus. */
export const balanceKey = (value: number): string =>
  value < 0 ? `m${-value}` : String(value);

/**
 * What every `data-*` on the stage starts at. The markup below is written from
 * these, so the first frame is the whole diagram in its opening state — one
 * bridged log with nothing in it, no key routing, an empty result strip, a
 * balance of zero and no complaint about the order — and the timeline never
 * restates it.
 */
export const STAGE_STATE: Record<string, string> = {
  'data-od-mode': 'single',
  'data-od-balance': '0',
  'data-od-verdict': 'ordered',
  'data-od-hot': 'calm',
  'data-od-idle': 'off',
  'data-od-mark': 'none',
  'data-od-settled': 'off',
};

/** What every Producer mark, log cell, ghost cell and result slot starts at. */
export const EMIT_STATE: EmitState = 'none';
export const CELL_STATE: CellState = 'none';
export const SLOT_STATE: SlotState = 'none';

// --- markup ----------------------------------------------------------------

/** Non-breaking spaces, so a monospaced label keeps its gaps in SVG. */
const mono = (text: string): string => text.replace(/ /g, '&#160;');

const pad = (n: number): string => `\n${' '.repeat(n)}`;

/** The Producer's row: one mark per event, in the order it was emitted. */
const emits = Array.from(
  { length: EMITS },
  (_value, index) =>
    `<rect class="od-emit od-emit--${index + 1}" data-od-emit="${EMIT_STATE}" x="${EMIT_X0 + index * EMIT_PITCH}" y="${EMIT_Y}" width="${EMIT_W}" height="${EMIT_H}" rx="8" />`,
).join(pad(4));

/** One partition's log row: cells appended left to right and never rewritten. */
const cells = (part: 'p0' | 'p1', count: number, x0: number, indent: number): string =>
  Array.from(
    { length: count },
    (_value, index) =>
      `<rect class="od-cell od-cell-${part} od-cell-${part}--${index + 1}" data-od-cell="${CELL_STATE}" x="${x0 + index * CELL_PITCH}" y="${CELL_Y}" width="${CELL_W}" height="${CELL_H}" rx="8" />`,
  ).join(pad(indent));

/**
 * The first step's log. Two cells and the bridge that makes them one row: an
 * event went left and an event went right, and because no rule sent them there
 * either consumer may take either one.
 */
const ghost = `<g class="od-ghost">
    <line class="od-bridge" x1="${GHOST_LEFT_X + GHOST_W}" y1="${BRIDGE_Y}" x2="${GHOST_RIGHT_X}" y2="${BRIDGE_Y}" />
    <rect class="od-gcell od-gcell--1" data-od-ghost="${CELL_STATE}" x="${GHOST_LEFT_X}" y="${CELL_Y}" width="${GHOST_W}" height="${CELL_H}" rx="8" />
    <rect class="od-gcell od-gcell--2" data-od-ghost="${CELL_STATE}" x="${GHOST_RIGHT_X}" y="${CELL_Y}" width="${GHOST_W}" height="${CELL_H}" rx="8" />
  </g>`;

/** The gauge: a track and one fill per level, with the state showing one. */
const gauge = `<g>
      <rect class="scene-track od-gauge-track" x="${GAUGE.x}" y="${GAUGE.y}" width="${GAUGE.w}" height="${GAUGE.h}" rx="${GAUGE.h / 2}" />
      ${LEVELS.map(
        (level) =>
          `<rect class="od-gauge-fill od-gauge-fill--${level}" x="${GAUGE.x}" y="${GAUGE.y}" width="${GAUGE_WIDTHS[level]}" height="${GAUGE.h}" rx="${GAUGE.h / 2}" />`,
      ).join(pad(6))}
    </g>`;

/** The strip of results, filled in the order the Consumers processed them. */
const slots = Array.from(
  { length: SLOTS },
  (_value, index) =>
    `<rect class="od-slot od-slot--${index + 1}" data-od-slot="${SLOT_STATE}" x="${SLOT_X0 + index * SLOT_PITCH}" y="${SLOT_Y}" width="${SLOT_W}" height="${SLOT_H}" rx="6" />`,
).join(pad(4));

/** The verdict plate: two words on one plate, and the state picks one. */
const verdictPlate = chip({
  x: VERDICT_PLATE.x,
  y: VERDICT_PLATE.y,
  width: VERDICT_PLATE.w,
  height: VERDICT_PLATE.h,
  rx: 18,
  className: 'od-chip-verdict',
  bgClass: 'od-verdict-bg',
  variant: 'outline',
  text: [
    `<text class="scene-counter od-verdict od-verdict--ordered" x="${VERDICT_PLATE.x + VERDICT_PLATE.w / 2}" y="${VERDICT_TEXT_Y}" text-anchor="middle">in order</text>`,
    `<text class="scene-counter od-verdict od-verdict--reordered" x="${VERDICT_PLATE.x + VERDICT_PLATE.w / 2}" y="${VERDICT_TEXT_Y}" text-anchor="middle">reordered</text>`,
  ].join(pad(6)),
});

/** The account the ordered key stands for, read out of the processing order. */
const balanceReadout = BALANCES.map(
  (value) =>
    `<text class="scene-counter scene-mono od-balance od-balance--${balanceKey(value)}" x="${BALANCE_X}" y="${BALANCE_Y}">${mono(`balance ${value}`)}</text>`,
).join(pad(4));

const stageAttrs = Object.entries(STAGE_STATE)
  .map(([name, value]) => `${name}="${value}"`)
  .join(' ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageAttrs} aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_P0, Y_PRODUCER_BOTTOM, Y_PART_TOP, 'scene-link od-lane-in-p0')}
  ${verticalLink(X_P1, Y_PRODUCER_BOTTOM, Y_PART_TOP, 'scene-link od-lane-in-p1')}
  ${verticalLink(X_P0, Y_PART_BOTTOM, Y_CONSUMERS_TOP, 'scene-link od-lane-out-p0')}
  ${verticalLink(X_P1, Y_PART_BOTTOM, Y_CONSUMERS_TOP, 'scene-link od-lane-out-p1')}

  ${clientBox({
    x: PRODUCER.x,
    width: PRODUCER.w,
    y: PRODUCER.y,
    height: PRODUCER.h,
    title: 'Producer',
    titleX: PRODUCER_TITLE_X,
    titleY: PRODUCER_TITLE_Y,
    titleAnchor: null,
    extraClass: 'od-producer',
    children: `
    ${emits}`,
  })}

  ${serviceBox({
    x: P0.x,
    width: P0.w,
    y: P0.y,
    height: P0.h,
    title: 'P0',
    titleX: P0_TITLE_X,
    titleY: PART_TITLE_Y,
    titleAnchor: null,
    className: 'scene-node od-part od-part-p0',
    children: `
    <g class="od-keyed">
      <text class="od-key od-key-p0" x="${P0_TITLE_X}" y="${KEY_Y}">key: acct 7</text>
      <text class="od-hot-label" x="${HOT_X}" y="${HOT_Y}">hot</text>
      ${gauge}
    </g>

    <g class="od-row">
      ${cells('p0', P0_CELLS, P0_CELL_X0, 6)}
    </g>`,
  })}

  ${serviceBox({
    x: P1.x,
    width: P1.w,
    y: P1.y,
    height: P1.h,
    title: 'P1',
    titleX: P1_TITLE_X,
    titleY: PART_TITLE_Y,
    titleAnchor: null,
    className: 'scene-node od-part od-part-p1',
    children: `
    <g class="od-keyed">
      <text class="od-key od-key-p1" x="${P1_TITLE_X}" y="${KEY_Y}">acct 9</text>
    </g>

    <g class="od-row">
      ${cells('p1', P1_CELLS, P1_CELL_X0, 6)}
    </g>`,
  })}

  ${ghost}

  ${serviceBox({
    x: CONSUMERS.x,
    width: CONSUMERS.w,
    y: CONSUMERS.y,
    height: CONSUMERS.h,
    title: 'Consumers',
    titleY: CONSUMERS_TITLE_Y,
    className: 'scene-service od-consumers',
    children: `
    ${slots}

    ${verdictPlate}

    ${balanceReadout}`,
  })}

  ${requestsLayer()}
</svg>`;
