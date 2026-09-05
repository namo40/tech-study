/**
 * Static stage markup for the Publish-Subscribe scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Four bands, arranged around the one
 * thing the scene is about — the topic's log:
 *   - y 0..400        above the cropped viewBox (see shared VIEWBOX)
 *   - y 400..440      the frame's top padding; nothing is drawn here
 *   - y 440..680      Publisher: its name and `published n`, which is the only
 *                     number it knows. It never learns how many are listening
 *   - y 880..1270     Topic: the mode plate that reads `queue` or `topic`, the
 *                     `retention` line, the eight event cells laid left to right
 *                     in the order they were appended, and under them one
 *                     bookmark row per subscription
 *   - y 1500..1740    A on the left and B on the right: `offset n`, a badge, and
 *                     for B the `checkpoint n` card
 *   - y 1776..1896    C, which is not there at all until it joins
 *
 * Four lanes and no others, every one axis aligned and running through the
 * centre of the boxes it joins. An event goes down `X_PUBLISH` from the
 * Publisher's bottom edge to the Topic's top edge. A copy goes down `X_A` or
 * `X_B` from the Topic's bottom edge into a subscription, and a replayed copy
 * goes down `X_C` through the 100px gap between A and B into the C band. The
 * copy lanes are what makes the argument: one event arriving at the top leaves
 * again on two lanes at once, and neither lane knows about the other.
 *
 * A traveller sweeps 26px around every point it reaches and a label keeps 30px
 * clear of that, so the four lanes own four keep-outs: x 484..596 from y 624 to
 * y 936, x 254..366 and x 714..826 from y 1214 to y 1556, and x 484..596 from
 * y 1214 to y 1832. That is what decides the layout. The Publisher writes both
 * of its lines on the left. The Topic keeps every word left of x 484 or right of
 * x 596 above y 936, and stops its bookmark rows at y 1196 so the three lanes
 * leaving the box below them reach nothing. A and B name themselves and count
 * from x 152 and x 612, and hold their badges below y 1616 so the two copy lanes
 * land in clear space. C puts nothing at all between x 484 and x 596.
 *
 * The eight event cells and the three bookmark rows are a declared texture. A
 * cell carries no number, because what a cell says here is only whether it has
 * been written and whether it is still inside the retention window; which cell
 * is which is its position, and how many have been written is `published n` by
 * construction. A bookmark is a bar rather than a word for the same reason: the
 * number it stands for is already written in the subscription that owns it, and
 * drawing it twice is what would let the two disagree.
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

/** Events the log holds by the end, which is how many cells it is drawn with. */
export const MAX_SEQ = 8;

// --- geometry --------------------------------------------------------------

/** The publish lane: the Publisher's centre column, down into the Topic. */
export const X_PUBLISH = 540;
export const Y_PUBLISHER_BOTTOM = 680;
export const Y_TOPIC_TOP = 880;

/** The three copy lanes, all leaving the Topic's bottom edge. */
export const X_A = 310;
export const X_B = 770;
export const X_C = 540;
export const Y_TOPIC_BOTTOM = 1270;
export const Y_SUB_TOP = 1500;
export const Y_SUB_C_TOP = 1776;

/** The Publisher band. */
const PUBLISHER = { x: 130, y: 440, w: 820, h: 240 };
const PUBLISHER_TITLE_X = 170;
const PUBLISHER_TITLE_Y = 512;
const PUBLISHED_X = 170;
const PUBLISHED_Y = 604;

/** The Topic band. */
const TOPIC = { x: 130, y: 880, w: 820, h: 390 };
const TOPIC_LABEL_X = 152;
const TOPIC_LABEL_Y = 926;
const MODE_PLATE = { x: 700, y: 892, w: 230, h: 54 };
const MODE_TEXT_Y = 928;
const RETENTION_X = 190;
const RETENTION_Y = 976;

/** The log: eight cells, oldest on the left, in the order they were appended. */
const CELL_X0 = 196;
const CELL_W = 79;
const CELL_PITCH = 93;
const CELL_Y = 998;
const CELL_H = 68;

/** The band that covers whatever has aged out of the retention window. */
const BAND_X = 190;
const BAND_Y = 992;
const BAND_H = 80;

