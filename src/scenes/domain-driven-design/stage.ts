/**
 * Static stage markup for the Domain-Driven Design scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Four bands, one per thing a border
 * is drawn around:
 *   - y 0..400       above the cropped viewBox (see shared VIEWBOX)
 *   - y 400..440     the frame's top padding; nothing is drawn here
 *   - y 440..680     Domain: the word `Order` on its card, the first step's
 *                    ghost — the same card grown until it serves everybody —
 *                    and the fourth step's `event`, which is the only thing
 *                    that ever crosses a border
 *   - y 880..1270    the two contexts side by side, Sales on x 130..490 and
 *                    Shipping on x 590..950, each with its own Order model:
 *                    `price` and `total n` on one side, `address` and `items n`
 *                    on the other
 *   - y 1500..1740   Root: the aggregate root, drawn as a door with a guard —
 *                    the `invariant` lamp, the `ok n` it has let through, and
 *                    the `deny` it answers a writer who tried to go around it
 *
 * Three lanes and no others, all axis-aligned and all ending on a box edge:
 * x 310 from the Domain's bottom edge to Sales' top edge, x 770 from the same
 * edge to Shipping's, and x 310 again from Sales' bottom edge to the Root's
 * top. The first two carry language downward in the second step and the fourth
 * step's translation in both directions — Sales publishes upward into the
 * Domain band and Shipping reads downward out of it — and the third carries
 * writes. A write that goes through the root and a write that tries to go
 * around it travel the same column, because that is the point: the bypass is
 * not a different road, it is the same road with the guard skipped, so it is
 * told apart by being hollow and dashed rather than by where it is.
 *
 * A traveller sweeps 26px around every point it reaches and a label keeps 30px
 * clear of that, so x 310 owns a 112px keep-out from y 624 to y 936 and a second
 * from y 1214 to y 1556, and x 770 owns one from y 624 to y 936. Everything the
 * Domain band draws sits in x 370..714, which is between the two columns;
 * every word the contexts draw sits between y 936 and y 1214; and the Root's
 * words start below y 1556.
 *
 * Declared texture: the five ghost card plates and the four field bars that grow
 * on them, the two context card plates, the `event` plate, the `deny` plate and
 * the three lamp glyphs. Everything else is a word, and every word is one of the
 * thirteen fixed labels.
 *
 * Nothing on this stage is told apart by colour alone. The ghost is a **bigger
 * card with more rows on it** than the lean one, not a redder one. A context
 * card that has not been defined yet is a **hollow dashed plate with nothing
 * written on it**; a defined one is filled and carries three words. The lamp is
 * three different glyphs — a hollow dashed ring, a filled disc with a check, a
 * filled disc with a cross — rather than three fills of one circle. And a
 * refused write carries the cross marker every scene uses plus the `deny` plate
 * lighting under the guard.
 *
 * Every value the reader can read is a stack of text elements on one spot with
 * the widget class hiding all of them and the current `data-*` revealing one, so
 * nothing is interpolated and scrubbing backwards lands on the value rather than
 * on an average of two.
 */

import { VIEWBOX, requestsLayer, serviceBox, verticalLink } from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- geometry --------------------------------------------------------------

/** The two columns anything travels on, and the four edges they run between. */
export const X_SALES = 310;
export const X_SHIP = 770;
export const Y_DOMAIN_BOTTOM = 680;
export const Y_CONTEXT_TOP = 880;
export const Y_CONTEXT_BOTTOM = 1270;
export const Y_ROOT_TOP = 1500;

/** The Domain band: the word, the ghost grown on it, and the published event. */
const DOMAIN = { x: 130, y: 440, w: 820, h: 240 };
const DOMAIN_TITLE_X = 152;
const DOMAIN_TITLE_Y = 504;

/** The `Order` card, centred between the two lanes so no plate meets a halo. */
const WORD_X = 540;
const WORD_Y = 556;

/**
 * The card the word sits on, once per size it is drawn at. `lean` is an Order
 * that belongs to one context; `1` to `4` are the same card after that many
 * departments have added their fields to it. Exactly one is ever revealed.
 */
export const CARD_PLATES = [
  { id: 'lean', x: 440, y: 514, w: 200, h: 64 },
  { id: '1', x: 420, y: 512, w: 240, h: 84 },
  { id: '2', x: 400, y: 510, w: 280, h: 98 },
  { id: '3', x: 385, y: 508, w: 310, h: 113 },
  { id: '4', x: 370, y: 506, w: 340, h: 128 },
] as const;

