/**
 * Static stage markup for the Secret Injection scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Four bands, one per stop on the
 * road a credential travels when it is not allowed to live in the artifact:
 *   - y 0..440       kept empty for the step title card
 *   - y 440..680     Image (x 130..950): the layer strip the artifact is made
 *                    of, the `secret` the first step shows baked into it, and
 *                    the copies that spread the moment anything pulls the
 *                    image. After the lift the strip is drawn clean, which is
 *                    its own picture rather than the absence of one.
 *   - y 880..1270    Pods (x 130..950): one capsule per workload. `pod A` takes
 *                    its credential as `env` and carries the leaks that come
 *                    with it and the restart a new value costs; `pod B` takes
 *                    its as a mounted `file` and carries neither.
 *   - y 1500..1740   Store (x 280..800): the `secret v n` card that owns the
 *                    version, the `allow` list that says who may read, the
 *                    `deny` lamp a refusal lands on, and the `ok n` every
 *                    delivery that passed is counted in.
 *
 * Two lane segments and no others, both axis aligned:
 *   - `X_DEPLOY` (310) from the Image's bottom edge at 680 to the Pods' top
 *     edge at 880, downward only: it carries a deployment, and after the first
 *     step nothing on it is carrying a credential.
 *   - `X_INJECT` (540) from the Store's top edge at 1500 to the Pods' bottom
 *     edge at 1270, upward only. Every delivery in the scene rides it and
 *     nothing ever rides it the other way, so the single direction is the
 *     picture: the store is asked from below and answers upward. A refusal is
 *     a change of state inside the Store rather than a packet, so nothing
 *     travels when the list says no.
 *
 * A traveller is a dot with a halo of r 26, so each lane sweeps a 52px band and
 * everything written beside one keeps 30px off it. The deploy lane sweeps
 * y 654..906 at x 284..336, so the Image writes nothing below y 624 in that
 * column and the Pods write nothing above y 936 in it. The inject lane sweeps
 * y 1244..1526 at x 514..566, so the Pods write nothing below y 1214 in that
 * column and the Store writes nothing above y 1556 in it, which is why the
 * Store's own title sits to the left of that column and everything else it
 * holds starts below y 1576.
 *
 * Declared texture: the layer strip, the baked plate and the copies, the two
 * pod capsules, the two slot plates and the mount glyph, the leak marks, the
 * restart ring, the version card, the `allow` and `deny` plates. Everything
 * else on the stage is a word, and every word is one of the thirteen fixed
 * labels.
 *
 * Every value the reader can read is a stack of elements on one spot with a
 * base rule hiding all of them and the current `data-*` revealing one, so
 * nothing is interpolated and scrubbing backwards lands on the value rather
 * than on an average of two. The scene has no continuous quantity at all: a
 * version is 1 or 2, a slot is empty or holds one of them, and a count is a
 * count.
 */

import { VIEWBOX, clientBox, counterVariants, requestsLayer, serviceBox, verticalLink } from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- geometry --------------------------------------------------------------

/** The two columns anything travels on, and the four edges they run between. */
export const X_DEPLOY = 310;
export const X_INJECT = 540;
export const Y_IMAGE_BOTTOM = 680;
export const Y_PODS_TOP = 880;
export const Y_PODS_BOTTOM = 1270;
export const Y_STORE_TOP = 1500;

/** The Image band: the layer strip, what is baked into it, what it spreads. */
const IMAGE = { x: 130, y: 440, w: 820, h: 240 };
const IMAGE_TITLE = { x: 152, y: 498 };
const STRIP = { x: 350, w: 380, h: 20, ys: [512, 542, 572, 602] };
const BAKED = { x: 380, y: 546, w: 200, h: 52 };
const BAKED_TEXT = { x: 480, y: 582 };
const COPY = { x: 790, w: 120, h: 34, ys: [508, 552, 596] };

/** The Pods band: one capsule per workload, each with one delivery slot. */
const PODS = { x: 130, y: 880, w: 820, h: 390 };
const PODS_TITLE = { x: 152, y: 958 };
const CAPSULE = { x: 160, w: 760, h: 100 };
const POD_Y: Record<string, number> = { a: 1000, b: 1120 };
const POD_NAME = { dx: 26, dy: 60 };
const SLOT = { dx: 190, w: 310, dy: 20, h: 60 };
const SLOT_NAME_DX = 216;
const SLOT_VALUE_DX = 476;
const SLOT_TEXT_DY = 59;
const MOUNT = { dx: 206, dy: 28, w: 28, h: 32 };
const LEAK = { dxs: [530, 582, 634], dy: 29, w: 40, h: 42 };
const RESTART = { dx: 720, dy: 50, r: 22 };

