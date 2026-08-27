/**
 * Static stage markup for the Dead Letter Queue scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. The bands are the usual ones:
 *   - y 0..440        kept empty for the step title card
 *   - y 440..680      Producer, which emits the message stream and carries the
 *                     `fix` chip the fourth step lights
 *   - y 880..1270     Queue: the slot strip a waiting message stands in, the
 *                     depth readout, the delivery ring of whatever is being
 *                     retried, and the `max delivery 3` policy chip
 *   - y 1500..1850    Consumer on the left, with its result tick and `done`;
 *                     the dead-letter queue on the right, as three rows that
 *                     each carry a message and the reason it landed there
 *
 * Three lanes carry travellers and no others, and each is a straight column
 * through the centres of the boxes it joins:
 *   - `X_IN` (540) from the bottom of the Producer to the top of the Queue;
 *   - `X_WORK` (310) between the bottom of the Queue and the top of the
 *     Consumer, downwards for a delivery and upwards for the redelivery that
 *     follows a failure, which is the same message coming back rather than a
 *     new one, so it needs no lane of its own;
 *   - `X_SIDE` (770) between the bottom of the Queue and the top of the DLQ,
 *     downwards when the broker sets a message aside and upwards when someone
 *     resubmits it.
 *
 * That is what decides where a label may sit. Both bottom lanes sweep a band
 * 52 wide down to y 1526 with the halo included, so the Consumer names itself
 * below its own readout rather than at the top of its box, the DLQ names
 * itself from the left margin where the lane does not reach, and the three
 * dead-letter rows start below the point the lane stops. In the Queue the
 * arrival lane sweeps down to y 906, so the depth readout is counted from the
 * top right and the policy chip sits well below the slot strip.
 *
 * Message numbering starts at `#4` because the stream is already running when
 * the scene opens: `done` counts what happens on screen, and the ids carry on
 * from what the producer had already sent. That is what makes the poison
 * message the fourth one the reader sees and still the seventh one sent.
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

/** The Producer, and the `fix` chip it lights once the cause is repaired. */
const PRD_X = 280;
const PRD_W = 520;
const PRD_Y = 440;
const PRD_H = 240;
const PRD_TITLE_Y = 500;
const FIX_X = 600;
const FIX_Y = 596;
const FIX_W = 160;
const FIX_H = 64;
const FIX_TEXT_X = 680;
const FIX_TEXT_Y = 638;

/** The three lanes, and the four edges they run between. */
export const X_IN = 540;
export const X_WORK = 310;
export const X_SIDE = 770;
export const Y_PRODUCER = 680;
export const Y_QUEUE_TOP = 880;
export const Y_QUEUE = 1270;
export const Y_BOTTOM = 1500;

/** The Queue node. `nodeFrame` fixes x 130 and width 820, so only y is named. */
const QUE_H = 390;
const QUE_LABEL_Y = 934;
const DEPTH_X = 910;

/** The slot strip: where a message stands while it waits its turn. */
export const SLOT_XS = [215, 345, 475, 605, 735, 865] as const;
export const SLOT_COUNT = SLOT_XS.length;
const SLOT_W = 110;
const SLOT_H = 64;
const SLOT_Y = 1004;
const SLOT_TEXT_Y = 1046;

/** The delivery ring, the `poison` chip beside it, and the count it carries. */
const RING_CX = 220;
const RING_CY = 1162;
const RING_R = 44;
const POISON_X = 292;
const POISON_Y = 1130;
const POISON_W = 160;
const POISON_H = 64;
const POISON_TEXT_X = 372;
const CHIP_TEXT_Y = 1172;
const DELIVERY_X = 480;
const POLICY_X = 680;
const POLICY_W = 240;
const POLICY_TEXT_X = 800;

/** The Consumer: the tick it shows for one result, and what it has finished. */
const CON_X = 130;
const CON_W = 360;
const BOT_H = 350;
const TICK_CX = 310;
const TICK_CY = 1620;
const TICK_R = 36;
const DONE_Y = 1748;
const CON_TITLE_Y = 1818;

/** The dead-letter queue, its three rows, and the alarm under them. */
const DLQ_X = 590;
const DLQ_W = 360;
const DLQ_TITLE_X = 610;
const DLQ_TITLE_Y = 1562;
const ROW_X = 606;
const ROW_W = 328;
const ROW_TOP = 1586;
const ROW_PITCH = 58;
const ROW_H = 48;
const ROW_TEXT_DY = 33;
const ROW_ID_X = 622;
const ROW_REASON_X = 918;
export const DLQ_ROWS = 3;
const LINE_Y = 1764;
const DLQ_READ_Y = 1798;
const DLQ_COUNT_X = 620;
const ALERT_X = 920;

// --- what the scene counts to ---------------------------------------------

