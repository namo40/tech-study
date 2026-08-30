/**
 * Static stage markup for the Pagination scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Three bands, one per party to a list
 * that is handed out a slice at a time:
 *   - y 0..440       kept empty for the step title card
 *   - y 440..680     Client: what the reader asked for, as one of `page n` or
 *                    `after k`, and the band of pages it is holding
 *   - y 880..1270    Table: the rows in sort order as one long strip, `rows n`,
 *                    the highlight that says which rows a request touched, and
 *                    `scanned n`, what touching them cost
 *   - y 1500..1740   Result: the page that came back, and the two lamps that say
 *                    whether it repeated a row or skipped one
 *
 * Two lanes and nothing else travels, both on x 540 and both downward: a request
 * from the Client's bottom edge at 680 to the Table's top edge at 880, and the
 * page it produced from the Table's bottom edge at 1270 to the Result's top edge
 * at 1500. A returned page goes down rather than back up because the Result is
 * the response, not the reader; what the reader ends up holding is read off that
 * response at the instant it lands, the way a badge is.
 *
 * A traveller sweeps 26px around every point it reaches and a label keeps 30px
 * clear of that, so each lane owns x 484..596 — from y 624 to y 936 above, and
 * from y 1214 to y 1556 below. That is what fixes the rows: the Client writes
 * everything above y 624, the Table everything below y 936 and above y 1214, and
 * the Result everything below y 1556 or left and right of the column.
 *
 * Declared texture: the row strip, the received-page blocks, the returned-page
 * cells, the payload bar and the two lamp dots. Everything else is a word or a
 * number, and every word on this stage is one of the ten fixed labels.
 */

import {
  VIEWBOX,
  chip,
  clientBox,
  requestsLayer,
  serviceBox,
  verticalLink,
} from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- geometry --------------------------------------------------------------

/** The one column both lanes run down, and the edges they run between. */
export const X_LANE = 540;
export const Y_CLIENT_BOTTOM = 680;
export const Y_TABLE_TOP = 880;
export const Y_TABLE_BOTTOM = 1270;
export const Y_RESULT_TOP = 1500;

/** The Client band: a title row with the mode plate, then the received band. */
const CLIENT = { x: 130, y: 440, w: 820, h: 240 };
const CLIENT_TITLE_X = 170;
const CLIENT_TITLE_Y = 505;
const MODE_PLATE = { x: 640, y: 466, w: 280, h: 62 };
const MODE_TEXT_X = MODE_PLATE.x + MODE_PLATE.w / 2;
const MODE_TEXT_Y = 511;
const HELD_X = 170;
const HELD_Y = 556;
const HELD_W = 112;
const HELD_H = 48;
const HELD_PITCH = 124;
const DUMP_HELD = { x: 170, y: 548, w: 732, h: 64 };

/** The Table band: a title row of readouts, the row strip, the insert mark. */
const TABLE = { x: 130, y: 880, w: 820, h: 390 };
const TABLE_TITLE_X = 152;
const READOUT_Y = 972;
const SCANNED_X = 540;
const ROWS_X = 928;
const ROW_X0 = 160;
const ROW_PITCH = 7.4;
const ROW_W = 5.4;
const ROW_Y = 1010;
const ROW_H = 120;
const NEW_X = 160;
const NEW_Y = 1180;

/** The Result band: the returned page, the payload bar, the two lamps. */
const RESULT = { x: 280, y: 1500, w: 520, h: 240 };
const RESULT_TITLE_X = 310;
const RESULT_TITLE_Y = 1566;
const OUT_X0 = 310;
const OUT_PITCH = 23;
const OUT_W = 17;
const OUT_Y = 1600;
const OUT_H = 56;
const DUMP_OUT = { x: 300, y: 1590, w: 480, h: 76 };
const LAMP_Y = 1704;
const LAMP_R = 13;
const LAMP_TEXT_Y = 1714;
const LAMP = {
  dup: { cx: 400, textX: 428 },
  gap: { cx: 590, textX: 618 },
};

// --- what the stage can say about itself -----------------------------------

/** Rows a page holds. Every request in the scene asks for exactly this many. */
export const PAGE_SIZE = 20;

/** How many rows the table holds on the first frame. */
export const START_ROWS = 100;

/** Slots the strip draws: the starting rows plus room for the two inserts. */
export const SLOTS = 102;

/** Every `rows n` the readout can draw. The model checks it never leaves these. */
export const ROW_COUNTS = [100, 101, 102] as const;

/**
 * Every `scanned n` the readout can draw. A request's cost is reported at this
 * granularity — one mark per page-size of rows touched — so the readout is a
 * small authored set rather than a hundred labels.
 */
export const SCANNED_VALUES = [0, 20, 40, 60, 80, 100] as const;

