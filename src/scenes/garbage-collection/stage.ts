/**
 * Static stage markup for the Garbage Collection scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. The bands are the usual ones, with
 * the node stretched and the bottom box extended because both of them hold a
 * table of small parts rather than a single widget:
 *   - y 0..400      above the cropped viewBox (see shared VIEWBOX)
 *   - y 400..440    the frame's top padding; nothing is drawn here
 *   - y 440..680    Threads: the allocation rate the request lanes are
 *                   producing, the code the hot path is running, and the hatch
 *                   that falls over the lanes while the collector has them
 *                   stopped
 *   - y 820..1330   Heap: how much the process is holding against the limit it
 *                   was given, and the generations themselves — gen0, gen1,
 *                   gen2 and the large object heap, each a row of squares that
 *                   fill from the left, plus the pool a rented buffer comes
 *                   from instead
 *   - y 1500..1840  GC events: one tick per collection on a 24 second axis,
 *                   what the last one cost, and the three readouts a service
 *                   actually watches
 *
 * Two lanes, each carrying traffic in one direction only. `X_ALLOC` is what the
 * threads hand down: one dot per sampled batch of allocation, absorbed by the
 * heap. `X_EVENT` is what the heap hands down in turn: one dot per collection,
 * absorbed by the event log. A dot therefore never meets another dot, because
 * the two lanes are 96px apart and each one is travelled in a single direction.
 *
 * Both lanes are vertical for their whole length and every segment drawn
 * between two boxes ends on a box edge. Nothing in any box is written right of
 * `CONTENT_RIGHT`, which is 34px clear of the left lane's halo, so a dot can
 * cross a box from top to bottom without coming near a label.
 *
 * The event axis is chart geometry, not a diagram: `x` is time, one slot per
 * 0.4 seconds of the scene, and a tick's height is which generation was
 * collected. The four short rows a tick splits into under Server GC are the
 * four heaps collecting in parallel, and they are row texture in the same sense
 * — the pitch is set by how many have to be seen at once.
 */

import {
  VIEWBOX,
  clientBox,
  counterVariants,
  nodeFrame,
  requestsLayer,
  serviceBox,
  trackAndFill,
  verticalLink,
} from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- lanes -----------------------------------------------------------------

/** The lane an allocation rides down, and the lane a collection is logged on. */
export const X_ALLOC = 810;
export const X_EVENT = 906;

/** Where a traveller starts and stops on each lane. */
export const Y_ALLOC_OUT = 640;
export const Y_HEAP = 1300;
export const Y_EVENT = 1630;

/** Pixels per second. One speed for everything, so distance reads as time. */
export const SPEED = 1800;

/** Nothing inside a box is written right of this, which keeps the lanes clear. */
const CONTENT_RIGHT = 750;

// --- the Threads box -------------------------------------------------------

const THREADS_Y = 440;
const THREADS_H = 240;

/** The gauge that reads the allocation rate, next to the counter above it. */
const GAUGE_X = 170;
export const GAUGE_W = 240;
const GAUGE_Y = 500;
const GAUGE_H = 18;

/** The chip holding whatever the hot path is doing to allocate. */
const CHIP_X = 430;
const CHIP_Y = 496;
const CHIP_W = 320;
const CHIP_H = 32;

/** The four request lanes, and the hatch that falls over all of them. */
export const LANE_COUNT = 4;
export const LANE_X = 170;
export const LANE_W = 330;
const LANE_H = 18;
const LANE_PITCH = 30;
const LANE_TOP = 544;
export const laneTop = (index: number): number => LANE_TOP + index * LANE_PITCH;
const HATCH_X = 166;
const HATCH_Y = 540;
const HATCH_W = LANE_W + 8;
const HATCH_H = LANE_COUNT * LANE_PITCH - LANE_PITCH + LANE_H + 8;

// --- the Heap node ---------------------------------------------------------

const HEAP_Y = 820;
const HEAP_H = 510;

/** The meter that reads how much the process is holding. */
const METER_X = 170;
export const METER_W = 400;
const METER_Y = 892;
const METER_H = 24;

/** The largest reading the meter can show, in megabytes. */
export const METER_MAX_MB = 560;
export const meterWidth = (mb: number): number =>
  Number(((METER_W * Math.max(0, Math.min(mb, METER_MAX_MB))) / METER_MAX_MB).toFixed(2));

