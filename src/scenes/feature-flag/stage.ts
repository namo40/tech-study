/**
 * Static stage markup for the Feature Flag scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Four bands, arranged around the one
 * thing the pattern separates — putting code on a server and letting people see
 * it:
 *   - y 0..440       kept empty for the step title card
 *   - y 440..680     the Users: ten sample callers drawn as dots, each carrying
 *                    the side it is currently on, and the badge that says
 *                    whether v2 is on the servers at all
 *   - y 880..1270    the Flag: the switch, the word it is set to, and the
 *                    bucket strip — one dot per caller, placed at the caller's
 *                    hash, so the band of admitted buckets is the reason a
 *                    given caller is on a given side rather than an assertion
 *                    about it
 *   - y 1500..1740   the two paths, `v1` and `v2`, each with `served n`, and on
 *                    v2 the `errors` lamp
 *
 * Three lane segments and no others, every one axis aligned. A request leaves
 * the Users box at x 540 and reaches the Flag's top edge; the assignment leaves
 * the Flag's bottom edge at x 310 for v1 or x 770 for v2 and reaches that box's
 * top edge. Nothing is ever drawn inside the Flag box: a request is absorbed on
 * the top edge and the assignment it causes leaves from the bottom edge, which
 * is the same corridor convention the deployment stages use.
 *
 * A traveller sweeps 26px around every point it reaches and a label keeps 30px
 * clear of that, so the three segments own three keep-outs: x 484..596 from
 * y 624 to y 936, and x 254..366 and x 714..826 from y 1214 to y 1556. That is
 * what decides the layout. The Users box keeps its dots and its badge above
 * y 624. The Flag box names itself at y 946 and puts the switch below y 972,
 * under the first keep-out, with the bucket strip standing on a baseline at
 * y 1240, above the two lower ones. Both path boxes write their titles on a
 * line at y 1580 and everything else below it.
 *
 * Declared texture: the row of caller dots and the bucket strip. Neither is
 * read as writing — a dot says which side its caller is on and how high its
 * bucket sits, and both of those are answered by position and state rather than
 * by more words inside the box.
 *
 * Everything the reader has to read is a stack of text elements on one spot,
 * hidden by a base rule and opened by the current `data-*`, so nothing
 * interpolates and both scrub directions land on the same words.
 */

import {
  VIEWBOX,
  clientBox,
  counterVariants,
  requestsLayer,
  serviceBox,
  verticalLink,
} from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- geometry --------------------------------------------------------------

/** The request lane, and the two assignment lanes. */
export const X_IN = 540;
export const X_V1 = 310;
export const X_V2 = 770;

export const Y_USERS_BOTTOM = 680;
export const Y_FLAG_TOP = 880;
export const Y_FLAG_BOTTOM = 1270;
export const Y_PATH_TOP = 1500;

/** The Users band. */
const USERS = { x: 130, y: 440, w: 820, h: 240 };
const USERS_TITLE = { x: 170, y: 512 };
/** The badge that says whether the new code is on the servers at all. */
const DEP = { x: 660, y: 476, w: 260, h: 54 };
const DEP_TEXT = { x: 790, y: 512 };
/** The sample callers, drawn as one dot each on a single row. */
const USER_CY = 588;
const USER_R = 18;
const USER_XS = [176, 257, 338, 419, 500, 581, 662, 743, 824, 905] as const;

/** The Flag band: the switch, the word it is set to, and the bucket strip. */
const FLAG = { x: 130, y: 880, w: 820, h: 390 };
/** Above the switch and clear of the request lane's keep-out, which ends at 936. */
const FLAG_TITLE = { x: 170, y: 946 };

/** The switch itself: a plate, a rail, the share admitted, and the knob. */
const PLATE = { x: 170, y: 972, w: 760, h: 72 };
const RAIL = { x: 210, y: 994, w: 400, h: 28 };
const KNOB = { cy: 1008, r: 20 };
/** The word the switch is set to, written at the far end of the plate. */
const WORD = { x: 890, y: 1023 };

/**
 * The bucket strip. A caller's dot sits at its hash, so the band of admitted
 * buckets rising from the baseline is what decides who is on which side. The
 * strip shares the callers' x positions, so a dot and its bucket line up.
 */
