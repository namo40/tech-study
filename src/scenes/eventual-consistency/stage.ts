/**
 * Static stage markup for the Eventual Consistency scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. The bands are the usual ones:
 *   - y 0..400       above the cropped viewBox (see shared VIEWBOX)
 *   - y 400..440     the frame's top padding; nothing is drawn here
 *   - y 440..640     Client: the write it is issuing, the read it is issuing,
 *                    and whether its reads are pinned to a session
 *   - y 880..1270    Primary: the value it holds, how many writes it has taken,
 *                    and the commit strip those writes leave behind
 *   - y 1385         the rail replication fans out on
 *   - y 1500..1850   Replica A on the left, Replica B on the right, each with
 *                    the value it holds and how far behind it is
 *   - y 1892         whether the three copies agree
 *
 * Four lines and no others carry a traveller. Writes and strong reads go down
 * the trunk at `X_TRUNK` from the Client to the top of the Primary. Eventual
 * reads go straight down `X_A` and `X_B` from the Client to the top of a
 * replica, which is possible because the Primary is narrow enough that neither
 * column crosses it. Replication leaves the bottom of the Primary on the trunk,
 * turns once on the rail at `Y_RAIL`, and turns again onto the same two columns
 * the reads use: the two corners at (`X_A`, `Y_RAIL`) and (`X_B`, `Y_RAIL`) are
 * one exact point shared by both, and reads are scheduled around replication
 * rather than drawn around it.
 *
 * That is what decides where a label may sit. Both read columns sweep from the
 * bottom of the Client to the top of a replica, so the Client writes its chips
 * high enough to clear the halo of a request leaving it, each replica names
 * itself well below its own top edge, and the staleness bound is written to the
 * right of the B column rather than above it.
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

/** The trunk writes and strong reads travel on. */
export const X_TRUNK = 540;
/** The two columns eventual reads and replication travel on. */
export const X_A = 310;
export const X_B = 770;

/** The Client box, and where a request leaves it. */
const CLIENT_X = 280;
const CLIENT_W = 520;
const CLIENT_Y = 440;
const CLIENT_H = 200;
export const Y_CLIENT = CLIENT_Y + CLIENT_H;
const CLIENT_TITLE_Y = 492;
const SESSION_Y = 496;
const SESSION_X = 780;

/** The two chips inside the Client: the write it issues and the read it issues. */
const CHIP_Y = 518;
const CHIP_H = 62;
const CHIP_W = 190;
const WRITE_CHIP_X = 292;
const READ_CHIP_X = 598;
const CHIP_TEXT_Y = 559;

/** The Primary box. It is narrow so the read columns pass either side of it. */
const PRIMARY_X = 380;
const PRIMARY_W = 320;
export const Y_PRIMARY = 880;
const PRIMARY_H = 390;
export const Y_PRIMARY_BOTTOM = Y_PRIMARY + PRIMARY_H;
const PRIMARY_TITLE_Y = 966;
const WRITES_Y = 1012;
const WRITES_X = 676;
const PVALUE_Y = 1052;
const PVALUE_W = 220;
const PVALUE_H = 94;
const PVALUE_TEXT_Y = 1114;

/** The commit strip: one cell per write the Primary has taken. */
const CELL_Y = 1170;
const CELL_H = 34;
const CELL_W = 14;
const CELL_GAP = 5;
const CELL_X0 = 400;

/** The rail replication fans out on, below the Primary and above the replicas. */
export const Y_RAIL = 1385;

/** The two replica boxes, reached by the columns the reads use. */
const REP_A_X = 130;
const REP_B_X = 590;
const REP_W = 360;
export const Y_REPLICA = 1500;
const REP_H = 350;
const REP_TITLE_Y = 1586;
const RVALUE_Y = 1626;
const RVALUE_W = 220;
const RVALUE_H = 86;
const RVALUE_TEXT_Y = 1684;
const LAG_Y = 1772;

/** Whether the three copies agree, written under both replicas. */
const CONV_Y = 1892;
const CONV_X = 620;

