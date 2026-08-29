/**
 * Static stage markup for the OAuth 2.0 scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Four bands, arranged around the one
 * question the whole framework answers — how does an app act for you without
 * becoming you:
 *   - y 0..440       kept empty for the step title card
 *   - y 440..680     the App, with the token wallet (`access`, `refresh`, `id`)
 *                    and the `expires` bar that says how much life the access
 *                    token has left, plus the `password` the old way handed over
 *   - y 880..1270    the Auth Server on the left (`consent` received, `openid`
 *                    asked for, which `refresh #n` of the family is current, and
 *                    the `revoked` lamp) and the API on the right (`scope read`,
 *                    the `ok n` readout, and `401`)
 *   - y 1500..1740   the User, who is the one that consents, and the identity
 *                    card the `id` token is
 *
 * Three lane segments and no others, every one axis aligned:
 *   - `X_AUTH` (310) between the App's bottom edge and the Auth Server's top
 *     edge. It carries traffic BOTH ways: requests and the code exchange go
 *     down, and the code and the tokens come back up. The schedule keeps the
 *     two apart, because a request that has not faded is still on the lane.
 *   - `X_API` (770) between the App's bottom edge and the API's top edge, also
 *     both ways: the call goes down and `401` comes back up.
 *   - `X_AUTH` again between the Auth Server's bottom edge and the User's top
 *     edge, downward only. The consent request travels; the answer is the
 *     User's own state changing, because a human saying yes is not a packet.
 *
 * A traveller is a dot with a halo of r 26, so each lane sweeps a 52px band and
 * everything written beside one keeps 30px off it. The two top lanes sweep
 * y 654..906 at x 284..336 and x 744..796, so the App writes nothing below
 * y 624 in those columns and the Auth Server and the API write nothing above
 * y 936 in them. The consent lane sweeps y 1244..1526 at x 284..336, so the
 * Auth Server writes nothing below y 1214 in that column and the User writes
 * nothing above y 1556 in it.
 *
 * Every value the reader can read is a stack of text elements on one spot with
 * CSS revealing the one the current `data-*` names, so nothing is interpolated
 * and scrubbing backwards lands on the right value without undoing anything.
 * The one exception is the `expires` bar, which is a genuine continuous
 * quantity: it is a width tween, because a token's remaining life really is a
 * continuous thing and the reader is meant to watch it run out.
 */

import { VIEWBOX, clientBox, counterVariants, requestsLayer, serviceBox, trackAndFill } from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- geometry --------------------------------------------------------------

/** The two columns anything travels on, and the four edges they run between. */
export const X_AUTH = 310;
export const X_API = 770;
export const Y_APP_BOTTOM = 680;
export const Y_MID_TOP = 880;
export const Y_MID_BOTTOM = 1270;
export const Y_USER_TOP = 1500;

/** The App band: the wallet, the life of what is in it, and the old way. */
const APP = { x: 130, y: 440, w: 820, h: 240 };
const APP_TITLE_X = 152;
const APP_TITLE_Y = 500;
const SLOT_Y = 524;
const SLOT_H = 52;
const SLOT_W = 156;
const SLOT_GAP = 16;
const SLOT_X = 152;
const SLOT_TEXT_Y = 558;
const GHOST_X = 152;
const GHOST_Y = 614;
const GHOST_STRIKE_Y = 604;
const GHOST_STRIKE_W = 148;
const LIFE_LABEL_X = 928;
const BAR_X = 700;
const BAR_Y = 524;
/** Width of the life bar when the access token has just been issued. */
export const BAR_W = 228;
const BAR_H = 16;

/** The Auth Server band: what it was told, what it issued, and what it killed. */
const AUTH = { x: 130, y: 880, w: 360, h: 390 };
const AUTH_TITLE_X = 152;
const AUTH_TITLE_Y = 986;
const AUTH_TEXT_X = 152;
const CONSENT_Y = 1042;
const OPENID_Y = 1095;
const FAMILY_Y = 1148;
const LAMP = { cx: 170, cy: 1191, r: 14 };
const REVOKED_X = 200;
const REVOKED_Y = 1201;

/** The API band: what it checks, what it answered, and what it refused. */
const API = { x: 590, y: 880, w: 360, h: 390 };
const API_TITLE_X = 612;
const API_TITLE_Y = 986;
const API_TEXT_X = 612;
const SCOPE_Y = 1044;
const OK_Y = 1104;
const DENY_Y = 1164;

/** The User band: the one who consents, and the identity the id token states. */
const USER = { x: 280, y: 1500, w: 520, h: 240 };
const USER_TITLE_X = 302;
const USER_TITLE_Y = 1606;
const CONSENT_LAMP = { cx: 322, cy: 1654, r: 16 };
const USER_CONSENT_X = 356;
const USER_CONSENT_Y = 1664;
const CARD = { x: 560, y: 1630, w: 180, h: 56 };
const CARD_TEXT_Y = 1665;

