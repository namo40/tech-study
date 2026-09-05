/**
 * Static stage markup for the Authorization Code scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. The bands are the usual ones, with
 * a strip hung under the node because the scene has to show both what the
 * authorization server is doing right now and what it has already handed out:
 *   - y 0..400       above the cropped viewBox (see shared VIEWBOX)
 *   - y 400..440     the frame's top padding; nothing is drawn here
 *   - y 440..680     Browser and App, one box each, one lane each
 *   - y 880..1270    Authorization server: the `/authorize` cell the user logs
 *                    in at, and the `/token` cell everything is redeemed at
 *   - y 1300..1400   what has been issued, and how much life the access token
 *                    has left
 *   - y 1500..1740   attacker on the front lane, API on the back one
 *   - y 1800         which line is which
 *
 * Two lanes and one rail, and nothing travels anywhere else. `X_FRONT` is the
 * front channel: it runs from the Browser down past the authorization server
 * to the attacker, because everything that passes through a browser can be
 * read out of a URL, a history entry or a referrer. `X_BACK` is the back
 * channel, from the App down to the API. `Y_RAIL` joins the two at one height,
 * which is how a redirect gets from one to the other: down to the rail, across,
 * and up into the other box. Every leg is vertical or horizontal, and the lanes
 * and the rail meet at exact points, so no leg cuts a corner.
 *
 * Dashed is the front channel and solid is the back one, all the way down to
 * the one segment that mixes them: the attacker's line into `/token` is solid
 * because it is a direct call, and it leaves a dashed lane because what it
 * carries was picked up in a browser.
 *
 * That is what decides where a label may sit. A traveller here is either a dot
 * (halo r 26) or a chip 100 wide, so each lane sweeps 100px and everything
 * written beside one keeps 30px off that: the node and the strip are drawn
 * between x 360 and x 720, and both top boxes write everything above y 564,
 * which is where the resting traveller's own box begins. The attacker and the
 * API write below y 1686 for the same reason, under the point their lane ends
 * at.
 */

import { VIEWBOX, clientBox, requestsLayer, serviceBox, trackAndFill } from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- geometry --------------------------------------------------------------

/** The front channel, which goes through the browser, and the back channel. */
export const X_FRONT = 280;
export const X_BACK = 800;

/** Where a traveller starts, turns, is answered, and lands. */
export const Y_REST = 620;
export const Y_RAIL = 780;
export const Y_AUTHZ = 1020;
export const Y_TOKEN = 1180;
export const Y_ARRIVE = 1630;

/** The two top boxes, one per lane. */
const TOP_Y = 440;
const TOP_H = 240;
const TOP_W = 300;
const BROWSER_X = X_FRONT - TOP_W / 2;
const APP_X = X_BACK - TOP_W / 2;
const TOP_TITLE_Y = 490;

/** The browser's address bar, which is the whole reason a code can leak. */
const URL_X = 146;
const URL_Y = 512;
const URL_W = 268;
const URL_H = 48;
const URL_TEXT_Y = 542;

/** What the App is holding, written above the lane rather than beside it. */
const HOLD_Y = 520;
const HOLD_H = 44;
const HOLD_W = 88;
const HOLD_GAP = 12;
const HOLD_X = 656;
const HOLD_TEXT_Y = 549;
const PUBLIC_X = 938;

/** The verifier the app invents per login, written under the box it lives in. */
const VERIFIER_X = 716;
const VERIFIER_Y = 716;

/** The authorization server, drawn between the lanes rather than across them. */
const NODE_X = 360;
const NODE_W = 360;
const NODE_Y = 880;
const NODE_H = 390;
const NODE_LABEL_X = 384;
const NODE_LABEL_Y = 930;

/** The two endpoints, stacked so each has its own height to be reached at. */
const CELL_X = 384;
const CELL_W = 312;
const AUTHZ_Y = 950;
const AUTHZ_H = 140;
const TOKEN_Y = 1110;
const TOKEN_H = 140;
const CELL_TEXT_X = 404;
const AUTHZ_TEXT_Y = 992;
const CHALLENGE_Y = 1050;
const TOKEN_TEXT_Y = 1152;
const VERDICT_Y = 1210;

/** The login form: two fields, which is what a password is typed into. */
const FORM_X = 564;
const FORM_W = 120;
const FORM_H = 28;
const FORM_Y1 = 964;
const FORM_Y2 = 1004;
const LOGIN_X = 564;
const LOGIN_Y = 1062;

