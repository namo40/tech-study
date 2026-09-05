/**
 * Static stage markup for the Rollback scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Three bands, read top to bottom as
 * the return road and the two things that never take it:
 *   - y 0..400       above the cropped viewBox (see shared VIEWBOX)
 *   - y 400..440     the frame's top padding; nothing is drawn here
 *   - y 440..680     Traffic (x 130..950): the `err n` readout over the last
 *                    three answers, the running `ok n` count, and the three
 *                    answer chips those two numbers are read off
 *   - y 880..1270    Releases (x 130..950): the revision cards `v1`, `v2` and
 *                    `v3`, the `active` pill sitting over whichever one holds
 *                    traffic, the shelf rail under each card that history mode
 *                    puts there, and the build bar that only the first step's
 *                    ghost ever needs
 *   - y 1500..1740   State (x 280..800): the `db` card with its `old` and `new`
 *                    record rows, the bracket that says neighbouring revisions
 *                    read each other's writes, the barred mark for a read the
 *                    old code cannot make, and the side effects that already
 *                    left and are drawn pointing out of the box
 *
 * Two lane segments and no others, both axis aligned and both ending on a box
 * edge:
 *   - `X_LANE` (540) between the Traffic band's bottom edge at 680 and the
 *     Releases band's top edge at 880. It runs both ways: a request rides it
 *     down to whichever revision is active, and the same request rides its
 *     answer back up to the band that counts answers. The cadence is longer
 *     than one whole round trip, so the lane never holds two travellers at
 *     once and the two directions cannot meet.
 *   - `X_LANE` (540) between the Releases band's bottom edge at 1270 and the
 *     State band's top edge at 1500. This one runs downward only: a record the
 *     active revision writes, and a side effect it sends out.
 *
 * What happens inside a band is not a traveller. Moving the pointer is the
 * `active` pill changing which card it sits over, shelving a revision is that
 * card's own state, and a record landing in the database is a row appearing on
 * the `db` card, because the whole argument of the scene is that going back is
 * something that happens in one place and not something that travels.
 *
 * A traveller is a dot with a halo of r 26, so a lane sweeps a 52px band and
 * everything written beside it keeps 30px off. The upper lane sweeps y 654..906
 * at x 514..566 and the lower one y 1244..1526 at the same x, so the Traffic
 * band writes nothing below y 624 in that column, the Releases band nothing
 * above y 936 or below y 1214 in it, and the State band nothing above y 1556.
 *
 * Declared texture: the three answer chips and their glyphs, the `err n` plate
 * the readout sits on, the six card plates and their state bars and strike
 * lines, the shelf rails, the `active` pills, the build track and its fills,
 * the `db` card, the two record blocks, the compatibility bracket, the barred
 * read mark and the escaped-effect arrows. Everything else on the stage is a
 * word, and every word is one of the twelve fixed labels or a number.
 *
 * Nothing is told apart by colour alone. A chip with no answer yet is a
 * **dashed empty outline**, one holding a good answer is a **filled plate with
 * a check**, one holding an error is a **filled plate with a cross**. A card
 * that was never deployed is a **dashed hollow plate**, one standing by is a
 * **dashed plate with a dashed bar**, one holding traffic is a **filled plate
 * with a solid bar**, one on the shelf is a **hollow plate on a solid rail**,
 * one known bad is a **hatched plate with a hollow dashed bar**, and one thrown
 * away by the ghost is a **faint dashed plate with a line struck through it**.
 * The shelf rail is **absent in the ghost, dashed where the slot is empty and
 * solid under a card that is kept**. A read the old code cannot make is a
 * **circle with a bar across it**; the compatible window is a **bracket with an
 * arrowhead at each end**. An escaped effect is an **arrow pointing out of the
 * box**, and it is never taken off again.
 *
 * Every value the reader can read is a stack of elements on one spot with a
 * base rule hiding all of them and the current `data-*` revealing exactly one,
 * so nothing is interpolated and scrubbing backwards lands on the value rather
 * than on an average of two: the `err n` readout, the `ok n` readout, each
 * chip's three plates, each card's six plates and five bars, each rail's two
 * spellings, the three `active` pills, the two build fills, the `new` record
 * row, the compatibility bracket, the barred read and the three escape counts.
 * There is no continuous quantity anywhere on this stage.
 */

import { VIEWBOX, requestsLayer, serviceBox, verticalLink } from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- geometry --------------------------------------------------------------

