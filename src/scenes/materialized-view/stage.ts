/**
 * Static stage markup for the Materialized View scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. The bands are the usual ones:
 *   - y 0..400       above the cropped viewBox (see shared VIEWBOX)
 *   - y 400..440     the frame's top padding; nothing is drawn here
 *   - y 440..680     Dashboard, the one lane every request leaves on
 *   - y 880..1270    Query: the plan it chose, how long that plan took, and
 *                    the three costs the last step compares
 *   - y 1400         the fan rail, the only row a request changes column on
 *   - y 1500..1850   Database: the base tables on the left, the view on the
 *                    right, and the refresh route between them
 *   - y 1878..1892   the readouts the whole scene is counted on
 *
 * A request travels on three kinds of line and no others: down the trunk at
 * `X_TRUNK`, along the fan rail at `Y_RAIL`, and down one of the two store
 * columns at `X_BASE` and `X_VIEW`. Every leg is vertical or horizontal, and
 * the trunk, the rail and both columns meet at `Y_RAIL`, so no leg cuts a
 * corner. A refresh travels the fourth line, the route at `Y_ROUTE`, which runs
 * between the two stores at the height of nothing else.
 *
 * That is what decides where a label may sit. Both columns sweep from the rail
 * down to `Y_ARRIVE`, so the base tables are listed below y 1690 and the view
 * names itself below the row a reader stands on; `Database` is centred between
 * the two columns rather than written from the left margin, because the base
 * column comes down where a left aligned title would end; and the refresh
 * route's own labels sit under it in the strip between the stores, clear of the
 * `Database` title above and of the route itself. Nothing is drawn below y 1850,
 * which is what leaves the readout row clear of every sweep.
 */

import {
  VIEWBOX,
  clientBox,
  counterVariants,
  nodeFrame,
  requestsLayer,
  serviceBox,
  timerRing,
  trackAndFill,
  verticalLink,
} from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- geometry --------------------------------------------------------------

/** The trunk every request leaves on, and where it starts. */
export const X_TRUNK = 540;
export const Y_CLIENT = 620;

/** Top and bottom of the Query node. */
const NODE_Y = 880;
const NODE_H = 390;
const NODE_BOTTOM = NODE_Y + NODE_H;

/** The rail the trunk fans out on, below the node so no node row is ever shared. */
export const Y_RAIL = 1400;

/** The two store columns, and the row a request stands on inside a store. */
export const X_BASE = 345;
export const X_VIEW = 775;
export const Y_ARRIVE = 1630;

/** The Database box, and the two stores inside it. */
const DB_Y = 1500;
const DB_H = 350;
const STORE_TOP = 1580;
const STORE_BOTTOM = 1830;
const BASE_X = 190;
const BASE_W = 310;
const VIEW_X = 630;
const VIEW_W = 290;

/** The refresh route: the only horizontal line below the rail. */
export const X_ROUTE_FROM = BASE_X + BASE_W;
export const X_ROUTE_TO = VIEW_X;
export const ROUTE_W = X_ROUTE_TO - X_ROUTE_FROM;
export const Y_ROUTE = 1620;
const ROUTE_H = 14;

/** Rows of the base table list, all of them below every column sweep. */
const TABLE_Y = [1706, 1756, 1806];
const GLYPH_X = 204;
const GLYPH_W = 36;
const NAME_X = 250;
const COUNT_X = 488;

/** The strip between the two stores, which the route's own labels share. */
const STRIP_X = (X_ROUTE_FROM + X_ROUTE_TO) / 2;

/** The view's own rows: thirty of them, three columns of ten. */
const VIEW_ROWS = 30;
const VIEW_ROW_COLUMNS = 3;
const VIEW_ROW_X = [642, 737, 832];
const VIEW_ROW_W = 86;
const VIEW_ROW_TOP = 1730;
const VIEW_ROW_PITCH = 8.5;

/** The query plan readout and the bar that says how long that plan took. */
export const TIME_X = 638;
export const TIME_W = 272;
const TIME_Y = 1030;

/** The three costs step 4 compares, and the bar each of them carries. */
export const PANEL_X = 170;
export const PANEL_W = 182;
const PANEL_ROWS = ['storage', 'refresh cost', 'query cost'];
const PANEL_LABEL_Y = [1100, 1160, 1220];
const PANEL_BAR_Y = [1118, 1178, 1238];

/** The load meter, under the box because a meter is a readout, not a store. */
export const LOAD_X = 240;
export const LOAD_W = 200;
const LOAD_Y = 1878;
const READOUT_Y = 1892;

// --- what the tables hold --------------------------------------------------

/**
 * Rows in each base table. They are an input, and they add up to the million
 * the plan quotes: every other cost in the scene is worked out from them.
 */
