/**
 * Static stage markup for the CQRS scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. The bands are the usual ones:
 *   - y 0..440       kept empty for the step title card
 *   - y 440..680     Client box, one lane per request kind
 *   - y 880..1270    the application band, which starts as one box and becomes
 *                    Commands and Queries side by side
 *   - y 1500..1740   the storage band, which starts as one Database and becomes
 *                    a write store and a read store
 *   - y 1740..1860   the projection route, which only matters once the stores
 *                    are two things
 *
 * Both split bands are drawn as two boxes that start out congruent: each band
 * has a write box and a read box, both filling the whole band, so the first
 * frame reads as one box and the split is the read box sliding out from under
 * the write box rather than two shapes appearing from nowhere. That is why
 * neither band is built from `nodeFrame` or `serviceBox`, which own their
 * footprint and their stacking order: here the footprint is what moves, and
 * every box has to be painted before any label so a box that slides over its
 * neighbour cannot cover its neighbour's text.
 *
 * Two lanes decide where every label may sit. A command travels x 440 from the
 * client box down to the write side; a query travels x 640 down to the read
 * side. Both sweep the full height of their band, so the two columns are
 * written outwards from those lanes: the write column keeps x 156..380 and the
 * read column keeps x 700..924, which leaves 34px either side of a request's
 * 26px halo. The read column is therefore labelled from its right edge and the
 * write column from its left, which also makes the two halves read as mirrors.
 * The projection route is slung under both stores rather than between them,
 * because the gap between the columns is narrower than an event.
 */

import {
  VIEWBOX,
  clientBox,
  counterVariants,
  requestsLayer,
  trackAndFill,
  verticalLink,
} from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

/** The lane a command travels on, and the lane a query travels on. */
export const X_COMMAND = 440;
export const X_QUERY = 640;

/** Resting y in the client box, in the application band, and in a store. */
export const Y_CLIENT = 620;
export const Y_APP = 1080;
export const Y_STORE = 1630;

/** Where a request stands when the tier it wants has no room for it. */
export const WAIT_SPOTS = [
  { x: 350, y: 800 },
  { x: 530, y: 800 },
] as const;

/** The row a query crosses on when the rebuild sends it to the write side. */
export const Y_DETOUR = 1450;

/** Both bands: the whole width first, then a column on each side. */
const BAND_X = 130;
const BAND_W = 820;
const COL_W = 390;
export const WRITE_COL = { x: BAND_X, width: COL_W };
export const READ_COL = { x: 560, width: COL_W };
export const WHOLE_BAND = { x: BAND_X, width: BAND_W };

/** The application band, and the storage band. */
const APP_Y = 880;
const APP_H = 390;
const STORE_Y = 1500;
const STORE_H = 240;

/** Content stays outside the lanes: the write column left, the read column right. */
const WRITE_LEFT = 156;
const WRITE_RIGHT = 380;
const READ_LEFT = 700;
const READ_RIGHT = 924;

/** Full width of an occupancy meter, which is a column's whole content width. */
export const BUSY_W = WRITE_RIGHT - WRITE_LEFT;
/** Full width of the rebuild bar. */
export const REBUILD_W = READ_RIGHT - READ_LEFT;

/** The three rules a command runs, and the rows the read model holds. */
export const RULE_COUNT = 3;
export const ROW_COUNT = 3;
/** Fields in a read model row, before and after the rebuild changes its shape. */
export const COLS_BEFORE = 3;
export const COLS_AFTER = 4;

/**
 * Centre y of rule row `index`, and of read model row `index`.
 *
 * The read model's pitch is tighter than the rules' because it has one more
 * thing to clear: the three rows have to finish above the column's `busy` row,
 * which both columns share a baseline on. Rows are 44 tall on a 52 pitch, so
 * two stale rows still have a gutter between their 4px outlines, and the last
 * row ends at 1186 with 21px under it.
 */
const ruleY = (index: number): number => 1068 + index * 48;
const rowY = (index: number): number => 1058 + index * 52;

/** The route a projection event takes from the write store to the read store. */
export const PROJECTION = {
  x1: WRITE_COL.x + COL_W / 2,
  x2: READ_COL.x + COL_W / 2,
  yTop: STORE_Y + STORE_H,
  yRun: 1830,
} as const;

/** Half-size of a projection event, which every clearance is measured against. */
export const EVENT_R = 20;

/** Projection events the scene ever sends: three in step 3, eight in step 4. */
export const EVENT_COUNT = 11;

