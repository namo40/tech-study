/**
 * Static stage markup for the Cache Stampede scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Bands match the other scenes:
 *   - y 0..440      kept empty for the step title card
 *   - y 440..680    Clients box, one lane at x 540, with the offered rate
 *   - y 880..1270   Cache node: the hot key card, the TTL ring, the design chips
 *   - y 1500..1740  Origin box: the load gauge and the latency it costs
 *
 * The lane runs at x 540 and a miss carries straight through the node, so the
 * whole strip between x 484 and x 596 is left empty: the key card sits to the
 * left of it and the TTL ring to the right, and nothing is ever written across
 * the middle.
 */

import {
  VIEWBOX,
  chip,
  clientBox,
  nodeFrame,
  requestsLayer,
  serviceBox,
  timerRing,
  verticalLink,
} from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- the lane -------------------------------------------------------------

/** The single lane every request travels along. */
export const X_LANE = 540;
/** Resting y of a request inside the Clients box. */
export const Y_CLIENT = 620;
/** y a request reaches inside the Cache node, where it learns whether it hit. */
export const Y_CACHE = 1075;
/** y a request reaches inside the Origin box. */
export const Y_ORIGIN = 1590;

// --- the hot key card -----------------------------------------------------

const CARD = { x: 170, y: 962, w: 310, h: 186 };
const KEY_TEXT_Y = 1000;
const ROW_2_Y = 1022;
const ROW_3_Y = 1082;
const CHIP_H = 44;
/** Baseline of a 44px chip's text, measured from the chip's top edge. */
const CHIP_TEXT_DY = 30;

/** Every version the hot value takes, so the chip has a variant for each. */
export const VALUE_VERSIONS = [7, 8, 9, 10, 11] as const;
/** The version the key holds before anything in the scene has run. */
export const BASE_VERSION = VALUE_VERSIONS[0];

/** Every state the entry's badge can show. */
export const BADGES = ['fresh', 'expired', 'stale'] as const;
export type Badge = (typeof BADGES)[number];

/** Highest duplicate recompute count the `× n` chip counts to. */
export const DUP_MAX = 8;

// --- the TTL rings --------------------------------------------------------

/** The hot key's countdown, drawn as an arc that empties. */
export const TTL = { cx: 755, cy: 1020, r: 66 };
export const TTL_CIRCUMFERENCE = 2 * Math.PI * TTL.r;

/** The three keys the jitter demonstration gives different lifetimes to. */
export const MINI = { cxs: [780, 838, 896], cy: 1194, r: 22 };
export const MINI_CIRCUMFERENCE = 2 * Math.PI * MINI.r;

// --- the origin gauge -----------------------------------------------------

export const GAUGE = { x: 310, y: 1650, w: 460, h: 28 };
/** Concurrent recomputations the gauge is full at. */
export const LOAD_MAX = 8;

/** Latency the origin answers in when it is idle, in milliseconds. */
export const P95_BASE = 2;
/** Milliseconds each concurrent recomputation adds to the tail. */
export const P95_PER_LOAD = 180;
/** The tail latency at each load, so the readout is the gauge read as time. */
export const P95_VALUES = Array.from(
  { length: LOAD_MAX + 1 },
  (_value, load) => P95_BASE + load * P95_PER_LOAD,
);

// --- the offered rate -----------------------------------------------------

/** Requests each dot on the lane stands for. */
export const RPS_PER_DOT = 10;
/** The window the Clients box averages its own output over, in seconds. */
export const RPS_WINDOW = 1;
/** Every rate the readout can settle on. */
export const RPS_VALUES = [0, 10, 20, 30, 40] as const;

// --- markup helpers -------------------------------------------------------

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

/** One design chip: a plate that is only on the stage once its idea is. */
const designChip = (
  key: string,
  label: string,
  x: number,
  y: number,
  width: number,
): string =>
  `<g class="cst-design cst-design--${key}">
      <rect class="cst-design-bg" x="${x}" y="${y}" width="${width}" height="42" rx="21" />
      <text class="cst-design-text" x="${x + width / 2}" y="${y + 29}" text-anchor="middle">${label}</text>
    </g>`;

const valueVariants = stack(
  VALUE_VERSIONS.map((n) => [String(n), `v ${n}`] as [string, string]),
  'cst-value-text',
  CARD.x + 22 + 48,
  ROW_2_Y + CHIP_TEXT_DY,
  8,
);

const badgeVariants = stack(
  BADGES.map((name) => [name, name] as [string, string]),
  'cst-badge-text',
  CARD.x + 136 + 76,
  ROW_2_Y + CHIP_TEXT_DY,
  8,
);

