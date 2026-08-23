/**
 * Static stage markup for the Web-Queue-Worker scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. The scene has five layers rather
 * than the usual three, so the node band carries two of them:
 *   - y 0..440       kept empty for the step title card
 *   - y 440..680     Client box, with the work lane and the status lane
 *   - y 860..1060    Web box: the tier that answers, and its `busy` meter
 *   - y 1140..1220   the queue track, twelve slots wide
 *   - y 1500..1740   the four workers
 *   - y 1790..1890   the dead-letter queue, which only step 4 fills
 *
 * Two things a request travels on and one thing a job chip travels on decide
 * where every label may sit:
 *   - the work lane at x 540, from the client box down into the Web box;
 *   - the status lane at x 400, which step 2 polls the job state on;
 *   - a worker lane at each worker's centre, which a chip rides from the queue
 *     down to `Y_WORK`, stopping well above the worker's own title.
 *
 * So the queue is named from the left margin rather than over its first slot,
 * `depth n` sits under the track and to the right of the last worker lane
 * rather than over the last slot, `busy` sits on the Web title's row rather
 * than on the row a chip is dropped through, and a worker's title sits below
 * the bar because a chip never travels that far down.
 * The dead-letter route leaves a worker upwards for the same reason: it climbs
 * back to `Y_ABOVE`, crosses to `DLQ_DROP_X`, which is clear of the worker row,
 * and only then drops.
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

/** The lane a work request travels on, and the lane a status poll travels on. */
export const X_WORK = 540;
export const X_STATUS = 400;

/** Resting y of a request inside the client box, and inside the Web box. */
export const Y_CLIENT = 620;
export const Y_WEB = 990;

/** Where a request stands when the Web tier has no room for it. */
export const WAIT_SPOTS = [
  { x: 440, y: 790 },
  { x: 640, y: 790 },
] as const;

/** The Web tier's occupancy meter. */
export const BUSY_X = 720;
export const BUSY_W = 200;

/** The queue track, and the twelve slots a chip can stand in. */
const QUEUE_X = 140;
const QUEUE_W = 800;
const QUEUE_TOP = 1140;
const QUEUE_H = 80;
export const SLOT_COUNT = 12;
const SLOT_FIRST = 196;
const SLOT_GAP = 62;
/** Centre x of queue slot `index`. */
export const slotX = (index: number): number => SLOT_FIRST + SLOT_GAP * index;
/** y a chip rests at in the queue, and the row it is dropped in from. */
export const Y_QUEUE = 1180;
export const Y_DROP = 1090;
/** Where a chip is born, which is the request it was made from. */
export const X_BORN = X_WORK;
export const Y_BORN = Y_WEB;

/** The four workers. */
const WORKER_LEFT = [130, 315, 500, 685];
const WORKER_W = 166;
const WORKER_TOP = 1500;
const WORKER_H = 240;
/** Centre of each worker box, which is also the lane a chip rides into it. */
export const WORKER_X = WORKER_LEFT.map((left) => left + WORKER_W / 2);
/** y a chip turns onto a worker lane, and y it rests at inside the worker. */
export const Y_FAN = 1360;
export const Y_WORK = 1590;
/** Full width of a worker's progress bar. */
export const BAR_W = 124;
const BAR_Y = 1644;

/** The dead-letter queue, and the route a dead job takes to reach it. */
const DLQ_X = 690;
const DLQ_W = 260;
const DLQ_TOP = 1790;
/** The row a dead job crosses on, above the worker boxes. */
export const Y_ABOVE = 1440;
/** The column it drops in, which is clear of the last worker box. */
export const DLQ_DROP_X = 900;
export const Y_DLQ = 1840;

/** Half-size of a job chip, which every clearance above is measured against. */
export const CHIP_W = 44;
export const CHIP_H = 40;

/**
 * The job chips, in the order the simulation hands them out: four for step 2,
 * then twelve for the burst step 3 and step 4 share. Numbering restarts with
 * the step because each step starts from an empty queue, so the reader never
 * has to hold a running total.
 */
export const JOB_LABELS = [
  ...Array.from({ length: 4 }, (_value, n) => `#${n + 1}`),
  ...Array.from({ length: 12 }, (_value, n) => `#${n + 1}`),
];

