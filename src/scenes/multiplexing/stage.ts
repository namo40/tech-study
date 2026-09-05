/**
 * Static stage markup for the Multiplexing scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Three bands and one column:
 *   - y 0..400       above the cropped viewBox (see shared VIEWBOX)
 *   - y 400..440     the frame's top padding; nothing is drawn here
 *   - y 440..680     Client: the three requests it has to make, the completion
 *                    slots they come back into, and how many are home
 *   - y 880..1270    Connection: which protocol is spoken on it, what is
 *                    occupying it, and how many requests are held back by it
 *   - y 1500..1740   Server: what it is working on, whether one of those is
 *                    slow, and the finished answers it is not allowed to send
 *
 * Two lanes and no others, both on the column every box is centred on.
 * `X_LANE` runs from the bottom edge of Client to the top edge of Connection,
 * and again from the bottom edge of Connection to the top edge of Server.
 * Requests travel down them and answers travel back up them, so every leg any
 * traveller makes is a move along one of those two segments: nothing here is a
 * rail, a corner or a diagonal, and no leg has zero length.
 *
 * The connection is a boundary rather than a corridor, so a traveller is never
 * drawn crossing it. A hop from the client ends on the connection's top edge
 * and is absorbed there; the hop carrying the same request onward starts on the
 * connection's bottom edge. That is what the seat actually is — the wire either
 * side of it is a different wire — and it is why the picture can say the
 * connection is occupied at all.
 *
 * Identity is carried by colour and nothing else while a request is in motion:
 * A is amber, B is blue, C is violet, and no traveller wears a label. The three
 * letters live in the client's chips, in its completion slots, and in the
 * `busy:` readout, all of which stand still long enough to be read.
 *
 * Everything the reader can read off this stage is a stack of text elements on
 * one spot with a base rule hiding all of them, so a value is never interpolated
 * and scrubbing backwards lands on it exactly. There is no continuous quantity
 * anywhere on the stage.
 */

import {
  VIEWBOX,
  clientBox,
  counterVariants,
  nodeFrame,
  requestsLayer,
  serviceBox,
  verticalLink,
} from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- the one lane column ---------------------------------------------------

/** Every box is centred here, and both lanes run down it. */
export const X_LANE = 540;

/** Bottom edge of Client, and top edge of Connection. */
export const Y_CLIENT = 680;
export const Y_CONN_TOP = 880;

/** Bottom edge of Connection, and top edge of Server. */
export const Y_CONN_BOTTOM = 1270;
export const Y_SERVER = 1500;

/** Length of each lane, so the scene can travel both at one speed. */
export const TOP_SPAN = Y_CONN_TOP - Y_CLIENT;
export const BOTTOM_SPAN = Y_SERVER - Y_CONN_BOTTOM;

// --- the three requests ----------------------------------------------------

/** The requests the client has to make, in the order it asks them. */
export const KEYS = ['a', 'b', 'c'] as const;
export type Key = (typeof KEYS)[number];

/** What each one is called wherever the stage stands still long enough to say. */
const LETTER: Record<Key, string> = { a: 'A', b: 'B', c: 'C' };

/** The stream HTTP/2 opens for each one. Client-initiated streams are odd. */
const STREAM: Record<Key, string> = { a: 's1', b: 's3', c: 's5' };

// --- the boxes -------------------------------------------------------------

const CLIENT = { x: 130, y: 440, w: 820, h: 240 };
const CONN = { y: 880, h: 390 };
const SERVER = { x: 280, y: 1500, w: 520, h: 240 };

const CLIENT_TITLE = { x: 170, y: 490 };
const CONN_LABEL_Y = 938;
const SERVER_TITLE = { x: 320, y: 1556 };

// --- inside Client ---------------------------------------------------------

/** One waiting request: its letter, and whether it is ready to be asked. */
const CHIP = { y: 512, w: 132, h: 68 };
const CHIP_X: Record<Key, number> = { a: 324, b: 474, c: 624 };
const CHIP_TEXT_Y = 556;
const CHIP_LETTER_DX = 30;
const CHIP_READY_DX = 56;

/** Where answers land, filled left to right in the order they arrive. */
const SLOT = { y: 596, w: 100, h: 60 };
const SLOT_X = [160, 268, 376];
const SLOT_TEXT_Y = 638;

