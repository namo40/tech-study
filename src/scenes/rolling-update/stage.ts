/**
 * Static stage markup for the Rolling Update scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. The bands are the usual ones, with
 * the pod row given the allowed extension because a pod says four things about
 * itself and the schema panel next to it carries a whole table:
 *   - y 0..400       above the cropped viewBox (see shared VIEWBOX)
 *   - y 400..440     the frame's top padding; nothing is drawn here
 *   - y 440..680     the Clients box every request leaves from
 *   - y 880..1270    the Service: what the endpoints list currently holds, the
 *                    two numbers the rollout is bounded by, and how far it got
 *   - y 1400         the fan rail, the only row a request changes column on
 *   - y 1500..1772   five pod slots, each with a startup ring, a drain bar, the
 *                    version it runs and the word it says about itself
 *   - y 1772..1850   what a terminating pod was sent, and by when
 *   - y 1500..1820   the Database, right of the row, holding the orders table
 *
 * One trunk and one rail, and nothing travels anywhere else. The trunk leaves
 * the Clients box at `X_CLIENT` and drops to `Y_RAIL`; the rail runs between the
 * outer connection lanes, and each lane drops from the rail to the top edge of
 * its pod. Every leg is vertical or horizontal, consecutive legs share their
 * endpoint exactly, and the trunk meets the rail at a point the rail passes
 * through, so no segment ever ends inside a box. The one horizontal stub joins
 * the pod row to the Database and ends on both box edges.
 *
 * Two connection lanes per pod rather than one, because the point of step 3 is
 * that a pod told to stop finishes what it already has: two requests have to be
 * able to stand on one pod without standing on each other. 56px apart is the
 * smallest offset at which two 52px dots still have daylight between them.
 *
 * `X_CLIENT` is 406 rather than 540 because it is a lane: it is the left lane of
 * the middle pod, so the trunk continues into a lane instead of running down the
 * gap between two. A dot has a halo of 26 and labels keep 30px off it, so the
 * node reserves x 350..462 for its full height, and every row it draws is
 * written either left of x 350 or right of x 462.
 *
 * Inside a pod the rows are decided the same way. A dot stands at `Y_ARRIVE`, so
 * the startup ring sits above it, the drain bar just below it, and the two words
 * the pod says about itself are written under that, clear of the dot by 46px.
 */

import {
  VIEWBOX,
  chip,
  clientBox,
  counterVariants,
  nodeFrame,
  requestsLayer,
  serviceBox,
  timerRing,
  trackAndFill,
  verticalLink,
} from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- geometry --------------------------------------------------------------

/** The lane every request leaves on, and where it waits before it does. */
export const X_CLIENT = 406;
export const Y_CLIENT = 620;

/** Bottom edge of the Clients box and the two edges of the Service node. */
const CLIENT_BOTTOM = 680;
const NODE_Y = 880;
const NODE_H = 390;
const NODE_BOTTOM = NODE_Y + NODE_H;

/** The rail the trunk fans out on, below the node and above the pods. */
export const Y_RAIL = 1400;

/** Centre x of each pod slot. */
export const POD_X = [186, 310, 434, 558, 682];
/** Slots the row draws: four replicas plus the one `maxSurge 1` allows. */
export const POD_COUNT = POD_X.length;
const POD_W = 112;
const POD_Y = 1500;
const POD_H = 272;

/** How far a connection lane sits from its pod's centre, and how many there are. */
const LANE_GAP = 28;
export const LANE_COUNT = 2;

/** Centre x of connection lane `lane` of `pod`, both zero based. */
export const laneX = (pod: number, lane: number): number =>
  (POD_X[pod] ?? 0) + (lane === 0 ? -LANE_GAP : LANE_GAP);

/** Where a request stands while the pod it reached is answering it. */
export const Y_ARRIVE = 1630;

/** Ends of the fan rail, which are the outermost lanes it has to reach. */
const RAIL_LEFT = laneX(0, 0);
const RAIL_RIGHT = laneX(POD_COUNT - 1, LANE_COUNT - 1);

/** Rows inside a pod: the ring, the drain bar, the version, the word it says. */
const RING_CY = 1556;
const RING_R = 28;
const DRAIN_Y = 1668;
const DRAIN_H = 14;
/** Full width of a pod's drain bar, which the fill is a fraction of. */
export const DRAIN_W = 88;
const VER_Y = 1720;
const STATUS_Y = 1754;
/** What a terminating pod was sent, and the deadline it has to answer it by. */
const SIG_Y = 1806;
const GRACE_Y = 1842;

/** The Database, right of the pod row, with the stub that joins them. */
const DB_X = 768;
const DB_W = 182;
const DB_Y = 1500;
const DB_H = 320;
const DB_TEXT_X = 786;
const DB_TITLE_Y = 1556;
const DB_TABLE_Y = 1610;
const COL_X = 784;
const COL_W = 150;
const COL_H = 46;
const COL_A_Y = 1644;
const COL_B_Y = 1704;
const MIGRATE_Y = 1790;
const DB_STUB_Y = 1560;