// --- what the stage can say about itself -----------------------------------

/** The highest `ok` the API can reach, which is how many variants it draws. */
export const MAX_OK = 5;

/**
 * How long an access token lives, in seconds of scene time. Fifteen real
 * minutes are five and a quarter seconds here; the number matters because
 * everything about expiry in the scene is derived from it rather than placed.
 */
export const ACCESS_TTL = 5.25;

/** The fraction of its life an access token has spent when it is called low. */
export const LOW_WATER = 0.8;

/** The label the bar carries, which is the number a reader would configure. */
const TTL_LABEL = 'expires';

/** Which refresh token of the current family the wallet is holding. */
export const FAMILY_INDEXES = [1, 2] as const;

/** What the App is holding in one wallet slot. */
export const SLOT_STATES = ['none', 'live', 'expired', 'revoked'] as const;
export type SlotState = (typeof SLOT_STATES)[number];

/** How much life the access token has left, as a word rather than a width. */
export const LIFE_STATES = ['none', 'live', 'low', 'spent'] as const;
export type LifeState = (typeof LIFE_STATES)[number];

/** Which scope the grant carries, which decides what the API and server show. */
export const SCOPE_STATES = ['none', 'read', 'openid'] as const;
export type ScopeState = (typeof SCOPE_STATES)[number];

/** The old way, and what the scene ends up saying about it. */
export const GHOST_STATES = ['off', 'on', 'never'] as const;
export type GhostState = (typeof GHOST_STATES)[number];

/** What the scene is holding up for a moment, if anything. */
export const MARKS = ['none', 'expiry', 'once', 'identity'] as const;
export type Mark = (typeof MARKS)[number];

/**
 * What every `data-*` on the stage starts at. The markup is written from these,
 * so the first frame is the whole diagram in its opening state — an App with an
 * empty wallet, a server that has issued nothing, an API that has answered
 * nothing, and a User who has not been asked yet — and the timeline never
 * restates a value something already holds.
 */
export const STAGE_STATE: Record<string, string> = {
  'data-oa-ghost': 'off',
  'data-oa-access': 'none',
  'data-oa-refresh': 'none',
  'data-oa-id': 'none',
  'data-oa-life': 'none',
  'data-oa-family': '0',
  'data-oa-consent': 'off',
  'data-oa-scope': 'none',
  'data-oa-openid': 'off',
  'data-oa-ok': '0',
  'data-oa-401': 'off',
  'data-oa-revoked': 'off',
  'data-oa-idcard': 'off',
  'data-oa-mark': 'none',
  'data-oa-settled': 'off',
};

// --- markup ----------------------------------------------------------------

const pad = (n: number): string => `\n${' '.repeat(n)}`;

/** A stack of text variants on one spot, of which CSS reveals at most one. */
const variants = (
  className: string,
  x: number,
  y: number,
  anchor: string | null,
  entries: readonly (readonly [string, string])[],
  indent = 4,
): string =>
  entries
    .map(
      ([value, label]) =>
        `<text class="${className} ${className}--${value}" x="${x}" y="${y}"${anchor ? ` text-anchor="${anchor}"` : ''}>${label}</text>`,
    )
    .join(pad(indent));

/**
 * One wallet slot: the plate a token sits on, the word that names which token
 * it is, and the line drawn through it once that token is no longer worth
 * anything. The word is always written, because the slot is a labelled place
 * rather than a surprise; what changes is whether the plate is holding
 * something, and the state says which of the three ways it stopped.
 */
const walletSlot = (name: string, index: number): string => {
  const x = SLOT_X + index * (SLOT_W + SLOT_GAP);
  return `<g class="oa-slot oa-slot--${name}">
        <rect class="scene-slot oa-slot-bg" x="${x}" y="${SLOT_Y}" width="${SLOT_W}" height="${SLOT_H}" rx="16" />
        <text class="oa-slot-text" x="${x + SLOT_W / 2}" y="${SLOT_TEXT_Y}" text-anchor="middle">${name}</text>
        <line class="oa-slot-strike" x1="${x + 18}" y1="${SLOT_Y + SLOT_H / 2}" x2="${x + SLOT_W - 18}" y2="${SLOT_Y + SLOT_H / 2}" />
      </g>`;
};

const wallet = ['access', 'refresh', 'id'].map(walletSlot).join(pad(6));

