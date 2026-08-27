/**
 * Static stage markup for the Blue-Green Deployment scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. The bands are the usual ones, with
 * the middle one split into two boxes, because the whole point of the pattern is
 * that there are two of everything except the database:
 *   - y 0..440       kept empty for the step title card
 *   - y 440..680     Router: the weight it splits traffic by, the readout that
 *                    says so in words, and the control it is moved with
 *   - y 880..1270    Blue and Green, side by side: the version each one runs,
 *                    the word it says about itself, and whether it is answering
 *   - y 1500..1740   Database, the one thing neither environment gets a copy of
 *
 * Four lanes and no others, and every one of them is vertical. `X_BLUE` runs
 * from the bottom edge of Router to the top edge of Blue, and on from the bottom
 * edge of Blue to the top edge of Database; `X_GREEN` does the same on the right.
 * Both database lanes land inside the Database box's top edge, which is why that
 * box is x 280..800 rather than the full width. No leg is diagonal, no leg has
 * zero length, and consecutive legs share their endpoint exactly.
 *
 * Router is a boundary rather than a corridor: a request is routed there and the
 * dot that carries it starts on the bottom edge, so nothing is ever drawn inside
 * the box. An environment is a corridor: a request reaching Blue is absorbed on
 * its top edge, and the write it causes leaves from the bottom edge. The two
 * segments of one column are 390px apart, so a request and a write sharing a
 * column can never meet; two travellers on the same segment are kept apart by
 * the cadence instead.
 *
 * Everything the reader has to read is a stack of text variants on one spot,
 * hidden by a base rule and opened by the `data-*` the timeline wrote: the
 * weight readout, both badges, the schema card, the migration chip and the error
 * rate. Nothing interpolates, so both scrub directions land on the same words.
 *
 * Labels keep 30px off every stretch a dot sweeps. The two swept columns are
 * x 254..366 and x 714..826, over y 624..936 and y 1444..1556, so the Router
 * readout sits above the first band, both environment boxes write their rows
 * below it, and the Database title is moved right to x 390 to clear it.
 */

import {
  VIEWBOX,
  chip,
  clientBox,
  healthDot,
  requestsLayer,
  serviceBox,
  verticalLink,
} from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- the four lanes --------------------------------------------------------

/** The column Blue is on, and the column Green is on. */
export const X_BLUE = 310;
export const X_GREEN = 770;

/** Bottom edge of Router, both edges of an environment, top edge of Database. */
export const Y_ROUTER = 680;
export const Y_ENV_TOP = 880;
export const Y_ENV_BOTTOM = 1270;
export const Y_DB = 1500;

/** Length of a traffic lane and of a write lane, so both travel at one speed. */
export const TRAFFIC_SPAN = Y_ENV_TOP - Y_ROUTER;
export const WRITE_SPAN = Y_DB - Y_ENV_BOTTOM;

// --- the boxes -------------------------------------------------------------

const ROUTER = { x: 130, y: 440, w: 820, h: 240 };
const BLUE = { x: 130, y: 880, w: 360, h: 390 };
const GREEN = { x: 590, y: 880, w: 360, h: 390 };
const DB = { x: 280, y: 1500, w: 520, h: 240 };

const ROUTER_TITLE = { x: 170, y: 500 };
const ENV_TITLE_Y = 990;
const DB_TITLE = { x: 390, y: 1552 };

// --- the control, inside Router --------------------------------------------

/** The rail the weight is set on, and the span the green share is drawn along. */
const RAIL = { x: 180, y: 556, w: 280, h: 36 };
const KNOB = { cy: 574, r: 18 };
/** Marks under the rail: two detents for a switch, four graduations for a dial. */
const TICK = { y: 602, w: 5, h: 16 };

/** Where the weight is written out. Every variant is twenty characters wide. */
const READOUT = { x: 700, y: 588 };

/** Every weight the router is ever set to, written as `blue-green` shares. */
export const WEIGHTS = ['100-0', '90-10', '50-50', '0-100'] as const;
export type Weight = (typeof WEIGHTS)[number];

/** The green share of a weight, which is what the rail draws. */
export const greenShareOf = (weight: Weight): number => Number(weight.split('-')[1] ?? 0);

/** x of the knob for a weight: the left end at 0%, the right end at 100%. */
const knobX = (weight: Weight): number => RAIL.x + (RAIL.w * greenShareOf(weight)) / 100;

/** The graduations each control shows: a switch has two, a dial has four. */
const SWITCH_STOPS: readonly Weight[] = ['100-0', '0-100'];
const DIAL_STOPS: readonly Weight[] = WEIGHTS;

