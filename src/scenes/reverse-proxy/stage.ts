/**
 * Static stage markup for the Reverse Proxy scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. The bands are the usual ones, with
 * one seat in the middle and two private services under it:
 *   - y 0..400       above the cropped viewBox (see shared VIEWBOX)
 *   - y 400..440     the frame's top padding; nothing is drawn here
 *   - y 440..680     Clients, all of them leaving on the one public lane
 *   - y 880..1270    Reverse Proxy: the route card it matches paths against,
 *                    the boundary work it does (TLS, forwarded header, auth,
 *                    rate limit) and what its probes say about each instance
 *   - y 1500..1740   App, holding the two instances `a1` and `a2`, and API.
 *                    Both are `private`: no client ever reaches them directly
 *
 * Three lanes and no others. `X_CLIENT` runs from the bottom edge of Clients to
 * the top edge of the proxy, `X_APP` and `X_API` from the bottom edge of the
 * proxy to the top edge of the service each one names. Every leg any traveller
 * makes is a move along one of them, so nothing here is a rail, a corner or a
 * diagonal, and no leg has zero length.
 *
 * The proxy is a boundary rather than a corridor, which is why a request is not
 * drawn crossing it. A client hop ends on the proxy's top edge and is absorbed;
 * the hop that carries the same work inward starts on the proxy's bottom edge.
 * That is what the seat actually does — it terminates one connection and opens
 * another — and it is the reason TLS can end here and the caller the backend
 * sees is the proxy rather than the client.
 *
 * Which instance answers is in-box state, never a change of lane: the App lane
 * always ends at y 1500, and the row that lights up says whether `a1` or `a2`
 * took the work. That keeps the choice readable without a second lane, and it
 * keeps the label rules simple, because the only stretch a traveller sweeps
 * inside a service box is the 26px halo hanging below its top edge.
 */

import {
  VIEWBOX,
  chip,
  clientBox,
  healthDot,
  nodeFrame,
  requestsLayer,
  serviceBox,
  verticalLink,
} from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- the three lanes -------------------------------------------------------

/** The public lane. Every client request travels on this one and no other. */
export const X_CLIENT = 540;
/** Bottom edge of Clients, and top edge of the proxy. */
export const Y_CLIENT = 680;
export const Y_PROXY_TOP = 880;

/** The two private lanes, and the edges they run between. */
export const X_APP = 310;
export const X_API = 770;
export const Y_PROXY_BOTTOM = 1270;
export const Y_BACKEND = 1500;

/** Length of each lane, so the scene can travel both at one speed. */
export const OUTER_SPAN = Y_PROXY_TOP - Y_CLIENT;
export const INNER_SPAN = Y_BACKEND - Y_PROXY_BOTTOM;

// --- the boxes -------------------------------------------------------------

const CLIENTS = { x: 130, y: 440, w: 820, h: 240 };
const NODE = { y: 880, h: 390 };
const APP = { x: 130, y: 1500, w: 360, h: 240 };
const API = { x: 590, y: 1500, w: 360, h: 240 };

const NODE_LABEL_Y = 938;
const SERVICE_TITLE_Y = 1552;

/** The badge both services wear, and where each one sits. */
const BADGE = { w: 106, h: 46, y: 1520 };
const APP_BADGE_X = 370;
const API_BADGE_X = 830;

// --- inside the proxy ------------------------------------------------------

/** The route card: one rect per number of rows, one row per route. */
const CARD_X = 168;
const CARD_Y = 968;
const CARD_W = 388;
const CARD_H2 = 160;
const CARD_H3 = 228;

/** Rows, top down. The third one only exists once the gateway takes it on. */
const ROW_Y = [990, 1058, 1126];
const ROW_H = 52;
const ROW_TEXT_X = 192;
const ROW_TEXT_DY = 36;
const HIT_X = 176;
const HIT_W = 372;

