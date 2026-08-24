/**
 * Static stage markup for the Replication Lag scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. The bands are the usual ones, with
 * each database box writing what it holds under itself, because a request
 * stands on the centre column of the box it reached:
 *   - y 0..440       kept empty for the step title card
 *   - y 440..680     App, the one lane every request leaves on, and the chip
 *                    that remembers the write this session just made
 *   - y 880..1270    Router: the rules it routes by, the one it is using right
 *                    now, and the two tallies the whole scene is counted on
 *   - y 1390         the fan rail, the only row a request changes column on
 *   - y 1500..1740   Primary on the left, Replica on the right
 *   - y 1750..1870   what each of them holds: its value and its position
 *   - the strip between them carries the replication stream at y 1620, the lag
 *     readout above it and the meter that lag is drawn on below it
 *
 * A request travels on three kinds of line and no others: down the trunk at
 * `X_TRUNK`, along the fan rail at `Y_RAIL`, and down one of the two columns at
 * `X_PRIMARY` and `X_REPLICA`. Every leg is vertical or horizontal, and the
 * trunk, the rail and both columns meet at `Y_RAIL`, so no leg cuts a corner. A
 * change travels the fourth line, the stream at `Y_STREAM`, which runs between
 * the two boxes through the centre of both, at the height of nothing else.
 *
 * That is what decides where a label may sit. Both columns sweep from the rail
 * down to `Y_ARRIVE`, so each box names itself below y 1690 and writes its
 * value and its position under the box entirely; the stream sweeps the whole
 * strip between the boxes, so the lag readout sits well above it and the meter
 * well below it, and nothing at all is written in the strip between y 1580 and
 * y 1670.
 */

import {
  VIEWBOX,
  chip,
  clientBox,
  counterVariants,
  nodeFrame,
  requestsLayer,
  serviceBox,
  trackAndFill,
  verticalLink,
} from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- geometry --------------------------------------------------------------

/** The lane every request leaves on, and where it starts. */
export const X_TRUNK = 540;
export const Y_CLIENT = 620;

/** The App box, and the chip inside it that remembers a recent write. */
const CLIENT_X = 240;
const CLIENT_W = 600;
const CLIENT_Y = 440;
const CLIENT_H = 240;
const SESSION_X = 600;
const SESSION_Y = 570;
const SESSION_W = 220;
const SESSION_H = 62;

/** Top and bottom of the Router node. */
const NODE_Y = 880;
const NODE_H = 390;
const NODE_BOTTOM = NODE_Y + NODE_H;
const NODE_LABEL_Y = 938;

/** Rows inside the node: the rules left of the trunk, the tallies right of it. */
const RULE_X = 170;
const RULE_Y = [1020, 1090, 1160, 1210];
const RIGHT_X = 600;

/**
 * The rail the router fans out on. It sits below the node rather than inside
 * it, so none of the node's own rows ever shares a row with something moving.
 */
export const Y_RAIL = 1390;

/** The two boxes, and the column each of them is reached by. */
const PRIMARY_X = 130;
const REPLICA_X = 750;
const BOX_W = 200;
const BOX_Y = 1500;
const BOX_H = 240;
export const X_PRIMARY = PRIMARY_X + BOX_W / 2;
export const X_REPLICA = REPLICA_X + BOX_W / 2;

/** Where a request stands while the box it reached is answering it. */
export const Y_ARRIVE = 1630;

/** The rows a box keeps below the column that reaches it. */
const TITLE_Y = 1712;
const MARK_Y = 1754;
const VALUE_Y = 1774;
const VALUE_W = 150;
const VALUE_H = 54;
const LSN_Y = 1866;

/**
 * The replication stream: the only horizontal line below the rail. It runs
 * between the two boxes through the centre of both, which is why the boxes end
 * at y 1740 and everything they hold is written under them.
 */
export const Y_STREAM = BOX_Y + BOX_H / 2;
export const X_STREAM_FROM = PRIMARY_X + BOX_W;
export const X_STREAM_TO = REPLICA_X;
export const STREAM_LEN = X_STREAM_TO - X_STREAM_FROM;

/** The lag readout above the stream, and the label a lost change leaves. */
const LAG_Y = 1526;
const LOST_Y = 1566;

/** The meter the lag is drawn on, below the stream, and its alert mark. */
export const METER_X = 390;
export const METER_W = 300;
const METER_Y = 1676;
const METER_H = 16;
const SCALE_Y = 1730;

