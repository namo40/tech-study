/**
 * Static stage markup for the Correlation ID scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. The bands are the usual ones, with
 * the middle panel given the allowed extension because a log pane whose rows
 * are content rather than texture cannot be squeezed:
 *   - y 0..440      kept empty for the step title card
 *   - y 440..680    Web, Orders and Payments side by side, with the queue
 *                   glyph standing in the gap between the last two
 *   - y 756..820    what the id rides on between them: the header chip under
 *                   the first gap, the message-property chip under the second
 *   - y 880..1440   the Logs pane: twelve rows of a log tail, each a service,
 *                   a line, and the space an id chip goes in
 *   - y 1500..1740  the Filter bar: what was searched for, how many lines
 *                   matched, and what sampling did to the trace
 *
 * One lane and nothing travels anywhere else. `LANE_Y` (560) runs through the
 * middle of all three service boxes, and a traveller only ever moves along it
 * between four x values: the right edge of Web, the left edge of Orders, the
 * right edge of Orders, the centre of the queue glyph, and the left edge of
 * Payments. The glyph centre is a shared junction, so the second hop is two
 * legs that meet at one exact point rather than one leg drawn over a picture.
 * Log lines are not travellers: a line appearing in the pane is a state change
 * on a row, which is what makes the pane scrub-safe in both directions.
 *
 * That is what decides where a label may sit. The lane sweeps a band 52 wide
 * with the halo included, so the three service names sit above it at y 486 and
 * the glyph names itself below at y 703, both clear of the swept band by more
 * than the 30px keep-out. The two wire chips hang below the boxes entirely.
 *
 * The pane holds twenty rows and shows twelve of them. `data-cid-scroll` says
 * how far the strip has been pushed up, and CSS translates it, so a row is
 * written once when its line is logged and never rewritten: the log tail
 * scrolls without any row changing what it says.
 */

import { VIEWBOX, chip, counterVariants, requestsLayer, serviceBox } from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- geometry --------------------------------------------------------------

/** The three services: same width, same band, three columns. */
const BOX_Y = 440;
const BOX_H = 240;
const BOX_W = 220;
const X_WEB = 130;
const X_ORDERS = 430;
const X_PAY = 730;
const TITLE_Y = 486;

/** The lane, and the five x values anything on it is ever at. */
export const LANE_Y = 560;
export const X_WEB_EDGE = X_WEB + BOX_W;
export const X_ORDERS_IN = X_ORDERS;
export const X_ORDERS_EDGE = X_ORDERS + BOX_W;
export const X_GLYPH = 690;
export const X_PAY_IN = X_PAY;

/** The queue glyph: the async boundary, drawn as a slotted capsule. */
const GLYPH_W = 56;
const GLYPH_H = 104;
const GLYPH_X = X_GLYPH - GLYPH_W / 2;
const GLYPH_Y = LANE_Y - GLYPH_H / 2;
const QUEUE_LABEL_Y = 703;

/** The two chips the id rides on, hung below the boxes rather than between. */
const WIRE_Y = 756;
const WIRE_H = 64;
const WIRE_TEXT_Y = 796;
const HEADER_X = 150;
const HEADER_W = 380;
const HEADER_TEXT_X = 340;
const PROP_X = 570;
const PROP_W = 380;
const PROP_TEXT_X = 760;

/** The Logs pane. */
const PANE_X = 130;
const PANE_W = 820;
const PANE_Y = 880;
const PANE_H = 560;
const LOGS_TITLE_X = 152;
const LOGS_TITLE_Y = 921;

/** How many rows the strip holds, and how many of them the pane shows. */
export const ROW_COUNT = 20;
export const WINDOW_ROWS = 12;
export const ROW_PITCH = 41;
const ROW_BASE_Y = 964;
const CLIP_Y = 936;
const CLIP_H = 492;
export const rowY = (row: number): number => ROW_BASE_Y + row * ROW_PITCH;

/** The columns inside a row. */
const SVC_X = 162;
const MSG_X = 300;
const ID_X = 720;
const ID_W = 120;
const ID_H = 32;
const ID_TEXT_X = ID_X + ID_W / 2;
const FAIL_X = 910;

/** The Filter bar. */
const BAR_X = 130;
const BAR_W = 820;
const BAR_Y = 1500;
const BAR_H = 240;
const FILTER_X = 160;
const FILTER_W = 440;
const FILTER_Y = 1536;
const FILTER_H = 80;
const FILTER_TEXT_X = 380;
const FILTER_TEXT_Y = 1586;
const MATCHES_X = 640;
const MATCHES_Y = 1586;
const SAMP_X = 160;
const SAMP_W = 310;
const SAMP_Y = 1650;
const SAMP_H = 68;
const SAMP_TEXT_X = SAMP_X + SAMP_W / 2;
const SAMP_TEXT_Y = 1692;
const TRACE_X = 510;
const TRACE_W = 250;
const TRACE_TEXT_X = 545;
const TRACE_CROSS_X = 715;

// --- what a log line can say ----------------------------------------------