/** The one column anything travels on, and the four edges it runs between. */
export const X_LANE = 540;
export const Y_TRAFFIC_BOTTOM = 680;
export const Y_RELEASES_TOP = 880;
export const Y_RELEASES_BOTTOM = 1270;
export const Y_STATE_TOP = 1500;

/** The Traffic band: what came back, and the three answers it was read off. */
const TRAFFIC = { x: 130, y: 440, w: 820, h: 240 };
const TRAFFIC_TITLE = { x: 152, y: 500 };
const ERR = { x: 920, y: 502 };
const ERR_PLATE = { x: 760, y: 470, w: 174, h: 48, rx: 24 };
const OK = { x: 920, y: 566 };
const CHIP = { x0: 170, step: 116, y: 596, w: 96, h: 48, rx: 16 };

/** The Releases band: three revisions, the pointer, the shelf, the build. */
const RELEASES = { x: 130, y: 880, w: 820, h: 390 };
const RELEASES_TITLE = { x: 152, y: 938 };
const PILL = { w: 180, h: 48, y: 962, rx: 24, textY: 994 };
const CARD = { y: 1026, w: 220, h: 130, rx: 22 };
const NAME = { dx: 28, y: 1074 };
const BAR = { dx: 28, y: 1100, w: 164, h: 26, rx: 13 };
const RAIL = { y: 1170, h: 18, rx: 9 };
const BUILD = { x: 420, y: 1168, w: 240, h: 28, rx: 14 };

/** The State band: the database, the compatible window, what escaped. */
const STATE = { x: 280, y: 1500, w: 520, h: 240 };
const STATE_TITLE = { x: 302, y: 1557 };
const DB = { x: 300, y: 1580, w: 240, h: 146, rx: 20 };
const DB_WORD = { x: 322, y: 1616 };
const ROW = { blockX: 322, blockW: 28, blockH: 22, wordX: 364 };
const ROW_OLD = { blockY: 1640, wordY: 1660 };
const ROW_NEW = { blockY: 1692, wordY: 1712 };
const COMPAT = { x: 552, w: 32, y0: 1642, y1: 1712 };
const WARN = { cx: 600, cy: 1700, r: 26 };
const ESCAPE = { x: 640, w: 128, h: 48, ys: [1596, 1660] };

// --- what the stage can say about itself -----------------------------------

/** The three revision slots, oldest to newest. */
export const REV_IDS = ['v1', 'v2', 'v3'] as const;
export type RevId = (typeof REV_IDS)[number];

const CARD_X: Record<RevId, number> = { v1: 160, v2: 430, v3: 700 };

/**
 * What a revision card says about itself.
 *  - `none` was never deployed.
 *  - `ready` is built and warm, standing by to be pointed at.
 *  - `live` is holding traffic and answering cleanly.
 *  - `shelf` is the previous revision, kept exactly where it stopped.
 *  - `bad` is the release the incident is about. It keeps saying so after the
 *    pointer has left it, because the bad revision is evidence.
 *  - `gone` only ever happens inside the first step's ghost: a revision thrown
 *    away by the deploy that replaced it, which is the whole reason that world
 *    has no way back.
 */
export const REV_STATES = ['none', 'ready', 'live', 'shelf', 'bad', 'gone'] as const;
export type RevState = (typeof REV_STATES)[number];

/** Which world the scene is in: no revision history, or a shelf. */
export const MODES = ['ghost', 'history'] as const;
export type Mode = (typeof MODES)[number];

/** What an answer chip is holding. */
export const CHIP_STATES = ['none', 'ok', 'err'] as const;
export type ChipState = (typeof CHIP_STATES)[number];

/** How many answers the `err n` readout is counted over. */
export const CHIP_COUNT = 3;
export const CHIP_IDS = ['c1', 'c2', 'c3'] as const;
export type ChipId = (typeof CHIP_IDS)[number];

/** The highest `ok n` the readout is ever asked for. */
export const OK_MAX = 18;

/** How far the ghost's rebuild gets before the ghost is taken away. */
export const BUILD_STEPS = 2;

/** How many effects the State band can draw as having already left. */
export const ESCAPE_MAX = 2;

/** What the scene holds up for a moment, drawn on the thing it is about. */
export const MARKS = ['none', 'noway', 'keep', 'road', 'fast', 'wide', 'gone'] as const;
export type Mark = (typeof MARKS)[number];

