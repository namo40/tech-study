/**
 * Static stage markup for the Bearer Token scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. The bands are the usual ones:
 *   - y 0..400       above the cropped viewBox (see shared VIEWBOX)
 *   - y 400..440     the frame's top padding; nothing is drawn here
 *   - y 440..680     the Client: the call it is making, the header that call
 *                    carries, the word it says when it swaps tokens, and the
 *                    countdown on the token it is holding
 *   - y 880..1270    the API: the row of validation gates a presented token is
 *                    put through, and the two answers the API has given
 *   - y 1500..1850   the Token panel, which is the same token taken apart:
 *                    three base64 segments, the claims inside the middle one,
 *                    and the stamp that says it has been put on a deny list
 *   - y 1500..1740   the Attacker, which appears in the third step holding a
 *                    copy of the very token the Client is using
 *
 * Two lanes and nothing else travels. `LANE_CLIENT` runs at x 540, the shared
 * centre of the Client box and the API frame, from the Client's bottom edge to
 * the API's top edge. `LANE_ATTACKER` runs at x 800, the centre of the Attacker
 * box, from the Attacker's top edge up to the API's bottom edge — upward,
 * because the leak comes at the API from underneath. Both legs are vertical,
 * neither has zero length, and each end sits exactly on a box edge.
 *
 * That is what decides where a label may sit. A traveller is a dot with a halo
 * of r 26, so each lane sweeps a 52px band and everything written beside one
 * keeps 30px off it. The Client lane sweeps y 654..906 at x 514..566, so the
 * Client box writes nothing below y 624 and the API writes nothing above y 936
 * inside that band. The Attacker lane sweeps y 1244..1526 at x 774..826, so the
 * Attacker box writes nothing above y 1556 and the API writes nothing below
 * y 1214 inside that band.
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

/** The Client box, and the rows inside it. */
const CLIENT_X = 280;
const CLIENT_W = 520;
const CLIENT_Y = 440;
const CLIENT_H = 240;
export const CLIENT_BOTTOM = CLIENT_Y + CLIENT_H;
const CLIENT_LEFT = 320;
const CLIENT_RIGHT = 760;
const CLIENT_TITLE_Y = 501;
const TTL_Y = 499;

const CALL_X = 320;
const CALL_W = 300;
const ROW_1_Y = 526;
const ROW_H = 48;
const ROW_1_TEXT_Y = 557;
const ROTATE_X = 640;
const ROTATE_W = 120;
const HDR_X = 320;
const HDR_W = 440;
const ROW_2_Y = 580;
const ROW_2_TEXT_Y = 611;
/** Chip text sits one gutter in from the plate it is written on. */
const CHIP_INSET = 16;

/** The API frame. */
const NODE_Y = 880;
const NODE_H = 390;
export const NODE_TOP = NODE_Y;
export const NODE_BOTTOM = NODE_Y + NODE_H;
const NODE_LABEL_Y = 946;

/** The gate row: four plates on one baseline, the last one held back. */
export const GATES = ['sig', 'exp', 'aud', 'jti'] as const;
export type Gate = (typeof GATES)[number];
const GATE_XS = [170, 360, 550, 740];
const GATE_W = 170;
const GATE_Y = 990;
const GATE_H = 84;
const GATE_TEXT_Y = 1042;

/** What the API has answered, counted since the scene opened. */
const READOUT_Y = 1180;
const OK_X = 170;
const FAIL_X = 400;
/** How high each counter has to be able to go, which the simulation asserts. */
export const OK_MAX = 8;
export const FAIL_MAX = 4;

/** The Token panel: the same token, taken apart. */
const PANEL_X = 130;
const PANEL_W = 460;
const PANEL_Y = 1500;
const PANEL_H = 350;
const PANEL_LABEL_Y = 1560;
const PANEL_LEFT = 170;

/** The three base64 segments a JWT is made of. */
export const SEGMENTS = ['header', 'payload', 'signature'] as const;
export type Segment = (typeof SEGMENTS)[number];
const SEG_XS = [150, 294, 438];
const SEG_W = 132;
const SEG_Y = 1586;
const SEG_H = 56;
const SEG_TEXT_Y = 1620;

/** The claims the middle segment carries, which validation actually reads. */
export const CLAIMS = ['sub', 'aud', 'exp', 'scope'] as const;
const CLAIM_XS = [150, 257, 364, 471];
const CLAIM_W = 99;
const CLAIM_Y = 1666;
const CLAIM_H = 52;
const CLAIM_TEXT_Y = 1699;

const B64_Y = 1762;
const REVOKED_Y = 1818;

