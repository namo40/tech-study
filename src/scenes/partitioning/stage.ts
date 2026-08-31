/**
 * Static stage markup for the Partitioning scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Three bands, one per question the
 * pattern asks:
 *   - y 0..440       kept empty for the step title card
 *   - y 440..680     Data (x 130..950): one table drawn as what it is made of,
 *                    a grid of rows crossed with columns. The first step grows
 *                    a saturated blob over it, and the row and column outlines
 *                    the middle band switches on are drawn here, because an
 *                    axis is a property of the data rather than of the plan.
 *   - y 880..1270    Split (x 130..950): the axis card, whose word and glyph
 *                    say which way the cut runs, and the `key` card, whose
 *                    badge names what decides where a row goes. The cut is
 *                    chosen here and nothing is stored here.
 *   - y 1500..1740   Parts (x 280..800): the `P1` and `P2` cards, what each is
 *                    holding drawn as the current cut, the `load n` each has
 *                    taken, and the `hot` lamp that reads the imbalance.
 *
 * Two lane segments and no others, both axis aligned and both at x 540:
 *   - `Y_DATA_BOTTOM` 680 to `Y_SPLIT_TOP` 880, downward only. What rides it is
 *     whatever is about to be split: a row band in the second step, a new write
 *     in the fourth. Nothing rides it upward, because nothing ever goes back to
 *     being one table.
 *   - `Y_SPLIT_BOTTOM` 1270 to `Y_PARTS_TOP` 1500, downward for a placement and
 *     both ways for a read. A placement is one-way by definition — it is where
 *     the row now lives — and a read is the only thing in the scene that comes
 *     back, which is what makes the third step's narrow read legible.
 *
 * A traveller is a dot with a halo of r 26, so each lane sweeps a 52px band at
 * x 514..566 and everything written beside one keeps 30px off it. The upper
 * lane sweeps y 654..906, so the Data band writes nothing below y 654 in that
 * column and the Split band nothing above y 936 in it. The lower lane sweeps
 * y 1244..1526, so the Split band writes nothing below y 1214 in that column
 * and the Parts band nothing above y 1556 in it, which is why the `Parts` title
 * and the `hot` lamp both sit clear of the middle.
 *
 * Declared texture: the grid cells, the saturation blob, the row and column
 * outlines, the axis and key cards with their glyphs and badge, the part cards
 * with the bands or columns they hold, the `hot` plate, and the rejoin bracket.
 * Everything else on the stage is a word, and every word is one of the twelve
 * fixed labels.
 *
 * Every value the reader can read is a stack of elements on one spot with a
 * base rule hiding all of them and the current `data-*` revealing one, so
 * nothing is interpolated and scrubbing backwards lands on the value rather
 * than on an average of two. The scene has no continuous quantity at all: an
 * axis is one of two, a key is one of two, and a load is a count.
 */

import { VIEWBOX, clientBox, counterVariants, requestsLayer, serviceBox, verticalLink } from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- geometry --------------------------------------------------------------

/** The one column anything travels on, and the four edges it runs between. */
export const X_LANE = 540;
export const Y_DATA_BOTTOM = 680;
export const Y_SPLIT_TOP = 880;
export const Y_SPLIT_BOTTOM = 1270;
export const Y_PARTS_TOP = 1500;

/** The Data band: one table, its grid, and the blob the first step grows. */
const DATA = { x: 130, y: 440, w: 820, h: 240 };
const DATA_TITLE = { x: 152, y: 498 };
/** Two narrow columns and three wide ones, so the vertical cut has a shape. */
const COLS = [
  { x: 300, w: 76 },
  { x: 384, w: 76 },
  { x: 468, w: 140 },
  { x: 616, w: 140 },
  { x: 764, w: 156 },
] as const;
const ROW_YS = [516, 542, 568, 594, 620] as const;
const CELL_H = 20;
/** The row outlines: what a horizontal cut would take, drawn on the data. */
const ROWLINE = { x: 292, w: 636, ys: [512, 538, 564, 590, 616], h: 28 };
/** The column outlines: what a vertical cut would take, on the same data. */
const COLLINE = [
  { x: 296, w: 84 },
  { x: 380, w: 84 },
  { x: 464, w: 148 },
  { x: 612, w: 148 },
  { x: 760, w: 164 },
] as const;
const COLLINE_Y = 512;
const COLLINE_H = 132;
/** The blob: one shape per growth tick, anchored where the table began. */
const BLOB = { x: 292, y: 508 };
const BLOB_SIZES = [
  { w: 200, h: 44 },
  { w: 340, h: 72 },
  { w: 480, h: 100 },
  { w: 636, h: 132 },
] as const;

