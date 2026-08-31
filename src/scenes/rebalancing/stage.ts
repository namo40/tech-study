/**
 * Static stage markup for the Rebalancing scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Three bands, one per thing that has
 * an opinion about where data lives:
 *   - y 0..440       kept empty for the step title card
 *   - y 440..680     Clients (x 130..950): the row of request capsules waiting
 *                    to be answered, and the `ok n` every answer adds to. The
 *                    first step's saturation is drawn here as a full row and a
 *                    ringed box rather than as a word, because the fixed label
 *                    list has no word for it.
 *   - y 880..1270    Nodes (x 130..950): the `N1`, `N2` and `N3` capsules, the
 *                    partition tiles `P1`..`P6` sitting inside whichever node
 *                    owns them, and a `load` bar per node. A tile never travels
 *                    a lane: it is drawn once per position it can ever occupy
 *                    and the state reveals one, so a move is a change of which
 *                    copy is showing rather than a slide across the box.
 *   - y 1500..1740   Map (x 280..800): one row per partition saying who owns it
 *                    right now, the `moving` lamp, and `moved n`.
 *
 * Two lane segments and no others, both axis aligned and both at x 540:
 *   - `Y_CLIENTS_BOTTOM` 680 to `Y_NODES_TOP` 880, downward only. What rides it
 *     is a request on its way to whichever node the map currently names.
 *   - `Y_NODES_BOTTOM` 1270 to `Y_MAP_TOP` 1500, downward only. What rides it is
 *     an ownership update, which leaves the node the instant a move finishes and
 *     lands on the map the instant the row changes.
 *
 * A traveller is a dot with a halo of r 26, so each lane sweeps a 52px band at
 * x 514..566 and everything written beside one keeps 30px off it. The upper lane
 * sweeps y 654..906, so the Clients band writes nothing below y 654 in that
 * column and the Nodes band nothing above y 936 in it — which is why the node
 * capsules start at y 960. The lower lane sweeps y 1244..1526, so the node
 * capsules stop at y 1240 and the Map band writes nothing above y 1556 in that
 * column: the `Map` title and `moved n` sit either side of the middle.
 *
 * Declared texture: the request capsules, the node capsules, the partition
 * tiles, the `load` tracks and their fills, the `moving` plate and the six map
 * row plates. Everything else on the stage is a word, and every word is one of
 * the fixed labels.
 *
 * Every value the reader can read is a stack of elements on one spot with a base
 * rule hiding all of them and the current `data-*` revealing one, so nothing is
 * interpolated and scrubbing backwards lands on the value rather than on an
 * average of two. That covers the two counters, the three `load` bars, the six
 * tiles' positions and the six map rows' owners.
 */

import {
  VIEWBOX,
  clientBox,
  counterVariants,
  requestsLayer,
  serviceBox,
  verticalLink,
} from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- geometry --------------------------------------------------------------

/** The one column anything travels on, and the four edges it runs between. */
export const X_LANE = 540;
export const Y_CLIENTS_BOTTOM = 680;
export const Y_NODES_TOP = 880;
export const Y_NODES_BOTTOM = 1270;
export const Y_MAP_TOP = 1500;

/** The Clients band: the capsules waiting, and the answers already given. */
const CLIENTS = { x: 130, y: 440, w: 820, h: 240 };
const CLIENTS_TITLE = { x: 152, y: 498 };
const OK = { x: 928, y: 498 };
/** One capsule per request the saturated world is holding but not answering. */
const CAPSULE_XS = [224, 356, 488, 620, 752] as const;
const CAPSULE = { y: 550, w: 104, h: 48, rx: 16 };