/** One bookmark row per subscription, under the cells they point into. */
const MARK_ROWS = [1088, 1136, 1184] as const;
const MARK_H = 20;
const MARK_W = 8;
const KEY_X = 152;
const KEY_DY = 17;

/** The two subscription boxes that are there from the first frame. */
const SUB_A = { x: 130, y: 1500, w: 360, h: 240 };
const SUB_B = { x: 590, y: 1500, w: 360, h: 240 };
const SUB_TITLE_Y = 1560;
const OFFSET_Y = 1642;
const BADGE_Y = 1616;
const BADGE_H = 52;
const BADGE_W = 132;
const BADGE_TEXT_Y = 1650;
const A_TITLE_X = 152;
const A_OFFSET_X = 152;
const A_BADGE_X = 342;
const B_TITLE_X = 612;
const B_OFFSET_X = 612;
const B_BADGE_X = 802;
const CHECK_PLATE = { x: 612, y: 1672, w: 322, h: 52 };
const CHECK_TEXT_X = 773;
const CHECK_TEXT_Y = 1707;

/** The subscription that joins late, and is not drawn until it does. */
const SUB_C = { x: 130, y: 1776, w: 820, h: 120 };
const C_TITLE_X = 152;
const C_TITLE_Y = 1848;
const C_OFFSET_X = 230;
const C_OFFSET_Y = 1846;
const C_BADGE_X = 802;
const C_BADGE_Y = 1820;
const C_BADGE_TEXT_Y = 1854;

// --- what the stage can say about itself -----------------------------------

/** Which of the two things the middle box is behaving as. */
export const MODES = ['queue', 'topic'] as const;
export type Mode = (typeof MODES)[number];

/**
 * What a subscription's badge reads. `off` is C before it exists at all, which
 * is why it hides the whole box rather than picking a word.
 */
export const BADGES = ['off', 'live', 'down', 'catching'] as const;
export type Badge = (typeof BADGES)[number];

/** What one event cell can be: unwritten, held, or aged out of the window. */
export const CELL_STATES = ['none', 'live', 'gone'] as const;
export type CellState = (typeof CELL_STATES)[number];

/** What the two candidate starting points look like while C is choosing. */
export const CHOICES = ['none', 'both', 'start'] as const;
export type Choice = (typeof CHOICES)[number];

/** What the scene is holding up for a moment: nothing, the gap, or the window. */
export const MARKS = ['none', 'gap', 'limit'] as const;
export type Mark = (typeof MARKS)[number];

/** The three subscriptions, in the order their bookmark rows are drawn. */
export const SUBS = ['a', 'b', 'c'] as const;
export type Sub = (typeof SUBS)[number];

/**
 * What every `data-*` on the stage starts at. The markup below is written from
 * these, so the first frame is the whole diagram in its opening state — an empty
 * log, two live subscriptions reading from position zero, no third subscription,
 * no checkpoint, nothing expired — and the timeline never restates it.
 */
export const STAGE_STATE: Record<string, string> = {
  'data-ps-mode': 'queue',
  'data-ps-published': '0',
  'data-ps-offset-a': '0',
  'data-ps-offset-b': '0',
  'data-ps-offset-c': '0',
  'data-ps-badge-a': 'live',
  'data-ps-badge-b': 'live',
  'data-ps-badge-c': 'off',
  'data-ps-check': 'off',
  'data-ps-expired': '0',
  'data-ps-choice': 'none',
  'data-ps-mark': 'none',
  'data-ps-settled': 'off',
};

/** What every cell starts at, for the same reason. */
export const CELL_STATE: CellState = 'none';

// --- markup ----------------------------------------------------------------

/** Non-breaking spaces, so a monospaced label keeps its gaps in SVG. */
const mono = (text: string): string => text.replace(/ /g, '&#160;');

const pad = (n: number): string => `\n${' '.repeat(n)}`;

/** The left edge of cell `n`, counting from one. */
const cellX = (n: number): number => CELL_X0 + (n - 1) * CELL_PITCH;

/**
 * Where the bookmark for offset `n` sits: at the left edge of the log when
 * nothing has been read, and otherwise on the trailing edge of the last cell
 * this subscription consumed. A bookmark is between two events, never on one.
 */
const markX = (n: number): number => (n === 0 ? CELL_X0 : cellX(n) + CELL_W);

