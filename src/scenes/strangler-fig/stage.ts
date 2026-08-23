/**
 * Static stage markup for the Strangler Fig scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. The bands are the usual ones, with
 * the bottom one split in two because the whole point of the pattern is that
 * one box shrinks while the other grows:
 *   - y 0..440       kept empty for the step title card
 *   - y 440..680     Client box, one lane out of it
 *   - y 880..1270    Router node: the route table, the migration meter, and
 *                    the two traffic tallies
 *   - y 1500..1804   Legacy on the left and New on the right, both anchored to
 *                    y 1500 and growing or shrinking downwards
 *   - y 1840..1900   where the retired Legacy strip ends up, under the New box
 *                    once New owns the whole floor
 *
 * One lane decides where every label may sit. A request leaves the Client box
 * on `X_LANE`, rides it down through the route table, forks at `Y_FORK` — which
 * is below the node, so the sideways move never crosses a row — and rides
 * `X_LEGACY` or `X_NEW` down into a box. A request carries the path it asked
 * for as a label on its left, so the widest thing that travels the lane is
 * 185px to the left of the dot and 26px to its right. Everything in the node is
 * therefore written into one of two columns: content ends by x 325 on the left,
 * or starts at x 596 on the right, which leaves at least 30px either side.
 *
 * The two bottom boxes keep the same inset (26px) and the same slot width, so
 * a capability looks the same before and after it moves. Their lanes run down
 * the empty right-hand third of each box, 34px clear of the slots.
 */

import {
  VIEWBOX,
  chip,
  clientBox,
  counterVariants,
  nodeFrame,
  requestsLayer,
  trackAndFill,
  verticalLink,
} from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

/** The three capabilities, in the order they move. */
export const CAPABILITIES = ['customers', 'orders', 'reports'] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** The lane out of the client, and the lane into each bottom box. */
export const X_LANE = 540;
export const X_LEGACY = 370;
export const X_NEW = 880;

/** Resting y in the client box, and inside a bottom box. */
export const Y_CLIENT = 620;
export const Y_BOX = 1630;
/** Where a request stops to be routed, and where it moves onto its lane. */
export const Y_FORK = 1320;

/** Centre y of the route table row for each capability. */
export const ROW_Y: Record<Capability, number> = {
  customers: 1010,
  orders: 1090,
  reports: 1170,
};

/** The node, so the lane and the links can be drawn against it. */
const NODE_Y = 880;
const NODE_H = 390;
const NODE_BOTTOM = NODE_Y + NODE_H;

/** Both bottom boxes: same width, same inset, same slot geometry. */
const BOX_TOP = 1500;
const BOX_W = 310;
export const LEGACY_X = 130;
export const NEW_X = 640;

/** A capability slot inside a box, and where the first one starts. */
const SLOT_W = 154;
const SLOT_H = 52;
const SLOT_PITCH = 70;
export const slotY = (index: number): number => 1614 + index * SLOT_PITCH;
const LEGACY_SLOT_X = LEGACY_X + 26;
const NEW_SLOT_X = NEW_X + 26;

/** How far the New box's contents slide left when it takes the whole floor. */
export const NEW_SHIFT = NEW_SLOT_X - LEGACY_SLOT_X;

