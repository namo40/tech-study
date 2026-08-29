/**
 * Static stage markup for the Database Migration scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Four bands, arranged around the one
 * thing this scene is about — the window in which old code and new schema have
 * to be true at the same time:
 *   - y 0..440        kept empty for the step title card
 *   - y 440..680      the App: two instance capsules, each carrying the version
 *                     it is running (`v1` or `v2`), and the `dual write` badge
 *                     that says what the newer version does with its writes.
 *                     Which versions are live is the whole premise: a rollout
 *                     is a span, not an instant
 *   - y 880..1270     the Schema: the phase the migration is in (`expand`,
 *                     `switch`, `contract`), `rows n` for how many rows the new
 *                     column holds, the two column headers, and six rows drawn
 *                     as a pair of cells each. A cell says where a value is,
 *                     and how it got there
 *   - y 1500..1740    the Reads: the last six answers as a strip, `ok n` for the
 *                     running total, and `error` for the one read that had
 *                     nowhere to look
 *
 * Three lane segments and no others, every one axis aligned. A write leaves the
 * App at x 310 and reaches the Schema's top edge; a read query leaves at x 770
 * and reaches the same edge; the answer leaves the Schema's bottom edge at
 * x 540 and reaches the Reads box. Writes and reads travel apart because the
 * scene's argument is about them differing: for most of it a v2 write touches
 * two columns while every read still touches one. The backfill has no lane at
 * all, because a backfill is not traffic — it is the database rewriting its own
 * rows, so it happens inside the Schema box as a row changing state.
 *
 * A traveller sweeps 26px around every point it reaches and a label keeps 30px
 * clear of that, so the three segments own three keep-outs: x 254..366 and
 * x 714..826 from y 624 to y 936, and x 484..596 from y 1214 to y 1556. That is
 * what decides the layout. The App keeps its capsules above y 624. The Schema
 * names itself below y 936 and stops its table at y 1231. The Reads box puts
 * its title and its readout on a line at y 1580, under the third keep-out.
 *
 * Declared texture: the twelve table cells and the six result slots. A cell
 * carries no number, because what the scene asks of it is not "what value" but
 * "is the value here, and who put it there" — and a second copy of the value
 * would be a second thing that could disagree.
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

/** The three lane columns: a write, a read query, an answer. */
export const X_WRITE = 310;
export const X_QUERY = 770;
export const X_RESULT = 540;

export const Y_APP_BOTTOM = 680;
export const Y_SCHEMA_TOP = 880;
export const Y_SCHEMA_BOTTOM = 1270;
export const Y_READS_TOP = 1500;

/** The App band, and the two capsules that are the instances running in it. */
const APP = { x: 130, y: 440, w: 820, h: 240 };
const APP_TITLE_X = 170;
const APP_TITLE_Y = 512;
const CAPSULE = { y: 546, w: 232, h: 66 };
const CAPSULE_XS = [166, 430] as const;
const CAPSULE_TEXT_Y = 590;
const DUAL = { x: 694, y: 546, w: 220, h: 66 };
const DUAL_TEXT_X = 804;

/** The Schema band. */
const SCHEMA = { x: 130, y: 880, w: 820, h: 390 };
const SCHEMA_TITLE_X = 170;
/** Below the two upper keep-outs, which reach y 936 at the top of the box. */
const SCHEMA_TITLE_Y = 984;
const PHASE = { x: 380, y: 942, w: 220, h: 62 };
const PHASE_TEXT_X = 490;
const ROWS_X = 914;

/** The two columns of the table, and the six rows under them. */
export const TABLE_ROWS = 6;
const HEADER_Y = 1048;
const COL_OLD = { x: 380, w: 200, centre: 480 };
const COL_NEW = { x: 660, w: 200, centre: 760 };
const ROW_Y0 = 1068;
const ROW_PITCH = 29;
const ROW_H = 24;

/** The Reads band: the last six answers, the total, and the one failure. */
const READS = { x: 280, y: 1500, w: 520, h: 240 };
const READS_TITLE_X = 320;
const READS_TITLE_Y = 1580;
const OK_X = 760;

/** How many answers the strip remembers. Older ones fall off the left. */
export const STRIP_SLOTS = 6;
const SLOT_X0 = 340;
const SLOT_PITCH = 72;
const SLOT_W = 52;
const SLOT_Y = 1620;
const SLOT_H = 52;

const ERROR_X = 540;
const ERROR_Y = 1712;

/** The most reads the scene can answer, which is what `ok n` counts up to. */
export const OK_MAX = 11;

// --- what the stage can say about itself -----------------------------------

/** Which version an App instance is running. */
export const VERSIONS = ['v1', 'v2'] as const;
export type Version = (typeof VERSIONS)[number];

