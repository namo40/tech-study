/**
 * Static stage markup for the Sidecar scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Three bands, read as one sentence
 * about where the platform's work lives:
 *   - y 0..440       kept empty for the step title card
 *   - y 440..680     Traffic (x 130..950): the gate every request comes through,
 *                    drawn with a padlock because the traffic is encrypted, and
 *                    the `ok n` readout that counts what got answered
 *   - y 880..1270    Pod (x 130..950): the pod frame, drawn around one seat
 *                    while the app is alone and around two once there is a
 *                    second container; the `app` container on the left and the
 *                    `sidecar` container on the right; the `localhost` wiring
 *                    between them; the `tls`, `log` and `retry` lump chips,
 *                    which start inside `app` and end inside `sidecar`; the
 *                    first step's ghost, a second `app` in another language
 *                    carrying the very same lumps; a lifetime lamp on each
 *                    container; and the `ambassador` badge the fourth step puts
 *                    on the sidecar
 *   - y 1500..1740   Backends (x 280..800): the `logs` card the sidecar ships to
 *                    and the `svc` card the ambassador calls
 *
 * Three lane segments and no others, every one axis aligned and every one
 * ending on a box edge:
 *   - `X_IN` (540) between the Traffic band's bottom edge at 680 and the Pod's
 *     top edge at 880. A request rides it down and its answer rides it back up,
 *     because the pod answers on the connection it was called on.
 *   - `X_LOG` (310) from the Pod's bottom edge at 1270 to the Backends' top edge
 *     at 1500, one-directional: a log shipment goes down it and nothing comes
 *     back, because shipping a log line is not a question.
 *   - `X_OUT` (770), the same two edges, carrying a call the ambassador makes.
 *     It runs both ways — the call down, the answer back up — and the model
 *     measures every traveller on it at every 10 ms sample and refuses a
 *     schedule that brings two of them within 52 px, which is what keeps the
 *     failed attempt clear of the retry that follows it.
 *
 * A traveller is a dot with a halo of r 26, so each lane sweeps a 52px band and
 * everything written beside one keeps 30px off it. The inbound lane sweeps
 * y 654..906 at x 514..566, so the Traffic band draws nothing below y 640 in
 * that column and the Pod band writes nothing above y 936 in it. The two lower
 * lanes sweep y 1244..1526 at x 284..336 and x 744..796, so the Pod frame stops
 * at y 1238 and the Backends band puts its title on the free column between the
 * two lanes and everything else below y 1556.
 *
 * Declared texture: the traffic gate and its padlock, the pod frame, the two
 * container plates, the empty seat, the ghost app plate, the six lump chips, the
 * two lifetime lamps, the localhost wire, the ambassador badge, the two backend
 * cards, the two log shipment marks and the `svc` verdict glyphs. Everything
 * else on the stage is a word, and every word is one of the twelve fixed labels
 * plus the one pattern name the fourth step's badge carries.
 *
 * Nothing is told apart by colour alone. A seat with nothing in it is a **hollow
 * dashed slot**; a container is a **filled plate**. A lump chip in the app is a
 * **filled plate**, the same chip in the sidecar is an **outlined plate**, and
 * the ghost's copies are **dashed**. A lamp that is up is a **check**, one that
 * is down is a **cross**, and a container whose lamp is down takes a **dashed
 * outline** as well. A request that is still encrypted carries a **padlock and a
 * dashed ring**; once the sidecar has terminated it, it carries **two plain
 * rules and no ring**. The `svc` card answers with the check and the cross every
 * scene uses.
 *
 * Every value the reader can read is a stack of elements on one spot with a base
 * rule hiding all of them and the current `data-*` revealing exactly one, so
 * nothing is interpolated and scrubbing backwards lands on the value rather than
 * on an average of two: the `ok n` readout, the pod frame, the app plate, the
 * sidecar plate, each lump chip's two homes, the two lamps, the localhost wire,
 * the ambassador badge, the `svc` card and the gate. There is no continuous
 * quantity anywhere on this stage.
 */

import { VIEWBOX, requestsLayer, serviceBox, verticalLink } from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- geometry --------------------------------------------------------------

/** The three columns anything travels on, and the four edges they run between. */
export const X_IN = 540;
export const X_LOG = 310;
export const X_OUT = 770;
export const Y_TRAFFIC_BOTTOM = 680;
export const Y_POD_TOP = 880;
export const Y_POD_BOTTOM = 1270;
export const Y_BACKENDS_TOP = 1500;