/** Rows inside the node, all of them clear of the trunk's 30px margin. */
const NODE_LABEL_Y = 938;
const LEFT_EDGE = 170;
const RIGHT_EDGE = 466;
const CFG_SURGE_X = 466;
/** Set from the node's right padding, so the two config labels cannot meet. */
const CFG_UNAVAILABLE_X = 930;
const EP_LABEL_Y = 1024;
const EP_CHIP_Y = 992;
const EP_CHIP_W = 76;
const EP_CHIP_H = 56;
const EP_CHIP_PITCH = 88;
const EP_CHIP_X = 468;
const EP_TEXT_Y = 1029;
const PROGRESS_Y = 1122;
const STALLED_X = 676;
const BAR_Y = 1160;
const BAR_H = 28;
/** Full width of the rollout bar, which four replicas are read across. */
export const PROGRESS_W = 420;
const UNDO_Y = 1232;

/** How many replicas the Deployment is asked for, which the readout counts to. */
export const REPLICAS = 4;

/**
 * What every `data-*` on the stage starts at, keyed by the target the timeline
 * addresses it through. The markup below is written from this, so a change that
 * writes a value something already holds can be dropped rather than tweened.
 */
export const STAGE_STATE: Record<string, string> = {
  'stage@data-rollout': 'idle',
  'stage@data-updated': '0',
  'stage@data-schema': 'base',
};
for (let index = 1; index <= POD_COUNT; index += 1) {
  const spare = index === POD_COUNT;
  STAGE_STATE[`pod-${index}@data-pod`] = spare ? 'absent' : 'ready';
  STAGE_STATE[`pod-${index}@data-ver`] = 'v1';
  STAGE_STATE[`pod-${index}@data-sig`] = 'off';
  STAGE_STATE[`ep-${index}@data-ep`] = spare ? 'out' : 'in';
}

// --- markup ----------------------------------------------------------------

/** One pod slot: a ring, a drain bar, the version it runs, the word it says. */
const pod = (index: number): string => {
  const centre = POD_X[index] ?? 0;
  const spare = index === POD_COUNT - 1;
  const state = spare ? 'absent' : 'ready';
  return serviceBox({
    x: centre - POD_W / 2,
    width: POD_W,
    y: POD_Y,
    height: POD_H,
    title: 'v1',
    titleX: centre,
    titleY: VER_Y,
    titleClass: 'ru-ver ru-ver--v1',
    className: `ru-pod ru-pod--${index + 1}`,
    attrs: ` data-pod="${state}" data-ver="v1" data-sig="off"`,
    boxClass: 'scene-box ru-pod-box',
    children: `
    <text class="ru-ver ru-ver--v2" x="${centre}" y="${VER_Y}" text-anchor="middle">v2</text>
    ${['starting', 'ready', 'not ready', 'terminating']
      .map(
        (word) =>
          `<text class="scene-flash ru-status ru-status--${word.replace(' ', '-')}" x="${centre}" y="${STATUS_Y}" text-anchor="middle">${word}</text>`,
      )
      .join('\n    ')}
    ${timerRing({
      cx: centre,
      cy: RING_CY,
      r: RING_R,
      className: 'ru-start',
      groupClass: 'ru-start',
    })}
    ${trackAndFill({
      x: centre - DRAIN_W / 2,
      y: DRAIN_Y,
      width: DRAIN_W,
      height: DRAIN_H,
      rx: DRAIN_H / 2,
      className: 'ru-drain',
    })}
    <text class="scene-flash ru-sig" x="${centre}" y="${SIG_Y}" text-anchor="middle">SIGTERM</text>
    <text class="scene-flash ru-grace" x="${centre}" y="${GRACE_Y}" text-anchor="middle">30 s</text>`,
  });
};

/** The two lanes one pod is reached on, from the rail down to its top edge. */
const podLanes = (index: number): string =>
  Array.from({ length: LANE_COUNT }, (_value, lane) =>
    verticalLink(laneX(index, lane), Y_RAIL, POD_Y, 'scene-link ru-lane'),
  ).join('\n  ');

/** One member of the endpoints list, dimmed while the pod is not in it. */
const endpointChip = (index: number): string =>
  chip({
    x: EP_CHIP_X + EP_CHIP_PITCH * index,
    y: EP_CHIP_Y,
    width: EP_CHIP_W,
    height: EP_CHIP_H,
    rx: 18,
    className: `ru-ep ru-ep--${index + 1}`,
    bgClass: 'ru-ep-bg',
    variant: 'filled',
    text: `<text class="ru-ep-text" x="${EP_CHIP_X + EP_CHIP_PITCH * index + EP_CHIP_W / 2}" y="${EP_TEXT_Y}" text-anchor="middle">p${index + 1}</text>`,
    indent: 6,
  }).replace('<g class="scene-chip', `<g data-ep="${index === POD_COUNT - 1 ? 'out' : 'in'}" class="scene-chip`);

