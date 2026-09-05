/**
 * Static stage markup for the Transactional Outbox scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. The bands are the usual ones:
 *   - y 0..400        above the cropped viewBox (see shared VIEWBOX)
 *   - y 400..440      the frame's top padding; nothing is drawn here
 *   - y 440..680      Service: the request it is holding and the two lines of
 *                     code it is running, which swap from two statements to one
 *                     transaction
 *   - y 880..1270     Database: the `orders` table on the left as plain rows,
 *                     the `outbox` table on the right as rows carrying a
 *                     sequence, an id and a state, the frame that wraps both
 *                     once they are written together, and the log strip a
 *                     change data capture pipeline would read instead
 *   - y 1500..1740    Relay on the left and Broker on the right, joined by the
 *                     bus at `Y_BUS`, which is the vertical centre of both
 *   - y 1796..1848    what the broker has taken, and what it has taken twice
 *
 * Four lanes carry travellers and no others. A write goes down `X_MAIN` from
 * the bottom of the Service to the top of the Database. A publish made outside
 * a transaction leaves the right edge of the Service, runs down `X_DIRECT` past
 * the Database, and turns once onto the bus to reach the right edge of the
 * Broker: it has to pass outside the Database node rather than through it,
 * because the node is 820 wide and a column through it would cross the outbox
 * rows. The relay claims a row down `X_POLL`, which is the centre of the Relay
 * box, and turns onto the bus at (`X_POLL`, `Y_BUS`) — one point shared by both
 * legs. Change data capture replaces that route with `X_CDC`, straight from the
 * bottom of the Database to the top of the Broker.
 *
 * That is what decides where a label may sit. The bus sweeps a band 52 high
 * across the whole bottom, so both boxes name themselves below it and put their
 * badges above it, and the queue slots sit lower still. The Service writes its
 * code far enough left that the halo of a write leaving the bottom edge never
 * reaches it.
 */

import {
  VIEWBOX,
  chip,
  clientBox,
  counterVariants,
  nodeFrame,
  requestsLayer,
  serviceBox,
  verticalLink,
} from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- geometry --------------------------------------------------------------

/** The Service, and the two points a request leaves it from. */
const SVC_X = 280;
const SVC_W = 520;
const SVC_Y = 440;
const SVC_H = 240;
export const Y_SERVICE = SVC_Y + SVC_H;
export const X_SERVICE_RIGHT = SVC_X + SVC_W;
export const Y_PUBLISH_EXIT = 560;
const SVC_TITLE_Y = 492;
const REQ_X = 380;
const REQ_Y = 516;
const REQ_W = 320;
const REQ_H = 58;
const REQ_TEXT_Y = 554;
const CODE_X = 320;
const CODE_Y1 = 616;
const CODE_Y2 = 656;

/** The four lanes. */
export const X_MAIN = 540;
export const X_POLL = 290;
export const X_CDC = 870;
export const X_DIRECT = 1010;
export const Y_BUS = 1620;

/** The Database node and the two table strips inside it. `nodeFrame` fixes
 * its left edge at 130 and its width at 820, so only the height is named here. */
export const Y_DATABASE = 880;
const DB_H = 390;
export const Y_DATABASE_BOTTOM = Y_DATABASE + DB_H;
const DB_LABEL_Y = 926;
const HEAD_Y = 970;
const ORD_X = 170;
const ORD_W = 360;
const ORD_CENTRE = ORD_X + ORD_W / 2;
const OUT_X = 590;
const OUT_W = 320;
const OUT_CENTRE = OUT_X + OUT_W / 2;

/** Where the rows start, and how they stack. */
const ROW_TOP = 996;
const ORD_PITCH = 25;
const ORD_H = 18;
const OUT_PITCH = 34;
const OUT_H = 27;
const OUT_TEXT_DY = 20;
const SEQ_X = 604;
const ID_X = 700;
const STATE_X = 896;

/** The log strip, drawn as texture: no record carries a name. */
const LOG_X = 170;
const LOG_Y = 1236;
const LOG_W = 740;
const LOG_H = 22;
const LOG_TICKS = 24;

/**
 * The frame that wraps both tables once one commit covers them. It starts
 * below the two readouts, because those name the tables rather than sit inside
 * the transaction, and a dashed line drawn through a word is a word nobody
 * reads.
 */
const FRAME_X = 152;
const FRAME_Y = 988;
const FRAME_W = 776;
const FRAME_H = 244;