const STRIP_BASE = 1240;
const STRIP_SCALE = 1.6;
const STRIP_R = 10;
const BAND = { x: 150, w: 780 };

/** The two paths. Only one of them can go wrong, so only one has a lamp. */
const V1 = { x: 130, y: 1500, w: 360, h: 240 };
const V2 = { x: 590, y: 1500, w: 360, h: 240 };
const TITLE_Y = 1580;
const V1_TITLE_X = 170;
const V2_TITLE_X = 630;
const SERVED_Y = 1646;
const V1_SERVED_X = 310;
const V2_SERVED_X = 770;
const LAMP = { cx: 648, cy: 1696, r: 18 };
const ERRORS_TEXT = { x: 696, y: 1710 };

/** The most requests either path can answer, which is what `served n` counts to. */
export const V1_MAX = 21;
export const V2_MAX = 13;

// --- what the stage can say about itself -----------------------------------

/** The ten sample callers, which are the ten dots on the stage. */
export const USER_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export type UserId = (typeof USER_IDS)[number];

/**
 * The bucket each caller hashes into, which is the whole of what the flag knows
 * about them. Authored once here and read everywhere else: the percentages the
 * scene turns the dial to admit exactly one of these and then exactly five, and
 * the build asserts both rather than trusting the drawing.
 */
export const HASH_OF: Record<UserId, number> = {
  1: 38,
  2: 17,
  3: 91,
  4: 4,
  5: 63,
  6: 25,
  7: 80,
  8: 46,
  9: 72,
  10: 59,
};

/**
 * What the switch is set to. `none` is not a setting: it is a stage with no
 * switch in it at all, which happens twice for opposite reasons — before the
 * flag is introduced and after it has been taken out.
 */
export const FLAG_STATES = ['none', 'off', 'p10', 'p50', 'p100', 'kill'] as const;
export type FlagState = (typeof FLAG_STATES)[number];

/** The settings that are a position on the dial, and where each one sits. */
export const DIAL_STATES = ['off', 'p10', 'p50', 'p100', 'kill'] as const;
export type DialState = (typeof DIAL_STATES)[number];

export const PERCENT_OF: Record<DialState, number> = {
  off: 0,
  p10: 10,
  p50: 50,
  p100: 100,
  kill: 0,
};

/** The word each setting is written as. Every one is on the fixed label list. */
const WORD_OF: Record<FlagState, string> = {
  none: 'v2',
  off: 'off',
  p10: '10%',
  p50: '50%',
  p100: '100%',
  kill: 'kill',
};

/**
 * Whether there is a switch, and why there is not.
 *
 * `ghost` is the world the first step opens in: the code ships and that is the
 * release, so there is nothing to decide with. `removed` is the fourth step's
 * ending: the same unconditional path, arrived at on purpose once the flag had
 * done its work. Both are drawn as an absent switch and they must not read
 * alike, because one is a defect and the other is the finished job.
 */
export const SWITCH_STATES = ['ghost', 'on', 'removed'] as const;
export type SwitchState = (typeof SWITCH_STATES)[number];

/** Whether the new code is on the servers, which is not the same as released. */
export const DEPLOY_STATES = ['off', 'on'] as const;
export type DeployState = (typeof DEPLOY_STATES)[number];

const DEPLOY_WORD: Record<DeployState, string> = { off: 'v1', on: 'deployed' };

/**
 * Which side a caller is on. `off` is a caller nothing has assigned yet, which
 * is only true before anything has been deployed; it must never read like
 * either side.
 */
export const CELL_STATES = ['off', 'v1', 'v2'] as const;
export type CellState = (typeof CELL_STATES)[number];

/** The lamp on v2: quiet, lit, and quiet again having been lit. */
export const ERROR_STATES = ['off', 'on', 'clear'] as const;
export type ErrorState = (typeof ERROR_STATES)[number];

/** What the scene is holding up for a moment, if anything. */
export const MARKS = [
  'none',
  'noway',
  'dark',
  'decides',
  'bucket',
  'cheap',
  'fixed',
  'debt',
] as const;
export type Mark = (typeof MARKS)[number];

/**
 * What every `data-*` on the stage starts at. The markup below is written from
 * these, so the first frame is the whole diagram in its opening state — ten
 * callers nothing has assigned, no switch to assign them with, both paths
 * standing and neither of them serving anybody — and the timeline never
 * restates it.
 */