/**
 * The whole vocabulary of the log. A row is told one of these and CSS reveals
 * both halves of it, so a row can never show a service that disagrees with the
 * line beside it.
 */
export const LINE_KINDS = [
  ['checkout', 'web', 'GET /checkout'],
  ['create', 'orders', 'create order'],
  ['publish', 'orders', 'publish'],
  ['charge', 'pay', 'charge'],
  ['failed', 'pay', 'charge failed'],
  ['cart', 'web', 'GET /cart'],
  ['reserve', 'orders', 'reserve'],
  ['authorize', 'pay', 'authorize'],
] as const;

export type LineKind = (typeof LINE_KINDS)[number][0];

/** The line the reader is told is the failure, so the scene names it once. */
export const FAIL_KIND: LineKind = 'failed';

/** The two ids, and the flow each one belongs to. */
export const IDS = ['7f3a', '91c2'] as const;
export type IdKey = (typeof IDS)[number];

const SERVICE_NAMES = ['web', 'orders', 'pay'] as const;

/** The highest number the matches readout can reach, which is the window. */
export const MAX_MATCHES = WINDOW_ROWS;

// --- what the stage starts in ---------------------------------------------

/**
 * What every `data-*` on the stage starts at, keyed by the target the timeline
 * addresses it through, so a change that writes a value something already
 * holds can be dropped rather than tweened.
 */
export const STAGE_STATE: Record<string, string> = {
  'stage@data-cid-header': 'plain',
  'stage@data-cid-prop': 'plain',
  'stage@data-cid-filter': 'off',
  'stage@data-cid-matches': '0',
  'stage@data-cid-sampling': 'off',
  'stage@data-cid-trace': 'off',
  'stage@data-cid-scroll': '0',
};

for (let row = 0; row < ROW_COUNT; row += 1) {
  STAGE_STATE[`row-${row}@data-cid-line`] = 'none';
  STAGE_STATE[`row-${row}@data-cid-id`] = 'none';
  STAGE_STATE[`row-${row}@data-cid-dim`] = 'off';
}

// --- markup ----------------------------------------------------------------

/** A stack of text variants on one spot, of which CSS shows at most one. */
const variants = (
  className: string,
  x: number,
  y: number,
  anchor: string | null,
  entries: readonly (readonly [string, string])[],
  indent = 4,
): string =>
  entries
    .map(
      ([value, label]) =>
        `<text class="${className} ${className}--${value}" x="${x}" y="${y}"${anchor ? ` text-anchor="${anchor}"` : ''}>${label}</text>`,
    )
    .join(`\n${' '.repeat(indent)}`);

/** One service box, named above the lane that runs through it. */
const service = (key: string, x: number, title: string): string =>
  serviceBox({
    x,
    width: BOX_W,
    y: BOX_Y,
    height: BOX_H,
    title,
    titleY: TITLE_Y,
    titleClass: 'scene-node-title cid-svc-title',
    className: `cid-svc cid-svc--${key}`,
    boxClass: 'scene-box cid-svc-box',
  });

/**
 * The queue glyph. Two slot lines inside the capsule are what make it read as
 * a queue rather than a bead on the wire, and the lane passes through its
 * centre, which is the junction the second hop is built from.
 */
const glyph = `<g class="cid-glyph">
    <rect class="cid-glyph-box" x="${GLYPH_X}" y="${GLYPH_Y}" width="${GLYPH_W}" height="${GLYPH_H}" rx="16" />
    <line class="cid-glyph-slot" x1="${GLYPH_X + 12}" y1="${GLYPH_Y + GLYPH_H / 3}" x2="${GLYPH_X + GLYPH_W - 12}" y2="${GLYPH_Y + GLYPH_H / 3}" />
    <line class="cid-glyph-slot" x1="${GLYPH_X + 12}" y1="${GLYPH_Y + (2 * GLYPH_H) / 3}" x2="${GLYPH_X + GLYPH_W - 12}" y2="${GLYPH_Y + (2 * GLYPH_H) / 3}" />
    <text class="scene-caption-label cid-glyph-label" x="${X_GLYPH}" y="${QUEUE_LABEL_Y}" text-anchor="middle">queue</text>
  </g>`;

/** One wire chip: what the id is called on that hop, and whether it holds one. */
const wireChip = (
  key: string,
  x: number,
  width: number,
  textX: number,
  plain: string,
): string =>
  chip({
    x,
    y: WIRE_Y,
    width,
    height: WIRE_H,
    rx: 18,
    className: `cid-wire cid-wire--${key}`,
    bgClass: `cid-wire-bg cid-wire-bg--${key}`,
    text: variants(
      `scene-mono cid-wire-text cid-wire-text--${key}`,
      textX,
      WIRE_TEXT_Y,
      'middle',
      [
        ['plain', plain],
        ['carry', `${plain}: ${IDS[0]}`],
      ],
      6,
    ),
  });

/**
 * One row of the log tail: which service wrote it, what it said, the id chip
 * it carries, and the cross a failure line ends on. Every one of those is a
 * stack with a single member revealed, so a row nobody has written to shows
 * nothing at all rather than every line at once.
 */
