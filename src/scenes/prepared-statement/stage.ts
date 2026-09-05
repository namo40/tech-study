/**
 * Static stage markup for the Prepared Statement scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Four bands, arranged around the one
 * decision the pattern is: whether the value is glued into the query text or
 * travels beside it as data.
 *   - y 0..400       above the cropped viewBox (see shared VIEWBOX)
 *   - y 400..440     the frame's top padding; nothing is drawn here
 *   - y 440..680     the App: the mode the query is built in (`concat` or
 *                    `params`), the statement itself drawn as a bar, and the
 *                    input chip that says what is being supplied (`input` for
 *                    an ordinary value, `injected` for one wearing quotes). In
 *                    `concat` a bridge fuses the chip to the statement, because
 *                    the value has become part of the sentence; in `params` the
 *                    bridge is gone and the statement carries a placeholder
 *                    hole instead
 *   - y 880..1270    the Database: the `parse` and `plan` lamps, which light
 *                    only when a text has to be compiled; the plan `cache`, a
 *                    row of three slots holding one plan each; and the two
 *                    numbers the third step is about, `hit n` and `miss n`
 *   - y 1500..1740   the Results: the strip of rows the last answer carried,
 *                    `ok n`, and the `leak` readout
 *
 * Two lane segments and no others, both axis aligned and both at x 540. A query
 * leaves the App's bottom edge at y 680 and reaches the Database's top edge at
 * y 880; the answer leaves the Database's bottom edge at y 1270 and reaches the
 * Results box at y 1500. Nothing is ever drawn inside a box: a query is
 * absorbed on the top edge and the answer it causes leaves from the bottom one.
 *
 * A traveller sweeps 26px around every point it reaches and a label keeps 30px
 * clear of that, so the two segments own two keep-outs in x 484..596: from
 * y 624 to y 936, and from y 1214 to y 1556. That is what decides the layout.
 * The App box keeps everything above y 620. The Database box names itself on a
 * baseline at y 946 to the left of the corridor, puts the lamps and the cache
 * row between y 936 and y 1214 where the corridor is not, and writes `hit n`
 * and `miss n` at x 330 and x 760, well outside the lower band. The Results box
 * writes its title left of x 484 and puts everything else below y 1556.
 *
 * A parameterized query carries its value as a second plate on the same
 * traveller, 98px to the right of the lane, which is clear of the 52px halo the
 * dot itself sweeps. That is the whole picture of the pattern in one shape: one
 * thing moving, two pieces, and only one of them is the sentence.
 *
 * Declared texture: the statement bar with its hole and bridge, the cache slot
 * row, and the result strip. None of them is read as writing — a slot says only
 * whether it is holding a plan and what just happened to it, and how many cells
 * of the strip are lit is the answer rather than a label for it.
 *
 * Everything the reader has to read is a stack of text elements on one spot,
 * hidden by a base rule and opened by the current `data-*`, so nothing
 * interpolates and both scrub directions land on the same words.
 */

import {
  VIEWBOX,
  clientBox,
  counterVariants,
  requestsLayer,
  serviceBox,
  verticalLink,
} from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- geometry --------------------------------------------------------------

/** The one lane, walked twice: App to Database, then Database to Results. */
export const X_LANE = 540;
export const Y_APP_BOTTOM = 680;
export const Y_DB_TOP = 880;
export const Y_DB_BOTTOM = 1270;
export const Y_RESULTS_TOP = 1500;

/** How far right of the lane a parameter rides, clear of the dot's 52px halo. */
export const VALUE_DX = 70;
export const VALUE_W = 56;
export const VALUE_H = 40;

/** The App band: how the query is being built. */
const APP = { x: 130, y: 440, w: 820, h: 240 };
const APP_TITLE = { x: 170, y: 505 };
const MODE_PLATE = { x: 640, y: 462, w: 280, h: 66 };
const MODE_TEXT = { x: 780, y: 507 };
/** The statement, its placeholder hole, and the bridge that fuses a value in. */
const STMT = { x: 170, y: 548, w: 470, h: 66 };
const HOLE = { x: 556, y: 558, w: 72, h: 46 };
const BRIDGE = { x: 632, y: 566, w: 36, h: 30 };
const CHIP = { x: 664, y: 548, w: 256, h: 66 };
const CHIP_TEXT = { x: 792, y: 590 };