/** The Split band: which way to cut, and what decides where a row goes. */
const SPLIT = { x: 130, y: 880, w: 820, h: 390 };
const SPLIT_TITLE = { x: 152, y: 940 };
const AXIS_CARD = { x: 166, y: 964, w: 748, h: 128 };
const AXIS_WORD = { x: 200, y: 1046 };
/** The horizontal-cut glyph: two pairs of rows with the cut between them. */
const ROWS_GLYPH = { x: 560, w: 320, h: 14, ys: [990, 1008, 1046, 1064], cutY: 1029, cutX0: 548, cutX1: 892 };
/** The vertical-cut glyph: two narrow columns, the cut, three wide ones. */
const COLS_GLYPH = {
  y: 990,
  h: 88,
  narrow: [{ x: 560, w: 26 }, { x: 596, w: 26 }],
  wide: [{ x: 676, w: 62 }, { x: 748, w: 62 }, { x: 820, w: 60 }],
  cutX: 646,
  cutY0: 982,
  cutY1: 1086,
};
const KEY_CARD = { x: 166, y: 1124, w: 748, h: 84 };
const KEY_WORD = { x: 200, y: 1178 };
const KEY_BADGE = { x: 620, y: 1136, w: 268, h: 60 };
const KEY_BADGE_TEXT = { x: 754, y: 1178 };

/** The Parts band: two parts, what each holds, what each has taken. */
const PARTS = { x: 280, y: 1500, w: 520, h: 240 };
const PARTS_TITLE = { x: 302, y: 1558 };
const HOT = { x: 620, y: 1516, w: 158, h: 54 };
const HOT_TEXT = { x: 699, y: 1556 };
const CARD = { y: 1578, w: 232, h: 148 };
const CARD_X: Record<string, number> = { p1: 302, p2: 546 };
const CARD_NAME = { dx: 20, y: 1620 };
/** What a part is holding, drawn as whichever cut is in force. */
const FILL = { dx: 20, w: 192, y: 1643, h: 30 };
const BAND_YS = [1643, 1654, 1665] as const;
const BAND_H = 8;
/** The narrow part takes two thin columns, the wide part three fat ones. */
const NARROW_COLS = [{ dx: 20, w: 26 }, { dx: 54, w: 26 }] as const;
const WIDE_COLS = [{ dx: 20, w: 54 }, { dx: 78, w: 54 }, { dx: 136, w: 54 }] as const;
const LOAD = { dx: 212, y: 1717 };
/** The bracket that says the two halves of one row still belong together. */
const REJOIN = { x0: 506, x1: 574, y: 1656, tick: 8 };

// --- what the stage can say about itself -----------------------------------

/** The two parts, which are told apart by nothing except what they hold. */
export const PART_IDS = ['p1', 'p2'] as const;
export type PartId = (typeof PART_IDS)[number];

/** The name the fixed labels give a part. */
export const partName = (id: PartId): string => id.toUpperCase();

/**
 * The axis the cut runs along. `none` is the first step, where the shape of the
 * cut has not been chosen and the card is an empty plate.
 */
export const AXES = ['none', 'rows', 'columns'] as const;
export type Axis = (typeof AXES)[number];

/**
 * The key the placement rule reads. `none` is the first step, where there is
 * one table and nothing to route. `date` is the fourth step's mistake.
 */
export const KEYS = ['none', 'date', 'user'] as const;
export type Key = (typeof KEYS)[number];

/** How far the one-table growth has got, and the tick where it saturates. */
export const GHOSTS = ['off', '1', '2', '3', '4', 'peak'] as const;
export type Ghost = (typeof GHOSTS)[number];

