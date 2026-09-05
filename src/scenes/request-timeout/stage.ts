/**
 * Static stage markup for the Request Timeout scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. The bands are the usual ones, with
 * the bottom one split in two because a request timeout is only interesting
 * when the caller has more than one dependency to bound:
 *   - y 0..400      above the cropped viewBox (see shared VIEWBOX)
 *   - y 400..440    the frame's top padding; nothing is drawn here
 *   - y 440..680    Client box, and under it the meter that measures how long
 *                   the person in front of the screen has been waiting
 *   - y 880..1270   Service node: the threads it is holding, the deadline the
 *                   request is running on, and the three ceilings it applies
 *   - y 1500..1740  DB on the left and HTTP on the right, each with the bar
 *                   that says how far the dependency has got with its work
 *
 * One lane decides where every label may sit. A request leaves the Client on
 * `X_LANE`, stops in the Service at `Y_SERVICE`, rides down to `Y_FORK` — which
 * is below the node, so the sideways move never crosses a row — and then takes
 * `X_DB` or `X_HTTP` down into a box. A request carries what it knows above the
 * dot (`LABEL_DY`), so the widest thing that travels a lane is 51px either side
 * of the lane plus the 26px halo. Everything else is written into a column that
 * ends at least 30px short of that: the node keeps its content left of x 390 or
 * right of x 630, and each bottom box keeps its content in the left half.
 *
 * The two bottom boxes are drawn by the same call, so a database that answers
 * and an HTTP service that hangs are told apart by what the bar does rather
 * than by where it is.
 *
 * One millisecond means one thing everywhere on this stage: `MS` scene seconds.
 * Every ceiling below is written in milliseconds and turned into a duration, a
 * bar width, or a countdown through that one number.
 */

import {
  VIEWBOX,
  clientBox,
  nodeFrame,
  requestsLayer,
  serviceBox,
  slotRow,
  trackAndFill,
  verticalLink,
} from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

/**
 * Scene seconds per millisecond of simulated time. Every ceiling, every
 * deadline and every dependency's work is written in milliseconds and drawn
 * through this, so a limit that is twice as long looks twice as long.
 */
export const MS = 0.002;

/** The three ceilings the Service applies, in milliseconds. */
export const CONNECT_MS = 400;
export const ATTEMPT_MS = 500;
export const TOTAL_MS = 1500;
/** The budget one whole request gets, in milliseconds. */
export const BUDGET_MS = 800;

/**
 * How long the person waits before giving up, and how long that takes on
 * screen. Five seconds of patience is drawn over 4.5 scene seconds: at `MS` it
 * would be ten, which is most of the scene, and the meter measures a human
 * rather than a network.
 */
export const PATIENCE_LABEL = '5 s';
export const PATIENCE = 4.5;

/** The lane out of the client, and the lane down into each bottom box. */
export const X_LANE = 540;
export const X_DB = 430;
export const X_HTTP = 860;

/** Resting y in the client box, in the node, at the fork, and in a box. */
export const Y_CLIENT = 620;
export const Y_SERVICE = 1075;
export const Y_FORK = 1360;
export const Y_DEP = 1630;

/** How far above the dot a request carries what it knows. */
export const LABEL_DY = -56;

/** Threads the Service has to answer with. */
export const THREAD_COUNT = 3;
const SLOT_X = [197, 261, 325];
const SLOT_Y = 1020;
const SLOT_SIDE = 54;

/** The waiting meter under the client box. */
export const METER_X = 240;
export const METER_Y = 742;
export const METER_W = 210;

/** The deadline gauge in the node. */
export const GAUGE_X = 170;
export const GAUGE_Y = 1150;
export const GAUGE_W = 220;

/** A dependency's progress bar, drawn from the left inset of its box. */
export const BAR_Y = 1650;
export const BAR_W = 160;
export const BAR_DB_X = 180;
export const BAR_HTTP_X = 610;

/** The countdown the gauge is read with, in hundreds of milliseconds. */
const LEFT_STEPS = [800, 700, 600, 500, 400, 300, 200, 100, 0];
/** How far past the deadline the readout counts before the scene moves on. */
const OVER_STEPS = [100, 200, 300];

/**
 * What every `data-*` on the stage starts at, keyed by the target the timeline
 * addresses it through. The markup below is written from this, so a change that
 * writes a value something already holds is dropped rather than tweened.
 */
export const STAGE_STATE: Record<string, string> = {
  'stage@data-limits': 'off',
  'stage@data-limit': 'none',
  'stage@data-deadline': 'off',
  'stage@data-budget': 'off',
  'stage@data-wait': 'idle',
  'db@data-work': 'idle',
  'http@data-work': 'idle',
  ...Object.fromEntries(
    Array.from({ length: THREAD_COUNT }, (_value, index) => [
      `thread-${index}@data-slot-state`,
      'free',
    ]),
  ),
};