/** The Store band: the version, the list, the refusal, the count. */
const STORE = { x: 280, y: 1500, w: 520, h: 240 };
const STORE_TITLE = { x: 302, y: 1556 };
const CARD = { x: 302, y: 1576, w: 300, h: 68 };
const CARD_NAME = { x: 324, y: 1620 };
const CARD_VERSION = { x: 580, y: 1620 };
const ALLOW = { x: 302, y: 1662, w: 200, h: 60 };
const ALLOW_TEXT = { x: 402, y: 1700 };
const DENY = { x: 540, y: 1662, w: 140, h: 60 };
const DENY_TEXT = { x: 610, y: 1700 };
const OK = { x: 778, y: 1700 };

// --- what the stage can say about itself -----------------------------------

/** The two workloads, told apart by the road their credential takes. */
export const POD_IDS = ['a', 'b'] as const;
export type PodId = (typeof POD_IDS)[number];

/** The two delivery paths, and which pod each capsule draws. */
export const PATHS = ['env', 'file'] as const;
export type Path = (typeof PATHS)[number];

/**
 * Which path each workload is served by. The scene is told this once: the slot
 * each capsule draws is this map, and so is every verdict, because a path only
 * ever delivers to the pods its own list names.
 */
export const PATH_OF: Record<PodId, Path> = { a: 'env', b: 'file' };

/**
 * Who each path may deliver to. This is the access list the third step draws,
 * and it is the only thing in the scene that ever refuses a delivery: the file
 * path names `pod B` and nobody else, so a reach from anywhere else is a `deny`
 * rather than a mount.
 */
export const ACCESS_LIST: Record<Path, readonly PodId[]> = { env: ['a'], file: ['b'] };

/** What the artifact is: untouched, carrying a baked secret, or known clean. */
export const IMAGE_STATES = ['plain', 'baked', 'clean'] as const;
export type ImageState = (typeof IMAGE_STATES)[number];

/** How far the copies have got, and the tick where the spread stops being fixable. */
export const SPREAD_STATES = ['off', '1', '2', '3', 'peak'] as const;
export type SpreadState = (typeof SPREAD_STATES)[number];

/** What a delivery slot is holding. Nothing is ever half-delivered. */
export const SLOT_STATES = ['empty', 'v1', 'v2'] as const;
export type SlotState = (typeof SLOT_STATES)[number];

/** The versions the store can hold, drawn on the card and in a filled slot. */
export const VERSIONS = ['1', '2'] as const;
export type Version = (typeof VERSIONS)[number];

/** What the restart indicator is saying about the environment's frozen value. */
export const RESTART_STATES = ['none', 'hint', 'due', 'running'] as const;
export type RestartState = (typeof RESTART_STATES)[number];

/** What the access list is doing: unseen, drawn, or lighting up on a match. */
export const ALLOW_STATES = ['off', 'on', 'hit'] as const;
export type AllowState = (typeof ALLOW_STATES)[number];

/** A word the stage can say about itself, which is either said or not. */
export const FLAGS = ['off', 'on'] as const;
export type Flag = (typeof FLAGS)[number];

/** What the scene is holding up for a moment, drawn on the band it is about. */
export const MARKS = ['none', 'clean', 'delivery', 'anywhere', 'frozen', 'audit', 'managed', 'norebuild'] as const;
export type Mark = (typeof MARKS)[number];

/** The highest `ok` the Store can reach, which is how many variants it draws. */
export const MAX_OK = 4;

/** The name the fixed labels give a workload. */
export const podName = (id: PodId): string => `pod ${id.toUpperCase()}`;

/**
 * What every `data-*` on the stage starts at, keyed by the target the timeline
 * addresses it through. The markup below is written from this, so the opening
 * frame is the whole diagram in its starting state — an untouched image, two
 * pods that have not started and hold nothing, a store on version 1 with its
 * list undrawn, no refusal, nothing counted and nothing in flight — and the
 * timeline never restates a value already there.
 */