/** What a part is holding: nothing yet, row bands, or a share of the columns. */
export const HOLDINGS = ['empty', 'bands', 'cols'] as const;
export type Holding = (typeof HOLDINGS)[number];

/** A word the stage can say about itself, which is either said or not. */
export const FLAGS = ['off', 'on'] as const;
export type Flag = (typeof FLAGS)[number];

/** What just reached a part: a row that stayed, or a read that took a copy. */
export const TOUCHES = ['off', 'write', 'read'] as const;
export type Touch = (typeof TOUCHES)[number];

/** Whether every query is sweeping the whole table. */
export const SCANS = ['off', 'sweep'] as const;
export type Scan = (typeof SCANS)[number];

/** Whether there is anything to split into, which the first step decides. */
export const MODES = ['off', 'split'] as const;
export type Mode = (typeof MODES)[number];

/** What the scene is holding up for a moment, drawn on the band it is about. */
export const MARKS = ['none', 'axes', 'choose', 'half', 'schema', 'capacity', 'rejoin', 'rare', 'blob'] as const;
export type Mark = (typeof MARKS)[number];

/** The highest `load` a part reaches, which is how many variants it draws. */
export const MAX_LOAD = 8;

/**
 * Which part each half of the vertical cut goes to. The third step's reads are
 * routed by this and by nothing else, so "the narrow read touches only the
 * narrow part" is a consequence rather than a stage direction.
 */
export const NARROW_HOME: PartId = 'p1';
export const WIDE_HOME: PartId = 'p2';

/**
 * What every `data-*` on the stage starts at, keyed by the target the timeline
 * addresses it through. The markup below is written from this, so the opening
 * frame is the whole diagram in its starting state — one table with its grid
 * drawn and nothing growing over it, no axis chosen, no key named, two empty
 * parts on `load 0`, no alarm and nothing in flight — and the timeline never
 * restates a value already there.
 */
export const STAGE_STATE: Record<string, string> = {
  'stage@data-pt-ghost': 'off',
  'stage@data-pt-scan': 'off',
  'stage@data-pt-mode': 'off',
  'stage@data-pt-axis': 'none',
  'stage@data-pt-cuts': 'off',
  'stage@data-pt-split': 'off',
  'stage@data-pt-key': 'none',
  'stage@data-pt-parts': 'empty',
  'stage@data-pt-alarm': 'off',
  'stage@data-pt-mark': 'none',
  'stage@data-pt-settled': 'off',
  'part-p1@data-pt-load': '0',
  'part-p2@data-pt-load': '0',
  'part-p1@data-pt-hot': 'off',
  'part-p2@data-pt-hot': 'off',
  'part-p1@data-pt-touch': 'off',
  'part-p2@data-pt-touch': 'off',
};

// --- markup ----------------------------------------------------------------

/** Newline plus `n` spaces, the separator between lines of one fragment. */
const pad = (n: number): string => `\n${' '.repeat(n)}`;

/** Non-breaking spaces, so a monospaced readout keeps its gaps in SVG. */
const mono = (text: string): string => text.replace(/ /g, '&#160;');

/** The table drawn as what it is made of: five row bands across five columns. */
const cells = ROW_YS.flatMap((y) =>
  COLS.map(
    (c, k) =>
      `<rect class="pt-cell pt-cell--c${k + 1}" x="${c.x}" y="${y}" width="${c.w}" height="${CELL_H}" rx="5" />`,
  ),
).join(pad(4));

/** What a horizontal cut would take: whole rows, all columns. */
const rowlines = ROWLINE.ys
  .map((y) => `<rect class="pt-rowline" x="${ROWLINE.x}" y="${y}" width="${ROWLINE.w}" height="${ROWLINE.h}" rx="10" />`)
  .join(pad(6));

/** What a vertical cut would take: whole columns, all rows. */
const collines = COLLINE.map(
  (c) => `<rect class="pt-colline" x="${c.x}" y="${COLLINE_Y}" width="${c.w}" height="${COLLINE_H}" rx="10" />`,
).join(pad(6));