/**
 * What every `data-*` on the stage starts at. The markup below is written from
 * this, so the opening frame is the whole diagram in its starting state — one
 * revision live, two slots never deployed, no shelf because this world has no
 * history yet, three empty answer chips, `err 0`, `ok 0`, a database holding
 * only `old` records, nothing escaped and nothing in flight — and the timeline
 * never restates a value that is already there.
 */
export const STAGE_STATE: Record<string, string> = {
  'stage@data-rbk-mode': 'ghost',
  'stage@data-rbk-active': 'v1',
  'stage@data-rbk-err': '0',
  'stage@data-rbk-ok': '0',
  'stage@data-rbk-db': 'old',
  'stage@data-rbk-compat': 'off',
  'stage@data-rbk-warn': 'off',
  'stage@data-rbk-escaped': '0',
  'stage@data-rbk-build': 'off',
  'stage@data-rbk-mark': 'none',
  'stage@data-rbk-settled': 'off',
  'v1@data-rbk-rev': 'live',
  'v2@data-rbk-rev': 'none',
  'v3@data-rbk-rev': 'none',
  ...Object.fromEntries(CHIP_IDS.map((id) => [`${id}@data-rbk-chip`, 'none'])),
};

// --- markup ----------------------------------------------------------------

/** Newline plus `n` spaces, the separator between lines of one fragment. */
const pad = (n: number): string => `\n${' '.repeat(n)}`;

/** Non-breaking spaces, so a monospaced readout keeps its gaps in SVG. */
const mono = (text: string): string => text.replace(/ /g, '&#160;');

/** One spot, one text per value it can hold. Exactly one is ever revealed. */
const readout = (
  x: number,
  y: number,
  className: string,
  values: readonly string[],
  format: (value: string) => string,
  indent: number,
): string =>
  values
    .map(
      (value) =>
        `<text class="scene-counter ${className} ${className}--${value}" x="${x}" y="${y}" text-anchor="end">${mono(format(value))}</text>`,
    )
    .join(pad(indent));

const errReadout = readout(
  ERR.x,
  ERR.y,
  'rbk-err',
  ['0', '1', '2', '3'],
  (value) => `err ${value}`,
  4,
);

const okReadout = readout(
  OK.x,
  OK.y,
  'rbk-ok',
  Array.from({ length: OK_MAX + 1 }, (_v, n) => String(n)),
  (value) => `ok ${value}`,
  4,
);

/** One answer chip: an empty outline, a good answer, an error. */
const chip = (id: ChipId, index: number): string => {
  const x = CHIP.x0 + index * CHIP.step;
  const cx = x + CHIP.w / 2;
  const cy = CHIP.y + CHIP.h / 2;
  const plates = CHIP_STATES.map(
    (state) =>
      `<rect class="rbk-chip-bg rbk-chip-bg--${state}" x="${x}" y="${CHIP.y}" width="${CHIP.w}" height="${CHIP.h}" rx="${CHIP.rx}" />`,
  ).join(pad(6));
  return `<g class="rbk-chip rbk-chip--${id}" data-rbk-chip="${STAGE_STATE[`${id}@data-rbk-chip`]}">
      ${plates}
      <path class="rbk-chip-glyph rbk-chip-glyph--ok" d="M ${cx - 15} ${cy + 1} L ${cx - 5} ${cy + 11} L ${cx + 16} ${cy - 12}" />
      <path class="rbk-chip-glyph rbk-chip-glyph--err" d="M ${cx - 13} ${cy - 13} L ${cx + 13} ${cy + 13} M ${cx + 13} ${cy - 13} L ${cx - 13} ${cy + 13}" />
    </g>`;
};

/** The pill carrying the word `active`, drawn once over every card slot. */
const pill = (id: RevId): string => {
  const cx = (CARD_X[id] ?? 0) + CARD.w / 2;
  return `<g class="rbk-pill rbk-pill--${id}">
      <rect class="rbk-pill-bg" x="${cx - PILL.w / 2}" y="${PILL.y}" width="${PILL.w}" height="${PILL.h}" rx="${PILL.rx}" />
      <text class="rbk-pill-word" x="${cx}" y="${PILL.textY}" text-anchor="middle">active</text>
    </g>`;
};