/** The rows that accrete on the ghost: one per field somebody else needed. */
export const GHOST_FIELDS = 4;
const BAR_H = 9;
const BARS = [
  { x: 452, y: 578, w: 176 },
  { x: 442, y: 591, w: 196 },
  { x: 432, y: 604, w: 216 },
  { x: 422, y: 617, w: 236 },
] as const;

/** The `event` plate: the fourth step's one crossing, drawn in the Domain band. */
const EVENT_PLATE = { x: 452, y: 586, w: 176, h: 70 };
const EVENT_TEXT_Y = 632;

/** The two contexts. Same band, same card geometry, different words on them. */
const CONTEXTS = {
  sales: { x: 130, w: 360, titleX: 152, cardX: 152, centre: X_SALES, title: 'Sales' },
  ship: { x: 590, w: 360, titleX: 612, cardX: 612, centre: X_SHIP, title: 'Shipping' },
} as const;
export type ContextId = keyof typeof CONTEXTS;

const CONTEXT_Y = 880;
const CONTEXT_H = 390;
const CONTEXT_TITLE_Y = 996;
const CARD = { y: 1016, w: 316, h: 194 };
const CARD_WORD_Y = 1072;
const CARD_FIELD_Y = 1132;
const CARD_VALUE_Y = 1186;

/** The Root band: the guard, the rule it checks, and what it has answered. */
const ROOT = { x: 280, y: 1500, w: 520, h: 240 };
const ROOT_TITLE_X = 302;
const ROOT_TITLE_Y = 1608;
const LAMP = { cx: 560, cy: 1578, r: 26 };
const INVARIANT_X = 600;
const INVARIANT_Y = 1596;
const OK_X = 302;
const OK_Y = 1694;
const DENY_PLATE = { x: 540, y: 1648, w: 220, h: 72 };
const DENY_TEXT_Y = 1700;

// --- what the stage can say about itself -----------------------------------

/**
 * Every total Sales' Order can hold. It is not a run of integers: it is the
 * running sum of the line deltas the root accepts, which is the only way this
 * number is ever allowed to move.
 */
export const TOTALS = [0, 3, 5] as const;

/** Every count of boxes Shipping's Order can hold. */
export const ITEMS = [0, 1, 2] as const;

/** The highest `ok` the Root can reach, which is how many variants it draws. */
export const MAX_OK = 2;

/** Whether the shared model is up, and how much of it has accreted. */
export const GHOSTS = ['off', 'on'] as const;
export type Ghost = (typeof GHOSTS)[number];

/**
 * Whether the stage still thinks there is one model. `shared` is the world of
 * the first step; `bordered` is the world after the borders are drawn, and the
 * Domain box stops being a model and becomes a map of them.
 */
export const MODES = ['shared', 'bordered'] as const;
export type Mode = (typeof MODES)[number];

/**
 * What a context's card is: a plate nobody has defined a meaning on yet, or its
 * own model with its own words. The two are a hollow dashed outline with nothing
 * written on it and a filled plate carrying three words, so neither can be
 * mistaken for the other in either theme.
 */
export const CARD_STATES = ['none', 'own'] as const;
export type CardState = (typeof CARD_STATES)[number];

/** What the guard is doing: waiting, passing a change, refusing one. */
export const LAMPS = ['idle', 'ok', 'deny'] as const;
export type Lamp = (typeof LAMPS)[number];

/** Two-valued things: the frames, the deny plate, the event, the settled hold. */
export const FLAGS = ['off', 'on'] as const;
export type Flag = (typeof FLAGS)[number];

/** What the scene is holding up for a moment, drawn on the band it is about. */
export const MARKS = [
  'none',
  'border',
  'sales',
  'ship',
  'promise',
  'id-only',
  'no-share',
  'map',
] as const;
export type Mark = (typeof MARKS)[number];

/**
 * What every `data-*` on the stage starts at. The markup below is written from
 * these, so the first frame is the whole diagram in its opening state — the word
 * `Order` on a lean card, two contexts that have not said what they mean by it,
 * a guard standing at a door nobody has knocked on, and nothing in flight — and
 * the timeline never restates a value that is already there.
 */