/** Every route the card can hold, in the order it lists them. */
export const ROUTES = ['app', 'api', 'reports'] as const;
export type Route = (typeof ROUTES)[number];

const ROUTE_LABEL: Record<Route, string> = {
  app: '/app → App',
  api: '/api → API',
  reports: '/reports → API',
};

/** The boundary work, as chips and a header card down the right of the node. */
const TLS_CHIP = { x: 596, y: 966, w: 104, h: 54 };
const AUTH_CHIP = { x: 716, y: 966, w: 112, h: 54 };
const LIMIT_CHIP = { x: 596, y: 1036, w: 200, h: 54 };
const XFF_CARD = { x: 596, y: 1106, w: 320, h: 66 };
const XFF_TEXT = { x: 616, y: 1148 };

/** What the proxy's probes say about each App instance, on the node's top row. */
const PROBE = [
  { key: 'a1', cx: 632, textX: 664 },
  { key: 'a2', cx: 740, textX: 772 },
] as const;
const PROBE_CY = 928;
const PROBE_TEXT_Y = 938;

// --- inside App ------------------------------------------------------------

/** One row per instance: the health of it, and its name. */
export const SLOTS = ['a1', 'a2'] as const;
export type Slot = (typeof SLOTS)[number];

const SLOT_X = 152;
const SLOT_W = 316;
const SLOT_H = 62;
const SLOT_Y: Record<Slot, number> = { a1: 1584, a2: 1660 };
const SLOT_DOT_X = 190;
const SLOT_TEXT_X = 226;

// --- the labels that only appear once the scene has earned them ------------

/** `https` outside the seat, `http` inside it, and the refusal at the door. */
const HTTPS_LABEL = { x: 620, y: 792 };
const HTTP_LABEL = { x: X_CLIENT, y: 1400 };
const REJECT_LABEL = { x: 612, y: 856 };

// --- markup ----------------------------------------------------------------

const routeRows = ROUTES.map(
  (route, index) =>
    `<text class="scene-mono rvp-route rvp-route--${route}" x="${ROW_TEXT_X}" y="${(ROW_Y[index] ?? 0) + ROW_TEXT_DY}">${ROUTE_LABEL[route]}</text>`,
).join('\n    ');

const routeHits = ROUTES.map(
  (route, index) =>
    `<rect class="rvp-hit rvp-hit--${route}" x="${HIT_X}" y="${ROW_Y[index] ?? 0}" width="${HIT_W}" height="${ROW_H}" rx="14" />`,
).join('\n    ');

const routeCard = [
  `<rect class="rvp-card rvp-card--2" x="${CARD_X}" y="${CARD_Y}" width="${CARD_W}" height="${CARD_H2}" rx="20" />`,
  `<rect class="rvp-card rvp-card--3" x="${CARD_X}" y="${CARD_Y}" width="${CARD_W}" height="${CARD_H3}" rx="20" />`,
].join('\n    ');

/** One chip: a plate that is simply not there until the seat takes the job on. */
const workChip = (
  key: string,
  label: string,
  box: { x: number; y: number; w: number; h: number },
): string =>
  chip({
    x: box.x,
    y: box.y,
    width: box.w,
    height: box.h,
    rx: 18,
    className: `rvp-chip rvp-chip--${key}`,
    bgClass: 'rvp-chip-bg',
    variant: 'outline',
    text: `<text class="rvp-chip-text" x="${box.x + box.w / 2}" y="${box.y + 38}" text-anchor="middle">${label}</text>`,
  });

const probes = PROBE.map(
  (probe) => `<g class="rvp-probe">
      ${healthDot({ cx: probe.cx, cy: PROBE_CY, r: 13, ringR: 22, attrs: ' data-health-state="up"', indent: 6 })}
      <text class="scene-mono rvp-probe-name" x="${probe.textX}" y="${PROBE_TEXT_Y}">${probe.key}</text>
    </g>`,
).join('\n    ');

