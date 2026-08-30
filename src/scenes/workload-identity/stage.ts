/**
 * Static stage markup for the Workload Identity scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Four bands, one per party to a
 * credential nobody ever stored:
 *   - y 0..440       kept empty for the step title card
 *   - y 440..680     Pods: two capsules, `pod A` and `pod B`, each with one
 *                    credential slot and one lifetime bar. The slot is empty at
 *                    rest, holds the `secret` chip while the first step's ghost
 *                    is up, and holds a `token` once the platform has mounted
 *                    one. The three copies that fan out beside the slot are the
 *                    stored secret spreading into config, logs and registries.
 *   - y 880..1270    Platform (x 130..490): the `issuer` the cloud will decide
 *                    to trust, and the `token` mint that issues at birth and
 *                    re-issues before expiry. Cloud (x 590..950): the `aud`
 *                    check the exchange turns on, the `deny` plate a refusal
 *                    lands on, and the `ok n` every verdict that passed lands in
 *   - y 1500..1740   Resources: one card per resource, `storage` and `db`, each
 *                    carrying the `role` badge that names the one workload it
 *                    belongs to and the mark that says it has been reached
 *
 * Three lane segments and no others, every one axis aligned:
 *   - `X_PLATFORM` (310) between the Pods' bottom edge at 680 and the
 *     Platform's top edge at 880. It runs both ways: a pod's birth notice goes
 *     down it, and the token the platform mints comes back up it. The two
 *     directions never share the column — one traveller is gone before the next
 *     appears — so a 52px halo never meets another halo here.
 *   - `X_CLOUD` (770) from the Pods' bottom edge to the Cloud's top edge,
 *     carrying a token presented for exchange. Only presentations travel it: a
 *     refusal is a change of state inside the Cloud, not a packet coming back.
 *   - `X_ACCESS` (540) from the middle band's bottom edge at 1270 to the
 *     Resources' top edge at 1500, carrying granted access only. The Cloud sits
 *     to the right of this column, so a short elbow along the Cloud's own bottom
 *     edge joins the two: the segment a traveller rides is the vertical part,
 *     and both of its ends sit on a box edge.
 *
 * A traveller is a dot with a halo of r 26, so each lane sweeps a 52px band and
 * everything written beside one keeps 30px off it. The two upper lanes sweep
 * y 654..906 at x 284..336 and x 744..796, so the Pods write nothing below
 * y 624 in those columns and the Platform and the Cloud write nothing above
 * y 936 in them. The lower lane sweeps y 1244..1526 at x 514..566, so the
 * Resources write nothing above y 1556 in that column, which is why their title
 * sits on the low line at y 1612.
 *
 * Declared texture: the two pod capsules, the credential plate, the three
 * spread copies, the lifetime bar, the `issuer` and `token` plates, the `deny`
 * plate, the verdict glyphs, the two resource cards and the `role` badges.
 * Everything else on the stage is a word, and every word is one of the fifteen
 * fixed labels.
 *
 * Every value the reader can read is a stack of elements on one spot with a
 * base rule hiding all of them and the current `data-*` revealing one, so
 * nothing is interpolated and scrubbing backwards lands on the value rather
 * than on an average of two. The one continuous quantity on the stage is the
 * lifetime bar, and it is a width rather than a colour for exactly that reason.
 */

import { VIEWBOX, clientBox, counterVariants, requestsLayer, serviceBox, verticalLink } from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- geometry --------------------------------------------------------------

/** The three columns anything travels on, and the four edges they run between. */
export const X_PLATFORM = 310;
export const X_CLOUD = 770;
export const X_ACCESS = 540;
export const Y_PODS_BOTTOM = 680;
export const Y_MID_TOP = 880;
export const Y_MID_BOTTOM = 1270;
export const Y_RES_TOP = 1500;

/** Where the access lane meets the Cloud's own bottom edge. */
const ELBOW_X = 618;

/** The Pods band: a title, and one capsule per workload. */
const PODS = { x: 130, y: 440, w: 820, h: 240 };
const PODS_TITLE = { x: 152, y: 499 };
const CAPSULE = { w: 340, h: 110, y: 518 };
const POD_CX: Record<string, number> = { a: 320, b: 760 };
const POD_NAME_DX = -150;
const POD_NAME_Y = 555;
const CRED = { dx: -150, w: 140, h: 46, y: 576 };
const CRED_TEXT_DX = -80;
const CRED_TEXT_Y = 605;
const COPY = { w: 40, h: 42, y: 578, dxs: [10, 58, 106] };
const LIFE = { dx: 10, w: 140, h: 22, y: 588 };

