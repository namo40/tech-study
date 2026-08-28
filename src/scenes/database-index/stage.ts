/**
 * Static stage markup for the Database Index scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Four bands, one per party to a
 * single lookup:
 *   - y 0..440       kept empty for the step title card
 *   - y 440..680     Query: the question being asked, and the two numbers the
 *                    whole scene is about — `reads n`, how many stored things
 *                    were touched, and `ms n`, what touching them cost
 *   - y 880..1270    Table (x 130..490): nine row slots in arrival order, drawn
 *                    at nine different widths because a heap of rows has no
 *                    order to it. Index (x 590..950): nine key slots of one
 *                    width, drawn identical because a sorted copy is exactly
 *                    that — plus `sorted`, the `unique` chip, and the mark that
 *                    says which pagination the fourth step is walking
 *   - y 1500..1740   Result: the badge the query came back with, and `rows n`
 *
 * Two lanes carry the query and its answer — `X_TABLE_LANE` at 310 and
 * `X_INDEX_LANE` at 770, both between the Query box's bottom edge at 680 and
 * the store boxes' top edge at 880 — and one carries the pointer jump: `Y_POINTER`
 * at 1075, from the Index's left edge at 590 to the Table's right edge at 490.
 * That third lane runs the way the pointer points, key to row, which is the one
 * thing an index has that a sorted list does not.
 *
 * Nothing travels to the Result. A result is not a message crossing the diagram,
 * it is what the query came back holding, so it is drawn as badge state on the
 * box. The two lines from the stores down to it are drawn quiet for the same
 * reason the Memory Pressure scene draws one: they say where the answer is read
 * off, not that anything moves along them.
 *
 * A traveller sweeps 26px around every point it reaches and a label keeps 30px
 * clear of that, so each vertical lane owns a 112px wide keep-out from y 624 to
 * y 936, and the pointer lane owns a 112px tall keep-out from x 434 to x 646.
 * That is what fixes the Query box's single content row above y 624, the two
 * store labels at x 152 and x 612, the row column at x 152..424 and the key
 * column at x 660..830.
 *
 * Declared texture: the two columns of slots, the four chip plates, and the
 * digits of the two readouts. The columns are texture rather than labels — a
 * slot says only what has happened to it, and how many are lit is the whole
 * point of the scene.
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

/** The two lanes a query goes down and its answer comes back up. */
export const X_TABLE_LANE = 310;
export const X_INDEX_LANE = 770;
export const Y_QUERY_BOTTOM = 680;
export const Y_STORE_TOP = 880;

/** The pointer jump: a key hands back the row it points at. */
export const Y_POINTER = 1075;
export const X_INDEX_LEFT = 590;
export const X_TABLE_RIGHT = 490;

/** The quiet lines that say where the result is read off. */
const Y_STORE_BOTTOM = 1270;
const Y_RESULT_TOP = 1500;

/** The Query band. */
const QUERY = { x: 130, y: 440, w: 820, h: 240 };
const QUERY_TITLE_X = 170;
const QUERY_TITLE_Y = 505;
const CARD = { x: 170, y: 548, w: 340, h: 60 };
const CARD_TEXT_X = 340;
const READOUT_Y = 588;
const READS_LABEL_X = 548;
const READS_DIGIT_X = [657, 676, 695, 714];
const MS_LABEL_X = 776;
const MS_DIGIT_X = [835, 854, 873];

/** The Table band: rows as they arrived, which is no order at all. */
const TABLE = { x: 130, y: 880, w: 360, h: 390 };
const TABLE_LABEL_X = 152;
const STORE_LABEL_Y = 940;
const ROW_X = 152;
const ROW_TOP = 1000;
const ROW_H = 22;
const ROW_PITCH = 28;

/** The Index band: keys in sorted order, and the rules hung off them. */
const INDEX = { x: 590, y: 880, w: 360, h: 390 };
const INDEX_LABEL_X = 612;
const SORTED_X = 928;
const KEY_X = 660;
const KEY_W = 170;
const KEY_TOP = 1000;
const KEY_H = 22;
const KEY_PITCH = 28;
const UNIQUE_CHIP = { x: 850, y: 1000, w: 86, h: 52 };
const UNIQUE_TEXT_Y = 1035;
const PHASE_X = 893;
const PHASE_Y = 1120;