/** One shape per growth tick plus the saturated one, stacked on one corner. */
const blobs = [...BLOB_SIZES.map((s, index) => [String(index + 1), s] as const), ['peak', BLOB_SIZES[3]] as const]
  .map(
    ([name, size]) =>
      `<rect class="pt-blob pt-blob--${name}" x="${BLOB.x}" y="${BLOB.y}" width="${size?.w ?? 0}" height="${size?.h ?? 0}" rx="16" />`,
  )
  .join(pad(4));

/** The cut drawn sideways: two pairs of rows with the cut running between. */
const rowsGlyph = `<g class="pt-glyph pt-glyph--rows">
      ${ROWS_GLYPH.ys
        .map(
          (y) =>
            `<rect class="pt-glyph-bar" x="${ROWS_GLYPH.x}" y="${y}" width="${ROWS_GLYPH.w}" height="${ROWS_GLYPH.h}" rx="6" />`,
        )
        .join(pad(6))}
      <line class="pt-glyph-cut" x1="${ROWS_GLYPH.cutX0}" y1="${ROWS_GLYPH.cutY}" x2="${ROWS_GLYPH.cutX1}" y2="${ROWS_GLYPH.cutY}" />
    </g>`;

/** The same data cut the other way: narrow columns, the cut, wide columns. */
const colsGlyph = `<g class="pt-glyph pt-glyph--columns">
      ${[...COLS_GLYPH.narrow, ...COLS_GLYPH.wide]
        .map(
          (c, index) =>
            `<rect class="pt-glyph-col pt-glyph-col--${index + 1}" x="${c.x}" y="${COLS_GLYPH.y}" width="${c.w}" height="${COLS_GLYPH.h}" rx="6" />`,
        )
        .join(pad(6))}
      <line class="pt-glyph-cut" x1="${COLS_GLYPH.cutX}" y1="${COLS_GLYPH.cutY0}" x2="${COLS_GLYPH.cutX}" y2="${COLS_GLYPH.cutY1}" />
    </g>`;

/** The chosen axis, written twice on one spot with the state showing one. */
const axisWords = (['rows', 'columns'] as const)
  .map(
    (name) =>
      `<text class="pt-axis-word pt-axis-word--${name}" x="${AXIS_WORD.x}" y="${AXIS_WORD.y}">${name}</text>`,
  )
  .join(pad(4));

/** The key's name, written twice on one badge with the state showing one. */
const keyWords = (['date', 'user'] as const)
  .map(
    (name) =>
      `<text class="pt-key-word pt-key-word--${name}" x="${KEY_BADGE_TEXT.x}" y="${KEY_BADGE_TEXT.y}" text-anchor="middle">${name}</text>`,
  )
  .join(pad(4));

/**
 * One part: its name, what it is holding drawn as the cut currently in force,
 * and the count of everything it has taken. Both parts are always drawn,
 * because the argument is about what lands where rather than about how many
 * parts exist, and both draw the same two holdings so that the difference
 * between them in the third step is the columns themselves and not the frame.
 */
const part = (id: PartId): string => {
  const x = CARD_X[id] ?? 0;
  const bands = BAND_YS.map(
    (y) => `<rect class="pt-band" x="${x + FILL.dx}" y="${y}" width="${FILL.w}" height="${BAND_H}" rx="4" />`,
  ).join(pad(8));
  const columns = (id === NARROW_HOME ? NARROW_COLS : WIDE_COLS)
    .map(
      (c) =>
        `<rect class="pt-col pt-col--${id === NARROW_HOME ? 'narrow' : 'wide'}" x="${x + c.dx}" y="${FILL.y}" width="${c.w}" height="${FILL.h}" rx="5" />`,
    )
    .join(pad(8));
  const load = counterVariants({
    x: x + LOAD.dx,
    y: LOAD.y,
    className: 'pt-load',
    max: MAX_LOAD,
    format: (n) => mono(`load ${n}`),
    anchor: 'end',
    indent: 6,
  });
  return `<g class="pt-part pt-part--${id}" data-pt-load="0" data-pt-hot="off" data-pt-touch="off">
      <rect class="pt-part-bg" x="${x}" y="${CARD.y}" width="${CARD.w}" height="${CARD.h}" rx="20" />
      <text class="pt-part-name" x="${x + CARD_NAME.dx}" y="${CARD_NAME.y}">${partName(id)}</text>
      <g class="pt-fill pt-fill--bands">
        ${bands}
      </g>
      <g class="pt-fill pt-fill--cols">
        ${columns}
      </g>
      ${load}
    </g>`;
};

