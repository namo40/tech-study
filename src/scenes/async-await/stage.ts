/**
 * Static stage markup for the Async/Await scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. The bands are the usual ones, with
 * the allowed extension under the bottom box because the comparison the scene
 * ends on is a pair of measured bars rather than a widget inside a node:
 *   - y 0..440       kept empty for the step title card
 *   - y 440..680     the Caller: the Task it is holding, the catch it has
 *                    armed, the token it can cancel with, and a dot that says
 *                    it is still doing its own work while it waits
 *   - y 880..1270    the Method: four code rows and the cursor on the one that
 *                    is running
 *   - y 1330..1440   two thread lanes, T1 and T2
 *   - y 1500..1710   the I/O box: one bar per outstanding call
 *   - y 1740..1840   the two measured rows, sequential against concurrent
 *
 * One trunk and nothing else. It leaves the Caller at `X_LANE`, crosses the
 * empty band to the top edge of the Method, and continues from the Method's
 * bottom edge to the top edge of the I/O box. Both segments are vertical, both
 * end on a box edge, and neither passes through anything: the lanes stop at
 * x 740 and every row inside a box is written left of x 800.
 *
 * `X_LANE` is 860 rather than 540 because the Method is mostly text. A code row
 * needs about 550px to stay readable at 27px, so the trunk cannot run down the
 * middle of it; putting the trunk to the right of the code leaves the corridor
 * x 805..915 free for the whole height of the stage, which is the widest thing
 * a traveller carries (`cancelled`) plus its halo.
 *
 * One millisecond means one thing everywhere on this stage: `MS` scene seconds.
 * Every call below is written in milliseconds and turned into a duration, an
 * I/O bar and a width on the measured rows through that one number, so the
 * 600 ms row really is twice the 300 ms one.
 */

import {
  VIEWBOX,
  chip,
  clientBox,
  nodeFrame,
  requestsLayer,
  serviceBox,
  trackAndFill,
  verticalLink,
} from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

/**
 * Scene seconds per millisecond of simulated time. Every call is written in
 * milliseconds and drawn through this, so a call that takes twice as long
 * looks twice as long and every label can keep the real number.
 */
export const MS = 0.0025;

// --- the trunk and the stops on it ----------------------------------------

/** The one lane anything travels down, and the stops along it. */
export const X_LANE = 860;
export const Y_CALLER = 620;
export const Y_IO = 1630;
/** Where a thrown exception stops when there is no Task to carry it up. */
export const Y_LOST = 1450;

/** Pixels per second, so two travellers that left `d` apart stay `d` apart. */
export const SPEED = 1800;

// --- the Method -----------------------------------------------------------

/** Baseline of each code row, and the cursor that sits behind it. */
export const CODE_TEXT_Y = [1005, 1069, 1133, 1197];
/** Centre of each row, which is where the await on that row happens. */
export const CODE_ROW_Y = [994, 1058, 1122, 1186];
const CURSOR_Y = [968, 1032, 1096, 1160];
const CURSOR_X = 158;
const CURSOR_W = 574;
const CURSOR_H = 52;
const CODE_X = 172;

// --- the thread lanes -----------------------------------------------------

/** Centre of each lane, which is where a continuation lands. */
export const LANE_Y = [1350, 1420];
/** How far above its lane a continuation appears before it drops in. */
export const CONT_RISE = 44;
/** Column the continuations use, clear of both the lane labels and the trunk. */
export const CONT_X = 450;
const LANE_X = 260;
const LANE_W = 480;
const LANE_H = 40;

// --- the I/O box ----------------------------------------------------------

/** Both I/O bars, so a millisecond of work is the same width in either. */
export const IO_BAR_X = 500;
export const IO_BAR_W = 300;
const IO_BAR_Y = [1618, 1670];
const IO_BAR_H = 24;

// --- the measured rows ----------------------------------------------------

/** Width of one 300 ms bar on the measured rows. */
export const AXIS_UNIT = 190;
const AXIS_X = 280;
/** Where each measured bar starts: sequential A, sequential B, then the pair. */
export const AXIS_BARS = [
  { x: AXIS_X, y: 1740 },
  { x: AXIS_X + AXIS_UNIT, y: 1740 },
  { x: AXIS_X, y: 1780 },
  { x: AXIS_X, y: 1816 },
];
const AXIS_H = 24;

// --- the code the Method runs ---------------------------------------------

/** What one code row does when the cursor reaches it. */
export type LineKind = 'plain' | 'await' | 'block' | 'start' | 'whenall' | 'throw' | 'return';

/** One call a line makes: which bar it runs on, how long it takes, where it is measured. */
export interface CodeCall {
  io: 0 | 1;
  ms: number;
  /** Which measured bar this call draws, when it draws one. */
  axis?: number;
}

export interface CodeLine {
  text: string;
  kind: LineKind;
  /** Milliseconds of work the line does on its thread before it yields. */
  run: number;
  /** The calls the line makes. An `await` or a `block` line makes exactly one. */
  calls?: CodeCall[];
}

