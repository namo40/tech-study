/**
 * Static stage markup for the Repository scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Four bands, read top to bottom as
 * one sentence about where persistence is allowed to live:
 *   - y 0..400       above the cropped viewBox (see shared VIEWBOX)
 *   - y 400..440     the frame's top padding; nothing is drawn here
 *   - y 440..680     Domain: the `Service` capsule, and the first step's ghost —
 *                    query fragments lodging inside that capsule until the
 *                    capsule itself is drawn as flooded
 *   - y 880..1270    Repository: the interface card the domain speaks to
 *                    (`Find` and `Add`), the implementation plate behind it
 *                    (an engine or an in-memory fake, with the `swap` badge
 *                    that marks the moment one is exchanged for the other), and
 *                    the equality bench — two card slots and the verdict
 *                    between them
 *   - y 1500..1740   Store: the row cells the writes land in, and `rows n`
 *
 * Two lanes and no others, both on x 540, both axis-aligned, both ending on a
 * box edge. The upper one runs between the Domain's bottom edge at y 680 and
 * the Repository's top edge at y 880 and is **bidirectional**: a call goes down
 * it and the answer comes back up it, because a repository is one door rather
 * than a pair of pipes. The lower one runs from the Repository's bottom edge at
 * y 1270 to the Store's top edge at y 1500 and only ever carries work downward —
 * and it carries nothing at all while the implementation is the in-memory fake,
 * which is the fourth thing the second step is trying to show.
 *
 * A traveller sweeps 26px around every point it reaches and a label keeps 30px
 * clear of that, so x 540 owns a 112px keep-out from y 624 to y 936 and a second
 * from y 1214 to y 1556. Everything the Domain band draws ends above y 620;
 * every word in the Repository band starts below y 966 or sits outside
 * x 484..596; the verdict under the bench ends at y 1206; and the Store's words
 * start below y 1533.
 *
 * Declared texture: the query-fragment bars inside the ghost chips, the field
 * bars on an entity card, the engine bars and the memory dots on the two
 * implementation plates, the replacement chevron, the check and cross glyphs,
 * and the Store's row cells. Everything else is a word, and every word is one
 * of the thirteen fixed labels.
 *
 * Nothing here is told apart by colour alone. A capsule with nothing in it is a
 * **plain outline**; a leaking one is **dashed and carries chips**; a flooded
 * one is **heavier, dashed and carries chips drawn as warnings**. The interface
 * card is a **hollow dashed plate with nothing written on it** before the door
 * exists and a **filled plate carrying two words** afterwards. The two
 * implementations are a **filled plate with three engine bars** and a **hollow
 * dashed plate with six dots**, which is a difference of shape before it is a
 * difference of hue. A verdict is a **word plus a glyph** — `same` with a check,
 * `not same` with a cross — and the empty bench is a hollow dashed plate with
 * neither.
 *
 * Every value the reader can read is a stack of elements on one spot with the
 * base rule hiding all of them and the current `data-*` revealing exactly one,
 * so nothing is interpolated and scrubbing backwards lands on the value rather
 * than on an average of two.
 */

import { VIEWBOX, requestsLayer, serviceBox, verticalLink } from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- geometry --------------------------------------------------------------

/** The one column everything travels on, and the four edges it runs between. */
export const X_LANE = 540;
export const Y_DOMAIN_BOTTOM = 680;
export const Y_REPO_TOP = 880;
export const Y_REPO_BOTTOM = 1270;
export const Y_STORE_TOP = 1500;

/** The Domain band: a service, and whatever has lodged itself inside it. */
const DOMAIN = { x: 130, y: 440, w: 820, h: 240 };
const DOMAIN_TITLE = { x: 152, y: 502 };
const CAPSULE = { x: 190, y: 524, w: 700, h: 96, rx: 34 };
const SERVICE_TEXT = { x: 216, y: 578 };