export const STAGE_STATE: Record<string, string> = {
  'data-ddd-ghost': 'off',
  'data-ddd-fields': '0',
  'data-ddd-mode': 'shared',
  'data-ddd-frames': 'off',
  'data-ddd-sales': 'none',
  'data-ddd-ship': 'none',
  'data-ddd-total': '0',
  'data-ddd-items': '0',
  'data-ddd-root': 'off',
  'data-ddd-lamp': 'idle',
  'data-ddd-ok': '0',
  'data-ddd-deny': 'off',
  'data-ddd-event': 'off',
  'data-ddd-mark': 'none',
  'data-ddd-settled': 'off',
};

// --- markup ----------------------------------------------------------------

/** Newline plus `n` spaces, the separator between lines of one fragment. */
const pad = (n: number): string => `\n${' '.repeat(n)}`;

/** Non-breaking spaces, so a monospaced readout keeps its gaps in SVG. */
const mono = (text: string): string => text.replace(/ /g, '&#160;');

/**
 * A readout whose values are a ladder rather than a run of integers. Like every
 * other counter it is one text element per value stacked on one spot, with the
 * widget class hiding all of them and the state picking the one that shows.
 */
const ladder = (
  values: readonly number[],
  x: number,
  y: number,
  className: string,
  format: (value: number) => string,
  anchor: string | null,
  indent = 6,
): string =>
  values
    .map(
      (value) =>
        `<text class="scene-counter scene-mono ${className} ${className}--${value}" x="${x}" y="${y}"${anchor ? ` text-anchor="${anchor}"` : ''}>${format(value)}</text>`,
    )
    .join(pad(indent));

/** The five sizes the Order card is drawn at, stacked on one spot. */
const cardPlates = CARD_PLATES.map(
  (plate) =>
    `<rect class="ddd-plate ddd-plate--${plate.id}" x="${plate.x}" y="${plate.y}" width="${plate.w}" height="${plate.h}" rx="18" />`,
).join(pad(4));

/** The rows that grow on the ghost, one per field the shared model absorbed. */
const ghostBars = BARS.map(
  (bar, index) =>
    `<rect class="ddd-bar ddd-bar--${index + 1}" x="${bar.x}" y="${bar.y}" width="${bar.w}" height="${BAR_H}" rx="4" />`,
).join(pad(4));

/**
 * One context: its name, the plate its model is drawn on, and the three words
 * that are its model. The plate is always there, because a context does not
 * appear and disappear; what changes is whether it has said what it means.
 */
const context = (id: ContextId): string => {
  const spot = CONTEXTS[id];
  const value =
    id === 'sales'
      ? ladder(TOTALS, spot.centre, CARD_VALUE_Y, 'ddd-total', (v) => mono(`total ${v}`), 'middle')
      : ladder(ITEMS, spot.centre, CARD_VALUE_Y, 'ddd-items', (v) => mono(`items ${v}`), 'middle');
  const field = id === 'sales' ? 'price' : 'address';
  return `<g class="ddd-context ddd-context--${id}">
      <rect class="ddd-card" x="${spot.cardX}" y="${CARD.y}" width="${CARD.w}" height="${CARD.h}" rx="20" />
      <text class="ddd-card-word" x="${spot.centre}" y="${CARD_WORD_Y}" text-anchor="middle">Order</text>
      <text class="ddd-card-field" x="${spot.centre}" y="${CARD_FIELD_Y}" text-anchor="middle">${field}</text>
      ${value}
    </g>`;
};

/**
 * The guard's lamp, drawn as three glyphs on one spot rather than three fills of
 * one circle: a hollow dashed ring while nothing is being asked, a disc with a
 * check when the invariant held, a disc with a cross when a writer tried to go
 * around the door. Only one is ever revealed.
 */
const lamp = `<g class="ddd-lamp ddd-lamp--idle">
      <circle class="ddd-lamp-ring" cx="${LAMP.cx}" cy="${LAMP.cy}" r="${LAMP.r}" />
    </g>
    <g class="ddd-lamp ddd-lamp--ok">
      <circle class="ddd-lamp-disc ddd-lamp-disc--ok" cx="${LAMP.cx}" cy="${LAMP.cy}" r="${LAMP.r}" />
      <path class="ddd-lamp-glyph" d="M ${LAMP.cx - 12} ${LAMP.cy + 1} L ${LAMP.cx - 4} ${LAMP.cy + 10} L ${LAMP.cx + 13} ${LAMP.cy - 10}" />
    </g>
    <g class="ddd-lamp ddd-lamp--deny">
      <circle class="ddd-lamp-disc ddd-lamp-disc--deny" cx="${LAMP.cx}" cy="${LAMP.cy}" r="${LAMP.r}" />
      <path class="ddd-lamp-glyph" d="M ${LAMP.cx - 10} ${LAMP.cy - 10} L ${LAMP.cx + 10} ${LAMP.cy + 10} M ${LAMP.cx + 10} ${LAMP.cy - 10} L ${LAMP.cx - 10} ${LAMP.cy + 10}" />
    </g>`;

