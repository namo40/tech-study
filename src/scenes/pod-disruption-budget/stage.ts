/**
 * Static stage markup for the Pod Disruption Budget scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Four bands, and the middle one is a
 * fleet rather than a single instance, because that is the whole difference
 * between this scene and a shutdown seen from inside one process:
 *   - y 0..440       kept empty for the step title card
 *   - y 440..680     Drain: the `drain node` card that asks for the pods, how
 *                    many it `want`s gone, and how many evictions the budget is
 *                    holding back
 *   - y 880..1270    three pods, A / B / C, each saying one word about itself
 *                    and carrying the number of requests it still holds
 *   - y 1400         the rail the three pods report along
 *   - y 1500..1740   Budget: the rule it enforces, the reading it enforces it
 *                    from, and the lamp that is that reading's verdict
 *
 * Three lanes and nothing else travels. Each lane drops from the Drain's bottom
 * edge at 680 to a pod's top edge at 880, through the centre of both boxes, and
 * carries one thing only: the eviction the budget approved. Nothing travels back
 * up. The Budget does not receive messages from the pods — it reads them, so
 * `ready n/3` is a continuous readout and the rail below the pod row is drawn
 * quiet. Making that a stream of dots would say the budget learns about a pod
 * some time after the pod changed, which is the opposite of what a readout is.
 *
 * A traveller sweeps 26px around every point it reaches and a label keeps 30px
 * clear of that, so each lane owns a 112px wide keep-out from y 624 to y 936.
 * The Drain therefore writes its row above y 624, and every pod writes its first
 * line below y 936 — which is what fixes the rows in both bands.
 *
 * The pod row is centred on x 530 and the Drain on x 540, because the pods are
 * three fixed-width boxes with even gaps and the Drain is one wide box. The
 * Budget is centred on x 530 rather than 540 so the line joining it to the pod
 * row runs through the centre of both, which is the only way that line is honest
 * geometry rather than a line drawn near two things.
 *
 * Declared texture: the `drain node` plate, the three badge plates, the three
 * grace rings, the `minAvailable 2` plate and the `SLO` plate. Everything else
 * on this stage is a word or a number, because a budget is an argument about
 * counting and every quantity here is small enough to be read as a figure.
 */

import {
  VIEWBOX,
  chip,
  clientBox,
  counterVariants,
  requestsLayer,
  serviceBox,
  timerRing,
  verticalLink,
} from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- geometry --------------------------------------------------------------

/** The three lanes: an approved eviction leaving the Drain and reaching a pod. */
export const POD_X = [250, 530, 810] as const;
/** What each pod is called, which is also the order the drain asks for them in. */
export const POD_NAMES = ['A', 'B', 'C'] as const;

export const Y_DRAIN_BOTTOM = 680;
export const Y_POD_TOP = 880;

/** The pod row, and the quiet rail it reports to the Budget along. */
const POD_W = 240;
const POD_Y = 880;
const POD_H = 390;
const Y_POD_BOTTOM = POD_Y + POD_H;
const Y_RAIL = 1400;
const Y_BUDGET_TOP = 1500;

/** The Drain band. One row, above the lanes' keep-out. */
const DRAIN = { x: 130, y: 440, w: 820, h: 240 };
const DRAIN_TITLE_X = 170;
const DRAIN_TITLE_Y = 505;
const DRAIN_ROW_Y = 588;
const NODE_CHIP = { x: 170, y: 548, w: 250, h: 62 };
const WANT_X = 470;
const HELD_X = 930;

/** Rows inside a pod, all of them below the lane's keep-out at y 936. */
const POD_TITLE_Y = 986;
const BADGE_CHIP_W = 204;
const BADGE_CHIP_Y = 1006;
const BADGE_CHIP_H = 60;
const BADGE_TEXT_Y = 1046;
const REQ_Y = 1112;
const GRACE_CY = 1186;
export const GRACE_R = 32;
const KILL_Y = 1246;

/** The Budget band, centred on the pod row so the line between them is true. */
const BUDGET = { x: 270, y: 1500, w: 520, h: 240 };
const BUDGET_TITLE_X = 530;
const BUDGET_TITLE_Y = 1568;
const MIN_CHIP = { x: 296, y: 1600, w: 300, h: 60 };
const SLO_CHIP = { x: 622, y: 1600, w: 140, h: 60 };
const BUDGET_ROW_Y = 1638;
const READY_X = 530;
const READY_Y = 1706;