/** The three query fragments, drawn as chips with fragment bars on them. */
const FRAG = { y: 542, w: 148, h: 56, rx: 14 };
const FRAG_XS = [396, 560, 724] as const;
/** The bars inside one chip: a fragment of a query, never a word. */
const FRAG_BARS = [
  [
    { dx: 18, dy: 14, w: 112, h: 10 },
    { dx: 18, dy: 32, w: 74, h: 10 },
  ],
  [
    { dx: 18, dy: 14, w: 78, h: 10 },
    { dx: 18, dy: 32, w: 112, h: 10 },
  ],
  [
    { dx: 18, dy: 14, w: 96, h: 10 },
    { dx: 18, dy: 32, w: 96, h: 10 },
  ],
] as const;

/** The Repository band: the door, what is behind it, and the equality bench. */
const REPO = { x: 130, y: 880, w: 820, h: 390 };
const REPO_TITLE = { x: 152, y: 942 };
const FACE = { x: 150, y: 964, w: 320, h: 126, rx: 20 };
const FIND_TEXT = { x: 178, y: 1012 };
const ADD_TEXT = { x: 178, y: 1074 };
const IMPL = { x: 606, y: 964, w: 210, h: 126, rx: 20 };
const ENGINE_BARS = [1002, 1026, 1050] as const;
const ENGINE_BAR = { x: 640, w: 142, h: 14, rx: 7 };
const MEMORY_DOTS_X = [675, 711, 747] as const;
const MEMORY_DOTS_Y = [1012, 1048] as const;
const MEMORY_DOT_R = 10;
const SWAP = { x: 828, y: 1000, w: 100, h: 50, rx: 12 };
const SWAP_TEXT = { x: 878, y: 1036 };

/** The equality bench: two slots and the verdict that sits between them. */
const SLOT = { y: 1102, w: 250, h: 110, rx: 18 };
const SLOT_X = { left: 190, right: 640 } as const;
export type Side = keyof typeof SLOT_X;
const CARD_ID_Y = 1144;
const CARD_BARS = [1166, 1184] as const;
const CARD_BAR_H = 12;
const PILL = { dx: 25, y: 1122, w: 200, h: 66, rx: 33 };
const PILL_TEXT_Y = 1166;
/** The replaced value: the discarded chip, a chevron, and the new chip. */
const OLD_PILL = { dx: 25, y: 1104, w: 200, h: 40, rx: 20 };
const OLD_PILL_TEXT_Y = 1132;
const NEW_PILL = { dx: 25, y: 1170, w: 200, h: 40, rx: 20 };
const NEW_PILL_TEXT_Y = 1200;
const CHEVRON_Y = 1152;

const VERDICT = { x: 466, y: 1108, w: 148, h: 100, rx: 18 };
const VERDICT_LAMP = { cx: 540, cy: 1130, r: 22 };
const VERDICT_TEXT_Y = 1196;

/** The Store band: where a write lands, and how many rows there are. */
const STORE = { x: 280, y: 1500, w: 520, h: 240 };
const STORE_TITLE = { x: 302, y: 1580 };
const ROWS_TEXT = { x: 778, y: 1580 };
const CELL = { x0: 310, pitch: 60, w: 44, y: 1620, h: 70, rx: 10 };

// --- what the stage can say about itself -----------------------------------

/** How many row cells the Store draws. */
export const CELLS = 8;

/** How many rows the Store holds before the scene adds anything to it. */
export const BASE_ROWS = 3;

/** Every `rows n` the readout draws. The model asserts it never leaves these. */
export const ROW_COUNTS = [3, 4, 5] as const;

/** How many query fragments the ghost can lodge in the service. */
export const FRAGMENTS = FRAG_XS.length;

/**
 * What the Domain band is: a service with nothing leaking into it, one with
 * fragments lodged in it, three, or the moment the copies stop being an
 * inconvenience and start being the reason nothing can be tested.
 */
