/**
 * Static stage markup for the Fallback scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. The bands are the usual ones, with
 * the answer being assembled in the middle because what the scene is about is
 * what the service says when one of the parts is missing:
 *   - y 0..440       kept empty for the step title card
 *   - y 440..680     Clients, and the rate they are offering
 *   - y 880..1270    Service: the card the answer is composed on, the four
 *                    modes it can be running in, and how many requests it has
 *                    refused at the door
 *   - y 1500..1740   Data on the left and Recs on the right, each saying
 *                    whether it is answering
 *
 * Three lanes and no others. A request leaves the Clients box at `Y_CLIENTS`
 * and is answered at the Service's top edge, `Y_SERVICE_TOP`, on `X_MAIN`, and
 * comes back the same way. A call leaves the Service's bottom edge at
 * `Y_SERVICE_BOTTOM` and reaches a dependency's top edge at `Y_DEP`, on `X_DATA`
 * or `X_RECS`, and comes back the same way. Every leg is vertical, every lane
 * runs through the centre of the box it ends on, and no two lanes share a
 * stretch.
 *
 * That is what decides where a label may sit. A traveller sweeps 26px around
 * every point it reaches and a label keeps 30px clear of that, so `X_MAIN` owns
 * a 112px wide keep-out from y 624 to y 936, and each call column owns one from
 * y 1214 to y 1556. The Clients box therefore writes nothing below y 616 inside
 * x 484..596; the Service writes its card and its refusal count clear of
 * x 254..366 and x 714..826 below y 1214, and nothing at all inside x 484..596
 * above y 936; and each dependency writes its name below y 1556.
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

/** The column a request travels on, which is the centre of both boxes it joins. */
export const X_MAIN = 540;
/** The columns the service calls its two dependencies on. */
export const X_DATA = 310;
export const X_RECS = 770;

/** Where a request starts, and the service edge it is answered at. */
export const Y_CLIENTS = 680;
export const Y_SERVICE_TOP = 880;

/** Where a call starts, and the dependency edge it is answered at. */
export const Y_SERVICE_BOTTOM = 1270;
export const Y_DEP = 1500;

/** The Clients box and the rate readout inside it. */
const CLIENTS = { x: 130, y: 440, w: 820, h: 240 };
const CLIENTS_TITLE_Y = 512;
const RPS_Y = 590;

/** The Service node. */
const SERVICE_LABEL_Y = 938;

/** The card the answer is composed on: one row per part of the answer. */
const CARD = { x: 170, y: 966, w: 430, h: 180 };
const SLOT_X = 196;
const SLOT_SIDE = 40;
const ROW_CORE_Y = 1000;
const ROW_RECS_Y = 1072;
const ROW_NAME_X = 256;
const ROW_CORE_TEXT_Y = 1030;
const ROW_RECS_TEXT_Y = 1102;
const CACHED_X = 360;

/** The modes the service can be running in, stacked down the right-hand side. */
const MODE = { x: 640, w: 290, h: 52 };
const MODE_TOP = 950;
const MODE_PITCH = 66;
const MODE_TEXT_DY = 36;

/** How many requests have been refused at the door. */
const REFUSED_X = 190;
const REFUSED_Y = 1196;

/** The two dependencies. Both boxes are the same size, mirrored about x 540. */
const DEP = { y: 1500, w: 360, h: 240 };
const DEP_DATA_X = 130;
const DEP_RECS_X = 590;
const DEP_TITLE_Y = 1610;
const BADGE = { w: 200, h: 58, y: 1636 };
const BADGE_TEXT_Y = 1674;

/** The highest each readout counts to, which is one more than it ever reaches. */
export const RPS_MAX = 8;
export const REFUSED_MAX = 10;

// --- the words the stage can say ------------------------------------------

/** What the core row of the answer can be holding. */
export const CORE_STATES = ['empty', 'live'] as const;
export type CoreState = (typeof CORE_STATES)[number];

/**
 * What the recommendations row can be holding: nothing yet, the live answer,
 * yesterday's copy, or nothing at all because the row has been switched off.
 */
export const RECS_STATES = ['empty', 'live', 'cached', 'off'] as const;
export type RecsState = (typeof RECS_STATES)[number];

/** A mode is either enabled or it is not. */
export const MODES = ['fallback', 'throttle', 'shed', 'coreonly'] as const;
export type Mode = (typeof MODES)[number];

/** What a dependency says about itself. */
export const HEALTH = ['up', 'down'] as const;
export type Health = (typeof HEALTH)[number];

/** The word each mode chip carries, which is the label the reader sees. */
const MODE_LABEL: Record<Mode, string> = {
  fallback: 'fallback',
  throttle: 'throttle',
  shed: 'shed',
  coreonly: 'core only',
};

/**
 * What every `data-*` on the stage starts at. The markup below is written from
 * these, so the first frame is the whole diagram in its opening state and the
 * timeline never has to restate what is already there.
 */
export const STAGE_STATE: Record<string, string> = {
  'data-rps': '2',
  'data-refused': '0',
  'data-core': 'empty',
  'data-recs': 'empty',
  'data-fallback': 'off',
  'data-throttle': 'off',
  'data-shed': 'off',
  'data-coreonly': 'off',
  'data-dep-data': 'up',
  'data-dep-recs': 'up',
};

// --- markup ----------------------------------------------------------------

/** The rate the clients are offering, which is the load the service is under. */
const rpsReadout = counterVariants({
  x: X_MAIN,
  y: RPS_Y,
  className: 'fb-rps',
  count: RPS_MAX + 1,
  anchor: 'middle',
  format: (n) => `rps ${n}`,
  indent: 4,
});

