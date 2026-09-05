/**
 * Static stage markup for the SQL Injection scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Three bands, arranged around the one
 * question the scene asks: is what the caller typed a sentence, or a value?
 *   - y 0..400       above the cropped viewBox (see shared VIEWBOX)
 *   - y 400..440     the frame's top padding; nothing is drawn here
 *   - y 440..680     App (x 130..950): the input field, the chip that says what
 *                    was typed into it, and the word `input`. A chip is round
 *                    when the value is ordinary, a jagged ribbon when it is
 *                    malformed, and round with a jagged vein inside when it is
 *                    well formed and still malicious
 *   - y 880..1270    Query (x 130..950): the query bar, which is a `code` track
 *                    and a `data` slot. The track is drawn twice on one spot —
 *                    the shape it keeps, and the shape it takes when an input is
 *                    glued into it — and the slot exists only once there is a
 *                    second channel to put values on. Below them the `check`
 *                    rule card and the `reject` lamp the third step turns on
 *   - y 1500..1740   DB (x 280..800): the `rows n` readout, the `all` alarm that
 *                    lights when an answer carried the whole table, the `role`
 *                    badge naming what the app's account may do, and the `deny`
 *                    lamp for the command that fell outside it
 *
 * Two lane segments and no others, both axis aligned and both one-directional:
 *   - `X_LANE` (540) from the App's bottom edge at 680 to the Query's top edge
 *     at 880, carrying what was typed down to where the query is built.
 *   - `X_LANE` (540) again from the Query's bottom edge at 1270 to the DB's top
 *     edge at 1500, carrying an execution down to the answer.
 *   Nothing travels upwards: an answer is a readout inside the DB, not a packet,
 *   which is what keeps the two segments 230px apart and never busy at once.
 *
 * A traveller is a dot with a halo of r 26, so each lane sweeps a 52px band at
 * x 514..566 and everything written beside one keeps 30px off it. The upper lane
 * sweeps y 654..906, so the App writes nothing below y 620 in that column and
 * the Query writes nothing above y 936 in it. The lower lane sweeps y 1244..1526,
 * so the Query writes nothing below y 1214 in that column and the DB nothing
 * above y 1556 — which is why the `Query` title and the `check` card sit left of
 * the corridor, the `reject` lamp sits in the quiet stretch between the two
 * halos, and the DB band starts its readouts under y 1610.
 *
 * Declared texture: the input field and the chip inside it, the two code tracks,
 * the data slot and the value held in it, the check card, the reject lamp, the
 * all lamp, the role badge and the deny lamp. Everything else on the stage is a
 * word, and every word is one of the twelve fixed labels. No SQL is drawn
 * anywhere: the attack is a shape, because a shape is what it is.
 *
 * Every value the reader can read is a stack of elements on one spot with a base
 * rule hiding all of them and the current `data-*` revealing one, so nothing is
 * interpolated and scrubbing backwards lands on the value rather than on an
 * average of two.
 */

import { VIEWBOX, clientBox, counterVariants, requestsLayer, serviceBox, verticalLink } from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- geometry --------------------------------------------------------------

/** The one column anything travels on, and the four edges it runs between. */
export const X_LANE = 540;
export const Y_APP_BOTTOM = 680;
export const Y_QUERY_TOP = 880;
export const Y_QUERY_BOTTOM = 1270;
export const Y_DB_TOP = 1500;

/** The App band: what was typed, and what shape it has. */
const APP = { x: 130, y: 440, w: 820, h: 240 };
const APP_TITLE = { x: 152, y: 503 };
const FIELD = { x: 170, y: 528, w: 460, h: 92 };
const CHIP = { x: 196, y: 546, w: 150, h: 56 };
const INPUT_TEXT = { x: 668, y: 588 };

/** The Query band: the two channels, and the filter in front of them. */
const QUERY = { x: 130, y: 880, w: 820, h: 390 };
const QUERY_TITLE = { x: 152, y: 948 };
const CODE = { x: 170, y: 1000, w: 470, h: 76, rx: 16 };
/** How far right the track reaches once an input has been glued into it. */
const CODE_TOOTH = { from: 700, to: 790 };
const CODE_TEXT = { x: 405, y: 1048 };
const SLOT = { x: 680, y: 1000, w: 240, h: 76, rx: 16 };
const HELD = { x: 700, y: 1014, w: 80, h: 48 };
const DATA_TEXT = { x: 850, y: 1048 };
const CARD = { x: 170, y: 1120, w: 300, h: 80 };
const CHECK_TEXT = { x: 320, y: 1170 };
const REJECT_LAMP = { cx: 540, cy: 1160, r: 22, ringR: 34 };
const REJECT_TEXT = { x: 594, y: 1173 };