/** How many events the Publisher believes it has published. */
const publishedReadout = counterVariants({
  x: PUBLISHED_X,
  y: PUBLISHED_Y,
  className: 'ps-published',
  count: MAX_SEQ + 1,
  format: (n) => mono(`published ${n}`),
  indent: 4,
});

/** The plate that says which of the two shapes the middle box is behaving as. */
const modePlate = chip({
  x: MODE_PLATE.x,
  y: MODE_PLATE.y,
  width: MODE_PLATE.w,
  height: MODE_PLATE.h,
  rx: 18,
  className: 'ps-chip-mode',
  variant: 'outline',
  text: MODES.map(
    (mode) =>
      `<text class="scene-counter ps-mode ps-mode--${mode}" x="${MODE_PLATE.x + MODE_PLATE.w / 2}" y="${MODE_TEXT_Y}" text-anchor="middle">${mode}</text>`,
  ).join(pad(6)),
});

/**
 * The log. One cell per event the scene will ever append, written left to right
 * because that is the direction the log grows in, and carrying no name of its
 * own: a cell says only that it exists and whether it is still readable.
 */
const cells = Array.from(
  { length: MAX_SEQ },
  (_value, index) =>
    `<rect class="ps-cell ps-cell--${index + 1}" data-ps-cell="${CELL_STATE}" x="${cellX(index + 1)}" y="${CELL_Y}" width="${CELL_W}" height="${CELL_H}" rx="10" />`,
).join(pad(4));

/**
 * The retention band: one rectangle per number of expired events, so the line
 * moves by swapping which one is shown rather than by tweening a width. There is
 * no variant for nothing expired, because a window that has not moved yet is not
 * a band of zero width.
 */
const retentionBand = Array.from({ length: MAX_SEQ }, (_value, index) => index + 1)
  .map(
    (n) =>
      `<rect class="ps-band ps-band--${n}" x="${BAND_X}" y="${BAND_Y}" width="${cellX(n) + CELL_W + 4 - BAND_X}" height="${BAND_H}" rx="12" />`,
  )
  .join(pad(4));

/** One subscription's bookmark: nine positions, one shown, none interpolated. */
const markRow = (sub: Sub, y: number): string =>
  `<g class="ps-mark-row ps-mark-${sub}">
    ${Array.from({ length: MAX_SEQ + 1 }, (_value, n) => n)
      .map(
        (n) =>
          `<rect class="ps-mark ps-mark-${sub}--${n}" x="${markX(n) - MARK_W / 2}" y="${y}" width="${MARK_W}" height="${MARK_H}" rx="4" />`,
      )
      .join(pad(6))}
  </g>`;

/** The letter in the gutter that says whose bookmark the row is. */
const markKey = (sub: Sub, y: number): string =>
  `<text class="ps-key ps-key-${sub}" x="${KEY_X}" y="${y + KEY_DY}">${sub.toUpperCase()}</text>`;

/** How far one subscription has read, which is the number its bookmark stands on. */
const offsetReadout = (sub: Sub, x: number, y: number, indent: number): string =>
  counterVariants({
    x,
    y,
    className: `ps-offset-${sub}`,
    count: MAX_SEQ + 1,
    format: (n) => mono(`offset ${n}`),
    indent,
  });

/** A subscription's badge: three words on one plate, and the state picks one. */
const badgePlate = (sub: Sub, x: number, y: number, textY: number, indent: number): string =>
  chip({
    x,
    y,
    width: BADGE_W,
    height: BADGE_H,
    rx: 18,
    className: `ps-chip-badge-${sub}`,
    bgClass: 'ps-badge-bg',
    variant: 'outline',
    text: BADGES.filter((badge) => badge !== 'off')
      .map(
        (badge) =>
          `<text class="scene-counter ps-badge ps-badge-${sub} ps-badge-${sub}--${badge}" x="${x + BADGE_W / 2}" y="${textY}" text-anchor="middle">${badge}</text>`,
      )
      .join(pad(indent + 2)),
    indent,
  });

/**
 * B's checkpoint card: a plate that is not there at all until a position has
 * been written down, and then names the one it holds.
 */
