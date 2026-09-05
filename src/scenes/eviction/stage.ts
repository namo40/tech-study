/**
 * Static stage markup for the Eviction scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Three bands and one column:
 *   - y 0..400       above the cropped viewBox (see shared VIEWBOX)
 *   - y 400..440     the frame's top padding; nothing is drawn here
 *   - y 440..680     App: which key it is asking for, and how many of its reads
 *                    were answered from the cache and how many were not
 *   - y 880..1270    Cache: six item cells, how many of them are taken, which
 *                    policy is choosing when they are all taken, and the pin
 *                    that takes one entry out of the policy's reach
 *   - y 1500..1740   Origin: whether it is answering, and how many reads it has
 *                    had to answer because the cache did not have the key
 *
 * Two lanes and no others, both on the column every box is centred on. `X_LANE`
 * runs from the bottom edge of App to the top edge of Cache, and again from the
 * bottom edge of Cache to the top edge of Origin. Every leg any traveller makes
 * is a move along one of those two segments: no rails, no corners, no diagonals,
 * and no leg of zero length.
 *
 * The cache is a boundary rather than a corridor, so a traveller is never drawn
 * inside it. A read from the App ends on the cache's top edge and is absorbed
 * there; the trip to the origin that a miss pays for starts on the cache's
 * bottom edge. That is why the six cells can hold still and be read.
 *
 * The recency ladder is the one piece of texture that carries meaning by
 * brightness. It is not an animated opacity: `data-ev-cell` names one of five
 * discrete rungs — `empty`, `cold`, `cool`, `warm`, `hot`, plus `victim` for the
 * moment the policy has chosen — and CSS paints each rung. Nothing about it is
 * interpolated, so scrubbing backwards lands on the same rung it left.
 *
 * Everything else the reader can read off this stage is a stack of text elements
 * on one spot with a base rule hiding all of them, so a value is never
 * interpolated either. There is no continuous quantity anywhere on the stage.
 */

import {
  VIEWBOX,
  clientBox,
  counterVariants,
  nodeFrame,
  requestsLayer,
  serviceBox,
  verticalLink,
} from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- the one lane column ---------------------------------------------------

/** Every box is centred here, and both lanes run down it. */
export const X_LANE = 540;

/** Bottom edge of App, and top edge of Cache. */
export const Y_APP = 680;
export const Y_CACHE_TOP = 880;

/** Bottom edge of Cache, and top edge of Origin. */
export const Y_CACHE_BOTTOM = 1270;
export const Y_ORIGIN = 1500;

// --- the keys ---------------------------------------------------------------

/**
 * The closed set of key names this stage can show. `k1`..`k8` are eight
 * distinct answers; `v-a`, `v-b` and `v-c` are three trivially different
 * spellings of the key for `k8`'s answer, which is the whole of the third step.
 * Nothing outside this list is ever written into a cell.
 */
export const KEY_IDS = [
  'k1',
  'k2',
  'k3',
  'k4',
  'k5',
  'k6',
  'k7',
  'k8',
  'v-a',
  'v-b',
  'v-c',
] as const;

export type KeyId = (typeof KEY_IDS)[number];

/** How each key spells itself inside a cell and in the App's ask plate. */
export const KEY_LABEL: Record<KeyId, string> = {
  k1: 'k1',
  k2: 'k2',
  k3: 'k3',
  k4: 'k4',
  k5: 'k5',
  k6: 'k6',
  k7: 'k7',
  k8: 'k8',
  'v-a': 'k8?a',
  'v-b': 'k8?b',
  'v-c': 'k8?c',
};

/** The key a variant collapses onto once the key is normalized. */
export const NORMALIZED: Partial<Record<KeyId, KeyId>> = {
  'v-a': 'k8',
  'v-b': 'k8',
  'v-c': 'k8',
};

/** How many entries the cache is allowed to hold. */
export const CAPACITY = 6;

/** Highest value each readout is written out to. */
export const MAX_HITS = 18;
export const MAX_MISSES = 12;
export const MAX_LOAD = 12;

