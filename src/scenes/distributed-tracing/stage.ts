/**
 * Static stage markup for the Distributed Tracing scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. The bands are the usual ones, with
 * the bottom box given the allowed extension because the Trace panel has to
 * hold a name column, a millisecond axis and ten rows of bars:
 *   - y 0..440       kept empty for the step title card
 *   - y 440..680     the Client, and beside it the broker a message is left in
 *   - y 880..1100    gateway, orders, payments and worker, side by side, each
 *                    with the line it logged
 *   - y 1500..1850   the Trace panel: one row per span, drawn where the span
 *                    started and as long as the span ran
 *
 * One trunk, one rail and four lanes, and nothing travels anywhere else. The
 * trunk leaves the Client at `X_CLIENT` and the broker drops at `X_QUEUE`; both
 * meet the rail at `Y_RAIL`, and the rail runs between the outer service
 * centres so every hop is one horizontal leg plus two vertical ones. Every leg
 * is vertical or horizontal and consecutive legs share their endpoint exactly,
 * so no segment ever ends inside a box.
 *
 * Every box is entered from the top and left from the top, which is what
 * decides where a label may sit. A traveller is a dot with a halo of 26 and a
 * plate 130 wide hanging 14 to 38 below it, so it sweeps 130 x 92 around
 * `Y_ARRIVE`; each service therefore writes its name and its log line *below*
 * that, at y 1032 and y 1070, which leaves 32px between the plate and the name.
 * Nothing travels into the bottom band at all: the Trace panel is a readout of
 * what the spans did, not a place a request goes.
 *
 * Geometry the timeline needs is exported rather than repeated: a millisecond
 * is `MS_PX` pixels wide, and that one number is what turns a simulated span
 * into the bar the reader reads it off.
 */

import {
  VIEWBOX,
  chip,
  clientBox,
  requestsLayer,
  serviceBox,
  slotRow,
  trackAndFill,
  verticalLink,
} from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- geometry --------------------------------------------------------------

/** The lane a request leaves the Client on, and where it waits. */
export const X_CLIENT = 490;
export const Y_CLIENT = 620;

/** The lane the broker drops on, and the edge a message is handed over at. */
export const X_QUEUE = 852;
export const Y_QUEUE_EDGE = 680;

/** The rail every hop turns on, between the outer service centres. */
export const Y_RAIL = 790;

/** The top edge of the service row, and the row a request stands on inside it. */
export const Y_BOX_TOP = 880;
export const Y_ARRIVE = 940;

/** The four boxes, in the order the markup writes them. */
export const SERVICES = ['gateway', 'orders', 'payments', 'worker'] as const;
export type ServiceKey = (typeof SERVICES)[number];

/** The lane centre of each service. */
export const SERVICE_X: Record<ServiceKey, number> = {
  gateway: 228,
  orders: 436,
  payments: 644,
  worker: 852,
};

const TOP_Y = 440;
const TOP_H = 240;
const CLIENT_X = 240;
const CLIENT_W = 500;
const CLIENT_TITLE_Y = 505;

const QUEUE_X = 787;
const QUEUE_W = 130;
const QUEUE_TITLE_Y = 490;
const QUEUE_SLOT_XS = [808, 852, 896];
const QUEUE_SLOT_Y = 560;
const QUEUE_SLOT_SIDE = 36;

const BOX_Y = 880;
const BOX_H = 220;
const BOX_W = 196;
const BOX_X: Record<ServiceKey, number> = {
  gateway: 130,
  orders: 338,
  payments: 546,
  worker: 754,
};
const TITLE_DX = 18;
const TITLE_Y = 1032;
const DOUBT_DX = 18;
const LOG_Y = 1070;

/** The Trace panel, which is a readout rather than a place anything travels. */
const PANEL_X = 130;
const PANEL_W = 820;
const PANEL_Y = 1500;
const PANEL_H = 350;
const PANEL_TITLE_X = 152;
const PANEL_TITLE_Y = 1548;

/** The trace id, written on a plate above the rows it keys. */
const ID_X = 300;
const ID_W = 320;
const ID_Y = 1518;
const ID_H = 44;

/** What keeping every trace costs, drawn as a bar beside the panel title. */
const METER_LABEL_X = 660;
export const METER_X = 770;
const METER_Y = 1534;
export const METER_W = 160;
const METER_H = 20;

/** The name column, and the indent one level of nesting adds to it. */
const NAME_X = 152;
const NAME_INDENT = 22;
const NAME_DY = 14;

/** Left edge of the axis, which is 0 ms, and how wide a millisecond is. */
export const TRACE_X0 = 352;
export const MS_PX = 0.48;
export const AXIS_MAX_MS = 1200;
const GRID_TOP = 1580;
const GRID_BOTTOM = 1770;
const AXIS_LABEL_Y = 1794;
const MODE_Y = 1794;

/** x of a millisecond on the axis. */
export const msToX = (ms: number): number => TRACE_X0 + ms * MS_PX;

