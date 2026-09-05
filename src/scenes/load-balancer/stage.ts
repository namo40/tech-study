/**
 * Static stage markup for the Load Balancer scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. The bands are the usual ones, with
 * the server row hanging a little lower than its neighbours' because a server
 * here carries three things under the row its connections rest on:
 *   - y 0..400       above the cropped viewBox (see shared VIEWBOX)
 *   - y 400..440     the frame's top padding; nothing is drawn here
 *   - y 440..680     Clients, with the one lane every request leaves on
 *   - y 880..1270    Load balancer: the policy chip, the table of open
 *                    connections it routes from, and the probe interval
 *   - y 1340         the fan rail, the only row a request changes column on
 *   - y 1500..1772   four servers, each with a health dot and a load meter
 *
 * A request travels on three kinds of line and no others: down the client lane
 * at `X_CLIENT`, along the fan rail at `Y_RAIL`, and down one of the three
 * connection lanes a server owns. Every leg is vertical or horizontal, and the
 * column, the rail and the lanes all meet at `Y_RAIL`, so no leg cuts a corner.
 *
 * Three lanes per server rather than one, because the point of the scene is
 * that a server holds several requests at once: a request being served has to
 * stand somewhere, and standing on its own column is the only arrangement in
 * which nothing ever travels through something else. That is also what fixes
 * the labels. Everything a request can reach is above y 1656, so a server names
 * itself, shows its health and draws its meter below that line, and the two
 * verdict rows sit under the box entirely. In the node the client lane comes
 * down the middle, so the label and the connection table sit left of it and the
 * policy chip, the probe interval and the warm-up share sit right of it.
 */

import {
  VIEWBOX,
  chip,
  clientBox,
  counterVariants,
  healthDot,
  nodeFrame,
  requestsLayer,
  serviceBox,
  trackAndFill,
  verticalLink,
} from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- geometry --------------------------------------------------------------

/** The lane every request leaves on, and where it starts. */
export const X_CLIENT = 540;
export const Y_CLIENT = 620;

/** Top and bottom of the load balancer node. */
const NODE_Y = 880;
const NODE_H = 390;
const NODE_BOTTOM = NODE_Y + NODE_H;

/**
 * The rail the balancer fans out on. It sits below the node rather than inside
 * it, so none of the node's own rows ever shares a row with something moving.
 */
export const Y_RAIL = 1340;

/** Centre of each server box, which is also its middle connection lane. */
export const SERVER_X = [250, 450, 650, 850];
const SERVER_W = 170;
const SERVER_Y = 1500;
const SERVER_H = 272;

/**
 * How far the outer two connection lanes sit from the middle one. A request is
 * 52px across, so 56 is the smallest offset at which two requests standing in
 * neighbouring lanes still have daylight between them.
 */
const LANE_GAP = 56;
/** Connections one server can hold at once, which is also its lane count. */
export const LANE_COUNT = 3;

/** Centre x of connection lane `lane` of `server`, both zero based. */
export const laneX = (server: number, lane: number): number =>
  (SERVER_X[server] ?? 0) + (lane - 1) * LANE_GAP;

/** Where a request stands while the server it reached is answering it. */
export const Y_SERVER = 1630;

/** Ends of the fan rail, which are the outermost lanes it has to reach. */
const RAIL_LEFT = laneX(0, 0);
const RAIL_RIGHT = laneX(SERVER_X.length - 1, LANE_COUNT - 1);

/** Full width of a server's load meter, and the connections that fill it. */
export const METER_W = 140;
export const METER_MAX = LANE_COUNT;

/** Rows inside a server, all of them below anything a request can reach. */
const HEALTH_CY = 1700;
const TITLE_Y = 1708;
const METER_Y = 1734;
/** The two verdict rows, which sit under the box because it has no room left. */
const VERDICT_Y = 1816;
const ROTATION_Y = 1854;

/** Rows inside the node, left of the client lane and right of it. */
const NODE_LABEL_Y = 938;
const TABLE_Y = 1030;
const TABLE_STEP = 60;
const TABLE_X = 170;
const TABLE_COUNT_X = 238;
const CHIP_X = 600;
const CHIP_W = 330;
const CHIP_Y = 968;
const CHIP_H = 62;
const RIGHT_EDGE = 930;

/** Every value the warm-up share steps through, smallest first. */
export const SHARES = ['1/8', '1/6', '1/5', '1/4'] as const;

/**
 * What every `data-*` on the stage starts at, keyed by the target the timeline
 * addresses it through. The markup below is written from this, so a change that
 * writes a value something already holds can be dropped rather than tweened.
 */
export const STAGE_STATE: Record<string, string> = {
  'stage@data-policy': 'round-robin',
  'stage@data-share': 'off',
  'stage@data-pick': 'none',
  'stage@data-fourth': 'absent',
};
for (let index = 1; index <= SERVER_X.length; index += 1) {
  const absent = index === SERVER_X.length;
  STAGE_STATE[`server-${index}@data-server`] = absent ? 'absent' : 'live';
  STAGE_STATE[`server-${index}@data-health`] = absent ? 'down' : 'up';
  STAGE_STATE[`server-${index}@data-probe`] = 'off';
  STAGE_STATE[`server-${index}@data-load`] = 'calm';
  STAGE_STATE[`server-${index}@data-verdict`] = 'none';
  STAGE_STATE[`server-${index}@data-rotation`] = absent ? 'out' : 'none';
  STAGE_STATE[`row-${index}@data-active`] = '0';
  STAGE_STATE[`row-${index}@data-row`] = absent ? 'out' : 'in';
}