/** Full scale of the lag meter in milliseconds, and the step it reads in. */
export const LAG_MAX_MS = 3200;
export const LAG_STEP_MS = 100;
export const LAG_STEPS = LAG_MAX_MS / LAG_STEP_MS + 1;
/** Where the alert mark sits: one second, as a share of full scale. */
export const ALERT_MS = 1000;
const TICK_X = METER_X + (ALERT_MS / LAG_MAX_MS) * METER_W;

/** The position the primary starts at, and how far the scene's writes run. */
export const LSN_BASE = 40;
export const LSN_COUNT = 13;

/** How far the two tallies under the rules can run. */
export const READ_MAX = 13;
export const STALE_MAX = 2;

/** Every value a row can hold, in the order the scene writes them. */
export const NAMES = ['Ann', 'Bea', 'Cy', 'Di', 'Ed', 'Fay'] as const;
export type Name = (typeof NAMES)[number];
/** The `data-*` spelling of a value, which is what CSS keys the chip on. */
export const nameKey = (name: Name): string => name.toLowerCase();

/**
 * What every `data-*` on the stage starts at, keyed by the target the timeline
 * addresses it through. The markup below is written from this, so a change that
 * writes a value something already holds can be dropped rather than tweened.
 */
export const STAGE_STATE: Record<string, string> = {
  'stage@data-plsn': '0',
  'stage@data-rlsn': '0',
  'stage@data-pval': 'ann',
  'stage@data-rval': 'ann',
  'stage@data-lag': '0',
  'stage@data-lagstate': 'calm',
  'stage@data-policy': 'basic',
  'stage@data-route': 'none',
  'stage@data-topology': 'pair',
  'stage@data-primary': 'up',
  'stage@data-replica': 'live',
  'stage@data-session': 'off',
  'stage@data-reads': '0',
  'stage@data-stale': '0',
  'stage@data-alert': 'off',
  'stage@data-lost': 'off',
  'stage@data-stale-mark': 'off',
};

// --- markup ----------------------------------------------------------------

const groupDigits = (value: number): string =>
  String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** The chip in the App box: the position this session last wrote at. */
const sessionText = counterVariants({
  x: SESSION_X + SESSION_W / 2,
  y: SESSION_Y + 40,
  className: 'rl-session-text',
  count: LSN_COUNT,
  anchor: 'middle',
  format: (n) => `wrote @LSN ${LSN_BASE + n}`,
  indent: 6,
});

const sessionChip = chip({
  x: SESSION_X,
  y: SESSION_Y,
  width: SESSION_W,
  height: SESSION_H,
  rx: 20,
  className: 'rl-session',
  variant: 'outline',
  text: sessionText,
});

/** One rule the router routes by, in the two spellings the scene needs. */
const rule = (index: number, name: string, pair: string, failover: string): string =>
  [
    `<text class="rl-rule rl-rule--${name} rl-rule--${name}-pair" x="${RULE_X}" y="${RULE_Y[index]}">${pair}</text>`,
    `<text class="rl-rule rl-rule--${name} rl-rule--${name}-failover" x="${RULE_X}" y="${RULE_Y[index]}">${failover}</text>`,
  ].join('\n    ');

const readTally = counterVariants({
  x: RIGHT_X,
  y: RULE_Y[2] ?? 0,
  className: 'rl-reads',
  count: READ_MAX + 1,
  format: (n) => `reads ${n}`,
  indent: 4,
});

const staleTally = counterVariants({
  x: RIGHT_X,
  y: RULE_Y[3] ?? 0,
  className: 'rl-stale',
  count: STALE_MAX + 1,
  format: (n) => `stale reads ${n}`,
  indent: 4,
});

/** The value one box holds, one text variant per value it can hold. */
const valueChip = (side: 'primary' | 'replica', centre: number): string => {
  const text = NAMES.map(
    (name) =>
      `<text class="scene-mono rl-value-text rl-value-text--${nameKey(name)}" x="${centre}" y="${VALUE_Y + 35}" text-anchor="middle">name = ${name}</text>`,
  ).join('\n        ');
  return chip({
    x: centre - VALUE_W / 2,
    y: VALUE_Y,
    width: VALUE_W,
    height: VALUE_H,
    rx: 14,
    className: `rl-value-${side}`,
    variant: 'outline',
    text,
    indent: 6,
  });
};

