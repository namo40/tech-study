/**
 * Static stage markup for the Cookie Authentication scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. The bands are the usual ones:
 *   - y 0..440       kept empty for the step title card
 *   - y 440..680     the Browser: the two tabs a request can leave from, and
 *                    under them the cookie jar — the one cookie this site has
 *                    stored, with the attributes it was stored under
 *   - y 880..1270    the Server: the row of gates a request is put through, and
 *                    the three answers the server has given, counted
 *   - y 1500..1740   the Form the page renders, with the hidden field the
 *                    fourth step adds, and beside it the readout panel that
 *                    weighs `Strict` against `Lax` and sums the defences up
 *
 * Two lanes and nothing else travels. `LANE_SITE` runs at x 350, the centre of
 * the `your-site` tab; `LANE_EVIL` at x 750, the centre of the `evil.example`
 * tab. Both run from the Browser's bottom edge down to the Server's top edge,
 * and a response comes back up the same lane it went down. Both legs are
 * vertical, neither has zero length, and each end sits exactly on a box edge.
 *
 * That is what decides where a label may sit. A traveller is a dot with a halo
 * of r 26, so each lane sweeps a 52px band and everything written beside one
 * keeps 30px off it. The lanes sweep y 654..906 at x 324..376 and x 724..776,
 * so the Browser writes nothing below y 624 and the Server writes nothing above
 * y 936 inside those two vertical bands.
 *
 * Every value the reader can read is a stack of text variants on one spot with
 * CSS showing the one the current `data-*` names, so nothing is interpolated
 * and scrubbing backwards lands on the right number without undoing anything.
 */

import {
  VIEWBOX,
  chip,
  clientBox,
  counterVariants,
  nodeFrame,
  requestsLayer,
  serviceBox,
  verticalLink,
} from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- geometry --------------------------------------------------------------

/** The Browser box: two tabs over one cookie jar. */
const BROWSER_X = 130;
const BROWSER_W = 820;
const BROWSER_Y = 440;
const BROWSER_H = 240;
export const BROWSER_BOTTOM = BROWSER_Y + BROWSER_H;
const BROWSER_LEFT = 170;
const BROWSER_TITLE_Y = 490;

/** The two tabs. Each lane runs through the centre of the tab it leaves. */
const TAB_Y = 508;
const TAB_H = 54;
const TAB_TEXT_Y = 546;
const TAB_SITE_X = 170;
const TAB_SITE_W = 360;
const TAB_EVIL_X = 590;
const TAB_EVIL_W = 320;

/** The cookie jar: the strip the stored cookie and its attributes sit on. */
const JAR_X = 150;
const JAR_W = 780;
const JAR_Y = 572;
const JAR_H = 56;
const BADGE_Y = 578;
const BADGE_H = 44;
const BADGE_TEXT_Y = 607;
const COOKIE_X = 166;
const COOKIE_W = 250;
const HTTPONLY_X = 436;
const HTTPONLY_W = 190;
const SAMESITE_X = 646;
const SAMESITE_W = 268;

/** The Server frame. */
const NODE_Y = 880;
const NODE_H = 390;
export const NODE_TOP = NODE_Y;
const NODE_LABEL_Y = 946;

/**
 * The gate row: four plates on one baseline, three of them held back until the
 * step that puts them there. Order is the order a request meets them.
 */
export const GATES = ['cookie', 'samesite', 'token', 'origin'] as const;
export type Gate = (typeof GATES)[number];
/** What each plate writes on itself, which is not always its key. */
const GATE_LABEL: Record<Gate, string> = {
  cookie: 'cookie',
  samesite: 'SameSite',
  token: 'token',
  origin: 'origin',
};
const GATE_XS = [170, 366, 562, 758];
const GATE_W = 182;
const GATE_Y = 990;
const GATE_H = 84;
const GATE_TEXT_Y = 1042;

/** What the Server has answered, counted since the scene opened. */
const READOUT_Y = 1180;
const OK_X = 170;
const UNAUTH_X = 430;
const BAD_X = 690;
/** How high each counter has to go, which the simulation asserts against. */
export const OK_MAX = 12;
export const UNAUTH_MAX = 4;
export const BAD_MAX = 4;

/** The Form panel: the page as the browser renders it. */
const FORM_X = 130;
const FORM_W = 460;
const FORM_Y = 1500;
const FORM_H = 240;
const FORM_LEFT = 170;
const FORM_TITLE_Y = 1556;
const FIELD_X = 170;
const FIELD_H = 22;
const FIELD_1_Y = 1584;
const FIELD_1_W = 380;
const FIELD_2_Y = 1618;
const FIELD_2_W = 280;
const TOKEN_CHIP_X = 170;
const TOKEN_CHIP_W = 300;
const TOKEN_CHIP_Y = 1656;
const TOKEN_CHIP_H = 52;
const TOKEN_CHIP_TEXT_Y = 1690;

