/**
 * Static stage markup for the Backpressure scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Three bands, one per party to the
 * bargain the scene is about:
 *   - y 0..440       kept empty for the step title card
 *   - y 440..680     Producer: the rate it is achieving, how many it may have
 *                    outstanding at once, and whether it is being made to wait
 *   - y 880..1270    Queue: the bounded buffer itself, eight cells wide, with
 *                    its depth written under it and the `full` badge beside its
 *                    name
 *   - y 1500..1740   Consumer: the rate it drains at, and whether it is taking
 *                    items one at a time or four at a time
 *
 * Two lanes and no others, both on x 540 and both downward. An item leaves the
 * Producer's bottom edge at `Y_PRODUCER` and is absorbed at the Queue's top
 * edge, `Y_QUEUE_TOP`; another leaves the Queue's bottom edge at
 * `Y_QUEUE_BOTTOM` and is absorbed at the Consumer's top edge, `Y_CONSUMER`.
 * Nothing ever travels upward: the push-back is a state, not a traveller. That
 * is the whole point of the diagram, and it is why the `full` badge sits on the
 * Queue and the `wait` chip sits on the Producer rather than a dot climbing
 * between them.
 *
 * A traveller sweeps 26px around every point it reaches and a label keeps 30px
 * clear of that, so x 540 owns a 112px wide keep-out from y 624 to y 936 and a
 * second from y 1214 to y 1556. The Producer therefore writes its readout row
 * above y 624; the Queue writes its name and the badge outside x 484..596, and
 * puts the cells and `depth n/8` between y 936 and y 1214; and the Consumer
 * writes its name below y 1556. The eight cells are a declared texture row: they
 * are squares rather than labels, and the only thing that ever reads them is the
 * count of how many are filled.
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

/** The one column everything travels on: the centre of all three boxes. */
export const X_LANE = 540;

/** Where an item leaves the Producer, and the Queue edge it is absorbed at. */
export const Y_PRODUCER = 680;
export const Y_QUEUE_TOP = 880;

/** Where an item leaves the Queue, and the Consumer edge it is absorbed at. */
export const Y_QUEUE_BOTTOM = 1270;
export const Y_CONSUMER = 1500;

/** The Producer band. */
const PRODUCER = { x: 130, y: 440, w: 820, h: 240 };
const PRODUCER_TITLE_Y = 512;
/** One row, above the lane's keep-out: rate, concurrency, and the wait lamp. */
const READOUT_Y = 596;
const IN_X = 190;
const ADMITS_X = 470;
const WAIT_CHIP = { x: 740, y: 560, w: 190, h: 54 };
const WAIT_TEXT_Y = 598;

/** The Queue band. */
const QUEUE_LABEL_Y = 938;
const FULL_CHIP = { x: 730, y: 902, w: 200, h: 56 };
const FULL_TEXT_Y = 940;

/** The bounded buffer: eight cells on one row, evenly pitched about x 540. */
export const CAPACITY = 8;
const CELL_SIDE = 76;
const CELL_PITCH = 88;
const CELL_Y = 1010;
const CELL_XS = Array.from(
  { length: CAPACITY },
  (_value, index) => X_LANE + (index - (CAPACITY - 1) / 2) * CELL_PITCH,
);
const DEPTH_Y = 1180;

/** The Consumer band. */
const CONSUMER = { x: 280, y: 1500, w: 520, h: 240 };
const CONSUMER_TITLE_Y = 1606;
const CONSUMER_ROW_Y = 1698;
const OUT_X = 310;
const BATCH_CHIP = { x: 540, y: 1660, w: 150, h: 54 };
const BATCH_TEXT_Y = 1698;
const TIMES_X = 712;

// --- the words the stage can say ------------------------------------------

/**
 * The rungs the Producer's rate meter rests on. It says 60 while the spike is
 * running and the buffer still has room, 20 when the Producer is being paced by
 * the Consumer, and 0 when the bounded buffer has stopped it altogether.
 */
export const IN_RATES = [0, 20, 60] as const;

/** What the Consumer drains at: one at a time, or four at a time. */
export const OUT_RATES = [20, 40] as const;

/** A lamp is either lit or it is not. */
export const LAMPS = ['off', 'on'] as const;
export type Lamp = (typeof LAMPS)[number];

/**
 * What every `data-*` on the stage starts at. The markup below is written from
 * these, so the first frame is the whole diagram in its opening state and the
 * timeline never has to restate what is already there.
 */
export const STAGE_STATE: Record<string, string> = {
  'data-in': '20',
  'data-out': '20',
  'data-depth': '0',
  'data-admits': '8',
  'data-wait': 'off',
  'data-full': 'off',
  'data-batch': 'off',
};