const stageState = Object.entries(STAGE_STATE)
  .filter(([key]) => key.startsWith('stage@'))
  .map(([key, value]) => `${key.slice('stage@'.length)}="${value}"`)
  .join(' ');

/**
 * The countdown next to the gauge. Like every counter on this site it is a
 * stack of text elements on one spot with CSS showing the one the current
 * `data-budget` names, so scrubbing backwards lands on the right number without
 * the timeline having to undo anything.
 */
const budgetReadout = [
  ...LEFT_STEPS.map(
    (ms) =>
      `<text class="scene-counter rq-budget rq-budget--${ms}" x="${GAUGE_X}" y="1212">left ${ms} ms</text>`,
  ),
  ...OVER_STEPS.map(
    (ms, index) =>
      `<text class="scene-counter rq-budget rq-budget--over${index + 1}" x="${GAUGE_X}" y="1212">over ${ms} ms</text>`,
  ),
].join('\n      ');

/** One of the three ceilings, which lights up on the frame it fires. */
const limit = (name: string, text: string, y: number): string =>
  `<text class="rq-limit rq-limit--${name}" x="630" y="${y}">${text}</text>`;

/** One bottom box: a title, what it is doing, and how far it has got. */
const dependency = (name: string, title: string, x: number, barX: number): string =>
  serviceBox({
    x,
    width: 350,
    title,
    titleX: x + 30,
    titleY: 1556,
    titleAnchor: 'start',
    className: `rq-dep rq-dep--${name}`,
    attrs: ' data-work="idle"',
    children: `
    <text class="rq-status rq-status--connecting" x="${barX}" y="1622">connecting</text>
    <text class="rq-status rq-status--stalled" x="${barX}" y="1622">no answer</text>
    <text class="rq-status rq-status--ghost" x="${barX}" y="1622">ghost work</text>
    <text class="rq-status rq-status--cancelled" x="${barX}" y="1622">cancelled</text>
    ${trackAndFill({
      x: barX,
      y: BAR_Y,
      width: BAR_W,
      height: 22,
      rx: 11,
      className: `rq-bar rq-bar--${name}`,
    })}`,
  });

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageState} aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_LANE, 680, 880)}
  ${verticalLink(X_LANE, 1270, Y_FORK)}
  <line class="scene-link" x1="${X_DB}" y1="${Y_FORK}" x2="${X_HTTP}" y2="${Y_FORK}" />
  ${verticalLink(X_DB, Y_FORK, 1500)}
  ${verticalLink(X_HTTP, Y_FORK, 1500)}

  ${clientBox({ title: 'Client', titleY: 505 })}

  <g class="rq-meter-group">
    <text class="scene-caption-label" x="${METER_X}" y="726">waiting</text>
    <text class="scene-caption-label" x="${METER_X + METER_W}" y="726" text-anchor="end">${PATIENCE_LABEL}</text>
    ${trackAndFill({
      x: METER_X,
      y: METER_Y,
      width: METER_W,
      height: 22,
      rx: 11,
      className: 'rq-meter',
    })}
    <text class="scene-flash rq-gaveup" x="${METER_X}" y="806">gave up</text>
  </g>

  ${nodeFrame({
    label: 'Service',
    labelY: 938,
    children: `    <text class="scene-caption-label" x="170" y="1000">threads</text>
    ${slotRow({
      xs: SLOT_X,
      y: SLOT_Y,
      side: SLOT_SIDE,
      rx: 14,
      className: 'rq-thread',
      initialState: 'free',
      attrName: 'data-slot-state',
    })}

    <g class="rq-gauge-group">
      <text class="scene-caption-label" x="${GAUGE_X}" y="1130">deadline ${BUDGET_MS} ms</text>
      ${trackAndFill({
        x: GAUGE_X,
        y: GAUGE_Y,
        width: GAUGE_W,
        height: 24,
        rx: 12,
        className: 'rq-gauge',
        fillWidth: GAUGE_W,
        indent: 6,
      })}
      ${budgetReadout}
    </g>

    ${limit('connect', `connect ${CONNECT_MS} ms`, 1000)}
    ${limit('attempt', `attempt ${ATTEMPT_MS} ms`, 1075)}
    ${limit('total', `total ${TOTAL_MS} ms`, 1150)}`,
  })}

  ${dependency('db', 'DB', 150, BAR_DB_X)}

  ${dependency('http', 'HTTP', 580, BAR_HTTP_X)}

  ${requestsLayer()}
</svg>`;