/** The Traffic band: where requests come from, and what came back. */
const TRAFFIC = { x: 130, y: 440, w: 820, h: 240 };
const TRAFFIC_TITLE = { x: 152, y: 500 };
const OK = { x: 928, y: 500 };
/** The gate, drawn with a padlock because everything arriving is encrypted. */
const GATE = { x: 470, y: 560, w: 140, h: 80, rx: 20 };
const GATE_LOCK = { cx: 540, cy: 604 };

/** The Pod band: one frame, two seats, and everything that lives in them. */
const POD = { x: 130, y: 880, w: 820, h: 390 };
const POD_TITLE = { x: 152, y: 938 };
/** The frame itself, drawn around one seat or around two. */
const FRAME = { y: 962, h: 276, rx: 34 };
const FRAME_SOLO = { x: 146, w: 414 };
const FRAME_PAIR = { x: 146, w: 788 };

/** The two container seats. Same plate, same furniture, different occupant. */
const BOX = { y: 992, w: 296, h: 222, rx: 26 };
const BOX_X: Record<string, number> = { app: 168, side: 616 };
const NAME_DX = 24;
const NAME_Y = 1044;
const LAMP_DX = 264;
const LAMP_Y = 1032;
const LAMP_R = 18;

/** The three lumps, drawn in a row along the bottom of whichever seat holds them. */
const CHIP = { y: 1156, w: 80, h: 42, rx: 12 };
const CHIP_DX = [18, 108, 198];
const CHIP_TEXT_DY = 29;

/** The wiring between the seats, and the one word that says what it is. */
const WIRE = { x1: 464, x2: 616, y: 1118 };
const WIRE_TEXT = { x: 540, y: 1090 };

/** The badge the fourth step puts on the sidecar. */
const AMB = { x: 640, y: 1076, w: 248, h: 52, rx: 16 };
const AMB_TEXT = { x: 764, y: 1110 };

/** The Backends band: what the sidecar ships to, and what it calls. */
const BACKENDS = { x: 280, y: 1500, w: 520, h: 240 };
const BACKENDS_TITLE = { x: 540, y: 1562 };
const CARD = { y: 1600, w: 228, h: 116, rx: 22 };
const CARD_X: Record<string, number> = { logs: 300, svc: 552 };
const CARD_NAME_DX = 22;
const CARD_NAME_DY = 52;
/** One mark per log shipment that landed. */
const SHIP_MARK = { y: 1676, w: 24, h: 28, rx: 6, xs: [322, 358] };
/** The verdict `svc` answers with, drawn as a glyph and not only as a colour. */
const SVC_GLYPH = { cx: 740, cy: 1660, r: 22 };

// --- what the stage can say about itself -----------------------------------

/** The three cross-cutting lumps, in the order the first step grows them. */
export const LUMPS = ['tls', 'log', 'retry'] as const;
export type Lump = (typeof LUMPS)[number];

/** Where a lump lives: nowhere yet, in the app's code, or in the sidecar. */
export const LUMP_HOMES = ['none', 'app', 'side'] as const;
export type LumpHome = (typeof LUMP_HOMES)[number];

/** Whether the pod frame is drawn around one seat or around two. */
export const PODS = ['solo', 'pair'] as const;

/** Whether the second `app`, in another language, is up. */
export const DUPS = ['off', 'on'] as const;

/** The app: carrying the platform's work, rid of it, serving, or waiting. */
export const APPS = ['fat', 'slim', 'serving', 'calling'] as const;
export type AppState = (typeof APPS)[number];

/** The second seat: not drawn, drawn empty, filled, or working. */
export const SIDES = ['gone', 'empty', 'idle', 'busy'] as const;
export type SideState = (typeof SIDES)[number];

/** The outward-facing role the fourth step gives the sidecar. */
export const AMBS = ['off', 'on', 'working'] as const;
export type AmbState = (typeof AMBS)[number];

/** The loopback: no sidecar to wire to, wired and quiet, or carrying plaintext. */
export const WIRES = ['off', 'idle', 'plain'] as const;
export type WireState = (typeof WIRES)[number];

/** Whether the gate has a request outstanding. */
export const GATES = ['idle', 'live'] as const;

/** Both containers share one lifetime, so both lamps only ever read the same. */
export const LIVES = ['up', 'down'] as const;
export type LifeState = (typeof LIVES)[number];