/** The Nodes band: three capsules, the tiles inside them, and their bars. */
const NODES = { x: 130, y: 880, w: 820, h: 390 };
const NODES_TITLE = { x: 152, y: 936 };
const NODE_X: Record<string, number> = { n1: 150, n2: 415, n3: 680 };
const NODE = { y: 960, w: 250, h: 280, rx: 26 };
const NODE_NAME = { dx: 24, y: 1008 };
/** Three slots per node, which is the most any node holds at any instant. */
const TILE = { dx: 20, w: 210, h: 38, rx: 10 };
const TILE_YS = [1036, 1082, 1128] as const;
const TILE_NAME = { dx: 16, dy: 28 };
const LOAD_NAME = { dx: 24, y: 1201 };
const LOAD_BAR = { dx: 110, y: 1176, w: 118, h: 28, rx: 8 };

/** The Map band: six rows, the lamp, and the count of finished moves. */
const MAP = { x: 280, y: 1500, w: 520, h: 240 };
const MAP_TITLE = { x: 302, y: 1560 };
const LAMP = { x: 470, y: 1560, w: 170, h: 50, rx: 16 };
const LAMP_TEXT = { x: 555, y: 1598 };
const MOVED = { x: 776, y: 1560 };
/** Three columns and two rows, so six rows fit under the lane keep-out. */
const ROW_X = [308, 474, 640] as const;
const ROW_Y = [1658, 1712] as const;
const OWNER_DX = 72;
const ROW_PLATE = { dx: -14, w: 132, dy: -34, h: 46 };

// --- what the stage can say about itself -----------------------------------

/** The three nodes. `N3` is not there until the second step of the scene. */
export const NODE_IDS = ['n1', 'n2', 'n3'] as const;
export type NodeId = (typeof NODE_IDS)[number];

/** The six partitions, which are the only things that ever move. */
export const PARTITION_IDS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'] as const;
export type PartitionId = (typeof PARTITION_IDS)[number];

/** The name the fixed labels give a node or a partition. */
export const upper = (id: string): string => id.toUpperCase();

/**
 * Where a tile can sit: a node and a slot inside it. A tile is drawn once per
 * entry, so a move is a change of which copy is revealed and the six tiles never
 * ride a lane. The lists are the positions each partition actually reaches in
 * this scene, which is what keeps the stage from drawing eighteen dead copies.
 */
export const TILE_HOMES: Record<PartitionId, readonly string[]> = {
  p1: ['n1-0'],
  p2: ['n1-1', 'n2-0'],
  p3: ['n1-2', 'n3-0'],
  p4: ['n2-0', 'n2-1'],
  p5: ['n2-1', 'n2-2', 'n1-1'],
  p6: ['n2-2', 'n3-1'],
};

/** Where each partition starts, which is three on `N1` and three on `N2`. */
export const HOME: Record<PartitionId, NodeId> = {
  p1: 'n1',
  p2: 'n1',
  p3: 'n1',
  p4: 'n2',
  p5: 'n2',
  p6: 'n2',
};

/** Which map row a partition is written on: three across, two down. */
const ROW_AT: Record<PartitionId, [number, number]> = {
  p1: [0, 0],
  p2: [0, 1],
  p3: [0, 2],
  p4: [1, 0],
  p5: [1, 1],
  p6: [1, 2],
};

/** What a node is. `absent` is `N3` before it joins; `hot` is over its bar. */
export const NODE_STATES = ['absent', 'empty', 'active', 'hot'] as const;
export type NodeState = (typeof NODE_STATES)[number];

/** What just happened at a node: it answered, or it sent the caller onward. */
export const HITS = ['off', 'serve', 'redirect'] as const;
export type Hit = (typeof HITS)[number];

/** What a node is to the move in flight, which is how the direction is read. */
export const ROLES = ['idle', 'source', 'target'] as const;
export type Role = (typeof ROLES)[number];

/**
 * What is happening to a tile. `moving` is a plain move; the last three are the
 * three beats a shard heavy with state moves in, and they are separate values
 * because the whole fourth step is that they look different from each other.
 */
export const PHASES = ['settled', 'moving', 'copy', 'catchup', 'switch'] as const;
export type Phase = (typeof PHASES)[number];

/** What a map row is doing: nothing, waiting on a move, or just rewritten. */
export const ROW_STATES = ['idle', 'moving', 'fresh'] as const;
export type RowState = (typeof ROW_STATES)[number];