export const LEAKS = ['none', '1', '3', 'flood'] as const;
export type Leak = (typeof LEAKS)[number];

/** Whether persistence is still loose in the domain, or behind a door. */
export const MODES = ['leaking', 'bounded'] as const;
export type Mode = (typeof MODES)[number];

/**
 * What is behind the door. `none` is a plate nobody has put an implementation
 * on yet; `sql` is the engine that translates to the Store; `memory` is the
 * fake that answers out of a set and never touches the Store lane.
 */
export const IMPLS = ['none', 'sql', 'memory'] as const;
export type Impl = (typeof IMPLS)[number];

/**
 * What is on a bench slot. `empty` is a slot waiting for a card, which must not
 * read like a card. `e7a`, `e7b` and `e7c` are the same entity at three moments
 * of its life — same id, different fields — and `e9c` is a different entity
 * wearing exactly `e7c`'s fields. `v10` is a value chip and `v10n` is that chip
 * replaced by a new one rather than modified.
 */
export const CARDS = ['empty', 'e7a', 'e7b', 'e7c', 'e9c', 'v10', 'v10n'] as const;
export type Card = (typeof CARDS)[number];

/** The variants each slot actually draws. Only the right slot is replaced. */
export const SLOT_CARDS: Record<Side, readonly Card[]> = {
  left: ['empty', 'e7a', 'e7c', 'v10'],
  right: ['empty', 'e7b', 'e9c', 'v10', 'v10n'],
};

/** What the bench has decided, if anything. */
export const VERDICTS = ['none', 'same', 'not-same'] as const;
export type Verdict = (typeof VERDICTS)[number];

/** Two-valued things: the door, the swap badge, the settled hold. */
export const FLAGS = ['off', 'on'] as const;
export type Flag = (typeof FLAGS)[number];

/** What the scene is holding up for a moment, drawn on the band it is about. */
export const MARKS = ['none', 'behind', 'testable', 'identity', 'no-repo'] as const;
export type Mark = (typeof MARKS)[number];

/**
 * What every `data-*` on the stage starts at. The markup below is written from
 * these, so the first frame is the whole diagram in its opening state — a clean
 * service, a door nobody has opened with no implementation on it, an empty
 * bench, a Store holding three rows — and the timeline never restates a value
 * that is already there.
 */
export const STAGE_STATE: Record<string, string> = {
  'data-repo-leak': 'none',
  'data-repo-mode': 'leaking',
  'data-repo-door': 'off',
  'data-repo-impl': 'none',
  'data-repo-swap': 'off',
  'data-repo-left': 'empty',
  'data-repo-right': 'empty',
  'data-repo-verdict': 'none',
  'data-repo-rows': String(BASE_ROWS),
  'data-repo-mark': 'none',
  'data-repo-settled': 'off',
};

// --- markup ----------------------------------------------------------------

/** Newline plus `n` spaces, the separator between lines of one fragment. */
const pad = (n: number): string => `\n${' '.repeat(n)}`;

/** Non-breaking spaces, so a monospaced readout keeps its gaps in SVG. */
const mono = (text: string): string => text.replace(/ /g, '&#160;');

/** The three chips a leaking service collects, each with its own fragment. */
const fragments = FRAG_XS.map((x, index) => {
  const bars = (FRAG_BARS[index] ?? [])
    .map(
      (bar) =>
        `<rect class="repo-frag-bar" x="${x + bar.dx}" y="${FRAG.y + bar.dy}" width="${bar.w}" height="${bar.h}" rx="5" />`,
    )
    .join(pad(6));
  return `<g class="repo-frag repo-frag--${index + 1}">
      <rect class="repo-frag-bg" x="${x}" y="${FRAG.y}" width="${FRAG.w}" height="${FRAG.h}" rx="${FRAG.rx}" />
      ${bars}
    </g>`;
}).join(pad(4));

