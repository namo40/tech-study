/**
 * Static stage markup for the Leader Election scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. The bands are the usual ones, with
 * the store on top because the thing being competed for has to sit above the
 * instances competing for it:
 *   - y 0..440       kept empty for the step title card
 *   - y 440..680     Lease: the record card `workers/leader`, who holds it, the
 *                    epoch it was granted under, and the arc counting it down
 *   - y 880..1270    the three instances, one box and one lane each, each
 *                    saying the one word it is entitled to say about itself
 *   - y 1500..1740   Jobs: the single row the work lands in, plus how many
 *                    units ran and how many of them ran twice
 *
 * Three instances, three lanes, and no other route. `X_A`, `X_B` and `X_C` run
 * from the top edge of each instance box up to the bottom edge of the store,
 * and from the bottom edge of each box down to the top edge of the strip. Every
 * leg any traveller makes is a move along one of them: nothing here is a rail,
 * a corner or a diagonal. A lease call climbs from `Y_INST` to `Y_STORE`, is
 * answered there, and comes back down the same lane; a job tick descends from
 * `Y_WORK` to `Y_STRIP` and is absorbed.
 *
 * That is what decides where a label may sit. Each lane sweeps a 52px wide box
 * centred on the lane for 30px around every point it reaches, so the store's
 * text keeps above y 620 and the strip's keeps below y 1560, and both are then
 * clear of every lane at once. Inside an instance box the lane runs through the
 * middle, so the box writes only between y 936 and y 1214, which is the stretch
 * no traveller ever enters.
 */

import { VIEWBOX, clientBox, requestsLayer, serviceBox, timerRing, verticalLink } from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- the three lanes -------------------------------------------------------

/** The lane each instance travels on, which is also the centre of its box. */
export const X_A = 250;
export const X_B = 530;
export const X_C = 810;
export const LANES: Record<string, number> = { A: X_A, B: X_B, C: X_C };

/** Where a lease call starts, and the store edge it is answered at. */
export const Y_INST = 880;
export const Y_STORE = 680;
/** Where a job tick starts, and the strip edge it lands on. */
export const Y_WORK = 1270;
export const Y_STRIP = 1500;

// --- the store -------------------------------------------------------------

const STORE = { x: 130, y: 440, w: 820, h: 240 };
const STORE_LABEL = { x: 170, y: 492 };
const CARD = { x: 168, y: 506, w: 470, h: 116 };
const KEY_X = 192;
const KEY_Y = 546;
const VALUE_Y = 604;
const EPOCH_X = 420;

/** The countdown, drawn as an arc that empties and refills on every renewal. */
export const RING = { cx: 800, cy: 560, r: 52 };
export const RING_CIRCUMFERENCE = 2 * Math.PI * RING.r;
const RING_LABEL_Y = 478;

/** The highest epoch the scene reaches: one grant at the start, one after. */
export const MAX_EPOCH = 2;

// --- the instances ---------------------------------------------------------

const INST = { y: 880, h: 390, w: 240 };
const INST_TITLE_Y = 1046;
const BADGE = { w: 172, h: 56, y: 1096 };
const BADGE_TEXT_Y = 1134;

/** Every word an instance box is entitled to say about itself. */
export const ROLES = ['leader', 'follower', 'down'] as const;
export type Role = (typeof ROLES)[number];

// --- the work strip --------------------------------------------------------

const STRIP = { x: 130, y: 1500, w: 820, h: 240 };
const STRIP_LABEL = { x: 170, y: 1590 };
const RUNS_X = 600;
const DUP_X = 800;
const READOUT_Y = 1590;

/** How many units of work the strip can show. The scene fills it exactly. */
export const RUN_SLOTS = 13;

const SLOTS = { x: 152, y: 1626, w: 776, h: 64 };
const SLOT_GAP = 8;
const SLOT_PITCH = SLOTS.w / RUN_SLOTS;
const SLOT_W = SLOT_PITCH - SLOT_GAP;
const MARK = { top: 1614, bottom: 1702 };

/** Highest duplicate count the `dup` readout can show. It never leaves nought. */
export const DUP_MAX = 2;

// --- markup helpers --------------------------------------------------------

/** A stack of text on one spot, with CSS revealing the variant a state names. */
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

const holderVariants = stack(
  [
    ['none', 'holder: none'],
    ['a', 'holder: A'],
    ['b', 'holder: B'],
  ],
  'le-holder',
  KEY_X,
  VALUE_Y,
  4,
  'start',
);

const epochVariants = stack(
  Array.from({ length: MAX_EPOCH + 1 }, (_value, n) => [String(n), `epoch ${n}`] as [string, string]),
  'le-epoch',
  EPOCH_X,
  VALUE_Y,
  4,
  'start',
);