/** One revision: six plates, its name, five bars, a strike line and a rail. */
const card = (id: RevId): string => {
  const x = CARD_X[id] ?? 0;
  const plates = REV_STATES.map(
    (state) =>
      `<rect class="rbk-card-bg rbk-card-bg--${state}" x="${x}" y="${CARD.y}" width="${CARD.w}" height="${CARD.h}" rx="${CARD.rx}" />`,
  ).join(pad(6));
  const bars = (['ready', 'live', 'shelf', 'bad'] as const)
    .map(
      (state) =>
        `<rect class="rbk-card-bar rbk-card-bar--${state}" x="${x + BAR.dx}" y="${BAR.y}" width="${BAR.w}" height="${BAR.h}" rx="${BAR.rx}" />`,
    )
    .join(pad(6));
  return `<g class="rbk-rev rbk-rev--${id}" data-rbk-rev="${STAGE_STATE[`${id}@data-rbk-rev`]}">
      ${plates}
      <text class="scene-mono rbk-card-name" x="${x + NAME.dx}" y="${NAME.y}">${id}</text>
      ${bars}
      <line class="rbk-card-strike" x1="${x + 18}" y1="${CARD.y + CARD.h - 18}" x2="${x + CARD.w - 18}" y2="${CARD.y + 18}" />
      <rect class="rbk-rail rbk-rail--slot" x="${x}" y="${RAIL.y}" width="${CARD.w}" height="${RAIL.h}" rx="${RAIL.rx}" />
      <rect class="rbk-rail rbk-rail--held" x="${x}" y="${RAIL.y}" width="${CARD.w}" height="${RAIL.h}" rx="${RAIL.rx}" />
    </g>`;
};

/** The rebuild the ghost is left with: a track and the little of it that fills. */
const buildBar = `<g class="rbk-build">
      <rect class="rbk-build-track" x="${BUILD.x}" y="${BUILD.y}" width="${BUILD.w}" height="${BUILD.h}" rx="${BUILD.rx}" />
      ${Array.from({ length: BUILD_STEPS }, (_v, n) => n + 1)
        .map(
          (n) =>
            `<rect class="rbk-build-fill rbk-build-fill--${n}" x="${BUILD.x}" y="${BUILD.y}" width="${Math.round((BUILD.w * n) / 6)}" height="${BUILD.h}" rx="${BUILD.rx}" />`,
        )
        .join(pad(6))}
    </g>`;

/** One record row on the `db` card: the block that holds it, and its name. */
const recordRow = (
  name: 'old' | 'new',
  row: { blockY: number; wordY: number },
): string =>
  `<rect class="rbk-record-block rbk-record-block--${name}" x="${ROW.blockX}" y="${row.blockY}" width="${ROW.blockW}" height="${ROW.blockH}" rx="6" />
      <text class="scene-mono rbk-record-word rbk-record-word--${name}" x="${ROW.wordX}" y="${row.wordY}">${name}</text>`;

/**
 * The bracket that says neighbouring revisions read each other's writes: a
 * span between the two record rows with an arrowhead at each end.
 */
const compatBracket = `<g class="rbk-compat">
      <line class="rbk-compat-span" x1="${COMPAT.x + 16}" y1="${COMPAT.y0 + 6}" x2="${COMPAT.x + 16}" y2="${COMPAT.y1 - 6}" />
      <path class="rbk-compat-head" d="M ${COMPAT.x + 4} ${COMPAT.y0 + 16} L ${COMPAT.x + 16} ${COMPAT.y0} L ${COMPAT.x + 28} ${COMPAT.y0 + 16}" />
      <path class="rbk-compat-head" d="M ${COMPAT.x + 4} ${COMPAT.y1 - 16} L ${COMPAT.x + 16} ${COMPAT.y1} L ${COMPAT.x + 28} ${COMPAT.y1 - 16}" />
      <line class="rbk-compat-tick" x1="${COMPAT.x}" y1="${COMPAT.y0 + 6}" x2="${COMPAT.x + 16}" y2="${COMPAT.y0 + 6}" />
      <line class="rbk-compat-tick" x1="${COMPAT.x}" y1="${COMPAT.y1 - 6}" x2="${COMPAT.x + 16}" y2="${COMPAT.y1 - 6}" />
    </g>`;

/** A read the old code cannot make: a circle with a bar across it. */
const warnMark = `<g class="rbk-warn">
      <circle class="rbk-warn-ring" cx="${WARN.cx}" cy="${WARN.cy}" r="${WARN.r}" />
      <line class="rbk-warn-bar" x1="${WARN.cx - 18}" y1="${WARN.cy + 18}" x2="${WARN.cx + 18}" y2="${WARN.cy - 18}" />
    </g>`;

