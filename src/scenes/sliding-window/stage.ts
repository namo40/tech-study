/**
 * Static stage markup for the Sliding Window scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Three bands, read top to bottom as
 * the traffic offered, the geometry that judges it, and the shape of what came
 * out the other side:
 *   - y 0..400       above the cropped viewBox (see shared VIEWBOX)
 *   - y 400..440     the frame's top padding; nothing is drawn here
 *   - y 440..680     Requests (x 130..950): one chip per request in arrival
 *                    order, and the running `ok n` and `drop n` readouts
 *   - y 880..1270    Window (x 130..950): the `limit 4` gauge, the `now` mark
 *                    that walks the time track, the window itself drawn four
 *                    ways (clock-aligned partitions, a band anchored at `now`,
 *                    two weighted segments, and no window at all), a tick on
 *                    the track for every arrival, and on the right the panel
 *                    that says what the limiter has to remember
 *   - y 1500..1740   Out (x 280..800): the `bucket` with its level and its
 *                    `leak`, and under it the band the departures land on
 *
 * Two lane segments and no others, both axis aligned and both ending on a box
 * edge:
 *   - `X_LANE` (540) between the Requests band's bottom edge at 680 and the
 *     Window band's top edge at 880, downward: a request on its way to be
 *     judged. It carries its verdict when it lands.
 *   - `X_LANE` (540) between the Window band's bottom edge at 1270 and the Out
 *     band's top edge at 1500, downward: a request that was admitted. A request
 *     that was not admitted never rides this segment; it is a state on the
 *     track and in its chip, and nothing travels.
 *
 * A traveller is a dot with a halo of r 26, so a lane sweeps a 52px band. The
 * upper segment sweeps y 654..906 at x 514..566, so the Requests band writes
 * nothing below y 624 in that column and the Window band nothing above y 936 in
 * it. The lower segment sweeps y 1244..1526 at the same x, so the Window band
 * writes nothing below y 1214 in that column and the Out band nothing above
 * y 1526 in it.
 *
 * Declared texture: the time track and its arrival ticks, the four window
 * drawings, the seam bracket, the `limit 4` gauge, the memory panel, the chip
 * plates and their glyphs, the bucket walls and level, the leak bead, and the
 * output band with its notches. Everything else on the stage is a word, and
 * every word is one of the nine fixed labels or a number.
 *
 * Nothing is told apart by colour alone. An arrival that has not happened yet
 * is a **short stub straddling the track**; one that was admitted is a **tall
 * tick standing above the track with a cap**; one that was dropped is a
 * **dashed tick hanging below the track with a bar across its foot**. The
 * clock-aligned window is **dashed walls with the live partition filled**; the
 * sliding window is **one solid band whose right edge is `now`**; the
 * approximation is **the same walls with the previous segment hatched beside
 * the filled current one**; the bucket step draws **a flat rule and no window
 * at all**. The gauge is **a dashed hollow bar under the limit, a solid bar at
 * it, a solid bar with a hatched overhang past it, and a solid bar with a long
 * overhang and a ring around it at twice the limit**. A departure slot is a
 * **short notch on the band's rule**; a departure is a **full-height tick**.
 *
 * Every value the reader can read is a stack of elements on one spot with a
 * base rule hiding all of them and the current `data-*` revealing exactly one,
 * so nothing is interpolated and scrubbing backwards lands on the value rather
 * than on an average of two: the `ok n` and `drop n` readouts, each chip's
 * three plates, each arrival tick's three shapes, the four window drawings and
 * the three partitions inside two of them, the four gauge states, the four
 * memory panels, the four bucket levels, the two rim states, the two leak
 * beads, and each output notch's two shapes. The only continuous quantities on
 * the stage are the `now` mark walking the track and the sliding band's edge
 * following it, which is the one thing in the scene that really is continuous.
 */

import { VIEWBOX, requestsLayer, serviceBox, verticalLink } from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- the rules the scene is judged by --------------------------------------