/** The readout panel: the option not taken, and the defences that are. */
const PANEL_X = 650;
const PANEL_W = 300;
const PANEL_Y = 1500;
const PANEL_H = 240;
const PANEL_LEFT = 686;
const STRICT_X = 686;
const STRICT_W = 228;
const STRICT_Y = 1536;
const STRICT_H = 52;
const STRICT_TEXT_Y = 1570;
/** The three lines the fourth step sums the defences up on. */
const SUMMARY_YS = [1628, 1672, 1716];
const SUMMARY_LINES = ['SameSite ✓', 'token ✓', 'origin ✓'];

/** The two lanes: where a traveller starts and where it turns around. */
export const LANE_SITE = 350;
export const LANE_EVIL = 750;

/** The cookie this site stores, as every label spells it. */
export const COOKIE_TEXT = 'session=…';

/**
 * What every `data-*` on the stage starts at, keyed by the target the timeline
 * addresses it through. The markup below is written from this, so a change that
 * writes a value something already holds can be dropped rather than tweened.
 */
export const STAGE_STATE: Record<string, string> = {
  'stage@data-ck-jar': 'empty',
  'stage@data-ck-httponly': 'on',
  'stage@data-ck-samesite': 'off',
  'stage@data-ck-strict': 'off',
  'stage@data-ck-form': 'off',
  'stage@data-ck-summary': 'off',
  'stage@data-ck-ok': '0',
  'stage@data-ck-unauth': '0',
  'stage@data-ck-bad': '0',
  'stage@data-ck-site': 'idle',
  'stage@data-ck-evil': 'hidden',
};
for (const gate of GATES) {
  STAGE_STATE[`gate-${gate}@data-ck-gate`] = gate === 'cookie' ? 'off' : 'hidden';
}

// --- markup ----------------------------------------------------------------

/** A stack of text variants on one spot, of which CSS shows at most one. */
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
        `<text class="scene-counter ${className} ${className}--${value}" x="${x}" y="${y}"${anchor ? ` text-anchor="${anchor}"` : ''}>${label}</text>`,
    )
    .join(`\n${' '.repeat(indent)}`);

/**
 * One tab. It says its own name while it is quiet and its name plus the method
 * while it has a request out, so the reader can see which side sent what
 * without reading the traveller.
 */
const tabPlate = (key: 'site' | 'evil', name: string, x: number, width: number): string => {
  const centre = x + width / 2;
  const text = variants(
    `ck-${key}-text`,
    centre,
    TAB_TEXT_Y,
    'middle',
    [
      ['idle', name],
      ['post', `${name} POST`],
      ['get', `${name} GET`],
    ],
    8,
  );
  return `<g class="ck-tab ck-tab--${key}">
      <rect class="ck-tab-box" x="${x}" y="${TAB_Y}" width="${width}" height="${TAB_H}" rx="16" />
      ${text}
    </g>`;
};

/** One gate: a plate, and the three things it can say about a request. */
const gatePlate = (gate: Gate, index: number): string => {
  const x = GATE_XS[index] ?? 0;
  const label = GATE_LABEL[gate];
  const text = variants(
    'ck-gate-text',
    x + GATE_W / 2,
    GATE_TEXT_Y,
    'middle',
    [
      ['off', label],
      ['ok', `${label} ✓`],
      ['fail', `${label} ✗`],
    ],
    8,
  );
  return `<g class="scene-chip ck-gate ck-gate--${gate}" data-ck-gate="${gate === 'cookie' ? 'off' : 'hidden'}">
        <rect class="scene-chip-outline ck-gate-box" x="${x}" y="${GATE_Y}" width="${GATE_W}" height="${GATE_H}" rx="18" />
        ${text}
      </g>`;
};

const okReadout = counterVariants({
  x: OK_X,
  y: READOUT_Y,
  className: 'ck-ok',
  max: OK_MAX,
  format: (n) => `200 ${n}`,
  indent: 4,
});

const unauthReadout = counterVariants({
  x: UNAUTH_X,
  y: READOUT_Y,
  className: 'ck-unauth',
  max: UNAUTH_MAX,
  format: (n) => `401 ${n}`,
  indent: 4,
});

const badReadout = counterVariants({
  x: BAD_X,
  y: READOUT_Y,
  className: 'ck-bad',
  max: BAD_MAX,
  format: (n) => `400 ${n}`,
  indent: 4,
});

/** The cookie itself, drawn only once the server has set one. */
const cookieChip = chip({
  x: COOKIE_X,
  y: BADGE_Y,
  width: COOKIE_W,
  height: BADGE_H,
  rx: 14,
  className: 'ck-cookie',
  bgClass: 'ck-cookie-box',
  variant: 'outline',
  text: `<text class="scene-mono ck-cookie-text" x="${COOKIE_X + COOKIE_W / 2}" y="${BADGE_TEXT_Y}" text-anchor="middle">${COOKIE_TEXT}</text>`,
  indent: 4,
});

/**
 * The attribute that keeps scripts out. It says its own name until a script
 * tries the jar, and then says so.
 */
