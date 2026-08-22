/**
 * Static stage markup for the Middleware Pipeline scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. This stage is laid out differently
 * from the others, because the middle of it is a stack rather than a node:
 *   - y 0..440      kept empty for the step title card
 *   - y 440..640    Client box
 *   - y 760..1560   Pipeline: five middleware layers, top to bottom
 *   - y 1620..1800  Endpoint box
 *
 * The lane at x 540 runs through the empty band between each layer's name and
 * its direction tick, so a request never covers either.
 */

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
      <rect class="mw-layer-box" x="190" y="${y - 60}" width="700" height="120" rx="20" />
      <text class="mw-layer-name" x="215" y="${y + 9}">${LAYER_NAMES[index]}</text>
      <text class="mw-next" x="215" y="${y + 45}">next()</text>
      <text class="mw-tick mw-tick--down" x="860" y="${y + 12}" text-anchor="middle">\u25bc</text>
      <text class="mw-tick mw-tick--up" x="860" y="${y + 12}" text-anchor="middle">\u25b2</text>
    </g>`;
};

export const stageMarkup = `<svg class="scene-stage" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg" data-order="a" aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  <line class="scene-link" x1="540" y1="640" x2="540" y2="760" />
  <line class="scene-link" x1="540" y1="1560" x2="540" y2="1620" />

  <g class="scene-client">
    <rect class="scene-box" x="280" y="440" width="520" height="200" rx="28" />
    <text class="scene-node-title" x="540" y="555" text-anchor="middle">Client</text>
  </g>

  <g class="scene-node">
    <rect class="scene-box" x="130" y="760" width="820" height="800" rx="28" />
    <text class="scene-node-label" x="170" y="802">Pipeline</text>

    ${LAYER_NAMES.map((_name, index) => layer(index)).join('\n    ')}
  </g>

  <g class="mw-endpoint" data-endpoint-state="idle">
    <rect class="scene-box mw-endpoint-box" x="280" y="1620" width="520" height="180" rx="28" />
    <text class="scene-node-title" x="540" y="1725" text-anchor="middle">Endpoint</text>
  </g>

  <g class="scene-requests"></g>
</svg>`;