/** The Attacker box, which arrives in the third step. */
const ATT_X = 650;
const ATT_W = 300;
const ATT_Y = 1500;
const ATT_H = 240;
export const ATT_TOP = ATT_Y;
const ATT_TITLE_Y = 1620;
const ATT_CHIP_X = 690;
const ATT_CHIP_W = 220;
const ATT_CHIP_Y = 1650;
const ATT_CHIP_H = 56;
const ATT_CHIP_TEXT_Y = 1685;

/** The two lanes: where a traveller starts and where it stops. */
export const LANE_CLIENT = 540;
export const LANE_ATTACKER = 800;

/**
 * The token as the header chip spells it. The scene never shows a real token,
 * so the same three characters plus a prime mark are the whole difference
 * between the token that leaked and the one the Client rotates onto.
 */
const TOKEN_TEXT = 'eyJ…';
const TOKEN_FRESH_TEXT = 'eyJ…′';

/**
 * The countdown the third step puts on the Client box. The label counts in
 * seconds because that is the unit a reader would configure a lifetime in;
 * twelve of them are drawn over `TTL_SPAN` scene seconds, a compression the
 * timeline declares rather than hides.
 */
export const TTL_UNITS = 12;

/**
 * What every `data-*` on the stage starts at, keyed by the target the timeline
 * addresses it through. The markup below is written from this, so a change that
 * writes a value something already holds can be dropped rather than tweened.
 */
export const STAGE_STATE: Record<string, string> = {
  'stage@data-bt-hdr': 'token',
  'stage@data-bt-ttl': 'off',
  'stage@data-bt-rotate': 'off',
  'stage@data-bt-ok': '0',
  'stage@data-bt-fail': '0',
  'stage@data-bt-jti': 'off',
  'stage@data-bt-panel': 'off',
  'stage@data-bt-seg': 'none',
  'stage@data-bt-claims': 'off',
  'stage@data-bt-b64': 'off',
  'stage@data-bt-revoked': 'off',
  'stage@data-bt-attacker': 'off',
};
for (const gate of GATES) STAGE_STATE[`gate-${gate}@data-bt-gate`] = 'off';

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

/** One gate: a plate, and the three things it can say about a token. */
const gatePlate = (gate: Gate, index: number): string => {
  const x = GATE_XS[index] ?? 0;
  const centre = x + GATE_W / 2;
  const text = variants(
    'bt-gate-text',
    centre,
    GATE_TEXT_Y,
    'middle',
    [
      ['off', gate],
      ['ok', `${gate} ✓`],
      ['fail', `${gate} ✗`],
    ],
    8,
  );
  return `<g class="scene-chip bt-gate bt-gate--${gate}" data-bt-gate="off">
        <rect class="scene-chip-outline bt-gate-box" x="${x}" y="${GATE_Y}" width="${GATE_W}" height="${GATE_H}" rx="18" />
        ${text}
      </g>`;
};

/** One base64 segment of the token, named and coloured for what it holds. */
const segmentPlate = (segment: Segment, index: number): string => {
  const x = SEG_XS[index] ?? 0;
  return `<g class="bt-seg bt-seg--${segment}">
      <rect class="bt-seg-box" x="${x}" y="${SEG_Y}" width="${SEG_W}" height="${SEG_H}" rx="14" />
      <text class="bt-seg-text" x="${x + SEG_W / 2}" y="${SEG_TEXT_Y}" text-anchor="middle">${segment}</text>
    </g>`;
};

/** One claim the middle segment carries. */
const claimPlate = (claim: string, index: number): string => {
  const x = CLAIM_XS[index] ?? 0;
  return `<g class="bt-claim bt-claim--${claim}">
      <rect class="bt-claim-box" x="${x}" y="${CLAIM_Y}" width="${CLAIM_W}" height="${CLAIM_H}" rx="12" />
      <text class="bt-claim-text" x="${x + CLAIM_W / 2}" y="${CLAIM_TEXT_Y}" text-anchor="middle">${claim}</text>
    </g>`;
};

/** The countdown, one variant per second the label can read. */
const ttlReadout = counterVariants({
  x: CLIENT_RIGHT,
  y: TTL_Y,
  className: 'bt-ttl',
  max: TTL_UNITS,
  format: (n) => `TTL ${n} s`,
  anchor: 'end',
  indent: 4,
});

const okReadout = counterVariants({
  x: OK_X,
  y: READOUT_Y,
  className: 'bt-ok',
  max: OK_MAX,
  format: (n) => `200 ${n}`,
  indent: 4,
});

const failReadout = counterVariants({
  x: FAIL_X,
  y: READOUT_Y,
  className: 'bt-fail',
  max: FAIL_MAX,
  format: (n) => `401 ${n}`,
  indent: 4,
});

