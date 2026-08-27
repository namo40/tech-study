/**
 * Static stage markup for the Isolation Level scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. The bands are the usual ones, with
 * the bottom box hanging lower than its neighbours' because it holds a five row
 * table rather than one store:
 *   - y 0..440       kept empty for the step title card
 *   - y 440..680     T1 and T2, one box each, one lane each: the statement
 *                    being run and the state the transaction is in
 *   - y 880..1270    Row: the one row both transactions touch, with the lock on
 *                    it, the value and version it carries, and the level dial
 *   - y 1500..1820   Anomalies: the waits gauge, and the table of which
 *                    anomaly each level permits
 *
 * Two transactions, two lanes, and no other route. `X_T1` and `X_T2` run from
 * the transaction boxes straight down to the top of the Row, and every leg any
 * traveller makes is a move along one of them: there is no rail, no corner and
 * no diagonal anywhere in the scene. A traveller that finds the row held by the
 * other transaction stops at `Y_WAIT`, short of the row, so waiting is drawn as
 * a distance rather than a colour.
 *
 * The lanes are also what decides where a label may sit. Both sweep between
 * y 680 and y 880, so nothing is written inside x 254..366 or x 714..826 in the
 * band y 624..936 — the swept box grown by the halo radius and the label
 * keep-out. In practice that costs the transaction boxes their bottom 56px,
 * which is why the status badge sits on a baseline of 606 rather than lower,
 * and it costs the Row its top strip, which is why the `Row` label is written
 * from x 170 where no lane passes.
 *
 * Everything the reader reads off the stage is a stack: one text element per
 * value, all on one spot, all hidden by the base rule, and exactly one revealed
 * by the `data-*` value the timeline writes. Nothing interpolates, so scrubbing
 * backwards lands on the right statement, the right stock, the right level.
 */

import {
  VIEWBOX,
  chip,
  clientBox,
  nodeFrame,
  requestsLayer,
  serviceBox,
  verticalLink,
} from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- geometry --------------------------------------------------------------

/** The lane each transaction travels on, through the centre of its own box. */
export const X_T1 = 310;
export const X_T2 = 770;
export const LANE_X = [X_T1, X_T2] as const;

/** Bottom edge of a transaction box: where a traveller starts and comes home. */
export const Y_TXN = 680;
/** Top edge of the Row: where a traveller lands to read or write. */
export const Y_ROW = 880;
/**
 * Where a traveller stops when the row is held by the other transaction. It is
 * short of the row rather than on it, so a wait is a gap the reader can see.
 */
export const Y_WAIT = 800;

/** The two transaction boxes, one per lane. */
const TXN_Y = 440;
const TXN_H = 240;
const TXN_W = 360;
const TITLE_Y = 502;
const STMT_Y = 556;
const STMT_BOX_Y = 526;
const STMT_BOX_H = 44;
const STMT_BOX_W = 240;
const STATUS_Y = 606;

/** The Row, and what is drawn inside it. */
const ROW_Y = 880;
const ROW_H = 390;
const ROW_LABEL_Y = 936;

/** The lock on the row, drawn inboard of the left lane rather than on it. */
const LOCK_CX = 216;
const LOCK_CY = 1090;

/** The value the row carries, and the version stamped on it. */
const VALUE_X = 300;
const VALUE_W = 340;
const VALUE_Y = 1030;
const VALUE_H = 120;
const VALUE_TEXT_Y = 1112;
const VERSION_Y = 1170;
const VERSION_H = 60;
const VERSION_TEXT_Y = 1211;
const VALUE_TEXT_X = VALUE_X + VALUE_W / 2;

/** The level dial: the level it is set to, over the four positions it has. */
const DIAL_X = 786;
const DIAL_TEXT_Y = 1000;
const TICK_Y = 1030;
const TICK_W = 52;
const TICK_H = 28;
const TICK_CX = [690, 754, 818, 882];

/** The Anomalies box: the waits gauge on its title row, then the table. */
const TABLE_X = 130;
const TABLE_W = 820;
const TABLE_Y = 1500;
const TABLE_H = 320;
const TABLE_TITLE_Y = 1552;
const GAUGE_X = 520;
const GAUGE_W = 210;
const GAUGE_Y = 1532;
const GAUGE_H = 26;
const WAITS_X = 930;
const WAITS_Y = 1554;
const HEAD_Y = 1614;
const LEVEL_X = 170;
const ROW_ONE_Y = 1660;
const ROW_PITCH = 46;
const HL_X = 150;
const HL_W = 780;
const HL_H = 40;
const COL_CX = [530, 700, 870];
const COL_HALF = 78;