/** The rungs of the recency ladder, dimmest first, plus the two off-ladder states. */
export type CellState = 'empty' | 'cold' | 'cool' | 'warm' | 'hot' | 'victim';

/**
 * What the cache already holds on the first frame, so the opening frame is the
 * whole diagram rather than an empty one. Four entries, written oldest first:
 * `k1` has gone longest without a reader and `k4` was touched most recently,
 * which is why the ladder under them is already leaning.
 */
export const INITIAL_KEYS: readonly KeyId[] = ['k1', 'k2', 'k3', 'k4'];

/**
 * The rung each cell starts on. These are not chosen: they are what the scene's
 * own ranking produces for `INITIAL_KEYS`, and the timeline asserts as much by
 * starting from them and finding nothing to change on the first frame.
 */
export const INITIAL_STATE: readonly CellState[] = [
  'cold',
  'cool',
  'warm',
  'hot',
  'empty',
  'empty',
];

// --- the boxes -------------------------------------------------------------

const APP = { x: 130, y: 440, w: 820, h: 240 };
const CACHE = { y: 880, h: 390 };
const ORIGIN = { x: 280, y: 1500, w: 520, h: 240 };

const APP_TITLE = { x: 170, y: 490 };
const CACHE_LABEL_Y = 938;
const ORIGIN_TITLE = { x: 320, y: 1556 };

// --- inside App -------------------------------------------------------------

/** The plate naming the key the App is asking for right now. */
const ASK = { x: 452, y: 520, w: 176, h: 68 };
const ASK_TEXT = { x: 540, y: 566 };
/** The ring that says the key is normalized before it is used. */
const ASK_RING = { x: 440, y: 508, w: 200, h: 92 };

/** Reads answered by the cache, and reads that were not. */
const HITS = { x: 170, y: 646 };
const MISSES = { x: 910, y: 646 };
/** The ring the closing beat puts around the miss count. */
const MARK = { x: 714, y: 608, w: 208, h: 50 };

// --- inside Cache -----------------------------------------------------------

/** The policy plate, lit from the step where the cache first runs out of room. */
const POLICY = { x: 760, y: 908, w: 148, h: 62 };
const POLICY_TEXT = { x: 834, y: 949 };

/** How many of the six cells are taken. */
const SIZE = { x: 170, y: 1230 };

/** One cell per unit of the fixed capacity, left to right. */
const CELL = { y: 1006, w: 116, h: 152 };
const CELL_X0 = 157;
const CELL_PITCH = 130;
const CELL_KEY_Y = 1056;
/** The rung of the recency ladder, drawn as a bar under the key name. */
const BAR = { dx: 20, y: 1082, w: 76, h: 14 };
/** The mark that takes this entry out of the policy's reach. */
const PIN_Y = 1138;

// --- inside Origin ----------------------------------------------------------

/** Lit while the origin is answering a read the cache could not. */
const WORK = { cx: X_LANE, cy: 1626, r: 30 };
const LOAD = { x: X_LANE, y: 1712 };

// --- markup ----------------------------------------------------------------

/** The stacked key names for one spot: the state names which one shows. */
const keyTexts = (className: string, x: number, y: number, indent: string): string =>
  KEY_IDS.map(
    (id) =>
      `<text class="scene-mono ${className} ${className}--${id}" x="${x}" y="${y}" text-anchor="middle">${KEY_LABEL[id]}</text>`,
  ).join(`\n${indent}`);

