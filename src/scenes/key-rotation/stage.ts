/**
 * Static stage markup for the Key Rotation scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Three bands, one per party to a
 * credential that is meant to be replaced rather than kept:
 *   - y 0..440       kept empty for the step title card
 *   - y 440..680     Callers: two capsules, each showing the one key it is
 *                    currently holding (`key A`, `key B`, `key C`). A caller
 *                    changes key on a deploy, and the two deploys are apart.
 *   - y 880..1270    Service: the set it will accept (`accepts`), the signing
 *                    and verification asymmetry (`sign`, `verify`, `kid`), and
 *                    the two readouts every verdict lands in, `ok n` and
 *                    `denied n`
 *   - y 1500..1740   Keys: one card per key, each `active` or `revoked` or an
 *                    empty slot for a key not issued yet, and the `leaked` mark
 *                    that can sit on an active card or on a revoked one
 *
 * Three lane segments and no others, every one axis aligned and downward:
 *   - `X_CALL_1` (310) from the Callers' bottom edge at 680 to the Service's
 *     top edge at 880, carrying caller one's requests
 *   - `X_CALL_2` (770) the same, for caller two and for the two requests made
 *     with a leaked copy of a key
 *   - `X_KEYS` (540) from the Service's bottom edge at 1270 to the Keys' top
 *     edge at 1500, carrying the moment a key is issued or revoked. A key's
 *     state is a state, not a packet, so this lane only samples the instant the
 *     change is made; nothing travels back, because a verdict is something the
 *     Service records rather than something it posts.
 *
 * A traveller is a dot with a halo of r 26, so each lane sweeps a 52px band and
 * everything written beside one keeps 30px off it. The two upper lanes sweep
 * y 654..906 at x 284..336 and x 744..796, so the Callers write nothing below
 * y 624 in those columns and the Service writes nothing above y 936 in them.
 * The lower lane sweeps y 1244..1526 at x 514..566, so the Service writes
 * nothing below y 1214 in that column and the Keys nothing above y 1556 in it.
 *
 * Declared texture: the two caller capsules, the three key cards and the plate
 * the `leaked` mark is written on. Everything else on the stage is a word, and
 * every word is one of the fifteen fixed labels.
 *
 * Every value the reader can read is a stack of text elements on one spot with
 * the widget class hiding all of them and the current `data-*` revealing one, so
 * nothing is interpolated and scrubbing backwards lands on the value rather than
 * on an average of two. There is no continuous quantity on this stage at all:
 * a key is issued or it is not, and a set either holds a key or it does not.
 */

import { VIEWBOX, clientBox, counterVariants, requestsLayer, serviceBox, verticalLink } from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- geometry --------------------------------------------------------------

/** The three columns anything travels on, and the four edges they run between. */
export const X_CALL_1 = 310;
export const X_CALL_2 = 770;
export const X_KEYS = 540;
export const Y_CALLERS_BOTTOM = 680;
export const Y_SERVICE_TOP = 880;
export const Y_SERVICE_BOTTOM = 1270;
export const Y_KEYS_TOP = 1500;

/** The Callers band: a title, and one capsule per caller. */
const CALLERS = { x: 130, y: 440, w: 820, h: 240 };
const CALLERS_TITLE_X = 152;
const CALLERS_TITLE_Y = 500;
const CAPSULE = { w: 220, h: 72, y: 528 };
const CAPSULE_TEXT_Y = 576;

/** The Service band: the accepted set, the signing pair, and the two counts. */
const SERVICE = { x: 130, y: 880, w: 820, h: 390 };
const SERVICE_TITLE_X = 152;
const SERVICE_TITLE_Y = 992;
const ACCEPTS_X = 152;
const ACCEPTS_Y = 1064;
const SIGN_X = 152;
const VERIFY_X = 420;
const KID_X = 790;
const RING_Y = 1146;
const OK_X = 152;
const DENIED_X = 640;
const COUNT_Y = 1230;

/** The Keys band: a title, and one card per key of the series. */
const KEYS = { x: 280, y: 1500, w: 520, h: 240 };
const KEYS_TITLE_X = 302;
const KEYS_TITLE_Y = 1562;
const CARD = { y: 1580, w: 148, h: 144, gap: 20 };
const CARD_X0 = 298;
const CARD_NAME_Y = 1620;
const CARD_STATE_Y = 1670;
const LEAK_PLATE = { w: 110, h: 34, y: 1687 };
const LEAK_TEXT_Y = 1714;

// --- what the stage can say about itself -----------------------------------

/** The highest `ok` the Service can reach, which is how many variants it draws. */
export const MAX_OK = 10;

/** The highest `denied` it can reach. One refusal is the whole of the story. */
export const MAX_DENIED = 1;

/** The keys of the series, in the order they are issued. */
export const KEY_IDS = ['a', 'b', 'c'] as const;
export type KeyId = (typeof KEY_IDS)[number];

/** The two callers, told apart by the lane they send on. */
export const CALLER_IDS = ['1', '2'] as const;
export type CallerId = (typeof CALLER_IDS)[number];