/** What the far service is doing, including the one blip it has. */
export const SVCS = ['idle', 'busy', 'fail', 'ok'] as const;
export type SvcState = (typeof SVCS)[number];

/** Every value the `ok n` readout is ever set to. */
export const OK_MAX = 3;

/** Every log shipment the collector can hold a mark for. */
export const SHIP_MAX = 2;

/** What the scene is holding up for a moment, drawn on the thing it is about. */
export const MARKS = ['none', 'notapp', 'seat', 'life', 'thin', 'apart', 'nocode'] as const;
export type Mark = (typeof MARKS)[number];

/**
 * What every `data-*` on the stage starts at, keyed by the target the timeline
 * addresses it through. The markup below is written from this, so the opening
 * frame is the whole diagram in its starting state — a Traffic band with a quiet
 * gate and `ok 0`, a pod drawn around one seat holding an `app` with no lumps in
 * it yet, no sidecar and no wiring, an idle `svc`, a `logs` card with nothing in
 * it, and nothing in flight — and the timeline never restates a value that is
 * already there.
 */
export const STAGE_STATE: Record<string, string> = {
  'stage@data-sc-pod': 'solo',
  'stage@data-sc-dup': 'off',
  'stage@data-sc-tls': 'none',
  'stage@data-sc-log': 'none',
  'stage@data-sc-retry': 'none',
  'stage@data-sc-app': 'fat',
  'stage@data-sc-side': 'gone',
  'stage@data-sc-amb': 'off',
  'stage@data-sc-wire': 'off',
  'stage@data-sc-gate': 'idle',
  'stage@data-sc-ok': '0',
  'stage@data-sc-svc': 'idle',
  'stage@data-sc-logs': '0',
  'stage@data-sc-mark': 'none',
  'stage@data-sc-settled': 'off',
  'box-app@data-sc-life': 'up',
  'box-side@data-sc-life': 'up',
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
      `<text class="scene-counter sc-ok sc-ok--${n}" x="${OK.x}" y="${OK.y}" text-anchor="end">${mono(`ok ${n}`)}</text>`,
  )
  .join(pad(4));

/** The padlock on the gate: a shackle over a body, drawn as one outline. */
const padlock = (cx: number, cy: number): string =>
  `<path class="sc-gate-lock" d="M ${cx - 24} ${cy - 6} L ${cx - 24} ${cy + 24} L ${cx + 24} ${cy + 24} L ${cx + 24} ${cy - 6} Z M ${cx - 13} ${cy - 6} L ${cx - 13} ${cy - 19} A 13 13 0 0 1 ${cx + 13} ${cy - 19} L ${cx + 13} ${cy - 6}" />`;

/** A lifetime lamp: a disc that says which way it went, and a glyph that repeats it. */
const lamp = (cx: number, indent: number): string =>
  [
    `<circle class="sc-lamp-disc sc-lamp-disc--up" cx="${cx}" cy="${LAMP_Y}" r="${LAMP_R}" />`,
    `<circle class="sc-lamp-disc sc-lamp-disc--down" cx="${cx}" cy="${LAMP_Y}" r="${LAMP_R}" />`,
    `<path class="sc-lamp-glyph sc-lamp-glyph--up" d="M ${cx - 9} ${LAMP_Y} L ${cx - 3} ${LAMP_Y + 7} L ${cx + 9} ${LAMP_Y - 7}" />`,
    `<path class="sc-lamp-glyph sc-lamp-glyph--down" d="M ${cx - 7} ${LAMP_Y - 7} L ${cx + 7} ${LAMP_Y + 7} M ${cx + 7} ${LAMP_Y - 7} L ${cx - 7} ${LAMP_Y + 7}" />`,
  ].join(pad(indent));

/**
 * One lump chip, drawn at whichever seat is holding it. Both homes are written
 * into the markup and the lump's own `data-*` reveals at most one, so a lump
 * that moved is the same lump and not a new one that happens to share a word.
 */
const chip = (id: Lump, seat: 'app' | 'side'): string => {
  const x = (BOX_X[seat] ?? 0) + (CHIP_DX[LUMPS.indexOf(id)] ?? 0);
  return `<g class="sc-chip sc-chip--${seat} sc-chip--${id}-${seat}">
        <rect class="sc-chip-bg" x="${x}" y="${CHIP.y}" width="${CHIP.w}" height="${CHIP.h}" rx="${CHIP.rx}" />
        <text class="sc-chip-word" x="${x + CHIP.w / 2}" y="${CHIP.y + CHIP_TEXT_DY}" text-anchor="middle">${id}</text>
      </g>`;
};