/** The highest number of pages the received band draws. */
export const HELD_MAX = 6;

/**
 * What one row slot can be: outside the table, stored and untouched, walked past
 * and discarded, handed out in an earlier page of this run, in the page that
 * just came back, in that page having already been handed out once, or freshly
 * inserted. `scan`, `read`, `dup` and `idle` being four different pictures is
 * the whole of what the second step argues.
 */
export const ROW_STATES = ['empty', 'idle', 'scan', 'read', 'page', 'dup', 'new'] as const;
export type RowState = (typeof ROW_STATES)[number];

/** What the Client is asking for. `none` is before it has asked anything. */
export const MODES = [
  { id: 'page-1', text: 'page 1' },
  { id: 'page-2', text: 'page 2' },
  { id: 'page-3', text: 'page 3' },
  { id: 'page-4', text: 'page 4' },
  { id: 'page-5', text: 'page 5' },
  { id: 'after-20', text: 'after 20' },
  { id: 'after-40', text: 'after 40' },
  { id: 'after-60', text: 'after 60' },
] as const;
export type Mode = (typeof MODES)[number]['id'] | 'none';

/** How many pages the reader is holding, or the whole table in one payload. */
export const HELD_STATES = ['0', '1', '2', '3', '4', '5', '6', 'all'] as const;
export type Held = (typeof HELD_STATES)[number];

/**
 * What came back: nothing yet, a clean page, a page whose first row had already
 * been handed out, or the whole table at once.
 */
export const OUT_STATES = ['none', 'page', 'dup', 'burst'] as const;
export type Out = (typeof OUT_STATES)[number];

/** A lamp is lit or it is not. Both lamps are drawn either way. */
export const FLAGS = ['off', 'on'] as const;
export type Flag = (typeof FLAGS)[number];

/** What the scene is holding up for a moment, drawn on the band frames. */
export const MARKS = ['none', 'position', 'jump', 'cap', 'token', 'unique'] as const;
export type Mark = (typeof MARKS)[number];

/**
 * What every `data-*` on the stage starts at, keyed by the target the timeline
 * addresses it through. The markup below is written from this, so the opening
 * frame is the whole diagram in its starting state — a hundred rows stored in
 * order, nothing asked for, nothing scanned, nothing received, both lamps dark —
 * and the timeline never restates a value that is already there.
 */
export const STAGE_STATE: Record<string, string> = {
  'stage@data-pg-mode': 'none',
  'stage@data-pg-held': '0',
  'stage@data-pg-rows': String(START_ROWS),
  'stage@data-pg-scanned': '0',
  'stage@data-pg-out': 'none',
  'stage@data-pg-dup': 'off',
  'stage@data-pg-gap': 'off',
  'stage@data-pg-new': 'off',
  'stage@data-pg-mark': 'none',
  'stage@data-pg-settled': 'off',
};

/** What a slot starts at: a stored row, unless it is one of the two spares. */
export const rowStateAt = (index: number): RowState =>
  index < START_ROWS ? 'idle' : 'empty';

for (let index = 1; index <= SLOTS; index += 1) {
  STAGE_STATE[`row-${index}@data-pg-row`] = rowStateAt(index - 1);
}

// --- markup ----------------------------------------------------------------

/** Newline plus `n` spaces, the separator between lines of one fragment. */
const pad = (n: number): string => `\n${' '.repeat(n)}`;

/** Non-breaking spaces, so a monospaced readout keeps its gaps in SVG. */
const mono = (text: string): string => text.replace(/ /g, '&#160;');

/** The x of row slot `index`, counting from one. */
const rowX = (index: number): number => Number((ROW_X0 + (index - 1) * ROW_PITCH).toFixed(2));

/**
 * A stack of text elements on one spot, one per value the readout can hold,
 * hidden by the widget class and revealed one at a time by the current `data-*`.
 * Nothing interpolates, so scrubbing backwards lands on the value rather than on
 * an average of two.
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
    .join(pad(indent));

/** The plate carrying what the reader asked for, one line per way of asking. */
const modePlate = chip({
  x: MODE_PLATE.x,
  y: MODE_PLATE.y,
  width: MODE_PLATE.w,
  height: MODE_PLATE.h,
  rx: 18,
  className: 'pg-chip-mode',
  variant: 'outline',
  text: MODES.map(
    (mode) =>
      `<text class="scene-counter scene-mono pg-mode pg-mode--${mode.id}" x="${MODE_TEXT_X}" y="${MODE_TEXT_Y}" text-anchor="middle">${mono(mode.text)}</text>`,
  ).join(pad(6)),
});

/**
 * The received band: one group per number of pages the reader is holding, each
 * drawing that many blocks, plus the one that says a single response handed over
 * the whole table.
 */
