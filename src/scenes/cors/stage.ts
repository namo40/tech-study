/**
 * Static stage markup for the CORS scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. The bands are the usual ones, with
 * the bottom box given the allowed extension because the server has a policy
 * table to show as well as a counter:
 *   - y 0..400       above the cropped viewBox (see shared VIEWBOX)
 *   - y 400..440     the frame's top padding; nothing is drawn here
 *   - y 440..680     the Browser, with its two tabs, and `curl` beside it
 *   - y 880..1270    the same-origin policy: the gate a response has to come
 *                    back through, what the browser recorded on the way out,
 *                    what came back, and what the last preflight is still
 *                    good for
 *   - y 1500..1820   api.example: its CORS policy, what it has handled, and
 *                    what it did with the last state-changing call
 *
 * Two lanes and nothing travels anywhere else. `X_TAB` is the browser lane: it
 * leaves the Browser, passes through the gate cell, and ends in api.example,
 * because everything a page fetches is judged on the way back. `X_CURL` is the
 * lane that never meets the gate at all, which is the whole point of the last
 * step: a client that is not a browser has nothing to enforce. The lanes sit at
 * 250 and 860, symmetric about api.example's centre, so the one box both of
 * them reach is entered evenly from either side.
 *
 * The browser lane is drawn as four segments rather than one line, so no
 * segment ever ends inside a box: Browser to node, node to gate cell, gate cell
 * to node, node to api.example. Consecutive segments share their endpoint
 * exactly.
 *
 * That is what decides where a label may sit. A traveller on the browser lane
 * is a plate 150 wide with a smaller one under it, so the lane sweeps x 175 to
 * 325 and everything written beside it starts at x 360; a traveller on the curl
 * lane is a plain dot with a halo of 26, so it sweeps x 834 to 886 and the
 * column beside it stops at x 800. The Browser's own title sits above y 500,
 * which is 94px clear of the resting traveller's plate.
 */

import {
  VIEWBOX,
  clientBox,
  counterVariants,
  requestsLayer,
  serviceBox,
  trackAndFill,
  verticalLink,
} from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- geometry --------------------------------------------------------------

/** The lane through the browser's gate, and the lane that never sees it. */
export const X_TAB = 250;
export const X_CURL = 860;

/** Where a traveller starts, is judged, is turned away, and lands. */
export const Y_REST = 620;
/**
 * Where a call to the page's own origin turns around: in the gap between the
 * Browser and the node, so the gate is visibly not involved. The server it
 * reached is `shop.example` itself, which is off stage.
 */
export const Y_SAME = 780;
export const Y_NODE_TOP = 880;
export const Y_GATE = 1080;
export const Y_API_TOP = 1500;
export const Y_ARRIVE = 1630;

/** The Browser, and the client that is not one. */
const TOP_Y = 440;
const TOP_H = 240;
const BROWSER_X = 160;
const BROWSER_W = 580;
const BROWSER_TITLE_X = 190;
const BROWSER_TITLE_Y = 500;
const CURL_X = 790;
const CURL_W = 140;
const CURL_CAPTION_Y = 488;
const CURL_TITLE_Y = 542;

/** The two tabs, stacked to the right of the lane. */
const TAB_X = 400;
const TAB_W = 220;
const TAB_H = 50;
const TAB_ROWS = [468, 532];
const TAB_TEXT_DY = 32;

/** The console line a blocked response leaves behind. */
const CONSOLE_Y = 616;

/** Who answered the same-origin call, written beside where it turned around. */
const SAME_LABEL_X = 360;
const SAME_LABEL_Y = 788;

/** The same-origin policy, drawn around the lane it judges. */
const NODE_X = 160;
const NODE_W = 580;
const NODE_Y = 880;
const NODE_H = 390;
const NODE_LABEL_Y = 928;

/** The gate itself: a cell on the lane, with two leaves that meet or part. */
const GATE_X = 180;
const GATE_W = 140;
const GATE_Y = 1040;
const GATE_H = 80;
const LEAF_INSET = 12;
const LEAF_H = 12;
const LEAF_OPEN = 24;

/**
 * The column everything the browser writes down sits in, kept clear of the
 * lane by 35px.
 */
const COL_X = 360;
const ORIGIN_Y = 968;
const ACAO_NAME_Y = 1006;
const ACAO_VALUE_Y = 1036;
const ACAC_Y = 1066;
const VERDICT_Y = 1104;
const CACHE_LABEL_Y = 1146;
const CACHE_METHODS_Y = 1180;
const CACHE_HEADERS_Y = 1210;
const MAXAGE_Y = 1244;
const BAR_X = 490;
const BAR_Y = 1234;
export const BAR_W = 250;
const BAR_H = 12;

