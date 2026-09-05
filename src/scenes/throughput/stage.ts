/**
 * Static stage markup for the Throughput scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Three bands, one per place a
 * capacity conversation actually happens:
 *   - y 0..400       above the cropped viewBox (see shared VIEWBOX)
 *   - y 400..440     the frame's top padding; nothing is drawn here
 *   - y 440..680     Arrivals: the gauge that says how hard work is coming in,
 *                    with the ceiling line drawn on it at the rate the Server
 *                    can retire, plus the `in n/s` reading
 *   - y 880..1270    Server: the slot row that is the concurrency actually
 *                    being paid for, `busy n%` beside it, the queue-cell row
 *                    that is saturation itself, and `queue n` under it
 *   - y 1500..1740   Done: `out n/s`, which is throughput, and `wait n`, which
 *                    is the milliseconds the back of the line is standing there
 *
 * Two lanes and no others, both on x 540 and both downward: one from the
 * Arrivals' bottom edge at `Y_ARRIVALS_BOTTOM` to the Server's top edge at
 * `Y_SERVER_TOP`, and one from the Server's bottom edge at `Y_SERVER_BOTTOM` to
 * the Done box's top edge at `Y_DONE_TOP`. The dots on them are samples of the
 * two rates the stage reports: one dot is `DOT_ITEMS` units of work, so the
 * cadence on a lane is exactly the number written beside it divided by that.
 * Nothing travels upward, because nothing here is an answer coming back.
 *
 * A traveller sweeps 26px around every point it reaches and a label keeps 30px
 * clear of that, so x 540 owns a 112px wide keep-out from y 624 to y 936 and a
 * second from y 1214 to y 1556. The Arrivals band therefore writes everything
 * above y 624, the Server everything between y 936 and y 1214, and the Done box
 * everything below y 1556 inside that column.
 *
 * Declared texture: the arrival gauge (track, fill and the three ceiling lines),
 * the six slot squares and the six queue cells. Everything else is a word, and
 * every word is one of the eight fixed labels.
 *
 * Three states have to stay apart on this stage and none of them is told apart
 * by colour alone. A **slot** is either not there at all (the configuration is
 * narrower than the row), there and idle (a hollow square), or there and busy (a
 * filled one). A **queue cell** is a hollow square or a filled one, and the row
 * only exists once there is a Server to queue for. And the two **ghost**
 * configurations of the first step are drawn dashed, in a colour the live stage
 * never uses, so four slots at 400 ms cannot be mistaken for the four the
 * running Server actually has.
 *
 * Every value the reader can read is a stack of text elements on one spot with
 * the widget class hiding all of them and the current `data-*` revealing one, so
 * nothing is interpolated and scrubbing backwards lands on the value rather than
 * on an average of two. The gauge fill is the one continuous quantity, because
 * an arrival rate approaching a ceiling is a picture before it is a number.
 */

import {
  VIEWBOX,
  clientBox,
  nodeFrame,
  requestsLayer,
  serviceBox,
  verticalLink,
} from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- geometry --------------------------------------------------------------

/** The one column everything travels on: the centre of all three boxes. */
export const X_LANE = 540;

/** Where a request leaves Arrivals, and the Server edge it is absorbed at. */
export const Y_ARRIVALS_BOTTOM = 680;
export const Y_SERVER_TOP = 880;

/** Where a completion leaves the Server, and the Done edge it lands on. */
export const Y_SERVER_BOTTOM = 1270;
export const Y_DONE_TOP = 1500;

/** The Arrivals band. */
const ARRIVALS = { x: 130, y: 440, w: 820, h: 240 };
const ARRIVALS_TITLE_X = 170;
const ARRIVALS_TITLE_Y = 512;

/**
 * The gauge. The track is every arrival rate the stage can draw, from nothing
 * at the left edge to `IN_MAX` at the right, and the ceiling line sits at
 * whatever the Server can currently retire. "The fill passes the line" and "the
 * queue starts growing" are therefore the same event rather than two things
 * drawn near each other.
 */
const GAUGE_X = 170;
const GAUGE_W = 420;
const GAUGE_Y = 556;
const GAUGE_H = 40;
const CEIL_Y0 = 542;
const CEIL_Y1 = 610;
const IN_X = 640;
const ARRIVALS_ROW_Y = 590;

/** The Server band. */
const SERVER = { y: 880, h: 390 };
const SERVER_LABEL_Y = 940;

/** The slot row: how wide the Server is, drawn as squares rather than a number. */
export const SLOT_MAX = 6;
const SLOT_SIDE = 76;
const SLOT_PITCH = 96;
const SLOT_Y = 968;

/** The queue: one cell per unit of work standing in line. */
export const QUEUE_MAX = 6;
const CELL_SIDE = 56;
const CELL_PITCH = 68;
const CELL_Y = 1136;

