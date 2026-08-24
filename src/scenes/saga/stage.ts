/**
 * Static stage markup for the Saga scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. The bands are the usual ones, with
 * three service boxes side by side because a saga is one business transaction
 * split across three owners:
 *   - y 0..440       kept empty for the step title card
 *   - y 440..680     Client, the lane every order leaves on
 *   - y 880..1270    the coordination band, drawn twice over: the Event bus and
 *                    its subscriptions while the services call each other, the
 *                    Saga box with its state row once a coordinator does
 *   - y 1390         the rail, which is the bus in the first half of the scene
 *                    and the command fan in the second
 *   - y 1500..1820   Order, Payment and Inventory, each with the bar its local
 *                    transaction fills, the result it reached, and under it the
 *                    row it wrote
 *
 * Three lanes and one trunk, and nothing travels anywhere else. `X_TRUNK` runs
 * from the Client down through the coordination band to `Y_RAIL`; the rail runs
 * between the outer service centres; and `SERVICE_X` drops from the rail into
 * each box. Every leg is vertical or horizontal, and the trunk, the rail and
 * the three lanes meet at `Y_RAIL`, so no leg cuts a corner.
 *
 * That is what decides where a label may sit. The trunk sweeps x 514..566 from
 * the Client to the rail, so the coordination band writes its subscriptions
 * from x 600 and its own name from x 170, and the one row that has to span the
 * band — the five saga states — is drawn only while a coordinator is there,
 * which is exactly when nothing travels through the band. Below the rail the
 * lanes sweep down to `Y_ARRIVE`, so each service box names itself at y 1712
 * and writes everything else under that, leaving the request waiting inside the
 * box clear above all of it. A message chip stops at the top edge of the box it
 * is delivered to, so a chip as wide as `ReservationFailed` never reaches the
 * rows a box keeps.
 */

import {
  VIEWBOX,
  clientBox,
  counterVariants,
  nodeFrame,
  requestsLayer,
  serviceBox,
  trackAndFill,
  verticalLink,
} from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- geometry --------------------------------------------------------------

/** The lane an order leaves on, and where it starts. */
export const X_TRUNK = 540;
export const Y_CLIENT = 620;

const CLIENT_X = 280;
const CLIENT_W = 520;
const CLIENT_Y = 440;
const CLIENT_H = 240;

/** The coordination band: the Event bus, and later the Saga box. */
const NODE_Y = 880;
const NODE_H = 390;
export const NODE_TOP = NODE_Y;
export const NODE_BOTTOM = NODE_Y + NODE_H;
const NODE_LABEL_Y = 938;

/** Where an order waits while the coordinator works through its steps. */
export const Y_SAGA = 960;

/** The saga id every step is keyed on. */
const ID_X = 660;
const ID_W = 260;
const ID_Y = 906;
const ID_H = 56;

/** The state row: five cells, of which one is lit. */
const CELL_X = 166;
const CELL_W = 140;
const CELL_GAP = 12;
const CELL_Y = 1040;
const CELL_H = 68;
const CELL_TEXT_Y = 1082;
const PIVOT_Y = 1016;
const RETRY_X = 660;
const RETRY_Y = 1180;

/** The subscriptions the bus delivers by, written right of the trunk. */
const RULE_X = 600;
const RULE_Y = [1020, 1090, 1160];

/**
 * The rail. It is the event bus while the services call each other and the
 * command fan once a coordinator does, because both are the same fan-out.
 */
export const Y_RAIL = 1390;

/** The three services, and the lane each of them is reached by. */
const SVC_Y = 1500;
const SVC_H = 320;
const SVC_W = 260;
const TITLE_Y = 1712;
const TX_LABEL_Y = 1766;
const MARK_CY = 1752;
const MARK_R = 18;
const BAR_Y = 1788;
const BAR_H = 16;
export const BAR_W = 200;
const REC_Y = 1834;
const REC_W = 220;
const REC_H = 52;
const REC_TEXT_Y = 1868;

/** Where a request stands while the box it reached is working. */
export const Y_ARRIVE = 1630;
/** Where a message chip is handed over: the top edge of the box it reached. */
export const Y_HANDOFF = SVC_Y;

