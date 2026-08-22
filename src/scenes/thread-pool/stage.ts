/**
 * Static stage markup for the Thread Pool scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Bands match the other scenes:
 *   - y 0..440      kept empty for the step title card
 *   - y 440..680    Requests box, where work items depart
 *   - y 880..1270   Thread Pool node: queue, six lane positions, awaiting box
 *   - y 1500..1740  I/O box, what a blocked thread is waiting for
 *
 * All six lane positions are laid out up front at a constant spacing, so
 * injecting or retiring a thread never moves the other lanes.
 */

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

/** Threads the pool starts and ends with. */
export const BASE_THREADS = 4;
/** Lane positions, four in use plus two the pool can inject. */
export const LANE_Y = [950, 1000, 1050, 1100, 1150, 1200];
export const BAR_X = 300;
export const BAR_W = 420;
const BAR_H = 26;
/** Where a work item sits while it runs on a lane. */
export const CHIP_X = 500;

/** The queue column on the left of the node. */
export const QUEUE_X = 210;
export const QUEUE_Y = [960, 1010, 1060, 1110, 1160, 1210];

/** The parking box on the right, for work that let go of its thread. */
export const AWAIT_SLOTS = [
  { x: 815, y: 985 },
  { x: 885, y: 985 },
  { x: 815, y: 1045 },
  { x: 885, y: 1045 },
  { x: 815, y: 1105 },
  { x: 885, y: 1105 },
  { x: 815, y: 1165 },
  { x: 885, y: 1165 },
];

/** Resting y of a work item inside the requests box. */
export const Y_CLIENT = 620;

const lanes = LANE_Y.map(
  (y, index) =>
    `<g class="tp-lane tp-lane--${index + 1}">
      <text class="tp-lane-label" x="285" y="${y + 7}" text-anchor="end">T${index + 1}</text>
      <rect class="tp-bar" data-lane-state="${index < BASE_THREADS ? 'idle' : 'absent'}" x="${BAR_X}" y="${y - BAR_H / 2}" width="${BAR_W}" height="${BAR_H}" rx="13" />
    </g>`,
).join('\n    ');

/** One dashed line per lane, drawn while that thread is stuck on I/O. */
const blockedLines = LANE_Y.map(
  (y, index) =>
    `<line class="tp-blocked-line tp-blocked-line--${index + 1}" x1="${BAR_X + BAR_W}" y1="${y}" x2="${460 + index * 45}" y2="1500" />`,
).join('\n  ');

const counter = (cls: string, x: number, y: number, anchor: string, max: number, label: (n: number) => string) =>
  Array.from({ length: max + 1 }, (_v, n) => n)
    .map(
      (n) =>
        `<text class="${cls} ${cls}--${n}" x="${x}" y="${y}" text-anchor="${anchor}">${label(n)}</text>`,
    )
    .join('\n    ');

export const stageMarkup = `<svg class="scene-stage" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg" data-queue="0" data-awaiting="0" data-threads="4" data-inject="off" aria-hidden="true" focusable="false">
  <defs>
    <pattern id="tp-hatch" width="12" height="12" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
      <line class="tp-hatch-line" x1="0" y1="0" x2="0" y2="12" stroke-width="5" />
    </pattern>
  </defs>

  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  <line class="scene-link" x1="540" y1="680" x2="540" y2="880" />
  <line class="scene-link" x1="540" y1="1270" x2="540" y2="1500" />

  ${blockedLines}

  <g class="scene-client">
    <rect class="scene-box" x="280" y="440" width="520" height="240" rx="28" />
    <text class="scene-node-title" x="540" y="575" text-anchor="middle">Requests</text>
  </g>

  <g class="scene-node">
    <rect class="scene-box" x="130" y="880" width="820" height="390" rx="28" />
    <text class="scene-node-label" x="170" y="912">Thread Pool</text>
    <text class="tp-inject" x="540" y="912" text-anchor="middle">+1 thread</text>
    ${counter('tp-threads', 910, 912, 'end', 6, (n) => `threads ${n}`)}

    ${lanes}

    ${counter('tp-queue', QUEUE_X, 1252, 'middle', 6, (n) => `queue ${n}`)}

    <rect class="tp-await-box" x="770" y="940" width="160" height="285" rx="16" />
    ${counter('tp-awaiting', 850, 1252, 'middle', 8, (n) => `awaiting ${n}`)}
  </g>

  <g class="tp-io">
    <rect class="scene-box" x="280" y="1500" width="520" height="240" rx="28" />
    <text class="scene-node-title" x="540" y="1640" text-anchor="middle">I/O</text>
  </g>

  <g class="scene-requests"></g>
</svg>`;