/** Window length, in seconds of the track's own clock. */
export const WINDOW = 1.6;
/** How many requests a window may hold. The stage says this in words. */
export const LIMIT = 4;
/** How many requests the bucket holds before it overflows. */
export const CAPACITY = 3;
/** Seconds between drips while the bucket has anything in it. */
export const LEAK = 0.32;

// --- geometry ---------------------------------------------------------------

/** The column both lane segments run down, and the edges they run between. */
export const X_LANE = 540;
export const Y_REQ_BOTTOM = 680;
export const Y_WIN_TOP = 880;
export const Y_WIN_BOTTOM = 1270;
export const Y_OUT_TOP = 1500;

/** The Requests band: a chip per request, and what happened to each. */
const REQ = { x: 130, y: 440, w: 820, h: 240 };
const REQ_TITLE = { x: 152, y: 506 };
const OK = { x: 920, y: 506 };
const DROP = { x: 700, y: 506 };
const CHIP = { x0: 230, step: 55, w: 40, h: 40, y: 578, rx: 12 };

/** The Window band. */
const WIN = { x: 130, y: 880, w: 820, h: 390 };
const WIN_TITLE = { x: 152, y: 938 };
const LIMIT_WORD = { x: 920, y: 938 };
const GAUGE = { x: 784, y: 964, w: 100, h: 16, rx: 8, over: 35, double: 52 };

/** The time track: `TRACK_X0` is track time 0 and every second is `PPS` wide. */
export const TRACK_X0 = 180;
export const PPS = 120;
/** Track time the `now` mark walks to, and the x it ends on. */
export const SWEEP = 4.5;
export const TRACK_X1 = TRACK_X0 + PPS * SWEEP;
/** x of track time `t`. */
export const trackX = (t: number): number => Number((TRACK_X0 + PPS * t).toFixed(2));

const AXIS_Y = 1170;
const BAND = { y: 1040, h: 100 };
const WALL = { y0: 1036, y1: 1162 };
const TICK = {
  w: 6,
  offY: 1164,
  offH: 12,
  okY: 1136,
  okH: 34,
  capY: 1130,
  capR: 5,
  dropY: 1170,
  dropH: 30,
  barY: 1200,
  barW: 9,
};
const SEAM = { y: 1126, h: 80 };
const NOW = { wordY: 1012, capY0: 1036, capY1: 1048, lineY0: 1048, lineY1: 1195, capW: 11 };
const PANEL = { x: 806, y: 1010, w: 124, h: 190 };

/** The Out band: the bucket, its leak, and the band departures land on. */
const OUT = { x: 280, y: 1500, w: 520, h: 240 };
const OUT_TITLE = { x: 300, y: 1562 };
const BUCKET_WORD = { x: 300, y: 1626 };
const BUCKET = { x0: 430, x1: 650, y0: 1590, y1: 1678, fx0: 438, fx1: 642, floor: 1674 };
const LEVEL_TOP = [1668, 1644, 1616, 1592];
const SPOUT = { x0: 650, x1: 678, y: 1668, beadX: 694, beadR: 7 };
const LEAK_WORD = { x: 716, y: 1680 };
const OUTBAND = { x0: 320, x1: 640, y: 1713, top: 1700, h: 26 };
/** x of track time `t` on the output band, which shares the track's clock. */
export const outX = (t: number): number =>
  Number((OUTBAND.x0 + ((OUTBAND.x1 - OUTBAND.x0) * t) / SWEEP).toFixed(2));

// --- what the stage can say about itself ------------------------------------

/**
 * How the window is being worked out.
 *  - `fixed` counts inside the partition the clock is currently in.
 *  - `slide` counts the arrivals inside the last `WINDOW` seconds from `now`.
 *  - `approx` keeps two segment counters and weighs the previous one.
 *  - `bucket` has no window at all; a bucket decides instead.
 */
export const MODES = ['fixed', 'slide', 'approx', 'bucket'] as const;
export type Mode = (typeof MODES)[number];

/** Which clock-aligned segment `now` is in, for the two modes that draw them. */
export const PARTS = ['0', '1', '2'] as const;