/** The three capsules, stacked on one spot. Exactly one is ever revealed. */
const capsules = ['clean', 'leaking', 'flooded']
  .map(
    (id) =>
      `<rect class="repo-capsule repo-capsule--${id}" x="${CAPSULE.x}" y="${CAPSULE.y}" width="${CAPSULE.w}" height="${CAPSULE.h}" rx="${CAPSULE.rx}" />`,
  )
  .join(pad(4));

/** The field bars an entity card carries: two widths, and nothing written. */
const CARD_FIELDS: Record<string, readonly [number, number]> = {
  e7a: [150, 96],
  e7b: [96, 172],
  e7c: [130, 130],
  e9c: [130, 130],
};

/** The word on an entity card, which is its identity and nothing else. */
const CARD_IDS: Record<string, string> = {
  e7a: 'id 7',
  e7b: 'id 7',
  e7c: 'id 7',
  e9c: 'id 9',
};

/** One entity card: an id, and two bars that are the fields of the moment. */
function entityCard(side: Side, card: Card): string {
  const x = SLOT_X[side];
  const centre = x + SLOT.w / 2;
  const widths = CARD_FIELDS[card] ?? [0, 0];
  const bars = CARD_BARS.map(
    (y, index) =>
      `<rect class="repo-card-bar" x="${centre - (widths[index] ?? 0) / 2}" y="${y}" width="${widths[index] ?? 0}" height="${CARD_BAR_H}" rx="6" />`,
  ).join(pad(6));
  return `<g class="repo-card repo-card--${side} repo-card--${side}-${card}">
      <rect class="repo-card-bg" x="${x}" y="${SLOT.y}" width="${SLOT.w}" height="${SLOT.h}" rx="${SLOT.rx}" />
      <text class="repo-card-id" x="${centre}" y="${CARD_ID_Y}" text-anchor="middle">${CARD_IDS[card] ?? ''}</text>
      ${bars}
    </g>`;
}

/** One value chip: content, and nothing that could tell two of them apart. */
function valuePill(side: Side): string {
  const x = SLOT_X[side];
  const centre = x + SLOT.w / 2;
  return `<g class="repo-card repo-card--${side} repo-card--${side}-v10">
      <rect class="repo-pill" x="${x + PILL.dx}" y="${PILL.y}" width="${PILL.w}" height="${PILL.h}" rx="${PILL.rx}" />
      <text class="repo-pill-text" x="${centre}" y="${PILL_TEXT_Y}" text-anchor="middle">10 USD</text>
    </g>`;
}

/**
 * The same value after somebody tried to change it: the chip they held is
 * discarded and a new chip carrying the new content takes its place. Two plates
 * and a chevron, because replacement is a shape rather than a shade.
 */
function replacedPill(): string {
  const x = SLOT_X.right;
  const centre = x + SLOT.w / 2;
  return `<g class="repo-card repo-card--right repo-card--right-v10n">
      <rect class="repo-pill repo-pill--old" x="${x + OLD_PILL.dx}" y="${OLD_PILL.y}" width="${OLD_PILL.w}" height="${OLD_PILL.h}" rx="${OLD_PILL.rx}" />
      <text class="repo-pill-text repo-pill-text--old" x="${centre}" y="${OLD_PILL_TEXT_Y}" text-anchor="middle">10 USD</text>
      <path class="repo-chevron" d="M ${centre - 14} ${CHEVRON_Y} L ${centre} ${CHEVRON_Y + 10} L ${centre + 14} ${CHEVRON_Y}" />
      <rect class="repo-pill repo-pill--new" x="${x + NEW_PILL.dx}" y="${NEW_PILL.y}" width="${NEW_PILL.w}" height="${NEW_PILL.h}" rx="${NEW_PILL.rx}" />
      <text class="repo-pill-text repo-pill-text--new" x="${centre}" y="${NEW_PILL_TEXT_Y}" text-anchor="middle">10 USD</text>
    </g>`;
}

