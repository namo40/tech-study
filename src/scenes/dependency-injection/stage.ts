/**
 * Static stage markup for the Dependency Injection scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Three bands, read top to bottom as
 * one sentence about who does the making:
 *   - y 0..440       kept empty for the step title card
 *   - y 440..680     App (x 130..950): the two request slots the caller uses in
 *                    turn, and the running `ok n` count of answers
 *   - y 880..1270    Container (x 130..950): three registration rows, each a
 *                    contract symbol joined by an arrow to its implementation
 *                    symbol with a lifetime badge beside it, and on the right
 *                    the one region that has two spellings — the first step's
 *                    ghost, where each class wires its own dependencies by
 *                    hand, and from the second step on the graph the container
 *                    assembles along the constructor chain
 *   - y 1500..1740   Instances (x 280..800): one lane per lifetime, each seven
 *                    slots wide, the scope outline that wraps the two lanes a
 *                    scope owns, and the `build` and `dispose` lamps
 *
 * Two lane segments and no others, both axis aligned, both at x 540, and both
 * ending on a box edge:
 *   - `Y_APP_BOTTOM` 680 to `Y_CONTAINER_TOP` 880, **bidirectional**: a request
 *     rides it down and waits at the container while the graph is built, then
 *     its answer rides the same column back up. The lane is only ever asked to
 *     hold one traveller, so a request is always gone before the next leaves.
 *   - `Y_CONTAINER_BOTTOM` 1270 to `Y_INSTANCES_TOP` 1500, downward only: the
 *     one indication per request that says the container is now making things,
 *     which is what puts instances in the lanes below.
 *
 * A traveller is a dot with a halo of r 26, so a lane sweeps a 52px band and
 * everything written beside it keeps 30px off. The upper lane sweeps y 654..906
 * at x 514..566 and the lower one y 1244..1526 at the same x, so the App band
 * writes nothing below y 624 in that column, the Container band nothing above
 * y 936 or below y 1214 in it, and the Instances band nothing above y 1556 in
 * it. The Instances title is set smaller than the other two for exactly that
 * reason: `Instances` is a long word and the lower lane's label keep-out cuts
 * across the band it names.
 *
 * Declared texture: the two request plates with their index marks and check
 * glyphs, the `ok n` plate, the three registration row plates with their
 * contract circles, arrows, implementation squares and lifetime badges, the
 * ghost's four class nodes with their hand wires and touch points, the assembly
 * tree's root and three leaves with the links between them, the twenty-one
 * instance slots, the scope outline, and the two lamp plates. Everything else
 * on the stage is a word, and every word is one of the nine fixed labels, a
 * number, or one of the three declared symbol pairs `A -> A'`, `B -> B'` and
 * `C -> C'` that stand in for a contract and the type registered against it.
 *
 * Nothing is told apart by colour alone. A request slot with nothing in it is a
 * **dashed hollow plate**, one carrying a request is a **filled plate**, and one
 * that was answered is a **filled plate with a check**. A registration row is a
 * **dashed hollow plate with no symbols** before it is registered and a **solid
 * plate carrying both symbols and a badge** after; once `build` has run every
 * row gains a **heavier closed rim**. The ghost's wires are **dashed hand
 * lines** and a lit touch point is a **filled ring on a wire**. The assembly
 * tree is a **dashed outline** while it is idle and **solid, filling leaf by
 * leaf** as the chain is walked. An instance slot is a **faint dashed empty
 * square** before it holds anything, a **heavy filled square** the moment it is
 * created, a **filled square** while it lives, a **filled square with a doubled
 * rim** while the one singleton is being handed out again, and a **hollow
 * dashed square with a line struck through it** once it has been disposed. The
 * scope outline is **dashed while closed and solid while open**.
 *
 * Every value the reader can read is a stack of elements on one spot with a
 * base rule hiding all of them and the current `data-*` revealing exactly one,
 * so nothing is interpolated and scrubbing backwards lands on the value rather
 * than on an average of two: the `ok n` readout, each request slot's three
 * plates and its check, each registration row's two plates and its symbols and
 * badge, the ghost's four stages, the assembly tree's five stages, each of the
 * twenty-one instance slots' five plates and its strike, the scope outline's
 * two spellings, and the two lamps' five plates. There is no continuous
 * quantity anywhere on this stage.
 */

