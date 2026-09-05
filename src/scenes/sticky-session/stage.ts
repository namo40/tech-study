/**
 * Static stage markup for the Sticky Session scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. The bands are the usual ones, with
 * a fourth box hung under the service band because the scene has four layers
 * rather than three:
 *   - y 0..400       above the cropped viewBox (see shared VIEWBOX)
 *   - y 400..440     the frame's top padding; nothing is drawn here
 *   - y 440..680     Users box: two users, each with the cookie they hold
 *   - y 880..1270    Load balancer node: the affinity switch and the cookie map
 *   - y 1500..1740   the three instances, each with a session slot and a meter
 *   - y 1800..1900   the shared session store, which only step 4 has
 *
 * A request leaves its user on the user's own lane, is handed to an instance
 * lane inside the node at `Y_DECIDE`, and rides that lane down to `Y_INST`. The
 * two lanes above the node and the three below it are therefore the only x
 * positions a request ever rests on, and every label is placed to clear them by
 * at least 30px: the node title and one cookie map row sit left of the user
 * lanes, the affinity switch and the other row sit right of them, the row
 * labels sit in the margin left of the first instance, and `no session` sits in
 * the empty band above the instance it belongs to, offset from that lane.
 */

import {
  VIEWBOX,
  clientBox,
  nodeFrame,
  requestsLayer,
  serviceBox,
  trackAndFill,
  verticalLink,
} from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

/**
 * The lane each user's requests leave on. Both sit inside the node's title, so
 * that `Load balancer` and the affinity switch have room either side of them.
 */
export const X_USER = { a: 440, b: 640 } as const;

/** Centre of each instance box, which is also the lane that feeds it. */
export const X_INST = [270, 540, 810];

/** Resting y of a request inside the Users box. */
export const Y_CLIENT = 620;
/** y inside the node where the load balancer hands a request to a lane. */
export const Y_DECIDE = 1180;
/** Bottom edge of the node, by which point a request is on its lane. */
export const Y_LANE = 1270;
/** y a request reaches inside an instance. */
export const Y_INST = 1630;

/** Left edge of each instance box, and how wide one is. */
const INST_X = [150, 420, 690];
const INST_WIDTH = 240;

/** Full width of an instance load meter. */
export const LOAD_WIDTH = 180;

/** Baseline row the two cookie map rows share, either side of the user lanes. */
const MAP_Y = 1090;

/** What every `data-*` on the stage starts at, keyed by the target the timeline
 * addresses it through. The markup below is written from this, so a change that
 * writes a value something already holds can be dropped rather than tweened. */
export const STAGE_STATE: Record<string, string> = {
  'stage@data-affinity': 'off',
  'stage@data-store': 'off',
  'stage@data-store-a': 'off',
  'stage@data-store-b': 'off',
  'user-a@data-cookie': 'none',
  'user-b@data-cookie': 'none',
  'pin-a@data-pin': 'none',
  'pin-b@data-pin': 'none',
  'inst-1@data-inst-state': 'up',
  'inst-1@data-session': 'none',
  'inst-1@data-miss': 'off',
  'inst-1@data-lookup': 'off',
  'inst-1@data-load-state': 'calm',
  'inst-2@data-inst-state': 'up',
  'inst-2@data-session': 'none',
  'inst-2@data-miss': 'off',
  'inst-2@data-lookup': 'off',
  'inst-2@data-load-state': 'calm',
  'inst-3@data-inst-state': 'up',
  'inst-3@data-session': 'none',
  'inst-3@data-miss': 'off',
  'inst-3@data-lookup': 'off',
  'inst-3@data-load-state': 'calm',
};

/**
 * One user: a coloured dot with a letter, and the cookie they are holding. The
 * cookie hangs on the side of the dot away from the middle, so neither chip is
 * ever under the other user's lane.
 */
const user = (key: 'a' | 'b', letter: string, x: number, side: -1 | 1): string => {
  const chipX = side < 0 ? x - 116 : x + 36;
  return `<g class="ss-user ss-user--${key}" data-cookie="none">
      <circle class="ss-user-dot" cx="${x}" cy="570" r="28" />
      <text class="ss-user-text" x="${x}" y="582" text-anchor="middle">${letter}</text>
      <g class="ss-cookie">
        <rect class="ss-cookie-bg" x="${chipX}" y="553" width="80" height="34" rx="17" />
        <text class="ss-cookie-text" x="${chipX + 40}" y="577" text-anchor="middle">cookie</text>
      </g>
    </g>`;
};

const affinityStates = ['off', 'on', 'optional']
  .map(
    (value) =>
      `<text class="scene-flash ss-affinity ss-affinity--${value}" x="920" y="938" text-anchor="end">affinity ${value}</text>`,
  )
  .join('\n    ');