export const TABLE_ROWS = [620000, 40000, 340000];
export const TABLE_NAMES = ['orders', 'customers', 'items'];
/** Rows the view holds, which is all the dashboard actually needs. */
export const VIEW_ROW_COUNT = VIEW_ROWS;

/** Writes the scene sends, which is how far the `orders` counter can run. */
export const WRITE_COUNT = 7;
/** Dashboard reads the view ever answers, which is how far `saved scans` runs. */
export const SAVED_MAX = 13;
/** Writes the view can fall behind by before a refresh catches it up. */
export const BEHIND_MAX = 3;

/**
 * What every `data-*` on the stage starts at, keyed by the target the timeline
 * addresses it through. The markup below is written from this, so a change that
 * writes a value something already holds can be dropped rather than tweened.
 */
export const STAGE_STATE: Record<string, string> = {
  'stage@data-view': 'absent',
  'stage@data-plan': 'scan',
  'stage@data-panel': 'off',
  'stage@data-refresh': 'off',
  'stage@data-timer': 'off',
  'stage@data-read': 'off',
  'stage@data-behind': '0',
  'stage@data-saved': '0',
  'stage@data-orders': '0',
};
for (let index = 1; index <= TABLE_NAMES.length; index += 1) {
  STAGE_STATE[`table-${index}@data-table`] = 'idle';
}

// --- markup ----------------------------------------------------------------

const groupDigits = (value: number): string =>
  String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** One base table: a glyph that lights while it is read, its name, its rows. */
const baseTable = (index: number): string => {
  const y = TABLE_Y[index] ?? 0;
  const rows = TABLE_ROWS[index] ?? 0;
  const count =
    index === 0
      ? counterVariants({
          x: COUNT_X,
          y,
          className: 'mv-orders',
          count: WRITE_COUNT + 1,
          anchor: 'end',
          format: (n) => groupDigits(rows + n),
          indent: 8,
        })
      : `<text class="mv-table-count" x="${COUNT_X}" y="${y}" text-anchor="end">${groupDigits(rows)}</text>`;
  const lines = [0, 1, 2]
    .map(
      (line) =>
        `<line class="mv-glyph-line" x1="${GLYPH_X + 7}" y1="${y - 16 + line * 8}" x2="${GLYPH_X + GLYPH_W - 7}" y2="${y - 16 + line * 8}" />`,
    )
    .join('\n        ');
  return `<g class="mv-table mv-table--${index + 1}" data-table="idle">
        <rect class="mv-glyph" x="${GLYPH_X}" y="${y - 24}" width="${GLYPH_W}" height="30" rx="6" />
        ${lines}
        <text class="mv-table-name" x="${NAME_X}" y="${y}">${TABLE_NAMES[index]}</text>
        ${count}
      </g>`;
};

/** The plan the node chose, one variant per plan it can choose. */
const planText = [
  ['scan', `scan ${groupDigits((TABLE_ROWS[0] ?? 0) + (TABLE_ROWS[1] ?? 0) + (TABLE_ROWS[2] ?? 0))} rows`],
  ['read', `read ${VIEW_ROWS} rows`],
  ['adhoc', `scan ${groupDigits((TABLE_ROWS[1] ?? 0) + (TABLE_ROWS[2] ?? 0))} rows`],
]
  .map(
    ([value, label]) =>
      `<text class="scene-mono mv-plan mv-plan--${value}" x="${TIME_X + TIME_W}" y="1000" text-anchor="end">${label}</text>`,
  )
  .join('\n    ');

/** One row of the cost panel: what it measures, and how much of it there is. */
const panelRow = (index: number): string => {
  const name = PANEL_ROWS[index] ?? '';
  const arrow = index === 2 ? '&#9660;' : '&#9650;';
  return `<g class="mv-cost mv-cost--${index + 1}">
        <text class="mv-cost-label" x="${PANEL_X}" y="${PANEL_LABEL_Y[index]}">${name} ${arrow}</text>
        ${trackAndFill({
          x: PANEL_X,
          y: PANEL_BAR_Y[index] ?? 0,
          width: PANEL_W,
          height: 14,
          rx: 7,
          className: `mv-cost-${index + 1}`,
          indent: 8,
        })}
      </g>`;
};

/** The view's thirty rows, three columns of ten so they read as a table. */
const viewRows = Array.from({ length: VIEW_ROWS }, (_value, n) => n)
  .map((n) => {
    const column = n % VIEW_ROW_COLUMNS;
    const row = Math.floor(n / VIEW_ROW_COLUMNS);
    return `<rect class="mv-view-row" x="${VIEW_ROW_X[column]}" y="${VIEW_ROW_TOP + row * VIEW_ROW_PITCH}" width="${VIEW_ROW_W}" height="5" rx="2.5" />`;
  })
  .join('\n        ');