const logRow = (row: number): string => {
  const baseline = rowY(row);
  const services = SERVICE_NAMES.map(
    (name) =>
      `<text class="scene-mono cid-svc-text cid-svc-text--${name}" x="${SVC_X}" y="${baseline}">${name}</text>`,
  ).join('\n        ');
  const messages = LINE_KINDS.map(
    ([kind, , label]) =>
      `<text class="scene-mono cid-msg cid-msg--${kind}" x="${MSG_X}" y="${baseline}">${label}</text>`,
  ).join('\n        ');
  const ids = IDS.map(
    (id) =>
      `<text class="scene-mono cid-id-text cid-id-text--${id}" x="${ID_TEXT_X}" y="${baseline}" text-anchor="middle">${id}</text>`,
  ).join('\n        ');
  return `<g class="cid-row cid-row--${row}" data-cid-line="none" data-cid-id="none" data-cid-dim="off">
        ${services}
        ${messages}
        <rect class="cid-id-bg" x="${ID_X}" y="${baseline - 24}" width="${ID_W}" height="${ID_H}" rx="12" />
        ${ids}
        <text class="cid-fail" x="${FAIL_X}" y="${baseline}">&#10007;</text>
      </g>`;
};

const logRows = Array.from({ length: ROW_COUNT }, (_value, row) => logRow(row)).join('\n      ');

const matchesReadout = counterVariants({
  x: MATCHES_X,
  y: MATCHES_Y,
  className: 'scene-mono cid-matches',
  max: MAX_MATCHES,
  format: (n) => `matches&#160;${n}`,
});

const filterChip = chip({
  x: FILTER_X,
  y: FILTER_Y,
  width: FILTER_W,
  height: FILTER_H,
  rx: 18,
  className: 'cid-filter',
  text: variants(
    'scene-mono cid-filter-text',
    FILTER_TEXT_X,
    FILTER_TEXT_Y,
    'middle',
    [['on', `filter&#160;id=${IDS[0]}`]],
    6,
  ),
});

const samplingChip = `<g class="cid-sampling">
      <rect class="cid-sampling-bg" x="${SAMP_X}" y="${SAMP_Y}" width="${SAMP_W}" height="${SAMP_H}" rx="16" />
      <text class="scene-mono cid-sampling-text" x="${SAMP_TEXT_X}" y="${SAMP_TEXT_Y}" text-anchor="middle">sampling&#160;10%</text>
    </g>`;

const traceChip = `<g class="cid-trace">
      <rect class="cid-trace-bg" x="${TRACE_X}" y="${SAMP_Y}" width="${TRACE_W}" height="${SAMP_H}" rx="16" />
      <text class="scene-mono cid-trace-text" x="${TRACE_TEXT_X}" y="${SAMP_TEXT_Y}">trace</text>
      <text class="cid-trace-cross" x="${TRACE_CROSS_X}" y="${SAMP_TEXT_Y}">&#10007;</text>
    </g>`;

const stageAttributes = Object.entries(STAGE_STATE)
  .filter(([key]) => key.startsWith('stage@'))
  .map(([key, value]) => `${key.slice('stage@'.length)}="${value}"`)
  .join(' ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageAttributes} aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  <defs>
    <clipPath id="cid-pane-clip">
      <rect x="${PANE_X}" y="${CLIP_Y}" width="${PANE_W}" height="${CLIP_H}" />
    </clipPath>
  </defs>

  <line class="scene-link cid-lane" x1="${X_WEB_EDGE}" y1="${LANE_Y}" x2="${X_ORDERS_IN}" y2="${LANE_Y}" />
  <line class="scene-link cid-lane" x1="${X_ORDERS_EDGE}" y1="${LANE_Y}" x2="${X_PAY_IN}" y2="${LANE_Y}" />

  ${service('web', X_WEB, 'Web')}

  ${service('orders', X_ORDERS, 'Orders')}

  ${service('pay', X_PAY, 'Payments')}

  ${glyph}

  ${wireChip('header', HEADER_X, HEADER_W, HEADER_TEXT_X, 'X-Correlation-ID')}

  ${wireChip('prop', PROP_X, PROP_W, PROP_TEXT_X, 'message property')}

  ${serviceBox({
    x: PANE_X,
    width: PANE_W,
    y: PANE_Y,
    height: PANE_H,
    title: 'Logs',
    titleX: LOGS_TITLE_X,
    titleY: LOGS_TITLE_Y,
    titleClass: 'scene-node-label cid-pane-title',
    titleAnchor: null,
    className: 'cid-pane',
    children: `
    <g class="cid-rows-clip" clip-path="url(#cid-pane-clip)">
      <g class="cid-rows">
        ${logRows}
      </g>
    </g>`,
  })}

  <g class="cid-bar">
    <rect class="scene-box" x="${BAR_X}" y="${BAR_Y}" width="${BAR_W}" height="${BAR_H}" rx="28" />
    ${filterChip}
    ${matchesReadout}
    ${samplingChip}
    ${traceChip}
  </g>

  ${requestsLayer()}
</svg>`;