/** The Relay box. `X_POLL` is its centre, which is why it starts at 150. */
const RLY_X = 150;
const RLY_W = 280;
export const Y_BOTTOM = 1500;
const BOT_H = 240;
const RLY_TITLE_Y = 1712;
const CDC_CHIP_X = 158;
const CDC_CHIP_Y = 1522;
const CDC_CHIP_W = 88;
const CDC_CHIP_H = 62;
const CDC_TEXT_X = 202;
const CDC_TEXT_Y = 1562;

/** The Broker box, its badge, its queue and the ticks under it. */
export const BRK_X = 470;
const BRK_W = 480;
export const X_BROKER_RIGHT = BRK_X + BRK_W;
const BRK_TITLE_X = 710;
const BRK_TITLE_Y = 1556;
const DOWN_X = 492;
const DOWN_Y = 1518;
const DOWN_W = 120;
const DOWN_H = 58;
const DOWN_TEXT_X = 552;
const DOWN_TEXT_Y = 1556;
export const SLOT_XS = [526, 618, 710, 802, 894] as const;
const SLOT_W = 72;
const SLOT_H = 52;
const SLOT_Y = 1666;
const SLOT_TEXT_Y = 1700;
const TICK_Y = 1724;
const TICK_H = 10;
const TICK_W = 26;

/** The two readouts under the bottom row, and the guarantee they add up to. */
const PUB_X = 470;
const READOUT_Y = 1796;
const DUP_X = 950;
const ONCE_X = 710;
const ONCE_Y = 1848;

// --- what the scene counts to ---------------------------------------------

/** Highest sequence number the outbox hands out. */
export const MAX_SEQ = 8;
/** Message ids are the sequence number offset, so `seq 2` is `id 42`. */
export const ID_BASE = 40;
/** Rows the `orders` strip can hold, which is every order the scene commits. */
export const ORD_ROWS = 9;
/** Rows the `outbox` strip can hold at once, before a cleanup sweep. */
export const OUT_ROWS = 7;
/** Queue slots the broker holds. */
export const SLOT_COUNT = SLOT_XS.length;
/** Highest reading of each readout. */
export const MAX_ORDERS = 9;
export const MAX_PENDING = 7;
export const MAX_PUBLISHED = 8;
export const MAX_DUPS = 2;

/**
 * What every `data-*` on the stage starts at, keyed by the target the timeline
 * addresses it through, so a change that writes a value something already holds
 * can be dropped rather than tweened.
 */
export const STAGE_STATE: Record<string, string> = {
  'stage@data-ob-code': 'split',
  'stage@data-ob-frame': 'off',
  'stage@data-ob-req': 'off',
  'stage@data-ob-broker': 'down',
  'stage@data-ob-relay': 'up',
  'stage@data-ob-cdc': 'off',
  'stage@data-ob-drain': 'off',
  'stage@data-ob-once': 'off',
  'stage@data-ob-orders': '0',
  'stage@data-ob-pending': '0',
  'stage@data-ob-published': '0',
  'stage@data-ob-dups': '0',
};

// --- markup ----------------------------------------------------------------

const mono = (text: string): string => text.replace(/ /g, '&#160;');

/** The request the Service is holding. */
const requestChip = chip({
  x: REQ_X,
  y: REQ_Y,
  width: REQ_W,
  height: REQ_H,
  rx: 20,
  className: 'ob-req-chip',
  variant: 'outline',
  text: `<text class="scene-mono ob-req-text" x="${REQ_X + REQ_W / 2}" y="${REQ_TEXT_Y}" text-anchor="middle">POST&#160;/orders</text>`,
});

/**
 * The two code lines, each a stack of the two spellings the scene runs. The
 * first step calls two statements; from the second they are one transaction.
 */
const codeLine = (n: 1 | 2, split: string, tx: string): string => {
  const y = n === 1 ? CODE_Y1 : CODE_Y2;
  return [
    `<text class="scene-mono ob-code ob-code--split ob-code-${n}" x="${CODE_X}" y="${y}">${mono(split)}</text>`,
    `<text class="scene-mono ob-code ob-code--tx ob-code-${n}" x="${CODE_X}" y="${y}">${mono(tx)}</text>`,
  ].join('\n    ');
};

/** One row of the `orders` table: texture, because no order carries a name. */
const orderRow = (index: number): string =>
  `<rect class="ob-bar ob-bar--${index}" data-ob-bar="off" x="${ORD_X}" y="${ROW_TOP + index * ORD_PITCH}" width="${ORD_W}" height="${ORD_H}" rx="6" />`;

/** Every sequence number a row can carry, stacked on one baseline. */
const seqText = (baseline: number): string =>
  Array.from({ length: MAX_SEQ }, (_value, index) => index + 1)
    .map(
      (n) =>
        `<text class="scene-mono ob-seq ob-seq--${n}" x="${SEQ_X}" y="${baseline}">seq&#160;${n}</text>`,
    )
    .join('\n        ');