/** One database box: what it is called, what it holds, where it has got to. */
const box = (side: 'primary' | 'replica'): string => {
  const primary = side === 'primary';
  const left = primary ? PRIMARY_X : REPLICA_X;
  const centre = primary ? X_PRIMARY : X_REPLICA;
  const marks = primary
    ? ''
    : `
    <text class="scene-flash rl-mark rl-mark--stale" x="${centre}" y="${MARK_Y}" text-anchor="middle">stale</text>
    <text class="scene-flash rl-mark rl-mark--promote" x="${centre}" y="${MARK_Y}" text-anchor="middle">promote</text>`;
  return serviceBox({
    x: left,
    width: BOX_W,
    y: BOX_Y,
    height: BOX_H,
    title: primary ? 'Primary' : 'Replica',
    titleX: centre,
    titleY: TITLE_Y,
    titleClass: 'scene-node-label',
    className: `rl-node rl-node--${side}`,
    boxClass: `scene-box rl-node-box rl-node-box--${side}`,
    children: `${marks}
    ${valueChip(side, centre)}
    ${counterVariants({
      x: centre,
      y: LSN_Y,
      className: `rl-lsn-${side}`,
      count: LSN_COUNT,
      anchor: 'middle',
      format: (n) => `LSN ${LSN_BASE + n}`,
      indent: 4,
    })}`,
  });
};

const lagReadout = counterVariants({
  x: X_TRUNK,
  y: LAG_Y,
  className: 'rl-lag',
  count: LAG_STEPS,
  anchor: 'middle',
  format: (n) => `lag ${groupDigits(n * LAG_STEP_MS)} ms`,
  indent: 2,
});

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" data-plsn="0" data-rlsn="0" data-pval="ann" data-rval="ann" data-lag="0" data-lagstate="calm" data-policy="basic" data-route="none" data-topology="pair" data-primary="up" data-replica="live" data-session="off" data-reads="0" data-stale="0" data-alert="off" data-lost="off" data-stale-mark="off" aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_TRUNK, CLIENT_Y + CLIENT_H, NODE_Y)}
  ${verticalLink(X_TRUNK, NODE_BOTTOM, Y_RAIL)}
  <line class="scene-link" x1="${X_PRIMARY}" y1="${Y_RAIL}" x2="${X_REPLICA}" y2="${Y_RAIL}" />
  ${verticalLink(X_PRIMARY, Y_RAIL, BOX_Y)}
  ${verticalLink(X_REPLICA, Y_RAIL, BOX_Y)}

  ${clientBox({
    x: CLIENT_X,
    width: CLIENT_W,
    y: CLIENT_Y,
    height: CLIENT_H,
    title: 'App',
    titleY: 512,
    children: `
    ${sessionChip}`,
  })}

  ${nodeFrame({
    y: NODE_Y,
    height: NODE_H,
    label: 'Router',
    labelY: NODE_LABEL_Y,
    children: `    ${rule(0, 'writes', 'writes &#8594; primary', 'writes &#8594; primary (new)')}
    ${rule(1, 'reads', 'reads &#8594; replica', 'reads &#8594; primary')}
    <text class="rl-rule rl-rule--session rl-rule--session-a" x="${RULE_X}" y="${RULE_Y[2]}">after write:</text>
    <text class="rl-rule rl-rule--session rl-rule--session-b" x="${RULE_X}" y="${RULE_Y[3]}">primary for 5 s</text>

    <text class="scene-flash rl-wait" x="${RIGHT_X}" y="${RULE_Y[0]}">wait for LSN</text>
    ${readTally}
    ${staleTally}`,
  })}

  ${box('primary')}

  ${box('replica')}

  <g class="rl-stream">
    <line class="scene-link rl-stream-line" x1="${X_STREAM_FROM}" y1="${Y_STREAM}" x2="${X_STREAM_TO}" y2="${Y_STREAM}" />
    <path class="rl-stream-head" d="M ${X_STREAM_TO - 18} ${Y_STREAM - 14} L ${X_STREAM_TO - 2} ${Y_STREAM} L ${X_STREAM_TO - 18} ${Y_STREAM + 14}" />
  </g>

  ${lagReadout}
  <text class="scene-flash rl-lost" x="${X_TRUNK}" y="${LOST_Y}" text-anchor="middle">lost</text>

  ${trackAndFill({
    x: METER_X,
    y: METER_Y,
    width: METER_W,
    height: METER_H,
    rx: METER_H / 2,
    className: 'rl-meter',
    indent: 2,
  })}
  <line class="rl-tick" x1="${TICK_X}" y1="${METER_Y - 8}" x2="${TICK_X}" y2="${METER_Y + METER_H + 8}" />
  <text class="rl-alert" x="${TICK_X - 14}" y="${SCALE_Y}" text-anchor="end">alert &gt; 1 s</text>
  <text class="scene-flash rl-rpo" x="${TICK_X + 16}" y="${SCALE_Y}">RPO 1 write</text>

  ${requestsLayer()}
</svg>`;
