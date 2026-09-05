/**
 * Static stage markup for the Rate Limiter scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Bands match the other scenes:
 *   - y 0..400      above the cropped viewBox (see shared VIEWBOX)
 *   - y 400..440    the frame's top padding; nothing is drawn here
 *   - y 440..680    Client box, with the Retry-After timer just below it
 *   - y 880..1270   Rate Limiter node: token bucket, refill drip, 429 label
 *   - y 1500..1740  Service box with a health dot
 *
 * The bucket is drawn once and reused: the same markup renders the `key A`
 * bucket and, moved and scaled by a static transform, the `key B` bucket that
 * only becomes visible when the limiter is partitioned in step 4.
 */

import {
  VIEWBOX,
  clientBox,
  counterVariants,
  healthDot,
  nodeFrame,
  requestsLayer,
  serviceBox,
  timerRing,
  verticalLink,
} from '../shared/stage';

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

const counts = counterVariants({
  x: 170,
  y: 1118,
  className: 'rl-count',
  count: CAPACITY + 1,
  format: (n) => `${n}/5`,
  indent: 6,
});

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" data-tokens="5" data-reject="off" data-split="off" data-health="ok" aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(540, 680, 880, 'scene-link scene-link--upper')}
  ${verticalLink(540, 1270, 1500, 'scene-link scene-link--lower')}
  <path class="scene-link rl-fork" d="M 540 680 L 540 720 M 350 720 L 730 720 M 350 720 L 350 880 M 730 720 L 730 880" fill="none" />

  ${clientBox({ title: 'Client', titleY: 575 })}

  ${timerRing({
    cx: 720,
    cy: 775,
    r: RETRY_RADIUS,
    className: 'rl-retry',
    labelText: 'Retry-After',
    labelY: 852,
    indent: 2,
  })}

  ${nodeFrame({
    label: 'Rate Limiter',
    labelY: 938,
    children: `
    <g class="rl-legend">
      <text class="scene-caption-label" x="170" y="1010">refill 2/s</text>
      <text class="scene-caption-label" x="170" y="1070">tokens</text>
      ${counts}
    </g>

    ${bucket('a')}
    ${bucket('b')}

    <text class="scene-flash rl-key rl-key--a" x="350" y="1215" text-anchor="middle">key A</text>
    <text class="scene-flash rl-key rl-key--b" x="730" y="1215" text-anchor="middle">key B</text>

    <text class="scene-flash rl-429" x="855" y="1065" text-anchor="middle">429</text>

    <g class="rl-drips"></g>`,
  })}

  ${serviceBox({
    title: 'Service',
    titleY: 1590,
    children: `
    ${healthDot({ cx: 540, cy: 1680 })}`,
  })}

  ${requestsLayer()}
</svg>`;