/** How hard the first step's world is being pushed. `peak` is over the bar. */
export const WARNS = ['off', 'rising', 'peak'] as const;
export type Warn = (typeof WARNS)[number];

/** Whether the counterfactual world is up. */
export const GHOSTS = ['off', 'on'] as const;
export type Ghost = (typeof GHOSTS)[number];

/** Whether there is anywhere to move to, which the first step decides. */
export const MODES = ['hold', 'rebalance'] as const;
export type Mode = (typeof MODES)[number];

/**
 * The plan on the table. `naive` marks all six tiles, `rejected` strikes that
 * proposal out, and `minimal` marks the two the new node should own.
 */
export const PLANS = ['none', 'naive', 'rejected', 'minimal'] as const;
export type Plan = (typeof PLANS)[number];

/** What the scene is holding up for a moment, drawn on the band it is about. */
export const MARKS = ['none', 'idle', 'data', 'untouched', 'truth', 'shelf'] as const;
export type Mark = (typeof MARKS)[number];

/** How many steps the `load` bar is drawn in, and the widths of those steps. */
export const MAX_LOAD = 8;
const LOAD_WIDTHS = [15, 30, 44, 59, 74, 89, 103, 118] as const;

/** What one partition costs the node holding it, in `load` steps. */
export const LOAD_PER_TILE = 2;

/** The highest either counter is drawn to. */
export const MAX_OK = 8;
export const MAX_MOVED = 6;

/**
 * What every `data-*` on the stage starts at, keyed by the target the timeline
 * addresses it through. The markup below is written from this, so the opening
 * frame is the whole diagram in its starting state — two nodes holding three
 * partitions each at `load` 6, a third node not there yet, a map that agrees
 * with the tiles, `ok 0`, `moved 0`, a dark lamp and nothing in flight — and the
 * timeline never restates a value already there.
 */
export const STAGE_STATE: Record<string, string> = {
  'stage@data-rb-ghost': 'off',
  'stage@data-rb-warn': 'off',
  'stage@data-rb-mode': 'hold',
  'stage@data-rb-queue': '0',
  'stage@data-rb-ok': '0',
  'stage@data-rb-plan': 'none',
  'stage@data-rb-moving': 'off',
  'stage@data-rb-moved': '0',
  'stage@data-rb-mark': 'none',
  'stage@data-rb-settled': 'off',
  'node-n1@data-rb-node': 'active',
  'node-n1@data-rb-load': '6',
  'node-n1@data-rb-hit': 'off',
  'node-n1@data-rb-role': 'idle',
  'node-n2@data-rb-node': 'active',
  'node-n2@data-rb-load': '6',
  'node-n2@data-rb-hit': 'off',
  'node-n2@data-rb-role': 'idle',
  'node-n3@data-rb-node': 'absent',
  'node-n3@data-rb-load': '0',
  'node-n3@data-rb-hit': 'off',
  'node-n3@data-rb-role': 'idle',
  'tile-p1@data-rb-pos': 'n1-0',
  'tile-p1@data-rb-phase': 'settled',
  'tile-p2@data-rb-pos': 'n1-1',
  'tile-p2@data-rb-phase': 'settled',
  'tile-p3@data-rb-pos': 'n1-2',
  'tile-p3@data-rb-phase': 'settled',
  'tile-p4@data-rb-pos': 'n2-0',
  'tile-p4@data-rb-phase': 'settled',
  'tile-p5@data-rb-pos': 'n2-1',
  'tile-p5@data-rb-phase': 'settled',
  'tile-p6@data-rb-pos': 'n2-2',
  'tile-p6@data-rb-phase': 'settled',
  'row-p1@data-rb-own': 'n1',
  'row-p1@data-rb-row': 'idle',
  'row-p2@data-rb-own': 'n1',
  'row-p2@data-rb-row': 'idle',
  'row-p3@data-rb-own': 'n1',
  'row-p3@data-rb-row': 'idle',
  'row-p4@data-rb-own': 'n2',
  'row-p4@data-rb-row': 'idle',
  'row-p5@data-rb-own': 'n2',
  'row-p5@data-rb-row': 'idle',
  'row-p6@data-rb-own': 'n2',
  'row-p6@data-rb-row': 'idle',
};