/** The DB band: what came back, and how far the account reaches. */
const DB = { x: 280, y: 1500, w: 520, h: 240 };
const DB_TITLE = { x: 312, y: 1568 };
const ROWS_TEXT = { x: 312, y: 1644 };
const ALL_LAMP = { cx: 520, cy: 1630, r: 20 };
const ALL_TEXT = { x: 556, y: 1643 };
const ROLE = { x: 306, y: 1672, w: 190, h: 52 };
const ROLE_TEXT = { x: 401, y: 1707 };
const DENY_LAMP = { cx: 556, cy: 1698, r: 20 };
const DENY_TEXT = { x: 592, y: 1711 };

// --- what the stage can say about itself -----------------------------------

/**
 * How many rows the table has. An answer that carries every one of them is the
 * breach, and it is drawn as the number it is rather than as a word for it.
 */
export const TABLE_ROWS = 8;

/** How many rows a query that matched one customer comes back with. */
export const ROWS_ONE = 1;

/** How many rows a query that matched nobody comes back with. */
export const ROWS_NONE = 0;

/**
 * The shape of what was typed. `normal` is an ordinary value, `spiky` is one
 * that is malformed on its face, and `bypass` is one that is perfectly well
 * formed and still means harm — which is the whole reason validation is a
 * second layer rather than the defence.
 */
export const SHAPES = ['normal', 'spiky', 'bypass'] as const;
export type Shape = (typeof SHAPES)[number];

/** What the input field is holding. `none` is a field nobody has typed into. */
export const CHIP_STATES = ['none', ...SHAPES] as const;
export type ChipState = (typeof CHIP_STATES)[number];

/**
 * The shape of the code track. `fixed` is the sentence the developer wrote;
 * `morphed` is the same track after an input was glued into it, reaching
 * further right and ending in teeth. The two are drawn on one spot, so the
 * change is a change of shape rather than a change of colour.
 */
export const CODE_STATES = ['fixed', 'morphed'] as const;
export type CodeState = (typeof CODE_STATES)[number];

/**
 * The data slot. `off` is a query with no second channel at all, which is what
 * concatenation means and why the slot is not merely empty in the first step —
 * it does not exist. `empty` is a channel with nothing on it yet, `filled` is
 * one carrying a value.
 */
export const DATA_STATES = ['off', 'empty', 'filled'] as const;
export type DataState = (typeof DATA_STATES)[number];

/** What the slot is carrying, drawn in the same three shapes as the chip. */
export const HELD_STATES = ['none', ...SHAPES] as const;
export type HeldState = (typeof HELD_STATES)[number];

/** What the check card just said about an input, if it said anything. */
export const VERDICTS = ['none', 'pass', 'reject'] as const;
export type Verdict = (typeof VERDICTS)[number];

/** A word the stage can say about itself, which is either said or not. */
export const FLAGS = ['off', 'on'] as const;
export type Flag = (typeof FLAGS)[number];

/** What the scene is holding up for a moment, drawn on the band it is about. */
export const MARKS = ['none', 'channels', 'shape', 'second', 'blast'] as const;
export type Mark = (typeof MARKS)[number];

/**
 * What every `data-*` on the stage starts at. The markup below is written from
 * these, so the opening frame is the whole diagram in its starting state — an
 * empty input field, a query that is one glued track with no data channel at
 * all, no rule card, a database that has answered nothing and names no role,
 * and nothing in flight — and the timeline never restates a value already there.
 */
export const STAGE_STATE: Record<string, string> = {
  'data-sqli-ghost': 'off',
  'data-sqli-chip': 'none',
  'data-sqli-code': 'fixed',
  'data-sqli-data': 'off',
  'data-sqli-held': 'none',
  'data-sqli-check': 'off',
  'data-sqli-verdict': 'none',
  'data-sqli-rows': String(ROWS_NONE),
  'data-sqli-all': 'off',
  'data-sqli-role': 'off',
  'data-sqli-deny': 'off',
  'data-sqli-mark': 'none',
  'data-sqli-settled': 'off',
};

// --- markup ----------------------------------------------------------------

/** Newline plus `n` spaces, the separator between lines of one fragment. */
const pad = (n: number): string => `\n${' '.repeat(n)}`;

/** Non-breaking spaces, so a monospaced readout keeps its gaps in SVG. */
const mono = (text: string): string => text.replace(/ /g, '&#160;');

const fixed2 = (value: number): string => Number(value.toFixed(2)).toString();

/**
 * A jagged ribbon across a box: a zigzag along the top edge and the mirror of
 * it along the bottom, so the silhouette is teeth rather than a rounded plate.
 * `teeth` is how many peaks the top edge has.
 */