/**
 * The container's memory limit, and the heap hard limit the collector derives
 * from it. Both are labelled, so both are the real numbers the model uses.
 */
export const CONTAINER_LIMIT_MB = 512;
export const HEAP_LIMIT_PCT = 75;
export const HEAP_LIMIT_MB = (CONTAINER_LIMIT_MB * HEAP_LIMIT_PCT) / 100;
const LIMIT_X = Number((METER_X + meterWidth(HEAP_LIMIT_MB)).toFixed(2));

/** The four heaps Server GC keeps, drawn as glyphs rather than redrawn rows. */
export const HEAP_GLYPHS = 4;
const GLYPH_X = 250;
const GLYPH_W = 30;
const GLYPH_PITCH = 36;
const GLYPH_Y = 930;
const GLYPH_H = 20;
const CAPTION_Y = 948;

/** The generations, each a row of squares that fills from the left. */
export const GEN0_SLOTS = 12;
export const GEN1_SLOTS = 6;
export const GEN2_SLOTS = 20;

const HEADER_Y = 1000;
const REGION_TOP = 1012;
const REGION_H = 62;
const SLOT_SIDE = 16;
const SLOT_PITCH = 22;
const SLOT_ROWS = [1020, 1050];
const SLOT_COLS = 2;

interface Region {
  x: number;
  width: number;
  slotX: number;
  cols: number;
}

const region = (x: number, cols: number): Region => ({
  x,
  width: cols * SLOT_PITCH + 20,
  slotX: x + 8,
  cols,
});

const GEN0 = region(150, GEN0_SLOTS / SLOT_COLS);
const GEN1 = region(310, GEN1_SLOTS / SLOT_COLS);
const GEN2 = region(402, GEN2_SLOTS / SLOT_COLS);

/** The large object heap: four blocks, because 85 KB and up goes straight here. */
export const LOH_SLOTS = 4;
const LOH_HEADER_Y = 1136;
const LOH_TOP = 1148;
const LOH_H = 54;
const LOH_BLOCK_X = 158;
const LOH_BLOCK_W = 84;
const LOH_BLOCK_PITCH = 96;
const LOH_BLOCK_Y = 1158;
const LOH_BLOCK_H = 34;

/** The pool a rented buffer comes from instead of the large object heap. */
export const POOL_SLOTS = 3;
const POOL_X = 566;
const POOL_SLOT_X = 574;
const POOL_SLOT_W = 50;
const POOL_PITCH = 60;

const PROMOTED_Y = 1256;

/**
 * How many megabytes one square of a generation stands for, and one LOH block.
 * A square is a sample of the population a generation holds, not a fixed
 * object: the byte figure the collector actually schedules on is the gen0
 * budget in `scene.ts`, and these two numbers are what the heap reading is
 * summed from.
 */
export const MB_PER_SLOT = 5;
export const MB_PER_BLOCK = 16;
/** What the runtime holds before a single object of the app is allocated. */
export const HEAP_BASE_MB = 20;
/** Server GC keeps one heap per core, which costs footprint for shorter pauses. */
export const SERVER_FOOTPRINT = 1.5;

// --- the GC events box -----------------------------------------------------

const EVENTS_Y = 1500;
const EVENTS_H = 340;

const MODE_Y = 1552;
const LAST_Y = 1596;

/** The time axis: one slot per 0.4 seconds, so a tick's x is when it happened. */
export const TICK_SLOTS = 60;
export const TICK_SECONDS = SCENE_DURATION / TICK_SLOTS;
const TICK_X0 = 152;
const TICK_PITCH = 10;
const TICK_W = 6;
const AXIS_X0 = 150;
const AXIS_X1 = 750;
const AXIS_Y = 1700;

/** Height of a single tick, by the generation that was collected. */
const TICK_H: Record<string, number> = { gen0: 24, gen1: 46, gen2: 86 };
/** The four rows a tick splits into when four heaps collect in parallel. */
const QUAD_H = 12;
const QUAD_PITCH = 24;

/** Which slot a collection at `t` is drawn in. */
export const tickSlot = (t: number): number =>
  Math.max(0, Math.min(TICK_SLOTS - 1, Math.round(t / TICK_SECONDS)));

const READOUT_Y = 1760;
const READOUT_2_Y = 1800;

// --- readouts --------------------------------------------------------------