// --- markup ----------------------------------------------------------------

/** One row of the balancer's table: a server and the connections it holds. */
const tableRow = (index: number): string => {
  const y = TABLE_Y + TABLE_STEP * index;
  const counts = counterVariants({
    x: TABLE_COUNT_X,
    y,
    className: 'lb-count',
    max: METER_MAX,
    format: (n) => `active ${n}`,
    indent: 8,
  });
  const row = index === SERVER_X.length - 1 ? 'out' : 'in';
  return `<g class="lb-row lb-row--${index + 1}" data-active="0" data-row="${row}">
        <text class="lb-row-name" x="${TABLE_X}" y="${y}">s${index + 1}</text>
        ${counts}
      </g>`;
};

const policyText = [
  ['round-robin', 'round robin'],
  ['least-connections', 'least connections'],
]
  .map(
    ([value, label]) =>
      `<text class="lb-policy-text lb-policy-text--${value}" x="${CHIP_X + CHIP_W / 2}" y="${CHIP_Y + 42}" text-anchor="middle">${label}</text>`,
  )
  .join('\n      ');

const policyChip = chip({
  x: CHIP_X,
  y: CHIP_Y,
  width: CHIP_W,
  height: CHIP_H,
  rx: 20,
  className: 'lb-policy',
  variant: 'outline',
  text: policyText,
});

const shareText = SHARES.map(
  (value) =>
    `<text class="lb-share lb-share--${value.replace('/', '-')}" x="${RIGHT_EDGE}" y="1152" text-anchor="end">share ${value}</text>`,
).join('\n    ');

/** One server: its health, its meter and the two rows that carry a verdict. */
const server = (index: number): string => {
  const centre = SERVER_X[index] ?? 0;
  const left = centre - SERVER_W / 2;
  const absent = index === SERVER_X.length - 1;
  return serviceBox({
    x: left,
    width: SERVER_W,
    y: SERVER_Y,
    height: SERVER_H,
    title: `Server ${index + 1}`,
    titleX: centre - 42,
    titleY: TITLE_Y,
    titleClass: 'lb-server-label',
    titleAnchor: null,
    className: `lb-server lb-server--${index + 1}`,
    attrs: ` data-server="${absent ? 'absent' : 'live'}" data-health="${absent ? 'down' : 'up'}" data-probe="off" data-load="calm" data-verdict="none" data-rotation="${absent ? 'out' : 'none'}"`,
    boxClass: 'scene-box lb-server-box',
    children: `
    ${healthDot({ cx: centre - 70, cy: HEALTH_CY, r: 13, ringR: 22, extraClass: 'lb-health' })}
    <circle class="lb-probe" cx="${centre - 70}" cy="${HEALTH_CY}" r="22" />
    ${trackAndFill({
      x: centre - METER_W / 2,
      y: METER_Y,
      width: METER_W,
      height: 16,
      rx: 8,
      className: 'lb-meter',
    })}
    <text class="scene-flash lb-verdict lb-verdict--unhealthy" x="${centre}" y="${VERDICT_Y}" text-anchor="middle">unhealthy</text>
    <text class="scene-flash lb-verdict lb-verdict--warm" x="${centre}" y="${VERDICT_Y}" text-anchor="middle">warm-up</text>
    <text class="scene-flash lb-rotation lb-rotation--out" x="${centre}" y="${ROTATION_Y}" text-anchor="middle">out</text>
    <text class="scene-flash lb-rotation lb-rotation--in" x="${centre}" y="${ROTATION_Y}" text-anchor="middle">in</text>`,
  });
};

/** The three connection lanes of one server, grouped so a pick can light them. */
const lanes = (index: number): string => {
  const lines = Array.from({ length: LANE_COUNT }, (_value, lane) =>
    verticalLink(laneX(index, lane), Y_RAIL, SERVER_Y, 'scene-link lb-lane'),
  ).join('\n    ');
  return `<g class="lb-lanes lb-lanes--${index + 1}">
    ${lines}
  </g>`;
};

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" data-policy="round-robin" data-share="off" data-pick="none" data-fourth="absent" aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_CLIENT, 680, NODE_Y)}
  ${verticalLink(X_CLIENT, NODE_BOTTOM, Y_RAIL)}
  <line class="scene-link" x1="${RAIL_LEFT}" y1="${Y_RAIL}" x2="${RAIL_RIGHT}" y2="${Y_RAIL}" />
  ${SERVER_X.map((_x, index) => lanes(index)).join('\n  ')}

  ${clientBox({ title: 'Clients', titleY: 512 })}

  ${nodeFrame({
    y: NODE_Y,
    height: NODE_H,
    label: 'Load balancer',
    labelY: NODE_LABEL_Y,
    children: `    ${policyChip}

    <text class="scene-caption-label lb-probe-label" x="${RIGHT_EDGE}" y="1092" text-anchor="end">probe 1s</text>
    ${shareText}

    <g class="lb-table">
      ${SERVER_X.map((_x, index) => tableRow(index)).join('\n      ')}
    </g>`,
  })}

  ${SERVER_X.map((_x, index) => server(index)).join('\n\n  ')}

  ${requestsLayer()}
</svg>`;
