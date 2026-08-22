/**
 * Static stage markup for the Database Connection Pool scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Bands match the other scenes:
 *   - y 0..440      kept empty for the step title card
 *   - y 440..680    App box, one lane at x 540
 *   - y 880..1270   Connection Pool node: four slots, a waiting column, counters
 *   - y 1500..1740  Database box with its own connection count
 *
 * The lane at x 540 runs through the gap between slot 2 and slot 3, so a
 * request never covers a slot on its way past.
 */

import {
  VIEWBOX,
  clientBox,
  counterVariants,
  nodeFrame,
  requestsLayer,
  serviceBox,
  slotRow,
  verticalLink,
} from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

/** Connections the pool is allowed to open. */
export const POOL_MAX = 4;

/** Centre x of each connection slot. */
export const SLOT_X = [300, 460, 620, 780];
const SLOT_Y = 1010;
const SLOT_SIDE = 72;

/** Where a request stops at the pool. */
export const Y_POOL = 1046;

/** The column requests stand in when no connection is free. */
export const WAIT_X = 210;
export const WAIT_Y = [1010, 1060, 1110];

/** How long a handshake takes, and how long its line is. */
export const OPEN_TIME = 0.8;
export const HANDSHAKE_LENGTH = 410;

/** How long a request will stand in the column before giving up. */
export const WAIT_TIMEOUT = 1.5;

const slots = slotRow({
  xs: SLOT_X,
  y: SLOT_Y,
  side: SLOT_SIDE,
  rx: 16,
  className: 'dp-slot',
  initialState: 'none',
  attrName: 'data-slot-state',
});

const handshakes = SLOT_X.map(
  (x, index) =>
    `<line class="dp-handshake dp-handshake--${index + 1}" x1="${x}" y1="1090" x2="${x}" y2="1500" stroke-dasharray="${HANDSHAKE_LENGTH}" stroke-dashoffset="${HANDSHAKE_LENGTH}" />`,
).join('\n    ');

const open = counterVariants({
  x: 910,
  y: 938,
  className: 'dp-open',
  count: POOL_MAX + 1,
  anchor: 'end',
  format: (n) => `open ${n}/4`,
});

const connections = counterVariants({
  x: 540,
  y: 1690,
  className: 'dp-connections',
  count: POOL_MAX + 1,
  anchor: 'middle',
  format: (n) => `connections ${n}`,
});

const waiting = counterVariants({
  x: WAIT_X,
  y: 975,
  className: 'dp-waiting',
  count: 4,
  anchor: 'middle',
  format: (n) => `waiting ${n}`,
});

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" data-open="0" data-connections="0" data-waiting="0" data-held="off" aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(540, 680, 880)}
  ${verticalLink(540, 1270, 1500)}

  ${clientBox({ title: 'App', titleY: 575 })}

  ${handshakes}

  ${nodeFrame({
    label: 'Connection Pool',
    labelY: 938,
    children: `    ${open}

    ${slots}
    <text class="scene-flash dp-held" x="300" y="1178" text-anchor="middle">held</text>

    ${waiting}`,
  })}

  ${serviceBox({
    className: 'dp-db',
    title: 'Database',
    titleY: 1580,
    children: `
    ${connections}`,
  })}

  ${requestsLayer()}
</svg>`;