/** What one request's chip says: not yet, admitted, dropped. */
export const CHIP_STATES = ['off', 'ok', 'drop'] as const;
export type ChipState = (typeof CHIP_STATES)[number];

/** What one arrival's tick on the track says. Same three facts, drawn as shape. */
export const TICK_STATES = ['off', 'ok', 'drop'] as const;

/**
 * What the gauge says about the last `WINDOW` seconds, whatever the limiter
 * itself believes: under the limit, exactly at it, past it, or at twice it.
 */
export const GAUGE_STATES = ['under', 'at', 'over', 'double'] as const;
export type GaugeState = (typeof GAUGE_STATES)[number];

/**
 * What the limiter has to keep. `counter` is one number per partition, `log` is
 * a timestamp per arrival, `approx` is two numbers and a weight, `level` is the
 * depth of the bucket.
 */
export const PANELS = ['counter', 'log', 'approx', 'level'] as const;
export type Panel = (typeof PANELS)[number];

/** What the scene is holding up for a moment, drawn on the thing it is about. */
export const MARKS = ['none', 'wall', 'now', 'band', 'hold', 'ledger'] as const;
export type Mark = (typeof MARKS)[number];

/** The highest `ok n` and `drop n` the readouts are ever asked for. */
export const OK_MAX = 10;
export const DROP_MAX = 4;

/** Arrival ticks and chips: one per request in the pattern the scene replays. */
export const ARRIVALS = [0.85, 1.05, 1.3, 1.55, 1.65, 1.9, 2.15, 2.4, 3.0, 3.35, 3.7];

/** Where a departure can land, per the two rhythms the scene produces. */
export const DEPARTURE_ROWS: Record<'arr' | 'drip', number[]> = {
  arr: ARRIVALS,
  drip: [1.17, 1.49, 1.81, 2.13, 2.45, 2.77, 3.09, 3.41, 3.73, 4.05],
};

/**
 * What every `data-*` on the stage starts at. The markup below is written from
 * this, so the opening frame is the whole diagram in its starting state — a
 * clock-aligned window drawn over an empty track, `now` parked at the left end,
 * a gauge under the limit, one counter's worth of memory, an empty bucket, an
 * output band showing where a departure could land and none that has, and
 * nothing in flight — and the timeline never restates a value already there.
 */
export const STAGE_STATE: Record<string, string> = {
  'stage@data-sw-mode': 'fixed',
  'stage@data-sw-part': '0',
  'stage@data-sw-gauge': 'under',
  'stage@data-sw-panel': 'counter',
  'stage@data-sw-seam': 'off',
  'stage@data-sw-out': 'arr',
  'stage@data-sw-level': '0',
  'stage@data-sw-spill': 'off',
  'stage@data-sw-leak': 'idle',
  'stage@data-sw-ok': '0',
  'stage@data-sw-drop': '0',
  'stage@data-sw-mark': 'none',
  'stage@data-sw-settled': 'off',
};

// --- markup -----------------------------------------------------------------

/** Newline plus `n` spaces, the separator between lines of one fragment. */
const pad = (n: number): string => `\n${' '.repeat(n)}`;

/** Non-breaking spaces, so a monospaced readout keeps its gaps in SVG. */
const mono = (text: string): string => text.replace(/ /g, '&#160;');

/** One spot, one text per value it can hold. Exactly one is ever revealed. */
const readout = (
  x: number,
  y: number,
  className: string,
  max: number,
  format: (value: number) => string,
  indent: number,
): string =>
  Array.from({ length: max + 1 }, (_v, n) => n)
    .map(
      (n) =>
        `<text class="scene-counter ${className} ${className}--${n}" x="${x}" y="${y}" text-anchor="end">${mono(format(n))}</text>`,
    )
    .join(pad(indent));

