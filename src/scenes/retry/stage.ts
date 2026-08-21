/**
 * Static stage markup for the Retry scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. The bands match the Circuit Breaker
 * stage so the two scenes read as the same diagram with a different middle
 * node:
 *   - y 0..440      kept empty for the step title card
 *   - y 440..680    Client box
 *   - y 880..1270   Retry node: attempt pills, backoff bar, labels
 *   - y 1500..1740  Service box with a health dot
 */

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

/** Left edge of the backoff bar. */
export const BAR_X = 170;
/** Width of a fully elapsed backoff wait. */
export const BAR_FULL = 400;

const PILL_X = [640, 724, 808];
const PILL_W = 68;

const pill = (index: number): string => {
  const x = PILL_X[index] ?? 0;
  const cx = x + PILL_W / 2;
  return `<g class="rt-pill" data-attempt="idle">
      <rect class="rt-pill-bg" x="${x}" y="972" width="${PILL_W}" height="52" rx="26" />
      <text class="rt-pill-num" x="${cx}" y="1009" text-anchor="middle">${index + 1}</text>
      <path class="rt-pill-glyph rt-pill-glyph--ok" transform="translate(${cx} 998)" d="M -8 1 L -3 6 L 8 -6" />
      <path class="rt-pill-glyph rt-pill-glyph--fail" transform="translate(${cx} 998)" d="M -7 -7 L 7 7 M 7 -7 L -7 7" />
    </g>`;
};

export const stageMarkup = `<svg class="scene-stage" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg" data-health="ok" data-wait="none" data-jitter="off" data-budget="off" aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  <line class="scene-link scene-link--upper" x1="540" y1="680" x2="540" y2="880" />
  <line class="scene-link scene-link--lower" x1="540" y1="1270" x2="540" y2="1500" />

  <g class="scene-client">
    <rect class="scene-box" x="280" y="440" width="520" height="240" rx="28" />
    <text class="scene-node-title" x="540" y="575" text-anchor="middle">Client</text>
  </g>

  <g class="scene-node">
    <rect class="scene-box" x="130" y="880" width="820" height="390" rx="28" />
    <text class="scene-node-label" x="170" y="938">Retry</text>

    <text class="scene-caption-label" x="640" y="952">attempt</text>
    ${PILL_X.map((_x, index) => pill(index)).join('\n    ')}

    <text class="scene-caption-label" x="170" y="1118">backoff</text>
    <rect class="rt-bar-track" x="${BAR_X}" y="1134" width="${BAR_FULL}" height="22" rx="11" />
    <rect class="rt-bar-fill" x="${BAR_X}" y="1134" width="0" height="22" rx="11" />

    <g class="rt-bar-end">
      <rect class="rt-bar-tick" x="566" y="1126" width="5" height="38" rx="2" />
      <text class="rt-wait rt-wait--1s" x="590" y="1153">1s</text>
      <text class="rt-wait rt-wait--2s" x="590" y="1153">2s</text>
      <text class="rt-wait rt-wait--4s" x="590" y="1153">4s</text>
    </g>
    <text class="rt-jitter" x="664" y="1153">jitter</text>

    <text class="rt-scale" x="170" y="1206">1s</text>
    <text class="rt-scale" x="220" y="1206">2s</text>
    <text class="rt-scale" x="320" y="1206">4s</text>
    <text class="rt-scale" x="520" y="1206">8s</text>
  </g>

  <text class="rt-budget" x="950" y="1330" text-anchor="end">budget exhausted</text>

  <g class="scene-service">
    <rect class="scene-box" x="280" y="1500" width="520" height="240" rx="28" />
    <text class="scene-node-title" x="540" y="1590" text-anchor="middle">Service</text>
    <circle class="scene-health-ring" cx="540" cy="1680" r="32" />
    <circle class="scene-health" cx="540" cy="1680" r="20" />
  </g>

  <g class="scene-requests"></g>
</svg>`;
