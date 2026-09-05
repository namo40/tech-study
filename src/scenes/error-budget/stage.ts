/**
 * Static stage markup for the Error Budget scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Three bands, one per party to the
 * argument about when to ship:
 *   - y 0..400       above the cropped viewBox (see shared VIEWBOX)
 *   - y 400..440     the frame's top padding; nothing is drawn here
 *   - y 440..680     Traffic: the measured good-rate, which is the SLI. It is
 *                    the only thing on this stage that is observed rather than
 *                    computed, and everything below it is arithmetic on it
 *   - y 880..1270    Budget: the promise (`SLO 99.9%`), the allowance that
 *                    promise buys (`43m` at the end of the gauge, because the
 *                    track *is* the month's failure), the gauge itself, and the
 *                    three numbers that read it — `left n%`, `burn ×n` and the
 *                    `day n/30` that says how much of the period is gone
 *   - y 1500..1740   Release: the gate the budget decides (`open`, `frozen`)
 *                    and `ship n`, how many releases this period has had
 *
 * One lane and no others: `X_LANE` at 540, from Traffic's bottom edge at 680 to
 * Budget's top edge at 880, downward only. Only failure travels it. A good
 * minute costs nothing and is drawn as nothing; a dot leaving Traffic is a
 * parcel of the month's allowance on its way to being spent, and it is absorbed
 * on the gauge that it takes from. The gate and the gauge are state rather than
 * travellers, because neither is a message: a gauge is a level, and a frozen
 * gate is a rule about what may leave, not a thing that moves.
 *
 * A traveller sweeps 26px around every point it reaches and a label keeps 30px
 * clear of that, so x 540 owns a 112px wide keep-out from y 624 to y 936.
 * Traffic therefore writes its readout above y 624 and Budget writes everything
 * below y 936.
 *
 * The line from Budget's bottom edge to Release's top edge is drawn quiet.
 * Nothing travels on it, because it is not a route: it says the gate reads the
 * budget, which is the whole reason a number can end an argument. It is still
 * honest geometry — vertical, through the centre of both boxes it joins, ending
 * on their edges.
 *
 * Declared texture: the gauge track and fill, the line at the end of the track,
 * and the two chip plates. The gauge is the one thing drawn as a quantity
 * rather than written as a word, because a budget running out is a picture
 * before it is a number.
 */