// --- markup ----------------------------------------------------------------

/** Newline plus `n` spaces, the separator between lines of one fragment. */
const pad = (n: number): string => `\n${' '.repeat(n)}`;

/** Non-breaking spaces, so a monospaced readout keeps its gaps in SVG. */
const mono = (text: string): string => text.replace(/ /g, '&#160;');

/** The row of requests the saturated world is holding rather than answering. */
const capsules = CAPSULE_XS.map(
  (x, index) =>
    `<rect class="rb-cap rb-cap--${index + 1}" x="${x}" y="${CAPSULE.y}" width="${CAPSULE.w}" height="${CAPSULE.h}" rx="${CAPSULE.rx}" />`,
).join(pad(4));

/** The `load` bar of one node: a fixed track and one fill per step it reads. */
const loadBar = (id: NodeId): string => {
  const x = (NODE_X[id] ?? 0) + LOAD_BAR.dx;
  const fills = LOAD_WIDTHS.map(
    (w, index) =>
      `<rect class="rb-load-fill rb-load-fill--${index + 1}" x="${x}" y="${LOAD_BAR.y}" width="${w}" height="${LOAD_BAR.h}" rx="${LOAD_BAR.rx}" />`,
  ).join(pad(8));
  return `<rect class="rb-load-track" x="${x}" y="${LOAD_BAR.y}" width="${LOAD_BAR.w}" height="${LOAD_BAR.h}" rx="${LOAD_BAR.rx}" />
        ${fills}`;
};

/**
 * One node: its capsule, its name, the bar that says how much it is carrying,
 * and the word that bar is read under. The tiles are not drawn here, because a
 * tile belongs to the partition rather than to the node it is currently sitting
 * in — which is the whole argument of the scene.
 */
const node = (id: NodeId): string => {
  const x = NODE_X[id] ?? 0;
  return `<g class="rb-node rb-node--${id}" data-rb-node="${STAGE_STATE[`node-${id}@data-rb-node`]}" data-rb-load="${STAGE_STATE[`node-${id}@data-rb-load`]}" data-rb-hit="off" data-rb-role="idle">
      <rect class="rb-node-bg" x="${x}" y="${NODE.y}" width="${NODE.w}" height="${NODE.h}" rx="${NODE.rx}" />
      <rect class="rb-node-ring" x="${x + 8}" y="${NODE.y + 8}" width="${NODE.w - 16}" height="${NODE.h - 16}" rx="${NODE.rx - 6}" />
      <text class="rb-node-name" x="${x + NODE_NAME.dx}" y="${NODE_NAME.y}">${upper(id)}</text>
      <text class="rb-load-name" x="${x + LOAD_NAME.dx}" y="${LOAD_NAME.y}">load</text>
      ${loadBar(id)}
    </g>`;
};

/**
 * One partition, drawn once per position it can ever occupy. Exactly one copy
 * is revealed at a time, so the tile is never between two nodes and the map can
 * never disagree with what the reader sees.
 */
const tile = (id: PartitionId): string => {
  const copies = (TILE_HOMES[id] ?? [])
    .map((home) => {
      const [nodeId = 'n1', slot = '0'] = home.split('-');
      const x = (NODE_X[nodeId] ?? 0) + TILE.dx;
      const y = TILE_YS[Number(slot)] ?? TILE_YS[0];
      return `<g class="rb-tile-at rb-tile-at--${home}">
        <rect class="rb-tile-bg" x="${x}" y="${y}" width="${TILE.w}" height="${TILE.h}" rx="${TILE.rx}" />
        <text class="rb-tile-name" x="${x + TILE_NAME.dx}" y="${y + TILE_NAME.dy}">${upper(id)}</text>
      </g>`;
    })
    .join(pad(6));
  return `<g class="rb-tile rb-tile--${id}" data-rb-pos="${STAGE_STATE[`tile-${id}@data-rb-pos`]}" data-rb-phase="settled">
      ${copies}
    </g>`;
};

