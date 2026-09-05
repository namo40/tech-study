/**
 * Static stage markup for the CAP Theorem scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Three bands, read as one sentence
 * about what a network partition takes away and what it leaves you to decide:
 *   - y 0..400       above the cropped viewBox (see shared VIEWBOX)
 *   - y 400..440     the frame's top padding; nothing is drawn here
 *   - y 440..680     Clients (x 130..950): the `write` and `read` chips that
 *                    light while a request of that kind is outstanding, the
 *                    `ok n` readout counting reads that came back with an
 *                    answer, and the `ms n` meter the fourth step turns on to
 *                    show what a read cost
 *   - y 880..1270    Replicas (x 130..950): the `R1` and `R2` capsules, the
 *                    value each of them holds, the `link` wiring between them
 *                    in its four states, and the two-answers plate the first
 *                    step's ghost puts between them when one question comes
 *                    back with two honest answers
 *   - y 1500..1740   Choice (x 280..800): the `C` card and the `A` card, one of
 *                    which is lit once a choice has been made, each carrying
 *                    the lamp for the price that choice charges — `wait` on the
 *                    `C` card, `stale` on the `A` card
 *
 * Three lane segments and no others, every one axis aligned and every one
 * ending on a box edge:
 *   - `X_R1` (310) between the Clients band's bottom edge at 680 and the
 *     Replicas band's top edge at 880. It runs both ways: a request rides it
 *     down to `R1` and its answer rides it back up.
 *   - `X_R2` (770), the same two edges, for `R2`.
 *   - `X_VERDICT` (540) from the Replicas band's bottom edge at 1270 to the
 *     Choice band's top edge at 1500, downward only. What rides it is the
 *     verdict a read came back with when that verdict has a name on a card:
 *     a refusal lighting `wait`, or an answer marked `stale`.
 *
 * Replication between the two replicas is not a traveller. It is a state of the
 * `link` wiring, because the point of this scene is that the wire is either
 * carrying agreement or it is not, and a dot sliding along it would suggest the
 * cut is a place a message can be stuck rather than a thing that has happened.
 *
 * A traveller is a dot with a halo of r 26, so each lane sweeps a 52px band and
 * everything written beside one keeps 30px off it. The two upper lanes sweep
 * y 654..906 at x 284..336 and x 744..796, so the Clients band writes nothing
 * below y 640 in those columns and the Replicas band nothing above y 936 in
 * them, which is why the capsules start at y 980 and the `Replicas` title sits
 * on the free column between the two lanes. The lower lane sweeps y 1244..1526
 * at x 514..566, so the Replicas band puts nothing below y 1180 and the Choice
 * band writes nothing above y 1556 in that column.
 *
 * Declared texture: the two request chips, the two replica capsules, the two
 * value plates, the `link` wiring in its four spellings and its glyphs, the
 * two-answers plate and its divergence glyph, the two choice cards and the two
 * lamp plates. Everything else on the stage is a word, and every word is one of
 * the fourteen fixed labels or a number.
 *
 * Nothing is told apart by colour alone. A chip that is lit is a **filled
 * plate** and one that is not is a **hollow dashed outline**; a healthy `link`
 * is **one unbroken rule**, a severed one is **two stubs with a break drawn
 * between them**, a replicating one carries **an arrowhead pointing at `R2`**
 * and a consulting one carries **an arrowhead at each end**; a card that has
 * been chosen is a **filled plate** and one that has not is **dashed**; a lamp
 * that is lit is **filled** and one that is not is **hollow and dashed**; an
 * answer that is not the latest carries a **dashed ring** around its check; a
 * refusal is the **cross** every scene uses; and the two-answers plate is a
 * shape that exists at all only while the ghost is up.
 *
 * Every value the reader can read is a stack of elements on one spot with a
 * base rule hiding all of them and the current `data-*` revealing exactly one,
 * so nothing is interpolated and scrubbing backwards lands on the value rather
 * than on an average of two: the `ok n` readout, the `ms n` meter, both request
 * chips, both value plates, both halves of the two-answers plate, the `link`
 * wiring, both cards and both lamps. There is no continuous quantity anywhere
 * on this stage.
 */