/**
 * What every `data-*` on the stage starts at, keyed by the target the timeline
 * addresses it through. The markup below is written from this, so a change that
 * writes a value something already holds can be dropped rather than tweened.
 */
export const STAGE_STATE: Record<string, string> = {
  'stage@data-split': 'off',
  'stage@data-stores': 'one',
  'stage@data-cols': String(COLS_BEFORE),
  'stage@data-read': 'none',
  'stage@data-stale': 'off',
  'stage@data-rebuild': 'off',
  'stage@data-lag': '0',
  'stage@data-events': '0',
  'stage@data-write-busy': 'ok',
  'stage@data-read-busy': 'ok',
  'rule-1@data-rule': 'off',
  'rule-2@data-rule': 'off',
  'rule-3@data-rule': 'off',
  'row-1@data-row': 'fresh',
  'row-1@data-hit': 'off',
  'row-2@data-row': 'fresh',
  'row-2@data-hit': 'off',
  'row-3@data-row': 'fresh',
  'row-3@data-hit': 'off',
};

// --- the write column -----------------------------------------------------

/** One rule of the write model: a box that ticks, and the rule beside it. */
const rule = (index: number): string => {
  const centre = ruleY(index);
  return `<g class="cq-rule cq-rule--${index + 1}" data-rule="off">
      <rect class="scene-slot cq-rule-box" x="${WRITE_LEFT}" y="${centre - 16}" width="32" height="32" rx="8" />
      <path class="cq-rule-tick" d="M ${WRITE_LEFT + 8} ${centre} L ${WRITE_LEFT + 14} ${centre + 7} L ${WRITE_LEFT + 25} ${centre - 8}" />
      <rect class="cq-rule-bar" x="${WRITE_LEFT + 44}" y="${centre - 7}" width="${WRITE_RIGHT - WRITE_LEFT - 44}" height="14" rx="7" />
    </g>`;
};

// --- the read column ------------------------------------------------------

/** One row of the read model. The fourth field is what the rebuild adds. */
const row = (index: number): string => {
  const centre = rowY(index);
  const cells = Array.from({ length: COLS_AFTER }, (_value, n) => n)
    .map(
      (n) =>
        `<rect class="cq-cell cq-cell--${n + 1}" x="${READ_LEFT + 10 + n * 54}" y="${centre - 12}" width="46" height="24" rx="6" />`,
    )
    .join('\n        ');
  return `<g class="cq-row cq-row--${index + 1}" data-row="fresh" data-hit="off">
        <rect class="cq-row-bg" x="${READ_LEFT}" y="${centre - 22}" width="${READ_RIGHT - READ_LEFT}" height="44" rx="12" />
        ${cells}
      </g>`;
};

// --- counters and meters --------------------------------------------------

const events = counterVariants({
  x: WRITE_RIGHT,
  y: 1660,
  className: 'cq-events',
  max: EVENT_COUNT,
  anchor: 'end',
  format: (n) => `events ${n}`,
});

const lag = counterVariants({
  x: READ_RIGHT,
  y: 1466,
  className: 'cq-lag',
  count: 2,
  anchor: 'end',
  format: (n) => (n === 0 ? 'lag 0 ms' : 'lag 800 ms'),
});

const readFlash = ['join', 'view']
  .map(
    (name) =>
      `<text class="scene-flash cq-read-flash cq-read-flash--${name}" x="${READ_LEFT}" y="1600">${
        name === 'join' ? 'join &#215;3' : 'view'
      }</text>`,
  )
  .join('\n    ');