export interface CodePlan {
  id: string;
  lines: CodeLine[];
  /** `async void` returns nothing, so a thrown exception has nowhere to go. */
  returnsTask: boolean;
  /**
   * A single threaded context has exactly one place a continuation may run:
   * the thread the method started on. Blocking that thread is the deadlock.
   */
  singleThreaded: boolean;
}

const line = (
  text: string,
  kind: LineKind,
  run: number,
  extra: Partial<CodeLine> = {},
): CodeLine => ({ text, kind, run, ...extra });

/**
 * The five snippets, which together with four start times are the only thing
 * this scene is told. Everything the viewer sees falls out of the costs here.
 */
export const PLANS: Record<string, CodePlan> = {
  s1: {
    id: 's1',
    returnsTask: true,
    singleThreaded: false,
    lines: [
      line('var a = await GetA();', 'await', 100, { calls: [{ io: 0, ms: 600 }] }),
      line('var b = await GetB();', 'await', 100, { calls: [{ io: 1, ms: 400 }] }),
      line('return a + b;', 'return', 100),
    ],
  },
  s2: {
    id: 's2',
    returnsTask: true,
    singleThreaded: false,
    lines: [
      line('var a = await GetA();', 'await', 20, { calls: [{ io: 0, ms: 300, axis: 0 }] }),
      line('var b = await GetB();', 'await', 20, { calls: [{ io: 1, ms: 300, axis: 1 }] }),
      line('var ta = GetA(); var tb = GetB();', 'start', 20, {
        calls: [
          { io: 0, ms: 300, axis: 2 },
          { io: 1, ms: 300, axis: 3 },
        ],
      }),
      line('await Task.WhenAll(ta, tb);', 'whenall', 20),
    ],
  },
  s3a: {
    id: 's3a',
    returnsTask: true,
    singleThreaded: true,
    lines: [
      line('var a = GetA().Result;', 'block', 100, { calls: [{ io: 0, ms: 400 }] }),
      line('return a;', 'return', 100),
    ],
  },
  s3b: {
    id: 's3b',
    returnsTask: false,
    singleThreaded: false,
    lines: [
      line('async void Fire()', 'plain', 100),
      line('  await GetA();', 'await', 60, { calls: [{ io: 0, ms: 160 }] }),
      line('  throw new Exception();', 'throw', 120),
    ],
  },
  s4: {
    id: 's4',
    returnsTask: true,
    singleThreaded: false,
    lines: [
      line('var a = await GetA(ct);', 'await', 100, { calls: [{ io: 0, ms: 600 }] }),
      line('return a;', 'return', 100),
    ],
  },
};

/** The plan the stage ships showing, so the first frame is the whole diagram. */
export const FIRST_PLAN = 's1';

/**
 * What every `data-*` on the stage starts at, keyed by the target the timeline
 * addresses it through. The markup below is written from this, so a change that
 * writes a value something already holds is dropped rather than tweened.
 */
export const STAGE_STATE: Record<string, string> = {
  'stage@data-code': FIRST_PLAN,
  'stage@data-line': 'none',
  'stage@data-task': 'none',
  'stage@data-catch': 'off',
  'stage@data-token': 'off',
  'stage@data-unhandled': 'off',
  'stage@data-deadlock': 'off',
  'stage@data-seq': 'off',
  'stage@data-conc': 'off',
  'lane-1@data-lane-state': 'idle',
  'lane-2@data-lane-state': 'idle',
  'io-1@data-work': 'idle',
  'io-2@data-work': 'idle',
};

// --- markup ---------------------------------------------------------------

const stageState = Object.entries(STAGE_STATE)
  .filter(([key]) => key.startsWith('stage@'))
  .map(([key, value]) => `${key.slice('stage@'.length)}="${value}"`)
  .join(' ');

/** One value chip in the Caller, with one text variant per value it shows. */
const callerChip = (
  name: string,
  x: number,
  y: number,
  width: number,
  variants: [string, string][],
): string =>
  chip({
    x,
    y,
    width,
    height: 62,
    rx: 18,
    className: `aw-${name}`,
    bgClass: `aw-${name}-bg`,
    variant: 'outline',
    text: variants
      .map(
        ([key, text]) =>
          `<text class="scene-counter aw-chip-text aw-${name}-text aw-${name}-text--${key}" x="${x + width / 2}" y="${y + 40}" text-anchor="middle">${text}</text>`,
      )
      .join('\n      '),
    indent: 4,
  });

/** Every code row of every plan, stacked on the four baselines. */
const codeRows = Object.values(PLANS)
  .flatMap((plan) =>
    plan.lines.map(
      (row, index) =>
        `<text class="scene-mono aw-code aw-code--${plan.id} aw-row--${index}" x="${CODE_X}" y="${CODE_TEXT_Y[index]}">${row.text.replace(/ /g, '&#160;')}</text>`,
    ),
  )
  .join('\n      ');