/** The Result band. */
const RESULT = { x: 280, y: 1500, w: 520, h: 240 };
const RESULT_TITLE_X = 310;
const RESULT_TITLE_Y = 1566;
const BADGE_CHIP = { x: 310, y: 1606, w: 260, h: 66 };
const BADGE_TEXT_X = 440;
const BADGE_TEXT_Y = 1650;
const ROWS_X = 600;
const ROWS_Y = 1650;

// --- what the stage can say about itself -----------------------------------

/**
 * Slots in each column: eight things stored plus one spare, because the second
 * step appends a row and wedges a key in and both need somewhere to land.
 */
export const SLOTS = 9;
/** How many of them hold something on the first frame. */
export const FILLED = 8;

/** Row widths. A heap of rows is not sorted and does not look sorted. */
const ROW_W = [272, 208, 250, 178, 264, 222, 236, 194, 216];

/**
 * What one row slot can be: unwritten, stored, being read right now, read and
 * passed over, the row the query wanted, just appended, part of a page.
 */
export const ROW_STATES = ['empty', 'idle', 'scan', 'seen', 'hit', 'new', 'page'] as const;
export type RowState = (typeof ROW_STATES)[number];

/**
 * What one key slot can be. Three of these are the scene's whole argument:
 * `skip` is a key that was read and thrown away, `past` is a key that was never
 * read at all, and `step` is a key a descent actually stopped on.
 */
export const KEY_STATES = [
  'empty',
  'idle',
  'step',
  'skip',
  'past',
  'hit',
  'new',
  'shift',
  'taken',
  'page',
] as const;
export type KeyState = (typeof KEY_STATES)[number];

/** The three questions the scene asks, one card each. */
export const QUERIES = ['select', 'insert', 'page'] as const;
export type Query = (typeof QUERIES)[number];

/** What the query came back with. `none` is a query that has not answered yet. */
export const BADGES = ['none', 'found', 'inserted', 'duplicate', 'page'] as const;
export type Badge = (typeof BADGES)[number];
const BADGE_WORD: Record<string, string> = {
  found: 'found',
  inserted: 'inserted',
  duplicate: 'duplicate',
  page: 'page ok',
};

/** Which arithmetic the fourth step is walking. */
export const PHASES = ['none', 'offset', 'keyset'] as const;
export type Phase = (typeof PHASES)[number];

/** A rule on the index is either declared or it is not. */
export const FLAGS = ['off', 'on'] as const;
export type Flag = (typeof FLAGS)[number];

/** The most rows one query in this scene returns. */
export const MAX_ROWS = 20;