/** One effect that already left, drawn as an arrow pointing out of the box. */
const escapeArrow = (y: number): string => {
  const head = ESCAPE.x + ESCAPE.w;
  const neck = head - 40;
  return `<rect class="rbk-escape-tail" x="${ESCAPE.x}" y="${y}" width="10" height="${ESCAPE.h}" rx="5" />
        <path class="rbk-escape-arrow" d="M ${ESCAPE.x + 20} ${y + 14} L ${neck} ${y + 14} L ${neck} ${y + 2} L ${head} ${y + ESCAPE.h / 2} L ${neck} ${y + ESCAPE.h - 2} L ${neck} ${y + ESCAPE.h - 14} L ${ESCAPE.x + 20} ${y + ESCAPE.h - 14} Z" />`;
};

/**
 * The effects that have already left, one group per count, so the number of
 * arrows is a state rather than a tween and an empty band is genuinely empty.
 */
const escapeVariants = Array.from({ length: ESCAPE_MAX + 1 }, (_v, n) => n)
  .map((n) => {
    const arrows = ESCAPE.ys.slice(0, n).map((y) => escapeArrow(y)).join(pad(8));
    return `<g class="rbk-escape rbk-escape--${n}">${n === 0 ? '' : `${pad(8)}${arrows}${pad(6)}`}</g>`;
  })
  .join(pad(6));

const stageAttrs = Object.entries(STAGE_STATE)
  .filter(([key]) => key.startsWith('stage@'))
  .map(([key, value]) => `${key.slice('stage@'.length)}="${value}"`)
  .join(' ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageAttrs} aria-hidden="true" focusable="false">
  <defs>
    <pattern id="rbk-hatch" width="14" height="14" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
      <line class="rbk-hatch-line" x1="0" y1="0" x2="0" y2="14" stroke-width="6" />
    </pattern>
  </defs>

  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_LANE, Y_TRAFFIC_BOTTOM, Y_RELEASES_TOP, 'scene-link rbk-lane--call')}
  ${verticalLink(X_LANE, Y_RELEASES_BOTTOM, Y_STATE_TOP, 'scene-link rbk-lane--write')}

  ${serviceBox({
    x: TRAFFIC.x,
    width: TRAFFIC.w,
    y: TRAFFIC.y,
    height: TRAFFIC.h,
    title: 'Traffic',
    titleX: TRAFFIC_TITLE.x,
    titleY: TRAFFIC_TITLE.y,
    titleClass: 'scene-node-title rbk-title',
    titleAnchor: null,
    className: 'scene-client rbk-traffic',
    children: `
    <rect class="rbk-err-plate" x="${ERR_PLATE.x}" y="${ERR_PLATE.y}" width="${ERR_PLATE.w}" height="${ERR_PLATE.h}" rx="${ERR_PLATE.rx}" />
    ${errReadout}

    ${okReadout}

    ${CHIP_IDS.map((id, index) => chip(id, index)).join(pad(4))}`,
  })}

  ${serviceBox({
    x: RELEASES.x,
    width: RELEASES.w,
    y: RELEASES.y,
    height: RELEASES.h,
    title: 'Releases',
    titleX: RELEASES_TITLE.x,
    titleY: RELEASES_TITLE.y,
    titleClass: 'scene-node-title rbk-title',
    titleAnchor: null,
    className: 'scene-node rbk-releases',
    children: `
    ${REV_IDS.map((id) => pill(id)).join(pad(4))}

    ${REV_IDS.map((id) => card(id)).join(`\n\n    `)}

    ${buildBar}`,
  })}

  ${serviceBox({
    x: STATE.x,
    width: STATE.w,
    y: STATE.y,
    height: STATE.h,
    title: 'State',
    titleX: STATE_TITLE.x,
    titleY: STATE_TITLE.y,
    titleClass: 'scene-node-title rbk-title',
    titleAnchor: null,
    className: 'scene-service rbk-state',
    children: `
    <g class="rbk-db">
      <rect class="rbk-db-bg" x="${DB.x}" y="${DB.y}" width="${DB.w}" height="${DB.h}" rx="${DB.rx}" />
      <text class="scene-mono rbk-db-word" x="${DB_WORD.x}" y="${DB_WORD.y}">db</text>
      ${recordRow('old', ROW_OLD)}
      ${recordRow('new', ROW_NEW)}
    </g>

    ${compatBracket}

    ${warnMark}

    ${escapeVariants}`,
  })}

  ${requestsLayer()}
</svg>`;