/** The three lumps the ghost draws again in the app next door. */
const ghostChips = LUMPS.map((id) => {
  const x = (BOX_X.side ?? 0) + (CHIP_DX[LUMPS.indexOf(id)] ?? 0);
  return [
    `<rect class="sc-dup-chip-bg" x="${x}" y="${CHIP.y}" width="${CHIP.w}" height="${CHIP.h}" rx="${CHIP.rx}" />`,
    `<text class="sc-dup-chip-word" x="${x + CHIP.w / 2}" y="${CHIP.y + CHIP_TEXT_DY}" text-anchor="middle">${id}</text>`,
  ].join(pad(6));
}).join(pad(6));

/** One backend card: a plate, its word, and whatever else that card carries. */
const card = (id: 'logs' | 'svc', plateClass: string, extra: string): string => {
  const x = CARD_X[id] ?? 0;
  return `<rect class="${plateClass}" x="${x}" y="${CARD.y}" width="${CARD.w}" height="${CARD.h}" rx="${CARD.rx}" />
    <text class="sc-card-name" x="${x + CARD_NAME_DX}" y="${CARD.y + CARD_NAME_DY}">${id}</text>${extra}`;
};

/** One mark per shipment that landed, revealed cumulatively. */
const shipMarks = SHIP_MARK.xs
  .map(
    (x, index) =>
      `<rect class="sc-ship sc-ship--${index + 1}" x="${x}" y="${SHIP_MARK.y}" width="${SHIP_MARK.w}" height="${SHIP_MARK.h}" rx="${SHIP_MARK.rx}" />`,
  )
  .join(pad(4));