/** Step of each readout, so a number walks rather than jumps. */
export const ALLOC_STEP = 10;
export const ALLOC_MAX = 600;
export const HEAP_STEP = 10;
export const HEAP_MAX = 600;
export const COUNT_MAX = 60;
export const PAUSE_STEP = 0.2;
export const PAUSE_MAX = 15;
export const P99_STEP = 5;
export const P99_MIN = 40;
export const P99_MAX = 300;

export const allocIndex = (mb: number): number =>
  Math.max(0, Math.min(ALLOC_MAX / ALLOC_STEP, Math.round(mb / ALLOC_STEP)));
export const heapIndex = (mb: number): number =>
  Math.max(0, Math.min(HEAP_MAX / HEAP_STEP, Math.round(mb / HEAP_STEP)));
export const countIndex = (n: number): number => Math.max(0, Math.min(COUNT_MAX, Math.round(n)));
export const pauseIndex = (pct: number): number =>
  Math.max(0, Math.min(PAUSE_MAX / PAUSE_STEP, Math.round(pct / PAUSE_STEP)));
export const p99Index = (ms: number): number =>
  Math.max(0, Math.min((P99_MAX - P99_MIN) / P99_STEP, Math.round((ms - P99_MIN) / P99_STEP)));

export const ALLOC_VARIANTS = ALLOC_MAX / ALLOC_STEP + 1;
export const HEAP_VARIANTS = HEAP_MAX / HEAP_STEP + 1;
export const COUNT_VARIANTS = COUNT_MAX + 1;
export const PAUSE_VARIANTS = PAUSE_MAX / PAUSE_STEP + 1;
export const P99_VARIANTS = (P99_MAX - P99_MIN) / P99_STEP + 1;

/** `pause 0%` rather than `pause 0.0%`, because zero is not a measurement. */
const pauseText = (n: number): string =>
  n === 0 ? 'pause 0%' : `pause ${(n * PAUSE_STEP).toFixed(1)}%`;

// --- what the hot path can be doing ---------------------------------------

/** The two things the code chip can say, and the source each one allocates from. */
export const SOURCES = ['new', 'pool'] as const;
export type Source = (typeof SOURCES)[number];
const SOURCE_TEXT: Record<Source, string> = {
  new: 'new byte[1 MB]',
  pool: 'ArrayPool + Span&lt;T&gt;',
};

/** The two collector modes, spelled the way the runtime switch spells them. */
export const MODES = ['workstation', 'server'] as const;
export type Mode = (typeof MODES)[number];
const MODE_TEXT: Record<Mode, string> = {
  workstation: 'Workstation GC',
  server: 'Server GC',
};

/** What the last collection cost, which is the tick's own label. */
export const LAST_GC = ['gen0', 'gen1', 'gen2', 'gen2-server'] as const;
export type LastGc = (typeof LAST_GC)[number];
const LAST_TEXT: Record<LastGc, string> = {
  gen0: 'gen0 &#183; 1 ms',
  gen1: 'gen1 &#183; 4 ms',
  gen2: 'gen2 &#183; 120 ms',
  'gen2-server': 'gen2 &#183; 60 ms',
};

/** Milliseconds each collection really costs, which is what the labels say. */
export const PAUSE_MS: Record<number, number> = { 0: 1, 1: 4, 2: 120 };
/** Server GC collects the four heaps in parallel, which halves a full pause. */
export const SERVER_PAUSE_FACTOR = 0.5;

/** How long the hatch is held, by generation, so a millisecond can be seen. */
export const HATCH_SECONDS: Record<number, number> = { 0: 0.1, 1: 0.1, 2: 0.6 };

// --- what the stage starts in ---------------------------------------------

/**
 * What every `data-*` on the stage starts at, keyed by the target the timeline
 * addresses it through. The markup below is written from this, so a change that
 * writes a value something already holds is dropped rather than tweened.
 */
