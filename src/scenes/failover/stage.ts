/**
 * Static stage markup for the Failover scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. The bands are the usual ones, with
 * the two machines in the middle because the thing the scene is about is a role
 * moving between them:
 *   - y 0..440       kept empty for the step title card
 *   - y 440..680     App, and the connection it writes through: the host name
 *                    it always asks for, and the machine that name resolves to
 *   - y 880..1270    A on the left and B on the right, each saying the one word
 *                    it is entitled to say about itself, with the replica also
 *                    saying how many writes it has not been sent yet
 *   - y 1500..1740   Monitor: one lamp per machine, how many members it can
 *                    still count, and the ledger of what the switch cost
 *
 * Five lanes and no others. A write leaves the App box at `Y_APP` and reaches
 * the machine the connection names at `Y_NODE`, on `X_A` or `X_B`, and comes
 * back the same way. A heartbeat leaves a machine at `Y_NODE_BOTTOM` and lands
 * on the Monitor's top edge at `Y_MONITOR`, on the same two columns, so each
 * lamp sits at the foot of its own machine's column. A copied write travels the
 * fifth lane, `Y_REPL`, which runs between the two boxes through the centre of
 * both, from the edge of one to the edge of the other. Every leg is vertical or
 * horizontal, every lane runs through the centre of the boxes it joins, and no
 * two lanes share a stretch: the write columns stop at y 880 and the heartbeat
 * columns start at y 1270.
 *
 * That is what decides where a label may sit. A traveller sweeps 26px around
 * every point it reaches and a label keeps 30px clear of that, so each column
 * owns a 112px wide keep-out from y 624 to y 936 and again from y 1214 to
 * y 1556, and the replication lane owns x 434..646 between y 1019 and y 1131.
 * The App box therefore writes nothing below y 616; A and B write between
 * y 968 and y 1204, and only inside x 210..410 and x 670..870, which is the
 * part of each box the replication lane does not reach; and the Monitor writes
 * its name above the columns' reach at x 470..610 and everything else below
 * y 1600.
 */

import {
  VIEWBOX,
  chip,
  clientBox,
  counterVariants,
  healthDot,
  requestsLayer,
  serviceBox,
  verticalLink,
} from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- geometry --------------------------------------------------------------

/** The column each machine is reached on, which is also the centre of its box. */
export const X_A = 310;
export const X_B = 770;

/** Where a write starts, and the machine edge it is answered at. */
export const Y_APP = 680;
export const Y_NODE = 880;

/** Where a heartbeat starts, and the Monitor edge it lands on. */
export const Y_NODE_BOTTOM = 1270;
export const Y_MONITOR = 1500;

/**
 * The replication lane: the only horizontal line on the stage. It runs between
 * the two boxes through the centre of both, which is why neither box writes
 * anything in the strip between them.
 */
export const Y_REPL = 1075;
export const X_REPL_A = 490;
export const X_REPL_B = 590;

/** The App box and the connection card inside it. */
const APP = { x: 130, y: 440, w: 820, h: 240 };
const APP_TITLE_Y = 500;
const CONN = { x: 300, y: 536, w: 480, h: 80 };
const HOST_X = 328;
const HOST_Y = 588;
const TARGET = { x: 620, y: 550, w: 140, h: 52 };
const TARGET_TEXT_Y = 586;

/** The two machines. Both boxes are the same size, mirrored about x 540. */
const NODE = { y: 880, w: 360, h: 390 };
const NODE_A_X = 130;
const NODE_B_X = 590;
const NODE_TITLE_Y = 1000;
const BADGE = { w: 200, h: 58, y: 1070 };
const BADGE_TEXT_Y = 1108;
const BEHIND = { w: 200, h: 52, y: 1152 };
const BEHIND_TEXT_Y = 1188;

/** The Monitor, its two lamps, and the two numbers it keeps. */
const MON = { x: 280, y: 1500, w: 520, h: 240 };
const MON_TITLE_Y = 1556;
const LAMP_Y = 1614;
const LAMP_R = 18;
const LAMP_RING_R = 28;
const LAMP_LABEL_Y = 1682;
const VOTES_Y = 1624;
const LOST_Y = 1690;

/** How many members the Monitor counts, which is what a majority is measured against. */
export const MEMBERS = 3;

/** The highest the replica's backlog ever reads. */
export const BEHIND_MAX = 1;

// --- the words the stage can say ------------------------------------------

/** Every word a machine is entitled to say about itself. */
export const ROLES = ['primary', 'replica', 'down'] as const;
export type Role = (typeof ROLES)[number];

/** Which machine the connection currently resolves to. */
export type Target = 'a' | 'b';

/** Which way copies are travelling, or that nothing is. */
export type ReplDirection = 'ab' | 'ba' | 'none';

/**
 * What every `data-*` on the stage starts at. The markup below is written from
 * these, so the first frame is the whole diagram in its opening state and the
 * timeline never has to restate what is already there.
 */
export const STAGE_STATE: Record<string, string> = {
  'data-target': 'a',
  'data-a': 'primary',
  'data-b': 'replica',
  'data-votes': String(MEMBERS),
  'data-behind': '0',
  'data-lost': 'off',
  'data-repl': 'ab',
};

// --- markup ----------------------------------------------------------------