const okReadout = ladder(
  Array.from({ length: MAX_OK + 1 }, (_value, n) => n),
  OK_X,
  OK_Y,
  'ddd-ok',
  (value) => mono(`ok ${value}`),
  null,
  4,
);

const stageAttrs = Object.entries(STAGE_STATE)
  .map(([name, value]) => `${name}="${value}"`)
  .join(' ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageAttrs} aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_SALES, Y_DOMAIN_BOTTOM, Y_CONTEXT_TOP, 'scene-link ddd-lane--sales')}
  ${verticalLink(X_SHIP, Y_DOMAIN_BOTTOM, Y_CONTEXT_TOP, 'scene-link ddd-lane--ship')}
  ${verticalLink(X_SALES, Y_CONTEXT_BOTTOM, Y_ROOT_TOP, 'scene-link ddd-lane--write')}

  ${serviceBox({
    x: DOMAIN.x,
    width: DOMAIN.w,
    y: DOMAIN.y,
    height: DOMAIN.h,
    title: 'Domain',
    titleX: DOMAIN_TITLE_X,
    titleY: DOMAIN_TITLE_Y,
    titleAnchor: null,
    className: 'scene-client ddd-domain',
    children: `
    ${cardPlates}

    <text class="ddd-word" x="${WORD_X}" y="${WORD_Y}" text-anchor="middle">Order</text>

    ${ghostBars}

    <g class="ddd-event">
      <rect class="ddd-event-bg" x="${EVENT_PLATE.x}" y="${EVENT_PLATE.y}" width="${EVENT_PLATE.w}" height="${EVENT_PLATE.h}" rx="16" />
      <text class="ddd-event-text" x="${WORD_X}" y="${EVENT_TEXT_Y}" text-anchor="middle">event</text>
    </g>`,
  })}

  ${serviceBox({
    x: CONTEXTS.sales.x,
    width: CONTEXTS.sales.w,
    y: CONTEXT_Y,
    height: CONTEXT_H,
    title: CONTEXTS.sales.title,
    titleX: CONTEXTS.sales.titleX,
    titleY: CONTEXT_TITLE_Y,
    titleAnchor: null,
    className: 'scene-node ddd-band ddd-band--sales',
    children: `
    ${context('sales')}`,
  })}

  ${serviceBox({
    x: CONTEXTS.ship.x,
    width: CONTEXTS.ship.w,
    y: CONTEXT_Y,
    height: CONTEXT_H,
    title: CONTEXTS.ship.title,
    titleX: CONTEXTS.ship.titleX,
    titleY: CONTEXT_TITLE_Y,
    titleAnchor: null,
    className: 'scene-node ddd-band ddd-band--ship',
    children: `
    ${context('ship')}`,
  })}

  ${serviceBox({
    x: ROOT.x,
    width: ROOT.w,
    y: ROOT.y,
    height: ROOT.h,
    title: 'Root',
    titleX: ROOT_TITLE_X,
    titleY: ROOT_TITLE_Y,
    titleAnchor: null,
    className: 'scene-service ddd-root',
    children: `
    ${lamp}

    <text class="ddd-invariant" x="${INVARIANT_X}" y="${INVARIANT_Y}">invariant</text>

    ${okReadout}

    <g class="ddd-deny">
      <rect class="ddd-deny-bg" x="${DENY_PLATE.x}" y="${DENY_PLATE.y}" width="${DENY_PLATE.w}" height="${DENY_PLATE.h}" rx="16" />
      <text class="ddd-deny-text" x="${DENY_PLATE.x + DENY_PLATE.w / 2}" y="${DENY_TEXT_Y}" text-anchor="middle">deny</text>
    </g>`,
  })}

  ${requestsLayer()}
</svg>`;
