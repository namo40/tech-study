/**
 * Static stage markup for the Middleware Pipeline scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. This stage is laid out differently
 * from the others, because the middle of it is a stack rather than a node:
 *   - y 0..400      above the cropped viewBox (see shared VIEWBOX)
 *   - y 400..440    the frame's top padding; nothing is drawn here
 *   - y 440..640    Client box
 *   - y 760..1560   Pipeline: five middleware layers, top to bottom
 *   - y 1620..1800  Endpoint box
 *
 * The lane at x 540 runs through the empty band between each layer's name and
 * its direction tick, so a request never covers either.
 */

import {
  VIEWBOX,
  clientBox,
  nodeFrame,
  requestsLayer,
  serviceBox,
  verticalLink,
} from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

/** Middleware, in the order they are registered. */
export const LAYER_NAMES = [
  'Exception handler',
  'Static files',
  'Routing',
  'Authentication',
  'Rate limiter',
];

/** Centre y of each position in the stack, top to bottom. */
export const LAYER_Y = [880, 1020, 1160, 1300, 1440];
/** How far a layer travels when two of them trade places. */
export const SWAP_DISTANCE = LAYER_Y[1]! - LAYER_Y[0]!;

/** Resting y of a request inside the client box. */
export const Y_CLIENT = 560;
/** y a request reaches inside the endpoint box. */
export const Y_ENDPOINT = 1710;

const layer = (index: number): string => {
  const y = LAYER_Y[index] ?? 0;
  return `<g class="mw-layer mw-layer--${index + 1}" data-layer-state="idle">
      <rect class="scene-box mw-layer-box" x="190" y="${y - 60}" width="700" height="120" rx="20" />
      <text class="mw-layer-name" x="215" y="${y + 9}">${LAYER_NAMES[index]}</text>
      <text class="scene-mono mw-next" x="215" y="${y + 45}">next()</text>
      <text class="mw-tick mw-tick--down" x="860" y="${y + 12}" text-anchor="middle">▼</text>
      <text class="mw-tick mw-tick--up" x="860" y="${y + 12}" text-anchor="middle">▲</text>
    </g>`;
};

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" data-order="a" aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(540, 640, 760)}
  ${verticalLink(540, 1560, 1620)}

  ${clientBox({ height: 200, title: 'Client', titleY: 555 })}

  ${nodeFrame({
    y: 760,
    height: 800,
    label: 'Pipeline',
    labelY: 802,
    children: `
    ${LAYER_NAMES.map((_name, index) => layer(index)).join('\n    ')}`,
  })}

  ${serviceBox({
    y: 1620,
    height: 180,
    className: 'mw-endpoint',
    attrs: ' data-endpoint-state="idle"',
    boxClass: 'scene-box mw-endpoint-box',
    title: 'Endpoint',
    titleY: 1725,
  })}

  ${requestsLayer()}
</svg>`;
