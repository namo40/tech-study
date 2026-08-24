/**
 * Static stage markup for the Distributed Lock scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. The bands are the usual ones, with
 * a strip hung under the service band because the scene has to show both what
 * the report says now and the order the writes arrived in:
 *   - y 0..440       kept empty for the step title card
 *   - y 440..680     `inst A` and `inst B`, one box each, one lane each
 *   - y 880..1270    Lock service: the one row the key is held in, and the arc
 *                    that counts the lease down
 *   - y 1500..1740   Storage: the report itself, and the highest token it has
 *                    seen once fencing is on
 *   - y 1758..1850   the write log, which is the order the writes landed in
 *
 * Two instances, two lanes, and no other route. `X_A` and `X_B` run from the
 * instance boxes straight down into Storage, and every leg any traveller makes
 * is a move along one of them: there is no rail, no corner and no diagonal
 * anywhere in the scene. A lock call stops beside the Lock service at `Y_LOCK`
 * and is answered there; a write carries on to `Y_STORE` inside Storage. Both
 * lanes are drawn only as far as the top edge of the box they feed, so no line
 * ends in the open interior of a box.
 *
 * That is what decides where a label may sit. Both lanes sweep x 204..256 and
 * x 824..876 for their whole height, so the Lock service is drawn as its own
 * 480 wide box between them rather than as the usual full width frame: a node
 * label written from x 170 would run under the left lane, and the convention is
 * worth more than the extra width. Inside Storage the box spans the full width
 * but everything written in it keeps to x 300..790, which leaves at least 44px
 * on each side of a lane's swept box. The write log sits below y 1758, well
 * clear of the lowest point any traveller reaches.
 */

import {
  VIEWBOX,
  clientBox,
  requestsLayer,
  serviceBox,
  timerRing,
  verticalLink,
} from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- geometry --------------------------------------------------------------

/** The lane each instance travels on. */
export const X_A = 230;
export const X_B = 850;

/** Where a traveller starts, waits beside the Lock service, and lands. */
export const Y_INST = 620;
export const Y_LOCK = 1080;
export const Y_STORE = 1630;

/** The two instance boxes, one per lane. */
const INST_Y = 440;
const INST_H = 240;
const INST_W = 200;
const INST_TITLE_Y = 506;
const INST_STATE_Y = 556;

/** The Lock service, drawn between the lanes rather than across them. */
const NODE_X = 300;
const NODE_W = 480;
const NODE_Y = 880;
const NODE_H = 390;
const NODE_LABEL_Y = 938;

/** The lock row: four fields, name on the left and value on the right. */
const CARD_X = 320;
const CARD_Y = 964;
const CARD_W = 280;
const CARD_H = 240;
const FIELD_X = 340;
const VALUE_X = 580;
const FIELD_Y = [1010, 1068, 1126, 1184];

/** The lease countdown, and the two words that go under it. */
const RING_CX = 690;
const RING_CY = 1064;
const RING_R = 52;
const EXPIRED_Y = 1154;
const RENEW_Y = 1200;

/** Storage: the report, and the highest token it has seen. */
const STORE_X = 130;
const STORE_W = 820;
const STORE_Y = 1500;
const STORE_H = 240;
const STORE_TITLE_Y = 1554;
const FENCING_X = 780;
const VALUE_BOX_X = 340;
const VALUE_BOX_Y = 1590;
const VALUE_BOX_W = 400;
const VALUE_BOX_H = 70;
const VALUE_TEXT_Y = 1636;
const LAST_TOKEN_Y = 1710;
const REJECTED_X = 300;

/** The write log, under Storage because an arrival order is not a store. */
const LOG_X = 236;
const LOG_Y = 1758;
const LOG_W = 544;
const LOG_H = 92;
const SLOT_X = 250;
const SLOT_Y = 1772;
const SLOT_W = 76;
const SLOT_H = 64;
const SLOT_GAP = 12;
const SLOT_TEXT_Y = 1815;
const LOG_LABEL_X = 216;
const LOG_LABEL_Y = 1812;
const CORRUPT_X = 950;

/** How many writes the log can hold. The first step fills it exactly. */
export const LOG_SLOTS = 6;

// --- what the scene is told about the report -------------------------------

/** The version the report starts every step on. */
export const BASE_VERSION = 3;
/** The highest version any one step can reach: three writes plus a handover. */
export const MAX_VERSION = 7;