/** Where the migration has got to. `none` is before the first step is taken. */
export const PHASES = ['none', 'expand', 'switch', 'contract'] as const;
export type Phase = (typeof PHASES)[number];

/**
 * The old column's cell in one row: holding its value, or not there at all.
 * `gone` covers both ways a column stops existing — the ghost's rename and the
 * contract's drop — because to a reader they are the same absence.
 */
export const OLD_CELLS = ['set', 'gone'] as const;
export type OldCell = (typeof OLD_CELLS)[number];

/**
 * The new column's cell. `absent` is no column at all; `empty` is a column with
 * nothing in this row yet; `dual` is a value the app wrote to both columns;
 * `back` is a value the backfill copied across; `moved` is what the ghost's
 * one-shot rename does, which is neither of the last two.
 */
export const NEW_CELLS = ['absent', 'empty', 'dual', 'back', 'moved'] as const;
export type NewCell = (typeof NEW_CELLS)[number];

/** Whether a cell is being written to at this instant. */
export const HIT_STATES = ['off', 'on'] as const;
export type HitState = (typeof HIT_STATES)[number];

/** One answer in the strip: which column it came from, or that it came back empty. */
export const SLOT_STATES = ['none', 'old', 'new', 'err'] as const;
export type SlotState = (typeof SLOT_STATES)[number];

/** Which column a v2 read is pointed at. v1 can only ever read the old one. */
export const READ_TARGETS = ['old', 'new'] as const;
export type ReadTarget = (typeof READ_TARGETS)[number];

/** What the scene is holding up for a moment, if anything. */
export const MARKS = [
  'none',
  'overlap',
  'compatible',
  'verify',
  'deployable',
  'reversible',
] as const;
export type Mark = (typeof MARKS)[number];

/**
 * What every `data-*` on the stage starts at. The markup below is written from
 * these, so the first frame is the whole diagram in its opening state — two v1
 * instances, one column with six rows in it, no migration started, no answer
 * given yet — and the timeline never restates it.
 */
export const STAGE_STATE: Record<string, string> = {
  'data-dm-ghost': 'off',
  'data-dm-phase': 'none',
  'data-dm-oldcol': 'on',
  'data-dm-newcol': 'off',
  'data-dm-dual': 'off',
  'data-dm-backfill': 'off',
  'data-dm-reads': 'old',
  'data-dm-rows': '0',
  'data-dm-ok': '0',
  'data-dm-err': 'off',
  'data-dm-mark': 'none',
  'data-dm-settled': 'off',
};

/** What every capsule, cell and result slot starts at. */
export const APP_STATE: Version = 'v1';
export const OLD_STATE: OldCell = 'set';
export const NEW_STATE: NewCell = 'absent';
export const HIT_STATE: HitState = 'off';
export const SLOT_STATE: SlotState = 'none';

// --- markup ----------------------------------------------------------------

/** Non-breaking spaces, so a monospaced label keeps its gaps in SVG. */
const mono = (text: string): string => text.replace(/ /g, '&#160;');

const pad = (n: number): string => `\n${' '.repeat(n)}`;

/** One instance of the app, with the two versions it can be running stacked. */
const capsule = (index: number): string => {
  const x = CAPSULE_XS[index] ?? 0;
  const centre = x + CAPSULE.w / 2;
  return `<g class="dm-app dm-app--${index}" data-dm-app="${APP_STATE}">
      <rect class="dm-app-bg" x="${x}" y="${CAPSULE.y}" width="${CAPSULE.w}" height="${CAPSULE.h}" rx="22" />
      ${VERSIONS.map(
        (version) =>
          `<text class="scene-counter scene-mono dm-app-text dm-app-text--${version}" x="${centre}" y="${CAPSULE_TEXT_Y}" text-anchor="middle">${version}</text>`,
      ).join(pad(6))}
    </g>`;
};

/** What the newer version does with a write, said only while it is doing it. */
const dualBadge = `<g class="dm-dual">
      <rect class="dm-dual-bg" x="${DUAL.x}" y="${DUAL.y}" width="${DUAL.w}" height="${DUAL.h}" rx="22" />
      <text class="scene-counter scene-mono dm-dual-text" x="${DUAL_TEXT_X}" y="${CAPSULE_TEXT_Y}" text-anchor="middle">${mono('dual write')}</text>
    </g>`;

/** Which of the three steps the schema is in, with the state showing one word. */
const phasePlate = `<g class="dm-phase">
      <rect class="dm-phase-bg" x="${PHASE.x}" y="${PHASE.y}" width="${PHASE.w}" height="${PHASE.h}" rx="22" />
      ${(['expand', 'switch', 'contract'] as const)
        .map(
          (phase) =>
            `<text class="scene-counter scene-mono dm-phase-text dm-phase-text--${phase}" x="${PHASE_TEXT_X}" y="${SCHEMA_TITLE_Y}" text-anchor="middle">${phase}</text>`,
        )
        .join(pad(6))}
    </g>`;