/** The bracket the third step holds up: one row, two halves, one identity. */
const rejoin = `<g class="pt-rejoin">
      <line class="pt-rejoin-span" x1="${REJOIN.x0}" y1="${REJOIN.y}" x2="${REJOIN.x1}" y2="${REJOIN.y}" />
      <line class="pt-rejoin-tick" x1="${REJOIN.x0}" y1="${REJOIN.y - REJOIN.tick}" x2="${REJOIN.x0}" y2="${REJOIN.y + REJOIN.tick}" />
      <line class="pt-rejoin-tick" x1="${REJOIN.x1}" y1="${REJOIN.y - REJOIN.tick}" x2="${REJOIN.x1}" y2="${REJOIN.y + REJOIN.tick}" />
    </g>`;

const stageAttrs = Object.entries(STAGE_STATE)
  .filter(([key]) => key.startsWith('stage@'))
  .map(([key, value]) => `${key.slice('stage@'.length)}="${value}"`)
  .join(' ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageAttrs} aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_LANE, Y_DATA_BOTTOM, Y_SPLIT_TOP, 'scene-link pt-lane--cut')}
  ${verticalLink(X_LANE, Y_SPLIT_BOTTOM, Y_PARTS_TOP, 'scene-link pt-lane--place')}

  ${clientBox({
    x: DATA.x,
    width: DATA.w,
    y: DATA.y,
    height: DATA.h,
    title: 'Data',
    titleX: DATA_TITLE.x,
    titleY: DATA_TITLE.y,
    titleClass: 'scene-node-title pt-title',
    titleAnchor: null,
    extraClass: 'pt-data',
    children: `
    ${cells}

    <g class="pt-rowlines">
      ${rowlines}
    </g>

    <g class="pt-collines">
      ${collines}
    </g>

    ${blobs}`,
  })}

  ${serviceBox({
    x: SPLIT.x,
    width: SPLIT.w,
    y: SPLIT.y,
    height: SPLIT.h,
    title: 'Split',
    titleX: SPLIT_TITLE.x,
    titleY: SPLIT_TITLE.y,
    titleClass: 'scene-node-title pt-title',
    titleAnchor: null,
    className: 'scene-node pt-split',
    children: `
    <rect class="pt-axis-bg" x="${AXIS_CARD.x}" y="${AXIS_CARD.y}" width="${AXIS_CARD.w}" height="${AXIS_CARD.h}" rx="24" />
    ${axisWords}
    ${rowsGlyph}
    ${colsGlyph}

    <rect class="pt-key-bg" x="${KEY_CARD.x}" y="${KEY_CARD.y}" width="${KEY_CARD.w}" height="${KEY_CARD.h}" rx="22" />
    <text class="pt-key-name" x="${KEY_WORD.x}" y="${KEY_WORD.y}">key</text>
    <rect class="pt-badge-bg" x="${KEY_BADGE.x}" y="${KEY_BADGE.y}" width="${KEY_BADGE.w}" height="${KEY_BADGE.h}" rx="18" />
    ${keyWords}`,
  })}

  ${serviceBox({
    x: PARTS.x,
    width: PARTS.w,
    y: PARTS.y,
    height: PARTS.h,
    title: 'Parts',
    titleX: PARTS_TITLE.x,
    titleY: PARTS_TITLE.y,
    titleClass: 'scene-node-title pt-title',
    titleAnchor: null,
    className: 'scene-service pt-parts',
    children: `
    <rect class="pt-hot-bg" x="${HOT.x}" y="${HOT.y}" width="${HOT.w}" height="${HOT.h}" rx="16" />
    <text class="pt-hot-text" x="${HOT_TEXT.x}" y="${HOT_TEXT.y}" text-anchor="middle">hot</text>

    ${PART_IDS.map(part).join(pad(4))}

    ${rejoin}`,
  })}

  ${requestsLayer()}
</svg>`;
