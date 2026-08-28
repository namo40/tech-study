/**
 * Static stage markup for the Workflow Engine scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Three boxes, stacked in the order
 * the argument is made — something wakes the work, something keeps its place,
 * something actually does it:
 *   - y 0..440       kept empty for the step title card
 *   - y 440..680     Schedule: the clock card `daily 02:00`, the `due` lamp it
 *                    lights when the hour comes round, and the `next run` lamp
 *                    it lights again once an instance has closed
 *   - y 880..1270    Engine: the step strip `1 2 3 4`, each cell carrying the
 *                    one word that says where that step stands; the `history`
 *                    card, which is the only thing here that survives a crash;
 *                    the `attempt n` readout and the `approve` chip
 *   - y 1500..1740   Work: the plate a step's side effect runs on, and `done n`
 *
 * Two lanes and no others, both at x 540, both axis aligned, both running
 * through the centre of the boxes they join. `Y_SCHEDULE`..`Y_ENGINE` carries
 * the two signals that come from outside the engine — the start the schedule
 * sends and the approval a person sends — and it only ever runs downwards.
 * `Y_ENGINE_BOTTOM`..`Y_WORK` carries one execution at a time, down and back
 * up, which is why a step's result and the step itself are never two separate
 * travellers.
 *
 * A traveller sweeps 26px around every point it reaches and a label keeps 30px
 * clear of that, so the two lanes own two keep-outs: x 484..596 from y 624 to
 * y 936, and x 484..596 from y 1214 to y 1556. That is what decides the layout.
 * The Schedule writes its name and all three of its plates above y 606, clear
 * of the first keep-out, which starts at y 624. The Engine puts the strip in
 * the band between the two keep-outs, keeps the `history` card left of x 484,
 * and keeps `attempt n` and the `approve` chip entirely right of x 596. The
 * Work box names itself left of x 484 and writes everything else below y 1556.
 *
 * The four step cells and the four history lines are declared texture rows.
 * A history line carries no number because it does not need one: lines are
 * written in order and never rewritten, so line n is step n by construction,
 * and the only things that read the card are how many lines it holds — which
 * is what a restarted engine replays — and the fact that it is still there
 * when the engine is not.
 */

import {
  VIEWBOX,
  chip,
  clientBox,
  counterVariants,
  requestsLayer,
  serviceBox,
  verticalLink,
} from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- geometry --------------------------------------------------------------

/** The signal lane: the Schedule's centre column, down into the Engine. */
export const X_LANE = 540;
export const Y_SCHEDULE = 680;
export const Y_ENGINE = 880;

/** The execution lane: the Engine's centre column, down to the Work and back. */
export const Y_ENGINE_BOTTOM = 1270;
export const Y_WORK = 1500;

/** The Schedule band. */
const SCHEDULE = { x: 130, y: 440, w: 820, h: 240 };
const SCHEDULE_TITLE_X = 170;
const SCHEDULE_TITLE_Y = 505;
const CLOCK_CARD = { x: 170, y: 540, w: 300, h: 66 };
const DUE_CHIP = { x: 500, y: 540, w: 130, h: 66 };
const NEXT_CHIP = { x: 660, y: 540, w: 250, h: 66 };
const SCHEDULE_TEXT_Y = 585;

/** The Engine band. */
const ENGINE = { x: 130, y: 880, w: 820, h: 390 };
const ENGINE_LABEL_X = 170;
const ENGINE_LABEL_Y = 934;

/** The step strip: four cells, left to right, in the order they run. */
const CELL_X = 170;
const CELL_W = 168;
const CELL_PITCH = 190;
const CELL_Y = 970;
const CELL_H = 76;
/**
 * The number and the word share one baseline and sit side by side. Stacked,
 * a 36px number over a 24px word leaves them five pixels apart in a cell this
 * size, which is closer than anything else on the stage ever gets.
 */
const CELL_NUM_DX = 32;
const CELL_WORD_DX = 106;
const CELL_TEXT_Y = 1020;

/** The caret the replay puts under the cell it is reading. */
const CARET_Y = 1058;
const CARET_H = 8;
const CARET_W = 100;

/** The history card, and the lines that stack up inside it. */
const HISTORY_LABEL_X = 170;
const HISTORY_LABEL_Y = 1108;
const HISTORY_CARD = { x: 170, y: 1120, w: 300, h: 128 };
const LINE_X = 186;
const LINE_W = 268;
const LINE_H = 18;
const LINE_PITCH = 27;
const LINE_TOP = 1140;

/** The two things the Engine says about itself on the right. */
const ATTEMPT_X = 640;
const ATTEMPT_Y = 1150;
const APPROVE_CHIP = { x: 640, y: 1176, w: 240, h: 66 };
const APPROVE_TEXT_Y = 1219;

/** The Work band. */
const WORK = { x: 280, y: 1500, w: 520, h: 240 };
const WORK_TITLE_X = 310;
const WORK_TITLE_Y = 1580;
const PLATE = { x: 310, y: 1612, w: 200, h: 62 };
const DONE_X = 770;
const DONE_Y = 1660;

