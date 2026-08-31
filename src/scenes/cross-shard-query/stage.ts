/**
 * Static stage markup for the Cross-shard Query scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Three bands, one per party to the
 * question "does this query carry the partition key":
 *   - y 0..440       kept empty for the step title card
 *   - y 440..680     App (x 130..950): the query being asked, drawn as a chip
 *                    that either carries a `key` badge or does not, and the
 *                    `ms n` the last answer cost. The two chips are two
 *                    pictures rather than one picture in two colours, because
 *                    the whole scene is the difference between them
 *   - y 880..1270    Router (x 130..950): the `key` it read and the shard that
 *                    key names, the `scatter` fan for a question with no key,
 *                    the `gather` bar that waits on the slowest shard, and the
 *                    `partial` lamp for a gather that gave up
 *   - y 1500..1740   Shards (x 280..800): `S1`, `S2` and `S3` as cards, each
 *                    with a bar reading what that shard costs to answer, plus
 *                    the `view` card the fourth step adds
 *
 * Two lane segments and no others, both axis aligned and both at x 540:
 *   - `Y_APP_BOTTOM` 680 to `Y_ROUTER_TOP` 880, downward only. What rides it is
 *     a query on its way to the router, carrying a `key` tag when it has one.
 *   - `Y_ROUTER_BOTTOM` 1270 to `Y_SHARDS_TOP` 1500, downward only. What rides
 *     it is what the router decided to send: one traveller tagged with the shard
 *     a key names, three sent one after another for a scatter, or one tagged
 *     `view` for a summary read or a write that keeps the summary fresh.
 *
 * A scatter is three travellers down one column rather than three columns at
 * once, so the lane is never occupied twice at the same height; the parallel
 * round trip it stands for is drawn inside the Shards box, as the per-shard bar
 * states. A traveller has a halo of r 26, so each lane sweeps a 52px band at
 * x 514..566 and everything written beside one keeps 30px off it. The upper lane
 * sweeps y 654..906, so the App band writes nothing below y 654 in that column
 * and the Router nothing above y 936 in it. The lower lane sweeps y 1244..1526,
 * so the Router writes nothing below y 1214 in that column and the Shards band
 * nothing above y 1556 in it.
 *
 * Declared texture: the query chip's key badge, the fan rays, the `gather` track
 * and its fills, and the per-shard latency tracks and fills. Everything else on
 * the stage is a word, and every word is one of the fixed labels.
 *
 * Every value the reader can read is a stack of elements on one spot with a base
 * rule hiding all of them and the current `data-*` revealing one, so nothing is
 * interpolated and scrubbing backwards lands on the value rather than on an
 * average of two: the `ms n` readout, the shard a key names, the `gather` fill,
 * and each card's latency bar.
 */

import {
  VIEWBOX,
  clientBox,
  requestsLayer,
  serviceBox,
  verticalLink,
} from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- geometry --------------------------------------------------------------

/** The one column anything travels on, and the four edges it runs between. */
export const X_LANE = 540;
export const Y_APP_BOTTOM = 680;
export const Y_ROUTER_TOP = 880;
export const Y_ROUTER_BOTTOM = 1270;
export const Y_SHARDS_TOP = 1500;

/** The App band: the question being asked, and what the last answer cost. */
const APP = { x: 130, y: 440, w: 820, h: 240 };
const APP_TITLE = { x: 152, y: 498 };
const MS = { x: 928, y: 498 };
/** The query chip: a plate, the key badge on it, and the word `key`. */
const CHIP = { x: 300, y: 540, w: 250, h: 76, rx: 22 };
const CHIP_BADGE = { x: 324, y: 558, w: 42, h: 42, rx: 10 };
const CHIP_KEY = { x: 392, y: 590 };

