/**
 * Static stage markup for the Idempotency-Key scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. The bands are the usual ones:
 *   - y 0..440      kept empty for the step title card
 *   - y 440..680    Client box: the amount it is about to send, and the label
 *                   it shows when it gives up waiting and sends the POST again
 *   - y 880..1270   API node: the flash that says what the lookup found, and
 *                   the idempotency store, three rows of key, status, response
 *   - y 1500..1740  Payments box: how many charges have actually happened, and
 *                   one receipt per charge
 *
 * The Client and Payments boxes are 580 wide and start at x 130, so `X_LANE`
 * runs through the centre of both; the node is wider because the store has to
 * fit beside the lane rather than under it.
 *
 * One lane decides where every label may sit. A request leaves the Client on
 * `X_LANE`, stops in the API at `Y_API`, and rides the same lane down to
 * `Y_PAY`. It carries one line of text above the dot — the key it is holding on
 * the way down, the status code it is bringing back on the way up — so the
 * widest thing that travels the lane is a four character key, 29px either side
 * of the lane against the 26px halo. Everything else is written into a column
 * that ends at least 30px short of that: the node keeps its content left of
 * x 333 or right of x 490, and both end boxes keep their content clear of the
 * lane in x rather than relying on the gap in y, because a request travels the
 * whole height of the Payments box and so passes every y inside it.
 *
 * The one place a request leaves the lane is `X_WAIT`/`Y_WAIT`, where a second
 * request holding a key another request has already claimed stands still until
 * the row it is waiting on is finished. It parks low and to the left so its own
 * key label clears the flash above it.
 */

import {
  VIEWBOX,
  clientBox,
  counterVariants,
  nodeFrame,
  requestsLayer,
  serviceBox,
  verticalLink,
} from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

/** The lane every request travels, and the rest positions along it. */
export const X_LANE = 420;
export const Y_CLIENT = 620;
export const Y_API = 1075;
export const Y_PAY = 1630;

/** Where a request waits while another one holds the key it asked for. */
export const X_WAIT = 290;
export const Y_WAIT = 1140;

/** How far above the dot a request carries what it is holding. */
export const LABEL_DY = -56;

/** The keys the client uses, which are also the rows the store can hold. */
export const KEYS = ['a1f3', 'b7c2', 'c9d4'] as const;
export type StoreKey = (typeof KEYS)[number];

/** The two request bodies the client sends, which is what a key is scoped to. */
export const AMOUNTS = [40, 90] as const;
export type Amount = (typeof AMOUNTS)[number];

/** Rows in the store, and the centre y of each one. */
export const ROW_COUNT = 3;
export const ROW_Y = [1042, 1117, 1192];

/** Receipts the Payments box can show, and therefore charges it can count. */
export const RECEIPT_COUNT = 3;

/** The store table: one rectangle per row, three columns written inside it. */
const TABLE_X = 490;
const TABLE_W = 440;
const ROW_H = 58;
const COL_KEY = 512;
const COL_STATUS = 596;
const COL_RESPONSE = 770;
const HEADER_Y = 984;

/** The flash that says what the lookup found, in the node's left column. */
const FLASH_X = 156;
const FLASH_Y = 1000;

/** Both end boxes: 580 wide, centred on the lane, inside the content band. */
const END_X = 130;
const END_W = 580;

/** One receipt chip, and where the row of them starts. */
const RECEIPT_X = 478;
const RECEIPT_Y = 1638;
const RECEIPT_W = 64;
const RECEIPT_H = 44;
const RECEIPT_PITCH = 72;

/**
 * What every `data-*` on the stage starts at, keyed by the target the timeline
 * addresses it through. The markup below is written from this, so a change that
 * writes a value something already holds is dropped rather than tweened.
 */
export const STAGE_STATE: Record<string, string> = {
  'stage@data-flash': 'none',
  'stage@data-charged': '0',
  'stage@data-alarm': 'off',
  'stage@data-retry': 'off',
  'stage@data-amount': '40',
  ...Object.fromEntries(
    Array.from({ length: ROW_COUNT }, (_value, index) => [
      [`row-${index}@data-row`, 'empty'],
      [`row-${index}@data-key`, 'none'],
      [`row-${index}@data-body`, 'none'],
    ]).flat(),
  ),
  ...Object.fromEntries(
    Array.from({ length: RECEIPT_COUNT }, (_value, index) => [
      `receipt-${index}@data-receipt`,
      'off',
    ]),
  ),
};

