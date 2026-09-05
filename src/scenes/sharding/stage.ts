/**
 * Static stage markup for the Sharding scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Four bands, arranged around the one
 * question the scene asks — where does a key live, and what does it cost to
 * change the answer:
 *   - y 0..400        above the cropped viewBox (see shared VIEWBOX)
 *   - y 400..440      the frame's top padding; nothing is drawn here
 *   - y 440..680      the Router: the rule it routes by (`mod 2`, the `mod 3`
 *                     ghost, then `ring`) and `keys n`, how many keys the map
 *                     holds. The rule is the whole of the routing: nothing else
 *                     on the stage decides where a key goes
 *   - y 880..1270     the three shards. S0, S1 and S2 side by side, each with a
 *                     row of key cells and the `load` its cells add up to. S2 is
 *                     drawn dashed and inactive until it joins in the third
 *                     step. In the first step none of them is drawn at all: one
 *                     wide box holds all twelve keys, because there is only one
 *                     box to hold them
 *   - y 1500..1740    what a query and a move cost: `1 shard` or `fan-out`, the
 *                     shards that query touched, and `moved n`
 *
 * Three lane segments and no others, every one axis aligned. A key being routed
 * goes down `X_S0`, `X_S1` or `X_S2` from the Router's bottom edge to a shard's
 * top edge, and so does a query, because a query is routed by exactly the same
 * rule. The third step's rebalance uses the same three columns in both
 * directions: a key leaving a shard travels up its own column to the Router and
 * then down `X_S2` into its new home, which is what a key move physically is —
 * the router hands it over. The bottom band has no lane of its own: it reads
 * what the columns above it did.
 *
 * A traveller sweeps 26px around every point it reaches and a label keeps 30px
 * clear of that, so the three segments own three keep-outs: x 199..311,
 * x 479..591 and x 759..871, each from y 624 to y 936. That is what decides the
 * layout. The Router keeps everything above y 624. The shards name themselves
 * below y 936 and hold everything else between y 950 and y 1250. The bottom box
 * is under none of them.
 *
 * Declared texture: the twelve ghost cells of the first step, the three shard
 * key-cell rows, the three `load` gauges, and the three query-touch marks. None
 * of them carries a number. A cell is a key and where it sits is which shard
 * owns it, because ownership is the only thing this scene is about; writing the
 * key's name twice is what would let the two copies disagree.
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

/** The three lane columns, each the centre of the shard it feeds. */
export const X_S0 = 255;
export const X_S1 = 535;
export const X_S2 = 815;

/** The lane columns in shard order, so a shard index picks its own column. */
export const LANE_X = [X_S0, X_S1, X_S2] as const;

export const Y_ROUTER_BOTTOM = 680;
export const Y_SHARD_TOP = 880;

/** The Router band. */
const ROUTER = { x: 130, y: 440, w: 820, h: 240 };
const ROUTER_TITLE_X = 170;
const ROUTER_TITLE_Y = 512;

/** The plate the routing rule is written on, and the rule's three spellings. */
const RULE_PLATE = { x: 166, y: 546, w: 232, h: 66 };
const RULE_TEXT_X = 282;
const RULE_TEXT_Y = 590;

/** How many keys the map holds, read out on the Router's own line. */
const KEYS_X = 914;
const KEYS_Y = 590;

/** The three shard boxes, left to right. */
const SHARDS = [
  { x: 130, y: 880, w: 250, h: 390 },
  { x: 410, y: 880, w: 250, h: 390 },
  { x: 690, y: 880, w: 250, h: 390 },
] as const;
const SHARD_NAMES = ['S0', 'S1', 'S2'] as const;
const SHARD_TITLE_DX = 22;
/** Below the lane keep-out, which reaches y 936 at the top of every shard. */
const SHARD_TITLE_Y = 984;

/** One row of key cells per shard. Six is the most any shard ever holds. */
export const SHARD_CELLS = 6;
const CELL_DX = 18;
const CELL_PITCH = 36;
const CELL_W = 30;
const CELL_Y = 1040;
const CELL_H = 44;

/** The gauge that reads a shard's load, and the word under which it reads it. */
const LOAD_LABEL_DX = 22;
const LOAD_LABEL_Y = 1150;
const GAUGE = { dx: 18, y: 1176, w: 214, h: 36 };

/**
 * How full a shard reads. `idle` shows no fill at all, which is what an empty
 * shard is; the other three are lengths a reader can compare across boxes.
 */
export const LEVELS = ['idle', 'light', 'even', 'heavy'] as const;
export type Level = (typeof LEVELS)[number];
const GAUGE_WIDTHS: Record<Exclude<Level, 'idle'>, number> = {
  light: 72,
  even: 143,
  heavy: 214,
};

/** The first step's single box, and the twelve keys crammed into it. */
export const KEY_COUNT = 12;
const GHOST_BOX = { x: 130, y: 880, w: 810, h: 390 };
const GHOST_X0 = 190;
const GHOST_PITCH = 58;
const GHOST_W = 52;
const GHOST_Y = 1040;
const GHOST_H = 72;