/** The staleness bound drawn over Replica B, and where it is named. */
export const Y_GATE = 1452;
const GATE_LABEL_X = 1044;
const GATE_LABEL_Y = 1436;

/** The highest version the scene writes, which every value stack counts to. */
export const MAX_VERSION = 15;

/** The lag readout: how far it reads in, and how far it reads up to. */
export const LAG_STEP_MS = 20;
export const LAG_MAX_MS = 2400;
export const LAG_STEPS = LAG_MAX_MS / LAG_STEP_MS + 1;

/** The bound a replica has to stay inside to keep taking eventual reads. */
export const GATE_MS = 200;

/**
 * What every `data-*` on the stage starts at, keyed by the target the timeline
 * addresses it through, so a change that writes a value something already holds
 * can be dropped rather than tweened.
 */
export const STAGE_STATE: Record<string, string> = {
  'stage@data-ec-conv': 'yes',
  'stage@data-ec-session': 'off',
  'stage@data-ec-gate': 'off',
  'stage@data-ec-write': '1',
  'primary@data-ec-val': '1',
  'primary@data-ec-writes': '1',
  'repA@data-ec-val': '1',
  'repA@data-ec-lag': '0',
  'repB@data-ec-val': '1',
  'repB@data-ec-lag': '0',
};

// --- markup ----------------------------------------------------------------

/** The value one copy holds, one text variant per version it can hold. */
const valueText = (centre: number, y: number): string =>
  counterVariants({
    x: centre,
    y,
    className: 'ec-val',
    count: MAX_VERSION + 1,
    anchor: 'middle',
    format: (n) => `v ${n}`,
    indent: 6,
  });

const valueChip = (centre: number, y: number, width: number, height: number, textY: number): string =>
  chip({
    x: centre - width / 2,
    y,
    width,
    height,
    rx: 22,
    className: 'ec-value',
    variant: 'outline',
    text: valueText(centre, textY),
    indent: 4,
  });

/** The write the Client is issuing, and the read it is issuing. */
const writeChipText = counterVariants({
  x: WRITE_CHIP_X + CHIP_W / 2,
  y: CHIP_TEXT_Y,
  className: 'ec-write',
  count: MAX_VERSION + 1,
  anchor: 'middle',
  format: (n) => `write v ${n}`,
  indent: 6,
});

const writeChip = chip({
  x: WRITE_CHIP_X,
  y: CHIP_Y,
  width: CHIP_W,
  height: CHIP_H,
  rx: 20,
  className: 'ec-write-chip',
  variant: 'outline',
  text: writeChipText,
});

const readChip = chip({
  x: READ_CHIP_X,
  y: CHIP_Y,
  width: CHIP_W,
  height: CHIP_H,
  rx: 20,
  className: 'ec-read-chip',
  variant: 'outline',
  text: `<text class="ec-read-text" x="${READ_CHIP_X + CHIP_W / 2}" y="${CHIP_TEXT_Y}" text-anchor="middle">read</text>`,
});

/** The commit strip under the Primary's value. */
const commitStrip = Array.from({ length: MAX_VERSION }, (_value, index) => {
  const n = index + 1;
  const x = CELL_X0 + index * (CELL_W + CELL_GAP);
  return `<rect class="ec-cell ec-cell--${n}" data-ec-cell="${n === 1 ? 'on' : 'off'}" x="${x}" y="${CELL_Y}" width="${CELL_W}" height="${CELL_H}" rx="4" />`;
}).join('\n    ');

const writesReadout = counterVariants({
  x: WRITES_X,
  y: WRITES_Y,
  className: 'ec-writes',
  count: MAX_VERSION + 1,
  anchor: 'end',
  format: (n) => `writes ${n}`,
  indent: 4,
});

/** How far behind one replica is, one text variant per reading it can show. */
const lagReadout = (centre: number): string =>
  counterVariants({
    x: centre,
    y: LAG_Y,
    className: 'ec-lag',
    count: LAG_STEPS,
    anchor: 'middle',
    format: (n) => `lag ${n * LAG_STEP_MS} ms`,
    indent: 4,
  });