/** The Router band: what it read, what it sent, and what it is waiting for. */
const ROUTER = { x: 130, y: 880, w: 820, h: 390 };
const ROUTER_TITLE = { x: 152, y: 940 };
/** The plate the key read is written on, and the shard that key names. */
const KEY_PLATE = { x: 166, y: 990, w: 300, h: 68, rx: 20 };
const KEY_WORD = { x: 192, y: 1036 };
const KEY_TARGET = { x: 440, y: 1036 };
/** The plate the fan is drawn on: the word, then the three rays. */
const FAN_PLATE = { x: 520, y: 990, w: 410, h: 68, rx: 20 };
const FAN_WORD = { x: 548, y: 1036 };
const FAN_FROM = { x: 760, y: 1024 };
const FAN_TO = [
  { x: 890, y: 992 },
  { x: 895, y: 1024 },
  { x: 890, y: 1056 },
] as const;
/** The bar that waits on the slowest shard, and the word it is read under. */
const GATHER_WORD = { x: 166, y: 1158 };
const GATHER_BAR = { x: 330, y: 1124, w: 420, h: 40, rx: 12 };
/** The verdict a gather that gave up returns. */
const PARTIAL = { x: 776, y: 1112, w: 154, h: 56, rx: 18 };
const PARTIAL_TEXT = { x: 853, y: 1150 };

/** The Shards band: three shards, and the summary the fourth step adds. */
const SHARDS = { x: 280, y: 1500, w: 520, h: 240 };
const SHARDS_TITLE = { x: 302, y: 1556 };
const CARD_X: Record<string, number> = { s1: 300, s2: 424, s3: 548, view: 672 };
const CARD = { y: 1580, w: 108, h: 120, rx: 20 };
const CARD_NAME = { dx: 54, y: 1620 };
const CARD_BAR = { dx: 14, y: 1650, w: 80, h: 22, rx: 7 };

// --- what the stage can say about itself -----------------------------------

/** The three shards, plus the summary card that is a shard-shaped read. */
export const CARD_IDS = ['s1', 's2', 's3', 'view'] as const;
export type CardId = (typeof CARD_IDS)[number];

/** The name the fixed labels give a card. */
export const CARD_NAMES: Record<CardId, string> = {
  s1: 'S1',
  s2: 'S2',
  s3: 'S3',
  view: 'view',
};

/** The three that answer a scatter. The `view` card is never scattered to. */
export const SHARD_IDS = ['s1', 's2', 's3'] as const;
export type ShardId = (typeof SHARD_IDS)[number];

/**
 * What a card is doing. `slow` is the one participant still outstanding once
 * every other one has answered, which is the whole third step; `timeout` is that
 * one having run past the budget.
 */
export const CARD_STATES = ['idle', 'busy', 'answer', 'slow', 'timeout'] as const;
export type CardState = (typeof CARD_STATES)[number];

/**
 * Every latency a bar is ever drawn at, in milliseconds. The three bases are the
 * first three; the rest are what contention in the first step's world adds, plus
 * the budget a shard burns before it is given up on.
 */
export const LATENCIES = [12, 30, 75, 90, 120, 135, 180] as const;

/** How wide a bar is for a latency, floored so a fast shard is still visible. */
const barWidth = (ms: number): number => Math.min(CARD_BAR.w, Math.round(12 + ms * 0.29));

/** Every value the `ms n` readout is ever set to. */
export const MS_VALUES = [0, 12, 30, 90, 120, 135, 180] as const;

/** What the router resolved the question to, drawn beside the word `key`. */
export const READS = ['off', 's1', 's2', 's3', 'view'] as const;
export type Read = (typeof READS)[number];

/** Whether the counterfactual world where nothing carries a key is up. */
export const GHOSTS = ['off', 'on'] as const;

/** Whether the router has a key to route by at all. */
export const MODES = ['broadcast', 'keyed'] as const;

/** Which of the two chips the App is holding up, or neither. */
export const ASKS = ['off', 'keyed', 'keyless'] as const;
export type Ask = (typeof ASKS)[number];

/** What the gather bar is doing. */
export const GATHERS = ['off', 'wait', 'done', 'partial'] as const;
export type Gather = (typeof GATHERS)[number];

/** How many of the three answered. Three fills, and none at all for zero. */
export const GOT_MAX = 3;
const GOT_WIDTHS = [140, 280, 420] as const;

/** Whether the summary exists, and whether a write just touched it. */
export const VIEWS = ['absent', 'present', 'fresh'] as const;
export type ViewState = (typeof VIEWS)[number];

/** What the scene is holding up for a moment, drawn on the band it is about. */
export const MARKS = ['none', 'carried', 'sheet', 'fleet', 'single', 'fan', 'shape'] as const;
export type Mark = (typeof MARKS)[number];