const idText = (baseline: number): string =>
  Array.from({ length: MAX_SEQ }, (_value, index) => index + 1)
    .map(
      (n) =>
        `<text class="scene-mono ob-id ob-id--${n}" x="${ID_X}" y="${baseline}">id&#160;${ID_BASE + n}</text>`,
    )
    .join('\n        ');

/** One row of the `outbox` table: what it is, and how it stands. */
const outboxRow = (index: number): string => {
  const top = ROW_TOP + index * OUT_PITCH;
  const baseline = top + OUT_TEXT_DY;
  return `<g class="ob-row ob-row--${index}" data-ob-row="none" data-ob-seq="0">
        <rect class="ob-row-bg" x="${OUT_X}" y="${top}" width="${OUT_W}" height="${OUT_H}" rx="8" />
        ${seqText(baseline)}
        ${idText(baseline)}
        <text class="ob-state ob-state--pending" x="${STATE_X}" y="${baseline}" text-anchor="end">pending</text>
        <text class="ob-state ob-state--sent" x="${STATE_X}" y="${baseline}" text-anchor="end">sent</text>
      </g>`;
};

/** The log strip: one tick per record, and not one of them named. */
const logStrip = Array.from({ length: LOG_TICKS }, (_value, index) => {
  const width = (LOG_W - 6) / LOG_TICKS;
  const x = LOG_X + 3 + index * width;
  return `<rect class="ob-log-tick" x="${x.toFixed(1)}" y="${LOG_Y + 5}" width="${(width - 6).toFixed(1)}" height="${LOG_H - 10}" rx="2" />`;
}).join('\n      ');

const ordersReadout = counterVariants({
  x: ORD_CENTRE,
  y: HEAD_Y,
  className: 'ob-orders',
  count: MAX_ORDERS + 1,
  anchor: 'middle',
  format: (n) => `orders ${n}`,
  indent: 6,
});

const pendingReadout = counterVariants({
  x: OUT_CENTRE,
  y: HEAD_Y,
  className: 'ob-pending',
  count: MAX_PENDING + 1,
  anchor: 'middle',
  format: (n) => `outbox pending ${n}`,
  indent: 6,
});

const publishedReadout = counterVariants({
  x: PUB_X,
  y: READOUT_Y,
  className: 'ob-published',
  count: MAX_PUBLISHED + 1,
  format: (n) => `published ${n}`,
  indent: 2,
});

const dupsReadout = counterVariants({
  x: DUP_X,
  y: READOUT_Y,
  className: 'ob-dups',
  count: MAX_DUPS + 1,
  anchor: 'end',
  format: (n) => `duplicates ${n}`,
  indent: 2,
});

/** The message one queue slot is holding, one variant per id it can hold. */
const slotText = (centre: number): string =>
  Array.from({ length: MAX_SEQ }, (_value, index) => index + 1)
    .map(
      (n) =>
        `<text class="scene-mono ob-msg ob-msg--${n}" x="${centre}" y="${SLOT_TEXT_Y}" text-anchor="middle">id&#160;${ID_BASE + n}</text>`,
    )
    .join('\n      ');

/**
 * One queue slot: the box, and every message id it could be holding. The slot
 * is wider than it is tall so an id fits inside it.
 */
const queue = SLOT_XS.map(
  (centre, index) =>
    `<g class="ob-slot-group ob-slot-group--${index}" data-ob-slot="free" data-ob-msg="0">
      <rect class="scene-slot ob-slot" x="${centre - SLOT_W / 2}" y="${SLOT_Y}" width="${SLOT_W}" height="${SLOT_H}" rx="12" />
      ${slotText(centre)}
    </g>`,
).join('\n    ');

