/**
 * Static stage markup for the I/O Completion Port scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Three bands, read as one sentence
 * about what a waiting operation costs:
 *   - y 0..440       kept empty for the step title card
 *   - y 440..680     Requests (x 130..950): the `ok n` readout counting work
 *                    that came back, and the backlog of requests that arrived
 *                    with nothing left to serve them
 *   - y 880..1270    Threads (x 130..950): the four pool slots `T1`..`T4`, each
 *                    reading `free`, running code, or held by a wait, plus the
 *                    `limit` badge the fourth step turns on
 *   - y 1500..1740   IO (x 280..800): the `disk` and `net` cards, each carrying
 *                    three progress bars so several operations can be in flight
 *                    at once, and the `port` card holding the completion packets
 *                    that have landed and not yet been picked up
 *
 * Two lane segments and no others, both axis aligned and both ending on a box
 * edge:
 *   - `X_LANE` (540) between the Requests band's bottom edge at 680 and the
 *     Threads band's top edge at 880. It runs both ways: a request rides it down
 *     to the pool, and the same request rides it back up once its continuation
 *     has run.
 *   - `X_LANE` (540) between the Threads band's bottom edge at 1270 and the IO
 *     band's top edge at 1500. This one runs both ways as well, and the two
 *     directions are the whole subject: a start rides down to be registered, and
 *     a completion packet rides back up when a thread picks it up.
 *
 * What happens inside a band is not a traveller. A thread holding a request is
 * a slot state, an operation the OS is running is a progress bar, and a packet
 * waiting on the port is a packet in the queue, because the point of the scene
 * is that none of those three things is a thread going anywhere.
 *
 * A traveller is a dot with a halo of r 26, so the lane sweeps a 52px band and
 * everything written beside it keeps 30px off it. The upper lane sweeps
 * y 654..906 at x 514..566 and the lower one y 1244..1526 at the same x, so the
 * Requests band writes nothing below y 624 in that column, the Threads band
 * nothing above y 936 or below y 1214 in it, and the IO band nothing above
 * y 1556 in it. Both lanes carry traffic in both directions, so the timeline
 * measures the gap between every pair of travellers on a lane across directions
 * rather than assuming one.
 *
 * Declared texture: the four thread slots and their state bars, the `limit`
 * badge and its gate posts, the three IO cards, the six progress bars, the
 * packet slots on the `port` card and the packets in them, and the backlog pips
 * in the Requests band. Everything else on the stage is a word, and every word
 * is one of the thirteen fixed labels or a number.
 *
 * Nothing is told apart by colour alone. A slot that is `free` is a **hollow
 * dashed plate carrying the word**; one that is running code is a **filled plate
 * with a solid bar**; one that is held by a wait is a **hatched plate with a
 * hollow dashed bar**. A progress bar that is idle is an **empty track** and a
 * running one is a **track with a fill in it**. A packet slot that is empty is a
 * **dashed outline** and a full one is a **filled block**. The `limit` badge is
 * **dashed with no posts** until it is on and **filled with a post either side**
 * afterwards. The `port` card is **dashed** while the ghost is up, because in a
 * blocking world there is no port at all.
 *
 * Every value the reader can read is a stack of elements on one spot with a base
 * rule hiding all of them and the current `data-*` revealing exactly one, so
 * nothing is interpolated and scrubbing backwards lands on the value rather than
 * on an average of two: the `ok n` readout, the backlog, each slot's plate and
 * each slot's contents, each progress bar's fill, the packet queue, and the
 * `limit` badge. There is no continuous quantity anywhere on this stage.
 */

import { VIEWBOX, requestsLayer, serviceBox, verticalLink } from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- geometry --------------------------------------------------------------

/** The one column anything travels on, and the four edges it runs between. */
export const X_LANE = 540;
export const Y_REQUESTS_BOTTOM = 680;
export const Y_THREADS_TOP = 880;
export const Y_THREADS_BOTTOM = 1270;
export const Y_IO_TOP = 1500;

/** The Requests band: what came back, and what is standing still waiting. */
const REQUESTS = { x: 130, y: 440, w: 820, h: 240 };
const REQUESTS_TITLE = { x: 152, y: 500 };
const OK = { x: 928, y: 500 };
const PIP = { r: 13, cy: 606, x0: 440, step: 40 };