export const STAGE_STATE: Record<string, string> = {
  // The three readings a warm process already has before the timeline runs, so
  // the diagram in the served HTML says the same thing as its first frame.
  'stage@data-alloc': '8',
  'stage@data-heap': '11',
  'stage@data-gccount': '0',
  'stage@data-pause': '0',
  'stage@data-tail': '1',
  'stage@data-stw': 'off',
  'stage@data-source': 'new',
  'stage@data-gcmode': 'workstation',
  'stage@data-hardlimit': 'off',
  'stage@data-oom': 'off',
  'stage@data-promoted': 'off',
  'stage@data-lastgc': 'none',
  ...Object.fromEntries(
    Array.from({ length: GEN0_SLOTS }, (_v, i) => [`gen0-${i}@data-obj`, 'empty']),
  ),
  ...Object.fromEntries(
    Array.from({ length: GEN1_SLOTS }, (_v, i) => [`gen1-${i}@data-obj`, 'empty']),
  ),
  ...Object.fromEntries(
    Array.from({ length: GEN2_SLOTS }, (_v, i) => [`gen2-${i}@data-obj`, 'empty']),
  ),
  ...Object.fromEntries(
    Array.from({ length: LOH_SLOTS }, (_v, i) => [`loh-${i}@data-block`, 'empty']),
  ),
  ...Object.fromEntries(
    Array.from({ length: POOL_SLOTS }, (_v, i) => [`pool-${i}@data-rent`, 'off']),
  ),
  ...Object.fromEntries(
    Array.from({ length: TICK_SLOTS }, (_v, i) => [`tick-${i}@data-gctick`, 'none']),
  ),
};

// --- markup ---------------------------------------------------------------

const stageState = Object.entries(STAGE_STATE)
  .filter(([key]) => key.startsWith('stage@'))
  .map(([key, value]) => `${key.slice('stage@'.length)}="${value}"`)
  .join(' ');

const lanes = Array.from(
  { length: LANE_COUNT },
  (_v, index) =>
    `<rect class="scene-track gc-lane-track gc-lane-track--${index}" x="${LANE_X}" y="${laneTop(index)}" width="${LANE_W}" height="${LANE_H}" rx="9" />
      <rect class="gc-lane-fill gc-lane-fill--${index}" x="${LANE_X}" y="${laneTop(index)}" width="0" height="${LANE_H}" rx="9" />`,
).join('\n      ');

const sourceTexts = SOURCES.map(
  (source) =>
    `<text class="scene-mono gc-code gc-code--${source}" x="${CHIP_X + 16}" y="${CHIP_Y + 23}">${SOURCE_TEXT[source]}</text>`,
).join('\n      ');

const allocCounter = counterVariants({
  x: CONTENT_RIGHT,
  y: 476,
  className: 'gc-alloc',
  count: ALLOC_VARIANTS,
  format: (n) => `alloc ${n * ALLOC_STEP} MB/s`,
  anchor: 'end',
  indent: 4,
});

const heapCounter = counterVariants({
  x: CONTENT_RIGHT,
  y: 872,
  className: 'gc-heapv',
  count: HEAP_VARIANTS,
  format: (n) => `heap ${n * HEAP_STEP} MB`,
  anchor: 'end',
  indent: 4,
});

const glyphs = Array.from(
  { length: HEAP_GLYPHS },
  (_v, index) =>
    `<rect class="gc-glyph gc-glyph--${index}" x="${GLYPH_X + index * GLYPH_PITCH}" y="${GLYPH_Y}" width="${GLYPH_W}" height="${GLYPH_H}" rx="6" />`,
).join('\n    ');

/** One generation's squares, filling from the left across two rows. */
const genSlots = (name: string, r: Region, count: number): string =>
  Array.from({ length: count }, (_v, index) => {
    const col = index % r.cols;
    const row = Math.floor(index / r.cols);
    return `<rect class="gc-obj gc-${name}-obj gc-${name}-obj--${index}" data-obj="empty" x="${r.slotX + col * SLOT_PITCH}" y="${SLOT_ROWS[row] ?? 0}" width="${SLOT_SIDE}" height="${SLOT_SIDE}" rx="4" />`;
  }).join('\n      ');

const lohBlocks = Array.from(
  { length: LOH_SLOTS },
  (_v, index) =>
    `<rect class="gc-block gc-block--${index}" data-block="empty" x="${LOH_BLOCK_X + index * LOH_BLOCK_PITCH}" y="${LOH_BLOCK_Y}" width="${LOH_BLOCK_W}" height="${LOH_BLOCK_H}" rx="8" />`,
).join('\n      ');

const poolSlots = Array.from(
  { length: POOL_SLOTS },
  (_v, index) =>
    `<rect class="gc-pool gc-pool--${index}" data-rent="off" x="${POOL_SLOT_X + index * POOL_PITCH}" y="${LOH_BLOCK_Y}" width="${POOL_SLOT_W}" height="${LOH_BLOCK_H}" rx="8" />`,
).join('\n      ');