/** The Database band: what a text costs, and what is remembered of it. */
const DB = { x: 130, y: 880, w: 820, h: 390 };
const DB_TITLE = { x: 170, y: 946 };
const LAMP_R = 20;
const LAMP_RING_R = 32;
const PARSE_LAMP = { cx: 190, cy: 1000 };
const PARSE_TEXT = { x: 232, y: 1013 };
const PLAN_LAMP = { cx: 420, cy: 1000 };
const PLAN_TEXT = { x: 462, y: 1013 };
const CACHE_TEXT = { x: 170, y: 1132 };
const SLOT = { y: 1086, w: 176, h: 74, rx: 16 };
const SLOT_XS = [302, 512, 722] as const;
const SLOT_INSET = 8;
const PLAN_BAR = { w: 96, h: 16, rx: 8 };
const HIT_TEXT = { x: 330, y: 1228 };
const MISS_TEXT = { x: 760, y: 1228 };

/** The Results band: what came back, and whether any of it should have. */
const RESULTS = { x: 280, y: 1500, w: 520, h: 240 };
const RESULTS_TITLE = { x: 300, y: 1566 };
const CELL = { y: 1600, side: 30, rx: 8 };
const CELL_XS = [305, 347, 389, 431, 473, 515, 557, 599] as const;
const OK_TEXT = { x: 700, y: 1622 };
const LEAK_PLATE = { x: 310, y: 1658, w: 460, h: 62 };
const LEAK_TEXT = { x: 540, y: 1700 };

// --- what the stage can say about itself -----------------------------------

/** How many plans the cache can hold, which is the row of slots drawn below. */
export const CACHE_CAPACITY = SLOT_XS.length;

/** How many rows the table has, which is what a leak costs. */
export const TABLE_ROWS = CELL_XS.length;

/** The highest each readout counts to. The build asserts all three. */
export const HIT_MAX = 9;
export const MISS_MAX = 8;
export const OK_MAX = 16;

/**
 * How the query is being built. These are the two worlds the scene compares,
 * and the whole argument is that they differ in one place only: whether the
 * value is inside the text or beside it.
 */
export const MODES = ['concat', 'params'] as const;
export type Mode = (typeof MODES)[number];

/**
 * Whether the concat world on screen is the real one or a replay. The third
 * step goes back to concatenation to price it, and that has to be drawn as a
 * hypothetical rather than as a regression.
 */
export const GHOST_STATES = ['off', 'on'] as const;
export type GhostState = (typeof GHOST_STATES)[number];

/**
 * What is loaded into the input. `idle` is an input slot with nothing in it,
 * which must not read like an ordinary value waiting to go.
 */
export const CHIP_STATES = ['idle', 'input', 'injected'] as const;
export type ChipState = (typeof CHIP_STATES)[number];

/** A stage lamp: lit while the server is paying for a text it has not seen. */
export const LAMP_STATES = ['off', 'on'] as const;
export type LampState = (typeof LAMP_STATES)[number];

/**
 * One plan cache slot. `empty` has never held anything; `stored` was filled by
 * the miss that just happened; `warm` is holding a plan quietly; `hit` is the
 * plan being handed back right now. A slot that is empty, a slot that was just
 * filled and a slot that is simply warm are three different facts, so they are
 * drawn three ways rather than three shades.
 */
export const SLOT_STATES = ['empty', 'stored', 'warm', 'hit'] as const;
export type SlotState = (typeof SLOT_STATES)[number];

/**
 * What the last answer carried. `none` is a strip nothing has answered into
 * yet, and it must not read like `zero`, which is a real answer that matched
 * nobody — that difference is the whole of the second step.
 */
export const ROW_STATES = ['none', 'zero', 'one', 'all'] as const;
export type RowState = (typeof ROW_STATES)[number];

/**
 * The leak readout. `off` is a boundary nothing has crossed, `on` is the table
 * walking out, and `sealed` is the same input arriving and matching nobody.
 */
export const LEAK_STATES = ['off', 'on', 'sealed'] as const;
export type LeakState = (typeof LEAK_STATES)[number];

/** What the scene is holding up for a moment, if anything. */
export const MARKS = [
  'none',
  'handed',
  'hole',
  'structural',
  'churn',
  'discipline',
] as const;
export type Mark = (typeof MARKS)[number];

/**
 * What every `data-*` on the stage starts at. The markup below is written from
 * these, so the first frame is the whole diagram in its opening state — an App
 * building its query by concatenation with nothing supplied yet, a Database
 * with dark lamps and a cold cache, a Results box that has answered nothing —
 * and the timeline never restates it.
 */