/** One request, in arrival order: a plate that says what happened to it. */
const chips = ARRIVALS.map((_value, index) => {
  const x = CHIP.x0 + index * CHIP.step - CHIP.w / 2;
  const plates = CHIP_STATES.map(
    (state) =>
      `<rect class="sw-chip-bg sw-chip-bg--${state}" x="${x}" y="${CHIP.y}" width="${CHIP.w}" height="${CHIP.h}" rx="${CHIP.rx}" />`,
  ).join(pad(8));
  const cx = x + CHIP.w / 2;
  const cy = CHIP.y + CHIP.h / 2;
  return `<g class="sw-chip sw-chip--${index}" data-sw-chip="off">
        ${plates}
        <path class="sw-chip-glyph sw-chip-glyph--ok" d="M ${cx - 9} ${cy} L ${cx - 3} ${cy + 7} L ${cx + 9} ${cy - 8}" />
        <path class="sw-chip-glyph sw-chip-glyph--drop" d="M ${cx - 8} ${cy - 8} L ${cx + 8} ${cy + 8} M ${cx + 8} ${cy - 8} L ${cx - 8} ${cy + 8}" />
      </g>`;
}).join(pad(6));

/** One arrival on the track: a stub, a tick standing up, or one hanging down. */
const ticks = ARRIVALS.map((at, index) => {
  const x = trackX(at);
  const left = x - TICK.w / 2;
  return `<g class="sw-tick sw-tick--${index}" data-sw-tick="off">
        <rect class="sw-tick-off" x="${left}" y="${TICK.offY}" width="${TICK.w}" height="${TICK.offH}" rx="3" />
        <g class="sw-tick-ok">
          <rect class="sw-tick-ok-bar" x="${left}" y="${TICK.okY}" width="${TICK.w}" height="${TICK.okH}" rx="3" />
          <circle class="sw-tick-ok-cap" cx="${x}" cy="${TICK.capY}" r="${TICK.capR}" />
        </g>
        <g class="sw-tick-drop">
          <rect class="sw-tick-drop-bar" x="${left}" y="${TICK.dropY}" width="${TICK.w}" height="${TICK.dropH}" rx="3" />
          <line class="sw-tick-drop-foot" x1="${x - TICK.barW}" y1="${TICK.barY}" x2="${x + TICK.barW}" y2="${TICK.barY}" />
        </g>
      </g>`;
}).join(pad(6));

/** The three clock-aligned segments, as x ranges on the track. */
const SEGMENTS = [0, 1, 2].map((n) => ({
  x0: trackX(n * WINDOW),
  x1: trackX((n + 1) * WINDOW),
}));

/** The walls a clock-aligned window resets on, drawn for the two modes with them. */
const walls = [0, 1, 2, 3]
  .map(
    (n) =>
      `<line class="sw-wall" x1="${trackX(n * WINDOW)}" y1="${WALL.y0}" x2="${trackX(n * WINDOW)}" y2="${WALL.y1}" />`,
  )
  .join(pad(8));

const segmentRects = (kind: string): string =>
  SEGMENTS.map(
    (seg, n) =>
      `<rect class="sw-seg sw-seg--${kind} sw-seg--${kind}-${n}" x="${seg.x0}" y="${BAND.y}" width="${(seg.x1 - seg.x0).toFixed(2)}" height="${BAND.h}" />`,
  ).join(pad(8));

/** The window, drawn the four ways the scene works it out. Exactly one shows. */
const windows = `<g class="sw-win sw-win--fixed">
        ${segmentRects('live')}
        ${walls}
      </g>

      <g class="sw-win sw-win--slide">
        <rect class="sw-band" x="${TRACK_X0}" y="${BAND.y}" width="0" height="${BAND.h}" />
      </g>

      <g class="sw-win sw-win--approx">
        ${segmentRects('prev')}
        ${segmentRects('curr')}
        ${walls}
      </g>

      <g class="sw-win sw-win--bucket">
        <line class="sw-norule" x1="${TRACK_X0}" y1="${BAND.y + BAND.h / 2}" x2="${TRACK_X1}" y2="${BAND.y + BAND.h / 2}" />
      </g>`;