/** The chip a traveller carries on the outer side of its lane. */
export const CHIP_DX = 74;
export const CHIP_W = 132;
export const CHIP_H = 36;

// --- what the scene is told about the row and the levels --------------------

/** The isolation levels, in the order the dial and the table list them. */
export const LEVELS = ['rc', 'rr', 'snap', 'ser'] as const;
export type Level = (typeof LEVELS)[number];

/** The name each level is written under, which is also its label on the dial. */
export const LEVEL_NAMES: Record<Level, string> = {
  rc: 'READ COMMITTED',
  rr: 'REPEATABLE READ',
  snap: 'SNAPSHOT',
  ser: 'SERIALIZABLE',
};

/** The three anomalies the table has a column for. */
export const ANOMALIES = ['dirty', 'nonrep', 'phantom'] as const;
export type Anomaly = (typeof ANOMALIES)[number];

export const ANOMALY_NAMES: Record<Anomaly, string> = {
  dirty: 'dirty read',
  nonrep: 'non-repeatable',
  phantom: 'phantom',
};

/**
 * What each level does, which is the whole of what the scene is told.
 *
 * `readWait` is how long a reader is held when the row is being written by
 * somebody else, `writerWaits` is whether a writer has to wait for a reading
 * transaction to finish, `readsSnapshot` is whether a read answers from the
 * version the transaction began on, `versionChecked` is whether a write is
 * refused when the row moved on since then, and `rangeLocks` is whether the
 * gaps between rows are held as well as the rows. Every ✓ and ✕ in the table,
 * every wait the gauge counts and every rollback the scene shows is derived
 * from these rules: nothing about the outcome is written down twice.
 */
export interface LevelRules {
  readWait: number;
  writerWaits: boolean;
  readsSnapshot: boolean;
  versionChecked: boolean;
  /** Whether it locks the gaps between rows as well as the rows themselves. */
  rangeLocks: boolean;
  /** What the gauge settles on while this level is the one in force, in ms. */
  waitCost: number;
}

export const RULES: Record<Level, LevelRules> = {
  rc: { readWait: 0.6, writerWaits: false, readsSnapshot: false, versionChecked: false, rangeLocks: false, waitCost: 40 },
  rr: { readWait: 0.6, writerWaits: true, readsSnapshot: false, versionChecked: false, rangeLocks: false, waitCost: 200 },
  snap: { readWait: 0, writerWaits: false, readsSnapshot: true, versionChecked: true, rangeLocks: false, waitCost: 80 },
  ser: { readWait: 0.8, writerWaits: true, readsSnapshot: false, versionChecked: false, rangeLocks: true, waitCost: 400 },
};

/**
 * Whether a level lets an anomaly through, worked out from the same rules.
 *
 * A dirty read is a read of an uncommitted value, and none of these four levels
 * ever serves one, so the whole column is blocked — that is what "read
 * committed is the floor" means. A non-repeatable read needs a read that can
 * see a change committed after it began, which only a level that neither holds
 * its read locks nor answers from a snapshot allows. A phantom is a row that
 * was not there to be held in the first place, so holding read locks does not
 * close it: only reading from a snapshot, or locking the gaps between the rows
 * as well as the rows, does.
 */
export function permits(level: Level, anomaly: Anomaly): boolean {
  const rules = RULES[level];
  if (anomaly === 'dirty') return false;
  if (anomaly === 'nonrep') return !rules.writerWaits && !rules.readsSnapshot;
  return !rules.readsSnapshot && !rules.rangeLocks;
}

/** Every value the row's `stock` takes, so the chip has a variant for each. */
export const STOCK_VALUES = [1, 2, 3, 5, 6] as const;
/** Every version the row is stamped with once versions are on show. */
export const VERSION_VALUES = [7, 8, 9] as const;

/** The gauge counts in steps of `WAITS_STEP` and stops at `WAITS_MAX`. */
export const WAITS_STEP = 40;
export const WAITS_MAX = 400;
export const WAITS_VALUES = Array.from(
  { length: WAITS_MAX / WAITS_STEP + 1 },
  (_value, n) => n * WAITS_STEP,
);

/** Every statement a transaction box can show, keyed by the `data-stmt` value. */
export const STATEMENTS: [string, string][] = [
  ['begin', 'BEGIN'],
  ['update', 'UPDATE'],
  ['select', 'SELECT'],
  ['commit', 'COMMIT'],
  ['rollback', 'ROLLBACK'],
];