import { VIEWBOX, requestsLayer, serviceBox, verticalLink } from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- geometry --------------------------------------------------------------

/** The three columns anything travels on, and the four edges they run between. */
export const X_R1 = 310;
export const X_R2 = 770;
export const X_VERDICT = 540;
export const Y_CLIENTS_BOTTOM = 680;
export const Y_REPLICAS_TOP = 880;
export const Y_REPLICAS_BOTTOM = 1270;
export const Y_CHOICE_TOP = 1500;

/** The Clients band: what is outstanding, what came back, and what it cost. */
const CLIENTS = { x: 130, y: 440, w: 820, h: 240 };
const CLIENTS_TITLE = { x: 152, y: 500 };
const OK = { x: 928, y: 500 };
const MS = { x: 928, y: 558 };
const CHIP = { y: 574, w: 138, h: 58, rx: 18, textDy: 38 };
const CHIP_X: Record<string, number> = { write: 396, read: 554 };

/** The Replicas band: two copies, what each holds, and the wire between them. */
const REPLICAS = { x: 130, y: 880, w: 820, h: 390 };
const REPLICAS_TITLE = { x: 540, y: 938 };
const CAP = { y: 980, w: 280, h: 200, rx: 26 };
const CAP_X: Record<string, number> = { r1: 150, r2: 650 };
const NAME_DX = 24;
const NAME_Y = 1032;
const VAL = { dx: 24, y: 1076, w: 232, h: 78, rx: 18, textDy: 56 };

/** The wiring, and the one word that says what it is. */
const LINK = { x1: 430, x2: 650, y: 1080 };
const LINK_TEXT = { x: 540, y: 1036 };
/** Where the severed wiring stops, and the break drawn in the gap. */
const STUB = { left: 504, right: 576 };
const BREAK = { x: [516, 546], y0: 1062, y1: 1098 };
/** The arrowheads: one towards `R2` while replicating, two while consulting. */
const HEAD_R = { x: 646, back: 622, y0: 1066, y1: 1094 };
const HEAD_L = { x: 434, back: 458, y0: 1066, y1: 1094 };

/** The plate the ghost puts between the capsules: one question, two answers. */
const SPLIT = { x: 448, y: 1100, w: 184, h: 70, rx: 16 };
const SPLIT_TEXT = { left: 494, right: 586, y: 1148 };
const SPLIT_GLYPH = { x: [532, 548], y0: 1114, y1: 1156 };

/** The Choice band: the two cards, and the price each of them charges. */
const CHOICE = { x: 280, y: 1500, w: 520, h: 240 };
const CHOICE_TITLE = { x: 302, y: 1560 };
const CARD = { y: 1600, w: 220, h: 110, rx: 22 };
const CARD_X: Record<string, number> = { c: 300, a: 560 };
const LETTER_DX = 32;
const LETTER_Y = 1678;
const LAMP = { dx: 86, y: 1626, w: 114, h: 58, rx: 16, textDy: 38 };

// --- what the stage can say about itself -----------------------------------

/** The two replicas, left to right. */
export const REPLICA_IDS = ['r1', 'r2'] as const;
export type ReplicaId = (typeof REPLICA_IDS)[number];

/** The name the fixed labels give a replica. */
export const upper = (id: ReplicaId): string => id.toUpperCase();

/**
 * Every value a replica ever holds. The scene writes four times and each write
 * moves the value on by one, so the stage draws a plate per value and the model
 * is refused if it ever asks for one that is not here.
 */
export const VALUE_MIN = 4;
export const VALUE_MAX = 8;
export const VALUES = Array.from(
  { length: VALUE_MAX - VALUE_MIN + 1 },
  (_v, n) => VALUE_MIN + n,
);