/** The count of calls the API has let through. Nothing else counts here. */
const okReadout = counterVariants({
  x: API_TEXT_X,
  y: OK_Y,
  className: 'oa-ok',
  count: MAX_OK + 1,
  format: (n) => `ok ${n}`,
  indent: 4,
});

/** Which refresh token of the current family is the live one. */
const familyReadout = FAMILY_INDEXES.map(
  (n) =>
    `<text class="scene-counter oa-family oa-family--${n}" x="${AUTH_TEXT_X}" y="${FAMILY_Y}">refresh #${n}</text>`,
).join(pad(4));

const stageAttrs = Object.entries(STAGE_STATE)
  .map(([name, value]) => `${name}="${value}"`)
  .join(' ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageAttrs} aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  <line class="scene-link oa-lane-auth" x1="${X_AUTH}" y1="${Y_APP_BOTTOM}" x2="${X_AUTH}" y2="${Y_MID_TOP}" />
  <line class="scene-link oa-lane-api" x1="${X_API}" y1="${Y_APP_BOTTOM}" x2="${X_API}" y2="${Y_MID_TOP}" />
  <line class="scene-link oa-lane-user" x1="${X_AUTH}" y1="${Y_MID_BOTTOM}" x2="${X_AUTH}" y2="${Y_USER_TOP}" />

  ${clientBox({
    x: APP.x,
    width: APP.w,
    y: APP.y,
    height: APP.h,
    title: 'App',
    titleX: APP_TITLE_X,
    titleY: APP_TITLE_Y,
    titleAnchor: null,
    extraClass: 'oa-app',
    children: `
    <text class="oa-life-label" x="${LIFE_LABEL_X}" y="${APP_TITLE_Y}" text-anchor="end">${TTL_LABEL}</text>
    ${trackAndFill({
      x: BAR_X,
      y: BAR_Y,
      width: BAR_W,
      height: BAR_H,
      rx: BAR_H / 2,
      className: 'oa-life',
    })}

    <g>
      ${wallet}
    </g>

    <g class="oa-ghost">
      ${variants('oa-ghost-text', GHOST_X, GHOST_Y, null, [['word', 'password']], 6)}
      <line class="oa-ghost-strike" x1="${GHOST_X - 2}" y1="${GHOST_STRIKE_Y}" x2="${GHOST_X + GHOST_STRIKE_W}" y2="${GHOST_STRIKE_Y}" />
    </g>`,
  })}

  ${serviceBox({
    x: AUTH.x,
    width: AUTH.w,
    y: AUTH.y,
    height: AUTH.h,
    title: 'Auth Server',
    titleX: AUTH_TITLE_X,
    titleY: AUTH_TITLE_Y,
    titleAnchor: null,
    className: 'scene-node oa-auth',
    children: `
    ${variants('oa-heard', AUTH_TEXT_X, CONSENT_Y, null, [['on', 'consent']])}

    ${variants('oa-ask', AUTH_TEXT_X, OPENID_Y, null, [['on', 'openid']])}

    ${familyReadout}

    <circle class="oa-lamp" cx="${LAMP.cx}" cy="${LAMP.cy}" r="${LAMP.r}" />
    ${variants('oa-revoked', REVOKED_X, REVOKED_Y, null, [['on', 'revoked']])}`,
  })}

  ${serviceBox({
    x: API.x,
    width: API.w,
    y: API.y,
    height: API.h,
    title: 'API',
    titleX: API_TITLE_X,
    titleY: API_TITLE_Y,
    titleAnchor: null,
    className: 'scene-node oa-api',
    children: `
    ${variants('oa-scope', API_TEXT_X, SCOPE_Y, null, [['read', 'scope read']])}

    ${okReadout}

    ${variants('oa-deny', API_TEXT_X, DENY_Y, null, [['on', '401']])}`,
  })}

  ${serviceBox({
    x: USER.x,
    width: USER.w,
    y: USER.y,
    height: USER.h,
    title: 'User',
    titleX: USER_TITLE_X,
    titleY: USER_TITLE_Y,
    titleAnchor: null,
    className: 'scene-service oa-user',
    children: `
    <circle class="oa-consent-lamp" cx="${CONSENT_LAMP.cx}" cy="${CONSENT_LAMP.cy}" r="${CONSENT_LAMP.r}" />
    ${variants('oa-consent-text', USER_CONSENT_X, USER_CONSENT_Y, null, [['on', 'consent']])}

    <g class="oa-card">
      <rect class="oa-card-bg" x="${CARD.x}" y="${CARD.y}" width="${CARD.w}" height="${CARD.h}" rx="16" />
      ${variants('oa-card-text', CARD.x + CARD.w / 2, CARD_TEXT_Y, 'middle', [['on', 'id']], 6)}
    </g>`,
  })}

  ${requestsLayer()}
</svg>`;