/** The badge that says a client never reaches this box on its own. */
const privateBadge = (x: number): string => `<g>
      <rect class="rvp-private-bg" x="${x}" y="${BADGE.y}" width="${BADGE.w}" height="${BADGE.h}" rx="${BADGE.h / 2}" />
      <text class="rvp-private-text" x="${x + BADGE.w / 2}" y="${BADGE.y + 32}" text-anchor="middle">private</text>
    </g>`;

/** One instance of App: how it is doing, and what it is called. */
const slotRow = (slot: Slot): string => {
  const y = SLOT_Y[slot];
  return `<g class="rvp-inst" data-inst="idle">
      <rect class="scene-slot rvp-slot" x="${SLOT_X}" y="${y}" width="${SLOT_W}" height="${SLOT_H}" rx="16" />
      ${healthDot({ cx: SLOT_DOT_X, cy: y + SLOT_H / 2, r: 13, ringR: 22, attrs: ' data-health-state="up"', indent: 6 })}
      <text class="scene-mono rvp-inst-name" x="${SLOT_TEXT_X}" y="${y + 41}">${slot}</text>
    </g>`;
};

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" data-picked="none" data-routes="2" data-tls="off" data-xff="off" data-auth="off" data-quota="off" data-https="off" data-http="off" data-refuse="off" data-private="on" aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_CLIENT, Y_CLIENT, Y_PROXY_TOP)}
  ${verticalLink(X_APP, Y_PROXY_BOTTOM, Y_BACKEND)}
  ${verticalLink(X_API, Y_PROXY_BOTTOM, Y_BACKEND)}

  ${clientBox({
    x: CLIENTS.x,
    width: CLIENTS.w,
    y: CLIENTS.y,
    height: CLIENTS.h,
    title: 'Clients',
    titleY: 512,
  })}

  <text class="rvp-hop rvp-hop--https" x="${HTTPS_LABEL.x}" y="${HTTPS_LABEL.y}">https</text>
  <text class="rvp-reject" x="${REJECT_LABEL.x}" y="${REJECT_LABEL.y}">401</text>

  ${nodeFrame({
    y: NODE.y,
    height: NODE.h,
    label: 'Reverse Proxy',
    labelY: NODE_LABEL_Y,
    children: `    ${probes}

    ${routeCard}
    ${routeHits}
    ${routeRows}

    ${workChip('tls', 'TLS', TLS_CHIP)}
    ${workChip('auth', 'auth', AUTH_CHIP)}
    ${workChip('limit', 'rate limit', LIMIT_CHIP)}

    <g class="rvp-xff">
      <rect class="rvp-xff-bg" x="${XFF_CARD.x}" y="${XFF_CARD.y}" width="${XFF_CARD.w}" height="${XFF_CARD.h}" rx="16" />
      <text class="scene-mono rvp-xff-text" x="${XFF_TEXT.x}" y="${XFF_TEXT.y}">X-Forwarded-For</text>
    </g>`,
  })}

  <text class="rvp-hop rvp-hop--http" x="${HTTP_LABEL.x}" y="${HTTP_LABEL.y}" text-anchor="middle">http</text>

  ${serviceBox({
    x: APP.x,
    width: APP.w,
    y: APP.y,
    height: APP.h,
    title: 'App',
    titleX: 170,
    titleY: SERVICE_TITLE_Y,
    titleClass: 'scene-node-label',
    titleAnchor: null,
    children: `
    ${privateBadge(APP_BADGE_X)}
    ${SLOTS.map((slot) => slotRow(slot)).join('\n    ')}`,
  })}

  ${serviceBox({
    x: API.x,
    width: API.w,
    y: API.y,
    height: API.h,
    title: 'API',
    titleX: 630,
    titleY: SERVICE_TITLE_Y,
    titleClass: 'scene-node-label',
    titleAnchor: null,
    children: `
    ${privateBadge(API_BADGE_X)}`,
  })}

  ${requestsLayer()}
</svg>`;