/** The state of the wiring between the replicas. */
export const LINKS = ['ok', 'sync', 'consult', 'cut'] as const;
export type LinkState = (typeof LINKS)[number];

/** Which card is lit, if any. */
export const CARDS = ['none', 'c', 'a'] as const;
export type CardState = (typeof CARDS)[number];

/** Which price is being paid right now, if either. */
export const LAMPS = ['none', 'wait', 'stale'] as const;
export type LampState = (typeof LAMPS)[number];

/** Whether a request of that kind is outstanding. */
export const CHIPS = ['off', 'on'] as const;

/** Every value the `ok n` readout is ever set to. */
export const OK_MAX = 8;

/**
 * Every reading the `ms n` meter can show. The meter is off until the fourth
 * step measures a read; the two values are the round trip a strong read pays
 * and the one a relaxed read pays, and the model is refused if a read costs
 * anything else.
 */
export const MS_VALUES = [90, 150];

/** What the scene is holding up for a moment, drawn on the thing it is about. */
export const MARKS = ['none', 'p', 'ca', 'plain', 'else'] as const;
export type Mark = (typeof MARKS)[number];

/**
 * What an answer turned out to be. `unmarked` is the first step's answer: with
 * no card chosen there is no rule under which an answer could be called old, so
 * both sides answer and neither of them is wearing anything.
 */
export const ANSWERS = ['none', 'unmarked', 'fresh', 'stale', 'refused'] as const;
export type Answer = (typeof ANSWERS)[number];

/**
 * What every `data-*` on the stage starts at. The markup below is written from
 * this, so the opening frame is the whole diagram in its starting state — two
 * replicas holding the same value, a healthy `link`, no card chosen, no lamp
 * lit, `ok 0`, no meter and nothing in flight — and the timeline never restates
 * a value that is already there.
 */
export const STAGE_STATE: Record<string, string> = {
  'stage@data-cap-link': 'ok',
  'stage@data-cap-r1': String(VALUE_MIN),
  'stage@data-cap-r2': String(VALUE_MIN),
  'stage@data-cap-split': 'off',
  'stage@data-cap-ghost': 'off',
  'stage@data-cap-card': 'none',
  'stage@data-cap-lamp': 'none',
  'stage@data-cap-ok': '0',
  'stage@data-cap-ms': 'off',
  'stage@data-cap-write': 'off',
  'stage@data-cap-read': 'off',
  'stage@data-cap-mark': 'none',
  'stage@data-cap-settled': 'off',
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
      `<text class="scene-counter cap-ok cap-ok--${n}" x="${OK.x}" y="${OK.y}" text-anchor="end">${mono(`ok ${n}`)}</text>`,
  )
  .join(pad(4));

/** The `ms n` meter: one text per reading, and nothing at all while it is off. */
const msVariants = MS_VALUES.map(
  (n) =>
    `<text class="scene-counter cap-ms cap-ms--${n}" x="${MS.x}" y="${MS.y}" text-anchor="end">${mono(`ms ${n}`)}</text>`,
).join(pad(4));

/** One request chip: a plate in both spellings, and the word that names it. */
const requestChip = (id: 'write' | 'read'): string => {
  const x = CHIP_X[id] ?? 0;
  return [
    `<rect class="cap-chip-bg cap-chip-bg--${id}-off" x="${x}" y="${CHIP.y}" width="${CHIP.w}" height="${CHIP.h}" rx="${CHIP.rx}" />`,
    `<rect class="cap-chip-bg cap-chip-bg--${id}-on" x="${x}" y="${CHIP.y}" width="${CHIP.w}" height="${CHIP.h}" rx="${CHIP.rx}" />`,
    `<text class="cap-chip-word cap-chip-word--${id}" x="${x + CHIP.w / 2}" y="${CHIP.y + CHIP.textDy}" text-anchor="middle">${id}</text>`,
  ].join(pad(4));
};