// --- markup ----------------------------------------------------------------

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
  anchor: string | null = null,
  indent = 4,
): string =>
  values
    .map(
      (value) =>
        `<text class="scene-counter ${className} ${className}--${value}" x="${x}" y="${y}"${
          anchor ? ` text-anchor="${anchor}"` : ''
        }>${format(value)}</text>`,
    )
    .join(`\n${' '.repeat(indent)}`);

/** The rate the Producer is getting items away at. */
const inReadout = ladderVariants(
  IN_RATES,
  IN_X,
  READOUT_Y,
  'bp-in',
  (value) => `in ${value}/s`,
);

/** How many items the Producer may have outstanding at once. */
const admitsReadout = counterVariants({
  x: ADMITS_X,
  y: READOUT_Y,
  className: 'bp-admits',
  count: CAPACITY + 1,
  format: (n) => `admits ${n}`,
  indent: 4,
});

/** A lamp with its own word written on it, unlit in grey and lit in colour. */
const lamp = (
  name: string,
  word: string,
  box: { x: number; y: number; w: number; h: number },
  textY: number,
  indent = 4,
): string => {
  const centre = box.x + box.w / 2;
  const text = LAMPS.map(
    (state) =>
      `<text class="scene-counter bp-${name} bp-${name}--${state}" x="${centre}" y="${textY}" text-anchor="middle">${word}</text>`,
  ).join(`\n${' '.repeat(indent + 2)}`);
  return chip({
    x: box.x,
    y: box.y,
    width: box.w,
    height: box.h,
    rx: 18,
    className: `bp-chip-${name}`,
    variant: 'outline',
    text,
    indent,
  });
};

/** The bounded buffer. One square per cell, filled from the left. */
const cells = CELL_XS.map(
  (x, index) =>
    `<rect class="scene-slot bp-cell bp-cell--${index + 1}" x="${x - CELL_SIDE / 2}" y="${CELL_Y}" width="${CELL_SIDE}" height="${CELL_SIDE}" rx="16" />`,
).join('\n    ');

/** How much of the buffer is in use, out of all of it. */
const depthReadout = counterVariants({
  x: X_LANE,
  y: DEPTH_Y,
  className: 'bp-depth',
  count: CAPACITY + 1,
  anchor: 'middle',
  format: (n) => `depth ${n}/${CAPACITY}`,
  indent: 4,
});

/** The rate the Consumer drains at. */
const outReadout = ladderVariants(
  OUT_RATES,
  OUT_X,
  CONSUMER_ROW_Y,
  'bp-out',
  (value) => `out ${value}/s`,
);

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" data-in="${STAGE_STATE['data-in']}" data-out="${STAGE_STATE['data-out']}" data-depth="${STAGE_STATE['data-depth']}" data-admits="${STAGE_STATE['data-admits']}" data-wait="${STAGE_STATE['data-wait']}" data-full="${STAGE_STATE['data-full']}" data-batch="${STAGE_STATE['data-batch']}" aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_LANE, Y_PRODUCER, Y_QUEUE_TOP, 'scene-link bp-lane-in')}
  ${verticalLink(X_LANE, Y_QUEUE_BOTTOM, Y_CONSUMER, 'scene-link bp-lane-out')}

  ${clientBox({
    x: PRODUCER.x,
    width: PRODUCER.w,
    y: PRODUCER.y,
    height: PRODUCER.h,
    title: 'Producer',
    titleY: PRODUCER_TITLE_Y,
    extraClass: 'bp-producer',
    children: `
    ${inReadout}

    ${admitsReadout}

    ${lamp('wait', 'wait', WAIT_CHIP, WAIT_TEXT_Y)}`,
  })}

  ${nodeFrame({
    label: 'Queue',
    labelY: QUEUE_LABEL_Y,
    children: `    ${lamp('full', 'full', FULL_CHIP, FULL_TEXT_Y)}

    ${cells}

    ${depthReadout}`,
  })}

  ${serviceBox({
    x: CONSUMER.x,
    width: CONSUMER.w,
    y: CONSUMER.y,
    height: CONSUMER.h,
    title: 'Consumer',
    titleY: CONSUMER_TITLE_Y,
    className: 'scene-service bp-consumer',
    children: `
    ${outReadout}

    ${lamp('batch', 'batch', BATCH_CHIP, BATCH_TEXT_Y)}

    <text class="scene-flash bp-times" x="${TIMES_X}" y="${CONSUMER_ROW_Y}">&#215; 4</text>`,
  })}

  ${requestsLayer()}
</svg>`;
