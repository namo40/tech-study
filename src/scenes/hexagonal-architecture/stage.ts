/**
 * Static stage markup for the Hexagonal Architecture scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Three bands, read as one sentence
 * about which way a dependency points:
 *   - y 0..400       above the cropped viewBox (see shared VIEWBOX)
 *   - y 400..440     the frame's top padding; nothing is drawn here
 *   - y 440..680     Outside (x 130..950): the two actors that drive the
 *                    application, `web` and `test`, the `ok n` they have been
 *                    answered, and the three family name cards the fourth step
 *                    puts up between them
 *   - y 880..1270    Core (x 130..950): the `domain` capsule in the middle, the
 *                    in `port` socket above it and the out `port` socket below
 *                    it, an `adapter` plate beside each socket, and the first
 *                    step's ghost — a wire from the domain straight past both
 *                    sockets into the Details band
 *   - y 1500..1740   Details (x 280..800): the `db`, `memory` and `mail` cards,
 *                    with the schema-change tick the first step puts on `db`
 *
 * Two lane segments and no others, both axis aligned, both at x 540, and both
 * ending on a box edge:
 *   - `Y_OUTSIDE_BOTTOM` 680 to `Y_CORE_TOP` 880, **bidirectional**: a request
 *     rides it down and the answer rides it back up, because a port is one door
 *     rather than a pair of pipes.
 *   - `Y_CORE_BOTTOM` 1270 to `Y_DETAILS_TOP` 1500, also **bidirectional**: the
 *     call the domain drives through the out port rides it down and the detail's
 *     answer rides it back up. It carries nothing at all until an adapter is in
 *     the out socket, which is the thing the third step is trying to show.
 * Nothing is ever on one column twice at once, in either direction: the model
 * measures where every traveller is at every 10 ms sample and refuses a schedule
 * that brings two of them within 52 px on one column.
 *
 * A traveller sweeps 26px around every point it reaches and a label keeps 30px
 * clear of that, so x 540 owns a 112px keep-out from y 624 to y 936 and a second
 * from y 1214 to y 1556. Everything the Outside band draws ends above y 620;
 * every word in the Core band sits below y 936 and above y 1214; and the Details
 * band writes nothing above y 1527 in that column.
 *
 * The ghost wire is the one shape that deliberately leaves a box: it runs at
 * x 380 from the domain capsule's bottom edge at y 1140 to the Details band's
 * top edge at y 1500, straight through the Core box's bottom edge, because a
 * dependency drawn without a direction is exactly a line that crosses a border
 * nobody defended. It keeps clear of both lane keep-outs.
 *
 * Declared texture: the ghost wire, the crack glyphs, the schema tick, the two
 * port socket plates, the two adapter plates, the domain capsule plates, the
 * actor capsules, the three family name cards and the three detail cards.
 * Everything else is a word, and every word is one of the twelve fixed labels,
 * plus the three pattern names the fourth step's cards carry.
 *
 * Nothing here is told apart by colour alone. A socket with nothing in it is a
 * **hollow dashed slot**; a socketed one is a **filled plate with a tongue drawn
 * into the adapter beside it**. The domain capsule is a **hollow dashed outline**
 * while it has no ports, a **filled outline** once it has them, and a **filled
 * outline with a heavier ring** while it is working. A crack is a **zigzag
 * glyph**, the schema change is a **notch glyph**, and a detail that answered
 * carries the check every scene uses.
 *
 * Every value the reader can read is a stack of elements on one spot with a base
 * rule hiding all of them and the current `data-*` revealing exactly one, so
 * nothing is interpolated and scrubbing backwards lands on the value rather than
 * on an average of two: the `ok n` readout, the two adapter face names, the two
 * socket plates and the three domain capsule plates.
 */

import { VIEWBOX, requestsLayer, serviceBox, verticalLink } from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- geometry --------------------------------------------------------------

/** The one column anything travels on, and the four edges it runs between. */
export const X_LANE = 540;
export const Y_OUTSIDE_BOTTOM = 680;
export const Y_CORE_TOP = 880;
export const Y_CORE_BOTTOM = 1270;
export const Y_DETAILS_TOP = 1500;

/** The Outside band: who drives the application, and what they got back. */
const OUTSIDE = { x: 130, y: 440, w: 820, h: 240 };
const OUTSIDE_TITLE = { x: 152, y: 500 };
const OK = { x: 928, y: 500 };

/** The two actors. Same capsule, different word, and only `web` ever cracks. */
const ACTOR = { y: 520, h: 100, rx: 36 };
const WEB = { x: 150, w: 180, textX: 178, textY: 582 };
const TEST = { x: 790, w: 140, textX: 860, textY: 582 };
/** The crack the first step's wire drives all the way out here. */
const WEB_CRACK = { x: 264, y: 552 };