function spikyPoints(x: number, y: number, w: number, h: number, teeth: number): string {
  const mid = y + h / 2;
  const step = w / (teeth * 2);
  const top: string[] = [];
  const bottom: string[] = [];
  for (let i = 0; i <= teeth * 2; i += 1) {
    const px = x + step * i;
    const py = i % 2 === 0 ? mid : y;
    top.push(`${fixed2(px)},${fixed2(py)}`);
    if (i > 0 && i < teeth * 2) bottom.push(`${fixed2(px)},${fixed2(i % 2 === 0 ? mid : y + h)}`);
  }
  return [...top, ...bottom.reverse()].join(' ');
}

/** The jagged line drawn inside a well-formed chip that is not well meant. */
function veinPoints(x: number, y: number, w: number, h: number, teeth: number): string {
  const mid = y + h / 2;
  const inset = w * 0.14;
  const span = w - inset * 2;
  const step = span / teeth;
  const swing = h * 0.28;
  const points: string[] = [];
  for (let i = 0; i <= teeth; i += 1) {
    const py = i === 0 || i === teeth ? mid : mid + (i % 2 === 1 ? -swing : swing);
    points.push(`${fixed2(x + inset + step * i)},${fixed2(py)}`);
  }
  return points.join(' ');
}

/**
 * The star a malformed input travels as. It is built here rather than in the
 * timeline so the shape and the chip that stands for the same thing are one
 * definition, and it is centred on the origin because a traveller is positioned
 * by its group.
 */
function starPoints(outer: number, inner: number, points: number): string {
  const out: string[] = [];
  for (let i = 0; i < points * 2; i += 1) {
    const r = i % 2 === 0 ? outer : inner;
    const angle = (Math.PI / points) * i - Math.PI / 2;
    out.push(`${fixed2(Math.cos(angle) * r)},${fixed2(Math.sin(angle) * r)}`);
  }
  return out.join(' ');
}

/** The silhouette a malformed input carries down the lane. */
export const SPIKE_POINTS = starPoints(19, 8.5, 8);

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

/**
 * The three shapes a value can have, drawn on one spot. A round plate, a jagged
 * ribbon, and a round plate with a jagged vein inside it: told apart by outline
 * before they are told apart by colour.
 */
const shapeStack = (
  className: string,
  box: { x: number; y: number; w: number; h: number },
  teeth: number,
  indent: number,
): string => {
  const rx = box.h / 2;
  const lines = [
    `<rect class="${className} ${className}--normal" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="${rx}" />`,
    `<polygon class="${className} ${className}--spiky" points="${spikyPoints(box.x, box.y, box.w, box.h, teeth)}" />`,
    `<g class="${className} ${className}--bypass">`,
    `${' '.repeat(indent + 2)}<rect class="${className}-plate" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="${rx}" />`,
    `${' '.repeat(indent + 2)}<polyline class="${className}-vein" points="${veinPoints(box.x, box.y, box.w, box.h, teeth)}" />`,
    `${' '.repeat(indent)}</g>`,
  ];
  return lines.join(pad(indent));
};

/** The query bar's code track, drawn twice on one spot. */
const codeTracks = [
  `<rect class="sqli-code sqli-code--fixed" x="${CODE.x}" y="${CODE.y}" width="${CODE.w}" height="${CODE.h}" rx="${CODE.rx}" />`,
  `<path class="sqli-code sqli-code--morphed" d="M ${CODE.x + CODE.rx} ${CODE.y} A ${CODE.rx} ${CODE.rx} 0 0 0 ${CODE.x} ${CODE.y + CODE.rx} L ${CODE.x} ${CODE.y + CODE.h - CODE.rx} A ${CODE.rx} ${CODE.rx} 0 0 0 ${CODE.x + CODE.rx} ${CODE.y + CODE.h} L ${CODE_TOOTH.from} ${CODE.y + CODE.h} L ${CODE_TOOTH.to} ${CODE.y + CODE.h - 19} L ${CODE_TOOTH.from} ${CODE.y + CODE.h - 38} L ${CODE_TOOTH.to} ${CODE.y + 19} L ${CODE_TOOTH.from} ${CODE.y} Z" />`,
].join(pad(4));

/** The data slot, which is hollow while it is waiting and solid once it holds. */
const dataSlot = [
  `<rect class="sqli-slot sqli-slot--empty" x="${SLOT.x}" y="${SLOT.y}" width="${SLOT.w}" height="${SLOT.h}" rx="${SLOT.rx}" />`,
  `<rect class="sqli-slot sqli-slot--filled" x="${SLOT.x}" y="${SLOT.y}" width="${SLOT.w}" height="${SLOT.h}" rx="${SLOT.rx}" />`,
].join(pad(4));