/** One map row: the partition, and the three names it can be answered with. */
const row = (id: PartitionId): string => {
  const [r = 0, c = 0] = ROW_AT[id];
  const x = ROW_X[c] ?? 0;
  const y = ROW_Y[r] ?? 0;
  const owners = NODE_IDS.map(
    (owner) =>
      `<text class="rb-own rb-own--${owner}" x="${x + OWNER_DX}" y="${y}">${upper(owner)}</text>`,
  ).join(pad(8));
  return `<g class="rb-row rb-row--${id}" data-rb-own="${STAGE_STATE[`row-${id}@data-rb-own`]}" data-rb-row="idle">
      <rect class="rb-row-bg" x="${x + ROW_PLATE.dx}" y="${y + ROW_PLATE.dy}" width="${ROW_PLATE.w}" height="${ROW_PLATE.h}" rx="14" />
      <text class="rb-row-name" x="${x}" y="${y}">${upper(id)}</text>
      ${owners}
    </g>`;
};

const stageAttrs = Object.entries(STAGE_STATE)
  .filter(([key]) => key.startsWith('stage@'))
  .map(([key, value]) => `${key.slice('stage@'.length)}="${value}"`)
  .join(' ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageAttrs} aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_LANE, Y_CLIENTS_BOTTOM, Y_NODES_TOP, 'scene-link rb-lane--ask')}
  ${verticalLink(X_LANE, Y_NODES_BOTTOM, Y_MAP_TOP, 'scene-link rb-lane--tell')}

  ${clientBox({
    x: CLIENTS.x,
    width: CLIENTS.w,
    y: CLIENTS.y,
    height: CLIENTS.h,
    title: 'Clients',
    titleX: CLIENTS_TITLE.x,
    titleY: CLIENTS_TITLE.y,
    titleClass: 'scene-node-title rb-title',
    titleAnchor: null,
    extraClass: 'rb-clients',
    children: `
    ${capsules}

    ${counterVariants({
      x: OK.x,
      y: OK.y,
      className: 'rb-ok',
      max: MAX_OK,
      format: (n) => mono(`ok ${n}`),
      anchor: 'end',
    })}`,
  })}

  ${serviceBox({
    x: NODES.x,
    width: NODES.w,
    y: NODES.y,
    height: NODES.h,
    title: 'Nodes',
    titleX: NODES_TITLE.x,
    titleY: NODES_TITLE.y,
    titleClass: 'scene-node-title rb-title',
    titleAnchor: null,
    className: 'scene-node rb-nodes',
    children: `
    ${NODE_IDS.map(node).join(pad(4))}

    ${PARTITION_IDS.map(tile).join(pad(4))}`,
  })}

  ${serviceBox({
    x: MAP.x,
    width: MAP.w,
    y: MAP.y,
    height: MAP.h,
    title: 'Map',
    titleX: MAP_TITLE.x,
    titleY: MAP_TITLE.y,
    titleClass: 'scene-node-title rb-title',
    titleAnchor: null,
    className: 'scene-service rb-map',
    children: `
    <rect class="rb-lamp-bg" x="${LAMP.x}" y="${LAMP.y}" width="${LAMP.w}" height="${LAMP.h}" rx="${LAMP.rx}" />
    <text class="rb-lamp-text" x="${LAMP_TEXT.x}" y="${LAMP_TEXT.y}" text-anchor="middle">moving</text>

    ${counterVariants({
      x: MOVED.x,
      y: MOVED.y,
      className: 'rb-moved',
      max: MAX_MOVED,
      format: (n) => mono(`moved ${n}`),
      anchor: 'end',
    })}

    ${PARTITION_IDS.map(row).join(pad(4))}`,
  })}

  ${requestsLayer()}
</svg>`;