/**
 * Message `k` is drawn `#(k + MSG_BASE)`, so the fourth message the producer
 * sends in this scene is the `#7` the reader is asked to follow.
 */
export const MSG_BASE = 3;
/** How many messages the producer sends, which is the highest id it reaches. */
export const MSG_COUNT = 15;
/** Highest reading of each readout. */
export const MAX_DEPTH = SLOT_COUNT;
export const MAX_DONE = 14;
export const MAX_DLQ = DLQ_ROWS;
/** Every id a slot or a dead-letter row can be holding. */
const MSG_IDS = Array.from({ length: MSG_COUNT }, (_value, index) => index + 1 + MSG_BASE);

/**
 * What every `data-*` on the stage starts at, keyed by the target the timeline
 * addresses it through, so a change that writes a value something already
 * holds can be dropped rather than tweened.
 */
export const STAGE_STATE: Record<string, string> = {
  'stage@data-dq-depth': '0',
  'stage@data-dq-done': '0',
  'stage@data-dq-dlq': '0',
  'stage@data-dq-delivery': 'off',
  'stage@data-dq-alert': 'off',
  'stage@data-dq-fix': 'off',
  'stage@data-dq-tick': 'off',
};

// --- markup ----------------------------------------------------------------

/** The arc a delivery count fills, as three thirds of one ring. */
const RING_C = 2 * Math.PI * RING_R;
const RING_DASH = (RING_C / 3 - 8).toFixed(2);
const RING_GAP = (RING_C - Number(RING_DASH)).toFixed(2);
const ringSegments = [1, 2, 3]
  .map(
    (n) =>
      `<circle class="dq-ring-arc dq-ring-arc--${n}" cx="${RING_CX}" cy="${RING_CY}" r="${RING_R}" transform="rotate(-90 ${RING_CX} ${RING_CY})" stroke-dasharray="${RING_DASH} ${RING_GAP}" stroke-dashoffset="${(-(n - 1) * (RING_C / 3)).toFixed(2)}" />`,
  )
  .join('\n    ');

/** Every count the ring can be showing, stacked on one baseline. */
const deliveryText = [1, 2, 3]
  .map(
    (n) =>
      `<text class="dq-delivery dq-delivery--${n}" x="${DELIVERY_X}" y="${CHIP_TEXT_Y}">delivery&#160;${n}</text>`,
  )
  .join('\n    ');

/** Every id a slot can be holding, stacked on the slot's own centre. */
const slotText = (centre: number): string =>
  MSG_IDS.map(
    (id) =>
      `<text class="scene-mono dq-msg dq-msg--${id}" x="${centre}" y="${SLOT_TEXT_Y}" text-anchor="middle">#${id}</text>`,
  ).join('\n        ');

/** One slot: the box it stands in, and every id it could be holding. */
const slots = SLOT_XS.map(
  (centre, index) =>
    `<g class="dq-slot dq-slot--${index}" data-dq-slot="free" data-dq-msg="0">
        <rect class="scene-slot dq-slot-box" x="${centre - SLOT_W / 2}" y="${SLOT_Y}" width="${SLOT_W}" height="${SLOT_H}" rx="14" />
        ${slotText(centre)}
      </g>`,
).join('\n      ');

/** Every id a dead-letter row can be holding. */
const rowIdText = (baseline: number): string =>
  MSG_IDS.map(
    (id) =>
      `<text class="scene-mono dq-row-id dq-row-id--${id}" x="${ROW_ID_X}" y="${baseline}">#${id}</text>`,
  ).join('\n        ');

/** One dead-letter row: what is parked there, and why it is. */
const dlqRow = (index: number): string => {
  const top = ROW_TOP + index * ROW_PITCH;
  const baseline = top + ROW_TEXT_DY;
  const reason = (name: string, label: string): string =>
    `<text class="dq-reason dq-reason--${name}" x="${ROW_REASON_X}" y="${baseline}" text-anchor="end">${label}</text>`;
  return `<g class="dq-row dq-row--${index}" data-dq-row="none" data-dq-id="0" data-dq-reason="none">
        <rect class="dq-row-bg" x="${ROW_X}" y="${top}" width="${ROW_W}" height="${ROW_H}" rx="10" />
        ${rowIdText(baseline)}
        ${reason('max', 'max&#160;delivery')}
        ${reason('expired', 'expired')}
        ${reason('resubmit', 'resubmit')}
        ${reason('discard', 'discard')}
      </g>`;
};

const depthReadout = counterVariants({
  x: DEPTH_X,
  y: QUE_LABEL_Y,
  className: 'dq-depth',
  count: MAX_DEPTH + 1,
  anchor: 'end',
  format: (n) => `depth ${n}`,
  indent: 4,
});