// --- what the stage can count to -------------------------------------------

/** Steps in the workflow, which is how many cells and lines are drawn. */
export const STEP_COUNT = 4;
/** Highest reading of the Work box's counter: every step, done once. */
export const MAX_DONE = 4;
/** How many attempts one step may take before the scene has outgrown itself. */
export const MAX_ATTEMPTS = 3;

/** Where a step stands. `pending` is the absence of news, so it says nothing. */
export const STEP_STATES = ['pending', 'running', 'done', 'failed', 'waiting'] as const;
export type StepState = (typeof STEP_STATES)[number];

/** The word a cell shows. `pending` has none, which is the point of it. */
export const STEP_WORDS: Record<StepState, string | null> = {
  pending: null,
  running: 'running',
  done: 'done',
  failed: 'failed',
  waiting: 'waiting',
};

/** A history line is written or it is not. Nothing ever rewrites one. */
export const LINE_STATES = ['none', 'on'] as const;
export type LineState = (typeof LINE_STATES)[number];

/** A lamp is either lit or it is not. */
export const LAMPS = ['off', 'on'] as const;
export type Lamp = (typeof LAMPS)[number];

/** Whether the engine is running, asleep with nothing held, or gone. */
export const ENGINE_STATES = ['up', 'idle', 'down'] as const;
export type EngineState = (typeof ENGINE_STATES)[number];

/** What the approval chip means: nothing yet, asked for, given. */
export const APPROVE_STATES = ['off', 'waiting', 'granted'] as const;
export type ApproveState = (typeof APPROVE_STATES)[number];

/** What the Work plate is doing with the step it was handed. */
export const WORK_STATES = ['idle', 'busy', 'failed'] as const;
export type WorkState = (typeof WORK_STATES)[number];

/** Which readout is being held up for a moment, and why. */
export const MARKS = ['off', 'work', 'history'] as const;
export type Mark = (typeof MARKS)[number];

/**
 * What every `data-*` on the stage starts at. The markup below is written from
 * these, so the first frame is the whole diagram in its opening state — a
 * schedule that has not fired, an engine with nothing running, an empty
 * history, no work done — and the timeline never has to restate it.
 */
export const STAGE_STATE: Record<string, string> = {
  'data-we-due': 'off',
  'data-we-next': 'on',
  'data-we-engine': 'up',
  'data-we-attempt': '0',
  'data-we-approve': 'off',
  'data-we-cursor': '0',
  'data-we-work': 'idle',
  'data-we-done': '0',
  'data-we-mark': 'off',
  'data-we-settled': 'off',
};

/** What every step cell starts at, and every history line, for the same reason. */
export const STEP_STATE: StepState = 'pending';
export const LINE_STATE: LineState = 'none';

// --- markup ----------------------------------------------------------------

/** Non-breaking spaces, so a monospaced label keeps its gaps in SVG. */
const mono = (text: string): string => text.replace(/ /g, '&#160;');

/**
 * A lamp with its own word written on it: one text element per state, stacked
 * on the same spot, with the widget class hiding all of them and the state
 * picking the one that shows. Nothing interpolates, so scrubbing backwards is
 * exact and neither theme has a colour to average.
 */
const lamp = (
  name: string,
  word: string,
  states: readonly string[],
  box: { x: number; y: number; w: number; h: number },
  textY: number,
  indent = 4,
): string => {
  const centre = box.x + box.w / 2;
  const text = states
    .map(
      (state) =>
        `<text class="scene-counter we-${name} we-${name}--${state}" x="${centre}" y="${textY}" text-anchor="middle">${word}</text>`,
    )
    .join(`\n${' '.repeat(indent + 2)}`);
  return chip({
    x: box.x,
    y: box.y,
    width: box.w,
    height: box.h,
    rx: 18,
    className: `we-chip-${name}`,
    variant: 'outline',
    text,
    indent,
  });
};

/** The clock the schedule is set by, which never changes and never moves. */
const clockCard = `<rect class="scene-chip-outline we-clock-bg" x="${CLOCK_CARD.x}" y="${CLOCK_CARD.y}" width="${CLOCK_CARD.w}" height="${CLOCK_CARD.h}" rx="18" />
    <text class="scene-mono we-clock-text" x="${CLOCK_CARD.x + CLOCK_CARD.w / 2}" y="${SCHEDULE_TEXT_Y}" text-anchor="middle">${mono('daily 02:00')}</text>`;

/** The centre of cell `n`, counting from one. */
const cellCentre = (n: number): number => CELL_X + (n - 1) * CELL_PITCH + CELL_W / 2;

/**
 * One cell of the step strip: its number, and the four words it can carry.
 * The state lives on the cell rather than on the stage, because four steps
 * stand in four different places at once and only the cell knows which.
 */
