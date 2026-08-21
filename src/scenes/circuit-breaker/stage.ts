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

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

/** Radius of the break-duration ring. */
export const TIMER_RADIUS = 42;
/** Circumference used for the `stroke-dasharray` sweep. */
export const TIMER_CIRCUMFERENCE = 2 * Math.PI * TIMER_RADIUS;

export const stageMarkup = `<svg class="cb-stage" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg" data-state="closed" data-meter="0" data-health="ok" aria-hidden="true" focusable="false">
  <rect class="cb-bg" x="0" y="0" width="1080" height="1920" />

  <line class="cb-link cb-link--upper" x1="540" y1="680" x2="540" y2="990" />
  <line class="cb-link cb-link--lower" x1="540" y1="1100" x2="540" y2="1500" />

  <g class="cb-client">
    <rect class="cb-box" x="280" y="440" width="520" height="240" rx="28" />
    <text class="cb-node-title" x="540" y="575" text-anchor="middle">Client</text>
  </g>

  <g class="cb-breaker">
    <rect class="cb-box" x="130" y="880" width="820" height="390" rx="28" />
    <text class="cb-node-label" x="170" y="938">Circuit Breaker</text>

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

    <g class="cb-timer">
      <circle class="cb-timer-track" cx="876" cy="1045" r="${TIMER_RADIUS}" />
      <circle class="cb-timer-progress" cx="876" cy="1045" r="${TIMER_RADIUS}" transform="rotate(-90 876 1045)" stroke-dasharray="${TIMER_CIRCUMFERENCE.toFixed(2)}" stroke-dashoffset="${TIMER_CIRCUMFERENCE.toFixed(2)}" />
      <text class="cb-timer-label" x="876" y="1125" text-anchor="middle">break duration</text>
    </g>

    <text class="cb-meter-label" x="170" y="1182">failure rate</text>
    <rect class="cb-meter-track" x="170" y="1198" width="400" height="20" rx="10" />
    <rect class="cb-meter-fill" x="170" y="1198" width="0" height="20" rx="10" />
    <line class="cb-threshold" x1="370" y1="1186" x2="370" y2="1238" />
    <text class="cb-threshold-label" x="370" y="1262" text-anchor="middle">threshold</text>
  </g>

  <g class="cb-service">
    <rect class="cb-box" x="280" y="1500" width="520" height="240" rx="28" />
    <text class="cb-node-title" x="540" y="1590" text-anchor="middle">Service</text>
    <circle class="cb-health-ring" cx="540" cy="1680" r="32" />
    <circle class="cb-health" cx="540" cy="1680" r="20" />
  </g>

  <g class="cb-requests"></g>
</svg>`;