/** The bottom band: what the last query cost, and what the last move cost. */
const QUERIES = { x: 280, y: 1500, w: 520, h: 240 };
const COST_PLATE = { x: 310, y: 1546, w: 250, h: 68 };
const COST_TEXT_X = 435;
const COST_TEXT_Y = 1592;
const MOVED_X = 596;
const MOVED_Y = 1592;
/** The most keys any single answer ever moves, which is the `mod 3` ghost's. */
export const MOVED_MAX = 8;

/** One mark per shard: which boxes the last query had to touch. */
const TOUCH_XS = [418, 518, 618] as const;
const TOUCH_Y = 1650;
const TOUCH_SIDE = 44;

// --- what the stage can say about itself -----------------------------------

/** Whether the data is in one box or in three. `single` is the first step. */
export const MODES = ['single', 'sharded'] as const;
export type Mode = (typeof MODES)[number];

/** How hard the single box is being pushed, before there is anywhere to split to. */
export const STRAINS = ['calm', 'full', 'over'] as const;
export type Strain = (typeof STRAINS)[number];

/**
 * The rule the Router routes by. `off` is the first step, where one box needs
 * no rule; `mod3` is never actually applied, it is the answer being priced.
 */
export const RULES = ['off', 'mod2', 'mod3', 'ring'] as const;
export type Rule = (typeof RULES)[number];

/** What a key cell is: empty, holding a key, marked as one `mod 3` would move,
    or a place a key has left. The last two are never the first one. */
export const CELL_STATES = ['none', 'here', 'move', 'gone'] as const;
export type CellState = (typeof CELL_STATES)[number];

/** What the last query cost. */
export const COSTS = ['one', 'fan'] as const;
export type Cost = (typeof COSTS)[number];

/** Whether the last query touched this shard. */
export const TOUCH_STATES = ['off', 'on'] as const;
export type TouchState = (typeof TOUCH_STATES)[number];

/** What the scene is holding up for a moment, if anything. */
export const MARKS = ['none', 'keys', 'promise', 'choose', 'compare', 'balance', 'next'] as const;
export type Mark = (typeof MARKS)[number];

/**
 * What every `data-*` on the stage starts at. The markup below is written from
 * these, so the first frame is the whole diagram in its opening state — one box
 * with every key in it, a Router with no rule to apply yet, nothing moved, and
 * a lookup that costs one box because there is only one — and the timeline
 * never restates it.
 */
export const STAGE_STATE: Record<string, string> = {
  'data-sh-mode': 'single',
  'data-sh-strain': 'calm',
  'data-sh-rule': 'off',
  'data-sh-keys': '0',
  'data-sh-s2': 'off',
  'data-sh-cost': 'one',
  'data-sh-moved': '0',
  'data-sh-mark': 'none',
  'data-sh-settled': 'off',
};

/** What every shard, key cell and touch mark starts at. */
export const LOAD_STATE: Level = 'idle';
export const CELL_STATE: CellState = 'none';
export const TOUCH_STATE: TouchState = 'off';

// --- markup ----------------------------------------------------------------

/** Non-breaking spaces, so a monospaced label keeps its gaps in SVG. */
const mono = (text: string): string => text.replace(/ /g, '&#160;');

const pad = (n: number): string => `\n${' '.repeat(n)}`;

/** The rule, written three ways on one plate, with the state showing one. */
const rulePlate = chip({
  x: RULE_PLATE.x,
  y: RULE_PLATE.y,
  width: RULE_PLATE.w,
  height: RULE_PLATE.h,
  rx: 22,
  className: 'sh-rule',
  bgClass: 'sh-rule-bg',
  variant: 'outline',
  text: (
    [
      ['mod2', 'mod 2'],
      ['mod3', 'mod 3'],
      ['ring', 'ring'],
    ] as const
  )
    .map(
      ([id, label]) =>
        `<text class="scene-counter scene-mono sh-rule-text sh-rule--${id}" x="${RULE_TEXT_X}" y="${RULE_TEXT_Y}" text-anchor="middle">${mono(label)}</text>`,
    )
    .join(pad(6)),
});

/** How many keys the map holds. One text per value, and the state picks one. */
const keysReadout = counterVariants({
  x: KEYS_X,
  y: KEYS_Y,
  className: 'sh-keys',
  max: KEY_COUNT,
  format: (n) => mono(`keys ${n}`),
  anchor: 'end',
});

/** One shard's row of key cells, appended left to right as keys arrive. */
const cells = (dx: number, indent: number): string =>
  Array.from({ length: SHARD_CELLS }, (_value, index) => index)
    .map(
      (index) =>
        `<rect class="sh-cell sh-cell--${index + 1}" data-sh-cell="${CELL_STATE}" x="${dx + CELL_DX + index * CELL_PITCH}" y="${CELL_Y}" width="${CELL_W}" height="${CELL_H}" rx="8" />`,
    )
    .join(pad(indent));