const modeTexts = MODES.map(
  (mode) =>
    `<text class="scene-mono gc-mode gc-mode--${mode}" x="${CONTENT_RIGHT}" y="${MODE_Y}" text-anchor="end">${MODE_TEXT[mode]}</text>`,
).join('\n    ');

const lastTexts = LAST_GC.map(
  (last) =>
    `<text class="scene-mono gc-last gc-last--${last}" x="${CONTENT_RIGHT}" y="${LAST_Y}" text-anchor="end">${LAST_TEXT[last]}</text>`,
).join('\n    ');

/**
 * One slot of the event axis. It carries both drawings of the same collection:
 * one tick when a single heap was collected, four short ones when four heaps
 * were collected in parallel. Which is painted is a `data-gcmode` away.
 */
const tick = (index: number): string => {
  const x = TICK_X0 + index * TICK_PITCH - TICK_W / 2;
  const single = (['gen0', 'gen1', 'gen2'] as const)
    .map(
      (gen) =>
        `<rect class="gc-tick-one gc-tick-one--${gen}" x="${x}" y="${AXIS_Y - (TICK_H[gen] ?? 0)}" width="${TICK_W}" height="${TICK_H[gen] ?? 0}" rx="3" />`,
    )
    .join('\n        ');
  const quad = Array.from(
    { length: HEAP_GLYPHS },
    (_v, row) =>
      `<rect class="gc-tick-quad" x="${x}" y="${AXIS_Y - QUAD_H - row * QUAD_PITCH}" width="${TICK_W}" height="${QUAD_H}" rx="3" />`,
  ).join('\n        ');
  return `<g class="gc-tick gc-tick--${index}" data-gctick="none">
        ${single}
        ${quad}
      </g>`;
};

const countCounter = counterVariants({
  x: AXIS_X0,
  y: READOUT_Y,
  className: 'gc-count',
  count: COUNT_VARIANTS,
  format: (n) => `GC count ${n}`,
  indent: 4,
});

const pauseCounter = counterVariants({
  x: CONTENT_RIGHT,
  y: READOUT_Y,
  className: 'gc-pause',
  count: PAUSE_VARIANTS,
  format: pauseText,
  anchor: 'end',
  indent: 4,
});