/** The tokens the fence counter hands out over the whole scene. */
export const FIRST_TOKEN = 33;
export const LAST_TOKEN = 38;

const TOKENS = Array.from({ length: LAST_TOKEN - FIRST_TOKEN + 1 }, (_v, i) => FIRST_TOKEN + i);
const VERSIONS = Array.from(
  { length: MAX_VERSION - BASE_VERSION + 1 },
  (_v, i) => BASE_VERSION + i,
);

/**
 * What every `data-*` on the stage starts at, keyed by the target the timeline
 * addresses it through. The markup below is written from this, so a change that
 * writes a value something already holds can be dropped rather than tweened.
 */
export const STAGE_STATE: Record<string, string> = {
  'stage@data-owner': 'none',
  'stage@data-token': 'none',
  'stage@data-ttl': 'none',
  'stage@data-lease': 'none',
  'stage@data-expiry': 'off',
  'stage@data-tick': 'off',
  'stage@data-fencing': 'off',
  'stage@data-last-token': 'none',
  'stage@data-value': 'v3',
  'stage@data-log': 'ok',
  'stage@data-verdict': 'none',
  'stage@data-a': 'idle',
  'stage@data-b': 'idle',
  ...Object.fromEntries(
    Array.from({ length: LOG_SLOTS }, (_v, i) => [`slot-${i + 1}@data-slot`, 'none']),
  ),
};

// --- markup ----------------------------------------------------------------

/** Every word an instance box can say about itself, keyed by `data-inst-state`. */
const INST_STATES: [string, string][] = [
  ['running', 'running'],
  ['waiting', 'waiting'],
  ['paused', 'paused'],
];

/** One instance: what it is called, and the one thing it is doing right now. */
const instanceBox = (key: 'a' | 'b', letter: string): string => {
  const centre = key === 'a' ? X_A : X_B;
  const states = INST_STATES.map(
    ([value, label]) =>
      `<text class="scene-flash dk-inst-state dk-inst-state--${value}" x="${centre}" y="${INST_STATE_Y}" text-anchor="middle">${label}</text>`,
  ).join('\n    ');
  return clientBox({
    x: centre - INST_W / 2,
    width: INST_W,
    y: INST_Y,
    height: INST_H,
    title: `inst ${letter}`,
    titleX: centre,
    titleY: INST_TITLE_Y,
    titleClass: 'scene-node-title dk-inst-title',
    extraClass: `dk-inst dk-inst--${key}`,
    children: `
    ${states}`,
  });
};

/** One field of the lock row: its name, and a stack of the values it can hold. */
const field = (index: number, name: string, variants: [string, string][]): string => {
  const y = FIELD_Y[index] ?? 0;
  const values = variants
    .map(
      ([value, label]) =>
        `<text class="scene-mono dk-value dk-value--${name}-${value}" x="${VALUE_X}" y="${y}" text-anchor="end">${label}</text>`,
    )
    .join('\n      ');
  return `<g class="dk-field dk-field--${name}">
      <text class="scene-caption-label dk-field-name" x="${FIELD_X}" y="${y}">${name}</text>
      ${values}
    </g>`;
};

const keyField = field(0, 'key', [['fixed', 'report-job']]);

const ownerField = field(1, 'owner', [
  ['none', '&#8212;'],
  ['a', 'inst A'],
  ['b', 'inst B'],
]);

const ttlField = field(2, 'TTL', [
  ['none', '&#8212; s'],
  ['set', '10 s'],
]);

const tokenField = field(3, 'token', [
  ['none', '&#8212;'] as [string, string],
  ...TOKENS.map((token) => [String(token), String(token)] as [string, string]),
]);

/** The report itself, one text variant per version it can be on. */
const reportVariants = [
  ...VERSIONS.map(
    (version) =>
      `<text class="scene-counter dk-report-text dk-report-text--v${version}" x="${VALUE_BOX_X + VALUE_BOX_W / 2}" y="${VALUE_TEXT_Y}" text-anchor="middle">report v${version}</text>`,
  ),
  `<text class="scene-counter dk-report-text dk-report-text--broken" x="${VALUE_BOX_X + VALUE_BOX_W / 2}" y="${VALUE_TEXT_Y}" text-anchor="middle">report ??</text>`,
].join('\n      ');