export interface BoxShape {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A box holding `count` capabilities. Empty is the title band on its own,
 * which is what the Legacy box is reduced to once everything has moved.
 */
export const boxShape = (x: number, count: number): BoxShape => ({
  x,
  y: BOX_TOP,
  width: BOX_W,
  height: count === 0 ? 84 : 164 + (count - 1) * SLOT_PITCH,
});

/** Where the Legacy box ends up once it is retired: a strip under the New box. */
export const RETIRED_STRIP: BoxShape = { x: 130, y: 1840, width: 820, height: 60 };
/** How far the Legacy title travels to get there. */
export const RETIRED_SHIFT = RETIRED_STRIP.y + 38 - 1552;
/** The New box once it owns the whole floor. */
export const NEW_WHOLE: BoxShape = { x: 130, y: BOX_TOP, width: 820, height: 304 };

/** The anti-corruption layer: a dashed run across the gap between the boxes. */
export const ACL = { y: 1640, xNew: 628, xLegacy: 452 } as const;
/** Half-size of a translation token, which every clearance is measured against. */
export const TOKEN_R = 20;
/**
 * Room for translations in flight. The simulation sends one per capability the
 * first time the new system serves it under a route it has not served before,
 * which is three over the whole scene; the layer is drawn with spares so the
 * request list can grow without the markup having to.
 */
export const TOKEN_COUNT = 6;

/** Full width of the migration meter. */
export const MIGRATED_W = 192;
const MIGRATED_X = 738;

/**
 * Requests the client sends, and therefore how far each tally can count. Both
 * are read off the request list in `scene.ts`, and the counter stacks below are
 * written to match, so a tally can never run out of variants.
 */
export const LEGACY_MAX = 25;
export const NEW_MAX = 18;

/**
 * What every `data-*` on the stage starts at, keyed by the target the timeline
 * addresses it through. The markup below is written from this, so a change that
 * writes a value something already holds can be dropped rather than tweened.
 */
export const STAGE_STATE: Record<string, string> = {
  'stage@data-acl': 'off',
  'stage@data-migrated': '0',
  'stage@data-legacy-count': '0',
  'stage@data-new-count': '0',
  'stage@data-rollback': 'off',
  'stage@data-retired': 'off',
  'row-customers@data-target': 'legacy',
  'row-customers@data-match': 'off',
  'row-customers@data-pct': 'off',
  'row-orders@data-target': 'legacy',
  'row-orders@data-match': 'off',
  'row-orders@data-pct': 'off',
  'row-reports@data-target': 'legacy',
  'row-reports@data-match': 'off',
  'row-reports@data-pct': 'off',
  'legacy-customers@data-mod': 'live',
  'legacy-customers@data-busy': 'off',
  'legacy-orders@data-mod': 'live',
  'legacy-orders@data-busy': 'off',
  'legacy-reports@data-mod': 'live',
  'legacy-reports@data-busy': 'off',
  'new-customers@data-mod': 'absent',
  'new-customers@data-busy': 'off',
  'new-orders@data-mod': 'absent',
  'new-orders@data-busy': 'off',
  'new-reports@data-mod': 'absent',
  'new-reports@data-busy': 'off',
};

// --- the route table ------------------------------------------------------

/** The chip that says where a row points, with one text variant per target. */
const targetChip = (name: Capability): string => {
  const centre = ROW_Y[name];
  const text = ['legacy', 'new']
    .map(
      (value) =>
        `<text class="scene-chip-text sf-target-text sf-target-text--${value}" x="670" y="${centre + 9}" text-anchor="middle">${value}</text>`,
    )
    .join('\n      ');
  return chip({
    x: 600,
    y: centre - 24,
    width: 140,
    height: 48,
    rx: 16,
    className: `sf-target sf-target--${name}`,
    bgClass: 'sf-target-bg',
    variant: 'filled',
    text,
    indent: 6,
  });
};

/** The share of a row's traffic the new system is taking, while it is a share. */
const shareChip = (name: Capability): string => {
  const centre = ROW_Y[name];
  const text = ['10', '50', '100']
    .map(
      (value) =>
        `<text class="sf-share-text sf-share-text--${value}" x="825" y="${centre + 9}" text-anchor="middle">${value}%</text>`,
    )
    .join('\n      ');
  return chip({
    x: 760,
    y: centre - 24,
    width: 130,
    height: 48,
    rx: 16,
    className: `sf-share sf-share--${name}`,
    bgClass: 'sf-share-bg',
    variant: 'outline',
    text,
    indent: 6,
  });
};

/** One row of the route table: the path on the left, where it points on the right. */
const routeRow = (name: Capability): string => {
  const centre = ROW_Y[name];
  return `<g class="sf-row sf-row--${name}" data-target="legacy" data-match="off" data-pct="off">
      <text class="scene-mono sf-path" x="156" y="${centre + 9}">/${name}</text>
      ${targetChip(name)}
      ${shareChip(name)}
    </g>`;
};

// --- the two systems ------------------------------------------------------

/** One capability, drawn the same way whichever box it is sitting in. */
const slot = (side: 'legacy' | 'new', name: Capability, index: number): string => {
  const x = side === 'legacy' ? LEGACY_SLOT_X : NEW_SLOT_X;
  const centre = slotY(index);
  const state = side === 'legacy' ? 'live' : 'absent';
  return `<g class="sf-mod sf-mod--${side} sf-mod--${side}-${name}" data-mod="${state}" data-busy="off">
      <rect class="scene-slot sf-mod-box" x="${x}" y="${centre - SLOT_H / 2}" width="${SLOT_W}" height="${SLOT_H}" rx="14" />
      <text class="scene-mono sf-mod-text" x="${x + 14}" y="${centre + 8}">${name}</text>
    </g>`;
};

const legacySlots = CAPABILITIES.map((name, index) => slot('legacy', name, index)).join('\n    ');
const newSlots = CAPABILITIES.map((name, index) => slot('new', name, index)).join('\n    ');

/** One translation the anti-corruption layer carries, drawn on the origin. */
const token = (index: number): string =>
  `<g class="sf-token sf-token--${index + 1}">
      <path class="sf-token-shape" d="M 0 ${-TOKEN_R} L ${TOKEN_R} 0 L 0 ${TOKEN_R} L ${-TOKEN_R} 0 Z" />
    </g>`;

// --- tallies --------------------------------------------------------------

const migrated = counterVariants({
  x: 930,
  y: 924,
  className: 'sf-migrated',
  count: CAPABILITIES.length + 1,
  anchor: 'end',
  format: (n) => `migrated ${n}/3`,
});

const legacyTally = counterVariants({
  x: 156,
  y: 1240,
  className: 'sf-tally-legacy',
  max: LEGACY_MAX,
  format: (n) => `legacy &#215;${n}`,
});

const newTally = counterVariants({
  x: 600,
  y: 1240,
  className: 'sf-tally-new',
  max: NEW_MAX,
  format: (n) => `new &#215;${n}`,
});

// --- the stage ------------------------------------------------------------

/** The elbow a request takes from the node down onto one of the two lanes. */
const forkLane = (x: number): string =>
  `<path class="sf-lane" d="M ${X_LANE} ${NODE_BOTTOM} L ${X_LANE} ${Y_FORK} L ${x} ${Y_FORK} L ${x} ${BOX_TOP}" />`;

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" data-acl="off" data-migrated="0" data-legacy-count="0" data-new-count="0" data-rollback="off" data-retired="off" aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_LANE, 680, NODE_Y)}
  ${forkLane(X_LEGACY)}
  ${forkLane(X_NEW)}