const SERVER_ROW_Y = 1108;
const BUSY_X = 170;
const QUEUE_X = 660;

/** The Done band. */
const DONE = { x: 280, y: 1500, w: 520, h: 240 };
const DONE_TITLE_X = 310;
const DONE_TITLE_Y = 1572;
const OUT_X = 310;
const OUT_Y = 1652;
const WAIT_X = 310;
const WAIT_Y = 1714;

/** The centre x of slot `index`, counting from zero, about the lane. */
const slotX = (index: number): number =>
  X_LANE + (index - (SLOT_MAX - 1) / 2) * SLOT_PITCH;

/** The centre x of queue cell `index`, counting from zero. */
const cellX = (index: number): number =>
  X_LANE + (index - (QUEUE_MAX - 1) / 2) * CELL_PITCH;

// --- what the stage can say about itself -----------------------------------

/**
 * Units of work one traveller stands for, and one queue cell holds. The two are
 * the same number on purpose: a dot on a lane and a cell in the line are the
 * same amount of work seen at two moments of its life, which is what lets `in`,
 * `out` and `queue` be read against each other without a conversion.
 */
export const DOT_ITEMS = 12;

/** The widest arrival rate the gauge draws, which is also the widest capacity. */
export const IN_MAX = 60;

/** How much of the gauge one unit per second is worth. */
export const gaugeWidth = (rate: number): number =>
  Number(((GAUGE_W * Math.max(0, Math.min(rate, IN_MAX))) / IN_MAX).toFixed(2));

/**
 * The rungs the two rate readouts rest on. They are not a run of integers: they
 * are the rates this scene actually visits, which are the ones the ceiling and
 * the two utilization marks put there — 40% and 80% of a four-slot Server, its
 * ceiling, 80% of the widened one, and the surge that goes over the top.
 */
export const RATES = [10, 16, 32, 40, 48, 60] as const;

/** How busy the Server is, as the share of its capacity that is in use. */
export const BUSY_LEVELS = [25, 40, 80, 100] as const;

/**
 * What the back of the line is waiting, in milliseconds. The model works the
 * figure out from the queue and the rate it is being retired at; the readout
 * draws the nearest rung, which is what keeps a derived number to a small set
 * of authored values.
 */
export const WAIT_LEVELS = [0, 300, 400, 600, 800, 900, 1200, 1500] as const;

/** Every capacity the ceiling line can be drawn at. */
export const CAPACITIES = [10, 40, 60] as const;

/**
 * The world of the first step: two ways of building a Server that finish the
 * same amount of work per second. `a` is one worker at 100 ms a job, `b` is four
 * at 400 ms. Both are drawn dashed and in a colour the running stage never uses,
 * so neither can be mistaken for the Server the rest of the scene is about.
 */
export const GHOSTS = ['off', 'a', 'b'] as const;
export type Ghost = (typeof GHOSTS)[number];

/** What the scene is holding up for a moment, drawn on the band it is about. */
export const MARKS = ['none', 'axes', 'headroom', 'ceiling', 'behind', 'bottleneck'] as const;
export type Mark = (typeof MARKS)[number];

/** Whether the run is over and the picture is the one to remember. */
export const FLAGS = ['off', 'on'] as const;
export type Flag = (typeof FLAGS)[number];

/**
 * What every `data-*` on the stage starts at. The markup below is written from
 * these, so the first frame is the whole diagram in its opening state — a
 * four-slot Server a quarter busy, an empty line, everything that arrives
 * leaving again — and the timeline never restates a value that is already there.
 */
export const STAGE_STATE: Record<string, string> = {
  'data-tput-in': '10',
  'data-tput-busy': '25',
  'data-tput-queue': '0',
  'data-tput-out': '10',
  'data-tput-wait': '0',
  'data-tput-slots': '4',
  'data-tput-active': '1',
  'data-tput-cap': '40',
  'data-tput-ghost': 'off',
  'data-tput-mark': 'none',
  'data-tput-settled': 'off',
};

// --- markup ----------------------------------------------------------------

/** Newline plus `n` spaces, the separator between lines of one fragment. */
const pad = (n: number): string => `\n${' '.repeat(n)}`;

/** Non-breaking spaces, so a monospaced readout keeps its gaps in SVG. */
const mono = (text: string): string => text.replace(/ /g, '&#160;');

/**
 * A readout whose values are a ladder rather than a run of integers. Like every
 * other counter it is one text element per value stacked on one spot, with the
 * widget class hiding all of them and the state picking the one that shows.
 */