export const STAGE_STATE: Record<string, string> = {
  'data-ff-flag': 'none',
  'data-ff-switch': 'ghost',
  'data-ff-deployed': 'off',
  'data-ff-v1': '0',
  'data-ff-v2': '0',
  'data-ff-errors': 'off',
  'data-ff-mark': 'none',
  'data-ff-settled': 'off',
};

/** What every caller dot and every bucket dot starts at. */
export const CELL_STATE: CellState = 'off';

// --- markup ----------------------------------------------------------------

/** Non-breaking spaces, so a monospaced label keeps its gaps in SVG. */
const mono = (text: string): string => text.replace(/ /g, '&#160;');

const pad = (n: number): string => `\n${' '.repeat(n)}`;

/** One spot, one text per value it can hold. Exactly one is ever revealed. */
const textStack = (
  x: number,
  y: number,
  className: string,
  values: readonly string[],
  format: (value: string) => string,
  anchor: string | null,
  indent = 4,
): string =>
  values
    .map(
      (value) =>
        `<text class="scene-counter ${className} ${className}--${value}" x="${x}" y="${y}"${
          anchor ? ` text-anchor="${anchor}"` : ''
        }>${format(value)}</text>`,
    )
    .join(pad(indent));

/** The badge: what the servers are running, which is not what people are seeing. */
const deployBadge = `<g class="ff-dep">
      ${DEPLOY_STATES.map(
        (state) =>
          `<rect class="ff-dep-bg ff-dep-bg--${state}" x="${DEP.x}" y="${DEP.y}" width="${DEP.w}" height="${DEP.h}" rx="${DEP.h / 2}" />`,
      ).join(pad(6))}
      ${textStack(
        DEP_TEXT.x,
        DEP_TEXT.y,
        'ff-dep-text',
        DEPLOY_STATES,
        (state) => DEPLOY_WORD[state as DeployState],
        'middle',
        6,
      )}
    </g>`;

/** One sample caller, drawn as the side it is on right now. */
const userDot = (index: number): string => {
  const id = USER_IDS[index] ?? 1;
  const x = USER_XS[index] ?? 0;
  return `<circle class="ff-dot ff-dot--user ff-u--${id}" data-ff-cell="${CELL_STATE}" cx="${x}" cy="${USER_CY}" r="${USER_R}" />`;
};

/** The share of the dial admitted, drawn once per setting. */
const shares = DIAL_STATES.map(
  (state) =>
    `<rect class="scene-fill ff-share ff-share--${state}" x="${RAIL.x}" y="${RAIL.y}" width="${(RAIL.w * PERCENT_OF[state]) / 100}" height="${RAIL.h}" rx="${RAIL.h / 2}" />`,
).join(pad(6));

const knobs = DIAL_STATES.map(
  (state) =>
    `<circle class="ff-knob ff-knob--${state}" cx="${RAIL.x + (RAIL.w * PERCENT_OF[state]) / 100}" cy="${KNOB.cy}" r="${KNOB.r}" />`,
).join(pad(6));

/** The band of buckets the current setting admits, drawn once per setting. */
const bands = DIAL_STATES.map((state) => {
  const height = PERCENT_OF[state] * STRIP_SCALE;
  return `<g class="ff-band ff-band--${state}">
      <rect class="ff-band-fill" x="${BAND.x}" y="${STRIP_BASE - height}" width="${BAND.w}" height="${height}" rx="10" />
      <line class="ff-band-edge" x1="${BAND.x}" y1="${STRIP_BASE - height}" x2="${BAND.x + BAND.w}" y2="${STRIP_BASE - height}" />
    </g>`;
}).join(pad(4));

/** One caller's bucket, placed at its hash. */
const bucketDot = (index: number): string => {
  const id = USER_IDS[index] ?? 1;
  const x = USER_XS[index] ?? 0;
  const cy = STRIP_BASE - HASH_OF[id] * STRIP_SCALE;
  return `<circle class="ff-dot ff-dot--bucket ff-u--${id}" data-ff-cell="${CELL_STATE}" cx="${x}" cy="${cy}" r="${STRIP_R}" />`;
};

