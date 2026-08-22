/**
 * Static stage markup for the Bulkhead scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Bands match the other scenes:
 *   - y 0..440      kept empty for the step title card
 *   - y 440..680    Client box, with a lane per dependency
 *   - y 880..1270   Bulkhead node: six slots, the wall, the labels
 *   - y 1500..1740  Service A and Service B, each with a health dot
 *
 * Both lanes run through the centre of their own slot and their own service
 * box, so a request passes through everything it touches.
 */

import {
  VIEWBOX,
  clientBox,
  counterVariants,
  healthDot,
  nodeFrame,
  requestsLayer,
  serviceBox,
  slotRow,
  timerRing,
  verticalLink,
} from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

/** Number of slots in the pool. */
export const SLOT_COUNT = 6;
/** Slots 1..3 belong to lane A once the wall is up, 4..6 to lane B. */
export const COMPARTMENT_SIZE = 3;

/** Lane centres, which are also the service box centres. */
export const LANE_X = { a: 325, b: 755 };

/** Centre x of each slot, left to right. */
export const SLOT_X = [204, 324, 444, 636, 756, 876];
const SLOT_Y = 1010;
const SLOT_SIDE = 72;

/** Radius and circumference of a timeout arc above a stuck slot. */
export const TIMEOUT_RADIUS = 22;
export const TIMEOUT_CIRCUMFERENCE = 2 * Math.PI * TIMEOUT_RADIUS;

const slots = slotRow({
  xs: SLOT_X,
  y: SLOT_Y,
  side: SLOT_SIDE,
  rx: 16,
  className: 'bh-slot',
  initialState: 'free',
  attrName: 'data-slot-state',
});

/** One arc per slot in the B compartment, shown while a timeout runs. */
const timers = SLOT_X.slice(COMPARTMENT_SIZE)
  .map((x, index) =>
    timerRing({
      cx: x,
      cy: 952,
      r: TIMEOUT_RADIUS,
      className: 'bh-timer',
      groupClass: `bh-timer bh-timer--${index + 1}`,
    }),
  )
  .join('\n    ');

const counts = counterVariants({
  x: 170,
  y: 1205,
  className: 'bh-count',
  count: SLOT_COUNT + 1,
  format: (n) => `${n}/6`,
  indent: 6,
});

/** Both services are the same box; only the lane they sit under differs. */
const service = (variant: 'a' | 'b'): string => {
  const x = variant === 'a' ? 150 : 580;
  const centre = variant === 'a' ? LANE_X.a : LANE_X.b;
  const highlight =
    variant === 'a'
      ? `\n    <rect class="bh-highlight" x="150" y="1500" width="350" height="240" rx="28" />`
      : '';
  return serviceBox({
    x,
    width: 350,
    className: `scene-service scene-service--${variant}`,
    titleClass: 'scene-node-title bh-service-title',
    title: `Service ${variant.toUpperCase()}`,
    titleY: 1590,
    before: highlight,
    children: `
    ${healthDot({ cx: centre, cy: 1680, extraClass: 'bh-health', attrs: ' data-health-state="ok"' })}`,
  });
};

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" data-inflight="0" data-wall="off" data-bfull="off" data-timeout="off" data-health-a="ok" data-health-b="ok" aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(LANE_X.a, 680, 880)}
  ${verticalLink(LANE_X.b, 680, 880)}
  ${verticalLink(LANE_X.a, 1270, 1500)}
  ${verticalLink(LANE_X.b, 1270, 1500)}

  ${clientBox({ title: 'Client', titleY: 575 })}

  ${nodeFrame({
    label: 'Bulkhead',
    labelY: 938,
    children: `
    ${timers}

    <rect class="bh-wall" x="528" y="960" width="24" height="240" rx="12" />

    ${slots}

    <g class="bh-legend">
      <text class="scene-caption-label" x="170" y="1150">in flight</text>
      ${counts}
    </g>

    <text class="scene-flash bh-key bh-key--a" x="324" y="1245" text-anchor="middle">A 3</text>
    <text class="scene-flash bh-key bh-key--b" x="756" y="1245" text-anchor="middle">B 3</text>

    <text class="scene-flash bh-alert bh-alert--full" x="756" y="1150" text-anchor="middle">B full</text>
    <text class="scene-flash bh-alert bh-alert--timeout" x="756" y="1150" text-anchor="middle">timeout</text>`,
  })}

  ${service('a')}

  ${service('b')}

  ${requestsLayer()}
</svg>`;
