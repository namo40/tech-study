/**
 * Static stage markup for the Deadlock scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. The bands are the usual ones, with
 * the database hanging lower than its neighbours' because it holds two rows
 * rather than one store:
 *   - y 0..400       above the cropped viewBox (see shared VIEWBOX)
 *   - y 400..440     the frame's top padding; nothing is drawn here
 *   - y 440..680     T1 and T2, one box each, one lane each
 *   - y 880..1270    Lock manager: the wait-for graph, the verdict it reaches,
 *                    and the lock order the third step imposes
 *   - y 1500..1850   Database: `row A` and `row B`, each a full width strip
 *                    with the one exclusive lock that row grants
 *   - y 1888         the three readouts the whole scene is counted on
 *
 * Two transactions, two lanes, and no other route. `X_T1` and `X_T2` run from
 * the transaction boxes straight down into the database, and every leg any
 * traveller makes is a move along one of them: there is no rail, no corner and
 * no diagonal anywhere in the scene. That is what the stacked rows buy. `row A`
 * sits above `row B`, so locking A before B is a move down the lane and locking
 * B before A is a move down and then back up, which is the difference the
 * middle two steps are about, drawn rather than captioned.
 *
 * The lanes are also what decides where a label may sit. Both sweep the full
 * height between y 594 and y 1798, so nothing is written inside x 162..256 or
 * x 824..918 — the wider of the two bounds, because a request in the last step
 * carries a version chip on the outer side of its lane. The Lock manager is
 * therefore drawn as its own 480 wide box between the lanes instead of the
 * usual full width frame: a node label written from x 170 would run under the
 * left lane, and the convention is worth more than the extra width. Inside the
 * database the rows span the full width, but their labels, their value chip and
 * the title above them all keep to x 300..790, which leaves 44px on each side
 * of a lane's swept box.
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

/** The lane each transaction travels on, and where it starts and rests. */
export const X_T1 = 230;
export const X_T2 = 850;
export const LANE_X = [X_T1, X_T2] as const;
export const Y_CLIENT = 620;

/** The two transaction boxes, one per lane. */
const CLIENT_Y = 440;
const CLIENT_H = 240;
const CLIENT_W = 200;
const ACT_Y = 556;

/** The Lock manager, drawn between the lanes rather than across them. */
const NODE_X = 300;
const NODE_W = 480;
const NODE_Y = 880;
const NODE_H = 390;
const NODE_RIGHT = NODE_X + NODE_W - 24;
const NODE_LABEL_Y = 938;
const ORDER_Y = 984;

/** The wait-for graph: one circle per transaction, one arrow per edge. */
const GRAPH_CY = 1080;
const GRAPH_R = 42;
const GRAPH_X = [420, 660];
const EDGE_LEFT = 474;
const EDGE_RIGHT = 606;
const EDGE_Y = [1058, 1102];
const WAITS_Y = 1035;
const DEADLOCK_Y = 1200;
const VICTIM_Y = 1248;

/** The database, and the two rows inside it. */
const DB_X = 130;
const DB_W = 820;
const DB_Y = 1500;
const DB_H = 350;
const DB_TITLE_Y = 1554;
const CONTENT_X = 300;

const ROW_X = 170;
const ROW_W = 740;
const ROW_H = 88;

/** Centre of each row, which is the row a traveller stands on inside it. */
export const Y_ROW_A = 1630;
export const Y_ROW_B = 1772;

/**
 * Where a traveller stands when the row it reached is locked by the other
 * transaction. It is the gap above the row, so waiting for A and waiting for B
 * are told apart by which row the dot has stopped short of.
 */
export const Y_WAIT_A = 1546;
export const Y_WAIT_B = 1701;

/**
 * The row's own lock, drawn inboard of the left lane rather than on it: a
 * traveller stands on its lane, so a slot centred on one would be read through
 * a request dot every time a lock is taken.
 */
const SLOT_SIDE = 48;
const SLOT_CX = 310;
const ROW_LABEL_X = 356;

/** The value `row A` carries, and the version stamped on it. */
const VALUE_X = 460;
const VALUE_W = 330;
const VALUE_H = 56;
const VALUE_Y = 1602;
const VALUE_TEXT_X = VALUE_X + VALUE_W / 2;

/** The readout row, under the database because a tally is not a store. */
const READOUT_Y = 1888;

/** The version chip a traveller carries, on the outer side of its lane. */
export const CHIP_DX = 46;
export const CHIP_W = 44;
export const CHIP_H = 30;

// --- what the scene is told about the row ----------------------------------

/** The value `row A` starts at, and the version stamped on that value. */
export const BASE_VALUE = 10;
export const BASE_VERSION = 7;

/**
 * What each optimistic writer adds to the row. Everything the reader counts on
 * `row A` falls out of these two numbers: the values are the running total, and
 * the versions are one per write that landed, which is why the second writer
 * ends on 13 rather than on the 12 it first tried to write.
 */