/** The four things the gauge can say about the last `WINDOW` seconds. */
const gauge = `<g class="sw-gauge">
      <rect class="sw-gauge-bar sw-gauge-bar--under" x="${GAUGE.x}" y="${GAUGE.y}" width="${GAUGE.w}" height="${GAUGE.h}" rx="${GAUGE.rx}" />
      <rect class="sw-gauge-bar sw-gauge-bar--at" x="${GAUGE.x}" y="${GAUGE.y}" width="${GAUGE.w}" height="${GAUGE.h}" rx="${GAUGE.rx}" />
      <g class="sw-gauge-over">
        <rect class="sw-gauge-full" x="${GAUGE.x}" y="${GAUGE.y}" width="${GAUGE.w}" height="${GAUGE.h}" rx="${GAUGE.rx}" />
        <rect class="sw-gauge-spill" x="${GAUGE.x + GAUGE.w}" y="${GAUGE.y}" width="${GAUGE.over}" height="${GAUGE.h}" rx="${GAUGE.rx}" />
      </g>
      <g class="sw-gauge-double">
        <rect class="sw-gauge-full" x="${GAUGE.x}" y="${GAUGE.y}" width="${GAUGE.w}" height="${GAUGE.h}" rx="${GAUGE.rx}" />
        <rect class="sw-gauge-spill" x="${GAUGE.x + GAUGE.w}" y="${GAUGE.y}" width="${GAUGE.double}" height="${GAUGE.h}" rx="${GAUGE.rx}" />
        <rect class="sw-gauge-ring" x="${GAUGE.x - 8}" y="${GAUGE.y - 8}" width="${GAUGE.w + GAUGE.double + 16}" height="${GAUGE.h + 16}" rx="16" />
      </g>
    </g>`;

/** What the limiter has to remember, drawn as the shape of the memory. */
const panelRows = [0, 1, 2, 3, 4, 5]
  .map(
    (n) =>
      `<rect class="sw-panel-row" x="${PANEL.x + 16}" y="${PANEL.y + 22 + n * 28}" width="${PANEL.w - 32}" height="14" rx="7" />`,
  )
  .join(pad(8));

const panels = `<g class="sw-panel sw-panel--counter">
        <rect class="sw-panel-cell" x="${PANEL.x + 26}" y="${PANEL.y + 68}" width="${PANEL.w - 52}" height="54" rx="12" />
      </g>

      <g class="sw-panel sw-panel--log">
        ${panelRows}
      </g>

      <g class="sw-panel sw-panel--approx">
        <rect class="sw-panel-cell sw-panel-cell--prev" x="${PANEL.x + 14}" y="${PANEL.y + 68}" width="48" height="54" rx="12" />
        <rect class="sw-panel-cell" x="${PANEL.x + 70}" y="${PANEL.y + 68}" width="48" height="54" rx="12" />
        <path class="sw-panel-wedge" d="M ${PANEL.x + 14} ${PANEL.y + 146} L ${PANEL.x + 62} ${PANEL.y + 146} L ${PANEL.x + 62} ${PANEL.y + 132} Z" />
      </g>

      <g class="sw-panel sw-panel--level">
        <rect class="sw-panel-cell" x="${PANEL.x + 48}" y="${PANEL.y + 40}" width="36" height="110" rx="12" />
      </g>`;

/** The bucket: four levels on one spot, a rim that can be spilling, a spout. */
const levels = LEVEL_TOP.map(
  (top, n) =>
    `<rect class="sw-level sw-level--${n}" x="${BUCKET.fx0}" y="${top}" width="${BUCKET.fx1 - BUCKET.fx0}" height="${BUCKET.floor - top}" rx="${n === 0 ? 3 : 8}" />`,
).join(pad(6));