/** The lock on `/token`, which is the whole difference between the channels. */
const LOCK_X = 640;
const LOCK_Y = 1126;

/** What has been issued, and how long the access token still has. */
const STRIP_Y = 1300;
const STRIP_H = 100;
const STRIP_LABEL_Y = 1330;
const LIFE_LABEL_X = 548;
const BAR_X = 560;
const BAR_Y = 1316;
export const BAR_W = 140;
const BAR_H = 12;
const SLOT_Y = 1348;
const SLOT_H = 44;
const SLOT_W = 78;
const SLOT_GAP = 12;
const SLOT_X = 366;
const SLOT_TEXT_Y = 1377;

/** The bottom band: the attacker on the front lane, the API on the back one. */
const BOTTOM_Y = 1500;
const BOTTOM_H = 320;
const BOTTOM_TITLE_Y = 1716;
const NOTE_Y = 1768;
const API_NOTE_Y = 1772;
const STOLEN_X = 146;
const STOLEN_Y = 1740;
const STOLEN_W = 144;
const STOLEN_H = 44;
const STOLEN_TEXT_Y = 1769;
const NOTE_X = 302;

/**
 * Which line is which, written in the one gap where both lanes are in view and
 * neither of them passes: between the issue record and the bottom boxes.
 */
const KEY_X = 380;
const KEY_W = 60;
const KEY_TEXT_X = 452;
const KEY_ROWS = [1434, 1472];

/**
 * The access token's lifetime, as the scene draws it. The label says `15 min`
 * because that is the number a reader would configure; fifteen real minutes are
 * two seconds here, a 450:1 compression, so a whole lifetime fits inside a step
 * and can still be watched running out.
 */
export const ACCESS_TTL_LABEL = '15 min';

/**
 * What every `data-*` on the stage starts at, keyed by the target the timeline
 * addresses it through. The markup below is written from this, so a change that
 * writes a value something already holds can be dropped rather than tweened.
 */
export const STAGE_STATE: Record<string, string> = {
  'stage@data-url': 'app',
  'stage@data-login': 'off',
  'stage@data-challenge': 'off',
  'stage@data-verdict': 'none',
  'stage@data-code': 'none',
  'stage@data-access': 'none',
  'stage@data-id': 'none',
  'stage@data-refresh': 'none',
  'stage@data-hold-access': 'none',
  'stage@data-hold-id': 'none',
  'stage@data-hold-refresh': 'none',
  'stage@data-public': 'off',
  'stage@data-verifier': 'off',
  'stage@data-attacker': 'idle',
  'stage@data-stolen': 'none',
  'stage@data-note': 'none',
  'stage@data-api': 'idle',
};

// --- markup ----------------------------------------------------------------

/** A stack of text variants on one spot, of which CSS shows at most one. */
const variants = (
  className: string,
  x: number,
  y: number,
  anchor: string | null,
  entries: [string, string][],
  indent = 4,
): string =>
  entries
    .map(
      ([value, label]) =>
        `<text class="${className} ${className}--${value}" x="${x}" y="${y}"${anchor ? ` text-anchor="${anchor}"` : ''}>${label}</text>`,
    )
    .join(`\n${' '.repeat(indent)}`);

/** One chip in a row: a plate with the one word it stands for. */
const plate = (
  className: string,
  x: number,
  y: number,
  width: number,
  height: number,
  textY: number,
  label: string,
  fontClass = 'ac-plate-text',
): string => `<g class="ac-plate ${className}">
      <rect class="ac-plate-bg" x="${x}" y="${y}" width="${width}" height="${height}" rx="14" />
      <text class="${fontClass}" x="${x + width / 2}" y="${textY}" text-anchor="middle">${label}</text>
      <line class="ac-plate-strike" x1="${x + 12}" y1="${y + height / 2}" x2="${x + width - 12}" y2="${y + height / 2}" />
    </g>`;

/** The address bar, which says what the browser is looking at right now. */
const urlBar = `<g class="ac-url">
      <rect class="ac-url-bg" x="${URL_X}" y="${URL_Y}" width="${URL_W}" height="${URL_H}" rx="12" />
      ${variants(
        'scene-mono ac-url-text',
        URL_X + 16,
        URL_TEXT_Y,
        null,
        [
          ['app', '/app'],
          ['authorize', '/authorize?...'],
          ['code', '?code=A7F3'],
        ],
        6,
      )}
    </g>`;

