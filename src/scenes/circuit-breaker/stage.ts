/**
 * Static stage markup for the Circuit Breaker scene.
 *
 * This module is imported on the server so the diagram is present in the HTML
 * before any script runs. It must stay free of animation libraries; the moving
 * parts live in `scene.ts`.
 *
 * Layout of the 1080 x 1920 canvas:
 *   - y 0..440      kept empty, so the step title card can sit over the top of
 *                   the stage without covering any of the diagram
 *   - y 440..680    Client box
 *   - y 880..1270   breaker node: switch, state badge, timer ring, meter
 *   - y 1500..1740  Service box with a health dot
 */

import {
  VIEWBOX,
  clientBox,
  healthDot,
  nodeFrame,
  requestsLayer,
  serviceBox,
  timerRing,
  trackAndFill,
  verticalLink,
} from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

/** Radius of the break-duration ring. */
export const TIMER_RADIUS = 42;
/** Circumference used for the `stroke-dasharray` sweep. */
export const TIMER_CIRCUMFERENCE = 2 * Math.PI * TIMER_RADIUS;

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" data-state="closed" data-meter="0" data-health="ok" aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(540, 680, 990, 'scene-link scene-link--upper')}
  ${verticalLink(540, 1100, 1500, 'scene-link scene-link--lower')}

  ${clientBox({ title: 'Client', titleY: 575 })}

  ${nodeFrame({
    label: 'Circuit Breaker',
    labelY: 938,
    children: `
    <line class="cb-arm" x1="540" y1="990" x2="540" y2="1100" />
    <circle class="cb-contact" cx="540" cy="990" r="16" />
    <circle class="cb-contact" cx="540" cy="1100" r="16" />

    <g class="cb-badge">
      <rect class="cb-badge-glow" x="606" y="1001" width="216" height="88" rx="44" />
      <rect class="cb-badge-pill" x="614" y="1009" width="200" height="72" rx="36" />
      <text class="cb-badge-text cb-badge-text--closed" x="714" y="1056" text-anchor="middle">CLOSED</text>
      <text class="cb-badge-text cb-badge-text--open" x="714" y="1056" text-anchor="middle">OPEN</text>
      <text class="cb-badge-text cb-badge-text--half" x="714" y="1056" text-anchor="middle">HALF-OPEN</text>
    </g>

    ${timerRing({
      cx: 876,
      cy: 1045,
      r: TIMER_RADIUS,
      className: 'cb-timer',
      labelText: 'break duration',
      labelY: 1125,
    })}

    <text class="scene-caption-label" x="170" y="1182">failure rate</text>
    ${trackAndFill({ x: 170, y: 1198, width: 400, height: 20, rx: 10, className: 'cb-meter' })}
    <line class="cb-threshold" x1="370" y1="1186" x2="370" y2="1238" />
    <text class="cb-threshold-label" x="370" y="1262" text-anchor="middle">threshold</text>`,
  })}

  ${serviceBox({
    title: 'Service',
    titleY: 1590,
    children: `
    ${healthDot({ cx: 540, cy: 1680 })}`,
  })}

  ${requestsLayer()}
</svg>`;