export const STAGE_STATE: Record<string, string> = {
  'stage@data-sj-image': 'plain',
  'stage@data-sj-spread': 'off',
  'stage@data-sj-mode': 'off',
  'stage@data-sj-version': '1',
  'stage@data-sj-allow': 'off',
  'stage@data-sj-deny': 'off',
  'stage@data-sj-ok': '0',
  'stage@data-sj-mark': 'none',
  'stage@data-sj-settled': 'off',
  'pod-a@data-sj-run': 'off',
  'pod-b@data-sj-run': 'off',
  'pod-a@data-sj-slot': 'empty',
  'pod-b@data-sj-slot': 'empty',
  'pod-a@data-sj-stale': 'off',
  'pod-a@data-sj-restart': 'none',
  'pod-a@data-sj-leak': 'off',
  'pod-a@data-sj-refused': 'off',
};

// --- markup ----------------------------------------------------------------

/** Newline plus `n` spaces, the separator between lines of one fragment. */
const pad = (n: number): string => `\n${' '.repeat(n)}`;

/** Non-breaking spaces, so a monospaced readout keeps its gaps in SVG. */
const mono = (text: string): string => text.replace(/ /g, '&#160;');

/** The layer strip: the artifact drawn as the thing it is actually made of. */
const strip = STRIP.ys
  .map(
    (y, index) =>
      `<rect class="sj-bar sj-bar--${index + 1}" x="${STRIP.x}" y="${y}" width="${STRIP.w}" height="${STRIP.h}" rx="8" />`,
  )
  .join(pad(4));

/** The copies the baked secret leaves wherever the image is pulled. */
const copies = COPY.ys
  .map(
    (y, index) =>
      `<rect class="sj-copy sj-copy--${index + 1}" x="${COPY.x}" y="${y}" width="${COPY.w}" height="${COPY.h}" rx="10" />`,
  )
  .join(pad(4));

/**
 * One workload: the capsule, its name, and the one slot its path delivers into.
 * The capsule is always drawn, because the argument is about what is in the
 * slot rather than about which pods exist. Only the environment pod draws the
 * leaks and the restart, because only the environment pays for them.
 */
const pod = (id: PodId): string => {
  const y = POD_Y[id] ?? 0;
  const path = PATH_OF[id];
  const values = VERSIONS.map(
    (v) =>
      `<text class="sj-value sj-value--v${v}" x="${CAPSULE.x + SLOT_VALUE_DX}" y="${y + SLOT_TEXT_DY}" text-anchor="end">${mono(`v ${v}`)}</text>`,
  ).join(pad(6));
  const mount =
    path === 'file'
      ? `
      <path class="sj-mount" d="M ${CAPSULE.x + MOUNT.dx} ${y + MOUNT.dy} l ${MOUNT.w - 9} 0 l 9 9 l 0 ${MOUNT.h - 9} l ${-MOUNT.w} 0 Z" />`
      : '';
  const extras =
    id === 'a'
      ? `
      ${LEAK.dxs.map((dx, index) => `<rect class="sj-leak sj-leak--${index + 1}" x="${CAPSULE.x + dx}" y="${y + LEAK.dy}" width="${LEAK.w}" height="${LEAK.h}" rx="9" />`).join(pad(6))}
      ${(['hint', 'due', 'running'] as const)
        .map(
          (state) =>
            `<g class="sj-restart sj-restart--${state}">
        <circle class="sj-restart-ring" cx="${CAPSULE.x + RESTART.dx}" cy="${y + RESTART.dy}" r="${RESTART.r}" />
        <path class="sj-restart-arrow" d="M ${CAPSULE.x + RESTART.dx} ${y + RESTART.dy - RESTART.r - 4} l 14 8 l -14 8 Z" />
      </g>`,
        )
        .join(pad(6))}`
      : '';
  const stateAttrs =
    id === 'a'
      ? ' data-sj-stale="off" data-sj-restart="none" data-sj-leak="off" data-sj-refused="off"'
      : '';
  return `<g class="sj-pod sj-pod--${id}" data-sj-run="off" data-sj-slot="empty"${stateAttrs}>
      <rect class="sj-pod-bg" x="${CAPSULE.x}" y="${y}" width="${CAPSULE.w}" height="${CAPSULE.h}" rx="24" />
      <text class="sj-pod-name" x="${CAPSULE.x + POD_NAME.dx}" y="${y + POD_NAME.dy}">${podName(id)}</text>
      <rect class="sj-slot-bg sj-slot-bg--${path}" x="${CAPSULE.x + SLOT.dx}" y="${y + SLOT.dy}" width="${SLOT.w}" height="${SLOT.h}" rx="14" />${mount}
      <text class="sj-slot-name" x="${CAPSULE.x + SLOT_NAME_DX + (path === 'file' ? 44 : 0)}" y="${y + SLOT_TEXT_DY}">${path}</text>
      ${values}${extras}
    </g>`;
};