/** One item cell: what is in it, how recently it was touched, and whether it is pinned. */
const cell = (index: number): string => {
  const x = CELL_X0 + index * CELL_PITCH;
  const centre = x + CELL.w / 2;
  const key = INITIAL_KEYS[index] ?? 'none';
  const state = INITIAL_STATE[index] ?? 'empty';
  return `<g class="ev-cell ev-cell--${index + 1}" data-ev-cell="${state}" data-ev-key="${key}" data-ev-pin="off">
      <rect class="ev-cell-bg" x="${x}" y="${CELL.y}" width="${CELL.w}" height="${CELL.h}" rx="18" />
      ${keyTexts('ev-cell-key', centre, CELL_KEY_Y, '      ')}
      <rect class="ev-cell-bar" x="${x + BAR.dx}" y="${BAR.y}" width="${BAR.w}" height="${BAR.h}" rx="7" />
      <text class="scene-mono ev-cell-pin" x="${centre}" y="${PIN_Y}" text-anchor="middle">pin</text>
    </g>`;
};

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" data-ev-ask="none" data-ev-size="${INITIAL_KEYS.length}" data-ev-hits="0" data-ev-misses="0" data-ev-load="0" data-ev-policy="off" data-ev-norm="off" data-ev-work="off" data-ev-mark="off" data-ev-settled="off" aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_LANE, Y_APP, Y_CACHE_TOP)}
  ${verticalLink(X_LANE, Y_CACHE_BOTTOM, Y_ORIGIN)}

  ${clientBox({
    x: APP.x,
    width: APP.w,
    y: APP.y,
    height: APP.h,
    title: 'App',
    titleX: APP_TITLE.x,
    titleY: APP_TITLE.y,
    titleClass: 'scene-node-label',
    titleAnchor: null,
    children: `
    <g class="ev-ask">
      <rect class="ev-ask-ring" x="${ASK_RING.x}" y="${ASK_RING.y}" width="${ASK_RING.w}" height="${ASK_RING.h}" rx="28" />
      <rect class="ev-ask-bg" x="${ASK.x}" y="${ASK.y}" width="${ASK.w}" height="${ASK.h}" rx="22" />
      ${keyTexts('ev-ask-key', ASK_TEXT.x, ASK_TEXT.y, '      ')}
    </g>
    <rect class="ev-mark" x="${MARK.x}" y="${MARK.y}" width="${MARK.w}" height="${MARK.h}" rx="18" />
    ${counterVariants({
      x: HITS.x,
      y: HITS.y,
      className: 'scene-mono ev-hits',
      count: MAX_HITS + 1,
      format: (n) => `hits ${n}`,
    })}
    ${counterVariants({
      x: MISSES.x,
      y: MISSES.y,
      className: 'scene-mono ev-misses',
      count: MAX_MISSES + 1,
      format: (n) => `misses ${n}`,
      anchor: 'end',
    })}`,
  })}

  ${nodeFrame({
    y: CACHE.y,
    height: CACHE.h,
    label: 'Cache',
    labelY: CACHE_LABEL_Y,
    children: `    <g class="ev-policy">
      <rect class="ev-policy-bg" x="${POLICY.x}" y="${POLICY.y}" width="${POLICY.w}" height="${POLICY.h}" rx="20" />
      <text class="scene-mono ev-policy-text" x="${POLICY_TEXT.x}" y="${POLICY_TEXT.y}" text-anchor="middle">LRU</text>
    </g>

    ${[0, 1, 2, 3, 4, 5].map((index) => cell(index)).join('\n    ')}

    ${counterVariants({
      x: SIZE.x,
      y: SIZE.y,
      className: 'scene-mono ev-size',
      count: CAPACITY + 1,
      format: (n) => `size ${n}/${CAPACITY}`,
    })}`,
  })}

  ${serviceBox({
    x: ORIGIN.x,
    width: ORIGIN.w,
    y: ORIGIN.y,
    height: ORIGIN.h,
    title: 'Origin',
    titleX: ORIGIN_TITLE.x,
    titleY: ORIGIN_TITLE.y,
    titleClass: 'scene-node-label',
    titleAnchor: null,
    children: `
    <circle class="ev-work" cx="${WORK.cx}" cy="${WORK.cy}" r="${WORK.r}" />
    ${counterVariants({
      x: LOAD.x,
      y: LOAD.y,
      className: 'scene-mono ev-load',
      count: MAX_LOAD + 1,
      format: (n) => `load ${n}`,
      anchor: 'middle',
    })}`,
  })}

  ${requestsLayer()}
</svg>`;