/** The Platform band: the issuer it signs as, and the mint that issues. */
const PLATFORM = { x: 130, y: 880, w: 360, h: 390 };
const PLATFORM_TITLE = { x: 152, y: 992 };
const PLATE = { x: 152, w: 278, h: 74 };
const ISSUER_Y = 1030;
const ISSUER_TEXT_Y = 1078;
const MINT_Y = 1150;
const MINT_TEXT_Y = 1198;
const PLATE_TEXT_X = 172;

/** The Cloud band: the audience check, the refusal, and the count. */
const CLOUD = { x: 590, y: 880, w: 360, h: 390 };
const CLOUD_TITLE = { x: 612, y: 992 };
const AUD_X = 612;
const AUD_TEXT_Y = 1078;
const AUD_GLYPH = { cx: 890, cy: 1066 };
const DENY = { x: 612, y: 1120, w: 200, h: 66 };
const DENY_TEXT_Y = 1164;
const OK_X = 612;
const OK_Y = 1240;

/** The Resources band: one card per resource, each owned by one workload. */
const RESOURCES = { x: 280, y: 1500, w: 520, h: 240 };
const RESOURCES_TITLE = { x: 302, y: 1612 };
const CARD = { y: 1634, w: 232, h: 94 };
const CARD_X: Record<string, number> = { storage: 298, db: 550 };
const CARD_NAME_DX = 20;
const CARD_NAME_Y = 1674;
const CARD_GLYPH_DX = 196;
const CARD_GLYPH_Y = 1662;
const ROLE = { dx: 20, w: 192, h: 34, y: 1694 };
const ROLE_TEXT_Y = 1720;

// --- what the stage can say about itself -----------------------------------

/** The two workloads, told apart by name and by the resource they own. */
export const POD_IDS = ['a', 'b'] as const;
export type PodId = (typeof POD_IDS)[number];

/** The two resources, told apart by the workload whose role opens them. */
export const RESOURCE_IDS = ['storage', 'db'] as const;
export type ResourceId = (typeof RESOURCE_IDS)[number];

/**
 * Which workload each resource belongs to. The scene is told this once; every
 * access verdict in the fourth step is this map applied, and the `role` badges
 * are this map drawn.
 */
export const ROLE_MAP: Record<PodId, ResourceId> = { a: 'storage', b: 'db' };

/** What a pod is holding: nothing, a stored secret, or an issued token. */
export const CRED_STATES = ['none', 'secret', 'token'] as const;
export type CredState = (typeof CRED_STATES)[number];

/** The highest `ok` the Cloud can reach, which is how many variants it draws. */
export const MAX_OK = 3;

/** How wide a full lifetime bar is, so the timeline can drain it in pixels. */
export const LIFE_WIDTH = LIFE.w;

/** What the audience check is saying: nothing, looking, satisfied, refused. */
export const AUD_STATES = ['idle', 'check', 'ok', 'bad'] as const;
export type AudState = (typeof AUD_STATES)[number];

/** What a resource card is saying: untouched, or reached by the one it belongs to. */
export const ACCESS_STATES = ['idle', 'granted'] as const;
export type AccessState = (typeof ACCESS_STATES)[number];

/**
 * A reach the role map refused, named as the workload that made it and the
 * resource it wanted. Both crossings are drawn, because which one the run
 * produces is the role map's business rather than the stylesheet's.
 */
export const CROSS_STATES = ['none', 'a-db', 'b-storage'] as const;
export type CrossState = (typeof CROSS_STATES)[number];

/** A word the stage can say about itself, which is either said or not. */
export const FLAGS = ['off', 'on'] as const;
export type Flag = (typeof FLAGS)[number];

/** What the scene is holding up for a moment, drawn on the band it is about. */
export const MARKS = ['none', 'clean', 'issued', 'life', 'nohands', 'federation', 'share'] as const;
export type Mark = (typeof MARKS)[number];

/**
 * What every `data-*` on the stage starts at, keyed by the target the timeline
 * addresses it through. The markup below is written from this, so the opening
 * frame is the whole diagram in its starting state — two pods holding nothing,
 * an issuer nobody has decided about, a mint at rest, an audience check with
 * nothing to check, no refusal, nothing counted, two resources nobody owns yet
 * and nothing in flight — and the timeline never restates a value already there.
 */
export const STAGE_STATE: Record<string, string> = {
  'stage@data-wi-ghost': 'off',
  'stage@data-wi-alarm': 'off',
  'stage@data-wi-mark': 'none',
  'stage@data-wi-issuer': 'idle',
  'stage@data-wi-mint': 'idle',
  'stage@data-wi-aud': 'idle',
  'stage@data-wi-deny': 'off',
  'stage@data-wi-ok': '0',
  'stage@data-wi-roles': 'off',
  'stage@data-wi-cross': 'none',
  'stage@data-wi-settled': 'off',
  'pod-a@data-wi-cred': 'none',
  'pod-b@data-wi-cred': 'none',
  'pod-a@data-wi-spread': 'off',
  'pod-b@data-wi-spread': 'off',
  'pod-a@data-wi-raise': 'off',
  'pod-b@data-wi-raise': 'off',
  'card-storage@data-wi-access': 'idle',
  'card-db@data-wi-access': 'idle',
};