const checkCard = `<g class="ps-check">
    <rect class="scene-chip-outline ps-check-bg" x="${CHECK_PLATE.x}" y="${CHECK_PLATE.y}" width="${CHECK_PLATE.w}" height="${CHECK_PLATE.h}" rx="18" />
    ${Array.from({ length: MAX_SEQ }, (_value, index) => index + 1)
      .map(
        (n) =>
          `<text class="scene-counter scene-mono ps-check-text ps-check-text--${n}" x="${CHECK_TEXT_X}" y="${CHECK_TEXT_Y}" text-anchor="middle">${mono(`checkpoint ${n}`)}</text>`,
      )
      .join(pad(4))}
  </g>`;

const stageAttrs = Object.entries(STAGE_STATE)
  .map(([name, value]) => `${name}="${value}"`)
  .join(' ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageAttrs} aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_PUBLISH, Y_PUBLISHER_BOTTOM, Y_TOPIC_TOP)}
  ${verticalLink(X_A, Y_TOPIC_BOTTOM, Y_SUB_TOP, 'scene-link ps-lane-a')}
  ${verticalLink(X_B, Y_TOPIC_BOTTOM, Y_SUB_TOP, 'scene-link ps-lane-b')}
  ${verticalLink(X_C, Y_TOPIC_BOTTOM, Y_SUB_C_TOP, 'scene-link ps-lane-c')}

  ${clientBox({
    x: PUBLISHER.x,
    width: PUBLISHER.w,
    y: PUBLISHER.y,
    height: PUBLISHER.h,
    title: 'Publisher',
    titleX: PUBLISHER_TITLE_X,
    titleY: PUBLISHER_TITLE_Y,
    titleAnchor: null,
    children: `
    ${publishedReadout}`,
  })}

  ${serviceBox({
    x: TOPIC.x,
    width: TOPIC.w,
    y: TOPIC.y,
    height: TOPIC.h,
    title: 'Topic',
    titleX: TOPIC_LABEL_X,
    titleY: TOPIC_LABEL_Y,
    titleClass: 'scene-node-label',
    titleAnchor: null,
    className: 'scene-node ps-topic',
    children: `
    ${modePlate}

    <text class="ps-retention" x="${RETENTION_X}" y="${RETENTION_Y}">retention</text>

    ${cells}

    ${retentionBand}

    ${markKey('a', MARK_ROWS[0])}
    ${markRow('a', MARK_ROWS[0])}

    ${markKey('b', MARK_ROWS[1])}
    ${markRow('b', MARK_ROWS[1])}

    <g class="ps-key-c-group">
      ${markKey('c', MARK_ROWS[2])}
    </g>
    <g class="ps-mark-c-group">
      ${markRow('c', MARK_ROWS[2])}
    </g>`,
  })}

  ${serviceBox({
    x: SUB_A.x,
    width: SUB_A.w,
    y: SUB_A.y,
    height: SUB_A.h,
    title: 'A',
    titleX: A_TITLE_X,
    titleY: SUB_TITLE_Y,
    titleAnchor: null,
    className: 'scene-service ps-sub ps-sub-a',
    children: `
    ${offsetReadout('a', A_OFFSET_X, OFFSET_Y, 4)}

    ${badgePlate('a', A_BADGE_X, BADGE_Y, BADGE_TEXT_Y, 4)}`,
  })}

  ${serviceBox({
    x: SUB_B.x,
    width: SUB_B.w,
    y: SUB_B.y,
    height: SUB_B.h,
    title: 'B',
    titleX: B_TITLE_X,
    titleY: SUB_TITLE_Y,
    titleAnchor: null,
    className: 'scene-service ps-sub ps-sub-b',
    children: `
    ${offsetReadout('b', B_OFFSET_X, OFFSET_Y, 4)}

    ${badgePlate('b', B_BADGE_X, BADGE_Y, BADGE_TEXT_Y, 4)}

    ${checkCard}`,
  })}

  <g class="ps-sub-c-group">
    ${serviceBox({
      x: SUB_C.x,
      width: SUB_C.w,
      y: SUB_C.y,
      height: SUB_C.h,
      title: 'C',
      titleX: C_TITLE_X,
      titleY: C_TITLE_Y,
      titleAnchor: null,
      className: 'scene-service ps-sub ps-sub-c',
      children: `
      ${offsetReadout('c', C_OFFSET_X, C_OFFSET_Y, 6)}

      ${badgePlate('c', C_BADGE_X, C_BADGE_Y, C_BADGE_TEXT_Y, 6)}`,
    })}
  </g>

  ${requestsLayer()}
</svg>`;