/** api.example, with the policy that decides all of this. */
const API_X = 160;
const API_W = 790;
const API_Y = 1500;
const API_H = 320;
const API_TITLE_X = 360;
const API_TITLE_Y = 1558;
const HANDLED_X = 800;
const HANDLED_Y = 1558;
const POLICY_X = 360;
const POLICY_VALUE_X = 520;
const POLICY_ROWS = [1616, 1652, 1688, 1724, 1760];
const NOTE_Y = 1794;

/** The highest number the counter is ever asked for. */
const HANDLED_MAX = 4;

/**
 * What `Access-Control-Max-Age: 3600` looks like inside a six second step. One
 * hour is drawn as 4.9 seconds, a 735:1 compression, so a whole cached
 * preflight can be watched running out. The label keeps saying `Max-Age 1 h`,
 * because that is the number a reader would configure.
 */
export const MAX_AGE_LABEL = 'Max-Age 1 h';

/**
 * What every `data-*` on the stage starts at, keyed by the target the timeline
 * addresses it through. The markup below is written from this, so a change that
 * writes a value something already holds can be dropped rather than tweened.
 */
export const STAGE_STATE: Record<string, string> = {
  'stage@data-tab': 'shop',
  'stage@data-console': 'off',
  'stage@data-same': 'off',
  'stage@data-curl': 'idle',
  'stage@data-gate': 'closed',
  'stage@data-origin': 'none',
  'stage@data-acao': 'hidden',
  'stage@data-acac': 'off',
  'stage@data-verdict': 'none',
  'stage@data-cache': 'empty',
  'stage@data-origins': 'none',
  'stage@data-methods': 'none',
  'stage@data-headers': 'none',
  'stage@data-samesite': 'none',
  'stage@data-antiforgery': 'off',
  'stage@data-handled': '0',
  'stage@data-hit': 'off',
  'stage@data-note': 'none',
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

/** One browser tab: a plate with the origin it is showing. */
const tab = (name: string, label: string, row: number): string => {
  const y = TAB_ROWS[row] ?? 0;
  return `<g class="cors-tab cors-tab--${name}">
      <rect class="cors-tab-bg" x="${TAB_X}" y="${y}" width="${TAB_W}" height="${TAB_H}" rx="14" />
      <text class="scene-mono cors-tab-text" x="${TAB_X + TAB_W / 2}" y="${y + TAB_TEXT_DY}" text-anchor="middle">${label}</text>
    </g>`;
};

/** One row of the server's CORS policy: a name and the value it is set to. */
const policyRow = (
  name: string,
  label: string,
  row: number,
  values: [string, string][],
): string => {
  const y = POLICY_ROWS[row] ?? 0;
  return `<g class="cors-policy-row cors-policy-row--${name}">
      <text class="scene-mono cors-policy-name" x="${POLICY_X}" y="${y}">${label}</text>
      ${variants('scene-mono cors-policy-value', POLICY_VALUE_X, y, null, values, 6)}
    </g>`;
};

const stageAttributes = Object.entries(STAGE_STATE)
  .filter(([key]) => key.startsWith('stage@'))
  .map(([key, value]) => `${key.slice('stage@'.length)}="${value}"`)
  .join(' ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageAttributes} aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_TAB, TOP_Y + TOP_H, NODE_Y)}
  ${verticalLink(X_TAB, NODE_Y, GATE_Y)}
  ${verticalLink(X_TAB, GATE_Y + GATE_H, NODE_Y + NODE_H)}
  ${verticalLink(X_TAB, NODE_Y + NODE_H, API_Y)}
  ${verticalLink(X_CURL, TOP_Y + TOP_H, API_Y)}

  ${clientBox({
    x: BROWSER_X,
    width: BROWSER_W,
    y: TOP_Y,
    height: TOP_H,
    title: 'Browser',
    titleX: BROWSER_TITLE_X,
    titleY: BROWSER_TITLE_Y,
    titleAnchor: null,
    extraClass: 'cors-browser',
    children: `
    ${tab('shop', 'shop.example', 0)}
    ${tab('evil', 'evil.example', 1)}
    <text class="scene-flash cors-console" x="${TAB_X}" y="${CONSOLE_Y}">console: CORS error</text>`,
  })}

  <text class="scene-flash cors-same" x="${SAME_LABEL_X}" y="${SAME_LABEL_Y}">shop.example</text>

  ${clientBox({
    x: CURL_X,
    width: CURL_W,
    y: TOP_Y,
    height: TOP_H,
    title: 'curl',
    titleX: CURL_X + CURL_W / 2,
    titleY: CURL_TITLE_Y,
    extraClass: 'cors-curl',
    children: `
    <text class="scene-caption-label cors-curl-caption" x="${CURL_X + CURL_W / 2}" y="${CURL_CAPTION_Y}" text-anchor="middle">server</text>`,
  })}

  <g class="cors-node">
    <rect class="scene-box" x="${NODE_X}" y="${NODE_Y}" width="${NODE_W}" height="${NODE_H}" rx="28" />
    <text class="scene-node-label" x="${COL_X}" y="${NODE_LABEL_Y}">Same-origin policy</text>

    <rect class="scene-box cors-gate-cell" x="${GATE_X}" y="${GATE_Y}" width="${GATE_W}" height="${GATE_H}" rx="18" />
    <g class="cors-leaves cors-leaves--shut">
      <rect class="cors-leaf cors-leaf--left" x="${GATE_X + LEAF_INSET}" y="${GATE_Y + GATE_H / 2 - LEAF_H / 2}" width="${GATE_W / 2 - LEAF_INSET}" height="${LEAF_H}" rx="6" />
      <rect class="cors-leaf cors-leaf--right" x="${GATE_X + GATE_W / 2}" y="${GATE_Y + GATE_H / 2 - LEAF_H / 2}" width="${GATE_W / 2 - LEAF_INSET}" height="${LEAF_H}" rx="6" />
    </g>
    <g class="cors-leaves cors-leaves--open">
      <rect class="cors-leaf" x="${GATE_X + LEAF_INSET}" y="${GATE_Y + GATE_H / 2 - LEAF_H / 2}" width="${LEAF_OPEN}" height="${LEAF_H}" rx="6" />
      <rect class="cors-leaf" x="${GATE_X + GATE_W - LEAF_INSET - LEAF_OPEN}" y="${GATE_Y + GATE_H / 2 - LEAF_H / 2}" width="${LEAF_OPEN}" height="${LEAF_H}" rx="6" />
    </g>

    ${variants(
      'scene-mono cors-origin',
      COL_X,
      ORIGIN_Y,
      null,
      [
        ['shop', 'Origin: https://shop.example'],
        ['evil', 'Origin: https://evil.example'],
      ],
    )}

    <text class="scene-mono cors-header-name" x="${COL_X}" y="${ACAO_NAME_Y}">Access-Control-Allow-Origin</text>
    ${variants(
      'scene-mono cors-acao',
      COL_X,
      ACAO_VALUE_Y,
      null,
      [
        ['none', '(not sent)'],
        ['origin', 'https://shop.example'],
        ['wildcard', '*'],
      ],
    )}
    <text class="scene-mono cors-acac" x="${COL_X}" y="${ACAC_Y}">Access-Control-Allow-Credentials: true</text>

    ${variants(
      'scene-flash cors-verdict',
      COL_X,
      VERDICT_Y,
      null,
      [
        ['allowed', 'allowed &#10003;'],
        ['blocked', 'blocked &#10007;'],
        ['method', 'method not allowed'],
        ['credentials', 'credentials with *'],
      ],
    )}

    <g class="cors-cache">
      <text class="scene-caption-label cors-cache-label" x="${COL_X}" y="${CACHE_LABEL_Y}">preflight cache</text>
      <text class="scene-mono cors-cache-line" x="${COL_X}" y="${CACHE_METHODS_Y}">Allow-Methods: GET, PUT</text>
      <text class="scene-mono cors-cache-line" x="${COL_X}" y="${CACHE_HEADERS_Y}">Allow-Headers: Content-Type</text>
      <text class="scene-mono cors-cache-line" x="${COL_X}" y="${MAXAGE_Y}">${MAX_AGE_LABEL}</text>
      ${trackAndFill({
        x: BAR_X,
        y: BAR_Y,
        width: BAR_W,
        height: BAR_H,
        rx: BAR_H / 2,
        className: 'cors-maxage',
        fillWidth: BAR_W,
        indent: 6,
      })}
    </g>
  </g>

  ${serviceBox({
    x: API_X,
    width: API_W,
    y: API_Y,
    height: API_H,
    title: 'api.example',
    titleX: API_TITLE_X,
    titleY: API_TITLE_Y,
    titleAnchor: null,
    className: 'cors-api',
    boxClass: 'scene-box cors-api-box',
    children: `
    ${counterVariants({
      x: HANDLED_X,
      y: HANDLED_Y,
      className: 'cors-handled',
      max: HANDLED_MAX,
      format: (n) => `handled ${n}`,
      anchor: 'end',
    })}
    ${policyRow('origins', 'origins', 0, [
      ['none', '(not set)'],
      ['shop', 'https://shop.example'],
      ['any', '*'],
    ])}
    ${policyRow('methods', 'methods', 1, [
      ['none', '(not set)'],
      ['set', 'GET, PUT'],
    ])}
    ${policyRow('headers', 'headers', 2, [
      ['none', '(not set)'],
      ['set', 'Content-Type'],
    ])}
    ${policyRow('samesite', 'SameSite', 3, [
      ['none', '(not set)'],
      ['lax', 'Lax'],
    ])}
    ${policyRow('antiforgery', 'antiforgery', 4, [
      ['off', '(not set)'],
      ['on', 'required'],
    ])}
    ${variants(
      'scene-flash cors-note',
      POLICY_X,
      NOTE_Y,
      null,
      [
        ['executed', 'POST /transfer executed'],
        ['refused', 'no antiforgery token'],
      ],
    )}`,
  })}

  ${requestsLayer()}
</svg>`;