/** The Threads band: four slots and the gate in front of them. */
const THREADS = { x: 130, y: 880, w: 820, h: 390 };
const THREADS_TITLE = { x: 152, y: 938 };
const SLOT = { y: 980, w: 175, h: 150, rx: 22, step: 199, x0: 154 };
const SLOT_NAME = { dx: 22, y: 1022 };
const SLOT_BAR = { dx: 32, y: 1062, w: 111, h: 24, rx: 12 };
const SLOT_WORD = { dx: 87, y: 1085 };
const BADGE = { x: 448, y: 1152, w: 184, h: 54, rx: 18, textY: 1190 };
const POST = { left: 470, right: 602, y: 1162, w: 8, h: 34 };

/** The IO band: two devices with three bars each, and the port. */
const IO = { x: 280, y: 1500, w: 520, h: 240 };
const IO_TITLE = { x: 302, y: 1557 };
const CARD = { y: 1580, w: 150, h: 130, rx: 20, textY: 1616 };
const CARD_X: Record<string, number> = { disk: 300, net: 465, port: 630 };
const BAR = { dx: 20, w: 110, h: 14, ys: [1640, 1663, 1686], rx: 7 };
const PACKET = { x0: 650, step: 19, y: 1646, w: 14, h: 36, rx: 4 };

// --- what the stage can say about itself -----------------------------------

/** The four pool slots, left to right. */
export const SLOT_COUNT = 4;
export const SLOT_IDS = ['t1', 't2', 't3', 't4'] as const;
export type SlotId = (typeof SLOT_IDS)[number];

/**
 * What a slot is doing. `busy` is running code — registering a start or running
 * a continuation — and `held` is the thing this scene is about: a thread that is
 * doing nothing but waiting for an operation to finish.
 */
export const SLOT_STATES = ['free', 'busy', 'held'] as const;
export type SlotState = (typeof SLOT_STATES)[number];

/**
 * The six bars an in-flight operation can be drawn on, three per device. The
 * count is the ceiling on how many operations the stage can show at once, and
 * the model is refused if it ever asks for a seventh.
 */
export const BAR_IDS = ['d1', 'n1', 'd2', 'n2', 'd3', 'n3'] as const;
export type BarId = (typeof BAR_IDS)[number];
export const BAR_DEVICE: Record<BarId, 'disk' | 'net'> = {
  d1: 'disk',
  n1: 'net',
  d2: 'disk',
  n2: 'net',
  d3: 'disk',
  n3: 'net',
};
/** Which of the three rows on its card a bar sits on. */
const BAR_ROW: Record<BarId, number> = { d1: 0, n1: 0, d2: 1, n2: 1, d3: 2, n3: 2 };

/** How far along an operation is, drawn in quarters so nothing interpolates. */
export const BAR_STEPS = 4;

/** How many packets the `port` card draws, and how deep the queue may go. */
export const PORT_MAX = 6;

/** How many requests may stand in the Requests band with nowhere to go. */
export const BACKLOG_MAX = 3;

/** Every value the `ok n` readout is ever set to. */
export const OK_MAX = 12;

/** Which world the scene is in: threads that wait, or a port that does. */
export const MODES = ['ghost', 'port'] as const;
export type Mode = (typeof MODES)[number];

/** What the scene is holding up for a moment, drawn on the thing it is about. */
export const MARKS = ['none', 'nothread', 'os', 'bars', 'wait', 'count'] as const;
export type Mark = (typeof MARKS)[number];

/**
 * What every `data-*` on the stage starts at. The markup below is written from
 * this, so the opening frame is the whole diagram in its starting state — four
 * `free` slots, six idle bars, an empty port, `ok 0`, no backlog, no gate and
 * nothing in flight — and the timeline never restates a value that is already
 * there.
 */
export const STAGE_STATE: Record<string, string> = {
  'stage@data-iocp-mode': 'ghost',
  'stage@data-iocp-ok': '0',
  'stage@data-iocp-backlog': '0',
  'stage@data-iocp-port': '0',
  'stage@data-iocp-limit': 'off',
  'stage@data-iocp-mark': 'none',
  'stage@data-iocp-settled': 'off',
  ...Object.fromEntries(SLOT_IDS.map((id) => [`${id}@data-iocp-slot`, 'free'])),
  ...Object.fromEntries(BAR_IDS.map((id) => [`${id}@data-iocp-bar`, 'off'])),
};

// --- markup ----------------------------------------------------------------

/** Newline plus `n` spaces, the separator between lines of one fragment. */
const pad = (n: number): string => `\n${' '.repeat(n)}`;