/** How far the rollout got, as a count and as the bar behind it. */
const updatedReadout = counterVariants({
  x: RIGHT_EDGE,
  y: PROGRESS_Y,
  className: 'ru-updated',
  max: REPLICAS,
  format: (n) => `${n}/${REPLICAS} updated`,
  indent: 4,
});

/** One column of the orders table, with the name it holds in each state. */
const column = (name: string, y: number, variants: [string, string][]): string =>
  chip({
    x: COL_X,
    y,
    width: COL_W,
    height: COL_H,
    rx: 14,
    className: `ru-col ru-col--${name}`,
    bgClass: `ru-col-bg ru-col-bg--${name}`,
    variant: 'outline',
    text: variants
      .map(
        ([key, text]) =>
          `<text class="ru-col-text ru-col-text--${key}" x="${COL_X + COL_W / 2}" y="${y + 30}" text-anchor="middle">${text}</text>`,
      )
      .join('\n      '),
    indent: 4,
  });

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" data-rollout="idle" data-updated="0" data-schema="base" aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_CLIENT, CLIENT_BOTTOM, NODE_Y)}
  ${verticalLink(X_CLIENT, NODE_BOTTOM, Y_RAIL)}
  <line class="scene-link" x1="${RAIL_LEFT}" y1="${Y_RAIL}" x2="${RAIL_RIGHT}" y2="${Y_RAIL}" />
  ${POD_X.map((_x, index) => podLanes(index)).join('\n  ')}
  <line class="scene-link ru-db-link" x1="${(POD_X[POD_COUNT - 1] ?? 0) + POD_W / 2}" y1="${DB_STUB_Y}" x2="${DB_X}" y2="${DB_STUB_Y}" />

  ${clientBox({ x: X_CLIENT - 120, width: 240, title: 'Clients', titleX: X_CLIENT, titleY: 512 })}

  ${nodeFrame({
    y: NODE_Y,
    height: NODE_H,
    label: 'Service',
    labelY: NODE_LABEL_Y,
    children: `    <text class="scene-caption-label ru-cfg" x="${CFG_SURGE_X}" y="${NODE_LABEL_Y}">maxSurge 1</text>
    <text class="scene-caption-label ru-cfg" x="${CFG_UNAVAILABLE_X}" y="${NODE_LABEL_Y}" text-anchor="end">maxUnavailable 0</text>

    <text class="ru-ep-label" x="${LEFT_EDGE}" y="${EP_LABEL_Y}">endpoints</text>
    ${POD_X.map((_x, index) => endpointChip(index)).join('\n    ')}

    <text class="scene-mono ru-arrow" x="${LEFT_EDGE}" y="${PROGRESS_Y}">v1 &#8594; v2</text>
    ${updatedReadout}
    <text class="ru-rolledback" x="${RIGHT_EDGE}" y="${PROGRESS_Y}">v1</text>
    <text class="scene-flash ru-stalled" x="${STALLED_X}" y="${PROGRESS_Y}">stalled</text>

    ${trackAndFill({
      x: RIGHT_EDGE,
      y: BAR_Y,
      width: PROGRESS_W,
      height: BAR_H,
      rx: BAR_H / 2,
      className: 'ru-progress',
    })}

    <text class="scene-flash ru-undo" x="${RIGHT_EDGE}" y="${UNDO_Y}">rollout undo</text>`,
  })}

  <text class="scene-node-label ru-row-label" x="${LEFT_EDGE}" y="1330">Pods</text>

  ${POD_X.map((_x, index) => pod(index)).join('\n\n  ')}

  ${serviceBox({
    x: DB_X,
    width: DB_W,
    y: DB_Y,
    height: DB_H,
    title: 'Database',
    titleX: DB_TEXT_X,
    titleY: DB_TITLE_Y,
    titleClass: 'scene-node-label',
    titleAnchor: null,
    className: 'ru-db',
    children: `
    <text class="scene-mono ru-db-table" x="${DB_TEXT_X}" y="${DB_TABLE_Y}">orders</text>
    ${column('a', COL_A_Y, [
      ['total', 'total'],
      ['renamed', 'total_cents'],
    ])}
    ${column('b', COL_B_Y, [['cents', 'total_cents']])}
    <text class="scene-flash ru-migrate ru-migrate--expand" x="${DB_TEXT_X}" y="${MIGRATE_Y}">expand</text>
    <text class="scene-flash ru-migrate ru-migrate--contract" x="${DB_TEXT_X}" y="${MIGRATE_Y}">contract</text>`,
  })}

  ${requestsLayer()}
</svg>`;