import { VIEWBOX, requestsLayer, serviceBox, verticalLink } from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- geometry --------------------------------------------------------------

/** The one column anything travels on, and the four edges it runs between. */
export const X_LANE = 540;
export const Y_APP_BOTTOM = 680;
export const Y_CONTAINER_TOP = 880;
export const Y_CONTAINER_BOTTOM = 1270;
export const Y_INSTANCES_TOP = 1500;

/** The App band: who is asking, and how many answers came back. */
const APP = { x: 130, y: 440, w: 820, h: 240 };
const APP_TITLE = { x: 152, y: 500 };
const OK = { x: 928, y: 500 };
const SLOT_PLATE = { x: 170, w: 220, h: 48, ys: [532, 600], rx: 16 };
const SLOT_MARK = { x: 194, dx: 22, side: 14, dy: 17 };
const SLOT_GLYPH = { x: 348, dy: 24 };

/** The Container band: what is registered, and what gets built from it. */
const CONTAINER = { x: 130, y: 880, w: 820, h: 390 };
const CONTAINER_TITLE = { x: 152, y: 936 };
const ROW = { x: 160, w: 440, h: 60, rx: 20, ys: [966, 1046, 1126] };
const CONTRACT = { cx: 206, r: 24, textDy: 9 };
const ARROW = { x0: 240, x1: 288 };
const IMPL = { x: 300, w: 50, h: 50, rx: 14, textDy: 8 };
const BADGE = { x: 372, w: 208, h: 40, rx: 20, textX: 476, textDy: 8 };

/** The graph region, which the ghost and the assembly tree take turns in. */
const GHOST_NODE = { r: 26, points: [[716, 992], [870, 1048], [716, 1104], [870, 1160]] as const };
const TREE_ROOT = { cx: 720, cy: 1076, r: 30 };
const TREE_LEAF = { cx: 880, r: 24, cys: [996, 1076, 1156] };

/** The Instances band: one lane per lifetime, the scope, and the two lamps. */
const INSTANCES = { x: 280, y: 1500, w: 520, h: 240 };
const INSTANCES_TITLE = { x: 302, y: 1554 };
const LAMP = { y: 1522, h: 44, rx: 22, textDy: 29 };
const BUILD_LAMP = { x: 592, w: 88, textX: 636 };
const DISPOSE_LAMP = { x: 688, w: 100, textX: 738 };
const LANE = { labelX: 302, tops: [1582, 1636, 1690], side: 32, labelDy: 24 };
const BOX = { x0: 430, pitch: 48, ring: 4 };
const SCOPE = { x: 414, y: 1628, w: 352, h: 100, rx: 22 };

// --- what the stage can say about itself -----------------------------------

/** Which world the scene is in: classes making their own, or a container. */
export const MODES = ['direct', 'injected'] as const;
export type Mode = (typeof MODES)[number];

/**
 * The ghost of the first step, drawn as four classes on the right of the band.
 *  - `nodes` is the opening frame: the classes exist and nothing is wired.
 *  - `near` is one class reaching past its own edge to make what it needs.
 *  - `deep` is that repeated, so the choice is wired all the way down.
 *  - `lit` puts a mark on every wire at once: the places one swap would touch.
 */
export const GHOSTS = ['nodes', 'near', 'deep', 'lit', 'off'] as const;
export type Ghost = (typeof GHOSTS)[number];

/** How far down the constructor chain the container has walked. */
export const ASSEMBLIES = ['idle', 'w1', 'w2', 'w3', 'built'] as const;
export type Assembly = (typeof ASSEMBLIES)[number];

/** A registration row: an empty slot, or a contract bound to an implementation. */
export const ROW_STATES = ['blank', 'on'] as const;
export type RowState = (typeof ROW_STATES)[number];