const runsVariants = stack(
  Array.from({ length: RUN_SLOTS + 1 }, (_value, n) => [String(n), `runs ${n}`] as [string, string]),
  'le-runs',
  RUNS_X,
  READOUT_Y,
  4,
  'start',
);

const dupVariants = stack(
  Array.from({ length: DUP_MAX + 1 }, (_value, n) => [String(n), `dup ${n}`] as [string, string]),
  'le-dup',
  DUP_X,
  READOUT_Y,
  4,
  'start',
);

/** One instance: its name, and the one word it is saying about itself now. */
const instanceBox = (key: 'a' | 'b' | 'c', letter: 'A' | 'B' | 'C'): string => {
  const centre = LANES[letter] ?? 0;
  const roles = ROLES.map(
    (role) =>
      `<text class="scene-counter le-role le-role--${role}" x="${centre}" y="${BADGE_TEXT_Y}" text-anchor="middle">${role}</text>`,
  ).join('\n    ');
  return clientBox({
    x: centre - INST.w / 2,
    width: INST.w,
    y: INST.y,
    height: INST.h,
    title: letter,
    titleX: centre,
    titleY: INST_TITLE_Y,
    titleClass: 'scene-node-title le-inst-title',
    extraClass: `le-inst le-inst--${key}`,
    children: `
    <rect class="le-badge-bg" x="${centre - BADGE.w / 2}" y="${BADGE.y}" width="${BADGE.w}" height="${BADGE.h}" rx="${BADGE.h / 2}" />
    ${roles}`,
  });
};

/** One cell of the work strip: which epoch the unit that landed ran under. */
const slot = (index: number): string => {
  const x = SLOTS.x + index * SLOT_PITCH + SLOT_GAP / 2;
  return `<rect class="scene-slot le-slot le-slot--${index + 1}" data-slot="none" x="${x}" y="${SLOTS.y}" width="${SLOT_W}" height="${SLOTS.h}" rx="14" />`;
};

/**
 * The line between two cells, drawn wherever the epoch could change and shown
 * at the one place it did. The scene names the cell the older epoch ended on.
 */
const boundary = (index: number): string => {
  const x = SLOTS.x + index * SLOT_PITCH;
  return `<line class="le-seam le-seam--${index}" x1="${x}" y1="${MARK.top}" x2="${x}" y2="${MARK.bottom}" />`;
};

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" data-holder="none" data-epoch="0" data-a="follower" data-b="follower" data-c="follower" data-runs="0" data-dupes="0" data-seam="none" data-pulse="off" aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_A, Y_STORE, Y_INST)}
  ${verticalLink(X_B, Y_STORE, Y_INST)}
  ${verticalLink(X_C, Y_STORE, Y_INST)}
  ${verticalLink(X_A, Y_WORK, Y_STRIP)}
  ${verticalLink(X_B, Y_WORK, Y_STRIP)}
  ${verticalLink(X_C, Y_WORK, Y_STRIP)}

  ${clientBox({
    x: STORE.x,
    width: STORE.w,
    y: STORE.y,
    height: STORE.h,
    title: 'Lease',
    titleX: STORE_LABEL.x,
    titleY: STORE_LABEL.y,
    titleClass: 'scene-node-label',
    titleAnchor: null,
    extraClass: 'le-store',
    children: `
    <rect class="le-card" x="${CARD.x}" y="${CARD.y}" width="${CARD.w}" height="${CARD.h}" rx="20" />
    <text class="scene-mono le-key" x="${KEY_X}" y="${KEY_Y}">workers/leader</text>
    ${holderVariants}
    ${epochVariants}

    ${timerRing({
      cx: RING.cx,
      cy: RING.cy,
      r: RING.r,
      className: 'le-ttl',
      groupClass: 'le-ttl',
      labelText: 'TTL',
      labelY: RING_LABEL_Y,
      indent: 4,
    })}`,
  })}

  ${instanceBox('a', 'A')}

  ${instanceBox('b', 'B')}

  ${instanceBox('c', 'C')}

  ${serviceBox({
    x: STRIP.x,
    width: STRIP.w,
    y: STRIP.y,
    height: STRIP.h,
    title: 'Jobs',
    titleX: STRIP_LABEL.x,
    titleY: STRIP_LABEL.y,
    titleClass: 'scene-node-label',
    titleAnchor: null,
    className: 'le-strip',
    children: `
    ${runsVariants}
    ${dupVariants}

    <rect class="le-lane" x="${SLOTS.x - 6}" y="${SLOTS.y - 6}" width="${SLOTS.w + 12}" height="${SLOTS.h + 12}" rx="20" />
    ${Array.from({ length: RUN_SLOTS }, (_value, index) => slot(index)).join('\n    ')}
    ${Array.from({ length: RUN_SLOTS - 1 }, (_value, index) => boundary(index + 1)).join('\n    ')}`,
  })}

  ${requestsLayer()}
</svg>`;