const cursors = CURSOR_Y.map(
  (y, index) =>
    `<rect class="aw-cursor aw-cursor--${index}" x="${CURSOR_X}" y="${y}" width="${CURSOR_W}" height="${CURSOR_H}" rx="14" />`,
).join('\n      ');

/** One thread lane: the bar, the name of the thread, and what it is stuck on. */
const lane = (index: number): string => {
  const y = LANE_Y[index] ?? 0;
  return `<g class="aw-lane aw-lane--${index + 1}" data-lane-state="idle">
    <text class="scene-mono aw-lane-label" x="244" y="${y + 8}" text-anchor="end">T${index + 1}</text>
    <rect class="scene-slot aw-bar" x="${LANE_X}" y="${y - LANE_H / 2}" width="${LANE_W}" height="${LANE_H}" rx="14" />
    <text class="scene-flash aw-blocked" x="726" y="${y + 8}" text-anchor="end">blocked</text>
  </g>`;
};

/** One outstanding call, drawn as the bar that says how far it has got. */
const ioBar = (index: number): string =>
  `<g class="aw-io aw-io--${index + 1}" data-work="idle">
    <text class="scene-caption-label aw-io-label" x="486" y="${(IO_BAR_Y[index] ?? 0) + 20}" text-anchor="end">Get${index === 0 ? 'A' : 'B'}</text>
    ${trackAndFill({
      x: IO_BAR_X,
      y: IO_BAR_Y[index] ?? 0,
      width: IO_BAR_W,
      height: IO_BAR_H,
      rx: IO_BAR_H / 2,
      className: 'aw-io-bar',
      indent: 6,
    })}
  </g>`;

/** One measured bar, named after the call it stands for so it takes its colour. */
const axisBars = AXIS_BARS.map(
  (bar, index) =>
    `<g class="aw-axis-row aw-axis-row--${index % 2 === 0 ? 'a' : 'b'}">
    ${trackAndFill({
      x: bar.x,
      y: bar.y,
      width: AXIS_UNIT,
      height: AXIS_H,
      rx: AXIS_H / 2,
      className: 'aw-axis',
      indent: 4,
    })}
  </g>`,
).join('\n  ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageState} aria-hidden="true" focusable="false">
  <defs>
    <pattern id="aw-hatch" width="12" height="12" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
      <line class="aw-hatch-line" x1="0" y1="0" x2="0" y2="12" stroke-width="5" />
    </pattern>
  </defs>

  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_LANE, 680, 880)}
  ${verticalLink(X_LANE, 1270, 1500)}

  <rect class="aw-boundary" x="130" y="440" width="820" height="830" rx="28" />

  ${clientBox({
    x: 130,
    width: 820,
    title: 'Caller',
    titleX: 170,
    titleY: 500,
    titleClass: 'scene-node-label',
    titleAnchor: null,
    children: `
    <circle class="aw-busy" cx="770" cy="495" r="11" />
    ${callerChip('task', 170, 530, 330, [
      ['pending', 'Task (pending)'],
      ['done', 'Task (done)'],
      ['cancelled', 'cancelled'],
      ['faulted', 'faulted'],
    ])}
    ${callerChip('catch', 530, 530, 170, [
      ['armed', 'catch'],
      ['caught', 'caught'],
    ])}
    ${callerChip('token', 170, 606, 420, [
      ['on', 'CancellationToken'],
      ['cancelled', 'CancellationToken cancelled'],
    ])}`,
  })}

  ${nodeFrame({
    label: 'Method',
    labelY: 938,
    children: `    <g class="aw-code-group">
      ${cursors}
      ${codeRows}
    </g>`,
  })}

  <text class="scene-node-label aw-row-label" x="170" y="1310">Threads</text>

  ${lane(0)}

  ${lane(1)}

  <text class="scene-flash aw-deadlock" x="260" y="1478">deadlock</text>

  ${serviceBox({
    x: 380,
    width: 570,
    y: 1500,
    height: 210,
    title: 'I/O',
    titleX: 420,
    titleY: 1548,
    titleClass: 'scene-node-label',
    titleAnchor: null,
    className: 'aw-iobox',
    children: `
    ${ioBar(0)}
    ${ioBar(1)}
    <text class="scene-flash aw-io-status aw-io-status--cancelled" x="620" y="1548">cancelled</text>
    <text class="scene-flash aw-io-status aw-io-status--failed" x="620" y="1548">throw</text>`,
  })}

  <text class="scene-mono aw-axis-label" x="140" y="1758">await</text>
  <text class="scene-mono aw-axis-label" x="140" y="1816">WhenAll</text>
  ${axisBars}
  <text class="scene-flash aw-total aw-total--seq" x="680" y="1758">600 ms</text>
  <text class="scene-flash aw-total aw-total--conc" x="500" y="1816">300 ms</text>

  ${requestsLayer()}
</svg>`;