/** One shard's gauge: a track and one fill per level, with the state showing one. */
const gauge = (dx: number, indent: number): string =>
  [
    `<rect class="scene-track sh-gauge-track" x="${dx + GAUGE.dx}" y="${GAUGE.y}" width="${GAUGE.w}" height="${GAUGE.h}" rx="${GAUGE.h / 2}" />`,
    ...(['light', 'even', 'heavy'] as const).map(
      (level) =>
        `<rect class="sh-gauge-fill sh-gauge-fill--${level}" x="${dx + GAUGE.dx}" y="${GAUGE.y}" width="${GAUGE_WIDTHS[level]}" height="${GAUGE.h}" rx="${GAUGE.h / 2}" />`,
    ),
  ].join(pad(indent));

/** The three shard boxes, each named, each reading its own row. */
const shards = SHARDS.map((box, index) =>
  serviceBox({
    x: box.x,
    width: box.w,
    y: box.y,
    height: box.h,
    title: SHARD_NAMES[index] ?? '',
    titleX: box.x + SHARD_TITLE_DX,
    titleY: SHARD_TITLE_Y,
    titleAnchor: null,
    className: `scene-node sh-shard sh-shard--${index}`,
    attrs: ` data-sh-load="${LOAD_STATE}"`,
    children: `
    ${cells(box.x, 4)}

    <text class="sh-load-label" x="${box.x + LOAD_LABEL_DX}" y="${LOAD_LABEL_Y}">load</text>
    ${gauge(box.x, 4)}`,
  }),
).join('\n\n  ');

/**
 * The first step's diagram: one box, and every key in it. It is a state overlay
 * on the same band the shards use rather than a fourth region, because it is
 * the same data — the question is only how many boxes it is spread over.
 */
const ghost = `<g class="sh-ghost">
    <rect class="scene-box sh-ghost-box" x="${GHOST_BOX.x}" y="${GHOST_BOX.y}" width="${GHOST_BOX.w}" height="${GHOST_BOX.h}" rx="28" />
    ${Array.from({ length: KEY_COUNT }, (_value, index) => index)
      .map(
        (index) =>
          `<rect class="sh-gcell" x="${GHOST_X0 + index * GHOST_PITCH}" y="${GHOST_Y}" width="${GHOST_W}" height="${GHOST_H}" rx="10" />`,
      )
      .join(pad(4))}
  </g>`;

/** What the last query cost: one box, or all of them. */
const costPlate = chip({
  x: COST_PLATE.x,
  y: COST_PLATE.y,
  width: COST_PLATE.w,
  height: COST_PLATE.h,
  rx: 24,
  className: 'sh-cost',
  bgClass: 'sh-cost-bg',
  variant: 'outline',
  text: (
    [
      ['one', '1 shard'],
      ['fan', 'fan-out'],
    ] as const
  )
    .map(
      ([id, label]) =>
        `<text class="scene-counter scene-mono sh-cost-text sh-cost--${id}" x="${COST_TEXT_X}" y="${COST_TEXT_Y}" text-anchor="middle">${mono(label)}</text>`,
    )
    .join(pad(6)),
});

/** How many keys the last answer moved. */
const movedReadout = counterVariants({
  x: MOVED_X,
  y: MOVED_Y,
  className: 'sh-moved',
  max: MOVED_MAX,
  format: (n) => mono(`moved ${n}`),
});

/** One mark per shard: the boxes the last query had to open. */
const touches = TOUCH_XS.map(
  (x, index) =>
    `<rect class="sh-touch sh-touch--${index + 1}" data-sh-touch="${TOUCH_STATE}" x="${x}" y="${TOUCH_Y}" width="${TOUCH_SIDE}" height="${TOUCH_SIDE}" rx="10" />`,
).join(pad(4));

const stageAttrs = Object.entries(STAGE_STATE)
  .map(([name, value]) => `${name}="${value}"`)
  .join(' ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageAttrs} aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_S0, Y_ROUTER_BOTTOM, Y_SHARD_TOP, 'scene-link sh-lane sh-lane--0')}
  ${verticalLink(X_S1, Y_ROUTER_BOTTOM, Y_SHARD_TOP, 'scene-link sh-lane sh-lane--1')}
  ${verticalLink(X_S2, Y_ROUTER_BOTTOM, Y_SHARD_TOP, 'scene-link sh-lane sh-lane--2')}

  ${clientBox({
    x: ROUTER.x,
    width: ROUTER.w,
    y: ROUTER.y,
    height: ROUTER.h,
    title: 'Router',
    titleX: ROUTER_TITLE_X,
    titleY: ROUTER_TITLE_Y,
    titleAnchor: null,
    extraClass: 'sh-router',
    children: `
    ${rulePlate}

    ${keysReadout}`,
  })}

  ${shards}

  ${ghost}

  <g class="scene-service sh-queries">
    <rect class="scene-box" x="${QUERIES.x}" y="${QUERIES.y}" width="${QUERIES.w}" height="${QUERIES.h}" rx="28" />
    ${costPlate}

    ${movedReadout}

    ${touches}
  </g>

  ${requestsLayer()}
</svg>`;