const ladderVariants = (
  values: readonly number[],
  x: number,
  y: number,
  className: string,
  format: (value: number) => string,
  indent = 4,
): string =>
  values
    .map(
      (value) =>
        `<text class="scene-counter scene-mono ${className} ${className}--${value}" x="${x}" y="${y}">${format(value)}</text>`,
    )
    .join(pad(indent));

/** The rate work is arriving at. */
const inReadout = ladderVariants(RATES, IN_X, ARRIVALS_ROW_Y, 'tput-in', (value) =>
  mono(`in ${value}/s`),
);

/** How much of the Server's capacity is in use. */
const busyReadout = ladderVariants(BUSY_LEVELS, BUSY_X, SERVER_ROW_Y, 'tput-busy', (value) =>
  mono(`busy ${value}%`),
);

/** How many units of work are standing in line. */
const queueReadout = ladderVariants(
  Array.from({ length: QUEUE_MAX + 1 }, (_value, n) => n),
  QUEUE_X,
  SERVER_ROW_Y,
  'tput-queue',
  (value) => mono(`queue ${value}`),
);

/** The rate work is finishing at, which is the whole point of the scene. */
const outReadout = ladderVariants(RATES, OUT_X, OUT_Y, 'tput-out', (value) =>
  mono(`out ${value}/s`),
);

/** What the back of the line is waiting. */
const waitReadout = ladderVariants(WAIT_LEVELS, WAIT_X, WAIT_Y, 'tput-wait', (value) =>
  mono(`wait ${value}`),
);

/** The ceiling, drawn on the gauge at the rate the Server can retire. */
const ceilingLines = CAPACITIES.map(
  (value) =>
    `<line class="tput-ceil tput-ceil--${value}" x1="${GAUGE_X + gaugeWidth(value)}" y1="${CEIL_Y0}" x2="${GAUGE_X + gaugeWidth(value)}" y2="${CEIL_Y1}" />`,
).join(pad(4));

/** The Server's width, one square per slot it is paying for. */
const slots = Array.from({ length: SLOT_MAX }, (_value, index) => index)
  .map(
    (index) =>
      `<rect class="scene-slot tput-slot tput-slot--${index + 1}" x="${slotX(index) - SLOT_SIDE / 2}" y="${SLOT_Y}" width="${SLOT_SIDE}" height="${SLOT_SIDE}" rx="16" />`,
  )
  .join(pad(4));

/** The line, one cell per unit of work waiting to be started. */
const cells = Array.from({ length: QUEUE_MAX }, (_value, index) => index)
  .map(
    (index) =>
      `<rect class="scene-slot tput-cell tput-cell--${index + 1}" x="${cellX(index) - CELL_SIDE / 2}" y="${CELL_Y}" width="${CELL_SIDE}" height="${CELL_SIDE}" rx="12" />`,
  )
  .join(pad(4));

const stageAttrs = Object.entries(STAGE_STATE)
  .map(([name, value]) => `${name}="${value}"`)
  .join(' ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageAttrs} aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_LANE, Y_ARRIVALS_BOTTOM, Y_SERVER_TOP, 'scene-link tput-lane-in')}
  ${verticalLink(X_LANE, Y_SERVER_BOTTOM, Y_DONE_TOP, 'scene-link tput-lane-out')}

  ${clientBox({
    x: ARRIVALS.x,
    width: ARRIVALS.w,
    y: ARRIVALS.y,
    height: ARRIVALS.h,
    title: 'Arrivals',
    titleX: ARRIVALS_TITLE_X,
    titleY: ARRIVALS_TITLE_Y,
    titleAnchor: null,
    extraClass: 'tput-arrivals',
    children: `
    <rect class="scene-track tput-gauge-track" x="${GAUGE_X}" y="${GAUGE_Y}" width="${GAUGE_W}" height="${GAUGE_H}" rx="${GAUGE_H / 2}" />
    <rect class="scene-fill tput-gauge-fill" x="${GAUGE_X}" y="${GAUGE_Y}" width="${gaugeWidth(Number(STAGE_STATE['data-tput-in']))}" height="${GAUGE_H}" rx="${GAUGE_H / 2}" />

    ${ceilingLines}

    ${inReadout}`,
  })}

  ${nodeFrame({
    y: SERVER.y,
    height: SERVER.h,
    label: 'Server',
    labelY: SERVER_LABEL_Y,
    children: `    ${slots}

    ${busyReadout}

    ${queueReadout}

    ${cells}`,
  })}

  ${serviceBox({
    x: DONE.x,
    width: DONE.w,
    y: DONE.y,
    height: DONE.h,
    title: 'Done',
    titleX: DONE_TITLE_X,
    titleY: DONE_TITLE_Y,
    titleAnchor: null,
    className: 'scene-service tput-done',
    children: `
    ${outReadout}

    ${waitReadout}`,
  })}

  ${requestsLayer()}
</svg>`;