/**
 * What every `data-*` on the stage starts at, keyed by the target the timeline
 * addresses it through. The markup below is written from this, so the opening
 * frame is the whole diagram in its starting state — an App with nothing to ask
 * and `ms 0`, a Router that has read nothing and sent nothing, three idle shards
 * whose bars already say that `S3` is the slow one, no summary, and nothing in
 * flight — and the timeline never restates a value already there.
 */
export const STAGE_STATE: Record<string, string> = {
  'stage@data-csq-ghost': 'off',
  'stage@data-csq-mode': 'broadcast',
  'stage@data-csq-ask': 'off',
  'stage@data-csq-ms': '0',
  'stage@data-csq-read': 'off',
  'stage@data-csq-scatter': 'off',
  'stage@data-csq-gather': 'off',
  'stage@data-csq-got': '0',
  'stage@data-csq-partial': 'off',
  'stage@data-csq-view': 'absent',
  'stage@data-csq-mark': 'none',
  'stage@data-csq-settled': 'off',
  'card-s1@data-csq-card': 'idle',
  'card-s1@data-csq-lat': '30',
  'card-s2@data-csq-card': 'idle',
  'card-s2@data-csq-lat': '30',
  'card-s3@data-csq-card': 'idle',
  'card-s3@data-csq-lat': '90',
  'card-view@data-csq-card': 'idle',
  'card-view@data-csq-lat': '12',
};

// --- markup ----------------------------------------------------------------

/** Newline plus `n` spaces, the separator between lines of one fragment. */
const pad = (n: number): string => `\n${' '.repeat(n)}`;

/** Non-breaking spaces, so a monospaced readout keeps its gaps in SVG. */
const mono = (text: string): string => text.replace(/ /g, '&#160;');

/** The `ms n` readout: one text per value it ever reads, stacked on one spot. */
const msVariants = MS_VALUES.map(
  (value) =>
    `<text class="scene-counter csq-ms csq-ms--${value}" x="${MS.x}" y="${MS.y}" text-anchor="end">${mono(`ms ${value}`)}</text>`,
).join(pad(4));

/** The shard a key names, written beside the word it was read from. */
const readVariants = READS.filter((value) => value !== 'off')
  .map(
    (value) =>
      `<text class="csq-target csq-target--${value}" x="${KEY_TARGET.x}" y="${KEY_TARGET.y}" text-anchor="end">${CARD_NAMES[value as CardId]}</text>`,
  )
  .join(pad(4));

/** The three rays that say the question went to everyone. */
const fanRays = FAN_TO.map(
  (to) =>
    `<line class="csq-ray" x1="${FAN_FROM.x}" y1="${FAN_FROM.y}" x2="${to.x}" y2="${to.y}" />`,
).join(pad(4));

/** The gather bar: a fixed track and one fill per answer it can be holding. */
const gatherFills = GOT_WIDTHS.map(
  (width, index) =>
    `<rect class="scene-fill csq-gather-fill csq-gather-fill--${index + 1}" x="${GATHER_BAR.x}" y="${GATHER_BAR.y}" width="${width}" height="${GATHER_BAR.h}" rx="${GATHER_BAR.rx}" />`,
).join(pad(4));

/**
 * One card: its name and the bar that says what it costs to answer. The bar is
 * one fill per latency it is ever drawn at, stacked on one origin, so a cost is
 * a value the state names rather than a width being tweened.
 */
const card = (id: CardId): string => {
  const x = CARD_X[id] ?? 0;
  const fills = LATENCIES.map(
    (ms) =>
      `<rect class="scene-fill csq-lat-fill csq-lat-fill--${ms}" x="${x + CARD_BAR.dx}" y="${CARD_BAR.y}" width="${barWidth(ms)}" height="${CARD_BAR.h}" rx="${CARD_BAR.rx}" />`,
  ).join(pad(8));
  return `<g class="csq-card csq-card--${id}" data-csq-card="${STAGE_STATE[`card-${id}@data-csq-card`]}" data-csq-lat="${STAGE_STATE[`card-${id}@data-csq-lat`]}">
      <rect class="csq-card-bg" x="${x}" y="${CARD.y}" width="${CARD.w}" height="${CARD.h}" rx="${CARD.rx}" />
      <text class="csq-card-name" x="${x + CARD_NAME.dx}" y="${CARD_NAME.y}" text-anchor="middle">${CARD_NAMES[id]}</text>
      <rect class="scene-track csq-lat-track" x="${x + CARD_BAR.dx}" y="${CARD_BAR.y}" width="${CARD_BAR.w}" height="${CARD_BAR.h}" rx="${CARD_BAR.rx}" />
      ${fills}
    </g>`;
};