export const STAGE_STATE: Record<string, string> = {
  'data-pst-mode': 'concat',
  'data-pst-ghost': 'off',
  'data-pst-chip': 'idle',
  'data-pst-parse': 'off',
  'data-pst-plan': 'off',
  'data-pst-hit': '0',
  'data-pst-miss': '0',
  'data-pst-ok': '0',
  'data-pst-rows': 'none',
  'data-pst-leak': 'off',
  'data-pst-mark': 'none',
  'data-pst-settled': 'off',
};

/** What every cache slot starts at: never used, rather than emptied. */
export const SLOT_STATE: SlotState = 'empty';

// --- markup ----------------------------------------------------------------

/** Non-breaking spaces, so a monospaced label keeps its gaps in SVG. */
const mono = (text: string): string => text.replace(/ /g, '&#160;');

const pad = (n: number): string => `\n${' '.repeat(n)}`;

/** One spot, one text per value it can hold. Exactly one is ever revealed. */
const textStack = (
  x: number,
  y: number,
  className: string,
  values: readonly string[],
  format: (value: string) => string,
  anchor: string | null,
  indent = 4,
): string =>
  values
    .map(
      (value) =>
        `<text class="scene-counter ${className} ${className}--${value}" x="${x}" y="${y}"${
          anchor ? ` text-anchor="${anchor}"` : ''
        }>${format(value)}</text>`,
    )
    .join(pad(indent));

/** The mode the query is being assembled in, named on a plate of its own. */
const modePlate = `<g class="pst-mode">
      ${MODES.map(
        (mode) =>
          `<rect class="pst-mode-bg pst-mode-bg--${mode}" x="${MODE_PLATE.x}" y="${MODE_PLATE.y}" width="${MODE_PLATE.w}" height="${MODE_PLATE.h}" rx="${MODE_PLATE.h / 2}" />`,
      ).join(pad(6))}
      ${textStack(MODE_TEXT.x, MODE_TEXT.y, 'pst-mode-text', MODES, (mode) => mode, 'middle', 6)}
    </g>`;

/** The input, and the plate it is carried on. */
const inputChip = `<g class="pst-input">
      ${CHIP_STATES.map(
        (state) =>
          `<rect class="pst-chip-bg pst-chip-bg--${state}" x="${CHIP.x}" y="${CHIP.y}" width="${CHIP.w}" height="${CHIP.h}" rx="18" />`,
      ).join(pad(6))}
      ${textStack(
        CHIP_TEXT.x,
        CHIP_TEXT.y,
        'pst-chip-text',
        CHIP_STATES,
        (state) => (state === 'injected' ? 'injected' : 'input'),
        'middle',
        6,
      )}
    </g>`;

/** One plan cache slot: the plate, the plan inside it, and the ring it wears. */
const cacheSlot = (index: number): string => {
  const x = SLOT_XS[index] ?? 0;
  const n = index + 1;
  return `<g class="pst-slot pst-slot--${n}" data-pst-slot="${SLOT_STATE}">
      <rect class="pst-slot-ring" x="${x - SLOT_INSET}" y="${SLOT.y - SLOT_INSET}" width="${SLOT.w + SLOT_INSET * 2}" height="${SLOT.h + SLOT_INSET * 2}" rx="${SLOT.rx + SLOT_INSET}" />
      <rect class="pst-slot-box" x="${x}" y="${SLOT.y}" width="${SLOT.w}" height="${SLOT.h}" rx="${SLOT.rx}" />
      <rect class="pst-slot-plan" x="${x + (SLOT.w - PLAN_BAR.w) / 2}" y="${SLOT.y + (SLOT.h - PLAN_BAR.h) / 2}" width="${PLAN_BAR.w}" height="${PLAN_BAR.h}" rx="${PLAN_BAR.rx}" />
    </g>`;
};

/** One cell of the result strip: one row that came back, or did not. */
const resultCell = (index: number): string => {
  const x = CELL_XS[index] ?? 0;
  return `<rect class="pst-cell pst-cell--${index + 1}" x="${x}" y="${CELL.y}" width="${CELL.side}" height="${CELL.side}" rx="${CELL.rx}" />`;
};