const freshness = ['stale', 'fresh']
  .map(
    (name) =>
      `<text class="scene-flash mv-fresh mv-fresh--${name}" x="${VIEW_X + VIEW_W - 12}" y="1554" text-anchor="end">${name}</text>`,
  )
  .join('\n      ');

const routeLabels = ['refresh', 'incremental']
  .map(
    (name) =>
      `<text class="scene-flash mv-route-label mv-route-label--${name}" x="${STRIP_X}" y="1690" text-anchor="middle">${name}</text>`,
  )
  .join('\n    ');

const behind = counterVariants({
  x: 700,
  y: READOUT_Y,
  className: 'mv-behind',
  count: BEHIND_MAX + 1,
  anchor: 'end',
  format: (n) => `behind ${n} rows`,
  indent: 2,
});

const saved = counterVariants({
  x: 924,
  y: READOUT_Y,
  className: 'mv-saved',
  count: SAVED_MAX + 1,
  anchor: 'end',
  format: (n) => `saved scans ${n}`,
  indent: 2,
});

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" data-view="absent" data-plan="scan" data-panel="off" data-refresh="off" data-timer="off" data-read="off" data-behind="0" data-saved="0" data-orders="0" aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_TRUNK, 680, NODE_Y)}
  ${verticalLink(X_TRUNK, NODE_BOTTOM, Y_RAIL)}
  <line class="scene-link" x1="${X_BASE}" y1="${Y_RAIL}" x2="${X_VIEW}" y2="${Y_RAIL}" />
  ${verticalLink(X_BASE, Y_RAIL, STORE_TOP)}
  ${verticalLink(X_VIEW, Y_RAIL, STORE_TOP)}

  ${clientBox({ title: 'Dashboard', titleY: 512 })}

  ${nodeFrame({
    y: NODE_Y,
    height: NODE_H,
    label: 'Query',
    labelY: 938,
    children: `    ${planText}
    ${trackAndFill({
      x: TIME_X,
      y: TIME_Y,
      width: TIME_W,
      height: 16,
      rx: 8,
      className: 'mv-time',
    })}

    <g class="mv-panel">
      ${panelRow(0)}
      ${panelRow(1)}
      ${panelRow(2)}
    </g>`,
  })}

  ${serviceBox({
    x: 130,
    width: 820,
    y: DB_Y,
    height: DB_H,
    title: 'Database',
    titleY: 1554,
    titleClass: 'scene-node-label',
    className: 'mv-db',
    children: `
    <g class="mv-base">
      <rect class="scene-box mv-store-box" x="${BASE_X}" y="${STORE_TOP}" width="${BASE_W}" height="${STORE_BOTTOM - STORE_TOP}" rx="20" />
      ${baseTable(0)}
      ${baseTable(1)}
      ${baseTable(2)}
    </g>

    <g class="mv-view">
      <rect class="scene-box mv-store-box mv-view-box" x="${VIEW_X}" y="${STORE_TOP}" width="${VIEW_W}" height="${STORE_BOTTOM - STORE_TOP}" rx="20" />
      <g class="mv-view-body">
        <text class="scene-mono mv-view-name" x="${VIEW_X + 64}" y="1706">sales_by_day</text>
        ${viewRows}
      </g>
      ${freshness}
    </g>

    <g class="mv-route">
      ${trackAndFill({
        x: X_ROUTE_FROM,
        y: Y_ROUTE - ROUTE_H / 2,
        width: ROUTE_W,
        height: ROUTE_H,
        rx: ROUTE_H / 2,
        className: 'mv-refresh',
        indent: 6,
      })}
      <path class="mv-route-head" d="M ${X_ROUTE_TO - 16} ${Y_ROUTE - 13} L ${X_ROUTE_TO - 2} ${Y_ROUTE} L ${X_ROUTE_TO - 16} ${Y_ROUTE + 13}" />
    </g>
    ${routeLabels}
    ${timerRing({
      cx: STRIP_X,
      cy: 1740,
      r: 26,
      className: 'mv-timer',
      groupClass: 'mv-timer',
      labelText: 'every 5 min',
      labelY: 1804,
      labelClass: 'mv-timer-label',
    })}`,
  })}

  <text class="mv-readout-label" x="${PANEL_X}" y="${READOUT_Y}">load</text>
  ${trackAndFill({
    x: LOAD_X,
    y: LOAD_Y,
    width: LOAD_W,
    height: 16,
    rx: 8,
    className: 'mv-load',
    indent: 2,
  })}
  ${behind}
  ${saved}

  ${requestsLayer()}
</svg>`;