// --- markup ----------------------------------------------------------------

/** Newline plus `n` spaces, the separator between lines of one fragment. */
const pad = (n: number): string => `\n${' '.repeat(n)}`;

/** Non-breaking spaces, so a monospaced readout keeps its gaps in SVG. */
const mono = (text: string): string => text.replace(/ /g, '&#160;');

/** The name the fixed labels give a workload. */
export const podName = (id: PodId): string => `pod ${id.toUpperCase()}`;

/**
 * One workload: the capsule, its name, the one credential slot it has, the
 * copies a stored secret leaves behind, and the bar that says how much of the
 * issued token's life is left. The capsule is always drawn, because a pod does
 * not appear and disappear here; what changes is what is in the slot.
 */
const pod = (id: PodId): string => {
  const cx = POD_CX[id] ?? 0;
  const creds = (['secret', 'token'] as const)
    .map(
      (value) =>
        `<text class="wi-cred-text wi-cred-text--${value}" x="${cx + CRED_TEXT_DX}" y="${CRED_TEXT_Y}" text-anchor="middle">${value}</text>`,
    )
    .join(pad(6));
  const copies = COPY.dxs
    .map(
      (dx, index) =>
        `<rect class="wi-copy wi-copy--${index + 1}" x="${cx + dx}" y="${COPY.y}" width="${COPY.w}" height="${COPY.h}" rx="9" />`,
    )
    .join(pad(6));
  return `<g class="wi-pod wi-pod--${id}" data-wi-cred="${STAGE_STATE[`pod-${id}@data-wi-cred`]}" data-wi-spread="off" data-wi-raise="off">
      <rect class="wi-pod-bg" x="${cx - CAPSULE.w / 2}" y="${CAPSULE.y}" width="${CAPSULE.w}" height="${CAPSULE.h}" rx="22" />
      <text class="wi-pod-name" x="${cx + POD_NAME_DX}" y="${POD_NAME_Y}">${podName(id)}</text>
      <rect class="wi-cred-bg" x="${cx + CRED.dx}" y="${CRED.y}" width="${CRED.w}" height="${CRED.h}" rx="12" />
      ${creds}
      ${copies}
      <g class="wi-life">
        <rect class="scene-track wi-life-track" x="${cx + LIFE.dx}" y="${LIFE.y}" width="${LIFE.w}" height="${LIFE.h}" rx="9" />
        <rect class="scene-fill wi-life-fill" x="${cx + LIFE.dx}" y="${LIFE.y}" width="${LIFE.w}" height="${LIFE.h}" rx="9" />
      </g>
    </g>`;
};

/** One plate in the Platform: a rounded rectangle with one fixed word on it. */
const plate = (name: string, y: number, textY: number, text: string): string =>
  `<rect class="wi-plate-bg wi-plate-bg--${name}" x="${PLATE.x}" y="${y}" width="${PLATE.w}" height="${PLATE.h}" rx="16" />
    <text class="wi-plate-text wi-plate-text--${name}" x="${PLATE_TEXT_X}" y="${textY}">${text}</text>`;

/** The three shapes the audience check can show, stacked on one spot. */
const audGlyphs = (['check', 'ok', 'bad'] as const)
  .map((state) => {
    const inner =
      state === 'check'
        ? `<circle class="wi-glyph-ring" cx="${AUD_GLYPH.cx}" cy="${AUD_GLYPH.cy}" r="14" />`
        : state === 'ok'
          ? `<path class="wi-glyph-mark" d="M ${AUD_GLYPH.cx - 14} ${AUD_GLYPH.cy + 2} L ${AUD_GLYPH.cx - 5} ${AUD_GLYPH.cy + 13} L ${AUD_GLYPH.cx + 15} ${AUD_GLYPH.cy - 12}" />`
          : `<path class="wi-glyph-mark" d="M ${AUD_GLYPH.cx - 13} ${AUD_GLYPH.cy - 13} L ${AUD_GLYPH.cx + 13} ${AUD_GLYPH.cy + 13} M ${AUD_GLYPH.cx + 13} ${AUD_GLYPH.cy - 13} L ${AUD_GLYPH.cx - 13} ${AUD_GLYPH.cy + 13}" />`;
    return `<g class="wi-glyph wi-aud-glyph--${state}">${inner}</g>`;
  })
  .join(pad(4));

/** The count of verdicts the Cloud let through. It never goes backwards. */
const okReadout = counterVariants({
  x: OK_X,
  y: OK_Y,
  className: 'wi-ok',
  count: MAX_OK + 1,
  format: (n) => mono(`ok ${n}`),
  indent: 4,
});

