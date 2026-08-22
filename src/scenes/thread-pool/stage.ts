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
      <text class="scene-mono tp-lane-label" x="285" y="${y + 7}" text-anchor="end">T${index + 1}</text>
      <rect class="scene-slot tp-bar" data-lane-state="${index < BASE_THREADS ? 'idle' : 'absent'}" x="${BAR_X}" y="${y - BAR_H / 2}" width="${BAR_W}" height="${BAR_H}" rx="13" />
    </g>`,
).join('\n    ');

/** One dashed line per lane, drawn while that thread is stuck on I/O. */
const blockedLines = LANE_Y.map(
  (y, index) =>
    `<line class="tp-blocked-line tp-blocked-line--${index + 1}" x1="${BAR_X + BAR_W}" y1="${y}" x2="${460 + index * 45}" y2="1500" />`,
).join('\n  ');

const threads = counterVariants({
  x: 910,
  y: 912,
  className: 'tp-threads',
  max: 6,
  anchor: 'end',
  format: (n) => `threads ${n}`,
});

const queue = counterVariants({
  x: QUEUE_X,
  y: 1252,
  className: 'tp-queue',
  max: 6,
  anchor: 'middle',
  format: (n) => `queue ${n}`,
});

const awaiting = counterVariants({
  x: 850,
  y: 1252,
  className: 'tp-awaiting',
  max: 8,
  anchor: 'middle',
  format: (n) => `awaiting ${n}`,
});

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" data-queue="0" data-awaiting="0" data-threads="4" data-inject="off" aria-hidden="true" focusable="false">
  <defs>
    <pattern id="tp-hatch" width="12" height="12" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
      <line class="tp-hatch-line" x1="0" y1="0" x2="0" y2="12" stroke-width="5" />
    </pattern>
  </defs>

  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(540, 680, 880)}
  ${verticalLink(540, 1270, 1500)}

  ${blockedLines}

  ${clientBox({ title: 'Requests', titleY: 575 })}

  ${nodeFrame({
    label: 'Thread Pool',
    labelY: 912,
    children: `    <text class="scene-flash tp-inject" x="540" y="912" text-anchor="middle">+1 thread</text>
    ${threads}

    ${lanes}

    ${queue}

    <rect class="tp-await-box" x="770" y="940" width="160" height="285" rx="16" />
    ${awaiting}`,
  })}

  ${serviceBox({ className: 'tp-io', title: 'I/O', titleY: 1640 })}

  ${requestsLayer()}
</svg>`;