/** What the App is holding: one plate per token, lit once it has one. */
const wallet = (['access', 'id', 'refresh'] as const)
  .map((name, index) =>
    plate(
      `ac-hold ac-hold--${name}`,
      HOLD_X + index * (HOLD_W + HOLD_GAP),
      HOLD_Y,
      HOLD_W,
      HOLD_H,
      HOLD_TEXT_Y,
      name,
    ),
  )
  .join('\n    ');

/** What the server has issued, in the order a login hands them out. */
const issued = (['code', 'access', 'id', 'refresh'] as const)
  .map((name, index) =>
    plate(
      `ac-issued ac-issued--${name}`,
      SLOT_X + index * (SLOT_W + SLOT_GAP),
      SLOT_Y,
      SLOT_W,
      SLOT_H,
      SLOT_TEXT_Y,
      name,
      'ac-slot-text',
    ),
  )
  .join('\n    ');

const stageAttributes = Object.entries(STAGE_STATE)
  .filter(([key]) => key.startsWith('stage@'))
  .map(([key, value]) => `${key.slice('stage@'.length)}="${value}"`)
  .join(' ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageAttributes} aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  <line class="scene-link ac-front" x1="${X_FRONT}" y1="${TOP_Y + TOP_H}" x2="${X_FRONT}" y2="${BOTTOM_Y}" />
  <line class="scene-link ac-front" x1="${X_FRONT}" y1="${Y_RAIL}" x2="${X_BACK}" y2="${Y_RAIL}" />
  <line class="scene-link ac-front" x1="${X_FRONT}" y1="${Y_AUTHZ}" x2="${NODE_X}" y2="${Y_AUTHZ}" />
  <line class="scene-link" x1="${X_BACK}" y1="${TOP_Y + TOP_H}" x2="${X_BACK}" y2="${BOTTOM_Y}" />
  <line class="scene-link" x1="${NODE_X + NODE_W}" y1="${Y_TOKEN}" x2="${X_BACK}" y2="${Y_TOKEN}" />
  <line class="scene-link ac-steal-link" x1="${X_FRONT}" y1="${Y_TOKEN}" x2="${NODE_X}" y2="${Y_TOKEN}" />

  ${clientBox({
    x: BROWSER_X,
    width: TOP_W,
    y: TOP_Y,
    height: TOP_H,
    title: 'Browser',
    titleX: URL_X,
    titleY: TOP_TITLE_Y,
    titleAnchor: null,
    extraClass: 'ac-browser',
    children: `
    ${urlBar}`,
  })}

  ${clientBox({
    x: APP_X,
    width: TOP_W,
    y: TOP_Y,
    height: TOP_H,
    title: 'App',
    titleX: HOLD_X,
    titleY: TOP_TITLE_Y,
    titleAnchor: null,
    extraClass: 'ac-app',
    children: `
    <text class="scene-flash ac-public" x="${PUBLIC_X}" y="${TOP_TITLE_Y}" text-anchor="end">public client</text>
    ${wallet}`,
  })}

  <text class="scene-mono ac-verifier" x="${VERIFIER_X}" y="${VERIFIER_Y}" text-anchor="end">code_verifier</text>

  <g class="ac-node">
    <rect class="scene-box" x="${NODE_X}" y="${NODE_Y}" width="${NODE_W}" height="${NODE_H}" rx="28" />
    <text class="scene-node-label" x="${NODE_LABEL_X}" y="${NODE_LABEL_Y}">Authorization server</text>

    <rect class="scene-box ac-cell" x="${CELL_X}" y="${AUTHZ_Y}" width="${CELL_W}" height="${AUTHZ_H}" rx="20" />
    <text class="scene-mono ac-endpoint" x="${CELL_TEXT_X}" y="${AUTHZ_TEXT_Y}">/authorize</text>
    <text class="scene-mono ac-challenge" x="${CELL_TEXT_X}" y="${CHALLENGE_Y}">code_challenge</text>
    <rect class="ac-field" x="${FORM_X}" y="${FORM_Y1}" width="${FORM_W}" height="${FORM_H}" rx="8" />
    <rect class="ac-field" x="${FORM_X}" y="${FORM_Y2}" width="${FORM_W}" height="${FORM_H}" rx="8" />
    <text class="scene-flash ac-login" x="${LOGIN_X}" y="${LOGIN_Y}">login</text>

    <rect class="scene-box ac-cell" x="${CELL_X}" y="${TOKEN_Y}" width="${CELL_W}" height="${TOKEN_H}" rx="20" />
    <text class="scene-mono ac-endpoint" x="${CELL_TEXT_X}" y="${TOKEN_TEXT_Y}">/token</text>
    <g class="ac-lock">
      <rect class="ac-lock-body" x="${LOCK_X}" y="${LOCK_Y + 22}" width="40" height="30" rx="8" />
      <path class="ac-lock-shackle" d="M ${LOCK_X + 9} ${LOCK_Y + 22} L ${LOCK_X + 9} ${LOCK_Y + 10} A 11 11 0 0 1 ${LOCK_X + 31} ${LOCK_Y + 10} L ${LOCK_X + 31} ${LOCK_Y + 22}" />
    </g>
    ${variants(
      'scene-flash ac-verdict',
      CELL_TEXT_X,
      VERDICT_Y,
      null,
      [
        ['secret', 'secret &#10003;'],
        ['verifier', 'verifier &#10003;'],
        ['used', 'code used'],
        ['no-secret', 'no secret'],
        ['no-verifier', 'no verifier'],
        ['rotate', 'rotate'],
        ['reused', 'reused'],
        ['revoked', 'revoked'],
      ],
    )}
  </g>

  <g class="ac-strip">
    <rect class="ac-strip-frame" x="${NODE_X}" y="${STRIP_Y}" width="${NODE_W}" height="${STRIP_H}" rx="24" />
    <text class="scene-caption-label ac-strip-label" x="${NODE_LABEL_X}" y="${STRIP_LABEL_Y}">issued</text>
    <text class="scene-caption-label ac-life-label" x="${LIFE_LABEL_X}" y="${STRIP_LABEL_Y}" text-anchor="end">${ACCESS_TTL_LABEL}</text>
    ${trackAndFill({
      x: BAR_X,
      y: BAR_Y,
      width: BAR_W,
      height: BAR_H,
      rx: BAR_H / 2,
      className: 'ac-life',
    })}
    ${issued}
  </g>

  ${serviceBox({
    x: BROWSER_X,
    width: TOP_W,
    y: BOTTOM_Y,
    height: BOTTOM_H,
    title: 'attacker',
    titleY: BOTTOM_TITLE_Y,
    className: 'ac-attacker',
    boxClass: 'scene-box ac-attacker-box',
    children: `
    <g class="ac-stolen">
      <rect class="ac-plate-bg ac-stolen-bg" x="${STOLEN_X}" y="${STOLEN_Y}" width="${STOLEN_W}" height="${STOLEN_H}" rx="14" />
      ${variants(
        'ac-stolen-text',
        STOLEN_X + STOLEN_W / 2,
        STOLEN_TEXT_Y,
        'middle',
        [
          ['code', 'code A7F3'],
          ['refresh', 'old refresh'],
        ],
        6,
      )}
    </g>
    ${variants(
      'scene-flash ac-note',
      NOTE_X,
      NOTE_Y,
      null,
      [
        ['used', 'code used'],
        ['no-secret', 'no secret'],
        ['no-verifier', 'no verifier'],
        ['reused', 'reused'],
      ],
    )}`,
  })}

  ${serviceBox({
    x: APP_X,
    width: TOP_W,
    y: BOTTOM_Y,
    height: BOTTOM_H,
    title: 'API',
    titleY: BOTTOM_TITLE_Y,
    className: 'ac-api',
    children: `
    ${variants(
      'scene-flash ac-api-note',
      X_BACK,
      API_NOTE_Y,
      'middle',
      [
        ['ok', 'Bearer'],
        ['401', '401'],
      ],
    )}`,
  })}

  <g class="ac-key">
    <line class="scene-link ac-front ac-key-line" x1="${KEY_X}" y1="${KEY_ROWS[0]}" x2="${KEY_X + KEY_W}" y2="${KEY_ROWS[0]}" />
    <text class="scene-caption-label" x="${KEY_TEXT_X}" y="${(KEY_ROWS[0] ?? 0) + 6}">front channel</text>
    <line class="scene-link ac-key-line" x1="${KEY_X}" y1="${KEY_ROWS[1]}" x2="${KEY_X + KEY_W}" y2="${KEY_ROWS[1]}" />
    <text class="scene-caption-label" x="${KEY_TEXT_X}" y="${(KEY_ROWS[1] ?? 0) + 6}">back channel</text>
  </g>

  ${requestsLayer()}
</svg>`;