/**
 * One row of the answer. The name is a stack with one variant per state, so the
 * row lights up without anything interpolating between two colours, and the
 * square beside it repeats the same thing in a shape.
 */
const row = (name: 'core' | 'recs', states: readonly string[], slotY: number, textY: number): string => {
  const variants = states
    .map(
      (state) =>
        `<text class="scene-counter fb-row-${name} fb-row-${name}--${state}" x="${ROW_NAME_X}" y="${textY}">${name}</text>`,
    )
    .join('\n      ');
  return `<rect class="fb-slot fb-slot-${name}" x="${SLOT_X}" y="${slotY}" width="${SLOT_SIDE}" height="${SLOT_SIDE}" rx="10" />
      ${variants}`;
};

/** The card the answer is composed on. */
const compositionCard = `<g class="fb-card">
      <rect class="fb-card-bg" x="${CARD.x}" y="${CARD.y}" width="${CARD.w}" height="${CARD.h}" rx="24" />
      ${row('core', CORE_STATES, ROW_CORE_Y, ROW_CORE_TEXT_Y)}
      ${row('recs', RECS_STATES, ROW_RECS_Y, ROW_RECS_TEXT_Y)}
      <text class="scene-flash fb-cached" x="${CACHED_X}" y="${ROW_RECS_TEXT_Y}">cached copy</text>
    </g>`;

/**
 * One mode chip. Both words are the same; only the colour differs, so the chip
 * reads as a lamp with a name on it rather than as a value that changes.
 */
const modeChip = (mode: Mode, index: number): string => {
  const y = MODE_TOP + index * MODE_PITCH;
  const centre = MODE.x + MODE.w / 2;
  const text = ['off', 'on']
    .map(
      (state) =>
        `<text class="scene-counter fb-mode-${mode} fb-mode-${mode}--${state}" x="${centre}" y="${y + MODE_TEXT_DY}" text-anchor="middle">${MODE_LABEL[mode]}</text>`,
    )
    .join('\n        ');
  return chip({
    x: MODE.x,
    y,
    width: MODE.w,
    height: MODE.h,
    rx: 18,
    className: `fb-chip-${mode}`,
    variant: 'outline',
    text,
    indent: 6,
  });
};

/** How many requests the service has refused at the door. */
const refusedReadout = counterVariants({
  x: REFUSED_X,
  y: REFUSED_Y,
  className: 'fb-refused',
  count: REFUSED_MAX + 1,
  format: (n) => `503 ${n}`,
  indent: 4,
});

/** The plate a dependency says whether it is answering on. */
const healthBadge = (name: 'data' | 'recs', centre: number): string => {
  const text = HEALTH.map(
    (state) =>
      `<text class="scene-counter fb-badge-${name} fb-badge-${name}--${state}" x="${centre}" y="${BADGE_TEXT_Y}" text-anchor="middle">${state}</text>`,
  ).join('\n        ');
  return chip({
    x: centre - BADGE.w / 2,
    y: BADGE.y,
    width: BADGE.w,
    height: BADGE.h,
    rx: 18,
    className: `fb-badge-plate-${name}`,
    variant: 'outline',
    text,
    indent: 6,
  });
};

/** One dependency: what it is called, and whether it is answering. */
const dependency = (name: 'data' | 'recs', title: string, left: number, centre: number): string =>
  serviceBox({
    x: left,
    width: DEP.w,
    y: DEP.y,
    height: DEP.h,
    title,
    titleX: centre,
    titleY: DEP_TITLE_Y,
    className: `fb-dep fb-dep--${name}`,
    boxClass: `scene-box fb-dep-box fb-dep-box--${name}`,
    children: `
      ${healthBadge(name, centre)}`,
  });

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" data-rps="${STAGE_STATE['data-rps']}" data-refused="${STAGE_STATE['data-refused']}" data-core="${STAGE_STATE['data-core']}" data-recs="${STAGE_STATE['data-recs']}" data-fallback="${STAGE_STATE['data-fallback']}" data-throttle="${STAGE_STATE['data-throttle']}" data-shed="${STAGE_STATE['data-shed']}" data-coreonly="${STAGE_STATE['data-coreonly']}" data-dep-data="${STAGE_STATE['data-dep-data']}" data-dep-recs="${STAGE_STATE['data-dep-recs']}" aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_MAIN, Y_CLIENTS, Y_SERVICE_TOP)}
  ${verticalLink(X_DATA, Y_SERVICE_BOTTOM, Y_DEP)}
  ${verticalLink(X_RECS, Y_SERVICE_BOTTOM, Y_DEP)}

  ${clientBox({
    x: CLIENTS.x,
    width: CLIENTS.w,
    y: CLIENTS.y,
    height: CLIENTS.h,
    title: 'Clients',
    titleY: CLIENTS_TITLE_Y,
    children: `
    ${rpsReadout}`,
  })}

  ${nodeFrame({
    label: 'Service',
    labelY: SERVICE_LABEL_Y,
    children: `
    ${compositionCard}

    ${modeChip('fallback', 0)}

    ${modeChip('throttle', 1)}

    ${modeChip('shed', 2)}

    ${modeChip('coreonly', 3)}

    ${refusedReadout}`,
  })}

  ${dependency('data', 'Data', DEP_DATA_X, X_DATA)}

  ${dependency('recs', 'Recs', DEP_RECS_X, X_RECS)}

  ${requestsLayer()}
</svg>`;