const cell = (n: number): string => {
  const left = CELL_X + (n - 1) * CELL_PITCH;
  const words = (['running', 'done', 'failed', 'waiting'] as const)
    .map(
      (state) =>
        `<text class="scene-counter we-word we-word--${state}" x="${left + CELL_WORD_DX}" y="${CELL_TEXT_Y}" text-anchor="middle">${STEP_WORDS[state]}</text>`,
    )
    .join('\n      ');
  return `<g class="we-cell we-cell--${n}" data-we-step="${STEP_STATE}">
      <rect class="we-cell-bg" x="${left}" y="${CELL_Y}" width="${CELL_W}" height="${CELL_H}" rx="20" />
      <text class="we-cell-n" x="${left + CELL_NUM_DX}" y="${CELL_TEXT_Y}" text-anchor="middle">${n}</text>
      ${words}
    </g>`;
};

/** The bar a replay puts under the cell it is asking the record about. */
const caret = (n: number): string =>
  `<rect class="we-caret we-caret--${n}" x="${cellCentre(n) - CARET_W / 2}" y="${CARET_Y}" width="${CARET_W}" height="${CARET_H}" rx="${CARET_H / 2}" />`;

/**
 * The record. One line per step the workflow will ever finish, drawn from the
 * top down because that is the direction it grows in, and carrying no name of
 * its own: what a line says is only that a step completed, and lines are
 * written in order, so the count is the whole message.
 */
const line = (n: number): string =>
  `<rect class="we-line we-line--${n}" data-we-line="${LINE_STATE}" x="${LINE_X}" y="${LINE_TOP + (n - 1) * LINE_PITCH}" width="${LINE_W}" height="${LINE_H}" rx="5" />`;

/**
 * How many times the engine has tried the step it is on. It is not there at
 * all on a first attempt, because "attempt 1" is not news.
 */
const attemptReadout = Array.from({ length: MAX_ATTEMPTS - 1 }, (_value, index) => index + 2)
  .map(
    (n) =>
      `<text class="scene-counter scene-mono we-attempt we-attempt--${n}" x="${ATTEMPT_X}" y="${ATTEMPT_Y}">${mono(`attempt ${n}`)}</text>`,
  )
  .join('\n    ');

/** How many steps the Work box has actually carried out. */
const doneReadout = counterVariants({
  x: DONE_X,
  y: DONE_Y,
  className: 'we-done',
  count: MAX_DONE + 1,
  anchor: 'end',
  format: (n) => mono(`done ${n}`),
  indent: 4,
});

const stageAttrs = Object.entries(STAGE_STATE)
  .map(([name, value]) => `${name}="${value}"`)
  .join(' ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageAttrs} aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_LANE, Y_SCHEDULE, Y_ENGINE, 'scene-link we-lane-signal')}
  ${verticalLink(X_LANE, Y_ENGINE_BOTTOM, Y_WORK, 'scene-link we-lane-work')}

  ${clientBox({
    x: SCHEDULE.x,
    width: SCHEDULE.w,
    y: SCHEDULE.y,
    height: SCHEDULE.h,
    title: 'Schedule',
    titleX: SCHEDULE_TITLE_X,
    titleY: SCHEDULE_TITLE_Y,
    titleAnchor: null,
    extraClass: 'we-schedule',
    children: `
    ${clockCard}

    ${lamp('due', 'due', LAMPS, DUE_CHIP, SCHEDULE_TEXT_Y)}

    ${lamp('next', 'next run', LAMPS, NEXT_CHIP, SCHEDULE_TEXT_Y)}`,
  })}

  ${serviceBox({
    x: ENGINE.x,
    width: ENGINE.w,
    y: ENGINE.y,
    height: ENGINE.h,
    title: 'Engine',
    titleX: ENGINE_LABEL_X,
    titleY: ENGINE_LABEL_Y,
    titleClass: 'scene-node-label we-engine-label',
    titleAnchor: null,
    className: 'scene-node we-engine',
    children: `
    ${cell(1)}

    ${cell(2)}

    ${cell(3)}

    ${cell(4)}

    ${caret(1)}
    ${caret(2)}
    ${caret(3)}
    ${caret(4)}

    <text class="scene-node-label we-history-label" x="${HISTORY_LABEL_X}" y="${HISTORY_LABEL_Y}">history</text>
    <rect class="we-history-bg" x="${HISTORY_CARD.x}" y="${HISTORY_CARD.y}" width="${HISTORY_CARD.w}" height="${HISTORY_CARD.h}" rx="20" />
    ${line(1)}
    ${line(2)}
    ${line(3)}
    ${line(4)}

    ${attemptReadout}

    ${lamp('approve', 'approve', APPROVE_STATES, APPROVE_CHIP, APPROVE_TEXT_Y)}`,
  })}

  ${serviceBox({
    x: WORK.x,
    width: WORK.w,
    y: WORK.y,
    height: WORK.h,
    title: 'Work',
    titleX: WORK_TITLE_X,
    titleY: WORK_TITLE_Y,
    titleAnchor: null,
    className: 'scene-service we-work',
    children: `
    <rect class="we-plate" x="${PLATE.x}" y="${PLATE.y}" width="${PLATE.w}" height="${PLATE.h}" rx="18" />

    ${doneReadout}`,
  })}

  ${requestsLayer()}
</svg>`;