/** How many of the three are home. */
const DONE = { x: 912, y: 636 };

// --- inside Connection -----------------------------------------------------

/** Which protocol is spoken on the wire, and the ring that asserts it. */
const MODE = { x: 640, y: 904, w: 280, h: 64 };
const MODE_RING = { x: 630, y: 896, w: 300, h: 80 };
const MODE_TEXT = { x: 780, y: 946 };

/** Every mode the chip can hold, and how it spells itself. */
export const MODES = ['http11', 'pipelining', 'http2'] as const;
export type Mode = (typeof MODES)[number];
const MODE_LABEL: Record<Mode, string> = {
  http11: 'HTTP/1.1',
  pipelining: 'pipelining',
  http2: 'HTTP/2',
};

/**
 * What is occupying the wire. Under HTTP/1.1 and pipelining that is one request
 * and the readout names it; under HTTP/2 it is three streams at once, and the
 * three tags take the same row because they are answering the same question.
 */
const BUSY = { x: X_LANE, y: 1046 };
const STREAM_ROW = { y: 1004, w: 132, h: 68 };
const STREAM_X: Record<Key, number> = { a: 324, b: 474, c: 624 };
const STREAM_TEXT_Y = 1048;

/** How many requests are ready and cannot get onto the wire. */
const WAIT = { x: 170, y: 1150 };

// --- inside Server ---------------------------------------------------------

/** The badge that appears while one of the three is taking its time. */
const SLOW = { x: 636, y: 1520, w: 136, h: 56 };
const SLOW_TEXT = { x: 704, y: 1558 };

/** One disc per request: lit while the server is working on that one. */
const SERVE_CY = 1620;
const SERVE_R = 26;
const SERVE_CX: Record<Key, number> = { a: 400, b: 540, c: 680 };

/** The bar that holds finished answers back, and the answers held behind it. */
const GATE = { x: 366, y: 1656, w: 348, h: 8 };
const HOLD_CY = 1696;
const HOLD_R = 22;

// --- markup ----------------------------------------------------------------

/** A request the client has not sent yet: the letter, and `ready` beside it. */
const requestChip = (key: Key): string => {
  const x = CHIP_X[key];
  return `<g class="mux-chip mux-chip--${key}" data-mux-chip="idle">
      <rect class="mux-chip-bg" x="${x}" y="${CHIP.y}" width="${CHIP.w}" height="${CHIP.h}" rx="18" />
      <text class="mux-chip-letter" x="${x + CHIP_LETTER_DX}" y="${CHIP_TEXT_Y}" text-anchor="middle">${LETTER[key]}</text>
      <text class="scene-mono mux-chip-ready" x="${x + CHIP_READY_DX}" y="${CHIP_TEXT_Y}">ready</text>
    </g>`;
};

/** One completion slot, holding whichever letter got back to it. */
const completionSlot = (index: number): string => {
  const x = SLOT_X[index] ?? 0;
  const letters = KEYS.map(
    (key) =>
      `<text class="mux-slot-letter mux-slot-letter--${key}" x="${x + SLOT.w / 2}" y="${SLOT_TEXT_Y}" text-anchor="middle">${LETTER[key]}</text>`,
  ).join('\n      ');
  return `<g class="mux-fill mux-fill--${index + 1}" data-mux-slot="none">
      <rect class="mux-slot-bg" x="${x}" y="${SLOT.y}" width="${SLOT.w}" height="${SLOT.h}" rx="16" />
      ${letters}
    </g>`;
};

/** One HTTP/2 stream tag, shown only while that protocol is the one spoken. */
const streamTag = (key: Key): string => {
  const x = STREAM_X[key];
  return `<g class="mux-stream mux-stream--${key}" data-mux-stream="off">
      <rect class="mux-stream-bg" x="${x}" y="${STREAM_ROW.y}" width="${STREAM_ROW.w}" height="${STREAM_ROW.h}" rx="18" />
      <text class="scene-mono mux-stream-text" x="${x + STREAM_ROW.w / 2}" y="${STREAM_TEXT_Y}" text-anchor="middle">${STREAM[key]}</text>
    </g>`;
};