  ${clientBox({ title: 'Client', titleY: 512 })}

  ${nodeFrame({
    label: 'Router',
    labelY: 938,
    children: `    <g class="sf-migration">
      ${migrated}
      ${trackAndFill({
        x: MIGRATED_X,
        y: 950,
        width: MIGRATED_W,
        height: 14,
        rx: 7,
        className: 'sf-migrated',
        indent: 6,
      })}
    </g>

    ${routeRow('customers')}

    ${routeRow('orders')}

    ${routeRow('reports')}

    <text class="scene-flash sf-rollback" x="930" y="1240" text-anchor="end">rollback</text>
    ${legacyTally}
    ${newTally}`,
  })}

  <g class="sf-acl">
    <g class="sf-acl-fade">
      <line class="sf-acl-line" x1="${ACL.xLegacy}" y1="${ACL.y}" x2="${ACL.xNew}" y2="${ACL.y}" />
      <path class="sf-acl-head" d="M ${ACL.xLegacy + 22} ${ACL.y - 14} L ${ACL.xLegacy} ${ACL.y} L ${ACL.xLegacy + 22} ${ACL.y + 14}" />
      <text class="scene-caption-label sf-acl-label" x="540" y="1580" text-anchor="middle">ACL</text>
      <g class="sf-tokens">
        ${Array.from({ length: TOKEN_COUNT }, (_value, n) => token(n)).join('\n        ')}
      </g>
    </g>
  </g>

  <g class="sf-legacy">
    <rect class="scene-box sf-legacy-box" x="${LEGACY_X}" y="${BOX_TOP}" width="${BOX_W}" height="${boxShape(LEGACY_X, 3).height}" rx="28" />
    <g class="sf-legacy-content">
      <text class="scene-node-label sf-box-title" x="${LEGACY_SLOT_X}" y="1552">Legacy</text>
      <text class="scene-flash sf-retired" x="460" y="1552">retired</text>
    </g>
    ${legacySlots}
  </g>

  <g class="sf-new">
    <rect class="scene-box sf-new-box" x="${NEW_X}" y="${BOX_TOP}" width="${BOX_W}" height="${boxShape(NEW_X, 0).height}" rx="28" />
    <g class="sf-new-content">
      <text class="scene-node-label sf-box-title" x="${NEW_SLOT_X}" y="1552">New</text>
      ${newSlots}
    </g>
  </g>

  ${requestsLayer()}
</svg>`;