const ticks = SLOT_XS.map(
  (centre) =>
    `<rect class="ob-tick" x="${centre - TICK_W / 2}" y="${TICK_Y}" width="${TICK_W}" height="${TICK_H}" rx="4" />`,
).join('\n    ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" data-ob-code="split" data-ob-frame="off" data-ob-req="off" data-ob-broker="down" data-ob-relay="up" data-ob-cdc="off" data-ob-drain="off" data-ob-once="off" data-ob-orders="0" data-ob-pending="0" data-ob-published="0" data-ob-dups="0" aria-hidden="true" focusable="false">
  <defs>
    <pattern id="ob-hatch" width="18" height="18" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
      <line class="ob-hatch-line" x1="0" y1="0" x2="0" y2="18" stroke-width="5" />
    </pattern>
  </defs>

  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_MAIN, Y_SERVICE, Y_DATABASE)}
  ${verticalLink(X_POLL, Y_DATABASE_BOTTOM, Y_BOTTOM, 'scene-link ob-poll-link')}
  <line class="scene-link ob-bus-link" x1="${RLY_X + RLY_W}" y1="${Y_BUS}" x2="${BRK_X}" y2="${Y_BUS}" />

  <g class="ob-direct">
    <line class="scene-link ob-direct-link" x1="${X_SERVICE_RIGHT}" y1="${Y_PUBLISH_EXIT}" x2="${X_DIRECT}" y2="${Y_PUBLISH_EXIT}" />
    <line class="scene-link ob-direct-link" x1="${X_DIRECT}" y1="${Y_PUBLISH_EXIT}" x2="${X_DIRECT}" y2="${Y_BUS}" />
    <line class="scene-link ob-direct-link" x1="${X_DIRECT}" y1="${Y_BUS}" x2="${X_BROKER_RIGHT}" y2="${Y_BUS}" />
  </g>

  <g class="ob-cdc-lane">
    ${verticalLink(X_CDC, Y_DATABASE_BOTTOM, Y_BOTTOM, 'scene-link ob-cdc-link')}
  </g>

  ${clientBox({
    x: SVC_X,
    width: SVC_W,
    y: SVC_Y,
    height: SVC_H,
    title: 'Service',
    titleY: SVC_TITLE_Y,
    extraClass: 'ob-service',
    children: `
    ${requestChip}
    ${codeLine(1, 'save()', 'BEGIN')}
    ${codeLine(2, 'publish()', 'COMMIT')}`,
  })}

  ${nodeFrame({
    y: Y_DATABASE,
    height: DB_H,
    label: 'Database',
    labelY: DB_LABEL_Y,
    children: `    <rect class="ob-frame" x="${FRAME_X}" y="${FRAME_Y}" width="${FRAME_W}" height="${FRAME_H}" rx="20" />

    <g class="ob-orders-strip">
      ${ordersReadout}
      ${Array.from({ length: ORD_ROWS }, (_value, index) => orderRow(index)).join('\n      ')}
    </g>

    <g class="ob-outbox-strip">
      ${pendingReadout}
      ${Array.from({ length: OUT_ROWS }, (_value, index) => outboxRow(index)).join('\n      ')}
    </g>

    <g class="ob-log">
      <rect class="ob-log-bg" x="${LOG_X}" y="${LOG_Y}" width="${LOG_W}" height="${LOG_H}" rx="6" />
      ${logStrip}
    </g>`,
  })}

  ${serviceBox({
    x: RLY_X,
    width: RLY_W,
    y: Y_BOTTOM,
    height: BOT_H,
    title: 'Relay',
    titleX: X_POLL,
    titleY: RLY_TITLE_Y,
    titleClass: 'scene-node-label',
    className: 'ob-relay',
    boxClass: 'scene-box ob-relay-box',
    before: `
    <rect class="ob-relay-hatch" x="${RLY_X}" y="${Y_BOTTOM}" width="${RLY_W}" height="${BOT_H}" rx="28" />`,
    children: `
    ${chip({
      x: CDC_CHIP_X,
      y: CDC_CHIP_Y,
      width: CDC_CHIP_W,
      height: CDC_CHIP_H,
      rx: 18,
      className: 'ob-cdc-chip',
      variant: 'outline',
      text: `<text class="ob-cdc-text" x="${CDC_TEXT_X}" y="${CDC_TEXT_Y}" text-anchor="middle">CDC</text>`,
    })}`,
  })}

  ${serviceBox({
    x: BRK_X,
    width: BRK_W,
    y: Y_BOTTOM,
    height: BOT_H,
    title: 'Broker',
    titleX: BRK_TITLE_X,
    titleY: BRK_TITLE_Y,
    titleClass: 'scene-node-label',
    className: 'ob-broker',
    boxClass: 'scene-box ob-broker-box',
    before: `
    <rect class="ob-broker-hatch" x="${BRK_X}" y="${Y_BOTTOM}" width="${BRK_W}" height="${BOT_H}" rx="28" />`,
    children: `
    ${chip({
      x: DOWN_X,
      y: DOWN_Y,
      width: DOWN_W,
      height: DOWN_H,
      rx: 18,
      className: 'ob-down-chip',
      variant: 'outline',
      text: `<text class="ob-down-text" x="${DOWN_TEXT_X}" y="${DOWN_TEXT_Y}" text-anchor="middle">down</text>`,
    })}
    ${queue}
    ${ticks}`,
  })}

  ${publishedReadout}
  ${dupsReadout}
  <text class="ob-once" x="${ONCE_X}" y="${ONCE_Y}" text-anchor="middle">at least once</text>

  ${requestsLayer()}
</svg>`;