/** The three registrations, and the lifetime each one is registered with. */
export const ROW_IDS = ['a', 'b', 'c'] as const;
export type RowId = (typeof ROW_IDS)[number];

/** The three lifetimes, which are also the three lanes instances land in. */
export const LIFETIMES = ['singleton', 'scoped', 'transient'] as const;
export type Lifetime = (typeof LIFETIMES)[number];

/** Which registration carries which lifetime. */
export const ROW_LIFETIME: Record<RowId, Lifetime> = {
  a: 'singleton',
  b: 'scoped',
  c: 'transient',
};

/** The declared symbol pair each row draws instead of a real type name. */
export const ROW_SYMBOL: Record<RowId, string> = { a: 'A', b: 'B', c: 'C' };

/** What a request slot in the App band is holding. */
export const CHIP_STATES = ['idle', 'live', 'ok'] as const;
export type ChipState = (typeof CHIP_STATES)[number];

/** The two request slots, used in turn. */
export const CHIP_IDS = ['q1', 'q2'] as const;
export type ChipId = (typeof CHIP_IDS)[number];

/**
 * What one instance slot says about itself.
 *  - `off` is a slot nothing has been put in yet.
 *  - `new` is the instant an instance was made.
 *  - `live` is an instance that exists and is being kept.
 *  - `reused` only ever happens in the singleton lane: the one instance being
 *    handed to somebody else rather than a second one being made.
 *  - `disposed` is an instance whose owner has gone. It stays on the stage,
 *    because the whole picture of the third step is how many were ever made.
 */
export const BOX_STATES = ['off', 'new', 'live', 'reused', 'disposed'] as const;
export type BoxState = (typeof BOX_STATES)[number];

/** How many instances one lane can ever be asked to draw. */
export const LANE_SLOTS = 7;

/** Every instance slot, lane by lane. */
export const LANE_PREFIX: Record<Lifetime, string> = {
  singleton: 'sg',
  scoped: 'sc',
  transient: 'tr',
};

export const BOX_IDS: string[] = LIFETIMES.flatMap((life) =>
  Array.from({ length: LANE_SLOTS }, (_v, n) => `${LANE_PREFIX[life]}${n + 1}`),
);

/** The highest `ok n` the readout is ever asked for. */
export const OK_MAX = 5;

/** Whether a scope is open around the instances it owns. */
export const SCOPES = ['closed', 'open'] as const;
export type Scope = (typeof SCOPES)[number];

/** What the container's own life has reached. */
export const DISPOSE_STATES = ['off', 'run', 'done'] as const;
export type DisposeState = (typeof DISPOSE_STATES)[number];

/** What the scene holds up for a moment, drawn on the thing it is about. */
export const MARKS = ['none', 'declare', 'onePlace', 'oneLine', 'grow'] as const;
export type Mark = (typeof MARKS)[number];

/**
 * What every `data-*` on the stage starts at. The markup below is written from
 * this, so the opening frame is the whole diagram in its starting state — four
 * classes that have not been wired to anything, three registration rows still
 * empty, no lifetimes declared, twenty-one empty instance slots, a scope that
 * has not been opened, both lamps dark, `ok 0`, and nothing in flight — and the
 * timeline never restates a value that is already there.
 */
export const STAGE_STATE: Record<string, string> = {
  'stage@data-di-mode': 'direct',
  'stage@data-di-ghost': 'nodes',
  'stage@data-di-assembly': 'idle',
  'stage@data-di-scope': 'closed',
  'stage@data-di-lifetimes': 'off',
  'stage@data-di-build': 'off',
  'stage@data-di-dispose': 'off',
  'stage@data-di-ok': '0',
  'stage@data-di-mark': 'none',
  'stage@data-di-settled': 'off',
  ...Object.fromEntries(ROW_IDS.map((id) => [`${id}@data-di-row`, 'blank'])),
  ...Object.fromEntries(CHIP_IDS.map((id) => [`${id}@data-di-chip`, 'idle'])),
  ...Object.fromEntries(BOX_IDS.map((id) => [`${id}@data-di-box`, 'off'])),
};