import {
  VIEWBOX,
  chip,
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

// --- geometry --------------------------------------------------------------

/** The one lane: failure leaving Traffic and landing on the Budget gauge. */
export const X_LANE = 540;
export const Y_TRAFFIC_BOTTOM = 680;
export const Y_BUDGET_TOP = 880;

/** The quiet line that says the gate reads the budget. */
const Y_BUDGET_BOTTOM = 1270;
const Y_RELEASE_TOP = 1500;

/** The Traffic band. */
const TRAFFIC = { x: 130, y: 440, w: 820, h: 240 };
const TRAFFIC_TITLE_X = 170;
const TRAFFIC_TITLE_Y = 505;
/** One row, above the lane's keep-out: the measured good-rate. */
const GOOD_X = 170;
const TRAFFIC_ROW_Y = 596;

/** The Budget band. */
const BUDGET = { y: 880, h: 390 };
const BUDGET_LABEL_Y = 940;

/** Row one: the promise, and how far into the period it is being kept. */
const SLO_CHIP = { x: 170, y: 977, w: 300, h: 66 };
const SLO_TEXT_Y = 1020;
const DAY_X = 930;
const BUDGET_ROW_1_Y = 1020;

/**
 * The gauge. The track is the month's allowance: its right edge is a budget
 * nobody has touched and its left edge is a budget that is gone, so "the gauge
 * is empty" and "the month's failure has all been spent" are the same picture.
 * The line on the right edge carries the figure the promise converts to.
 */
const GAUGE_X = 170;
export const GAUGE_W = 620;
const GAUGE_Y = 1080;
const GAUGE_H = 44;
const CAPACITY_X = GAUGE_X + GAUGE_W;
const CAPACITY_Y0 = 1068;
const CAPACITY_Y1 = 1136;
const CAPACITY_TEXT_X = 810;
const CAPACITY_TEXT_Y = 1113;

/** Row two: what is left of the allowance, and how fast it is going. */
const LEFT_X = 170;
const BURN_X = 560;
const BUDGET_ROW_2_Y = 1180;

/** The Release band. */
const RELEASE = { x: 280, y: 1500, w: 520, h: 240 };
const RELEASE_TITLE_Y = 1580;
const GATE_CHIP = { x: 320, y: 1616, w: 240, h: 66 };
const GATE_TEXT_Y = 1659;
const SHIP_X = 600;
const RELEASE_ROW_Y = 1659;

// --- what the stage can say about itself -----------------------------------

/**
 * The promise, as a share of requests that must succeed. Everything else on
 * this stage is arithmetic on this one number: the allowance is what it leaves
 * over, and the burn rate is the measured failure divided by it.
 */
export const SLO = 0.999;

/** Days in one budget period, and minutes in one day. */
export const PERIOD_DAYS = 30;
const MINUTES_PER_DAY = 1440;

/**
 * The allowance the promise buys, in minutes of failure a month, and how the
 * gauge writes it. 0.1% of 43,200 minutes is 43.2, which the label rounds down
 * the way a team would say it out loud.
 */
export const BUDGET_MINUTES = Number(((1 - SLO) * PERIOD_DAYS * MINUTES_PER_DAY).toFixed(1));
export const BUDGET_LABEL = '43m';

/**
 * The good-rate readout. An SLI is read against a promise with three nines in
 * it, so a tenth of a percent is a coarse reading and a hundredth is the one
 * that can tell 99.98% from 99.90%. It walks in hundredths from a perfect
 * 100.00% down to 98.00%, which is two whole percent below the promise and the
 * worst minute this traffic ever has.
 */
export const GOOD_STEP = 0.01;
export const GOOD_VARIANTS = 201;
export const goodText = (index: number): string => (100 - index * GOOD_STEP).toFixed(2);
export const goodIndex = (percent: number): number =>
  Math.max(0, Math.min(GOOD_VARIANTS - 1, Math.round((100 - percent) / GOOD_STEP)));

/** What is left of the allowance, in whole percent. */
export const LEFT_VARIANTS = 101;
export const leftIndex = (percent: number): number =>
  Math.max(0, Math.min(LEFT_VARIANTS - 1, Math.round(percent)));

/**
 * The rungs the burn readout rests on. A burn rate is a multiple, so the rungs
 * are spaced like one: ×1 is the pace that spends the whole allowance in
 * exactly one period, ×0.1 is a service nobody worries about, and ×20 is an
 * outage eating a month of failure in a day and a half.
 */
export const BURN_RUNGS = [0.1, 0.2, 0.3, 0.5, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 20] as const;

/** The rung a derived burn rate is written to: nearest in ratio, not in size. */
export const burnIndex = (rate: number): number => {
  const value = Math.max(BURN_RUNGS[0] as number, rate);
  let best = 0;
  let bestGap = Infinity;
  BURN_RUNGS.forEach((rung, index) => {
    const gap = Math.abs(Math.log(value / rung));
    if (gap < bestGap - 1e-9) {
      bestGap = gap;
      best = index;
    }
  });
  return best;
};

/** How a rung writes itself: whole multiples lose the decimal point. */
export const burnText = (rung: number): string =>
  Number.isInteger(rung) ? String(rung) : rung.toFixed(1);

/** The most releases one period is ever drawn with. */
export const SHIP_MAX = 8;

/**
 * How the gauge reads itself. Nothing here adds a word to the diagram: the
 * number under the gauge already says how much is left, and the colour says
 * which regime that leaves you in.
 */
export const LEVELS = ['healthy', 'warn', 'low'] as const;
export type Level = (typeof LEVELS)[number];

/** What the release gate is doing. It is open or it is not. */
export const GATES = ['open', 'frozen'] as const;
export type Gate = (typeof GATES)[number];

/** Whether the promise has been turned over to show the allowance behind it. */
export const FLIPS = ['off', 'on'] as const;
export type Flip = (typeof FLIPS)[number];

/** Whether the track is showing what the closing period spent. */
export const SUMMARIES = ['off', 'on'] as const;
export type Summary = (typeof SUMMARIES)[number];

/** How much of the gauge one percent of the allowance is worth. */
export const gaugeWidth = (leftPercent: number): number =>
  Number(((GAUGE_W * Math.max(0, Math.min(100, leftPercent))) / 100).toFixed(2));

/**
 * What every `data-*` on the stage starts at. The markup below is written from
 * these, so the first frame is the whole diagram in its opening state — a
 * service comfortably above its promise, a full budget on day one, an open
 * gate, nothing shipped yet — and the timeline never has to restate what is
 * already there.
 */
export const STAGE_STATE: Record<string, string> = {
  'data-eb-good': String(goodIndex(99.98)),
  'data-eb-left': '100',
  'data-eb-burn': String(burnIndex(0.2)),
  'data-eb-day': '1',
  'data-eb-ship': '0',
  'data-eb-gate': 'open',
  'data-eb-level': 'healthy',
  'data-eb-flip': 'off',
  'data-eb-summary': 'off',
};

// --- markup ----------------------------------------------------------------

/** Non-breaking spaces, so a monospaced label keeps its gaps in SVG. */
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
  format: (value: number, index: number) => string,
  suffix: (value: number, index: number) => string,
  anchor: string | null = null,
  indent = 4,
): string =>
  values
    .map(
      (value, index) =>
        `<text class="scene-counter ${className} ${className}--${suffix(value, index)}" x="${x}" y="${y}"${anchor ? ` text-anchor="${anchor}"` : ''}>${format(value, index)}</text>`,
    )
    .join(`\n${' '.repeat(indent)}`);