/** How many rows the new column holds. One text per value, the state picks one. */
const rowsReadout = counterVariants({
  x: ROWS_X,
  y: SCHEMA_TITLE_Y,
  className: 'dm-rows',
  max: TABLE_ROWS,
  format: (n) => mono(`rows ${n}`),
  anchor: 'end',
});

/** The two column headers, each drawn only while its column exists. */
const headers = [
  `<text class="scene-counter scene-mono dm-head dm-head--old" x="${COL_OLD.centre}" y="${HEADER_Y}" text-anchor="middle">name</text>`,
  `<text class="scene-counter scene-mono dm-head dm-head--new" x="${COL_NEW.centre}" y="${HEADER_Y}" text-anchor="middle">${mono('full_name')}</text>`,
].join(pad(4));

/** Six rows of two cells. Where a value is, and how it got there. */
const rows = Array.from({ length: TABLE_ROWS }, (_value, index) => index)
  .map((index) => {
    const y = ROW_Y0 + index * ROW_PITCH;
    return [
      `<rect class="dm-cell dm-cell-old dm-cell-old--${index + 1}" data-dm-cell-old="${OLD_STATE}" data-dm-hit="${HIT_STATE}" x="${COL_OLD.x}" y="${y}" width="${COL_OLD.w}" height="${ROW_H}" rx="8" />`,
      `<rect class="dm-cell dm-cell-new dm-cell-new--${index + 1}" data-dm-cell-new="${NEW_STATE}" data-dm-hit="${HIT_STATE}" x="${COL_NEW.x}" y="${y}" width="${COL_NEW.w}" height="${ROW_H}" rx="8" />`,
    ].join(pad(4));
  })
  .join(pad(4));

/** The last six answers, oldest on the left. */
const strip = Array.from({ length: STRIP_SLOTS }, (_value, index) => index)
  .map(
    (index) =>
      `<rect class="dm-slot dm-slot--${index + 1}" data-dm-slot="${SLOT_STATE}" x="${SLOT_X0 + index * SLOT_PITCH}" y="${SLOT_Y}" width="${SLOT_W}" height="${SLOT_H}" rx="12" />`,
  )
  .join(pad(4));

/** How many reads have been answered. */
const okReadout = counterVariants({
  x: OK_X,
  y: READS_TITLE_Y,
  className: 'dm-ok',
  max: OK_MAX,
  format: (n) => mono(`ok ${n}`),
  anchor: 'end',
});

const stageAttrs = Object.entries(STAGE_STATE)
  .map(([name, value]) => `${name}="${value}"`)
  .join(' ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageAttrs} aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_WRITE, Y_APP_BOTTOM, Y_SCHEMA_TOP, 'scene-link dm-lane dm-lane--write')}
  ${verticalLink(X_QUERY, Y_APP_BOTTOM, Y_SCHEMA_TOP, 'scene-link dm-lane dm-lane--query')}
  ${verticalLink(X_RESULT, Y_SCHEMA_BOTTOM, Y_READS_TOP, 'scene-link dm-lane dm-lane--result')}

  ${clientBox({
    x: APP.x,
    width: APP.w,
    y: APP.y,
    height: APP.h,
    title: 'App',
    titleX: APP_TITLE_X,
    titleY: APP_TITLE_Y,
    titleAnchor: null,
    extraClass: 'dm-appbox',
    children: `
    ${capsule(0)}

    ${capsule(1)}

    ${dualBadge}`,
  })}

  ${serviceBox({
    x: SCHEMA.x,
    width: SCHEMA.w,
    y: SCHEMA.y,
    height: SCHEMA.h,
    title: 'Schema',
    titleX: SCHEMA_TITLE_X,
    titleY: SCHEMA_TITLE_Y,
    titleAnchor: null,
    className: 'scene-node dm-schema',
    children: `
    ${phasePlate}

    ${rowsReadout}

    ${headers}

    ${rows}`,
  })}

  ${serviceBox({
    x: READS.x,
    width: READS.w,
    y: READS.y,
    height: READS.h,
    title: 'Reads',
    titleX: READS_TITLE_X,
    titleY: READS_TITLE_Y,
    titleAnchor: null,
    className: 'scene-service dm-reads',
    children: `
    ${okReadout}

    ${strip}

    <text class="scene-counter scene-mono dm-error" x="${ERROR_X}" y="${ERROR_Y}" text-anchor="middle">error</text>`,
  })}

  ${requestsLayer()}
</svg>`;