// --- markup ----------------------------------------------------------------

/** Newline plus `n` spaces, the separator between lines of one fragment. */
const pad = (n: number): string => `\n${' '.repeat(n)}`;

/** Non-breaking spaces, so a monospaced readout keeps its gaps in SVG. */
const mono = (text: string): string => text.replace(/ /g, '&#160;');

/** The `ok n` readout: one text per value, and the state picks one. */
const okReadout = Array.from({ length: OK_MAX + 1 }, (_v, n) => n)
  .map(
    (n) =>
      `<text class="scene-counter di-ok di-ok--${n}" x="${OK.x}" y="${OK.y}" text-anchor="end">${mono(`ok ${n}`)}</text>`,
  )
  .join(pad(4));

/** One request slot: three plates, its index marks, and the answered check. */
const requestSlot = (id: ChipId, index: number): string => {
  const y = SLOT_PLATE.ys[index] ?? 0;
  const plates = CHIP_STATES.map(
    (state) =>
      `<rect class="di-slot-bg di-slot-bg--${state}" x="${SLOT_PLATE.x}" y="${y}" width="${SLOT_PLATE.w}" height="${SLOT_PLATE.h}" rx="${SLOT_PLATE.rx}" />`,
  ).join(pad(6));
  const marks = Array.from({ length: index + 1 }, (_v, n) => n)
    .map(
      (n) =>
        `<rect class="di-slot-mark" x="${SLOT_MARK.x + n * SLOT_MARK.dx}" y="${y + SLOT_MARK.dy}" width="${SLOT_MARK.side}" height="${SLOT_MARK.side}" rx="3" />`,
    )
    .join(pad(6));
  const gy = y + SLOT_GLYPH.dy;
  return `<g class="di-slot di-slot--${id}" data-di-chip="${STAGE_STATE[`${id}@data-di-chip`]}">
      ${plates}
      ${marks}
      <path class="di-slot-glyph" d="M ${SLOT_GLYPH.x - 15} ${gy + 1} L ${SLOT_GLYPH.x - 5} ${gy + 11} L ${SLOT_GLYPH.x + 16} ${gy - 12}" />
    </g>`;
};

/** One registration row: two plates, a contract, an arrow, an implementation. */
const registrationRow = (id: RowId, index: number): string => {
  const y = ROW.ys[index] ?? 0;
  const cy = y + ROW.h / 2;
  const symbol = ROW_SYMBOL[id];
  const life = ROW_LIFETIME[id];
  const plates = ROW_STATES.map(
    (state) =>
      `<rect class="di-row-bg di-row-bg--${state}" x="${ROW.x}" y="${y}" width="${ROW.w}" height="${ROW.h}" rx="${ROW.rx}" />`,
  ).join(pad(6));
  return `<g class="di-row di-row--${id}" data-di-row="${STAGE_STATE[`${id}@data-di-row`]}">
      ${plates}
      <g class="di-row-body">
        <circle class="di-contract" cx="${CONTRACT.cx}" cy="${cy}" r="${CONTRACT.r}" />
        <text class="scene-mono di-symbol" x="${CONTRACT.cx}" y="${cy + CONTRACT.textDy}" text-anchor="middle">${symbol}</text>
        <path class="di-arrow" d="M ${ARROW.x0} ${cy} L ${ARROW.x1} ${cy} M ${ARROW.x1 - 14} ${cy - 10} L ${ARROW.x1} ${cy} L ${ARROW.x1 - 14} ${cy + 10}" />
        <rect class="di-impl" x="${IMPL.x}" y="${cy - IMPL.h / 2}" width="${IMPL.w}" height="${IMPL.h}" rx="${IMPL.rx}" />
        <text class="scene-mono di-symbol" x="${IMPL.x + IMPL.w / 2}" y="${cy + IMPL.textDy}" text-anchor="middle">${symbol}'</text>
        <g>
          ${(['off', 'on'] as const)
            .map(
              (state) =>
                `<rect class="di-badge-bg di-badge-bg--${state}" x="${BADGE.x}" y="${cy - BADGE.h / 2}" width="${BADGE.w}" height="${BADGE.h}" rx="${BADGE.rx}" />`,
            )
            .join(pad(10))}
          <text class="di-badge-word" x="${BADGE.textX}" y="${cy + BADGE.textDy}" text-anchor="middle">${life}</text>
        </g>
      </g>
    </g>`;
};