const p99Counter = counterVariants({
  x: AXIS_X0,
  y: READOUT_2_Y,
  className: 'gc-tail',
  count: P99_VARIANTS,
  format: (n) => `p99 latency ${P99_MIN + n * P99_STEP} ms`,
  indent: 4,
});

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageState} aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  <defs>
    <pattern id="gc-stopped" width="16" height="16" patternUnits="userSpaceOnUse">
      <rect class="gc-hatch-bar" x="0" y="0" width="6" height="16" />
    </pattern>
  </defs>

  ${verticalLink(X_ALLOC, THREADS_Y + THREADS_H, HEAP_Y)}
  ${verticalLink(X_EVENT, HEAP_Y + HEAP_H, EVENTS_Y)}

  ${clientBox({
    x: 130,
    width: 820,
    y: THREADS_Y,
    height: THREADS_H,
    title: 'Threads',
    titleX: 170,
    titleY: 476,
    titleClass: 'scene-node-label',
    titleAnchor: null,
    extraClass: 'gc-threads',
    children: `
    ${allocCounter}
    ${trackAndFill({
      x: GAUGE_X,
      y: GAUGE_Y,
      width: GAUGE_W,
      height: GAUGE_H,
      rx: GAUGE_H / 2,
      className: 'gc-gauge',
      fillWidth: 0,
      indent: 4,
    })}
    <g class="gc-chip">
      <rect class="gc-chip-bg" x="${CHIP_X}" y="${CHIP_Y}" width="${CHIP_W}" height="${CHIP_H}" rx="12" />
      ${sourceTexts}
    </g>
    <g class="gc-lanes">
      ${lanes}
    </g>
    <rect class="gc-hatch" x="${HATCH_X}" y="${HATCH_Y}" width="${HATCH_W}" height="${HATCH_H}" rx="12" />
    <text class="scene-flash gc-stw" x="${CONTENT_RIGHT}" y="600" text-anchor="end">stop the world</text>`,
  })}

  ${nodeFrame({
    y: HEAP_Y,
    height: HEAP_H,
    label: 'Heap',
    labelY: 872,
    children: `    ${heapCounter}
    ${trackAndFill({
      x: METER_X,
      y: METER_Y,
      width: METER_W,
      height: METER_H,
      rx: METER_H / 2,
      className: 'gc-meter',
      fillWidth: 0,
      indent: 4,
    })}
    <line class="gc-limit-line" x1="${LIMIT_X}" y1="${METER_Y}" x2="${LIMIT_X}" y2="${METER_Y + METER_H}" />
    <text class="scene-flash gc-limit-label" x="${CONTENT_RIGHT}" y="${CAPTION_Y}" text-anchor="end">limit ${CONTAINER_LIMIT_MB} MB &#183; ${HEAP_LIMIT_PCT}%</text>

    <text class="scene-caption-label gc-caption" x="${GEN0.x}" y="${CAPTION_Y}">heaps</text>
    ${glyphs}

    <text class="scene-caption-label gc-caption" x="${GEN0.x}" y="${HEADER_Y}">gen0</text>
    <text class="scene-caption-label gc-caption" x="${GEN1.x}" y="${HEADER_Y}">gen1</text>
    <text class="scene-caption-label gc-caption" x="${GEN2.x}" y="${HEADER_Y}">gen2</text>
    <rect class="gc-region" x="${GEN0.x}" y="${REGION_TOP}" width="${GEN0.width}" height="${REGION_H}" rx="12" />
    <rect class="gc-region" x="${GEN1.x}" y="${REGION_TOP}" width="${GEN1.width}" height="${REGION_H}" rx="12" />
    <rect class="gc-region" x="${GEN2.x}" y="${REGION_TOP}" width="${GEN2.width}" height="${REGION_H}" rx="12" />
    <g class="gc-gen0">
      ${genSlots('gen0', GEN0, GEN0_SLOTS)}
    </g>
    <g class="gc-gen1">
      ${genSlots('gen1', GEN1, GEN1_SLOTS)}
    </g>
    <g class="gc-gen2">
      ${genSlots('gen2', GEN2, GEN2_SLOTS)}
    </g>

    <text class="scene-caption-label gc-caption" x="${GEN0.x}" y="${LOH_HEADER_Y}">LOH</text>
    <text class="scene-caption-label gc-caption" x="${POOL_X}" y="${LOH_HEADER_Y}">pool</text>
    <rect class="gc-region" x="${GEN0.x}" y="${LOH_TOP}" width="390" height="${LOH_H}" rx="12" />
    <rect class="gc-region" x="${POOL_X}" y="${LOH_TOP}" width="184" height="${LOH_H}" rx="12" />
    <g class="gc-loh">
      ${lohBlocks}
    </g>
    <g class="gc-pools">
      ${poolSlots}
    </g>

    <text class="scene-flash gc-promoted" x="${GEN0.x}" y="${PROMOTED_Y}">promoted</text>`,
  })}

  <rect class="gc-oom-frame" x="130" y="${HEAP_Y}" width="820" height="${HEAP_H}" rx="28" />

  ${serviceBox({
    x: 130,
    width: 820,
    y: EVENTS_Y,
    height: EVENTS_H,
    className: 'scene-service gc-events',
    title: 'GC events',
    titleX: 170,
    titleY: MODE_Y,
    titleClass: 'scene-node-label',
    titleAnchor: null,
    children: `
    ${modeTexts}
    <text class="scene-flash gc-parallel" x="${AXIS_X0}" y="${LAST_Y}">parallel</text>
    ${lastTexts}

    <line class="gc-axis" x1="${AXIS_X0}" y1="${AXIS_Y}" x2="${AXIS_X1}" y2="${AXIS_Y}" />
    <g class="gc-ticks">
      ${Array.from({ length: TICK_SLOTS }, (_v, index) => tick(index)).join('\n      ')}
    </g>

    ${countCounter}
    ${pauseCounter}
    ${p99Counter}
    <text class="scene-flash gc-oom" x="${CONTENT_RIGHT}" y="${READOUT_2_Y}" text-anchor="end">OOM</text>
    <g class="gc-mark gc-mark--fail">
      <path class="gc-mark-glyph" d="M 650 1782 L 674 1798 M 674 1782 L 650 1798" />
    </g>
    <g class="gc-mark gc-mark--ok">
      <path class="gc-mark-glyph" d="M 650 1791 L 658 1798 L 676 1780" />
    </g>`,
  })}

  ${requestsLayer()}
</svg>`;