/** The service keys, in the order the markup writes them. */
export const SERVICES = ['order', 'payment', 'inventory'] as const;
export type ServiceKey = (typeof SERVICES)[number];

/** The lane centre of each service. */
export const SERVICE_X: Record<ServiceKey, number> = {
  order: 260,
  payment: 540,
  inventory: 820,
};

/** How many attempts a coordinator makes before it gives up going forward. */
export const MAX_ATTEMPTS = 3;

/** The rows a service can hold, in the spelling the chip shows. */
const RECORDS: Record<ServiceKey, [string, string][]> = {
  order: [
    ['open', 'order #12'],
    ['confirmed', 'confirmed #12'],
    ['cancelled', 'cancelled #12'],
  ],
  payment: [
    ['charged', 'charged $40'],
    ['refunded', 'refunded $40'],
  ],
  inventory: [
    ['reserved', 'reserved 2'],
    ['released', 'released 2'],
  ],
};

/**
 * What every `data-*` on the stage starts at, keyed by the target the timeline
 * addresses it through. The markup below is written from this, so a change that
 * writes a value something already holds can be dropped rather than tweened.
 */
export const STAGE_STATE: Record<string, string> = {
  'stage@data-mode': 'choreography',
  'stage@data-state': 'none',
  'stage@data-pivot': 'off',
  'stage@data-retry': '0',
  'svc-order@data-tx': 'idle',
  'svc-payment@data-tx': 'idle',
  'svc-inventory@data-tx': 'idle',
  'rec-order@data-rec': 'none',
  'rec-payment@data-rec': 'none',
  'rec-inventory@data-rec': 'none',
};

// --- markup ----------------------------------------------------------------

/** One result marker a local transaction can end on. */
const mark = (cx: number, kind: 'ok' | 'fail' | 'undo'): string => {
  const x = cx + 100;
  const glyph =
    kind === 'ok'
      ? `M ${x - 9} ${MARK_CY} L ${x - 3} ${MARK_CY + 7} L ${x + 9} ${MARK_CY - 8}`
      : kind === 'fail'
        ? `M ${x - 8} ${MARK_CY - 8} L ${x + 8} ${MARK_CY + 8} M ${x + 8} ${MARK_CY - 8} L ${x - 8} ${MARK_CY + 8}`
        : `M ${x + 9} ${MARK_CY} L ${x - 9} ${MARK_CY} M ${x - 2} ${MARK_CY - 7} L ${x - 9} ${MARK_CY} L ${x - 2} ${MARK_CY + 7}`;
  return `<g class="sg-mark sg-mark--${kind}">
      <circle class="sg-mark-bg" cx="${x}" cy="${MARK_CY}" r="${MARK_R}" />
      <path class="sg-mark-glyph" d="${glyph}" />
    </g>`;
};

/** The row a service wrote, one text variant per row it can hold. */
const record = (key: ServiceKey, cx: number): string => {
  const variants = (RECORDS[key] ?? [])
    .map(
      ([name, text]) =>
        `<text class="scene-mono sg-rec-text sg-rec-text--${name}" x="${cx}" y="${REC_TEXT_Y}" text-anchor="middle">${text}</text>`,
    )
    .join('\n      ');
  return `<g class="sg-rec sg-rec--${key}" data-rec="none">
      <rect class="sg-rec-bg" x="${cx - REC_W / 2}" y="${REC_Y}" width="${REC_W}" height="${REC_H}" rx="16" />
      ${variants}
    </g>`;
};

/** One service: what it is called, what it is doing, and what it wrote. */
const service = (key: ServiceKey, title: string): string => {
  const cx = SERVICE_X[key];
  return serviceBox({
    x: cx - SVC_W / 2,
    width: SVC_W,
    y: SVC_Y,
    height: SVC_H,
    title,
    titleX: cx,
    titleY: TITLE_Y,
    titleClass: 'scene-node-label sg-svc-title',
    className: `sg-svc sg-svc--${key}`,
    attrs: ' data-tx="idle"',
    boxClass: 'scene-box sg-svc-box',
    children: `
    <text class="scene-caption-label sg-tx-label" x="${cx - 110}" y="${TX_LABEL_Y}">local tx</text>
    ${mark(cx, 'ok')}
    ${mark(cx, 'fail')}
    ${mark(cx, 'undo')}
    ${trackAndFill({
      x: cx - BAR_W / 2,
      y: BAR_Y,
      width: BAR_W,
      height: BAR_H,
      rx: BAR_H / 2,
      className: 'sg-bar',
    })}
    ${record(key, cx)}`,
  });
};