/**
 * The ghost: four classes, the wires one draws when a class makes its own
 * dependencies, and a touch point on every wire. A wire only exists in the
 * stages that draw it, and a touch point is never lit on a wire that is not
 * there.
 */
const ghostWire = (n: number): string => {
  const from = GHOST_NODE.points[n];
  const to = GHOST_NODE.points[n + 1];
  if (!from || !to) return '';
  const mx = (from[0] + to[0]) / 2;
  const my = (from[1] + to[1]) / 2;
  return `<line class="di-ghost-wire di-ghost-wire--${n + 1}" x1="${from[0]}" y1="${from[1]}" x2="${to[0]}" y2="${to[1]}" />
        <circle class="di-ghost-touch di-ghost-touch--${n + 1}" cx="${mx}" cy="${my}" r="10" />`;
};

const ghost = `<g class="di-ghost">
      ${GHOST_NODE.points
        .map(
          (point, n) =>
            `<circle class="di-ghost-node di-ghost-node--${n + 1}" cx="${point[0]}" cy="${point[1]}" r="${GHOST_NODE.r}" />`,
        )
        .join(pad(6))}
      ${[0, 1, 2].map((n) => ghostWire(n)).join(pad(6))}
    </g>`;

/**
 * The graph the container assembles: a root and one leaf per registration, each
 * drawn twice so the picture of a need that has been filled is a different
 * element from the picture of one that has not, and never a tween between them.
 */
const FILLS = ['idle', 'on'] as const;

const tree = `<g class="di-tree">
      ${TREE_LEAF.cys
        .flatMap((cy, n) =>
          FILLS.map(
            (fill) =>
              `<line class="di-tree-link di-tree-link--${n + 1} di-tree-link--${fill}" x1="${TREE_ROOT.cx + TREE_ROOT.r}" y1="${TREE_ROOT.cy}" x2="${TREE_LEAF.cx - TREE_LEAF.r}" y2="${cy}" />`,
          ),
        )
        .join(pad(6))}
      ${FILLS.map(
        (fill) =>
          `<circle class="di-tree-root di-tree-root--${fill}" cx="${TREE_ROOT.cx}" cy="${TREE_ROOT.cy}" r="${TREE_ROOT.r}" />`,
      ).join(pad(6))}
      ${TREE_LEAF.cys
        .flatMap((cy, n) =>
          FILLS.map(
            (fill) =>
              `<circle class="di-tree-leaf di-tree-leaf--${n + 1} di-tree-leaf--${fill}" cx="${TREE_LEAF.cx}" cy="${cy}" r="${TREE_LEAF.r}" />`,
          ),
        )
        .join(pad(6))}
    </g>`;

/** One instance slot: five plates and the strike a disposed one carries. */
const instanceBox = (life: Lifetime, laneIndex: number, n: number): string => {
  const x = BOX.x0 + n * BOX.pitch;
  const y = LANE.tops[laneIndex] ?? 0;
  const id = `${LANE_PREFIX[life]}${n + 1}`;
  const plates = BOX_STATES.map(
    (state) =>
      `<rect class="di-box-bg di-box-bg--${state}" x="${x}" y="${y}" width="${LANE.side}" height="${LANE.side}" rx="8" />`,
  ).join(pad(8));
  const r = BOX.ring;
  return `<g class="di-box di-box--${id}" data-di-box="${STAGE_STATE[`${id}@data-di-box`]}">
        ${plates}
        <rect class="di-box-ring" x="${x - r}" y="${y - r}" width="${LANE.side + 2 * r}" height="${LANE.side + 2 * r}" rx="${8 + r}" />
        <line class="di-box-strike" x1="${x + 6}" y1="${y + LANE.side - 6}" x2="${x + LANE.side - 6}" y2="${y + 6}" />
      </g>`;
};