/** The fourth step's three drawings of the one rule. */
export const FAMILY = [
  { id: 'hexagonal', x: 342, w: 168 },
  { id: 'clean', x: 524, w: 118 },
  { id: 'onion', x: 656, w: 118 },
] as const;
const FAMILY_TEXT_Y = 578;

/** The Core band: the middle, the two doors, and what is plugged into them. */
const CORE = { x: 130, y: 880, w: 820, h: 390 };
const CORE_TITLE = { x: 152, y: 936 };

/** The two sockets, on the column the requests arrive on. */
const SOCKET = { x: 466, w: 148, h: 52, rx: 16 };
const SOCKET_IN_Y = 942;
const SOCKET_OUT_Y = 1156;
const SOCKET_TEXT_DY = 34;
/** The tongue that says a socket has something in it, drawn towards the plate. */
const TONGUE = { w: 26, h: 20, dy: 16 };

/** The two adapter plates, each beside the socket it is plugged into. */
const PLATE = { x: 628, w: 296, h: 52, rx: 16 };
const PLATE_WORD_X = 658;
const PLATE_FACE_X = 906;

/** The domain capsule, centred between the two sockets. */
const DOMAIN = { x: 340, y: 1020, w: 400, h: 120, rx: 44 };
const DOMAIN_TEXT = { x: 540, y: 1096 };
const DOMAIN_CRACK = { x: 650, y: 1060 };

/** The wire the first step draws, from the domain past both doors. */
const WIRE = { x: 380, y1: 1140, y2: Y_DETAILS_TOP };

/** The Details band: the three outside things, and what happened to `db`. */
const DETAILS = { x: 280, y: 1500, w: 520, h: 240 };
const DETAILS_TITLE = { x: 302, y: 1556 };
const CARD = { y: 1590, w: 152, h: 120, rx: 20 };
const CARD_X: Record<string, number> = { db: 298, memory: 464, mail: 630 };
const CARD_NAME_DY = 46;
/** The two glyphs `db` alone carries: what changed, and what it broke. */
const DB_SCHEMA = { x: 318, y: 1660 };
const DB_CRACK = { x: 386, y: 1660 };

// --- what the stage can say about itself -----------------------------------

/** The three outside things a detail card stands for. */
export const CARD_IDS = ['db', 'memory', 'mail'] as const;
export type CardId = (typeof CARD_IDS)[number];

/** What a card is doing. `answer` is the moment it hands something back. */
export const CARD_STATES = ['idle', 'busy', 'answer'] as const;
export type CardState = (typeof CARD_STATES)[number];

/** Whether the world with no direction is up. */
export const GHOSTS = ['off', 'on'] as const;

/** How far the crack has run: nowhere, the store, the middle, the outside. */
export const CRACKS = ['none', 'db', 'domain', 'web'] as const;
export type Crack = (typeof CRACKS)[number];

/** A socket: not drawn at all, drawn empty, or drawn with something in it. */
export const SOCKETS = ['absent', 'empty', 'socketed'] as const;
export type Socket = (typeof SOCKETS)[number];

/** Which face the upper adapter is showing, and whether it exists yet. */
export const TOPS = ['absent', 'web', 'test'] as const;
export type Top = (typeof TOPS)[number];

/** Which face the lower adapter is showing. The swap is a change of this. */
export const LOWS = ['absent', 'db', 'memory'] as const;
export type Low = (typeof LOWS)[number];

/** The capsule in the middle: no doors, doors, or working behind them. */
export const DOMAINS = ['open', 'ported', 'work'] as const;
export type DomainState = (typeof DOMAINS)[number];

/** Which actor is driving right now, drawn on the capsule that is. */
export const ACTORS = ['none', 'web', 'test'] as const;
export type Actor = 'web' | 'test';

/** Every value the `ok n` readout is ever set to. */
export const OK_MAX = 6;

/** What the scene is holding up for a moment, drawn on the thing it is about. */
export const MARKS = [
  'none',
  'inward',
  'blind',
  'out',
  'contract',
  'inside',
  'swapped',
  'detail',
  'arrows',
  'family',
] as const;
export type Mark = (typeof MARKS)[number];

/**
 * What every `data-*` on the stage starts at, keyed by the target the timeline
 * addresses it through. The markup below is written from this, so the opening
 * frame is the whole diagram in its starting state — an Outside holding both
 * actors and `ok 0`, a Core whose domain has no doors and nothing plugged into
 * it, three idle details, no family cards, and nothing in flight — and the
 * timeline never restates a value that is already there.
 */