/**
 * What one key card can be: a slot for a key that has not been cut yet, a key
 * the Service will accept, and a key it will not. The three are a hollow dashed
 * outline, a filled card with the word `active`, and a filled card with the word
 * `revoked`, so no two of them read alike in either theme and none of them is
 * told apart from the others by colour alone.
 */
export const CARD_STATES = ['none', 'active', 'revoked'] as const;
export type CardState = (typeof CARD_STATES)[number];

/** Whether a card carries the `leaked` mark. It can sit on any live card. */
export const FLAGS = ['off', 'on'] as const;
export type Flag = (typeof FLAGS)[number];

/**
 * Every set the Service can accept. The set is derived — a key is accepted from
 * the moment it is issued until the moment it is revoked — but the readout can
 * only draw what the stage wrote, so these five are what the model is held to.
 */
export const ACCEPTS = [
  { id: 'a', text: 'accepts A' },
  { id: 'ab', text: 'accepts A+B' },
  { id: 'b', text: 'accepts B' },
  { id: 'bc', text: 'accepts B+C' },
  { id: 'c', text: 'accepts C' },
] as const;
export type AcceptsId = (typeof ACCEPTS)[number]['id'] | 'none';

/** Which key new signatures are made with. One key, never a set. */
export const SIGN = [
  { id: 'b', text: 'sign B' },
  { id: 'c', text: 'sign C' },
] as const;

/** Which keys signatures are checked against. Always a ring, never one key. */
export const VERIFY = [
  { id: 'ab', text: 'verify A+B' },
  { id: 'bc', text: 'verify B+C' },
] as const;

/** Which key the token that just arrived says it was signed with. */
export const KID = [
  { id: 'a', text: 'kid A' },
  { id: 'b', text: 'kid B' },
] as const;

/** The world without rotation, which the first step holds up and then drops. */
export const GHOST_STATES = ['off', 'on'] as const;
export type GhostState = (typeof GHOST_STATES)[number];

/** What the scene is holding up for a moment, drawn on the band it is about. */
export const MARKS = ['none', 'edition', 'schedule', 'ring', 'discipline'] as const;
export type Mark = (typeof MARKS)[number];

/**
 * What every `data-*` on the stage starts at, keyed by the target the timeline
 * addresses it through. The markup below is written from this, so the opening
 * frame is the whole diagram in its starting state — one key cut and accepted,
 * two slots still empty, both callers holding it, nothing signed, nothing
 * counted and nothing in flight — and the timeline never restates a value that
 * is already there.
 */
export const STAGE_STATE: Record<string, string> = {
  'stage@data-kr-ghost': 'off',
  'stage@data-kr-accepts': 'a',
  'stage@data-kr-sign': 'off',
  'stage@data-kr-verify': 'off',
  'stage@data-kr-kid': 'off',
  'stage@data-kr-ok': '0',
  'stage@data-kr-denied': '0',
  'stage@data-kr-mark': 'none',
  'stage@data-kr-settled': 'off',
  'caller-1@data-kr-holds': 'a',
  'caller-2@data-kr-holds': 'a',
  'card-a@data-kr-card': 'active',
  'card-b@data-kr-card': 'none',
  'card-c@data-kr-card': 'none',
  'card-a@data-kr-leak': 'off',
  'card-b@data-kr-leak': 'off',
  'card-c@data-kr-leak': 'off',
};

// --- markup ----------------------------------------------------------------

/** Newline plus `n` spaces, the separator between lines of one fragment. */
const pad = (n: number): string => `\n${' '.repeat(n)}`;

/** Non-breaking spaces, so a monospaced readout keeps its gaps in SVG. */
const mono = (text: string): string => text.replace(/ /g, '&#160;');

/** The centre x of key card `index`, counting from zero. */
const cardX = (index: number): number => CARD_X0 + index * (CARD.w + CARD.gap);

/** The centre x of caller `n`'s capsule, which is the lane it sends on. */
const capsuleX = (id: CallerId): number => (id === '1' ? X_CALL_1 : X_CALL_2);

/**
 * A stack of text elements on one spot, one per value the readout can hold,
 * hidden by the widget class and revealed one at a time by the current `data-*`.
 */
const valueVariants = (
  x: number,
  y: number,
  className: string,
  entries: readonly { id: string; text: string }[],
  size: string,
  anchor: string | null,
  indent: number,
): string =>
  entries
    .map(
      (entry) =>
        `<text class="scene-counter scene-mono ${className} ${className}--${entry.id} ${size}" x="${x}" y="${y}"${anchor ? ` text-anchor="${anchor}"` : ''}>${mono(entry.text)}</text>`,
    )
    .join(pad(indent));

/**
 * One caller: a capsule, and the name of the one key it is holding. The capsule
 * is always drawn, because a caller does not appear and disappear; what changes
 * is which key it presents, and that changes on a deploy.
 */