/** The name the App always asks for, and the machine that name resolves to. */
const connectionCard = `<g class="fo-conn">
      <rect class="scene-chip-outline fo-conn-bg" x="${CONN.x}" y="${CONN.y}" width="${CONN.w}" height="${CONN.h}" rx="20" />
      <text class="scene-mono fo-host" x="${HOST_X}" y="${HOST_Y}">db.example.com</text>
      <rect class="fo-target-bg" x="${TARGET.x}" y="${TARGET.y}" width="${TARGET.w}" height="${TARGET.h}" rx="16" />
      <text class="scene-counter fo-target fo-target--a" x="${TARGET.x + TARGET.w / 2}" y="${TARGET_TEXT_Y}" text-anchor="middle">&#8594; A</text>
      <text class="scene-counter fo-target fo-target--b" x="${TARGET.x + TARGET.w / 2}" y="${TARGET_TEXT_Y}" text-anchor="middle">&#8594; B</text>
    </g>`;

/**
 * The plate a machine says its role on. Both machines carry all three words,
 * because which of them ends up saying which is the whole point of the scene.
 */
const roleBadge = (side: 'a' | 'b', centre: number): string => {
  const text = ROLES.map(
    (role) =>
      `<text class="scene-counter fo-role-${side} fo-role-${side}--${role}" x="${centre}" y="${BADGE_TEXT_Y}" text-anchor="middle">${role}</text>`,
  ).join('\n        ');
  return chip({
    x: centre - BADGE.w / 2,
    y: BADGE.y,
    width: BADGE.w,
    height: BADGE.h,
    rx: 18,
    className: `fo-badge-${side}`,
    variant: 'outline',
    text,
    indent: 6,
  });
};

/** How many writes the replica has not been sent yet. */
const behindChip = chip({
  x: X_B - BEHIND.w / 2,
  y: BEHIND.y,
  width: BEHIND.w,
  height: BEHIND.h,
  rx: 16,
  className: 'fo-behind',
  variant: 'outline',
  text: counterVariants({
    x: X_B,
    y: BEHIND_TEXT_Y,
    className: 'fo-behind-text',
    count: BEHIND_MAX + 1,
    anchor: 'middle',
    format: (n) => `behind ${n}`,
    indent: 8,
  }),
  indent: 6,
});

/** One machine: what it is called, what it is, and what it is still owed. */
const machine = (side: 'a' | 'b'): string => {
  const left = side === 'a' ? NODE_A_X : NODE_B_X;
  const centre = side === 'a' ? X_A : X_B;
  const owed = side === 'b' ? `\n      ${behindChip}` : '';
  return serviceBox({
    x: left,
    width: NODE.w,
    y: NODE.y,
    height: NODE.h,
    title: side.toUpperCase(),
    titleX: centre,
    titleY: NODE_TITLE_Y,
    className: `fo-node fo-node--${side}`,
    boxClass: `scene-box fo-node-box fo-node-box--${side}`,
    children: `
      ${roleBadge(side, centre)}${owed}`,
  });
};

/** How many members the Monitor can still count, out of all of them. */
const votesReadout = counterVariants({
  x: MON.x + MON.w / 2,
  y: VOTES_Y,
  className: 'fo-votes',
  count: MEMBERS + 1,
  anchor: 'middle',
  format: (n) => `votes ${n}/${MEMBERS}`,
  indent: 6,
});

/** One lamp, at the foot of its own machine's column. */
const lamp = (side: 'a' | 'b', centre: number): string =>
  `${healthDot({
    cx: centre,
    cy: LAMP_Y,
    extraClass: `fo-lamp-${side}`,
    attrs: ' data-health-state="up"',
    r: LAMP_R,
    ringR: LAMP_RING_R,
    indent: 6,
  })}
      <text class="scene-caption-label fo-lamp-label" x="${centre}" y="${LAMP_LABEL_Y}" text-anchor="middle">${side.toUpperCase()}</text>`;

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" data-target="${STAGE_STATE['data-target']}" data-a="${STAGE_STATE['data-a']}" data-b="${STAGE_STATE['data-b']}" data-votes="${STAGE_STATE['data-votes']}" data-behind="${STAGE_STATE['data-behind']}" data-lost="${STAGE_STATE['data-lost']}" data-repl="${STAGE_STATE['data-repl']}" aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_A, Y_APP, Y_NODE)}
  ${verticalLink(X_B, Y_APP, Y_NODE)}
  ${verticalLink(X_A, Y_NODE_BOTTOM, Y_MONITOR)}
  ${verticalLink(X_B, Y_NODE_BOTTOM, Y_MONITOR)}

  ${clientBox({
    x: APP.x,
    width: APP.w,
    y: APP.y,
    height: APP.h,
    title: 'App',
    titleY: APP_TITLE_Y,
    children: `
    ${connectionCard}`,
  })}

  ${machine('a')}

  ${machine('b')}

  <g class="fo-repl">
    <line class="scene-link fo-repl-line" x1="${X_REPL_A}" y1="${Y_REPL}" x2="${X_REPL_B}" y2="${Y_REPL}" />
    <path class="fo-arrow fo-arrow--ab" d="M ${X_REPL_B - 18} ${Y_REPL - 14} L ${X_REPL_B - 2} ${Y_REPL} L ${X_REPL_B - 18} ${Y_REPL + 14}" />
    <path class="fo-arrow fo-arrow--ba" d="M ${X_REPL_A + 18} ${Y_REPL - 14} L ${X_REPL_A + 2} ${Y_REPL} L ${X_REPL_A + 18} ${Y_REPL + 14}" />
  </g>

  ${serviceBox({
    x: MON.x,
    width: MON.w,
    y: MON.y,
    height: MON.h,
    title: 'Monitor',
    titleY: MON_TITLE_Y,
    titleClass: 'scene-node-label',
    className: 'fo-monitor',
    children: `
      ${lamp('a', X_A)}
      ${lamp('b', X_B)}
      ${votesReadout}
      <text class="scene-flash fo-lost" x="${MON.x + MON.w / 2}" y="${LOST_Y}" text-anchor="middle">lost 1</text>`,
  })}

  ${requestsLayer()}
</svg>`;
