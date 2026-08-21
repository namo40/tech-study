/**
 * Static stage markup for the Rate Limiter scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Bands match the other scenes:
 *   - y 0..440      kept empty for the step title card
 *   - y 440..680    Client box, with the Retry-After timer just below it
 *   - y 880..1270   Rate Limiter node: token bucket, refill drip, 429 label
 *   - y 1500..1740  Service box with a health dot
 *
 * The bucket is drawn once and reused: the same markup renders the `key A`
 * bucket and, moved and scaled by a static transform, the `key B` bucket that
 * only becomes visible when the limiter is partitioned in step 4.
 */

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

/** Bucket capacity, in tokens. */
export const CAPACITY = 5;

/** Centre of the unscaled bucket, used as the origin when it moves aside. */
export const BUCKET_CENTRE = { x: 540, y: 1060 };
/** How far left the first bucket slides when the limiter is partitioned. */
export const SPLIT_OFFSET = -190;
/** Scale both buckets take once there are two of them. */
export const SPLIT_SCALE = 0.75;

/** Row of token slots along the bottom of the bucket. */
const SLOT_X = [450, 495, 540, 585, 630];
const SLOT_Y = 1110;
const SLOT_R = 18;

/** Where a refill token starts and lands, before the bucket is partitioned. */
export const DRIP = { x: 500, from: 905, to: SLOT_Y };
/** Same, for each bucket once they are scaled and moved apart. */
export const DRIP_SPLIT = { a: 320, b: 700, from: 950, to: 1097 };

/** Radius and circumference of the Retry-After sweep. */
export const RETRY_RADIUS = 38;
export const RETRY_CIRCUMFERENCE = 2 * Math.PI * RETRY_RADIUS;

const slots = SLOT_X.map(
  (x) => `<circle class="rl-slot" cx="${x}" cy="${SLOT_Y}" r="${SLOT_R}" />`,
).join('\n      ');

const tokens = SLOT_X.map(
  (x, index) =>
    `<circle class="rl-token rl-token--${index + 1}" cx="${x}" cy="${SLOT_Y}" r="${SLOT_R}" />`,
).join('\n      ');

const bucket = (variant: 'a' | 'b'): string => {
  const transform =
    variant === 'b'
      ? ` transform="translate(730 ${BUCKET_CENTRE.y}) scale(${SPLIT_SCALE}) translate(-540 -${BUCKET_CENTRE.y})"`
      : '';
  return `<g class="rl-bucket rl-bucket--${variant}" data-count="5"${transform}>
      <path class="rl-bucket-wall" d="M 412 962 L 412 1122 Q 412 1158 448 1158 L 632 1158 Q 668 1158 668 1122 L 668 962" />
      ${slots}
      ${tokens}
    </g>`;
};

const counts = Array.from(
  { length: CAPACITY + 1 },
  (_value, n) => `<text class="rl-count rl-count--${n}" x="170" y="1118">${n}/5</text>`,
).join('\n      ');

export const stageMarkup = `<svg class="scene-stage" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg" data-tokens="5" data-reject="off" data-split="off" data-health="ok" aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  <line class="scene-link scene-link--upper" x1="540" y1="680" x2="540" y2="880" />
  <line class="scene-link scene-link--lower" x1="540" y1="1270" x2="540" y2="1500" />
  <path class="scene-link rl-fork" d="M 540 680 L 540 720 M 350 720 L 730 720 M 350 720 L 350 880 M 730 720 L 730 880" fill="none" />

  <g class="scene-client">
    <rect class="scene-box" x="280" y="440" width="520" height="240" rx="28" />
    <text class="scene-node-title" x="540" y="575" text-anchor="middle">Client</text>
  </g>

  <g class="rl-retry">
    <circle class="rl-retry-track" cx="720" cy="775" r="${RETRY_RADIUS}" />
    <circle class="rl-retry-progress" cx="720" cy="775" r="${RETRY_RADIUS}" transform="rotate(-90 720 775)" stroke-dasharray="${RETRY_CIRCUMFERENCE.toFixed(2)}" stroke-dashoffset="${RETRY_CIRCUMFERENCE.toFixed(2)}" />
    <text class="scene-caption-label" x="720" y="852" text-anchor="middle">Retry-After</text>
  </g>

  <g class="scene-node">
    <rect class="scene-box" x="130" y="880" width="820" height="390" rx="28" />
    <text class="scene-node-label" x="170" y="938">Rate Limiter</text>

    <g class="rl-legend">
      <text class="scene-caption-label" x="170" y="1010">refill 2/s</text>
      <text class="scene-caption-label" x="170" y="1070">tokens</text>
      ${counts}
    </g>

    ${bucket('a')}
    ${bucket('b')}

    <text class="rl-key rl-key--a" x="350" y="1215" text-anchor="middle">key A</text>
    <text class="rl-key rl-key--b" x="730" y="1215" text-anchor="middle">key B</text>

    <text class="rl-429" x="855" y="1065" text-anchor="middle">429</text>

    <g class="rl-drips"></g>
  </g>

  <g class="scene-service">
    <rect class="scene-box" x="280" y="1500" width="520" height="240" rx="28" />
    <text class="scene-node-title" x="540" y="1590" text-anchor="middle">Service</text>
    <circle class="scene-health-ring" cx="540" cy="1680" r="32" />
    <circle class="scene-health" cx="540" cy="1680" r="20" />
  </g>

  <g class="scene-requests"></g>
</svg>`;