const caller = (id: CallerId): string => {
  const cx = capsuleX(id);
  const keys = KEY_IDS.map(
    (key) =>
      `<text class="scene-counter scene-mono kr-caller-key kr-caller-key--${key}" x="${cx}" y="${CAPSULE_TEXT_Y}" text-anchor="middle">${mono(`key ${key.toUpperCase()}`)}</text>`,
  ).join(pad(6));
  return `<g class="kr-caller kr-caller--${id}" data-kr-holds="${STAGE_STATE[`caller-${id}@data-kr-holds`]}">
      <rect class="kr-caller-bg" x="${cx - CAPSULE.w / 2}" y="${CAPSULE.y}" width="${CAPSULE.w}" height="${CAPSULE.h}" rx="20" />
      ${keys}
    </g>`;
};

/**
 * One key card: the plate, the key's name, the word that says whether the
 * Service will take it, and the mark that says a copy of it is loose. The mark
 * is written on its own plate so it stays legible whichever card it lands on.
 */
const card = (key: KeyId, index: number): string => {
  const x = cardX(index);
  const cx = x + CARD.w / 2;
  const states = (['active', 'revoked'] as const)
    .map(
      (state) =>
        `<text class="scene-counter scene-mono kr-card-state kr-card-state--${state}" x="${cx}" y="${CARD_STATE_Y}" text-anchor="middle">${state}</text>`,
    )
    .join(pad(6));
  return `<g class="kr-card kr-card--${key}" data-kr-card="${STAGE_STATE[`card-${key}@data-kr-card`]}" data-kr-leak="off">
      <rect class="kr-card-bg" x="${x}" y="${CARD.y}" width="${CARD.w}" height="${CARD.h}" rx="18" />
      <text class="scene-mono kr-card-name" x="${cx}" y="${CARD_NAME_Y}" text-anchor="middle">${mono(`key ${key.toUpperCase()}`)}</text>
      ${states}
      <g class="kr-card-leak">
        <rect class="kr-card-leak-bg" x="${cx - LEAK_PLATE.w / 2}" y="${LEAK_PLATE.y}" width="${LEAK_PLATE.w}" height="${LEAK_PLATE.h}" rx="10" />
        <text class="scene-mono kr-card-leak-text" x="${cx}" y="${LEAK_TEXT_Y}" text-anchor="middle">leaked</text>
      </g>
    </g>`;
};

/** The count of calls the Service let through, and the count it refused. */
const okReadout = counterVariants({
  x: OK_X,
  y: COUNT_Y,
  className: 'kr-ok',
  count: MAX_OK + 1,
  format: (n) => mono(`ok ${n}`),
  indent: 4,
});

const deniedReadout = counterVariants({
  x: DENIED_X,
  y: COUNT_Y,
  className: 'kr-denied',
  count: MAX_DENIED + 1,
  format: (n) => mono(`denied ${n}`),
  indent: 4,
});

const stageAttrs = Object.entries(STAGE_STATE)
  .filter(([key]) => key.startsWith('stage@'))
  .map(([key, value]) => `${key.slice('stage@'.length)}="${value}"`)
  .join(' ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageAttrs} aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_CALL_1, Y_CALLERS_BOTTOM, Y_SERVICE_TOP)}
  ${verticalLink(X_CALL_2, Y_CALLERS_BOTTOM, Y_SERVICE_TOP)}
  ${verticalLink(X_KEYS, Y_SERVICE_BOTTOM, Y_KEYS_TOP, 'scene-link kr-lane--keys')}

  ${clientBox({
    x: CALLERS.x,
    width: CALLERS.w,
    y: CALLERS.y,
    height: CALLERS.h,
    title: 'Callers',
    titleX: CALLERS_TITLE_X,
    titleY: CALLERS_TITLE_Y,
    titleAnchor: null,
    children: `
    ${CALLER_IDS.map(caller).join(pad(4))}`,
  })}

  ${serviceBox({
    x: SERVICE.x,
    width: SERVICE.w,
    y: SERVICE.y,
    height: SERVICE.h,
    title: 'Service',
    titleX: SERVICE_TITLE_X,
    titleY: SERVICE_TITLE_Y,
    titleAnchor: null,
    className: 'scene-node kr-service',
    children: `
    ${valueVariants(ACCEPTS_X, ACCEPTS_Y, 'kr-accepts', ACCEPTS, 'kr-lead', null, 4)}

    ${valueVariants(SIGN_X, RING_Y, 'kr-sign', SIGN, 'kr-ring', null, 4)}

    ${valueVariants(VERIFY_X, RING_Y, 'kr-verify', VERIFY, 'kr-ring', null, 4)}

    ${valueVariants(KID_X, RING_Y, 'kr-kid', KID, 'kr-ring', null, 4)}

    ${okReadout}

    ${deniedReadout}`,
  })}

  ${serviceBox({
    x: KEYS.x,
    width: KEYS.w,
    y: KEYS.y,
    height: KEYS.h,
    title: 'Keys',
    titleX: KEYS_TITLE_X,
    titleY: KEYS_TITLE_Y,
    titleAnchor: null,
    className: 'scene-service kr-keys',
    children: `
    ${KEY_IDS.map(card).join(pad(4))}`,
  })}

  ${requestsLayer()}
</svg>`;