/** Every state a transaction box can show, keyed by the `data-st` value. */
export const STATUSES: [string, string][] = [
  ['running', 'running'],
  ['waiting', 'waiting'],
  ['committed', 'committed'],
  ['rolled-back', 'rolled back'],
];

/**
 * What every `data-*` on the stage starts at, keyed by the target the timeline
 * addresses it through. The markup below is written from this, so a change that
 * writes a value something already holds can be dropped rather than tweened.
 */
export const STAGE_STATE: Record<string, string> = {
  'stage@data-level': 'rc',
  'stage@data-stock': '5',
  'stage@data-version': 'none',
  'stage@data-rowlock': 'free',
  'stage@data-waits': '0',
  'stage@data-mark': 'none',
  'stmt-1@data-stmt': 'none',
  'stmt-2@data-stmt': 'none',
  'status-1@data-st': 'none',
  'status-2@data-st': 'none',
};

// --- markup ----------------------------------------------------------------

/**
 * One stack of text variants: n text elements on one spot, all hidden by
 * `.scene-counter`, with CSS revealing the one the current `data-*` value
 * names. Every readout on this stage is built with it, so no two of them can
 * disagree about how a value is shown.
 */
const stack = (
  entries: [string, string][],
  className: string,
  x: number,
  y: number,
  indent: number,
  anchor = 'middle',
): string =>
  entries
    .map(
      ([key, label]) =>
        `<text class="scene-counter ${className} ${className}--${key}" x="${x}" y="${y}" text-anchor="${anchor}">${label}</text>`,
    )
    .join(`\n${' '.repeat(indent)}`);

/** One transaction box: its name, the statement it is running, its state. */
const txnBox = (index: number): string => {
  const centre = LANE_X[index] ?? 0;
  return clientBox({
    x: centre - TXN_W / 2,
    width: TXN_W,
    y: TXN_Y,
    height: TXN_H,
    title: `T${index + 1}`,
    titleX: centre,
    titleY: TITLE_Y,
    extraClass: `il-txn--${index + 1}`,
    children: `
    <g class="il-stmt" data-stmt="none">
      <rect class="il-stmt-bg" x="${centre - STMT_BOX_W / 2}" y="${STMT_BOX_Y}" width="${STMT_BOX_W}" height="${STMT_BOX_H}" rx="16" />
      ${stack(STATEMENTS, 'il-stmt-text', centre, STMT_Y, 6)}
    </g>
    <g class="il-status" data-st="none">
      ${stack(STATUSES, 'il-status-text', centre, STATUS_Y, 6)}
    </g>`,
  });
};

/**
 * The lock on the row. It is a padlock rather than a coloured square because
 * the square next to it is the value, and two squares telling different stories
 * is one square too many.
 */
const lockMark = `<g class="il-lock">
      <path class="il-lock-shackle" d="M ${LOCK_CX - 20} ${LOCK_CY - 8} L ${LOCK_CX - 20} ${LOCK_CY - 22} A 20 20 0 0 1 ${LOCK_CX + 20} ${LOCK_CY - 22} L ${LOCK_CX + 20} ${LOCK_CY - 8}" />
      <rect class="il-lock-body" x="${LOCK_CX - 30}" y="${LOCK_CY - 8}" width="60" height="46" rx="10" />
    </g>`;

const stockChip = chip({
  x: VALUE_X,
  y: VALUE_Y,
  width: VALUE_W,
  height: VALUE_H,
  rx: 30,
  className: 'il-stock',
  variant: 'outline',
  indent: 4,
  text: stack(
    STOCK_VALUES.map((n) => [String(n), `stock ${n}`] as [string, string]),
    'il-stock-text',
    VALUE_TEXT_X,
    VALUE_TEXT_Y,
    6,
  ),
});

const versionChip = chip({
  x: VALUE_X,
  y: VERSION_Y,
  width: VALUE_W,
  height: VERSION_H,
  rx: 20,
  className: 'il-version',
  variant: 'outline',
  indent: 4,
  text: stack(
    VERSION_VALUES.map((n) => [String(n), `version ${n}`] as [string, string]),
    'il-version-text',
    VALUE_TEXT_X,
    VERSION_TEXT_Y,
    6,
  ),
});