/** The grace ring's circumference, which the timeline sweeps to zero. */
export const GRACE_CIRCUMFERENCE = Number((2 * Math.PI * GRACE_R).toFixed(2));

// --- what the stage can say about itself -----------------------------------

/** How many replicas the Deployment is asked for. */
export const REPLICAS = 3;

/**
 * The rule the whole scene turns on: how many pods have to stay ready. The
 * number of evictions the budget will allow at any instant is
 * `ready - MIN_AVAILABLE`, which is where "one at a time" comes from — nobody
 * writes that down, it falls out of two numbers and a count.
 */
export const MIN_AVAILABLE = 2;

/** The largest reading `held n` and `req n` can show. */
export const HELD_MAX = 2;
export const REQ_MAX = 9;

/** What a pod says about itself. There is no `failing`: it serves or it leaves. */
export const POD_STATES = ['ready', 'preStop', 'term', 'gone', 'starting'] as const;
export type PodState = (typeof POD_STATES)[number];

/**
 * The grace ring. `on` is a deadline that is still comfortable and `warn` is one
 * that is not; neither adds a word, because the ring's own arc already says how
 * much of the grace has been spent.
 */
export const GRACE_STATES = ['off', 'on', 'warn'] as const;
export type GraceState = (typeof GRACE_STATES)[number];

/** Whether the counterfactual ending is being drawn on this pod. */
export const KILL_STATES = ['off', 'on'] as const;
export type KillState = (typeof KILL_STATES)[number];

/** Whether the drain has asked for anything yet. */
export const DRAIN_STATES = ['idle', 'active'] as const;
export type DrainState = (typeof DRAIN_STATES)[number];

/** A lamp is lit or it is not, and here it is the verdict on one comparison. */
export const LAMP_STATES = ['off', 'on'] as const;
export type LampState = (typeof LAMP_STATES)[number];

/**
 * What every `data-*` on the stage starts at, keyed by the target the timeline
 * addresses it through. The markup below is written from this, so the opening
 * frame is the whole diagram in its settled state — three ready pods each
 * holding five requests, a budget with room to spare, a drain that has not asked
 * for anything yet — and the timeline never restates what is already there.
 */
export const STAGE_STATE: Record<string, string> = {
  'stage@data-pdb-drain': 'idle',
  'stage@data-pdb-held': '0',
  'stage@data-pdb-ready': String(REPLICAS),
  'stage@data-pdb-slo': 'on',
};
for (let index = 1; index <= POD_X.length; index += 1) {
  STAGE_STATE[`pod-${index}@data-pdb-pod`] = 'ready';
  STAGE_STATE[`pod-${index}@data-pdb-req`] = '5';
  STAGE_STATE[`pod-${index}@data-pdb-grace`] = 'off';
  STAGE_STATE[`pod-${index}@data-pdb-kill`] = 'off';
}

// --- markup ----------------------------------------------------------------

/** Non-breaking spaces, so a monospaced label keeps its gaps in SVG. */
const mono = (text: string): string => text.replace(/ /g, '&#160;');

/**
 * A plate with one word per state stacked on it. Nothing interpolates, so
 * scrubbing backwards is exact and neither theme has a colour to average.
 */
const wordChip = (
  name: string,
  states: readonly string[],
  box: { x: number; y: number; w: number; h: number },
  textY: number,
  wordOf: (state: string) => string = (state) => state,
  indent = 4,
): string => {
  const centre = box.x + box.w / 2;
  const text = states
    .map(
      (state) =>
        `<text class="scene-counter pdb-${name} pdb-${name}--${state}" x="${centre}" y="${textY}" text-anchor="middle">${wordOf(state)}</text>`,
    )
    .join(`\n${' '.repeat(indent + 2)}`);
  return chip({
    x: box.x,
    y: box.y,
    width: box.w,
    height: box.h,
    rx: 18,
    className: `pdb-chip-${name}`,
    variant: 'outline',
    text,
    indent,
  });
};

/** How many evictions the budget is holding back, and what a pod still holds. */
const heldReadout = counterVariants({
  x: HELD_X,
  y: DRAIN_ROW_Y,
  className: 'pdb-held',
  max: HELD_MAX,
  format: (n) => mono(`held ${n}`),
  anchor: 'end',
  indent: 4,
});

/** How many of the replicas are ready, which is the number the budget reads. */
const readyReadout = counterVariants({
  x: READY_X,
  y: READY_Y,
  className: 'pdb-ready',
  max: REPLICAS,
  format: (n) => mono(`ready ${n}/${REPLICAS}`),
  anchor: 'middle',
  indent: 4,
});