/** What every `data-*` on the stage starts at, keyed by the target the timeline
 * addresses it through. The markup below is written from this, so a change that
 * writes a value something already holds can be dropped rather than tweened. */
export const STAGE_STATE: Record<string, string> = {
  'stage@data-depth': '0',
  'stage@data-busy': 'ok',
  'stage@data-scale': 'off',
  'stage@data-dlq': 'off',
  'worker-1@data-worker': 'off',
  'worker-2@data-worker': 'off',
  'worker-3@data-worker': 'absent',
  'worker-4@data-worker': 'absent',
};

const busy = `<text class="scene-caption-label" x="700" y="918" text-anchor="end">busy</text>
    ${trackAndFill({
      x: BUSY_X,
      y: 906,
      width: BUSY_W,
      height: 14,
      rx: 7,
      className: 'wqw-busy',
    })}`;

const depth = counterVariants({
  x: 940,
  y: 1266,
  className: 'wqw-depth',
  max: SLOT_COUNT,
  anchor: 'end',
  format: (n) => `depth ${n}`,
});

/** One worker: its lane in from the queue, its progress bar, and its name. */
const worker = (index: number): string => {
  const left = WORKER_LEFT[index] ?? 0;
  const centre = WORKER_X[index] ?? 0;
  return serviceBox({
    x: left,
    width: WORKER_W,
    y: WORKER_TOP,
    height: WORKER_H,
    title: `Worker ${index + 1}`,
    titleX: left + 18,
    titleY: 1712,
    titleClass: 'wqw-worker-label',
    titleAnchor: null,
    className: `wqw-worker wqw-worker--${index + 1}`,
    attrs: ` data-worker="${index < 2 ? 'off' : 'absent'}"`,
    boxClass: 'scene-box wqw-worker-box',
    children: `
    ${trackAndFill({
      x: centre - BAR_W / 2,
      y: BAR_Y,
      width: BAR_W,
      height: 14,
      rx: 7,
      className: 'wqw-bar',
    })}`,
  });
};

/** One job chip. It is drawn on the origin and carried by the timeline. */
const chip = (label: string, index: number): string =>
  `<g class="wqw-chip wqw-chip--${index + 1}" data-chip="queued">
      <rect class="wqw-chip-bg" x="${-CHIP_W / 2}" y="${-CHIP_H / 2}" width="${CHIP_W}" height="${CHIP_H}" rx="12" />
      <text class="scene-mono wqw-chip-text" x="0" y="7" text-anchor="middle">${label}</text>
    </g>`;

const lanes = WORKER_X.map((x) => verticalLink(x, QUEUE_TOP + QUEUE_H, WORKER_TOP)).join('\n  ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" data-depth="0" data-busy="ok" data-scale="off" data-dlq="off" aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_WORK, 680, 860)}
  ${verticalLink(X_STATUS, 680, 860, 'scene-link wqw-status-link')}
  ${verticalLink(X_WORK, 1060, QUEUE_TOP)}
  ${lanes}

  ${clientBox({ title: 'Client', titleY: 512 })}

  ${nodeFrame({
    y: 860,
    height: 200,
    label: 'Web',
    labelY: 916,
    children: `    ${busy}`,
  })}

  <text class="scene-node-label wqw-queue-label" x="126" y="1192" text-anchor="end">Queue</text>
  <rect class="scene-track wqw-queue-track" x="${QUEUE_X}" y="${QUEUE_TOP}" width="${QUEUE_W}" height="${QUEUE_H}" rx="24" />
  ${depth}

  ${worker(0)}

  ${worker(1)}

  ${worker(2)}

  ${worker(3)}

  <text class="scene-flash wqw-scale" x="650" y="1776" text-anchor="end">scale out</text>

  ${serviceBox({
    x: DLQ_X,
    width: DLQ_W,
    y: DLQ_TOP,
    height: 100,
    title: 'DLQ',
    titleX: DLQ_X + 26,
    titleY: 1852,
    titleClass: 'wqw-dlq-label',
    titleAnchor: null,
    className: 'wqw-dlq',
    boxClass: 'scene-box wqw-dlq-box',
  })}

  <g class="wqw-jobs">
    ${JOB_LABELS.map(chip).join('\n    ')}
  </g>

  ${requestsLayer()}
</svg>`;
