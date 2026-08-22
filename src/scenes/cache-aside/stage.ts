/**
 * Static stage markup for the Cache-Aside scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Bands match the other scenes:
 *   - y 0..440      kept empty for the step title card
 *   - y 440..680    Client box, one lane at x 540
 *   - y 880..1270   Cache node: three entry rows and the hit/miss flash
 *   - y 1500..1740  Database box with the current value and a read counter
 *
 * The lane runs at x 540, which falls in the gap between each row's value chip
 * and its TTL bar, so a request passes through the rows without covering them.
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

/** Full width of a TTL bar. */
export const TTL_WIDTH = 200;
/**
 * How long a full bar takes to drain. Chosen so the entry filled at 2.9s
 * expires at 12.8s, and so the refill at 15.6s cannot expire before the scene
 * ends.
 */
export const TTL_DURATION = 9.9;

/** y of each entry row's centre. Row 1 is `user:42`, the one the scene follows. */
export const ROW_Y = [1015, 1090, 1165];

const KEYS = ['user:42', 'order:7', 'item:9'];

const row = (index: number): string => {
  const centre = ROW_Y[index] ?? 0;
  const top = centre - 29;
  const state = index === 0 ? 'empty' : 'fresh';
  const values = ['v1', 'v2']
    .map(
      (v) =>
        `<text class="scene-chip-text ca-chip-text ca-chip-text--${v}" x="445" y="${centre + 9}" text-anchor="middle">${v}</text>`,
    )
    .join('\n        ');
  return `<g class="ca-row ca-row--${index + 1}" data-entry="${state}" data-value="v1">
      <rect class="ca-row-bg" x="170" y="${top}" width="740" height="58" rx="16" />
      <text class="scene-mono ca-key" x="195" y="${centre + 9}">${KEYS[index]}</text>
      ${chip({
        x: 400,
        y: centre - 22,
        width: 90,
        height: 44,
        rx: 22,
        className: 'ca-chip',
        variant: 'filled',
        text: values,
        indent: 6,
      })}
      ${trackAndFill({
        x: 600,
        y: centre - 7,
        width: TTL_WIDTH,
        height: 14,
        rx: 7,
        className: 'ca-ttl',
        fillWidth: index === 0 ? 0 : TTL_WIDTH,
        indent: 6,
      })}
    </g>`;
};

const flashes = ['hit', 'miss', 'stale', 'invalidate']
  .map(
    (name) =>
      `<text class="scene-flash ca-flash ca-flash--${name}" x="890" y="940" text-anchor="end">${name}</text>`,
  )
  .join('\n    ');

const dbValues = ['v1', 'v2']
  .map(
    (v) =>
      `<text class="scene-chip-text ca-db-value ca-db-value--${v}" x="540" y="1699" text-anchor="middle">${v}</text>`,
  )
  .join('\n      ');

const reads = counterVariants({
  x: 780,
  y: 1725,
  className: 'ca-reads',
  count: 4,
  anchor: 'end',
  format: (n) => `db reads ${n}`,
});

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" data-flash="none" data-reads="0" data-db="v1" aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(540, 680, 880)}
  ${verticalLink(540, 1270, 1500)}

  ${clientBox({ title: 'Client', titleY: 575 })}

  ${nodeFrame({
    label: 'Cache',
    labelY: 938,
    children: `    <text class="scene-caption-label ca-ttl-label" x="700" y="972" text-anchor="middle">TTL</text>
    ${flashes}

    ${row(0)}
    ${row(1)}
    ${row(2)}`,
  })}

  ${serviceBox({
    className: 'ca-db',
    title: 'Database',
    titleY: 1565,
    children: `
    ${chip({
      x: 490,
      y: 1668,
      width: 100,
      height: 44,
      rx: 22,
      className: 'ca-db-chip',
      variant: 'outline',
      text: dbValues,
    })}
    ${reads}`,
  })}

  ${requestsLayer()}
</svg>`;