export const DELTAS = [1, 2] as const;

export interface RowState {
  value: number;
  version: number;
}

/** The states `row A` passes through, oldest first. */
export const ROW_A_STATES: RowState[] = DELTAS.reduce<RowState[]>(
  (states, delta) => {
    const last = states[states.length - 1] as RowState;
    states.push({ value: last.value + delta, version: last.version + 1 });
    return states;
  },
  [{ value: BASE_VALUE, version: BASE_VERSION }],
);

/** `data-row-a` value for the row state at `index`. */
export const rowKey = (index: number): string => `v${ROW_A_STATES[index]?.version ?? BASE_VERSION}`;

/** How high each readout can count. */
export const COMMITS_MAX = 12;
export const DEADLOCKS_MAX = 1;
export const RETRIES_MAX = 2;

/** Every label a transaction box can show, keyed by the `data-act` value. */
const ACTS: [string, string][] = [
  ['lock-a', 'lock A'],
  ['lock-b', 'lock B'],
  ['wait', 'wait'],
  ['commit', 'commit'],
  ['retry', 'retry'],
  ['read', 'read'],
  ['write', 'write'],
  ['conflict', 'conflict'],
];

/**
 * What every `data-*` on the stage starts at, keyed by the target the timeline
 * addresses it through. The markup below is written from this, so a change that
 * writes a value something already holds can be dropped rather than tweened.
 */
export const STAGE_STATE: Record<string, string> = {
  'stage@data-mode': 'lock',
  'stage@data-order': 'off',
  'stage@data-graph': 'ok',
  'stage@data-wait1': 'off',
  'stage@data-wait2': 'off',
  'stage@data-hold1': '0',
  'stage@data-hold2': '0',
  'stage@data-deadlock': 'off',
  'stage@data-victim': 'none',
  'stage@data-row-a': 'base',
  'stage@data-commits': '0',
  'stage@data-deadlocks': '0',
  'stage@data-retries': '0',
  'txn-1@data-act': 'none',
  'txn-2@data-act': 'none',
  'slot-a@data-lock': 'free',
  'slot-b@data-lock': 'free',
};

// --- markup ----------------------------------------------------------------

/** One transaction box: its name, and the one thing it is doing right now. */
const txnBox = (index: number): string => {
  const centre = LANE_X[index] ?? 0;
  const acts = ACTS.map(
    ([key, label]) =>
      `<text class="scene-flash dl-act dl-act--${key}" x="${centre}" y="${ACT_Y}" text-anchor="middle">${label}</text>`,
  ).join('\n      ');
  return clientBox({
    x: centre - CLIENT_W / 2,
    width: CLIENT_W,
    y: CLIENT_Y,
    height: CLIENT_H,
    title: `T${index + 1}`,
    titleX: centre,
    titleY: 512,
    extraClass: `dl-txn dl-txn--${index + 1}`,
    children: `
    <g class="dl-acts dl-acts--${index + 1}" data-act="none">
      ${acts}
    </g>`,
  });
};

/** One node of the wait-for graph. It fills while that transaction holds a row. */
const graphNode = (index: number): string => `<g class="dl-gnode dl-gnode--${index + 1}">
      <circle class="dl-gnode-ring" cx="${GRAPH_X[index]}" cy="${GRAPH_CY}" r="${GRAPH_R}" />
      <text class="dl-gnode-text" x="${GRAPH_X[index]}" y="${GRAPH_CY + 11}" text-anchor="middle">T${index + 1}</text>
    </g>`;

/**
 * One `waits for` edge. Edge 1 runs left to right because T1 waiting for T2 is
 * drawn as an arrow into T2; edge 2 runs the other way on its own row, so a
 * cycle is two arrows facing each other rather than one line with two heads.
 */
const edge = (index: number): string => {
  const y = EDGE_Y[index] ?? 0;
  const head =
    index === 0
      ? `M ${EDGE_RIGHT - 16} ${y - 11} L ${EDGE_RIGHT} ${y} L ${EDGE_RIGHT - 16} ${y + 11}`
      : `M ${EDGE_LEFT + 16} ${y - 11} L ${EDGE_LEFT} ${y} L ${EDGE_LEFT + 16} ${y + 11}`;
  return `<g class="dl-edge dl-edge--${index + 1}">
      <line class="dl-edge-line" x1="${EDGE_LEFT}" y1="${y}" x2="${EDGE_RIGHT}" y2="${y}" />
      <path class="dl-edge-head" d="${head}" />
    </g>`;
};