export const STAGE_STATE: Record<string, string> = {
  'stage@data-hex-ghost': 'off',
  'stage@data-hex-schema': 'off',
  'stage@data-hex-crack': 'none',
  'stage@data-hex-in': 'absent',
  'stage@data-hex-out': 'absent',
  'stage@data-hex-top': 'absent',
  'stage@data-hex-low': 'absent',
  'stage@data-hex-domain': 'open',
  'stage@data-hex-actor': 'none',
  'stage@data-hex-ok': '0',
  'stage@data-hex-names': 'off',
  'stage@data-hex-mark': 'none',
  'stage@data-hex-settled': 'off',
  'card-db@data-hex-card': 'idle',
  'card-memory@data-hex-card': 'idle',
  'card-mail@data-hex-card': 'idle',
};

// --- markup ----------------------------------------------------------------

/** Newline plus `n` spaces, the separator between lines of one fragment. */
const pad = (n: number): string => `\n${' '.repeat(n)}`;

/** Non-breaking spaces, so a monospaced readout keeps its gaps in SVG. */
const mono = (text: string): string => text.replace(/ /g, '&#160;');

/** A crack: a zigzag rather than a colour, so it reads without the palette. */
const crackGlyph = (id: string, x: number, y: number): string =>
  `<path class="hex-crack hex-crack--${id}" d="M ${x} ${y} L ${x + 22} ${y + 16} L ${x + 8} ${y + 24} L ${x + 30} ${y + 40}" />`;

/** The `ok n` readout: one text per value it ever reads, stacked on one spot. */
const okVariants = Array.from({ length: OK_MAX + 1 }, (_v, n) => n)
  .map(
    (n) =>
      `<text class="scene-counter hex-ok hex-ok--${n}" x="${OK.x}" y="${OK.y}" text-anchor="end">${mono(`ok ${n}`)}</text>`,
  )
  .join(pad(4));

/** One actor capsule: a plate, its word, and — for `web` — the crack it takes. */
const actor = (id: Actor): string => {
  const box = id === 'web' ? WEB : TEST;
  const anchor = id === 'web' ? '' : ' text-anchor="middle"';
  const crack = id === 'web' ? pad(6) + crackGlyph('web', WEB_CRACK.x, WEB_CRACK.y) : '';
  return `<g class="hex-actor hex-actor--${id}">
      <rect class="hex-actor-bg" x="${box.x}" y="${ACTOR.y}" width="${box.w}" height="${ACTOR.h}" rx="${ACTOR.rx}" />
      <text class="hex-actor-name" x="${box.textX}" y="${box.textY}"${anchor}>${id}</text>${crack}
    </g>`;
};

/** The three drawings of the one rule, put up together in the fourth step. */
const familyCards = FAMILY.map(
  (card) => `<g class="hex-name hex-name--${card.id}">
      <rect class="hex-name-bg" x="${card.x}" y="${ACTOR.y}" width="${card.w}" height="${ACTOR.h}" rx="22" />
      <text class="hex-name-text" x="${card.x + card.w / 2}" y="${FAMILY_TEXT_Y}" text-anchor="middle">${card.id}</text>
    </g>`,
).join(pad(4));

/**
 * One port socket. Two plates on one origin — a hollow dashed slot and a filled
 * one with a tongue running into the adapter beside it — so a door with nothing
 * in it is a different shape from a door with something in it, and exactly one
 * of the two is ever revealed.
 */
const socket = (side: 'in' | 'out'): string => {
  const y = side === 'in' ? SOCKET_IN_Y : SOCKET_OUT_Y;
  return `<g class="hex-socket hex-socket--${side}">
      <rect class="hex-socket-plate hex-socket-plate--empty" x="${SOCKET.x}" y="${y}" width="${SOCKET.w}" height="${SOCKET.h}" rx="${SOCKET.rx}" />
      <rect class="hex-socket-plate hex-socket-plate--socketed" x="${SOCKET.x}" y="${y}" width="${SOCKET.w}" height="${SOCKET.h}" rx="${SOCKET.rx}" />
      <rect class="hex-tongue" x="${SOCKET.x + SOCKET.w}" y="${y + TONGUE.dy}" width="${TONGUE.w}" height="${TONGUE.h}" rx="6" />
      <text class="hex-socket-word" x="${SOCKET.x + SOCKET.w / 2}" y="${y + SOCKET_TEXT_DY}" text-anchor="middle">port</text>
    </g>`;
};

/**
 * One adapter plate. The word `adapter` is fixed; the face it turns towards the
 * world is a stack of names with exactly one revealed, because an adapter is
 * the same thing whichever protocol it happens to be speaking.
 */