/** Non-breaking spaces, so a monospaced readout keeps its gaps in SVG. */
const mono = (text: string): string => text.replace(/ /g, '&#160;');

/** The `ok n` readout: one text per value it ever reads, stacked on one spot. */
const okVariants = Array.from({ length: OK_MAX + 1 }, (_v, n) => n)
  .map(
    (n) =>
      `<text class="scene-counter iocp-ok iocp-ok--${n}" x="${OK.x}" y="${OK.y}" text-anchor="end">${mono(`ok ${n}`)}</text>`,
  )
  .join(pad(4));

/**
 * The backlog: one group per depth, each drawing that many pips, so exactly one
 * of them is ever revealed and the number of pips is never a tween.
 */
const backlogVariants = Array.from({ length: BACKLOG_MAX + 1 }, (_v, n) => n)
  .map((n) => {
    const pips = Array.from(
      { length: n },
      (_w, i) =>
        `<circle class="iocp-pip" cx="${PIP.x0 + i * PIP.step}" cy="${PIP.cy}" r="${PIP.r}" />`,
    ).join(pad(6));
    return `<g class="iocp-backlog iocp-backlog--${n}">${n === 0 ? '' : `${pad(6)}${pips}${pad(4)}`}</g>`;
  })
  .join(pad(4));

/** One pool slot: a plate in three spellings, its name, its bar and its word. */
const slot = (id: SlotId, index: number): string => {
  const x = SLOT.x0 + index * SLOT.step;
  const plates = SLOT_STATES.map(
    (state) =>
      `<rect class="iocp-slot-bg iocp-slot-bg--${state}" x="${x}" y="${SLOT.y}" width="${SLOT.w}" height="${SLOT.h}" rx="${SLOT.rx}" />`,
  ).join(pad(6));
  return `<g class="iocp-slot iocp-slot--${id}" data-iocp-slot="free">
      ${plates}
      <text class="scene-mono iocp-slot-name" x="${x + SLOT_NAME.dx}" y="${SLOT_NAME.y}">${id.toUpperCase()}</text>
      <rect class="iocp-slot-bar iocp-slot-bar--busy" x="${x + SLOT_BAR.dx}" y="${SLOT_BAR.y}" width="${SLOT_BAR.w}" height="${SLOT_BAR.h}" rx="${SLOT_BAR.rx}" />
      <rect class="iocp-slot-bar iocp-slot-bar--held" x="${x + SLOT_BAR.dx}" y="${SLOT_BAR.y}" width="${SLOT_BAR.w}" height="${SLOT_BAR.h}" rx="${SLOT_BAR.rx}" />
      <text class="iocp-slot-word" x="${x + SLOT_WORD.dx}" y="${SLOT_WORD.y}" text-anchor="middle">free</text>
    </g>`;
};

/** The gate in front of the pool: dashed and postless until it is on. */
const badge = `<g class="iocp-badge">
      <rect class="iocp-badge-bg iocp-badge-bg--off" x="${BADGE.x}" y="${BADGE.y}" width="${BADGE.w}" height="${BADGE.h}" rx="${BADGE.rx}" />
      <rect class="iocp-badge-bg iocp-badge-bg--on" x="${BADGE.x}" y="${BADGE.y}" width="${BADGE.w}" height="${BADGE.h}" rx="${BADGE.rx}" />
      <rect class="iocp-post" x="${POST.left}" y="${POST.y}" width="${POST.w}" height="${POST.h}" rx="4" />
      <rect class="iocp-post" x="${POST.right}" y="${POST.y}" width="${POST.w}" height="${POST.h}" rx="4" />
      <text class="iocp-badge-word" x="${X_LANE}" y="${BADGE.textY}" text-anchor="middle">limit</text>
    </g>`;

/** One progress bar: a track that is always there, and four fills over it. */
const bar = (id: BarId): string => {
  const x = (CARD_X[BAR_DEVICE[id]] ?? 0) + BAR.dx;
  const y = BAR.ys[BAR_ROW[id]] ?? 0;
  const fills = Array.from({ length: BAR_STEPS }, (_v, n) => n + 1)
    .map(
      (n) =>
        `<rect class="iocp-bar-fill iocp-bar-fill--${n}" x="${x}" y="${y}" width="${Math.round((BAR.w * n) / BAR_STEPS)}" height="${BAR.h}" rx="${BAR.rx}" />`,
    )
    .join(pad(6));
  return `<g class="iocp-bar iocp-bar--${id}" data-iocp-bar="off">
      <rect class="iocp-bar-track" x="${x}" y="${y}" width="${BAR.w}" height="${BAR.h}" rx="${BAR.rx}" />
      ${fills}
    </g>`;
};