const stageState = Object.entries(STAGE_STATE)
  .filter(([key]) => key.startsWith('stage@'))
  .map(([key, value]) => `${key.slice('stage@'.length)}="${value}"`)
  .join(' ');

/** One row of the store: the key it holds, how far it got, what it replays. */
const row = (index: number): string => {
  const centre = ROW_Y[index] ?? 0;
  const baseline = centre + 8;
  const keys = KEYS.map(
    (key) =>
      `<text class="scene-mono ik-key ik-key--${key}" x="${COL_KEY}" y="${baseline}">${key}</text>`,
  ).join('\n      ');
  const responses = AMOUNTS.map(
    (amount) =>
      `<text class="scene-mono ik-response ik-response--${amount}" x="${COL_RESPONSE}" y="${baseline}">201 $${amount}</text>`,
  ).join('\n      ');
  return `<g class="ik-row ik-row--${index + 1}" data-row="empty" data-key="none" data-body="none">
      <rect class="ik-row-bg" x="${TABLE_X}" y="${centre - ROW_H / 2}" width="${TABLE_W}" height="${ROW_H}" rx="16" />
      ${keys}
      <text class="ik-status ik-status--progress" x="${COL_STATUS}" y="${baseline}">in progress</text>
      <text class="ik-status ik-status--done" x="${COL_STATUS}" y="${baseline}">done</text>
      ${responses}
    </g>`;
};

const flashes = [
  ['hit', 'hit'],
  ['miss', 'miss'],
  ['progress', 'in progress'],
]
  .map(
    ([name, text]) =>
      `<text class="scene-flash ik-flash ik-flash--${name}" x="${FLASH_X}" y="${FLASH_Y}">${text}</text>`,
  )
  .join('\n    ');

/** One receipt: a charge that actually happened, drawn as a slip of paper. */
const receipt = (index: number): string => {
  const x = RECEIPT_X + index * RECEIPT_PITCH;
  return `<g class="ik-receipt ik-receipt--${index + 1}" data-receipt="off">
      <rect class="ik-receipt-bg" x="${x}" y="${RECEIPT_Y}" width="${RECEIPT_W}" height="${RECEIPT_H}" rx="12" />
      <path class="ik-receipt-line" d="M ${x + 14} ${RECEIPT_Y + 15} H ${x + 50} M ${x + 14} ${RECEIPT_Y + 30} H ${x + 38}" />
    </g>`;
};

const amounts = AMOUNTS.map(
  (amount) =>
    `<text class="scene-counter ik-amount ik-amount--${amount}" x="560" y="600">amount $${amount}</text>`,
).join('\n    ');

const charged = counterVariants({
  x: 684,
  y: 1556,
  className: 'ik-charged',
  max: RECEIPT_COUNT,
  anchor: 'end',
  format: (n) => `charged ${n}`,
});

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageState} aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_LANE, 680, 880)}
  ${verticalLink(X_LANE, 1270, 1500)}

  ${clientBox({
    x: END_X,
    width: END_W,
    title: 'Client',
    titleX: END_X + 26,
    titleY: 500,
    titleAnchor: 'start',
    children: `
    <text class="scene-flash ik-retry" x="684" y="500" text-anchor="end">retry</text>
    ${amounts}`,
  })}

  ${nodeFrame({
    label: 'API',
    labelY: 938,
    children: `    ${flashes}

    <text class="ik-store-label" x="${TABLE_X}" y="938">idempotency store</text>
    <text class="scene-caption-label ik-ttl" x="930" y="938" text-anchor="end">TTL 24 h</text>
    <text class="scene-caption-label" x="${COL_KEY}" y="${HEADER_Y}">key</text>
    <text class="scene-caption-label" x="${COL_STATUS}" y="${HEADER_Y}">status</text>
    <text class="scene-caption-label" x="${COL_RESPONSE}" y="${HEADER_Y}">response</text>

    ${row(0)}
    ${row(1)}
    ${row(2)}`,
  })}

  ${serviceBox({
    x: END_X,
    width: END_W,
    className: 'ik-pay',
    title: 'Payments',
    // A tighter inset than the other boxes use: the title is the one label the
    // lane runs past at every y, so it is pushed to the far left to clear it.
    titleX: END_X + 12,
    titleY: 1556,
    titleAnchor: 'start',
    children: `
    ${charged}
    ${receipt(0)}
    ${receipt(1)}
    ${receipt(2)}`,
  })}

  ${requestsLayer()}
</svg>`;