/**
 * A plate with one word per state stacked on it. Nothing interpolates, so
 * scrubbing backwards is exact and neither theme has a colour to average.
 */
const wordChip = (
  name: string,
  states: readonly string[],
  box: { x: number; y: number; w: number; h: number },
  textY: number,
  wordOf: (state: string) => string = (state) => state,
  indent = 4,
): string => {
  const centre = box.x + box.w / 2;
  const text = states
    .map(
      (state) =>
        `<text class="scene-counter eb-${name} eb-${name}--${state}" x="${centre}" y="${textY}" text-anchor="middle">${wordOf(state)}</text>`,
    )
    .join(`\n${' '.repeat(indent + 2)}`);
  return chip({
    x: box.x,
    y: box.y,
    width: box.w,
    height: box.h,
    rx: 18,
    className: `eb-chip-${name}`,
    variant: 'outline',
    text,
    indent,
  });
};

/** The measured good-rate: the one observed number on the stage. */
const goodReadout = counterVariants({
  x: GOOD_X,
  y: TRAFFIC_ROW_Y,
  className: 'eb-good',
  count: GOOD_VARIANTS,
  format: (n) => mono(`good ${goodText(n)}%`),
  indent: 4,
});

/** How far into the period the reader is. */
const dayReadout = ladderVariants(
  Array.from({ length: PERIOD_DAYS }, (_value, index) => index + 1),
  DAY_X,
  BUDGET_ROW_1_Y,
  'eb-day',
  (value) => mono(`day ${value}/${PERIOD_DAYS}`),
  (value) => String(value),
  'end',
);

/** What is left of the allowance, and how fast the rest is going. */
const leftReadout = counterVariants({
  x: LEFT_X,
  y: BUDGET_ROW_2_Y,
  className: 'eb-left',
  count: LEFT_VARIANTS,
  format: (n) => mono(`left ${n}%`),
  indent: 4,
});

const burnReadout = ladderVariants(
  BURN_RUNGS,
  BURN_X,
  BUDGET_ROW_2_Y,
  'eb-burn',
  (value) => mono(`burn ×${burnText(value)}`),
  (_value, index) => String(index),
);

/** How many releases this period has had. */
const shipReadout = counterVariants({
  x: SHIP_X,
  y: RELEASE_ROW_Y,
  className: 'eb-ship',
  count: SHIP_MAX + 1,
  format: (n) => mono(`ship ${n}`),
  indent: 4,
});

const stageAttrs = Object.entries(STAGE_STATE)
  .map(([name, value]) => `${name}="${value}"`)
  .join(' ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageAttrs} aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_LANE, Y_TRAFFIC_BOTTOM, Y_BUDGET_TOP, 'scene-link eb-lane')}
  ${verticalLink(X_LANE, Y_BUDGET_BOTTOM, Y_RELEASE_TOP, 'scene-link eb-reads')}

  ${clientBox({
    x: TRAFFIC.x,
    width: TRAFFIC.w,
    y: TRAFFIC.y,
    height: TRAFFIC.h,
    title: 'Traffic',
    titleX: TRAFFIC_TITLE_X,
    titleY: TRAFFIC_TITLE_Y,
    titleAnchor: null,
    extraClass: 'eb-traffic',
    children: `
    ${goodReadout}`,
  })}

  ${nodeFrame({
    y: BUDGET.y,
    height: BUDGET.h,
    label: 'Budget',
    labelY: BUDGET_LABEL_Y,
    children: `    ${wordChip('slo', ['set'], SLO_CHIP, SLO_TEXT_Y, () => mono('SLO 99.9%'))}

    ${dayReadout}

    ${trackAndFill({
      x: GAUGE_X,
      y: GAUGE_Y,
      width: GAUGE_W,
      height: GAUGE_H,
      rx: GAUGE_H / 2,
      className: 'eb-gauge',
      fillWidth: gaugeWidth(100),
      indent: 4,
    })}
    <line class="eb-capacity-line" x1="${CAPACITY_X}" y1="${CAPACITY_Y0}" x2="${CAPACITY_X}" y2="${CAPACITY_Y1}" />

    <text class="scene-counter eb-capacity eb-capacity--on" x="${CAPACITY_TEXT_X}" y="${CAPACITY_TEXT_Y}">${BUDGET_LABEL}</text>

    ${leftReadout}

    ${burnReadout}`,
  })}

  ${serviceBox({
    x: RELEASE.x,
    width: RELEASE.w,
    y: RELEASE.y,
    height: RELEASE.h,
    title: 'Release',
    titleY: RELEASE_TITLE_Y,
    className: 'scene-service eb-release',
    children: `
    ${wordChip('gate', GATES, GATE_CHIP, GATE_TEXT_Y)}

    ${shipReadout}`,
  })}

  ${requestsLayer()}
</svg>`;