/** The four named rows, which is the deepest a trace in this scene gets. */
export const ROW_COUNT = 4;
export const ROW_TOP = 1592;
export const ROW_PITCH = 42;
export const ROW_H = 18;
export const rowY = (row: number): number => ROW_TOP + row * ROW_PITCH;

/**
 * The ten unnamed rows step 4 stacks, one per trace in a burst. They are row
 * texture rather than a table: no row carries a name, and the pitch is set by
 * how many traces have to be seen at once rather than by what a label needs.
 */
export const MINI_COUNT = 10;
const MINI_TOP = 1592;
const MINI_PITCH = 17;
export const MINI_H = 8;
export const miniY = (row: number): number => MINI_TOP + row * MINI_PITCH;

// --- what the stage starts in ---------------------------------------------

/**
 * What every `data-*` on the stage starts at, keyed by the target the timeline
 * addresses it through. The markup below is written from this, so a change that
 * writes a value something already holds can be dropped rather than tweened.
 */
export const STAGE_STATE: Record<string, string> = {
  'stage@data-traceid': 'none',
  'stage@data-doubt': 'off',
  'stage@data-mode': 'off',
  'stage@data-link': 'off',
  'stage@data-panel': 'named',
  'stage@data-log-gateway': 'none',
  'stage@data-log-orders': 'none',
  'stage@data-log-payments': 'none',
  'stage@data-log-worker': 'none',
  'svc-gateway@data-svc': 'idle',
  'svc-orders@data-svc': 'idle',
  'svc-payments@data-svc': 'idle',
  'svc-worker@data-svc': 'idle',
  'slot-0@data-slot-state': 'free',
  'slot-1@data-slot-state': 'free',
  'slot-2@data-slot-state': 'free',
  'row-0@data-row': 'none',
  'row-1@data-row': 'none',
  'row-2@data-row': 'none',
  'row-3@data-row': 'none',
  'row-0@data-bar': 'hidden',
  'row-1@data-bar': 'hidden',
  'row-2@data-bar': 'hidden',
  'row-3@data-bar': 'hidden',
};

for (let i = 0; i < MINI_COUNT; i += 1) STAGE_STATE[`mini-${i}@data-mini`] = 'hidden';

// --- markup ----------------------------------------------------------------

/** A stack of text variants on one spot, of which CSS shows at most one. */
const variants = (
  className: string,
  x: number,
  y: number,
  anchor: string | null,
  entries: [string, string][],
  indent = 4,
): string =>
  entries
    .map(
      ([value, label]) =>
        `<text class="${className} ${className}--${value}" x="${x}" y="${y}"${anchor ? ` text-anchor="${anchor}"` : ''}>${label}</text>`,
    )
    .join(`\n${' '.repeat(indent)}`);

/** One service: what it is called, the doubt it is in, and the line it logged. */
const service = (key: ServiceKey, logs: [string, string][]): string => {
  const x = BOX_X[key];
  return serviceBox({
    x,
    width: BOX_W,
    y: BOX_Y,
    height: BOX_H,
    title: key,
    titleX: x + TITLE_DX,
    titleY: TITLE_Y,
    titleClass: 'scene-node-label dt-title',
    titleAnchor: null,
    className: `dt-svc dt-svc--${key}`,
    attrs: ' data-svc="idle"',
    boxClass: 'scene-box dt-svc-box',
    children: `
    <text class="scene-flash dt-doubt" x="${x + BOX_W - DOUBT_DX}" y="${TITLE_Y}" text-anchor="end">?</text>
    ${variants(`scene-mono dt-log dt-log--${key}`, x + TITLE_DX, LOG_Y, null, logs)}`,
  });
};

/** One row of the waterfall: the span's name, and the bar it is drawn as. */
const row = (index: number, names: [string, string, number][]): string => {
  const top = rowY(index);
  const labels = names
    .map(
      ([value, label, indent]) =>
        `<text class="scene-mono dt-name dt-name--${value}" x="${NAME_X + indent * NAME_INDENT}" y="${top + NAME_DY}">${label}</text>`,
    )
    .join('\n      ');
  return `<g class="dt-row dt-row--${index}" data-row="none" data-bar="hidden">
      ${labels}
      <rect class="scene-fill dt-bar" x="${TRACE_X0}" y="${top}" width="0" height="${ROW_H}" rx="4" />
    </g>`;
};

const GRID_MS = [0, 400, 800, 1200];

const gridlines = GRID_MS.map(
  (ms) =>
    `<line class="dt-grid" x1="${msToX(ms)}" y1="${GRID_TOP}" x2="${msToX(ms)}" y2="${GRID_BOTTOM}" />`,
).join('\n    ');