/**
 * One resource: the card, its name, the mark that says the workload that owns
 * it has reached it, and the `role` badge naming that workload. The badge is
 * the role map drawn, so it appears when the fourth step turns the map on.
 */
const card = (id: ResourceId): string => {
  const x = CARD_X[id] ?? 0;
  const owner = POD_IDS.find((podId) => ROLE_MAP[podId] === id);
  return `<g class="wi-card wi-card--${id}" data-wi-access="${STAGE_STATE[`card-${id}@data-wi-access`]}">
      <rect class="wi-card-bg" x="${x}" y="${CARD.y}" width="${CARD.w}" height="${CARD.h}" rx="18" />
      <text class="wi-card-name" x="${x + CARD_NAME_DX}" y="${CARD_NAME_Y}">${id}</text>
      <g class="wi-glyph wi-card-glyph">
        <path class="wi-glyph-mark" d="M ${x + CARD_GLYPH_DX - 13} ${CARD_GLYPH_Y + 2} L ${x + CARD_GLYPH_DX - 4} ${CARD_GLYPH_Y + 12} L ${x + CARD_GLYPH_DX + 14} ${CARD_GLYPH_Y - 11}" />
      </g>
      <g class="wi-role wi-role--${id}">
        <rect class="wi-role-bg" x="${x + ROLE.dx}" y="${ROLE.y}" width="${ROLE.w}" height="${ROLE.h}" rx="10" />
        <text class="wi-role-text" x="${x + ROLE.dx + ROLE.w / 2}" y="${ROLE_TEXT_Y}" text-anchor="middle">${mono(`role ${owner ? podName(owner) : ''}`)}</text>
      </g>
    </g>`;
};

const stageAttrs = Object.entries(STAGE_STATE)
  .filter(([key]) => key.startsWith('stage@'))
  .map(([key, value]) => `${key.slice('stage@'.length)}="${value}"`)
  .join(' ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageAttrs} aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_PLATFORM, Y_PODS_BOTTOM, Y_MID_TOP)}
  ${verticalLink(X_CLOUD, Y_PODS_BOTTOM, Y_MID_TOP)}
  <line class="scene-link wi-lane--elbow" x1="${ELBOW_X}" y1="${Y_MID_BOTTOM}" x2="${X_ACCESS}" y2="${Y_MID_BOTTOM}" />
  ${verticalLink(X_ACCESS, Y_MID_BOTTOM, Y_RES_TOP, 'scene-link wi-lane--access')}

  ${clientBox({
    x: PODS.x,
    width: PODS.w,
    y: PODS.y,
    height: PODS.h,
    title: 'Pods',
    titleX: PODS_TITLE.x,
    titleY: PODS_TITLE.y,
    titleAnchor: null,
    extraClass: 'wi-pods',
    children: `
    ${POD_IDS.map(pod).join(pad(4))}`,
  })}

  ${serviceBox({
    x: PLATFORM.x,
    width: PLATFORM.w,
    y: PLATFORM.y,
    height: PLATFORM.h,
    title: 'Platform',
    titleX: PLATFORM_TITLE.x,
    titleY: PLATFORM_TITLE.y,
    titleAnchor: null,
    className: 'scene-node wi-platform',
    children: `
    ${plate('issuer', ISSUER_Y, ISSUER_TEXT_Y, 'issuer')}

    ${plate('mint', MINT_Y, MINT_TEXT_Y, 'token')}`,
  })}

  ${serviceBox({
    x: CLOUD.x,
    width: CLOUD.w,
    y: CLOUD.y,
    height: CLOUD.h,
    title: 'Cloud',
    titleX: CLOUD_TITLE.x,
    titleY: CLOUD_TITLE.y,
    titleAnchor: null,
    className: 'scene-node wi-cloud',
    children: `
    <text class="wi-aud-text" x="${AUD_X}" y="${AUD_TEXT_Y}">aud</text>

    ${audGlyphs}

    <g class="wi-deny">
      <rect class="wi-deny-bg" x="${DENY.x}" y="${DENY.y}" width="${DENY.w}" height="${DENY.h}" rx="14" />
      <text class="wi-deny-text" x="${DENY.x + DENY.w / 2}" y="${DENY_TEXT_Y}" text-anchor="middle">deny</text>
    </g>

    ${okReadout}`,
  })}

  ${serviceBox({
    x: RESOURCES.x,
    width: RESOURCES.w,
    y: RESOURCES.y,
    height: RESOURCES.h,
    title: 'Resources',
    titleX: RESOURCES_TITLE.x,
    titleY: RESOURCES_TITLE.y,
    titleAnchor: null,
    className: 'scene-service wi-resources',
    children: `
    ${RESOURCE_IDS.map(card).join(pad(4))}`,
  })}

  ${requestsLayer()}
</svg>`;
