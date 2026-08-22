/**
 * Static stage markup for the Cache Invalidation scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Bands match the other scenes:
 *   - y 0..440      kept empty for the step title card
 *   - y 440..680    Client box, with a lane per instance
 *   - y 880..1270   Caches node: a bus line and three instance boxes
 *   - y 1500..1740  Database box with the current value, version and counter
 *
 * A read stops in the clear band near the top of its instance box, above the
 * key and the value chip, so the moment that decides hit or miss is never
 * covered by the request itself.
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

/** Lane centres, which are also the instance box centres. */
export const LANE_X = [300, 540, 780];

/** Full width of an instance TTL bar. */
export const TTL_WIDTH = 160;
/**
 * Seconds a full bar takes to drain. Fixed by step 1: the bars start at 70%
 * and expire at 4.6s.
 */
export const TTL_SECONDS = 6.6;
/**
 * A versioned key never needs invalidating, so step 4 gives it a much longer
 * life. That is also what the page's snippet does with `Expiration`.
 */
export const TTL_SECONDS_VERSIONED = 26.4;

/** The invalidate bus: messages travel left to right along it. */
export const BUS = { y: 940, from: 170, to: 910 };

/** Where a read stops inside its instance box. */
export const Y_CACHE = 1020;

const VALUES = ['v1', 'v2', 'v3', 'v4', 'v5'];

const instance = (index: number): string => {
  const cx = LANE_X[index] ?? 0;
  const left = cx - 110;
  const chips = VALUES.map(
    (v) =>
      `<text class="scene-chip-text ci-chip-text ci-chip-text--${v}" x="${cx}" y="1107" text-anchor="middle">${v}</text>`,
  ).join('\n        ');
  return `<g class="ci-inst ci-inst--${index + 1}" data-entry="fresh" data-value="v1" data-key="plain" data-old="off">
      <rect class="scene-box ci-inst-box" x="${left}" y="958" width="220" height="280" rx="18" />
      <text class="ci-inst-label" x="${left + 12}" y="990">inst ${index + 1}</text>
      <text class="scene-mono ci-key ci-key--plain" x="${cx}" y="1068" text-anchor="middle">user:42</text>
      <text class="scene-mono ci-key ci-key--v4" x="${cx}" y="1068" text-anchor="middle">user:42@v4</text>
      <text class="scene-mono ci-key ci-key--v5" x="${cx}" y="1068" text-anchor="middle">user:42@v5</text>
      <rect class="ci-chip-empty" x="${cx - 38}" y="1082" width="76" height="34" rx="17" />
      ${chip({
        x: cx - 38,
        y: 1082,
        width: 76,
        height: 34,
        rx: 17,
        className: 'ci-chip',
        variant: 'filled',
        text: chips,
        indent: 6,
      })}
      ${trackAndFill({
        x: cx - 80,
        y: 1128,
        width: TTL_WIDTH,
        height: 10,
        rx: 5,
        className: 'ci-ttl',
        fillWidth: TTL_WIDTH * 0.7,
        indent: 6,
      })}
      <g class="ci-old">
        <text class="scene-mono ci-old-key" x="${cx}" y="1176" text-anchor="middle">user:42@v4</text>
        <rect class="ci-old-chip" x="${cx - 30}" y="1188" width="60" height="26" rx="13" />
        <text class="ci-old-text" x="${cx}" y="1208" text-anchor="middle">v4</text>
      </g>
    </g>`;
};

const dbValues = VALUES.map(
  (v) => `<text class="scene-chip-text ci-db-value ci-db-value--${v}" x="470" y="1671" text-anchor="middle">${v}</text>`,
).join('\n      ');

const versions = ['4', '5']
  .map(
    (n) =>
      `<text class="scene-chip-text ci-version-text ci-version-text--${n}" x="620" y="1670" text-anchor="middle">version ${n}</text>`,
  )
  .join('\n        ');

const staleReads = counterVariants({
  x: 780,
  y: 1725,
  className: 'ci-stale-reads',
  count: 7,
  anchor: 'end',
  format: (n) => `stale reads ${n}`,
  indent: 6,
});

const links = LANE_X.map(
  (x) => `${verticalLink(x, 680, 880)}
  ${verticalLink(x, 1270, 1500)}`,
).join('\n  ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" data-db="v1" data-version="off" data-stale-reads="0" aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${links}

  ${clientBox({ title: 'Client', titleY: 575 })}

  ${nodeFrame({
    label: 'Caches',
    labelY: 918,
    children: `    <line class="ci-bus" x1="${BUS.from}" y1="${BUS.y}" x2="${BUS.to}" y2="${BUS.y}" />
    <text class="ci-bus-label" x="${BUS.to}" y="922" text-anchor="end">invalidate</text>
    <g class="ci-messages"></g>

    ${instance(0)}
    ${instance(1)}
    ${instance(2)}`,
  })}

  ${serviceBox({
    className: 'ci-db',
    titleClass: 'scene-node-title ci-db-title',
    title: 'Database',
    titleY: 1552,
    children: `
    ${chip({
      x: 420,
      y: 1640,
      width: 100,
      height: 44,
      rx: 22,
      className: 'ci-db-chip',
      variant: 'outline',
      text: dbValues,
    })}
    ${chip({
      x: 560,
      y: 1646,
      width: 120,
      height: 32,
      rx: 16,
      className: 'ci-version',
      text: versions,
    })}
    ${staleReads}`,
  })}

  ${requestsLayer()}
</svg>`;