/**
 * One row of the cookie map: which instance the load balancer will send this
 * user back to. The instance name is a stack of variants rather than a value
 * the timeline writes, so scrubbing lands on the right name without anything
 * being interpolated.
 */
const pinRow = (key: 'a' | 'b', letter: string, x: number): string => {
  const targets = [1, 2, 3]
    .map(
      (n) =>
        `<text class="ss-pin-target ss-pin-target--${n}" x="${x + 98}" y="${MAP_Y + 9}">inst ${n}</text>`,
    )
    .join('\n        ');
  return `<g class="ss-pin ss-pin--${key}" data-pin="none">
        <rect class="ss-pin-chip" x="${x}" y="${MAP_Y - 24}" width="52" height="48" rx="14" />
        <text class="ss-pin-letter" x="${x + 26}" y="${MAP_Y + 10}" text-anchor="middle">${letter}</text>
        <text class="ss-pin-arrow" x="${x + 74}" y="${MAP_Y + 9}" text-anchor="middle">&#8594;</text>
        ${targets}
      </g>`;
};

/** One instance: its session slot, its load meter, and its line to the store. */
const instance = (index: number): string => {
  const left = INST_X[index] ?? 0;
  const centre = left + INST_WIDTH / 2;
  return serviceBox({
    x: left,
    width: INST_WIDTH,
    y: 1500,
    height: 240,
    title: `inst ${index + 1}`,
    titleX: left + 18,
    titleY: 1546,
    titleClass: 'ss-inst-label',
    titleAnchor: null,
    className: `ss-inst ss-inst--${index + 1}`,
    attrs:
      ' data-inst-state="up" data-session="none" data-miss="off" data-lookup="off" data-load-state="calm"',
    boxClass: 'scene-box ss-inst-box',
    children: `
    <line class="ss-lookup" x1="${centre}" y1="1740" x2="${centre}" y2="1800" />
    <text class="scene-flash ss-deploy" x="${left + 222}" y="1546" text-anchor="end">deploy</text>
    <text class="scene-flash ss-no-session" x="${centre - 50}" y="1478" text-anchor="end">no session</text>
    <rect class="scene-slot ss-slot" x="${centre - 48}" y="1656" width="96" height="48" rx="14" />
    <text class="ss-slot-text ss-slot-text--a" x="${centre}" y="1692" text-anchor="middle">A</text>
    <text class="ss-slot-text ss-slot-text--b" x="${centre}" y="1692" text-anchor="middle">B</text>
    ${trackAndFill({
      x: centre - LOAD_WIDTH / 2,
      y: 1716,
      width: LOAD_WIDTH,
      height: 12,
      rx: 6,
      className: 'ss-load',
    })}`,
  });
};

const storeEntry = (key: 'a' | 'b', letter: string, x: number): string =>
  `<g class="ss-store-entry ss-store-entry--${key}">
      <rect class="ss-store-chip" x="${x}" y="1830" width="60" height="48" rx="14" />
      <text class="ss-store-text" x="${x + 30}" y="1864" text-anchor="middle">${letter}</text>
    </g>`;

const lanes = X_INST.map((x) => verticalLink(x, Y_LANE, 1500)).join('\n  ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" data-affinity="off" data-store="off" data-store-a="off" data-store-b="off" aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_USER.a, 680, 880)}
  ${verticalLink(X_USER.b, 680, 880)}
  ${lanes}

  ${clientBox({
    title: 'Users',
    titleY: 500,
    children: `
    ${user('a', 'A', X_USER.a, -1)}
    ${user('b', 'B', X_USER.b, 1)}`,
  })}

  ${nodeFrame({
    label: 'Load balancer',
    labelY: 938,
    children: `    ${affinityStates}

    <g class="ss-map">
      <text class="scene-caption-label ss-map-label" x="540" y="1030" text-anchor="middle">cookie</text>
      ${pinRow('a', 'A', 170)}
      ${pinRow('b', 'B', 690)}
    </g>`,
  })}

  <text class="scene-caption-label ss-row-label" x="138" y="1692" text-anchor="end">session</text>
  <text class="scene-caption-label ss-row-label" x="138" y="1727" text-anchor="end">load</text>

  ${instance(0)}

  ${instance(1)}

  ${instance(2)}

  ${serviceBox({
    x: 130,
    width: 820,
    y: 1800,
    height: 100,
    title: 'session store',
    titleX: 156,
    titleY: 1862,
    titleClass: 'ss-store-title',
    titleAnchor: null,
    className: 'ss-store',
    boxClass: 'scene-box ss-store-box',
    children: `
    ${storeEntry('a', 'A', 700)}
    ${storeEntry('b', 'B', 776)}`,
  })}

  ${requestsLayer()}
</svg>`;