/** One cell of the state row. */
const cell = (index: number, key: string, label: string): string => {
  const x = CELL_X + index * (CELL_W + CELL_GAP);
  return `<g class="sg-cell sg-cell--${key}">
      <rect class="sg-cell-bg" x="${x}" y="${CELL_Y}" width="${CELL_W}" height="${CELL_H}" rx="18" />
      <text class="sg-cell-text" x="${x + CELL_W / 2}" y="${CELL_TEXT_Y}" text-anchor="middle">${label}</text>
    </g>`;
};

const STATES: [string, string][] = [
  ['submitted', 'Submitted'],
  ['paid', 'Paid'],
  ['reserved', 'Reserved'],
  ['confirmed', 'Confirmed'],
  ['cancelled', 'Cancelled'],
];

/** The centre of the `Paid` cell, which is the one the pivot sits over. */
const PIVOT_X = CELL_X + (CELL_W + CELL_GAP) + CELL_W / 2;

const rule = (index: number, text: string): string =>
  `<text class="sg-rule" x="${RULE_X}" y="${RULE_Y[index]}">${text}</text>`;

const retryCounter = counterVariants({
  x: RETRY_X,
  y: RETRY_Y,
  className: 'sg-retry',
  count: MAX_ATTEMPTS,
  format: (n) => (n === 0 ? '' : `retry ${n}`),
  indent: 4,
});

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" data-mode="choreography" data-state="none" data-pivot="off" data-retry="0" aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_TRUNK, CLIENT_Y + CLIENT_H, NODE_TOP)}
  ${verticalLink(X_TRUNK, NODE_BOTTOM, Y_RAIL)}
  <line class="scene-link" x1="${SERVICE_X.order}" y1="${Y_RAIL}" x2="${SERVICE_X.inventory}" y2="${Y_RAIL}" />
  ${verticalLink(SERVICE_X.order, Y_RAIL, SVC_Y)}
  ${verticalLink(SERVICE_X.payment, Y_RAIL, SVC_Y)}
  ${verticalLink(SERVICE_X.inventory, Y_RAIL, SVC_Y)}

  ${clientBox({
    x: CLIENT_X,
    width: CLIENT_W,
    y: CLIENT_Y,
    height: CLIENT_H,
    title: 'Client',
    titleY: 512,
  })}

  ${nodeFrame({
    y: NODE_Y,
    height: NODE_H,
    label: 'Event bus',
    labelY: NODE_LABEL_Y,
    children: `    <text class="scene-node-label sg-node-label--saga" x="170" y="${NODE_LABEL_Y}">Saga</text>

    ${rule(0, 'OrderPlaced &#8594; Payment')}
    ${rule(1, 'PaymentCompleted &#8594; Inventory')}
    ${rule(2, 'StockReserved &#8594; Order')}

    <g class="sg-saga-id">
      <rect class="scene-chip-outline sg-saga-id-bg" x="${ID_X}" y="${ID_Y}" width="${ID_W}" height="${ID_H}" rx="18" />
      <text class="scene-mono sg-saga-id-text" x="${ID_X + ID_W / 2}" y="${ID_Y + 38}" text-anchor="middle">saga #12</text>
    </g>

    ${STATES.map(([key, label], index) => cell(index, key ?? '', label ?? '')).join('\n    ')}
    <text class="sg-pivot" x="${PIVOT_X}" y="${PIVOT_Y}" text-anchor="middle">pivot</text>
    ${retryCounter}`,
  })}

  ${service('order', 'Order')}

  ${service('payment', 'Payment')}

  ${service('inventory', 'Inventory')}

  ${requestsLayer()}
</svg>`;