/** The dial: the level in force, over the four positions it can be set to. */
const dial = `<g>
    ${stack(
      LEVELS.map((level) => [level, LEVEL_NAMES[level]] as [string, string]),
      'il-dial-text',
      DIAL_X,
      DIAL_TEXT_Y,
      4,
    )}
    ${LEVELS.map(
      (level, index) =>
        `<rect class="il-tick il-tick--${level}" x="${(TICK_CX[index] ?? 0) - TICK_W / 2}" y="${TICK_Y}" width="${TICK_W}" height="${TICK_H}" rx="8" />`,
    ).join('\n    ')}
  </g>`;

/** The stripe behind the level the dial is set to, one per level. */
const rowHighlights = LEVELS.map(
  (level, index) =>
    `<rect class="il-rowhl il-rowhl--${level}" x="${HL_X}" y="${ROW_ONE_Y + index * ROW_PITCH - 30}" width="${HL_W}" height="${HL_H}" rx="12" />`,
).join('\n    ');

/** The stripe behind the anomaly being demonstrated, one per anomaly. */
const colHighlights = ANOMALIES.map(
  (anomaly, index) =>
    `<rect class="il-colhl il-colhl--${anomaly}" x="${(COL_CX[index] ?? 0) - COL_HALF}" y="${HEAD_Y - 30}" width="${COL_HALF * 2}" height="${ROW_PITCH * 3 + 90}" rx="14" />`,
).join('\n    ');

const headings = ANOMALIES.map(
  (anomaly, index) =>
    `<text class="il-head" x="${COL_CX[index] ?? 0}" y="${HEAD_Y}" text-anchor="middle">${ANOMALY_NAMES[anomaly]}</text>`,
).join('\n    ');

const levelRows = LEVELS.map((level, row) => {
  const y = ROW_ONE_Y + row * ROW_PITCH;
  const cells = ANOMALIES.map((anomaly, column) => {
    const state = permits(level, anomaly) ? 'allow' : 'block';
    const x = COL_CX[column] ?? 0;
    return `<g class="il-cell" data-cell="${state}">
        <text class="scene-counter il-cell-text il-cell-text--allow" x="${x}" y="${y}" text-anchor="middle">&#10007;</text>
        <text class="scene-counter il-cell-text il-cell-text--block" x="${x}" y="${y}" text-anchor="middle">&#10003;</text>
      </g>`;
  }).join('\n      ');
  return `<g>
      <text class="il-level il-level--${level}" x="${LEVEL_X}" y="${y}">${LEVEL_NAMES[level]}</text>
      ${cells}
    </g>`;
}).join('\n\n    ');

/** The gauge's track, which the fill below is measured against. */
const gauge = `<rect class="scene-track il-gauge-track" x="${GAUGE_X}" y="${GAUGE_Y}" width="${GAUGE_W}" height="${GAUGE_H}" rx="13" />`;

/**
 * The gauge's fill is a stack like everything else: one rectangle per value the
 * counter can hold, so the bar and the number can never disagree and neither
 * has to be undone when the reader scrubs backwards.
 */
const gaugeFills = WAITS_VALUES.map(
  (n) =>
    `<rect class="scene-fill il-gaugefill il-gaugefill--${n}" x="${GAUGE_X}" y="${GAUGE_Y}" width="${Math.round((n / WAITS_MAX) * GAUGE_W)}" height="${GAUGE_H}" rx="13" />`,
).join('\n    ');

const waits = stack(
  WAITS_VALUES.map((n) => [String(n), `waits ${n} ms`] as [string, string]),
  'il-waits',
  WAITS_X,
  WAITS_Y,
  2,
  'end',
);

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" data-level="rc" data-stock="5" data-version="none" data-rowlock="free" data-waits="0" data-mark="none" aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_T1, Y_TXN, Y_ROW)}
  ${verticalLink(X_T2, Y_TXN, Y_ROW)}

  ${txnBox(0)}

  ${txnBox(1)}

  ${nodeFrame({
    y: ROW_Y,
    height: ROW_H,
    label: 'Row',
    labelY: ROW_LABEL_Y,
    children: `    ${lockMark}

    ${stockChip}

    ${versionChip}

    ${dial}`,
  })}

  ${serviceBox({
    x: TABLE_X,
    width: TABLE_W,
    y: TABLE_Y,
    height: TABLE_H,
    title: 'Anomalies',
    titleX: LEVEL_X,
    titleY: TABLE_TITLE_Y,
    titleClass: 'scene-node-label',
    titleAnchor: null,
    className: 'il-table',
    children: `
    ${gauge}
    ${gaugeFills}
    ${waits}

    ${rowHighlights}

    ${colHighlights}

    ${headings}

    ${levelRows}`,
  })}

  ${requestsLayer()}
</svg>`;