/** The exclusive lock on one row, empty until a transaction fills it. */
const slot = (row: 'a' | 'b'): string => {
  const cy = row === 'a' ? Y_ROW_A : Y_ROW_B;
  return `<g class="dl-slot dl-slot--${row}" data-lock="free">
        <rect class="scene-slot dl-slot-box" x="${SLOT_CX - SLOT_SIDE / 2}" y="${cy - SLOT_SIDE / 2}" width="${SLOT_SIDE}" height="${SLOT_SIDE}" rx="12" />
        <text class="dl-x" x="${SLOT_CX}" y="${cy + 10}" text-anchor="middle">X</text>
      </g>`;
};

/** One row of the database: two lock slots, a name, and for `row A` a value. */
const rowStrip = (row: 'a' | 'b'): string => {
  const centre = row === 'a' ? Y_ROW_A : Y_ROW_B;
  const value =
    row === 'a'
      ? `\n      ${chip({
          x: VALUE_X,
          y: VALUE_Y,
          width: VALUE_W,
          height: VALUE_H,
          rx: 20,
          className: 'dl-value',
          variant: 'outline',
          indent: 6,
          text: [
            `<text class="scene-counter dl-value-text dl-value-text--base" x="${VALUE_TEXT_X}" y="${centre + 10}" text-anchor="middle">A = ${BASE_VALUE}</text>`,
            ...ROW_A_STATES.map(
              (state) =>
                `<text class="scene-counter dl-value-text dl-value-text--v${state.version}" x="${VALUE_TEXT_X}" y="${centre + 10}" text-anchor="middle">A = ${state.value} &#183; rowversion ${state.version}</text>`,
            ),
          ].join('\n        '),
        })}`
      : '';
  return `<g class="dl-row dl-row--${row}">
      <rect class="scene-box dl-row-box" x="${ROW_X}" y="${centre - ROW_H / 2}" width="${ROW_W}" height="${ROW_H}" rx="20" />
      <text class="dl-row-label" x="${ROW_LABEL_X}" y="${centre + 10}">row ${row.toUpperCase()}</text>
      ${slot(row)}${value}
    </g>`;
};

const commits = counterVariants({
  x: ROW_X,
  y: READOUT_Y,
  className: 'dl-commits',
  max: COMMITS_MAX,
  format: (n) => `commits ${n}`,
  indent: 2,
});

const deadlocks = counterVariants({
  x: 540,
  y: READOUT_Y,
  className: 'dl-deadlocks',
  max: DEADLOCKS_MAX,
  anchor: 'middle',
  format: (n) => `deadlocks ${n}`,
  indent: 2,
});

const retries = counterVariants({
  x: ROW_X + ROW_W,
  y: READOUT_Y,
  className: 'dl-retries',
  max: RETRIES_MAX,
  anchor: 'end',
  format: (n) => `retries ${n}`,
  indent: 2,
});

const victims = [1, 2]
  .map(
    (n) =>
      `<text class="scene-flash dl-victim dl-victim--t${n}" x="540" y="${VICTIM_Y}" text-anchor="middle">victim T${n}</text>`,
  )
  .join('\n    ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" data-mode="lock" data-order="off" data-graph="ok" data-wait1="off" data-wait2="off" data-hold1="0" data-hold2="0" data-deadlock="off" data-victim="none" data-row-a="base" data-commits="0" data-deadlocks="0" data-retries="0" aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_T1, CLIENT_Y + CLIENT_H, DB_Y)}
  ${verticalLink(X_T2, CLIENT_Y + CLIENT_H, DB_Y)}

  ${txnBox(0)}

  ${txnBox(1)}

  <g class="dl-node">
    <rect class="scene-box" x="${NODE_X}" y="${NODE_Y}" width="${NODE_W}" height="${NODE_H}" rx="28" />
    <text class="scene-node-label" x="${NODE_X + 24}" y="${NODE_LABEL_Y}">Lock manager</text>
    <text class="scene-flash dl-order" x="${NODE_RIGHT}" y="${ORDER_Y}" text-anchor="end">order: A then B</text>

    <text class="scene-caption-label dl-waits" x="540" y="${WAITS_Y}" text-anchor="middle">waits for</text>
    ${graphNode(0)}
    ${graphNode(1)}
    ${edge(0)}
    ${edge(1)}

    <text class="scene-flash dl-deadlock" x="540" y="${DEADLOCK_Y}" text-anchor="middle">deadlock</text>
    ${victims}
  </g>

  ${serviceBox({
    x: DB_X,
    width: DB_W,
    y: DB_Y,
    height: DB_H,
    title: 'Database',
    titleX: CONTENT_X,
    titleY: DB_TITLE_Y,
    titleClass: 'scene-node-label',
    titleAnchor: null,
    className: 'dl-db',
    before: `
    ${verticalLink(X_T1, DB_Y, Y_ROW_B)}
    ${verticalLink(X_T2, DB_Y, Y_ROW_B)}`,
    children: `
    ${rowStrip('a')}

    ${rowStrip('b')}`,
  })}

  ${commits}
  ${deadlocks}
  ${retries}

  ${requestsLayer()}
</svg>`;