/** The highest token Storage has seen, once fencing is switched on. */
const lastTokenVariants = TOKENS.map(
  (token) =>
    `<text class="scene-mono dk-last-token dk-last-token--${token}" x="540" y="${LAST_TOKEN_Y}" text-anchor="middle">last token ${token}</text>`,
).join('\n    ');

/** One cell of the write log: which instance the write that landed came from. */
const logSlot = (index: number): string => {
  const x = SLOT_X + index * (SLOT_W + SLOT_GAP);
  return `<g class="dk-slot dk-slot--${index + 1}" data-slot="none">
      <rect class="scene-slot dk-slot-box" x="${x}" y="${SLOT_Y}" width="${SLOT_W}" height="${SLOT_H}" rx="16" />
      <text class="dk-slot-text dk-slot-text--a" x="${x + SLOT_W / 2}" y="${SLOT_TEXT_Y}" text-anchor="middle">A</text>
      <text class="dk-slot-text dk-slot-text--b" x="${x + SLOT_W / 2}" y="${SLOT_TEXT_Y}" text-anchor="middle">B</text>
    </g>`;
};

const stageAttributes = Object.entries(STAGE_STATE)
  .filter(([key]) => key.startsWith('stage@'))
  .map(([key, value]) => `${key.slice('stage@'.length)}="${value}"`)
  .join(' ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageAttributes} aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_A, INST_Y + INST_H, STORE_Y)}
  ${verticalLink(X_B, INST_Y + INST_H, STORE_Y)}
  <line class="scene-link" x1="${X_A}" y1="${Y_LOCK}" x2="${NODE_X}" y2="${Y_LOCK}" />
  <line class="scene-link" x1="${NODE_X + NODE_W}" y1="${Y_LOCK}" x2="${X_B}" y2="${Y_LOCK}" />

  ${instanceBox('a', 'A')}

  ${instanceBox('b', 'B')}

  <g class="dk-node">
    <rect class="scene-box" x="${NODE_X}" y="${NODE_Y}" width="${NODE_W}" height="${NODE_H}" rx="28" />
    <text class="scene-node-label" x="${NODE_X + 24}" y="${NODE_LABEL_Y}">Lock service</text>

    <rect class="scene-box dk-card" x="${CARD_X}" y="${CARD_Y}" width="${CARD_W}" height="${CARD_H}" rx="20" />
    ${keyField}
    ${ownerField}
    ${ttlField}
    ${tokenField}

    ${timerRing({ cx: RING_CX, cy: RING_CY, r: RING_R, className: 'dk-ttl' })}
    <text class="scene-flash dk-expired" x="${RING_CX}" y="${EXPIRED_Y}" text-anchor="middle">expired</text>
    <text class="scene-flash dk-renew" x="${RING_CX}" y="${RENEW_Y}" text-anchor="middle">renew</text>
  </g>

  ${serviceBox({
    x: STORE_X,
    width: STORE_W,
    y: STORE_Y,
    height: STORE_H,
    title: 'Storage',
    titleX: 300,
    titleY: STORE_TITLE_Y,
    titleClass: 'scene-node-label',
    titleAnchor: null,
    className: 'dk-store',
    children: `
    <text class="scene-flash dk-fencing" x="${FENCING_X}" y="${STORE_TITLE_Y}" text-anchor="end">fencing</text>

    <g class="dk-report">
      <rect class="scene-chip-outline dk-report-bg" x="${VALUE_BOX_X}" y="${VALUE_BOX_Y}" width="${VALUE_BOX_W}" height="${VALUE_BOX_H}" rx="20" />
      ${reportVariants}
    </g>

    ${lastTokenVariants}
    <text class="scene-flash dk-rejected" x="${REJECTED_X}" y="${LAST_TOKEN_Y}">rejected</text>`,
  })}

  <g class="dk-log">
    <rect class="dk-log-frame" x="${LOG_X}" y="${LOG_Y}" width="${LOG_W}" height="${LOG_H}" rx="24" />
    <text class="scene-caption-label dk-log-label" x="${LOG_LABEL_X}" y="${LOG_LABEL_Y}" text-anchor="end">writes</text>
    ${Array.from({ length: LOG_SLOTS }, (_value, index) => logSlot(index)).join('\n    ')}
  </g>
  <text class="scene-flash dk-corrupt" x="${CORRUPT_X}" y="${LOG_LABEL_Y}" text-anchor="end">corrupt</text>

  ${requestsLayer()}
</svg>`;