/** The count of deliveries the list let through. It never goes backwards. */
const okReadout = counterVariants({
  x: OK.x,
  y: OK.y,
  className: 'sj-ok',
  count: MAX_OK + 1,
  format: (n) => mono(`ok ${n}`),
  anchor: 'end',
  indent: 4,
});

/** The two versions the store card can be showing, stacked on one spot. */
const cardVersions = VERSIONS.map(
  (v) =>
    `<text class="sj-card-version sj-card-version--${v}" x="${CARD_VERSION.x}" y="${CARD_VERSION.y}" text-anchor="end">${mono(`v ${v}`)}</text>`,
).join(pad(4));

const stageAttrs = Object.entries(STAGE_STATE)
  .filter(([key]) => key.startsWith('stage@'))
  .map(([key, value]) => `${key.slice('stage@'.length)}="${value}"`)
  .join(' ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageAttrs} aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_DEPLOY, Y_IMAGE_BOTTOM, Y_PODS_TOP, 'scene-link sj-lane--deploy')}
  ${verticalLink(X_INJECT, Y_PODS_BOTTOM, Y_STORE_TOP, 'scene-link sj-lane--inject')}

  ${clientBox({
    x: IMAGE.x,
    width: IMAGE.w,
    y: IMAGE.y,
    height: IMAGE.h,
    title: 'Image',
    titleX: IMAGE_TITLE.x,
    titleY: IMAGE_TITLE.y,
    titleClass: 'scene-node-title sj-title',
    titleAnchor: null,
    extraClass: 'sj-image',
    children: `
    ${strip}

    <g class="sj-baked">
      <rect class="sj-baked-mask" x="${BAKED.x}" y="${BAKED.y}" width="${BAKED.w}" height="${BAKED.h}" rx="14" />
      <rect class="sj-baked-bg" x="${BAKED.x}" y="${BAKED.y}" width="${BAKED.w}" height="${BAKED.h}" rx="14" />
      <text class="sj-baked-text" x="${BAKED_TEXT.x}" y="${BAKED_TEXT.y}" text-anchor="middle">secret</text>
    </g>

    ${copies}`,
  })}

  ${serviceBox({
    x: PODS.x,
    width: PODS.w,
    y: PODS.y,
    height: PODS.h,
    title: 'Pods',
    titleX: PODS_TITLE.x,
    titleY: PODS_TITLE.y,
    titleClass: 'scene-node-title sj-title',
    titleAnchor: null,
    className: 'scene-node sj-pods',
    children: `
    ${POD_IDS.map(pod).join(pad(4))}`,
  })}

  ${serviceBox({
    x: STORE.x,
    width: STORE.w,
    y: STORE.y,
    height: STORE.h,
    title: 'Store',
    titleX: STORE_TITLE.x,
    titleY: STORE_TITLE.y,
    titleClass: 'scene-node-title sj-title',
    titleAnchor: null,
    className: 'scene-service sj-store',
    children: `
    <g>
      <rect class="sj-card-bg" x="${CARD.x}" y="${CARD.y}" width="${CARD.w}" height="${CARD.h}" rx="16" />
      <text class="sj-card-name" x="${CARD_NAME.x}" y="${CARD_NAME.y}">secret</text>
      ${cardVersions}
    </g>

    <g class="sj-allow">
      <rect class="sj-allow-bg" x="${ALLOW.x}" y="${ALLOW.y}" width="${ALLOW.w}" height="${ALLOW.h}" rx="14" />
      <text class="sj-allow-text" x="${ALLOW_TEXT.x}" y="${ALLOW_TEXT.y}" text-anchor="middle">${mono(`allow ${podName('b')}`)}</text>
    </g>

    <g class="sj-deny">
      <rect class="sj-deny-bg" x="${DENY.x}" y="${DENY.y}" width="${DENY.w}" height="${DENY.h}" rx="14" />
      <text class="sj-deny-text" x="${DENY_TEXT.x}" y="${DENY_TEXT.y}" text-anchor="middle">deny</text>
    </g>

    ${okReadout}`,
  })}

  ${requestsLayer()}
</svg>`;