const dupVariants = stack(
  Array.from({ length: DUP_MAX }, (_value, n) => [String(n + 1), `× ${n + 1}`] as [string, string]),
  'cst-dup-text',
  CARD.x + 22 + 48,
  ROW_3_Y + CHIP_TEXT_DY,
  8,
);

const loadVariants = stack(
  P95_VALUES.map((ms, load) => [String(load), `p95 ${ms} ms`] as [string, string]),
  'cst-p95',
  770,
  1556,
  4,
  'end',
);

const rpsVariants = stack(
  RPS_VALUES.map((n) => [String(n), `rps ${n}`] as [string, string]),
  'cst-rps',
  880,
  630,
  4,
  'end',
);

/**
 * The gauge's fill is a stack like everything else: one rectangle per load the
 * origin can be under, so the bar and the latency readout cannot disagree and
 * neither has to be undone when the reader scrubs backwards.
 */
const gaugeFills = Array.from({ length: LOAD_MAX + 1 }, (_value, load) => load)
  .map(
    (load) =>
      `<rect class="scene-fill cst-gaugefill cst-gaugefill--${load}" x="${GAUGE.x}" y="${GAUGE.y}" width="${Math.round((load / LOAD_MAX) * GAUGE.w)}" height="${GAUGE.h}" rx="14" />`,
  )
  .join('\n    ');

const miniRings = MINI.cxs
  .map((cx) =>
    timerRing({
      cx,
      cy: MINI.cy,
      r: MINI.r,
      className: 'cst-mini',
      groupClass: 'cst-mini',
      indent: 4,
    }),
  )
  .join('\n    ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" data-badge="fresh" data-value="${BASE_VERSION}" data-dup="0" data-load="0" data-rps="0" data-sf="off" data-jitter="off" data-early="off" data-neg="off" aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_LANE, 680, 880)}
  ${verticalLink(X_LANE, 1270, 1500)}

  ${clientBox({
    x: 130,
    width: 820,
    title: 'Clients',
    titleY: 505,
    children: `
    ${rpsVariants}`,
  })}

  ${nodeFrame({
    label: 'Cache',
    labelY: 938,
    children: `    <g class="cst-card">
      <rect class="cst-card-bg" x="${CARD.x}" y="${CARD.y}" width="${CARD.w}" height="${CARD.h}" rx="20" />
      <text class="scene-mono cst-key" x="${CARD.x + 22}" y="${KEY_TEXT_Y}">key: product-42</text>
      ${chip({
        x: CARD.x + 22,
        y: ROW_2_Y,
        width: 96,
        height: CHIP_H,
        rx: 22,
        className: 'cst-value',
        variant: 'filled',
        text: valueVariants,
        indent: 6,
      })}
      <g class="cst-badge">
        <rect class="cst-badge-bg" x="${CARD.x + 136}" y="${ROW_2_Y}" width="152" height="${CHIP_H}" rx="22" />
        ${badgeVariants}
      </g>
      <g class="cst-dup">
        <rect class="cst-dup-bg" x="${CARD.x + 22}" y="${ROW_3_Y}" width="96" height="${CHIP_H}" rx="22" />
        ${dupVariants}
      </g>
      <g class="cst-nf">
        <rect class="cst-nf-bg" x="${CARD.x + 130}" y="${ROW_3_Y}" width="158" height="${CHIP_H}" rx="22" />
        <text class="cst-nf-text" x="${CARD.x + 130 + 79}" y="${ROW_3_Y + CHIP_TEXT_DY}" text-anchor="middle">not found</text>
      </g>
    </g>

    ${timerRing({
      cx: TTL.cx,
      cy: TTL.cy,
      r: TTL.r,
      className: 'cst-ttl',
      groupClass: 'cst-ttl',
      labelText: 'TTL',
      labelY: 1124,
      indent: 4,
    })}

    ${miniRings}

    ${designChip('sf', 'single flight', 170, 1166, 210)}

    ${designChip('early', 'early refresh', 170, 1216, 210)}

    ${designChip('jitter', 'jitter', 600, 1166, 120)}

    ${designChip('neg', 'negative', 600, 1216, 150)}`,
  })}

  ${serviceBox({
    title: 'Origin',
    titleX: 310,
    titleY: 1556,
    titleClass: 'scene-node-label',
    titleAnchor: null,
    children: `
    ${loadVariants}

    <rect class="scene-track cst-gauge-track" x="${GAUGE.x}" y="${GAUGE.y}" width="${GAUGE.w}" height="${GAUGE.h}" rx="14" />
    ${gaugeFills}

    <text class="scene-mono cst-scale" x="${GAUGE.x}" y="1712">1/h</text>
    <text class="scene-mono cst-scale" x="${GAUGE.x + GAUGE.w}" y="1712" text-anchor="end">n/s</text>`,
  })}

  ${requestsLayer()}
</svg>`;
