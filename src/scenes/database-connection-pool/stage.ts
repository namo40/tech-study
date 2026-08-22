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

const slots = SLOT_X.map(
  (x, index) =>
    `<rect class="dp-slot dp-slot--${index + 1}" data-slot-state="none" x="${x - SLOT_SIDE / 2}" y="${SLOT_Y}" width="${SLOT_SIDE}" height="${SLOT_SIDE}" rx="16" />`,
).join('\n    ');

const handshakes = SLOT_X.map(
  (x, index) =>
    `<line class="dp-handshake dp-handshake--${index + 1}" x1="${x}" y1="1090" x2="${x}" y2="1500" stroke-dasharray="${HANDSHAKE_LENGTH}" stroke-dashoffset="${HANDSHAKE_LENGTH}" />`,
).join('\n    ');

const counters = (cls: string, x: number, y: number, anchor: string, label: (n: number) => string) =>
  [0, 1, 2, 3, 4]
    .map(
      (n) =>
        `<text class="${cls} ${cls}--${n}" x="${x}" y="${y}" text-anchor="${anchor}">${label(n)}</text>`,
    )
    .join('\n    ');

const waiting = [0, 1, 2, 3]
  .map(
    (n) =>
      `<text class="dp-waiting dp-waiting--${n}" x="${WAIT_X}" y="975" text-anchor="middle">waiting ${n}</text>`,
  )
  .join('\n    ');

export const stageMarkup = `<svg class="scene-stage" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg" data-open="0" data-connections="0" data-waiting="0" data-held="off" aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  <line class="scene-link" x1="540" y1="680" x2="540" y2="880" />
  <line class="scene-link" x1="540" y1="1270" x2="540" y2="1500" />

  <g class="scene-client">
    <rect class="scene-box" x="280" y="440" width="520" height="240" rx="28" />
    <text class="scene-node-title" x="540" y="575" text-anchor="middle">App</text>
  </g>

  ${handshakes}

  <g class="scene-node">
    <rect class="scene-box" x="130" y="880" width="820" height="390" rx="28" />
    <text class="scene-node-label" x="170" y="938">Connection Pool</text>
    ${counters('dp-open', 910, 938, 'end', (n) => `open ${n}/4`)}

    ${slots}
    <text class="dp-held" x="300" y="1178" text-anchor="middle">held</text>

    ${waiting}
  </g>

  <g class="dp-db">
    <rect class="scene-box" x="280" y="1500" width="520" height="240" rx="28" />
    <text class="scene-node-title" x="540" y="1580" text-anchor="middle">Database</text>
    ${counters('dp-connections', 540, 1690, 'middle', (n) => `connections ${n}`)}
  </g>

  <g class="scene-requests"></g>
</svg>`;