/** One replica box: what it is called, what it holds, how far behind it is. */
const replica = (side: 'a' | 'b'): string => {
  const left = side === 'a' ? REP_A_X : REP_B_X;
  const centre = side === 'a' ? X_A : X_B;
  return serviceBox({
    x: left,
    width: REP_W,
    y: Y_REPLICA,
    height: REP_H,
    title: side === 'a' ? 'Replica A' : 'Replica B',
    titleX: centre,
    titleY: REP_TITLE_Y,
    titleClass: 'scene-node-label',
    className: `ec-rep ec-rep--${side}`,
    attrs: ' data-ec-val="1" data-ec-lag="0"',
    boxClass: 'scene-box ec-rep-box',
    children: `
    ${valueChip(centre, RVALUE_Y, RVALUE_W, RVALUE_H, RVALUE_TEXT_Y)}
    ${lagReadout(centre)}`,
  });
};

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" data-ec-conv="yes" data-ec-session="off" data-ec-gate="off" data-ec-write="1" aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_TRUNK, Y_CLIENT, Y_PRIMARY)}
  ${verticalLink(X_A, Y_CLIENT, Y_RAIL)}
  ${verticalLink(X_A, Y_RAIL, Y_REPLICA)}
  ${verticalLink(X_B, Y_CLIENT, Y_RAIL)}
  ${verticalLink(X_B, Y_RAIL, Y_REPLICA)}
  ${verticalLink(X_TRUNK, Y_PRIMARY_BOTTOM, Y_RAIL)}
  <line class="scene-link" x1="${X_A}" y1="${Y_RAIL}" x2="${X_TRUNK}" y2="${Y_RAIL}" />
  <line class="scene-link" x1="${X_TRUNK}" y1="${Y_RAIL}" x2="${X_B}" y2="${Y_RAIL}" />

  <g class="ec-pin">
    <line class="ec-pin-line" x1="${X_A}" y1="${Y_CLIENT}" x2="${X_A}" y2="${Y_RAIL}" />
    <line class="ec-pin-line" x1="${X_A}" y1="${Y_RAIL}" x2="${X_A}" y2="${Y_REPLICA}" />
  </g>

  ${clientBox({
    x: CLIENT_X,
    width: CLIENT_W,
    y: CLIENT_Y,
    height: CLIENT_H,
    title: 'Client',
    titleY: CLIENT_TITLE_Y,
    extraClass: 'ec-client',
    children: `
    <text class="ec-session-text" x="${SESSION_X}" y="${SESSION_Y}" text-anchor="end">session</text>
    ${writeChip}
    ${readChip}`,
  })}

  ${serviceBox({
    x: PRIMARY_X,
    width: PRIMARY_W,
    y: Y_PRIMARY,
    height: PRIMARY_H,
    title: 'Primary',
    titleX: X_TRUNK,
    titleY: PRIMARY_TITLE_Y,
    titleClass: 'scene-node-label',
    className: 'ec-primary',
    attrs: ' data-ec-val="1" data-ec-writes="1"',
    boxClass: 'scene-box ec-primary-box',
    children: `
    ${writesReadout}
    ${valueChip(X_TRUNK, PVALUE_Y, PVALUE_W, PVALUE_H, PVALUE_TEXT_Y)}
    ${commitStrip}`,
  })}

  ${replica('a')}

  ${replica('b')}

  <g class="ec-gate">
    <line class="ec-gate-line" x1="${REP_B_X}" y1="${Y_GATE}" x2="${REP_B_X + REP_W}" y2="${Y_GATE}" />
    <text class="scene-caption-label ec-gate-label" x="${GATE_LABEL_X}" y="${GATE_LABEL_Y}" text-anchor="end">max lag ${GATE_MS} ms</text>
  </g>

  <text class="ec-conv-text" x="${CONV_X}" y="${CONV_Y}" text-anchor="end">converged</text>
  <path class="ec-conv-check" d="M ${CONV_X + 22} ${CONV_Y - 10} L ${CONV_X + 34} ${CONV_Y + 2} L ${CONV_X + 58} ${CONV_Y - 24}" />

  ${requestsLayer()}
</svg>`;