/** The value one replica holds, one text variant per value it can hold. */
const valuePlate = (id: ReplicaId): string => {
  const x = (CAP_X[id] ?? 0) + VAL.dx;
  const text = VALUES.map(
    (n) =>
      `<text class="scene-counter cap-val-text cap-val-text--${id}-${n}" x="${x + VAL.w / 2}" y="${VAL.y + VAL.textDy}" text-anchor="middle">${n}</text>`,
  ).join(pad(6));
  return `<rect class="cap-val-bg" x="${x}" y="${VAL.y}" width="${VAL.w}" height="${VAL.h}" rx="${VAL.rx}" />
      ${text}`;
};

/** One replica capsule: a plate, its name, and the value it is holding. */
const capsule = (id: ReplicaId): string => {
  const x = CAP_X[id] ?? 0;
  return `<g class="cap-node cap-node--${id}">
      <rect class="cap-node-bg" x="${x}" y="${CAP.y}" width="${CAP.w}" height="${CAP.h}" rx="${CAP.rx}" />
      <text class="cap-name" x="${x + NAME_DX}" y="${NAME_Y}">${upper(id)}</text>
      ${valuePlate(id)}
    </g>`;
};

/** An arrowhead on the wiring, pointing the way agreement is travelling. */
const head = (spec: { x: number; back: number; y0: number; y1: number }, side: string): string =>
  `<path class="cap-link-head cap-link-head--${side}" d="M ${spec.back} ${spec.y0} L ${spec.x} ${LINK.y} L ${spec.back} ${spec.y1}" />`;

/** The wiring in its four spellings, exactly one of which is ever revealed. */
const wiring = [
  `<line class="cap-link-line cap-link-line--ok" x1="${LINK.x1}" y1="${LINK.y}" x2="${LINK.x2}" y2="${LINK.y}" />`,
  `<line class="cap-link-line cap-link-line--sync" x1="${LINK.x1}" y1="${LINK.y}" x2="${LINK.x2}" y2="${LINK.y}" />`,
  `<line class="cap-link-line cap-link-line--consult" x1="${LINK.x1}" y1="${LINK.y}" x2="${LINK.x2}" y2="${LINK.y}" />`,
  `<line class="cap-link-stub" x1="${LINK.x1}" y1="${LINK.y}" x2="${STUB.left}" y2="${LINK.y}" />`,
  `<line class="cap-link-stub" x1="${STUB.right}" y1="${LINK.y}" x2="${LINK.x2}" y2="${LINK.y}" />`,
  ...BREAK.x.map(
    (x) => `<path class="cap-link-break" d="M ${x} ${BREAK.y1} L ${x + 18} ${BREAK.y0}" />`,
  ),
  head(HEAD_R, 'right'),
  head(HEAD_L, 'left'),
].join(pad(4));

/**
 * The two-answers plate. Both halves are the same value stacks the capsules
 * carry, so the two answers the ghost holds up are the two values the replicas
 * actually hold and never a pair written down beside them.
 */
const splitHalf = (id: ReplicaId, centre: number): string =>
  VALUES.map(
    (n) =>
      `<text class="scene-counter cap-split-text cap-split-text--${id}-${n}" x="${centre}" y="${SPLIT_TEXT.y}" text-anchor="middle">${n}</text>`,
  ).join(pad(6));

const splitPlate = `<g class="cap-split">
      <rect class="cap-split-bg" x="${SPLIT.x}" y="${SPLIT.y}" width="${SPLIT.w}" height="${SPLIT.h}" rx="${SPLIT.rx}" />
      ${SPLIT_GLYPH.x
        .map(
          (x) =>
            `<line class="cap-split-glyph" x1="${x}" y1="${SPLIT_GLYPH.y0}" x2="${x}" y2="${SPLIT_GLYPH.y1}" />`,
        )
        .join(pad(6))}
      ${splitHalf('r1', SPLIT_TEXT.left)}
      ${splitHalf('r2', SPLIT_TEXT.right)}
    </g>`;