const doneReadout = counterVariants({
  x: TICK_CX,
  y: DONE_Y,
  className: 'dq-done',
  count: MAX_DONE + 1,
  anchor: 'middle',
  format: (n) => `done ${n}`,
  indent: 4,
});

const dlqReadout = counterVariants({
  x: DLQ_COUNT_X,
  y: DLQ_READ_Y,
  className: 'dq-count',
  count: MAX_DLQ + 1,
  format: (n) => `dlq ${n}`,
  indent: 4,
});

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" data-dq-depth="0" data-dq-done="0" data-dq-dlq="0" data-dq-delivery="off" data-dq-alert="off" data-dq-fix="off" data-dq-tick="off" aria-hidden="true" focusable="false">
  <defs>
    <pattern id="dq-hatch" width="16" height="16" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
      <line class="dq-hatch-line" x1="0" y1="0" x2="0" y2="16" stroke-width="5" />
    </pattern>
  </defs>

  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_IN, Y_PRODUCER, Y_QUEUE_TOP)}
  ${verticalLink(X_WORK, Y_QUEUE, Y_BOTTOM)}
  ${verticalLink(X_SIDE, Y_QUEUE, Y_BOTTOM, 'scene-link dq-side-link')}

  ${clientBox({
    x: PRD_X,
    width: PRD_W,
    y: PRD_Y,
    height: PRD_H,
    title: 'Producer',
    titleY: PRD_TITLE_Y,
    extraClass: 'dq-producer',
    children: `
    ${chip({
      x: FIX_X,
      y: FIX_Y,
      width: FIX_W,
      height: FIX_H,
      rx: 20,
      className: 'dq-fix',
      variant: 'outline',
      text: `<text class="dq-fix-text" x="${FIX_TEXT_X}" y="${FIX_TEXT_Y}" text-anchor="middle">fix</text>`,
    })}`,
  })}

  ${nodeFrame({
    y: Y_QUEUE_TOP,
    height: QUE_H,
    label: 'Queue',
    labelY: QUE_LABEL_Y,
    children: `    ${depthReadout}

    <g class="dq-strip">
      ${slots}
    </g>

    <g class="dq-ring">
      <circle class="dq-ring-track" cx="${RING_CX}" cy="${RING_CY}" r="${RING_R}" />
      ${ringSegments}
    </g>

    ${chip({
      x: POISON_X,
      y: POISON_Y,
      width: POISON_W,
      height: POISON_H,
      rx: 20,
      className: 'dq-poison',
      variant: 'outline',
      text: `<text class="dq-poison-text" x="${POISON_TEXT_X}" y="${CHIP_TEXT_Y}" text-anchor="middle">poison</text>`,
    })}

    ${deliveryText}

    ${chip({
      x: POLICY_X,
      y: POISON_Y,
      width: POLICY_W,
      height: POISON_H,
      rx: 20,
      className: 'dq-policy',
      variant: 'outline',
      text: `<text class="dq-policy-text" x="${POLICY_TEXT_X}" y="${CHIP_TEXT_Y}" text-anchor="middle">max&#160;delivery&#160;3</text>`,
    })}`,
  })}

  ${serviceBox({
    x: CON_X,
    width: CON_W,
    y: Y_BOTTOM,
    height: BOT_H,
    title: 'Consumer',
    titleX: TICK_CX,
    titleY: CON_TITLE_Y,
    className: 'dq-consumer',
    children: `
    <g class="dq-tick" transform="translate(${TICK_CX} ${TICK_CY})">
      <circle class="dq-tick-bg" r="${TICK_R}" />
      <path class="dq-tick-glyph dq-tick-glyph--ok" d="M -17 2 L -6 15 L 18 -13" />
      <path class="dq-tick-glyph dq-tick-glyph--fail" d="M -15 -15 L 15 15 M 15 -15 L -15 15" />
    </g>
    ${doneReadout}`,
  })}

  ${serviceBox({
    x: DLQ_X,
    width: DLQ_W,
    y: Y_BOTTOM,
    height: BOT_H,
    title: 'DLQ',
    titleX: DLQ_TITLE_X,
    titleY: DLQ_TITLE_Y,
    titleAnchor: null,
    className: 'dq-dlq',
    children: `
    <g class="dq-rows">
      ${Array.from({ length: DLQ_ROWS }, (_value, index) => dlqRow(index)).join('\n      ')}
    </g>
    <line class="dq-alert-line" x1="${ROW_X}" y1="${LINE_Y}" x2="${ROW_X + ROW_W}" y2="${LINE_Y}" />
    ${dlqReadout}
    <text class="dq-alert" x="${ALERT_X}" y="${DLQ_READ_Y}" text-anchor="end">alert</text>`,
  })}

  ${requestsLayer()}
</svg>`;