/** The disc that says the server is working on this request right now. */
const serveDisc = (key: Key): string =>
  `<circle class="mux-serve mux-serve--${key}" data-mux-serve="off" cx="${SERVE_CX[key]}" cy="${SERVE_CY}" r="${SERVE_R}" />`;

/** A finished answer the connection is not letting out yet. */
const holdPuck = (key: Key): string =>
  `<circle class="mux-hold mux-hold--${key}" data-mux-hold="off" cx="${SERVE_CX[key]}" cy="${HOLD_CY}" r="${HOLD_R}" />`;

const modeTexts = MODES.map(
  (mode) =>
    `<text class="scene-mono mux-mode-text mux-mode-text--${mode}" x="${MODE_TEXT.x}" y="${MODE_TEXT.y}" text-anchor="middle">${MODE_LABEL[mode]}</text>`,
).join('\n      ');

const busyTexts = KEYS.map(
  (key) =>
    `<text class="scene-mono mux-busy mux-busy--${key}" x="${BUSY.x}" y="${BUSY.y}" text-anchor="middle">busy: ${LETTER[key]}</text>`,
).join('\n    ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" data-mux-mode="http11" data-mux-busy="none" data-mux-wait="0" data-mux-done="0" data-mux-slow="off" data-mux-gate="open" data-mux-mark="off" data-mux-order="off" data-mux-settled="off" aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_LANE, Y_CLIENT, Y_CONN_TOP)}
  ${verticalLink(X_LANE, Y_CONN_BOTTOM, Y_SERVER)}

  ${clientBox({
    x: CLIENT.x,
    width: CLIENT.w,
    y: CLIENT.y,
    height: CLIENT.h,
    title: 'Client',
    titleX: CLIENT_TITLE.x,
    titleY: CLIENT_TITLE.y,
    titleClass: 'scene-node-label',
    titleAnchor: null,
    children: `
    ${KEYS.map((key) => requestChip(key)).join('\n    ')}
    ${[0, 1, 2].map((index) => completionSlot(index)).join('\n    ')}
    ${counterVariants({
      x: DONE.x,
      y: DONE.y,
      className: 'scene-mono mux-done',
      count: 4,
      format: (n) => `done ${n}/3`,
      anchor: 'end',
    })}`,
  })}

  ${nodeFrame({
    y: CONN.y,
    height: CONN.h,
    label: 'Connection',
    labelY: CONN_LABEL_Y,
    children: `    <g class="mux-mode">
      <rect class="mux-mode-ring" x="${MODE_RING.x}" y="${MODE_RING.y}" width="${MODE_RING.w}" height="${MODE_RING.h}" rx="26" />
      <rect class="mux-mode-bg" x="${MODE.x}" y="${MODE.y}" width="${MODE.w}" height="${MODE.h}" rx="20" />
      ${modeTexts}
    </g>

    ${busyTexts}

    ${KEYS.map((key) => streamTag(key)).join('\n    ')}

    ${counterVariants({
      x: WAIT.x,
      y: WAIT.y,
      className: 'scene-mono mux-wait',
      count: 4,
      format: (n) => `waiting ${n}`,
    })}`,
  })}

  ${serviceBox({
    x: SERVER.x,
    width: SERVER.w,
    y: SERVER.y,
    height: SERVER.h,
    title: 'Server',
    titleX: SERVER_TITLE.x,
    titleY: SERVER_TITLE.y,
    titleClass: 'scene-node-label',
    titleAnchor: null,
    children: `
    <g class="mux-slow">
      <rect class="mux-slow-bg" x="${SLOW.x}" y="${SLOW.y}" width="${SLOW.w}" height="${SLOW.h}" rx="28" />
      <text class="mux-slow-text" x="${SLOW_TEXT.x}" y="${SLOW_TEXT.y}" text-anchor="middle">slow</text>
    </g>
    ${KEYS.map((key) => serveDisc(key)).join('\n    ')}
    <rect class="mux-gate" x="${GATE.x}" y="${GATE.y}" width="${GATE.w}" height="${GATE.h}" rx="4" />
    ${KEYS.map((key) => holdPuck(key)).join('\n    ')}`,
  })}

  ${requestsLayer()}
</svg>`;