/** One pod: the word it says, the requests it holds, its grace, its other ending. */
const podBox = (index: number): string => {
  const centre = POD_X[index] ?? 0;
  const name = POD_NAMES[index] ?? '';
  return serviceBox({
    x: centre - POD_W / 2,
    width: POD_W,
    y: POD_Y,
    height: POD_H,
    title: name,
    titleX: centre,
    titleY: POD_TITLE_Y,
    className: `scene-service pdb-pod--${index + 1}`,
    attrs: ' data-pdb-pod="ready" data-pdb-req="5" data-pdb-grace="off" data-pdb-kill="off"',
    boxClass: 'scene-box pdb-pod-box',
    children: `
    ${wordChip(
      'badge',
      POD_STATES,
      { x: centre - BADGE_CHIP_W / 2, y: BADGE_CHIP_Y, w: BADGE_CHIP_W, h: BADGE_CHIP_H },
      BADGE_TEXT_Y,
    )}

    ${counterVariants({
      x: centre,
      y: REQ_Y,
      className: 'pdb-req',
      max: REQ_MAX,
      format: (n) => mono(`req ${n}`),
      anchor: 'middle',
      indent: 4,
    })}

    ${timerRing({
      cx: centre,
      cy: GRACE_CY,
      r: GRACE_R,
      className: 'pdb-grace',
      groupClass: 'pdb-grace',
      indent: 4,
    })}

    <text class="scene-counter pdb-kill pdb-kill--on" x="${centre}" y="${KILL_Y}" text-anchor="middle">SIGKILL</text>`,
  });
};

const stageAttrs = Object.entries(STAGE_STATE)
  .filter(([key]) => key.startsWith('stage@'))
  .map(([key, value]) => `${key.slice('stage@'.length)}="${value}"`)
  .join(' ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageAttrs} aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${POD_X.map((x) => verticalLink(x, Y_DRAIN_BOTTOM, Y_POD_TOP, 'scene-link pdb-lane')).join('\n  ')}

  ${verticalLink(POD_X[0] ?? 0, Y_POD_BOTTOM, Y_RAIL, 'scene-link pdb-watch')}
  ${verticalLink(POD_X[2] ?? 0, Y_POD_BOTTOM, Y_RAIL, 'scene-link pdb-watch')}
  ${verticalLink(POD_X[1] ?? 0, Y_POD_BOTTOM, Y_BUDGET_TOP, 'scene-link pdb-watch')}
  <line class="scene-link pdb-watch" x1="${POD_X[0]}" y1="${Y_RAIL}" x2="${POD_X[2]}" y2="${Y_RAIL}" />

  ${clientBox({
    x: DRAIN.x,
    width: DRAIN.w,
    y: DRAIN.y,
    height: DRAIN.h,
    title: 'Drain',
    titleX: DRAIN_TITLE_X,
    titleY: DRAIN_TITLE_Y,
    titleAnchor: null,
    children: `
    ${wordChip('node', DRAIN_STATES, NODE_CHIP, DRAIN_ROW_Y, () => mono('drain node'))}

    <text class="scene-mono pdb-want" x="${WANT_X}" y="${DRAIN_ROW_Y}">${mono('want 2')}</text>

    ${heldReadout}`,
  })}

  ${POD_X.map((_x, index) => podBox(index)).join('\n\n  ')}

  ${serviceBox({
    x: BUDGET.x,
    width: BUDGET.w,
    y: BUDGET.y,
    height: BUDGET.h,
    title: 'Budget',
    titleX: BUDGET_TITLE_X,
    titleY: BUDGET_TITLE_Y,
    className: 'scene-service pdb-budget',
    children: `
    ${chip({
      x: MIN_CHIP.x,
      y: MIN_CHIP.y,
      width: MIN_CHIP.w,
      height: MIN_CHIP.h,
      rx: 18,
      className: 'pdb-chip-min',
      variant: 'outline',
      text: `<text class="pdb-min" x="${MIN_CHIP.x + MIN_CHIP.w / 2}" y="${BUDGET_ROW_Y}" text-anchor="middle">${mono(`minAvailable ${MIN_AVAILABLE}`)}</text>`,
      indent: 4,
    })}

    ${wordChip('slo', LAMP_STATES, SLO_CHIP, BUDGET_ROW_Y, () => 'SLO')}

    ${readyReadout}`,
  })}

  ${requestsLayer()}
</svg>`;