const bucket = `<g class="sw-bucket">
      ${levels}
      <path class="sw-bucket-wall" d="M ${BUCKET.x0} ${BUCKET.y0} L ${BUCKET.x0} ${BUCKET.y1 - 24} Q ${BUCKET.x0} ${BUCKET.y1} ${BUCKET.x0 + 24} ${BUCKET.y1} L ${BUCKET.x1 - 24} ${BUCKET.y1} Q ${BUCKET.x1} ${BUCKET.y1} ${BUCKET.x1} ${BUCKET.y1 - 24} L ${BUCKET.x1} ${BUCKET.y0}" />
      <line class="sw-rim sw-rim--plain" x1="${BUCKET.x0}" y1="${BUCKET.y0}" x2="${BUCKET.x1}" y2="${BUCKET.y0}" />
      <g class="sw-rim sw-rim--spill">
        <line class="sw-rim-line" x1="${BUCKET.x0}" y1="${BUCKET.y0}" x2="${BUCKET.x1}" y2="${BUCKET.y0}" />
        <path class="sw-rim-splash" d="M ${BUCKET.x0 + 34} ${BUCKET.y0 - 6} L ${BUCKET.x0 + 48} ${BUCKET.y0 - 22} L ${BUCKET.x0 + 62} ${BUCKET.y0 - 6} M ${BUCKET.x1 - 62} ${BUCKET.y0 - 6} L ${BUCKET.x1 - 48} ${BUCKET.y0 - 22} L ${BUCKET.x1 - 34} ${BUCKET.y0 - 6}" />
      </g>
      <line class="sw-spout" x1="${SPOUT.x0}" y1="${SPOUT.y}" x2="${SPOUT.x1}" y2="${SPOUT.y}" />
      <circle class="sw-bead sw-bead--idle" cx="${SPOUT.beadX}" cy="${SPOUT.y}" r="${SPOUT.beadR}" />
      <circle class="sw-bead sw-bead--drip" cx="${SPOUT.beadX}" cy="${SPOUT.y}" r="${SPOUT.beadR}" />
    </g>`;

/** The band a departure lands on: a notch where one could, a tick where one did. */
const outRow = (kind: 'arr' | 'drip'): string =>
  DEPARTURE_ROWS[kind]
    .map((at, index) => {
      const x = outX(at);
      return `<g class="sw-out sw-out--${kind}-${index}" data-sw-out-hit="off">
          <rect class="sw-out-slot" x="${x - 2}" y="${OUTBAND.y - 4}" width="4" height="8" rx="2" />
          <rect class="sw-out-tick" x="${x - 2}" y="${OUTBAND.top}" width="4" height="${OUTBAND.h}" rx="2" />
        </g>`;
    })
    .join(pad(8));

const outBand = `<g class="sw-outband">
      <line class="sw-out-rule" x1="${OUTBAND.x0}" y1="${OUTBAND.y}" x2="${OUTBAND.x1}" y2="${OUTBAND.y}" />
      <g class="sw-outrow sw-outrow--arr">
        ${outRow('arr')}
      </g>
      <g class="sw-outrow sw-outrow--drip">
        ${outRow('drip')}
      </g>
    </g>`;

/** The rings the scene draws round whatever it is pointing at. */
const marks = `<g class="sw-mark sw-mark--wall">
      <rect class="sw-ring" x="${TRACK_X0 - 14}" y="${WALL.y0 - 12}" width="${TRACK_X1 - TRACK_X0 + 28}" height="${WALL.y1 - WALL.y0 + 24}" rx="26" />
    </g>
    <g class="sw-mark sw-mark--band">
      <rect class="sw-ring" x="${TRACK_X0 - 14}" y="${BAND.y - 12}" width="${TRACK_X1 - TRACK_X0 + 28}" height="${BAND.h + 24}" rx="26" />
    </g>
    <g class="sw-mark sw-mark--hold">
      <rect class="sw-ring" x="${GAUGE.x - 18}" y="894" width="${GAUGE.w + GAUGE.double + 18}" height="${GAUGE.y + GAUGE.h + 12 - 894}" rx="22" />
    </g>
    <g class="sw-mark sw-mark--ledger">
      <rect class="sw-ring" x="${PANEL.x - 8}" y="${PANEL.y - 8}" width="${PANEL.w + 16}" height="${PANEL.h + 16}" rx="22" />
    </g>`;