/** One choice card: a plate in both spellings, its letter, and its lamp. */
const card = (id: 'c' | 'a', lamp: 'wait' | 'stale'): string => {
  const x = CARD_X[id] ?? 0;
  const lampX = x + LAMP.dx;
  return `<g class="cap-card cap-card--${id}">
      <rect class="cap-card-bg cap-card-bg--${id}-off" x="${x}" y="${CARD.y}" width="${CARD.w}" height="${CARD.h}" rx="${CARD.rx}" />
      <rect class="cap-card-bg cap-card-bg--${id}-on" x="${x}" y="${CARD.y}" width="${CARD.w}" height="${CARD.h}" rx="${CARD.rx}" />
      <text class="cap-letter" x="${x + LETTER_DX}" y="${LETTER_Y}">${id.toUpperCase()}</text>
      <rect class="cap-lamp-bg cap-lamp-bg--${lamp}-off" x="${lampX}" y="${LAMP.y}" width="${LAMP.w}" height="${LAMP.h}" rx="${LAMP.rx}" />
      <rect class="cap-lamp-bg cap-lamp-bg--${lamp}-on" x="${lampX}" y="${LAMP.y}" width="${LAMP.w}" height="${LAMP.h}" rx="${LAMP.rx}" />
      <text class="cap-lamp-word cap-lamp-word--${lamp}" x="${lampX + LAMP.w / 2}" y="${LAMP.y + LAMP.textDy}" text-anchor="middle">${lamp}</text>
    </g>`;
};

const stageAttrs = Object.entries(STAGE_STATE)
  .filter(([key]) => key.startsWith('stage@'))
  .map(([key, value]) => `${key.slice('stage@'.length)}="${value}"`)
  .join(' ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageAttrs} aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_R1, Y_CLIENTS_BOTTOM, Y_REPLICAS_TOP, 'scene-link cap-lane--r1')}
  ${verticalLink(X_R2, Y_CLIENTS_BOTTOM, Y_REPLICAS_TOP, 'scene-link cap-lane--r2')}
  ${verticalLink(X_VERDICT, Y_REPLICAS_BOTTOM, Y_CHOICE_TOP, 'scene-link cap-lane--verdict')}

  ${serviceBox({
    x: CLIENTS.x,
    width: CLIENTS.w,
    y: CLIENTS.y,
    height: CLIENTS.h,
    title: 'Clients',
    titleX: CLIENTS_TITLE.x,
    titleY: CLIENTS_TITLE.y,
    titleClass: 'scene-node-title cap-title',
    titleAnchor: null,
    className: 'scene-client cap-clients',
    children: `
    ${okVariants}

    ${msVariants}

    ${requestChip('write')}

    ${requestChip('read')}`,
  })}

  ${serviceBox({
    x: REPLICAS.x,
    width: REPLICAS.w,
    y: REPLICAS.y,
    height: REPLICAS.h,
    title: 'Replicas',
    titleX: REPLICAS_TITLE.x,
    titleY: REPLICAS_TITLE.y,
    titleClass: 'scene-node-title cap-title',
    className: 'scene-node cap-replicas',
    children: `
    ${capsule('r1')}

    ${capsule('r2')}

    <g class="cap-link">
      ${wiring}
      <text class="cap-link-word" x="${LINK_TEXT.x}" y="${LINK_TEXT.y}" text-anchor="middle">link</text>
    </g>

    ${splitPlate}`,
  })}

  ${serviceBox({
    x: CHOICE.x,
    width: CHOICE.w,
    y: CHOICE.y,
    height: CHOICE.h,
    title: 'Choice',
    titleX: CHOICE_TITLE.x,
    titleY: CHOICE_TITLE.y,
    titleClass: 'scene-node-title cap-title',
    titleAnchor: null,
    className: 'scene-service cap-choice',
    children: `
    ${card('c', 'wait')}

    ${card('a', 'stale')}`,
  })}

  ${requestsLayer()}
</svg>`;