// --- inside an environment -------------------------------------------------

/** Rows: the name, the version it runs, the word it says, and its health. */
const VER_Y = 1060;
const BADGE = { y: 1104, w: 180, h: 52 };
const BADGE_TEXT_DY = 36;
const DOT_CY = 1130;
const ROW_X = 40;

/** Every word each badge can hold, in the order its environment reaches them. */
export const BLUE_STATES = ['live', 'warm', 'idle'] as const;
export const GREEN_STATES = ['idle', 'deploying', 'ready', 'live'] as const;
export type BlueState = (typeof BLUE_STATES)[number];
export type GreenState = (typeof GREEN_STATES)[number];

// --- inside the Database ---------------------------------------------------

/** The schema card, drawn once per shape, so only one is ever on the stage. */
export const SCHEMAS = ['name', 'both', 'nickname'] as const;
export type Schema = (typeof SCHEMAS)[number];

const CARD = { x: 320, w: 240, y: 1590, h1: 60, h2: 124 };
const COL_X = 344;
const COL_A_Y = 1628;
const COL_B_Y = 1692;
/** Which version each column is there for, shown once both have to coexist. */
const TAG_X = 500;

/** The move being made on the schema right now, when one is being made. */
export const MIGRATIONS = ['expand', 'contract'] as const;
export type Migration = (typeof MIGRATIONS)[number];

const MIG = { x: 600, y: 1592, w: 180, h: 60 };
const MIG_TEXT_DY = 38;

/** The error rate, written out, and the plate it is held up on. */
const ERRORS = { x: 780, y: 1700 };
const ERRORS_HALO = { x: 570, y: 1666, w: 222, h: 46 };
export const MAX_ERRORS = 10;

// --- markup ----------------------------------------------------------------

/** One spot, one text per value it can hold. Exactly one is ever revealed. */
function textStack(
  x: number,
  y: number,
  className: string,
  values: readonly string[],
  format: (value: string) => string,
  anchor: string | null,
  indent = 4,
): string {
  const at = anchor ? ` text-anchor="${anchor}"` : '';
  return values
    .map(
      (value) =>
        `<text class="scene-counter ${className} ${className}--${value}" x="${x}" y="${y}"${at}>${format(value)}</text>`,
    )
    .join(`\n${' '.repeat(indent)}`);
}

const shares = WEIGHTS.map(
  (weight) =>
    `<rect class="scene-fill bgd-share bgd-share--${weight}" x="${RAIL.x}" y="${RAIL.y}" width="${(RAIL.w * greenShareOf(weight)) / 100}" height="${RAIL.h}" rx="${RAIL.h / 2}" />`,
).join('\n    ');

const knobs = WEIGHTS.map(
  (weight) =>
    `<circle class="bgd-knob bgd-knob--${weight}" cx="${knobX(weight)}" cy="${KNOB.cy}" r="${KNOB.r}" />`,
).join('\n    ');

const tickRow = (stops: readonly Weight[], kind: string): string =>
  `<g class="bgd-ticks bgd-ticks--${kind}">
      ${stops
        .map(
          (weight) =>
            `<rect class="bgd-tick" x="${knobX(weight) - TICK.w / 2}" y="${TICK.y}" width="${TICK.w}" height="${TICK.h}" rx="2" />`,
        )
        .join('\n      ')}
    </g>`;

const readout = textStack(
  READOUT.x,
  READOUT.y,
  'bgd-readout',
  WEIGHTS,
  (weight) => `blue ${weight.split('-')[0]}% · green ${weight.split('-')[1]}%`,
  'middle',
);

/** One environment: what it is called, what it runs, what it says, how it is. */
const envBox = (
  key: 'blue' | 'green',
  box: { x: number; y: number; w: number; h: number },
  title: string,
  version: string,
  states: readonly string[],
): string =>
  serviceBox({
    x: box.x,
    width: box.w,
    y: box.y,
    height: box.h,
    className: `bgd-env bgd-env--${key}`,
    title,
    titleX: box.x + ROW_X,
    titleY: ENV_TITLE_Y,
    titleClass: 'scene-node-label bgd-env-title',
    titleAnchor: null,
    children: `
    <text class="scene-mono bgd-ver" x="${box.x + ROW_X}" y="${VER_Y}">${version}</text>
    <rect class="bgd-badge-bg" x="${box.x + ROW_X}" y="${BADGE.y}" width="${BADGE.w}" height="${BADGE.h}" rx="${BADGE.h / 2}" />
    ${textStack(box.x + ROW_X + BADGE.w / 2, BADGE.y + BADGE_TEXT_DY, `bgd-badge-${key}`, states, (value) => value, 'middle')}
    ${healthDot({
      cx: box.x + box.w - 70,
      cy: DOT_CY,
      attrs: ` data-health-state="${key === 'blue' ? 'up' : 'down'}"`,
      indent: 4,
    })}`,
  });