const heldVariants = [
  ...Array.from({ length: HELD_MAX + 1 }, (_value, count) => {
    const blocks = Array.from(
      { length: count },
      (_v, j) =>
        `<rect class="pg-held-block" x="${HELD_X + j * HELD_PITCH}" y="${HELD_Y}" width="${HELD_W}" height="${HELD_H}" rx="12" />`,
    ).join(pad(6));
    return `<g class="pg-held pg-held--${count}">${count === 0 ? '' : `${pad(6)}${blocks}${pad(4)}`}</g>`;
  }),
  `<g class="pg-held pg-held--all">
      <rect class="pg-held-dump" x="${DUMP_HELD.x}" y="${DUMP_HELD.y}" width="${DUMP_HELD.w}" height="${DUMP_HELD.h}" rx="14" />
    </g>`,
].join(pad(4));

/** The rows, in sort order, one slot each, every slot the shape of every other. */
const rows = Array.from(
  { length: SLOTS },
  (_value, index) =>
    `<rect class="pg-row pg-row--${index + 1}" data-pg-row="${rowStateAt(index)}" x="${rowX(index + 1)}" y="${ROW_Y}" width="${ROW_W}" height="${ROW_H}" rx="2" />`,
).join(pad(4));

/** The page that came back: clean, repeating its first row, or the whole table. */
const outCells = (extra: string): string =>
  Array.from(
    { length: PAGE_SIZE },
    (_v, j) =>
      `<rect class="pg-out-cell${j === 0 && extra ? ` ${extra}` : ''}" x="${OUT_X0 + j * OUT_PITCH}" y="${OUT_Y}" width="${OUT_W}" height="${OUT_H}" rx="4" />`,
  ).join(pad(6));

const outVariants = [
  `<g class="pg-out pg-out--page">${pad(6)}${outCells('')}${pad(4)}</g>`,
  `<g class="pg-out pg-out--dup">${pad(6)}${outCells('pg-out-cell--again')}${pad(4)}</g>`,
  `<g class="pg-out pg-out--burst">
      <rect class="pg-out-dump" x="${DUMP_OUT.x}" y="${DUMP_OUT.y}" width="${DUMP_OUT.w}" height="${DUMP_OUT.h}" rx="14" />
    </g>`,
].join(pad(4));

/** One lamp: a dot and the word it lights, with a variant per state. */
const lamp = (name: 'dup' | 'gap'): string => {
  const spot = LAMP[name];
  const words = FLAGS.map(
    (flag) =>
      `<text class="scene-counter pg-lamp-word pg-lamp-${name}--${flag}" x="${spot.textX}" y="${LAMP_TEXT_Y}">${name}</text>`,
  ).join(pad(4));
  return `<circle class="pg-lamp-dot pg-lamp-dot--${name}" cx="${spot.cx}" cy="${LAMP_Y}" r="${LAMP_R}" />
    ${words}`;
};

const stageAttrs = Object.entries(STAGE_STATE)
  .filter(([key]) => key.startsWith('stage@'))
  .map(([key, value]) => `${key.slice('stage@'.length)}="${value}"`)
  .join(' ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageAttrs} aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_LANE, Y_CLIENT_BOTTOM, Y_TABLE_TOP)}
  ${verticalLink(X_LANE, Y_TABLE_BOTTOM, Y_RESULT_TOP, 'scene-link pg-lane--give')}

  ${clientBox({
    x: CLIENT.x,
    width: CLIENT.w,
    y: CLIENT.y,
    height: CLIENT.h,
    title: 'Client',
    titleX: CLIENT_TITLE_X,
    titleY: CLIENT_TITLE_Y,
    titleAnchor: null,
    extraClass: 'pg-client',
    children: `
    ${modePlate}

    ${heldVariants}`,
  })}

  ${serviceBox({
    x: TABLE.x,
    width: TABLE.w,
    y: TABLE.y,
    height: TABLE.h,
    title: 'Table',
    titleX: TABLE_TITLE_X,
    titleY: READOUT_Y,
    titleClass: 'scene-node-label',
    titleAnchor: null,
    className: 'scene-node pg-table',
    children: `
    ${valueVariants(SCANNED_X, READOUT_Y, 'pg-scanned', SCANNED_VALUES, (n) => mono(`scanned ${n}`), 'middle', 4)}

    ${valueVariants(ROWS_X, READOUT_Y, 'pg-rows', ROW_COUNTS, (n) => mono(`rows ${n}`), 'end', 4)}

    ${rows}

    <text class="scene-counter pg-new pg-new--on" x="${NEW_X}" y="${NEW_Y}">new</text>`,
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
    className: 'scene-service pg-result',
    children: `
    ${outVariants}

    ${lamp('dup')}

    ${lamp('gap')}`,
  })}

  ${requestsLayer()}
</svg>`;