/** One lifetime lane: its word, and the seven slots instances land in. */
const lane = (life: Lifetime, index: number): string => {
  const y = LANE.tops[index] ?? 0;
  return `<g>
      <text class="di-lane-word" x="${LANE.labelX}" y="${y + LANE.labelDy}">${life}</text>
      ${Array.from({ length: LANE_SLOTS }, (_v, n) => n)
        .map((n) => instanceBox(life, index, n))
        .join(pad(6))}
    </g>`;
};

/** One lamp: a plate per value it can show, and the fixed word on it. */
const lamp = (
  name: 'build' | 'dispose',
  geometry: { x: number; w: number; textX: number },
  states: readonly string[],
): string => {
  const plates = states
    .map(
      (state) =>
        `<rect class="di-lamp-bg di-lamp-bg--${name}-${state}" x="${geometry.x}" y="${LAMP.y}" width="${geometry.w}" height="${LAMP.h}" rx="${LAMP.rx}" />`,
    )
    .join(pad(6));
  return `<g class="di-lamp di-lamp--${name}">
      ${plates}
      <text class="di-lamp-word" x="${geometry.textX}" y="${LAMP.y + LAMP.textDy}" text-anchor="middle">${name}</text>
    </g>`;
};

const scopeOutline = SCOPES.map(
  (state) =>
    `<rect class="di-scope di-scope--${state}" x="${SCOPE.x}" y="${SCOPE.y}" width="${SCOPE.w}" height="${SCOPE.h}" rx="${SCOPE.rx}" />`,
).join(pad(4));

const stageAttrs = Object.entries(STAGE_STATE)
  .filter(([key]) => key.startsWith('stage@'))
  .map(([key, value]) => `${key.slice('stage@'.length)}="${value}"`)
  .join(' ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageAttrs} aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_LANE, Y_APP_BOTTOM, Y_CONTAINER_TOP, 'scene-link di-link--call')}
  ${verticalLink(X_LANE, Y_CONTAINER_BOTTOM, Y_INSTANCES_TOP, 'scene-link di-link--make')}

  ${serviceBox({
    x: APP.x,
    width: APP.w,
    y: APP.y,
    height: APP.h,
    title: 'App',
    titleX: APP_TITLE.x,
    titleY: APP_TITLE.y,
    titleClass: 'scene-node-title di-title',
    titleAnchor: null,
    className: 'scene-client di-app',
    children: `
    ${okReadout}

    ${CHIP_IDS.map((id, index) => requestSlot(id, index)).join(pad(4))}`,
  })}

  ${serviceBox({
    x: CONTAINER.x,
    width: CONTAINER.w,
    y: CONTAINER.y,
    height: CONTAINER.h,
    title: 'Container',
    titleX: CONTAINER_TITLE.x,
    titleY: CONTAINER_TITLE.y,
    titleClass: 'scene-node-title di-title',
    titleAnchor: null,
    className: 'scene-node di-container',
    children: `
    ${ROW_IDS.map((id, index) => registrationRow(id, index)).join(`\n\n    `)}

    ${ghost}

    ${tree}`,
  })}

  ${serviceBox({
    x: INSTANCES.x,
    width: INSTANCES.w,
    y: INSTANCES.y,
    height: INSTANCES.h,
    title: 'Instances',
    titleX: INSTANCES_TITLE.x,
    titleY: INSTANCES_TITLE.y,
    titleClass: 'scene-node-title di-title di-title--instances',
    titleAnchor: null,
    className: 'scene-service di-instances',
    children: `
    ${lamp('build', BUILD_LAMP, ['off', 'on'])}

    ${lamp('dispose', DISPOSE_LAMP, DISPOSE_STATES)}

    ${scopeOutline}

    ${LIFETIMES.map((life, index) => lane(life, index)).join(pad(4))}`,
  })}

  ${requestsLayer()}
</svg>`;