const axisLabels = [
  `<text class="scene-caption-label dt-axis" x="${msToX(0)}" y="${AXIS_LABEL_Y}" text-anchor="middle">0</text>`,
  `<text class="scene-caption-label dt-axis" x="${msToX(400)}" y="${AXIS_LABEL_Y}" text-anchor="middle">400</text>`,
  `<text class="scene-caption-label dt-axis" x="${msToX(800)}" y="${AXIS_LABEL_Y}" text-anchor="middle">800</text>`,
  `<text class="scene-caption-label dt-axis" x="${msToX(AXIS_MAX_MS)}" y="${AXIS_LABEL_Y}" text-anchor="end">1,200 ms</text>`,
].join('\n    ');

const miniRows = Array.from({ length: MINI_COUNT }, (_value, index) => index)
  .map(
    (index) =>
      `<rect class="scene-fill dt-mini dt-mini--${index}" data-mini="hidden" x="${TRACE_X0}" y="${miniY(index)}" width="0" height="${MINI_H}" rx="4" />`,
  )
  .join('\n    ');

const traceId = chip({
  x: ID_X,
  y: ID_Y,
  width: ID_W,
  height: ID_H,
  rx: 14,
  className: 'dt-id',
  variant: 'outline',
  text: variants(
    'scene-mono dt-id-text',
    ID_X + ID_W / 2,
    ID_Y + 30,
    'middle',
    [
      ['none', 'no trace id'],
      ['minted', 'trace id 4bf9&#8230;'],
    ],
    6,
  ),
});

const stageAttributes = Object.entries(STAGE_STATE)
  .filter(([key]) => key.startsWith('stage@'))
  .map(([key, value]) => `${key.slice('stage@'.length)}="${value}"`)
  .join(' ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageAttributes} aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_CLIENT, TOP_Y + TOP_H, Y_RAIL)}
  ${verticalLink(X_QUEUE, TOP_Y + TOP_H, Y_RAIL)}
  <line class="scene-link" x1="${SERVICE_X.gateway}" y1="${Y_RAIL}" x2="${SERVICE_X.worker}" y2="${Y_RAIL}" />
  ${verticalLink(SERVICE_X.gateway, Y_RAIL, Y_BOX_TOP)}
  ${verticalLink(SERVICE_X.orders, Y_RAIL, Y_BOX_TOP)}
  ${verticalLink(SERVICE_X.payments, Y_RAIL, Y_BOX_TOP)}
  ${verticalLink(SERVICE_X.worker, Y_RAIL, Y_BOX_TOP)}

  ${clientBox({
    x: CLIENT_X,
    width: CLIENT_W,
    y: TOP_Y,
    height: TOP_H,
    title: 'Client',
    titleX: CLIENT_X + CLIENT_W / 2,
    titleY: CLIENT_TITLE_Y,
    extraClass: 'dt-client',
  })}

  ${clientBox({
    x: QUEUE_X,
    width: QUEUE_W,
    y: TOP_Y,
    height: TOP_H,
    title: 'queue',
    titleX: QUEUE_X + QUEUE_W / 2,
    titleY: QUEUE_TITLE_Y,
    titleClass: 'scene-node-label dt-title',
    extraClass: 'dt-queue',
    children: `
    ${slotRow({
      xs: QUEUE_SLOT_XS,
      y: QUEUE_SLOT_Y,
      side: QUEUE_SLOT_SIDE,
      rx: 10,
      className: 'dt-slot',
      initialState: 'free',
      attrName: 'data-slot-state',
    })}`,
  })}

  ${service('gateway', [['get', 'GET /checkout']])}

  ${service('orders', [
    ['load', 'load order'],
    ['publish', 'publish'],
  ])}

  ${service('payments', [
    ['charge', 'charge'],
    ['tenant', 'tenant=acme'],
  ])}

  ${service('worker', [['consume', 'consume']])}

  ${serviceBox({
    x: PANEL_X,
    width: PANEL_W,
    y: PANEL_Y,
    height: PANEL_H,
    title: 'Trace',
    titleX: PANEL_TITLE_X,
    titleY: PANEL_TITLE_Y,
    titleClass: 'scene-node-label dt-title',
    titleAnchor: null,
    className: 'dt-panel',
    children: `
    ${traceId}
    <text class="scene-caption-label dt-meter-label" x="${METER_LABEL_X}" y="${PANEL_TITLE_Y}">storage</text>
    ${trackAndFill({
      x: METER_X,
      y: METER_Y,
      width: METER_W,
      height: METER_H,
      rx: METER_H / 2,
      className: 'dt-meter',
    })}

    ${gridlines}

    <g class="dt-links"></g>

    ${row(0, [['root', 'GET /checkout', 0]])}
    ${row(1, [['load', 'load order', 1]])}
    ${row(2, [
      ['charge', 'charge', 2],
      ['consume', 'worker consume', 1],
    ])}
    ${row(3, [['charge', 'charge', 2]])}

    ${miniRows}

    ${variants(
      'scene-flash dt-mode',
      NAME_X,
      MODE_Y,
      null,
      [
        ['all', 'keep every trace'],
        ['head', 'head 10%'],
        ['tail', 'tail'],
      ],
    )}

    ${axisLabels}`,
  })}

  ${requestsLayer()}
</svg>`;