const stageAttrs = Object.entries(STAGE_STATE)
  .filter(([key]) => key.startsWith('stage@'))
  .map(([key, value]) => `${key.slice('stage@'.length)}="${value}"`)
  .join(' ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageAttrs} aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_LANE, Y_APP_BOTTOM, Y_ROUTER_TOP, 'scene-link csq-lane--ask')}
  ${verticalLink(X_LANE, Y_ROUTER_BOTTOM, Y_SHARDS_TOP, 'scene-link csq-lane--send')}

  ${clientBox({
    x: APP.x,
    width: APP.w,
    y: APP.y,
    height: APP.h,
    title: 'App',
    titleX: APP_TITLE.x,
    titleY: APP_TITLE.y,
    titleClass: 'scene-node-title csq-title',
    titleAnchor: null,
    extraClass: 'csq-app',
    children: `
    <g class="csq-chip">
      <rect class="csq-chip-bg" x="${CHIP.x}" y="${CHIP.y}" width="${CHIP.w}" height="${CHIP.h}" rx="${CHIP.rx}" />
      <rect class="csq-chip-badge" x="${CHIP_BADGE.x}" y="${CHIP_BADGE.y}" width="${CHIP_BADGE.w}" height="${CHIP_BADGE.h}" rx="${CHIP_BADGE.rx}" />
      <text class="csq-chip-key" x="${CHIP_KEY.x}" y="${CHIP_KEY.y}">key</text>
    </g>

    ${msVariants}`,
  })}

  ${serviceBox({
    x: ROUTER.x,
    width: ROUTER.w,
    y: ROUTER.y,
    height: ROUTER.h,
    title: 'Router',
    titleX: ROUTER_TITLE.x,
    titleY: ROUTER_TITLE.y,
    titleClass: 'scene-node-title csq-title',
    titleAnchor: null,
    className: 'scene-node csq-router',
    children: `
    <rect class="csq-key-bg" x="${KEY_PLATE.x}" y="${KEY_PLATE.y}" width="${KEY_PLATE.w}" height="${KEY_PLATE.h}" rx="${KEY_PLATE.rx}" />
    <text class="csq-key-word" x="${KEY_WORD.x}" y="${KEY_WORD.y}">key</text>
    ${readVariants}

    <rect class="csq-fan-bg" x="${FAN_PLATE.x}" y="${FAN_PLATE.y}" width="${FAN_PLATE.w}" height="${FAN_PLATE.h}" rx="${FAN_PLATE.rx}" />
    <text class="csq-fan-word" x="${FAN_WORD.x}" y="${FAN_WORD.y}">scatter</text>
    ${fanRays}

    <text class="csq-gather-word" x="${GATHER_WORD.x}" y="${GATHER_WORD.y}">gather</text>
    <rect class="scene-track csq-gather-track" x="${GATHER_BAR.x}" y="${GATHER_BAR.y}" width="${GATHER_BAR.w}" height="${GATHER_BAR.h}" rx="${GATHER_BAR.rx}" />
    ${gatherFills}

    <rect class="csq-partial-bg" x="${PARTIAL.x}" y="${PARTIAL.y}" width="${PARTIAL.w}" height="${PARTIAL.h}" rx="${PARTIAL.rx}" />
    <text class="csq-partial-text" x="${PARTIAL_TEXT.x}" y="${PARTIAL_TEXT.y}" text-anchor="middle">partial</text>`,
  })}

  ${serviceBox({
    x: SHARDS.x,
    width: SHARDS.w,
    y: SHARDS.y,
    height: SHARDS.h,
    title: 'Shards',
    titleX: SHARDS_TITLE.x,
    titleY: SHARDS_TITLE.y,
    titleClass: 'scene-node-title csq-title',
    titleAnchor: null,
    className: 'scene-service csq-shards',
    children: `
    ${CARD_IDS.map(card).join(pad(4))}`,
  })}

  ${requestsLayer()}
</svg>`;