const plate = (side: 'top' | 'low', faces: readonly string[]): string => {
  const y = side === 'top' ? SOCKET_IN_Y : SOCKET_OUT_Y;
  const names = faces
    .map(
      (face) =>
        `<text class="hex-face hex-face--${face}" x="${PLATE_FACE_X}" y="${y + SOCKET_TEXT_DY}" text-anchor="end">${face}</text>`,
    )
    .join(pad(6));
  return `<g class="hex-plate hex-plate--${side}">
      <rect class="hex-plate-bg" x="${PLATE.x}" y="${y}" width="${PLATE.w}" height="${PLATE.h}" rx="${PLATE.rx}" />
      <text class="hex-plate-word" x="${PLATE_WORD_X}" y="${y + SOCKET_TEXT_DY}">adapter</text>
      ${names}
    </g>`;
};

/** The three capsule plates, on one origin, one revealed per domain state. */
const domainPlates = DOMAINS.map(
  (state) =>
    `<rect class="hex-domain-plate hex-domain-plate--${state}" x="${DOMAIN.x}" y="${DOMAIN.y}" width="${DOMAIN.w}" height="${DOMAIN.h}" rx="${DOMAIN.rx}" />`,
).join(pad(4));

/** One detail card, plus the two glyphs the store alone carries. */
const card = (id: CardId): string => {
  const x = CARD_X[id] ?? 0;
  const extra =
    id === 'db'
      ? pad(6) +
        `<path class="hex-schema" d="M ${DB_SCHEMA.x} ${DB_SCHEMA.y} L ${DB_SCHEMA.x + 44} ${DB_SCHEMA.y} M ${DB_SCHEMA.x} ${DB_SCHEMA.y + 16} L ${DB_SCHEMA.x + 26} ${DB_SCHEMA.y + 16} M ${DB_SCHEMA.x + 12} ${DB_SCHEMA.y + 32} L ${DB_SCHEMA.x + 44} ${DB_SCHEMA.y + 32}" />` +
        pad(6) +
        crackGlyph('db', DB_CRACK.x, DB_CRACK.y)
      : '';
  return `<g class="hex-card hex-card--${id}" data-hex-card="${STAGE_STATE[`card-${id}@data-hex-card`]}">
      <rect class="hex-card-bg" x="${x}" y="${CARD.y}" width="${CARD.w}" height="${CARD.h}" rx="${CARD.rx}" />
      <text class="hex-card-name" x="${x + CARD.w / 2}" y="${CARD.y + CARD_NAME_DY}" text-anchor="middle">${id}</text>${extra}
    </g>`;
};

const stageAttrs = Object.entries(STAGE_STATE)
  .filter(([key]) => key.startsWith('stage@'))
  .map(([key, value]) => `${key.slice('stage@'.length)}="${value}"`)
  .join(' ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageAttrs} aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_LANE, Y_OUTSIDE_BOTTOM, Y_CORE_TOP, 'scene-link hex-lane--in')}
  ${verticalLink(X_LANE, Y_CORE_BOTTOM, Y_DETAILS_TOP, 'scene-link hex-lane--out')}
  <line class="hex-wire" x1="${WIRE.x}" y1="${WIRE.y1}" x2="${WIRE.x}" y2="${WIRE.y2}" />

  ${serviceBox({
    x: OUTSIDE.x,
    width: OUTSIDE.w,
    y: OUTSIDE.y,
    height: OUTSIDE.h,
    title: 'Outside',
    titleX: OUTSIDE_TITLE.x,
    titleY: OUTSIDE_TITLE.y,
    titleClass: 'scene-node-title hex-title',
    titleAnchor: null,
    className: 'scene-client hex-outside',
    children: `
    ${okVariants}

    ${actor('web')}
    ${actor('test')}

    ${familyCards}`,
  })}

  ${serviceBox({
    x: CORE.x,
    width: CORE.w,
    y: CORE.y,
    height: CORE.h,
    title: 'Core',
    titleX: CORE_TITLE.x,
    titleY: CORE_TITLE.y,
    titleClass: 'scene-node-title hex-title',
    titleAnchor: null,
    className: 'scene-node hex-core',
    children: `
    ${socket('in')}
    ${plate('top', ['web', 'test'])}

    ${domainPlates}
    <text class="hex-domain-name" x="${DOMAIN_TEXT.x}" y="${DOMAIN_TEXT.y}" text-anchor="middle">domain</text>
    ${crackGlyph('domain', DOMAIN_CRACK.x, DOMAIN_CRACK.y)}

    ${socket('out')}
    ${plate('low', ['db', 'memory'])}`,
  })}

  ${serviceBox({
    x: DETAILS.x,
    width: DETAILS.w,
    y: DETAILS.y,
    height: DETAILS.h,
    title: 'Details',
    titleX: DETAILS_TITLE.x,
    titleY: DETAILS_TITLE.y,
    titleClass: 'scene-node-title hex-title',
    titleAnchor: null,
    className: 'scene-service hex-details',
    children: `
    ${CARD_IDS.map(card).join(pad(4))}`,
  })}

  ${requestsLayer()}
</svg>`;