/** How many rows the last answer carried. One text per value, one of them shown. */
const rowsReadout = counterVariants({
  x: ROWS_TEXT.x,
  y: ROWS_TEXT.y,
  className: 'sqli-rows',
  max: TABLE_ROWS,
  format: (n) => mono(`rows ${n}`),
  anchor: null,
  indent: 4,
});

const stageAttrs = Object.entries(STAGE_STATE)
  .map(([name, value]) => `${name}="${value}"`)
  .join(' ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageAttrs} aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_LANE, Y_APP_BOTTOM, Y_QUERY_TOP, 'scene-link sqli-lane sqli-lane--input')}
  ${verticalLink(X_LANE, Y_QUERY_BOTTOM, Y_DB_TOP, 'scene-link sqli-lane sqli-lane--exec')}

  ${clientBox({
    x: APP.x,
    width: APP.w,
    y: APP.y,
    height: APP.h,
    title: 'App',
    titleX: APP_TITLE.x,
    titleY: APP_TITLE.y,
    titleAnchor: null,
    extraClass: 'sqli-app',
    children: `
    <rect class="sqli-field" x="${FIELD.x}" y="${FIELD.y}" width="${FIELD.w}" height="${FIELD.h}" rx="18" />

    ${shapeStack('sqli-chip', { x: CHIP.x, y: CHIP.y, w: CHIP.w, h: CHIP.h }, 3, 4)}

    <text class="sqli-input-text" x="${INPUT_TEXT.x}" y="${INPUT_TEXT.y}">input</text>`,
  })}

  ${serviceBox({
    x: QUERY.x,
    width: QUERY.w,
    y: QUERY.y,
    height: QUERY.h,
    title: 'Query',
    titleX: QUERY_TITLE.x,
    titleY: QUERY_TITLE.y,
    titleAnchor: null,
    className: 'scene-node sqli-query',
    children: `
    ${codeTracks}
    <text class="sqli-code-text" x="${CODE_TEXT.x}" y="${CODE_TEXT.y}" text-anchor="middle">code</text>

    ${dataSlot}

    ${shapeStack('sqli-held', { x: HELD.x, y: HELD.y, w: HELD.w, h: HELD.h }, 2, 4)}

    ${textStack(DATA_TEXT.x, DATA_TEXT.y, 'sqli-data-text', ['empty', 'filled'], () => 'data', 'middle', 4)}

    <g class="sqli-check">
      <rect class="sqli-card" x="${CARD.x}" y="${CARD.y}" width="${CARD.w}" height="${CARD.h}" rx="18" />
      <text class="sqli-check-text" x="${CHECK_TEXT.x}" y="${CHECK_TEXT.y}" text-anchor="middle">check</text>
    </g>

    <g class="sqli-reject">
      <circle class="sqli-reject-ring" cx="${REJECT_LAMP.cx}" cy="${REJECT_LAMP.cy}" r="${REJECT_LAMP.ringR}" />
      <circle class="sqli-reject-lamp" cx="${REJECT_LAMP.cx}" cy="${REJECT_LAMP.cy}" r="${REJECT_LAMP.r}" />
      <text class="sqli-reject-text" x="${REJECT_TEXT.x}" y="${REJECT_TEXT.y}">reject</text>
    </g>`,
  })}

  ${serviceBox({
    x: DB.x,
    width: DB.w,
    y: DB.y,
    height: DB.h,
    title: 'DB',
    titleX: DB_TITLE.x,
    titleY: DB_TITLE.y,
    titleAnchor: null,
    className: 'scene-service sqli-db',
    children: `
    ${rowsReadout}

    <g class="sqli-all">
      <circle class="sqli-all-lamp" cx="${ALL_LAMP.cx}" cy="${ALL_LAMP.cy}" r="${ALL_LAMP.r}" />
      <text class="sqli-all-text" x="${ALL_TEXT.x}" y="${ALL_TEXT.y}">all</text>
    </g>

    <g class="sqli-role">
      <rect class="sqli-role-bg" x="${ROLE.x}" y="${ROLE.y}" width="${ROLE.w}" height="${ROLE.h}" rx="14" />
      <text class="sqli-role-text" x="${ROLE_TEXT.x}" y="${ROLE_TEXT.y}" text-anchor="middle">role</text>
    </g>

    <g class="sqli-deny">
      <circle class="sqli-deny-lamp" cx="${DENY_LAMP.cx}" cy="${DENY_LAMP.cy}" r="${DENY_LAMP.r}" />
      <text class="sqli-deny-text" x="${DENY_TEXT.x}" y="${DENY_TEXT.y}">deny</text>
    </g>`,
  })}

  ${requestsLayer()}
</svg>`;