/** The schema card, drawn once per shape it can have. */
const schemaCard = (schema: Schema): string => {
  const tall = schema === 'both';
  const rows = tall
    ? [
        `<text class="scene-mono bgd-col" x="${COL_X}" y="${COL_A_Y}">name</text>`,
        `<text class="scene-mono bgd-col" x="${COL_X}" y="${COL_B_Y}">nickname</text>`,
        `<text class="bgd-tag" x="${TAG_X}" y="${COL_A_Y}">v1</text>`,
        `<text class="bgd-tag" x="${TAG_X}" y="${COL_B_Y}">v2</text>`,
      ]
    : [`<text class="scene-mono bgd-col" x="${COL_X}" y="${COL_A_Y}">${schema}</text>`];
  return `<g class="bgd-card bgd-card--${schema}">
      <rect class="bgd-card-bg" x="${CARD.x}" y="${CARD.y}" width="${CARD.w}" height="${tall ? CARD.h2 : CARD.h1}" rx="18" />
      ${rows.join('\n      ')}
    </g>`;
};

const migrationChip = chip({
  x: MIG.x,
  y: MIG.y,
  width: MIG.w,
  height: MIG.h,
  rx: MIG.h / 2,
  className: 'bgd-mig',
  bgClass: 'bgd-mig-bg',
  variant: 'outline',
  text: textStack(
    MIG.x + MIG.w / 2,
    MIG.y + MIG_TEXT_DY,
    'bgd-mig-text',
    MIGRATIONS,
    (value) => value,
    'middle',
    6,
  ),
});

const errorReadout = textStack(
  ERRORS.x,
  ERRORS.y,
  'bgd-errors',
  Array.from({ length: MAX_ERRORS + 1 }, (_value, n) => String(n)),
  (value) => `errors ${value}%`,
  'end',
);

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" data-weight="100-0" data-control="switch" data-blue="live" data-green="idle" data-shape="name" data-shared="off" data-migration="none" data-rate="0" data-focus="none" data-fix="off" aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_BLUE, Y_ROUTER, Y_ENV_TOP)}
  ${verticalLink(X_GREEN, Y_ROUTER, Y_ENV_TOP)}
  ${verticalLink(X_BLUE, Y_ENV_BOTTOM, Y_DB, 'scene-link bgd-write-lane')}
  ${verticalLink(X_GREEN, Y_ENV_BOTTOM, Y_DB, 'scene-link bgd-write-lane')}

  ${clientBox({
    x: ROUTER.x,
    width: ROUTER.w,
    y: ROUTER.y,
    height: ROUTER.h,
    title: 'Router',
    titleX: ROUTER_TITLE.x,
    titleY: ROUTER_TITLE.y,
    titleClass: 'scene-node-label',
    titleAnchor: null,
    children: `
    <rect class="scene-track bgd-rail" x="${RAIL.x}" y="${RAIL.y}" width="${RAIL.w}" height="${RAIL.h}" rx="${RAIL.h / 2}" />
    ${shares}
    ${knobs}
    ${tickRow(SWITCH_STOPS, 'switch')}
    ${tickRow(DIAL_STOPS, 'dial')}
    ${readout}`,
  })}

  ${envBox('blue', BLUE, 'Blue', 'v1', BLUE_STATES)}
  ${envBox('green', GREEN, 'Green', 'v2', GREEN_STATES)}

  ${serviceBox({
    x: DB.x,
    width: DB.w,
    y: DB.y,
    height: DB.h,
    title: 'Database',
    titleX: DB_TITLE.x,
    titleY: DB_TITLE.y,
    titleClass: 'scene-node-label',
    titleAnchor: null,
    children: `
    ${SCHEMAS.map((schema) => schemaCard(schema)).join('\n    ')}
    ${migrationChip}
    <rect class="bgd-errors-halo" x="${ERRORS_HALO.x}" y="${ERRORS_HALO.y}" width="${ERRORS_HALO.w}" height="${ERRORS_HALO.h}" rx="${ERRORS_HALO.h / 2}" />
    ${errorReadout}`,
  })}

  ${requestsLayer()}
</svg>`;