/** What the Client is asking for, which never changes. */
const callChip = chip({
  x: CALL_X,
  y: ROW_1_Y,
  width: CALL_W,
  height: ROW_H,
  rx: 14,
  className: 'bt-call',
  bgClass: 'bt-call-box',
  variant: 'outline',
  text: `<text class="scene-mono bt-call-text" x="${CALL_X + CHIP_INSET}" y="${ROW_1_TEXT_Y}">GET /orders</text>`,
  indent: 4,
});

/** The word the Client says when it swaps one token for the next. */
const rotateChip = chip({
  x: ROTATE_X,
  y: ROW_1_Y,
  width: ROTATE_W,
  height: ROW_H,
  rx: 14,
  className: 'bt-rotate',
  bgClass: 'bt-rotate-box',
  variant: 'outline',
  text: `<text class="bt-rotate-text" x="${ROTATE_X + ROTATE_W / 2}" y="${ROW_1_TEXT_Y}" text-anchor="middle">rotate</text>`,
  indent: 4,
});

/** The header the call carries, which is the whole of the first step. */
const headerChip = chip({
  x: HDR_X,
  y: ROW_2_Y,
  width: HDR_W,
  height: ROW_H,
  rx: 14,
  className: 'bt-hdr',
  bgClass: 'bt-hdr-box',
  variant: 'outline',
  text: variants(
    'bt-hdr-text',
    HDR_X + CHIP_INSET,
    ROW_2_TEXT_Y,
    null,
    [
      ['token', `Authorization: Bearer ${TOKEN_TEXT}`],
      ['fresh', `Authorization: Bearer ${TOKEN_FRESH_TEXT}`],
      ['none', 'Authorization: ✗'],
    ],
    6,
  ),
  indent: 4,
});

/** The copy of the token the Attacker is holding. */
const attackerChip = chip({
  x: ATT_CHIP_X,
  y: ATT_CHIP_Y,
  width: ATT_CHIP_W,
  height: ATT_CHIP_H,
  rx: 14,
  className: 'bt-att-chip',
  bgClass: 'bt-att-chip-box',
  variant: 'outline',
  text: `<text class="scene-mono bt-att-chip-text" x="${ATT_CHIP_X + ATT_CHIP_W / 2}" y="${ATT_CHIP_TEXT_Y}" text-anchor="middle">${TOKEN_TEXT}</text>`,
  indent: 4,
});

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" data-bt-hdr="token" data-bt-ttl="off" data-bt-rotate="off" data-bt-ok="0" data-bt-fail="0" data-bt-jti="off" data-bt-panel="off" data-bt-seg="none" data-bt-claims="off" data-bt-b64="off" data-bt-revoked="off" data-bt-attacker="off" aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(LANE_CLIENT, CLIENT_BOTTOM, NODE_TOP, 'scene-link bt-lane')}
  ${verticalLink(LANE_ATTACKER, NODE_BOTTOM, ATT_TOP, 'scene-link bt-lane bt-lane--attacker')}

  ${clientBox({
    x: CLIENT_X,
    width: CLIENT_W,
    y: CLIENT_Y,
    height: CLIENT_H,
    title: 'Client',
    titleX: CLIENT_LEFT,
    titleY: CLIENT_TITLE_Y,
    titleAnchor: null,
    extraClass: 'bt-client',
    children: `
    ${ttlReadout}
    ${callChip}
    ${rotateChip}
    ${headerChip}`,
  })}

  ${nodeFrame({
    y: NODE_Y,
    height: NODE_H,
    label: 'API',
    labelY: NODE_LABEL_Y,
    children: `    <g class="bt-gates">
      ${GATES.map((gate, index) => gatePlate(gate, index)).join('\n      ')}
    </g>

    ${okReadout}
    ${failReadout}`,
  })}

  ${serviceBox({
    x: PANEL_X,
    width: PANEL_W,
    y: PANEL_Y,
    height: PANEL_H,
    title: 'Token',
    titleX: PANEL_LEFT,
    titleY: PANEL_LABEL_Y,
    titleAnchor: null,
    className: 'bt-panel',
    boxClass: 'scene-box bt-panel-box',
    children: `
    ${SEGMENTS.map((segment, index) => segmentPlate(segment, index)).join('\n    ')}

    ${CLAIMS.map((claim, index) => claimPlate(claim, index)).join('\n    ')}

    <text class="bt-b64" x="${PANEL_LEFT}" y="${B64_Y}">base64 ≠ encryption</text>
    <text class="bt-revoked" x="${PANEL_LEFT}" y="${REVOKED_Y}">revoked</text>`,
  })}

  ${serviceBox({
    x: ATT_X,
    width: ATT_W,
    y: ATT_Y,
    height: ATT_H,
    title: 'Attacker',
    titleY: ATT_TITLE_Y,
    className: 'bt-attacker',
    boxClass: 'scene-box bt-attacker-box',
    children: `
    ${attackerChip}`,
  })}

  ${requestsLayer()}
</svg>`;