const stageAttrs = Object.entries(STAGE_STATE)
  .map(([name, value]) => `${name}="${value}"`)
  .join(' ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageAttrs} aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_LANE, Y_APP_BOTTOM, Y_DB_TOP, 'scene-link pst-lane pst-lane--query')}
  ${verticalLink(X_LANE, Y_DB_BOTTOM, Y_RESULTS_TOP, 'scene-link pst-lane pst-lane--result')}

  ${clientBox({
    x: APP.x,
    width: APP.w,
    y: APP.y,
    height: APP.h,
    title: 'App',
    titleX: APP_TITLE.x,
    titleY: APP_TITLE.y,
    titleAnchor: null,
    extraClass: 'pst-app',
    children: `
    ${modePlate}

    <rect class="pst-stmt" x="${STMT.x}" y="${STMT.y}" width="${STMT.w}" height="${STMT.h}" rx="14" />
    <rect class="pst-hole" x="${HOLE.x}" y="${HOLE.y}" width="${HOLE.w}" height="${HOLE.h}" rx="10" />
    <rect class="pst-bridge" x="${BRIDGE.x}" y="${BRIDGE.y}" width="${BRIDGE.w}" height="${BRIDGE.h}" />

    ${inputChip}`,
  })}

  ${serviceBox({
    x: DB.x,
    width: DB.w,
    y: DB.y,
    height: DB.h,
    title: 'Database',
    titleX: DB_TITLE.x,
    titleY: DB_TITLE.y,
    titleAnchor: null,
    className: 'scene-node pst-db',
    children: `
    <circle class="pst-lamp-ring pst-lamp-ring--parse" cx="${PARSE_LAMP.cx}" cy="${PARSE_LAMP.cy}" r="${LAMP_RING_R}" />
    <circle class="pst-lamp pst-lamp--parse" cx="${PARSE_LAMP.cx}" cy="${PARSE_LAMP.cy}" r="${LAMP_R}" />
    <text class="pst-lamp-text pst-lamp-text--parse" x="${PARSE_TEXT.x}" y="${PARSE_TEXT.y}">parse</text>

    <circle class="pst-lamp-ring pst-lamp-ring--plan" cx="${PLAN_LAMP.cx}" cy="${PLAN_LAMP.cy}" r="${LAMP_RING_R}" />
    <circle class="pst-lamp pst-lamp--plan" cx="${PLAN_LAMP.cx}" cy="${PLAN_LAMP.cy}" r="${LAMP_R}" />
    <text class="pst-lamp-text pst-lamp-text--plan" x="${PLAN_TEXT.x}" y="${PLAN_TEXT.y}">plan</text>

    <text class="pst-cache-text" x="${CACHE_TEXT.x}" y="${CACHE_TEXT.y}">cache</text>
    ${SLOT_XS.map((_x, index) => cacheSlot(index)).join(pad(4))}

    ${counterVariants({
      x: HIT_TEXT.x,
      y: HIT_TEXT.y,
      className: 'pst-hit',
      max: HIT_MAX,
      format: (n) => mono(`hit ${n}`),
      anchor: 'middle',
    })}

    ${counterVariants({
      x: MISS_TEXT.x,
      y: MISS_TEXT.y,
      className: 'pst-miss',
      max: MISS_MAX,
      format: (n) => mono(`miss ${n}`),
      anchor: 'middle',
    })}`,
  })}

  ${serviceBox({
    x: RESULTS.x,
    width: RESULTS.w,
    y: RESULTS.y,
    height: RESULTS.h,
    title: 'Results',
    titleX: RESULTS_TITLE.x,
    titleY: RESULTS_TITLE.y,
    titleAnchor: null,
    className: 'scene-service pst-results',
    children: `
    ${CELL_XS.map((_x, index) => resultCell(index)).join(pad(4))}

    ${counterVariants({
      x: OK_TEXT.x,
      y: OK_TEXT.y,
      className: 'pst-ok',
      max: OK_MAX,
      format: (n) => mono(`ok ${n}`),
      anchor: 'middle',
    })}

    <g class="pst-leak">
      ${LEAK_STATES.map(
        (state) =>
          `<rect class="pst-leak-bg pst-leak-bg--${state}" x="${LEAK_PLATE.x}" y="${LEAK_PLATE.y}" width="${LEAK_PLATE.w}" height="${LEAK_PLATE.h}" rx="18" />`,
      ).join(pad(6))}
      <line class="pst-leak-bar" x1="${LEAK_TEXT.x - 66}" y1="${LEAK_TEXT.y - 13}" x2="${LEAK_TEXT.x + 66}" y2="${LEAK_TEXT.y - 13}" />
      ${textStack(LEAK_TEXT.x, LEAK_TEXT.y, 'pst-leak-text', LEAK_STATES, () => 'leak', 'middle', 6)}
    </g>`,
  })}

  ${requestsLayer()}
</svg>`;