const httpOnlyBadge = chip({
  x: HTTPONLY_X,
  y: BADGE_Y,
  width: HTTPONLY_W,
  height: BADGE_H,
  rx: 14,
  className: 'ck-httponly',
  bgClass: 'ck-httponly-box',
  variant: 'outline',
  text: variants(
    'ck-httponly-text',
    HTTPONLY_X + HTTPONLY_W / 2,
    BADGE_TEXT_Y,
    'middle',
    [
      ['on', 'HttpOnly'],
      ['blocked', 'HttpOnly ✓'],
    ],
    6,
  ),
  indent: 4,
});

/** The attribute the third step adds, which is the first line drawn. */
const sameSiteBadge = chip({
  x: SAMESITE_X,
  y: BADGE_Y,
  width: SAMESITE_W,
  height: BADGE_H,
  rx: 14,
  className: 'ck-samesite',
  bgClass: 'ck-samesite-box',
  variant: 'outline',
  text: `<text class="ck-samesite-text" x="${SAMESITE_X + SAMESITE_W / 2}" y="${BADGE_TEXT_Y}" text-anchor="middle">SameSite=Lax</text>`,
  indent: 4,
});

/** The hidden field the fourth step puts in the form. */
const tokenChip = chip({
  x: TOKEN_CHIP_X,
  y: TOKEN_CHIP_Y,
  width: TOKEN_CHIP_W,
  height: TOKEN_CHIP_H,
  rx: 14,
  className: 'ck-token',
  bgClass: 'ck-token-box',
  variant: 'outline',
  text: `<text class="ck-token-text" x="${TOKEN_CHIP_X + TOKEN_CHIP_W / 2}" y="${TOKEN_CHIP_TEXT_Y}" text-anchor="middle">antiforgery</text>`,
  indent: 4,
});

/** The stricter option, held up against `Lax` for as long as it is worth it. */
const strictChip = chip({
  x: STRICT_X,
  y: STRICT_Y,
  width: STRICT_W,
  height: STRICT_H,
  rx: 14,
  className: 'ck-strict',
  bgClass: 'ck-strict-box',
  variant: 'outline',
  text: `<text class="ck-strict-text" x="${STRICT_X + STRICT_W / 2}" y="${STRICT_TEXT_Y}" text-anchor="middle">Strict</text>`,
  indent: 4,
});

const summary = SUMMARY_LINES.map(
  (line, index) =>
    `<text class="ck-summary-line" x="${PANEL_LEFT}" y="${SUMMARY_YS[index]}">${line}</text>`,
).join('\n    ');

const stageAttributes = Object.entries(STAGE_STATE)
  .filter(([key]) => key.startsWith('stage@'))
  .map(([key, value]) => `${key.slice('stage@'.length)}="${value}"`)
  .join(' ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageAttributes} aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(LANE_SITE, BROWSER_BOTTOM, NODE_TOP, 'scene-link ck-lane')}
  ${verticalLink(LANE_EVIL, BROWSER_BOTTOM, NODE_TOP, 'scene-link ck-lane ck-lane--evil')}

  ${clientBox({
    x: BROWSER_X,
    width: BROWSER_W,
    y: BROWSER_Y,
    height: BROWSER_H,
    title: 'Browser',
    titleX: BROWSER_LEFT,
    titleY: BROWSER_TITLE_Y,
    titleClass: 'scene-node-title ck-title',
    titleAnchor: null,
    extraClass: 'ck-browser',
    children: `
    ${tabPlate('site', 'your-site', TAB_SITE_X, TAB_SITE_W)}

    ${tabPlate('evil', 'evil.example', TAB_EVIL_X, TAB_EVIL_W)}

    <rect class="ck-jar" x="${JAR_X}" y="${JAR_Y}" width="${JAR_W}" height="${JAR_H}" rx="18" />
    ${cookieChip}
    ${httpOnlyBadge}
    ${sameSiteBadge}`,
  })}

  ${nodeFrame({
    y: NODE_Y,
    height: NODE_H,
    label: 'Server',
    labelY: NODE_LABEL_Y,
    children: `    <g class="ck-gates">
      ${GATES.map((gate, index) => gatePlate(gate, index)).join('\n      ')}
    </g>

    ${okReadout}
    ${unauthReadout}
    ${badReadout}`,
  })}

  ${serviceBox({
    x: FORM_X,
    width: FORM_W,
    y: FORM_Y,
    height: FORM_H,
    title: 'Form',
    titleX: FORM_LEFT,
    titleY: FORM_TITLE_Y,
    titleClass: 'scene-node-title ck-title',
    titleAnchor: null,
    className: 'ck-form',
    boxClass: 'scene-box ck-form-box',
    children: `
    <rect class="ck-field" x="${FIELD_X}" y="${FIELD_1_Y}" width="${FIELD_1_W}" height="${FIELD_H}" rx="11" />
    <rect class="ck-field" x="${FIELD_X}" y="${FIELD_2_Y}" width="${FIELD_2_W}" height="${FIELD_H}" rx="11" />
    ${tokenChip}`,
  })}

  <g class="ck-panel">
    <rect class="scene-box ck-panel-box" x="${PANEL_X}" y="${PANEL_Y}" width="${PANEL_W}" height="${PANEL_H}" rx="28" />
    ${strictChip}
    <g class="ck-summary">
    ${summary}
    </g>
  </g>

  ${requestsLayer()}
</svg>`;