/** A slot with nothing on it, which must not read like a card with nothing. */
function emptySlot(side: Side): string {
  const x = SLOT_X[side];
  return `<rect class="repo-card repo-card--${side} repo-card--${side}-empty repo-slot-empty" x="${x}" y="${SLOT.y}" width="${SLOT.w}" height="${SLOT.h}" rx="${SLOT.rx}" />`;
}

/** Everything one slot can be, stacked on one spot. */
const slot = (side: Side): string =>
  (SLOT_CARDS[side] ?? [])
    .map((card) => {
      if (card === 'empty') return emptySlot(side);
      if (card === 'v10') return valuePill(side);
      if (card === 'v10n') return replacedPill();
      return entityCard(side, card);
    })
    .join(pad(4));

/** The row cells: one per row the Store can hold, filled up to `rows`. */
const cells = Array.from({ length: CELLS }, (_value, index) => index + 1)
  .map(
    (n) =>
      `<rect class="repo-cell repo-cell--${n}" x="${CELL.x0 + (n - 1) * CELL.pitch}" y="${CELL.y}" width="${CELL.w}" height="${CELL.h}" rx="${CELL.rx}" />`,
  )
  .join(pad(4));

const stageAttrs = Object.entries(STAGE_STATE)
  .map(([name, value]) => `${name}="${value}"`)
  .join(' ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageAttrs} aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_LANE, Y_DOMAIN_BOTTOM, Y_REPO_TOP, 'scene-link repo-lane--call')}
  ${verticalLink(X_LANE, Y_REPO_BOTTOM, Y_STORE_TOP, 'scene-link repo-lane--store')}

  ${serviceBox({
    x: DOMAIN.x,
    width: DOMAIN.w,
    y: DOMAIN.y,
    height: DOMAIN.h,
    title: 'Domain',
    titleX: DOMAIN_TITLE.x,
    titleY: DOMAIN_TITLE.y,
    titleAnchor: null,
    className: 'scene-client repo-domain',
    children: `
    ${capsules}

    <text class="repo-service" x="${SERVICE_TEXT.x}" y="${SERVICE_TEXT.y}">Service</text>

    ${fragments}`,
  })}

  ${serviceBox({
    x: REPO.x,
    width: REPO.w,
    y: REPO.y,
    height: REPO.h,
    title: 'Repository',
    titleX: REPO_TITLE.x,
    titleY: REPO_TITLE.y,
    titleAnchor: null,
    className: 'scene-node repo-band',
    children: `
    <g class="repo-face repo-face--closed">
      <rect class="repo-face-bg" x="${FACE.x}" y="${FACE.y}" width="${FACE.w}" height="${FACE.h}" rx="${FACE.rx}" />
    </g>
    <g class="repo-face repo-face--open">
      <rect class="repo-face-bg repo-face-bg--open" x="${FACE.x}" y="${FACE.y}" width="${FACE.w}" height="${FACE.h}" rx="${FACE.rx}" />
      <text class="repo-op" x="${FIND_TEXT.x}" y="${FIND_TEXT.y}">Find</text>
      <text class="repo-op" x="${ADD_TEXT.x}" y="${ADD_TEXT.y}">Add</text>
    </g>

    <g class="repo-impl repo-impl--none">
      <rect class="repo-impl-bg" x="${IMPL.x}" y="${IMPL.y}" width="${IMPL.w}" height="${IMPL.h}" rx="${IMPL.rx}" />
    </g>
    <g class="repo-impl repo-impl--sql">
      <rect class="repo-impl-bg repo-impl-bg--sql" x="${IMPL.x}" y="${IMPL.y}" width="${IMPL.w}" height="${IMPL.h}" rx="${IMPL.rx}" />
      ${ENGINE_BARS.map(
        (y) =>
          `<rect class="repo-engine-bar" x="${ENGINE_BAR.x}" y="${y}" width="${ENGINE_BAR.w}" height="${ENGINE_BAR.h}" rx="${ENGINE_BAR.rx}" />`,
      ).join(pad(6))}
    </g>
    <g class="repo-impl repo-impl--memory">
      <rect class="repo-impl-bg repo-impl-bg--memory" x="${IMPL.x}" y="${IMPL.y}" width="${IMPL.w}" height="${IMPL.h}" rx="${IMPL.rx}" />
      ${MEMORY_DOTS_Y.flatMap((cy) =>
        MEMORY_DOTS_X.map(
          (cx) => `<circle class="repo-memory-dot" cx="${cx}" cy="${cy}" r="${MEMORY_DOT_R}" />`,
        ),
      ).join(pad(6))}
    </g>

    <g class="repo-swap">
      <rect class="repo-swap-bg" x="${SWAP.x}" y="${SWAP.y}" width="${SWAP.w}" height="${SWAP.h}" rx="${SWAP.rx}" />
      <text class="repo-swap-text" x="${SWAP_TEXT.x}" y="${SWAP_TEXT.y}" text-anchor="middle">swap</text>
    </g>

    ${slot('left')}

    ${slot('right')}

    <rect class="repo-verdict repo-verdict--none" x="${VERDICT.x}" y="${VERDICT.y}" width="${VERDICT.w}" height="${VERDICT.h}" rx="${VERDICT.rx}" />
    <g class="repo-verdict repo-verdict--same">
      <circle class="repo-verdict-lamp repo-verdict-lamp--same" cx="${VERDICT_LAMP.cx}" cy="${VERDICT_LAMP.cy}" r="${VERDICT_LAMP.r}" />
      <path class="repo-verdict-glyph" d="M ${VERDICT_LAMP.cx - 11} ${VERDICT_LAMP.cy + 1} L ${VERDICT_LAMP.cx - 3} ${VERDICT_LAMP.cy + 10} L ${VERDICT_LAMP.cx + 12} ${VERDICT_LAMP.cy - 9}" />
      <text class="repo-verdict-text" x="${VERDICT_LAMP.cx}" y="${VERDICT_TEXT_Y}" text-anchor="middle">same</text>
    </g>
    <g class="repo-verdict repo-verdict--not-same">
      <circle class="repo-verdict-lamp repo-verdict-lamp--not" cx="${VERDICT_LAMP.cx}" cy="${VERDICT_LAMP.cy}" r="${VERDICT_LAMP.r}" />
      <path class="repo-verdict-glyph" d="M ${VERDICT_LAMP.cx - 9} ${VERDICT_LAMP.cy - 9} L ${VERDICT_LAMP.cx + 9} ${VERDICT_LAMP.cy + 9} M ${VERDICT_LAMP.cx + 9} ${VERDICT_LAMP.cy - 9} L ${VERDICT_LAMP.cx - 9} ${VERDICT_LAMP.cy + 9}" />
      <text class="repo-verdict-text repo-verdict-text--not" x="${VERDICT_LAMP.cx}" y="${VERDICT_TEXT_Y}" text-anchor="middle">not same</text>
    </g>`,
  })}

  ${serviceBox({
    x: STORE.x,
    width: STORE.w,
    y: STORE.y,
    height: STORE.h,
    title: 'Store',
    titleX: STORE_TITLE.x,
    titleY: STORE_TITLE.y,
    titleAnchor: null,
    className: 'scene-service repo-store',
    children: `
    ${ROW_COUNTS.map(
      (n) =>
        `<text class="scene-counter scene-mono repo-rows repo-rows--${n}" x="${ROWS_TEXT.x}" y="${ROWS_TEXT.y}" text-anchor="end">${mono(`rows ${n}`)}</text>`,
    ).join(pad(4))}

    ${cells}`,
  })}

  ${requestsLayer()}
</svg>`;