const stageAttrs = Object.entries(STAGE_STATE)
  .filter(([key]) => key.startsWith('stage@'))
  .map(([key, value]) => `${key.slice('stage@'.length)}="${value}"`)
  .join(' ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageAttrs} aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_IN, Y_TRAFFIC_BOTTOM, Y_POD_TOP, 'scene-link sc-lane--in')}
  ${verticalLink(X_LOG, Y_POD_BOTTOM, Y_BACKENDS_TOP, 'scene-link sc-lane--log')}
  ${verticalLink(X_OUT, Y_POD_BOTTOM, Y_BACKENDS_TOP, 'scene-link sc-lane--out')}

  ${serviceBox({
    x: TRAFFIC.x,
    width: TRAFFIC.w,
    y: TRAFFIC.y,
    height: TRAFFIC.h,
    title: 'Traffic',
    titleX: TRAFFIC_TITLE.x,
    titleY: TRAFFIC_TITLE.y,
    titleClass: 'scene-node-title sc-title',
    titleAnchor: null,
    className: 'scene-client sc-traffic',
    children: `
    ${okVariants}

    <rect class="sc-gate-bg sc-gate-bg--idle" x="${GATE.x}" y="${GATE.y}" width="${GATE.w}" height="${GATE.h}" rx="${GATE.rx}" />
    <rect class="sc-gate-bg sc-gate-bg--live" x="${GATE.x}" y="${GATE.y}" width="${GATE.w}" height="${GATE.h}" rx="${GATE.rx}" />
    ${padlock(GATE_LOCK.cx, GATE_LOCK.cy)}`,
  })}

  ${serviceBox({
    x: POD.x,
    width: POD.w,
    y: POD.y,
    height: POD.h,
    title: 'Pod',
    titleX: POD_TITLE.x,
    titleY: POD_TITLE.y,
    titleClass: 'scene-node-title sc-title',
    titleAnchor: null,
    className: 'scene-node sc-pod',
    children: `
    <rect class="sc-frame sc-frame--solo" x="${FRAME_SOLO.x}" y="${FRAME.y}" width="${FRAME_SOLO.w}" height="${FRAME.h}" rx="${FRAME.rx}" />
    <rect class="sc-frame sc-frame--pair" x="${FRAME_PAIR.x}" y="${FRAME.y}" width="${FRAME_PAIR.w}" height="${FRAME.h}" rx="${FRAME.rx}" />

    <g class="sc-box--app" data-sc-life="${STAGE_STATE['box-app@data-sc-life']}">
      ${APPS.map(
        (state) =>
          `<rect class="sc-plate sc-plate--${state}" x="${BOX_X.app}" y="${BOX.y}" width="${BOX.w}" height="${BOX.h}" rx="${BOX.rx}" />`,
      ).join(pad(6))}
      <text class="sc-box-name" x="${(BOX_X.app ?? 0) + NAME_DX}" y="${NAME_Y}">app</text>
      ${lamp((BOX_X.app ?? 0) + LAMP_DX, 6)}
    </g>

    <g class="sc-box--side" data-sc-life="${STAGE_STATE['box-side@data-sc-life']}">
      <rect class="sc-seat" x="${BOX_X.side}" y="${BOX.y}" width="${BOX.w}" height="${BOX.h}" rx="${BOX.rx}" />
      <rect class="sc-plate sc-plate--idle" x="${BOX_X.side}" y="${BOX.y}" width="${BOX.w}" height="${BOX.h}" rx="${BOX.rx}" />
      <rect class="sc-plate sc-plate--busy" x="${BOX_X.side}" y="${BOX.y}" width="${BOX.w}" height="${BOX.h}" rx="${BOX.rx}" />
      <text class="sc-box-name sc-side-name" x="${(BOX_X.side ?? 0) + NAME_DX}" y="${NAME_Y}">sidecar</text>
      <g class="sc-side-lamp">
        ${lamp((BOX_X.side ?? 0) + LAMP_DX, 8)}
      </g>
      <rect class="sc-amb-bg sc-amb-bg--on" x="${AMB.x}" y="${AMB.y}" width="${AMB.w}" height="${AMB.h}" rx="${AMB.rx}" />
      <rect class="sc-amb-bg sc-amb-bg--working" x="${AMB.x}" y="${AMB.y}" width="${AMB.w}" height="${AMB.h}" rx="${AMB.rx}" />
      <text class="sc-amb-word" x="${AMB_TEXT.x}" y="${AMB_TEXT.y}" text-anchor="middle">ambassador</text>
    </g>

    <g class="sc-dup">
      <rect class="sc-dup-bg" x="${BOX_X.side}" y="${BOX.y}" width="${BOX.w}" height="${BOX.h}" rx="${BOX.rx}" />
      <text class="sc-dup-name" x="${(BOX_X.side ?? 0) + NAME_DX}" y="${NAME_Y}">app</text>
      ${ghostChips}
    </g>

    <g class="sc-loop">
      <line class="sc-wire sc-wire--idle" x1="${WIRE.x1}" y1="${WIRE.y}" x2="${WIRE.x2}" y2="${WIRE.y}" />
      <line class="sc-wire sc-wire--plain" x1="${WIRE.x1}" y1="${WIRE.y}" x2="${WIRE.x2}" y2="${WIRE.y}" />
      <text class="sc-wire-word" x="${WIRE_TEXT.x}" y="${WIRE_TEXT.y}" text-anchor="middle">localhost</text>
    </g>

    ${LUMPS.map((id) => `${chip(id, 'app')}\n      ${chip(id, 'side')}`).join(pad(6))}`,
  })}

  ${serviceBox({
    x: BACKENDS.x,
    width: BACKENDS.w,
    y: BACKENDS.y,
    height: BACKENDS.h,
    title: 'Backends',
    titleX: BACKENDS_TITLE.x,
    titleY: BACKENDS_TITLE.y,
    titleClass: 'scene-node-title sc-title',
    className: 'scene-service sc-backends',
    children: `
    ${card('logs', 'sc-card-bg', `
    ${shipMarks}`)}

    ${card(
      'svc',
      'sc-card-bg sc-card-bg--svc',
      `
    <path class="sc-svc-glyph sc-svc-glyph--ok" d="M ${SVC_GLYPH.cx - 11} ${SVC_GLYPH.cy + 1} L ${SVC_GLYPH.cx - 3} ${SVC_GLYPH.cy + 10} L ${SVC_GLYPH.cx + 12} ${SVC_GLYPH.cy - 9}" />
    <path class="sc-svc-glyph sc-svc-glyph--fail" d="M ${SVC_GLYPH.cx - 10} ${SVC_GLYPH.cy - 10} L ${SVC_GLYPH.cx + 10} ${SVC_GLYPH.cy + 10} M ${SVC_GLYPH.cx + 10} ${SVC_GLYPH.cy - 10} L ${SVC_GLYPH.cx - 10} ${SVC_GLYPH.cy + 10}" />`,
    )}`,
  })}

  ${requestsLayer()}
</svg>`;