const stageAttrs = Object.entries(STAGE_STATE)
  .map(([key, value]) => `${key.slice('stage@'.length)}="${value}"`)
  .join(' ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageAttrs} aria-hidden="true" focusable="false">
  <defs>
    <pattern id="sw-hatch" width="14" height="14" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
      <line class="sw-hatch-line" x1="0" y1="0" x2="0" y2="14" stroke-width="6" />
    </pattern>
  </defs>

  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_LANE, Y_REQ_BOTTOM, Y_WIN_TOP, 'scene-link sw-lane--in')}
  ${verticalLink(X_LANE, Y_WIN_BOTTOM, Y_OUT_TOP, 'scene-link sw-lane--pass')}

  ${serviceBox({
    x: REQ.x,
    width: REQ.w,
    y: REQ.y,
    height: REQ.h,
    title: 'Requests',
    titleX: REQ_TITLE.x,
    titleY: REQ_TITLE.y,
    titleClass: 'scene-node-title sw-title',
    titleAnchor: null,
    className: 'scene-client sw-requests',
    children: `
    ${readout(OK.x, OK.y, 'sw-ok', OK_MAX, (n) => `ok ${n}`, 4)}

    ${readout(DROP.x, DROP.y, 'sw-drop', DROP_MAX, (n) => `drop ${n}`, 4)}

    <g class="sw-chips">
      ${chips}
    </g>`,
  })}

  ${serviceBox({
    x: WIN.x,
    width: WIN.w,
    y: WIN.y,
    height: WIN.h,
    title: 'Window',
    titleX: WIN_TITLE.x,
    titleY: WIN_TITLE.y,
    titleClass: 'scene-node-title sw-title',
    titleAnchor: null,
    className: 'scene-node sw-window',
    children: `
    <text class="scene-mono sw-limit-word" x="${LIMIT_WORD.x}" y="${LIMIT_WORD.y}" text-anchor="end">limit 4</text>
    ${gauge}

    <g class="sw-track">
      <line class="sw-axis" x1="${TRACK_X0}" y1="${AXIS_Y}" x2="${TRACK_X1}" y2="${AXIS_Y}" />

      ${windows}

      <rect class="sw-seam" x="${trackX(2.4) - PPS * WINDOW}" y="${SEAM.y}" width="${PPS * WINDOW}" height="${SEAM.h}" rx="18" />

      ${ticks}
    </g>

    <g class="sw-now">
      <text class="scene-mono sw-now-word" x="${TRACK_X0}" y="${NOW.wordY}" text-anchor="middle">now</text>
      <path class="sw-now-cap" d="M ${TRACK_X0 - NOW.capW} ${NOW.capY0} L ${TRACK_X0 + NOW.capW} ${NOW.capY0} L ${TRACK_X0} ${NOW.capY1} Z" />
      <line class="sw-now-line" x1="${TRACK_X0}" y1="${NOW.lineY0}" x2="${TRACK_X0}" y2="${NOW.lineY1}" />
      <g class="sw-mark sw-mark--now">
        <rect class="sw-ring" x="${TRACK_X0 - 36}" y="${NOW.wordY - 40}" width="72" height="${1210 - (NOW.wordY - 40)}" rx="30" />
      </g>
    </g>

    <g class="sw-panels">
      ${panels}
    </g>

    ${marks}`,
  })}

  ${serviceBox({
    x: OUT.x,
    width: OUT.w,
    y: OUT.y,
    height: OUT.h,
    title: 'Out',
    titleX: OUT_TITLE.x,
    titleY: OUT_TITLE.y,
    titleClass: 'scene-node-title sw-title',
    titleAnchor: null,
    className: 'scene-service sw-outbox',
    children: `
    <text class="scene-mono sw-bucket-word" x="${BUCKET_WORD.x}" y="${BUCKET_WORD.y}">bucket</text>
    <text class="scene-mono sw-leak-word" x="${LEAK_WORD.x}" y="${LEAK_WORD.y}">leak</text>

    ${bucket}

    ${outBand}`,
  })}

  ${requestsLayer()}
</svg>`;
