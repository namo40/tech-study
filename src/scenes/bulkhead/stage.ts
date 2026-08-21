/**
 * Static stage markup for the Bulkhead scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Bands match the other scenes:
 *   - y 0..440      kept empty for the step title card
 *   - y 440..680    Client box, with a lane per dependency
 *   - y 880..1270   Bulkhead node: six slots, the wall, the labels
 *   - y 1500..1740  Service A and Service B, each with a health dot
 *
 * Both lanes run through the centre of their own slot and their own service
 * box, so a request passes through everything it touches.
 */

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

/** Number of slots in the pool. */
export const SLOT_COUNT = 6;
/** Slots 1..3 belong to lane A once the wall is up, 4..6 to lane B. */
export const COMPARTMENT_SIZE = 3;

/** Lane centres, which are also the service box centres. */
export const LANE_X = { a: 325, b: 755 };

/** Centre x of each slot, left to right. */
export const SLOT_X = [204, 324, 444, 636, 756, 876];
const SLOT_Y = 1010;
const SLOT_SIDE = 72;

/** Radius and circumference of a timeout arc above a stuck slot. */
export const TIMEOUT_RADIUS = 22;
export const TIMEOUT_CIRCUMFERENCE = 2 * Math.PI * TIMEOUT_RADIUS;

const slots = SLOT_X.map(
  (x, index) =>
    `<rect class="bh-slot bh-slot--${index + 1}" data-slot-state="free" x="${x - SLOT_SIDE / 2}" y="${SLOT_Y}" width="${SLOT_SIDE}" height="${SLOT_SIDE}" rx="16" />`,
).join('\n    ');

/** One arc per slot in the B compartment, shown while a timeout runs. */
const timers = SLOT_X.slice(COMPARTMENT_SIZE)
  .map(
    (x, index) =>
      `<g class="bh-timer bh-timer--${index + 1}">
      <circle class="bh-timer-track" cx="${x}" cy="952" r="${TIMEOUT_RADIUS}" />
      <circle class="bh-timer-progress" cx="${x}" cy="952" r="${TIMEOUT_RADIUS}" transform="rotate(-90 ${x} 952)" stroke-dasharray="${TIMEOUT_CIRCUMFERENCE.toFixed(2)}" stroke-dashoffset="${TIMEOUT_CIRCUMFERENCE.toFixed(2)}" />
    </g>`,
  )
  .join('\n    ');

const counts = Array.from(
  { length: SLOT_COUNT + 1 },
  (_value, n) => `<text class="bh-count bh-count--${n}" x="170" y="1205">${n}/6</text>`,
).join('\n      ');

export const stageMarkup = `<svg class="scene-stage" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg" data-inflight="0" data-wall="off" data-bfull="off" data-timeout="off" data-health-a="ok" data-health-b="ok" aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  <line class="scene-link" x1="325" y1="680" x2="325" y2="880" />
  <line class="scene-link" x1="755" y1="680" x2="755" y2="880" />
  <line class="scene-link" x1="325" y1="1270" x2="325" y2="1500" />
  <line class="scene-link" x1="755" y1="1270" x2="755" y2="1500" />

  <g class="scene-client">
    <rect class="scene-box" x="280" y="440" width="520" height="240" rx="28" />
    <text class="scene-node-title" x="540" y="575" text-anchor="middle">Client</text>
  </g>

  <g class="scene-node">
    <rect class="scene-box" x="130" y="880" width="820" height="390" rx="28" />
    <text class="scene-node-label" x="170" y="938">Bulkhead</text>

    ${timers}

    <rect class="bh-wall" x="528" y="960" width="24" height="240" rx="12" />

    ${slots}

    <g class="bh-legend">
      <text class="scene-caption-label" x="170" y="1150">in flight</text>
      ${counts}
    </g>

    <text class="bh-key bh-key--a" x="324" y="1245" text-anchor="middle">A 3</text>
    <text class="bh-key bh-key--b" x="756" y="1245" text-anchor="middle">B 3</text>

    <text class="bh-alert bh-alert--full" x="756" y="1150" text-anchor="middle">B full</text>
    <text class="bh-alert bh-alert--timeout" x="756" y="1150" text-anchor="middle">timeout</text>
  </g>

  <g class="scene-service scene-service--a">
    <rect class="scene-box" x="150" y="1500" width="350" height="240" rx="28" />
    <rect class="bh-highlight" x="150" y="1500" width="350" height="240" rx="28" />
    <text class="scene-node-title bh-service-title" x="325" y="1590" text-anchor="middle">Service A</text>
    <circle class="bh-health-ring" data-health-state="ok" cx="325" cy="1680" r="32" />
    <circle class="bh-health" data-health-state="ok" cx="325" cy="1680" r="20" />
  </g>

  <g class="scene-service scene-service--b">
    <rect class="scene-box" x="580" y="1500" width="350" height="240" rx="28" />
    <text class="scene-node-title bh-service-title" x="755" y="1590" text-anchor="middle">Service B</text>
    <circle class="bh-health-ring" data-health-state="ok" cx="755" cy="1680" r="32" />
    <circle class="bh-health" data-health-state="ok" cx="755" cy="1680" r="20" />
  </g>

  <g class="scene-requests"></g>
</svg>`;