/** How wide each readout is, in digits, and the blank a leading gap shows. */
export const READS_WIDTH = 4;
export const MS_WIDTH = 3;
export const DIGIT_BLANK = 'x';
const DIGIT_VALUES = [DIGIT_BLANK, '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * A number written left to right, one attribute per digit position, with the
 * positions it does not need left blank. Stacking a variant per digit rather
 * than a variant per value is what lets `reads` walk from 0 to 5020 without the
 * stage carrying five thousand text elements.
 */
export const digitsOf = (value: number, width: number): string[] => {
  const text = String(Math.max(0, Math.round(value)));
  return Array.from({ length: width }, (_v, i) => text[i] ?? DIGIT_BLANK);
};

/**
 * What every `data-*` on the stage starts at. The markup below is written from
 * these, so the first frame is the whole diagram in its opening state — eight
 * rows stored, eight keys sorted, one spare slot in each column, a question on
 * the card, both readouts at zero and no answer yet — and the timeline never has
 * to restate what is already there.
 */
export const STAGE_STATE: Record<string, string> = {
  'data-dbi-query': 'select',
  'data-dbi-r0': '0',
  'data-dbi-r1': DIGIT_BLANK,
  'data-dbi-r2': DIGIT_BLANK,
  'data-dbi-r3': DIGIT_BLANK,
  'data-dbi-m0': '0',
  'data-dbi-m1': DIGIT_BLANK,
  'data-dbi-m2': DIGIT_BLANK,
  'data-dbi-unique': 'off',
  'data-dbi-ghost': 'off',
  'data-dbi-badge': 'none',
  'data-dbi-rows': '0',
  'data-dbi-phase': 'none',
  'data-dbi-settled': 'off',
};

/** What a slot starts at: stored, unless it is the spare. */
export const rowStateAt = (index: number): RowState => (index < FILLED ? 'idle' : 'empty');
export const keyStateAt = (index: number): KeyState => (index < FILLED ? 'idle' : 'empty');

// --- markup ----------------------------------------------------------------

/** Newline plus `n` spaces, the separator between lines of one fragment. */
const pad = (n: number): string => `\n${' '.repeat(n)}`;

/** Non-breaking spaces, so a monospaced label keeps its gaps in SVG. */
const mono = (text: string): string => text.replace(/ /g, '&#160;');

/**
 * One digit of a readout: eleven text elements on one spot, ten of them a digit
 * and one of them empty, with the widget class hiding all of them and the state
 * picking the one that shows. Nothing interpolates, so scrubbing backwards
 * lands on the right number rather than on an average of two.
 */
const digitStack = (name: string, x: number, indent = 4): string =>
  DIGIT_VALUES.map(
    (value) =>
      `<text class="scene-counter dbi-digit dbi-${name}--${value}" x="${x}" y="${READOUT_Y}" text-anchor="middle">${value === DIGIT_BLANK ? '' : value}</text>`,
  ).join(pad(indent));

/** A whole readout: a fixed word, then the digits of whatever it is counting. */
const readout = (prefix: string, label: string, labelX: number, xs: number[]): string =>
  [
    `<text class="scene-mono dbi-readout-label" x="${labelX}" y="${READOUT_Y}">${label}</text>`,
    ...xs.map((x, i) => digitStack(`${prefix}${i}`, x)),
  ].join(pad(4));

/** The question on the card: one line per query the scene ever asks. */
const queryCard = chip({
  x: CARD.x,
  y: CARD.y,
  width: CARD.w,
  height: CARD.h,
  rx: 18,
  className: 'dbi-chip-card',
  variant: 'outline',
  text: QUERIES.map(
    (name) =>
      `<text class="scene-counter scene-mono dbi-card dbi-card--${name}" x="${CARD_TEXT_X}" y="${READOUT_Y}" text-anchor="middle">${mono(name === 'select' ? 'WHERE email = ?' : name === 'insert' ? 'INSERT' : 'page 500')}</text>`,
  ).join(pad(6)),
});

/** The rule the index is carrying, lit only once it has been declared. */
const uniqueChip = chip({
  x: UNIQUE_CHIP.x,
  y: UNIQUE_CHIP.y,
  width: UNIQUE_CHIP.w,
  height: UNIQUE_CHIP.h,
  rx: 16,
  className: 'dbi-chip-unique',
  variant: 'outline',
  text: FLAGS.map(
    (flag) =>
      `<text class="scene-counter dbi-unique dbi-unique--${flag}" x="${UNIQUE_CHIP.x + UNIQUE_CHIP.w / 2}" y="${UNIQUE_TEXT_Y}" text-anchor="middle">unique</text>`,
  ).join(pad(6)),
});

/** Which arithmetic is walking the index, named only while one is. */
const phaseMark = PHASES.filter((name) => name !== 'none')
  .map(
    (name) =>
      `<text class="scene-counter dbi-phase dbi-phase--${name}" x="${PHASE_X}" y="${PHASE_Y}" text-anchor="middle">${name}</text>`,
  )
  .join(pad(4));

/** The rows, in the order they arrived, at the widths that says so. */
const rows = Array.from({ length: SLOTS }, (_value, index) => {
  const width = ROW_W[index] ?? ROW_W[0] ?? 200;
  return `<rect class="dbi-row dbi-row--${index + 1}" data-dbi-row="${rowStateAt(index)}" x="${ROW_X}" y="${ROW_TOP + index * ROW_PITCH}" width="${width}" height="${ROW_H}" rx="6" />`;
}).join(pad(4));

/** The keys, sorted, every one of them the same shape as every other. */
const keys = Array.from(
  { length: SLOTS },
  (_value, index) =>
    `<rect class="dbi-key dbi-key--${index + 1}" data-dbi-key="${keyStateAt(index)}" x="${KEY_X}" y="${KEY_TOP + index * KEY_PITCH}" width="${KEY_W}" height="${KEY_H}" rx="6" />`,
).join(pad(4));

/** What the query came back with, one word per answer it can carry. */
const badgeChip = chip({
  x: BADGE_CHIP.x,
  y: BADGE_CHIP.y,
  width: BADGE_CHIP.w,
  height: BADGE_CHIP.h,
  rx: 18,
  className: 'dbi-chip-badge',
  variant: 'outline',
  text: BADGES.filter((name) => name !== 'none')
    .map(
      (name) =>
        `<text class="scene-counter dbi-badge dbi-badge--${name}" x="${BADGE_TEXT_X}" y="${BADGE_TEXT_Y}" text-anchor="middle">${mono(BADGE_WORD[name] ?? name)}</text>`,
    )
    .join(pad(6)),
});

/** How many rows the answer is holding. */
const rowsReadout = counterVariants({
  x: ROWS_X,
  y: ROWS_Y,
  className: 'dbi-rows',
  count: MAX_ROWS + 1,
  format: (n) => mono(`rows ${n}`),
  indent: 4,
});

const stageAttrs = Object.entries(STAGE_STATE)
  .map(([name, value]) => `${name}="${value}"`)
  .join(' ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageAttrs} aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_TABLE_LANE, Y_QUERY_BOTTOM, Y_STORE_TOP)}
  ${verticalLink(X_INDEX_LANE, Y_QUERY_BOTTOM, Y_STORE_TOP)}
  <line class="scene-link dbi-lane-pointer" x1="${X_TABLE_RIGHT}" y1="${Y_POINTER}" x2="${X_INDEX_LEFT}" y2="${Y_POINTER}" />
  ${verticalLink(X_TABLE_LANE, Y_STORE_BOTTOM, Y_RESULT_TOP, 'scene-link dbi-quiet')}
  ${verticalLink(X_INDEX_LANE, Y_STORE_BOTTOM, Y_RESULT_TOP, 'scene-link dbi-quiet')}

  ${clientBox({
    x: QUERY.x,
    width: QUERY.w,
    y: QUERY.y,
    height: QUERY.h,
    title: 'Query',
    titleX: QUERY_TITLE_X,
    titleY: QUERY_TITLE_Y,
    titleAnchor: null,
    extraClass: 'dbi-query',
    children: `
    ${queryCard}

    ${readout('r', 'reads', READS_LABEL_X, READS_DIGIT_X)}

    ${readout('m', 'ms', MS_LABEL_X, MS_DIGIT_X)}`,
  })}

  ${serviceBox({
    x: TABLE.x,
    width: TABLE.w,
    y: TABLE.y,
    height: TABLE.h,
    title: 'Table',
    titleX: TABLE_LABEL_X,
    titleY: STORE_LABEL_Y,
    titleClass: 'scene-node-label',
    titleAnchor: null,
    className: 'scene-node dbi-table',
    children: `
    ${rows}`,
  })}

  ${serviceBox({
    x: INDEX.x,
    width: INDEX.w,
    y: INDEX.y,
    height: INDEX.h,
    title: 'Index',
    titleX: INDEX_LABEL_X,
    titleY: STORE_LABEL_Y,
    titleClass: 'scene-node-label',
    titleAnchor: null,
    className: 'scene-node dbi-index',
    children: `
    <text class="scene-caption-label dbi-sorted" x="${SORTED_X}" y="${STORE_LABEL_Y}" text-anchor="end">sorted</text>

    ${keys}

    ${uniqueChip}

    ${phaseMark}`,
  })}

  ${serviceBox({
    x: RESULT.x,
    width: RESULT.w,
    y: RESULT.y,
    height: RESULT.h,
    title: 'Result',
    titleX: RESULT_TITLE_X,
    titleY: RESULT_TITLE_Y,
    titleAnchor: null,
    className: 'scene-service dbi-result',
    children: `
    ${badgeChip}

    ${rowsReadout}`,
  })}

  ${requestsLayer()}
</svg>`;