/** One projection event. It is drawn on the origin and carried by the timeline. */
const projectionEvent = (index: number): string =>
  `<g class="cq-event cq-event--${index + 1}">
      <path class="cq-event-shape" d="M 0 ${-EVENT_R} L ${EVENT_R} 0 L 0 ${EVENT_R} L ${-EVENT_R} 0 Z" />
    </g>`;

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" data-split="off" data-stores="one" data-cols="${COLS_BEFORE}" data-read="none" data-stale="off" data-rebuild="off" data-lag="0" data-events="0" data-write-busy="ok" data-read-busy="ok" aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_COMMAND, 680, APP_Y)}
  ${verticalLink(X_QUERY, 680, APP_Y)}
  ${verticalLink(X_COMMAND, APP_Y + APP_H, STORE_Y)}
  ${verticalLink(X_QUERY, APP_Y + APP_H, STORE_Y)}

  ${clientBox({ title: 'Client', titleY: 512 })}

  <g class="cq-boxes">
    <rect class="scene-box cq-app-box cq-app-box--write" x="${BAND_X}" y="${APP_Y}" width="${BAND_W}" height="${APP_H}" rx="28" />
    <rect class="scene-box cq-app-box cq-app-box--read" x="${BAND_X}" y="${APP_Y}" width="${BAND_W}" height="${APP_H}" rx="28" />
    <rect class="scene-box cq-store-box cq-store-box--write" x="${BAND_X}" y="${STORE_Y}" width="${BAND_W}" height="${STORE_H}" rx="28" />
    <rect class="scene-box cq-store-box cq-store-box--read" x="${BAND_X}" y="${STORE_Y}" width="${BAND_W}" height="${STORE_H}" rx="28" />
  </g>

  <g class="cq-write-side">
    <text class="scene-node-label cq-label--one" x="${WRITE_LEFT}" y="938">Application</text>
    <text class="scene-node-label cq-label--split" x="${WRITE_LEFT}" y="938">Commands</text>
    <text class="scene-caption-label cq-side-label" x="${WRITE_LEFT}" y="976">write model</text>
    <text class="scene-caption-label" x="${WRITE_LEFT}" y="1030">rules</text>

    ${rule(0)}
    ${rule(1)}
    ${rule(2)}

    <text class="scene-caption-label" x="${WRITE_LEFT}" y="1224">busy</text>
    ${trackAndFill({
      x: WRITE_LEFT,
      y: 1236,
      width: BUSY_W,
      height: 14,
      rx: 7,
      className: 'cq-write-busy',
    })}

    <text class="scene-node-label cq-store-one" x="${WRITE_LEFT}" y="1554">Database</text>
    <text class="scene-node-label cq-store-two" x="${WRITE_LEFT}" y="1554">write store</text>
    <g class="cq-stores-only">
      ${events}
    </g>
  </g>

  <g class="cq-read-side">
    <text class="scene-node-label cq-label--split" x="${READ_RIGHT}" y="938" text-anchor="end">Queries</text>
    <text class="scene-caption-label cq-side-label" x="${READ_RIGHT}" y="976" text-anchor="end">read model</text>
    <text class="scene-mono cq-table-label" x="${READ_RIGHT}" y="1010" text-anchor="end">OrderSummary</text>

    <g class="cq-table">
      ${row(0)}
      ${row(1)}
      ${row(2)}
    </g>

    <text class="scene-caption-label" x="${READ_RIGHT}" y="1224" text-anchor="end">busy</text>
    ${trackAndFill({
      x: READ_LEFT,
      y: 1236,
      width: BUSY_W,
      height: 14,
      rx: 7,
      className: 'cq-read-busy',
    })}
  </g>

  <text class="scene-flash cq-stale" x="${READ_RIGHT}" y="1420" text-anchor="end">stale</text>
  <g class="cq-stores-only">
    ${lag}
  </g>

  <g class="cq-store-side">
    <text class="scene-node-label cq-store-two" x="${READ_RIGHT}" y="1554" text-anchor="end">read store</text>
    ${readFlash}
    <g class="cq-rebuild-only">
      <text class="scene-flash cq-rebuild-label" x="${READ_LEFT}" y="1660">rebuild</text>
      ${trackAndFill({
        x: READ_LEFT,
        y: 1672,
        width: REBUILD_W,
        height: 14,
        rx: 7,
        className: 'cq-rebuild',
      })}
    </g>
  </g>

  <g class="cq-projection cq-stores-only">
    <path class="cq-projection-path" d="M ${PROJECTION.x1} ${PROJECTION.yTop} L ${PROJECTION.x1} ${PROJECTION.yRun} L ${PROJECTION.x2} ${PROJECTION.yRun} L ${PROJECTION.x2} ${PROJECTION.yTop}" />
    <path class="cq-projection-head" d="M ${PROJECTION.x2 - 14} ${PROJECTION.yTop + 26} L ${PROJECTION.x2} ${PROJECTION.yTop + 4} L ${PROJECTION.x2 + 14} ${PROJECTION.yTop + 26}" />
    <text class="scene-caption-label" x="${WRITE_LEFT}" y="1838">projection</text>
  </g>

  <g class="cq-events-layer">
    ${Array.from({ length: EVENT_COUNT }, (_value, n) => projectionEvent(n)).join('\n    ')}
  </g>

  ${requestsLayer()}
</svg>`;