/** How many requests each path answered. One text per value, state picks one. */
const servedReadout = (className: string, x: number, max: number): string =>
  counterVariants({
    x,
    y: SERVED_Y,
    className,
    max,
    format: (n) => mono(`served ${n}`),
    anchor: 'middle',
  });

const stageAttrs = Object.entries(STAGE_STATE)
  .map(([name, value]) => `${name}="${value}"`)
  .join(' ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageAttrs} aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_IN, Y_USERS_BOTTOM, Y_FLAG_TOP, 'scene-link ff-lane')}
  ${verticalLink(X_V1, Y_FLAG_BOTTOM, Y_PATH_TOP, 'scene-link ff-lane ff-lane--v1')}
  ${verticalLink(X_V2, Y_FLAG_BOTTOM, Y_PATH_TOP, 'scene-link ff-lane ff-lane--v2')}

  ${clientBox({
    x: USERS.x,
    width: USERS.w,
    y: USERS.y,
    height: USERS.h,
    title: 'Users',
    titleX: USERS_TITLE.x,
    titleY: USERS_TITLE.y,
    titleAnchor: null,
    children: `
    ${deployBadge}

    ${USER_IDS.map((_id, index) => userDot(index)).join(pad(4))}`,
  })}

  ${serviceBox({
    x: FLAG.x,
    width: FLAG.w,
    y: FLAG.y,
    height: FLAG.h,
    title: 'Flag',
    titleX: FLAG_TITLE.x,
    titleY: FLAG_TITLE.y,
    titleAnchor: null,
    className: 'scene-node ff-flag',
    children: `
    <g class="ff-switch">
      <rect class="ff-plate" x="${PLATE.x}" y="${PLATE.y}" width="${PLATE.w}" height="${PLATE.h}" rx="24" />
      <rect class="scene-track ff-rail" x="${RAIL.x}" y="${RAIL.y}" width="${RAIL.w}" height="${RAIL.h}" rx="${RAIL.h / 2}" />
      ${shares}
      ${knobs}
    </g>

    <g class="ff-absent ff-absent--ghost">
      <rect class="ff-absent-plate" x="${PLATE.x}" y="${PLATE.y}" width="${PLATE.w}" height="${PLATE.h}" rx="24" />
      <line class="ff-absent-bar" x1="${RAIL.x}" y1="${KNOB.cy}" x2="${RAIL.x + RAIL.w}" y2="${KNOB.cy}" />
    </g>

    <g class="ff-absent ff-absent--removed">
      <rect class="ff-absent-plate" x="${PLATE.x}" y="${PLATE.y}" width="${PLATE.w}" height="${PLATE.h}" rx="24" />
      <line class="ff-absent-bar" x1="${RAIL.x}" y1="${KNOB.cy}" x2="${RAIL.x + RAIL.w}" y2="${KNOB.cy}" />
    </g>

    ${textStack(WORD.x, WORD.y, 'ff-word', FLAG_STATES, (state) => WORD_OF[state as FlagState], 'end')}

    ${bands}

    ${USER_IDS.map((_id, index) => bucketDot(index)).join(pad(4))}`,
  })}

  ${serviceBox({
    x: V1.x,
    width: V1.w,
    y: V1.y,
    height: V1.h,
    title: 'v1',
    titleX: V1_TITLE_X,
    titleY: TITLE_Y,
    titleAnchor: null,
    className: 'scene-service ff-path ff-path--v1',
    children: `
    ${servedReadout('ff-served-v1', V1_SERVED_X, V1_MAX)}`,
  })}

  ${serviceBox({
    x: V2.x,
    width: V2.w,
    y: V2.y,
    height: V2.h,
    title: 'v2',
    titleX: V2_TITLE_X,
    titleY: TITLE_Y,
    titleAnchor: null,
    className: 'scene-service ff-path ff-path--v2',
    children: `
    ${servedReadout('ff-served-v2', V2_SERVED_X, V2_MAX)}

    <circle class="ff-lamp-ring" cx="${LAMP.cx}" cy="${LAMP.cy}" r="${LAMP.r + 12}" />
    <circle class="ff-lamp" cx="${LAMP.cx}" cy="${LAMP.cy}" r="${LAMP.r}" />
    <text class="ff-errors" x="${ERRORS_TEXT.x}" y="${ERRORS_TEXT.y}">errors</text>`,
  })}

  ${requestsLayer()}
</svg>`;