/**
 * The port's queue. The slots are always drawn as outlines so an empty port is
 * a picture rather than a blank, and one group per depth fills that many of
 * them, so exactly one group is ever revealed.
 */
const packetSlots = Array.from(
  { length: PORT_MAX },
  (_v, i) =>
    `<rect class="iocp-packet-slot" x="${PACKET.x0 + i * PACKET.step}" y="${PACKET.y}" width="${PACKET.w}" height="${PACKET.h}" rx="${PACKET.rx}" />`,
).join(pad(6));

const queueVariants = Array.from({ length: PORT_MAX + 1 }, (_v, n) => n)
  .map((n) => {
    const packets = Array.from(
      { length: n },
      (_w, i) =>
        `<rect class="iocp-packet" x="${PACKET.x0 + i * PACKET.step}" y="${PACKET.y}" width="${PACKET.w}" height="${PACKET.h}" rx="${PACKET.rx}" />`,
    ).join(pad(8));
    return `<g class="iocp-queue iocp-queue--${n}">${n === 0 ? '' : `${pad(8)}${packets}${pad(6)}`}</g>`;
  })
  .join(pad(6));

/** One card in the IO band, carrying whatever that device is drawn with. */
const card = (name: 'disk' | 'net' | 'port', children: string): string => {
  const x = CARD_X[name] ?? 0;
  return `<g class="iocp-card iocp-card--${name}">
      <rect class="iocp-card-bg" x="${x}" y="${CARD.y}" width="${CARD.w}" height="${CARD.h}" rx="${CARD.rx}" />
      <text class="iocp-card-word" x="${x + CARD.w / 2}" y="${CARD.textY}" text-anchor="middle">${name}</text>
      ${children}
    </g>`;
};

const stageAttrs = Object.entries(STAGE_STATE)
  .filter(([key]) => key.startsWith('stage@'))
  .map(([key, value]) => `${key.slice('stage@'.length)}="${value}"`)
  .join(' ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageAttrs} aria-hidden="true" focusable="false">
  <defs>
    <pattern id="iocp-hatch" width="14" height="14" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
      <line class="iocp-hatch-line" x1="0" y1="0" x2="0" y2="14" stroke-width="6" />
    </pattern>
  </defs>

  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_LANE, Y_REQUESTS_BOTTOM, Y_THREADS_TOP, 'scene-link iocp-lane--in')}
  ${verticalLink(X_LANE, Y_THREADS_BOTTOM, Y_IO_TOP, 'scene-link iocp-lane--io')}

  ${serviceBox({
    x: REQUESTS.x,
    width: REQUESTS.w,
    y: REQUESTS.y,
    height: REQUESTS.h,
    title: 'Requests',
    titleX: REQUESTS_TITLE.x,
    titleY: REQUESTS_TITLE.y,
    titleClass: 'scene-node-title iocp-title',
    titleAnchor: null,
    className: 'scene-client iocp-requests',
    children: `
    ${okVariants}

    ${backlogVariants}`,
  })}

  ${serviceBox({
    x: THREADS.x,
    width: THREADS.w,
    y: THREADS.y,
    height: THREADS.h,
    title: 'Threads',
    titleX: THREADS_TITLE.x,
    titleY: THREADS_TITLE.y,
    titleClass: 'scene-node-title iocp-title',
    titleAnchor: null,
    className: 'scene-node iocp-threads',
    children: `
    ${SLOT_IDS.map((id, index) => slot(id, index)).join(`\n\n    `)}

    ${badge}`,
  })}

  ${serviceBox({
    x: IO.x,
    width: IO.w,
    y: IO.y,
    height: IO.h,
    title: 'IO',
    titleX: IO_TITLE.x,
    titleY: IO_TITLE.y,
    titleClass: 'scene-node-title iocp-title',
    titleAnchor: null,
    className: 'scene-service iocp-io',
    children: `
    ${card('disk', BAR_IDS.filter((id) => BAR_DEVICE[id] === 'disk').map(bar).join(pad(6)))}

    ${card('net', BAR_IDS.filter((id) => BAR_DEVICE[id] === 'net').map(bar).join(pad(6)))}

    ${card('port', `${packetSlots}\n      ${queueVariants}`)}`,
  })}

  ${requestsLayer()}
</svg>`;
