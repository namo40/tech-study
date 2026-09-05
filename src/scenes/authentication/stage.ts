/**
 * Static stage markup for the Authentication scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Four bands, arranged around the one
 * question this scene is about — not what a caller may do, but whether it is
 * who it says it is:
 *   - y 0..400       above the cropped viewBox (see shared VIEWBOX)
 *   - y 400..440     the frame's top padding; nothing is drawn here
 *   - y 440..680     the Clients: two capsules, `user` and `service`, each
 *                    carrying the evidence it is presenting right now
 *                    (`password`, `stolen`, `api key`, `cert`, or nothing at
 *                    all, which is a claim with no evidence behind it)
 *   - y 880..1270    the Verifier: the method in force (`password`, `api key`,
 *                    `mTLS`), the lamp that lights while a piece of evidence is
 *                    being checked, the Verifier's own `cert` for the step where
 *                    the proof goes both ways, and the verdict — `who` when the
 *                    evidence held, `deny` when it did not, with `failed n`
 *                    beside it
 *   - y 1500..1740   the API: `ok n`, and the `who` tag an arrival carries when
 *                    somebody actually established who was calling
 *
 * Three lane segments and no others, every one axis aligned. A call from the
 * person leaves the Clients box at x 310 and reaches the Verifier's top edge; a
 * call from the machine leaves at x 770 and reaches the same edge; a call whose
 * evidence held leaves the Verifier's bottom edge at x 540 and reaches the API.
 * A refusal travels nowhere: it is the verdict lamp turning red and `failed n`
 * counting up, because a call that was refused never reached anything, and
 * drawing it going back would say it had been somewhere. The certificate the
 * Verifier presents in the fourth step is likewise a state of the Verifier
 * rather than a traveller, because it is not a call — it is the other half of a
 * handshake that happens before any call is made.
 *
 * A traveller sweeps 26px around every point it reaches and a label keeps 30px
 * clear of that, so the three segments own three keep-outs: x 254..366 and
 * x 714..826 from y 624 to y 936, and x 484..596 from y 1214 to y 1556. That is
 * what decides the layout. The Clients box keeps its capsules above y 624. The
 * Verifier names itself below y 936 and stops every plate at x 510 or starts it
 * at x 610, so the lower column is never written across. The API box writes its
 * title and `ok n` on a line at y 1580, under the third keep-out, and hangs the
 * identity tag below that.
 *
 * Declared texture: the two client capsules, the method plate, the Verifier's
 * own certificate plate, the verdict plate and the API's tag plate. None of
 * them is read as writing — a plate is a place for one word, and which word is
 * decided by the state rather than by more drawing inside it.
 *
 * Everything the reader has to read is a stack of text elements on one spot,
 * hidden by a base rule and opened by the current `data-*`, so nothing
 * interpolates and both scrub directions land on the same words.
 */

import {
  VIEWBOX,
  clientBox,
  counterVariants,
  requestsLayer,
  serviceBox,
  verticalLink,
} from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- geometry --------------------------------------------------------------

/** The three lane columns: the person's calls, the machine's, and what passed. */
export const X_USER = 310;
export const X_SERVICE = 770;
export const X_API = 540;

export const Y_CLIENTS_BOTTOM = 680;
export const Y_VERIFIER_TOP = 880;
export const Y_VERIFIER_BOTTOM = 1270;
export const Y_API_TOP = 1500;

/** How far right of the lane a held credential rides, clear of the 52px halo. */
export const HELD_DX = 70;
export const HELD_W = 54;
export const HELD_H = 40;

/** The Clients band, and the two capsules that are the callers in it. */
const CLIENTS = { x: 130, y: 440, w: 820, h: 240 };
const CLIENTS_TITLE = { x: 170, y: 500 };
const CAPSULE = { y: 536, w: 380, h: 66 };
const CAPSULE_XS = [150, 550] as const;
const CAPSULE_NAME_DX = 30;
const CAPSULE_EV_DX = 30;
const CAPSULE_TEXT_Y = 580;

/** The Verifier band: the method, the check, the other half, and the verdict. */
const VERIFIER = { x: 130, y: 880, w: 820, h: 390 };
const VERIFIER_TITLE = { x: 170, y: 984 };

/** The method in force, written on a plate on the left of the middle row. */
const METHOD = { x: 170, y: 1046, w: 340, h: 66 };
const METHOD_TEXT = { x: 340, y: 1090 };
/** The lamp between the two halves of the middle row: the check itself. */
const CHECK_LAMP = { cx: 560, cy: 1079, r: 22 };
/** The Verifier's own certificate, which only exists once the proof is mutual. */
const OWN_CERT = { x: 610, y: 1046, w: 320, h: 66 };
const OWN_CERT_TEXT = { x: 770, y: 1090 };

/** The verdict, kept left of the lower lane, with the refusal count beside it. */
const VERDICT = { x: 170, y: 1136, w: 340, h: 66 };
const VERDICT_LAMP = { cx: 212, cy: 1169, r: 18 };
const VERDICT_TEXT = { x: 252, y: 1180 };
const FAILED_TEXT = { x: 910, y: 1180 };

/** The API band: how many calls landed, and who they turned out to be from. */
const API = { x: 280, y: 1500, w: 520, h: 240 };
const API_TITLE = { x: 320, y: 1580 };
const OK_TEXT = { x: 760, y: 1580 };
const TAG = { x: 340, y: 1620, w: 400, h: 70 };
const TAG_TEXT = { x: 540, y: 1665 };

// --- what the stage can say about itself -----------------------------------

/** The most calls the API can answer, which is what `ok n` counts to. */
export const OK_MAX = 9;
/** The most refusals the Verifier can hand out, which `failed n` counts to. */
export const FAILED_MAX = 2;

/** The two callers, which are the two capsules on the stage. */
export const CLIENT_IDS = ['user', 'service'] as const;
export type ClientId = (typeof CLIENT_IDS)[number];

/**
 * What a caller can put on the counter. `none` is a claim with nothing behind
 * it. `stolen` is the right password in the wrong hands, which is why it is a
 * value of its own here and not one to the Verifier: the check reads its class,
 * and its class is `password`.
 */
export const EVIDENCE = ['none', 'password', 'stolen', 'key', 'cert'] as const;
export type Evidence = (typeof EVIDENCE)[number];

/** What each piece of evidence is written as when a capsule is holding it up. */
const EVIDENCE_TEXT: Record<Exclude<Evidence, 'none'>, string> = {
  password: 'password',
  stolen: 'stolen',
  key: 'api key',
  cert: 'cert',
};

/**
 * How the door is behaving. `ghost` is a door that asks for a name and nothing
 * else — not a Verifier that happens to be idle, and it must never read like
 * one. `mtls` is the same check with the far end proving itself too.
 */
export const MODES = ['ghost', 'verify', 'mtls'] as const;
export type Mode = (typeof MODES)[number];

/** The method in force. `none` is the ghost door, which has no method at all. */
export const METHODS = ['none', 'password', 'key', 'mtls'] as const;
export type Method = (typeof METHODS)[number];

/** What the method plate is written as. `mTLS` is a name, so it keeps its case. */
const METHOD_LABEL: Record<Exclude<Method, 'none'>, string> = {
  password: 'password',
  key: 'api key',
  mtls: 'mTLS',
};

/** The check lamp: lit only while a piece of evidence is being read. */
export const CHECK_STATES = ['off', 'on'] as const;
export type CheckState = (typeof CHECK_STATES)[number];

/** The verdict. `none` is between calls, including the first frame. */
export const VERDICTS = ['none', 'who', 'deny'] as const;
export type Verdict = (typeof VERDICTS)[number];

/** Whether the Verifier is showing a certificate of its own. */
export const MUTUAL_STATES = ['off', 'on'] as const;
export type MutualState = (typeof MUTUAL_STATES)[number];

/** Whether the call that just landed came with an identity attached. */
export const TAG_STATES = ['off', 'on'] as const;
export type TagState = (typeof TAG_STATES)[number];

/** What the scene is holding up for a moment, if anything. */
export const MARKS = [
  'none',
  'ghost',
  'factors',
  'evidence',
  'defense',
  'nopass',
  'possession',
  'wire',
] as const;
export type Mark = (typeof MARKS)[number];

/**
 * What every `data-*` on the stage starts at. The markup below is written from
 * these, so the first frame is the whole diagram in its opening state — two
 * callers holding nothing up, a door with no method and no lamp, a verdict
 * nobody has reached, an API nothing has landed on — and the timeline never
 * restates it.
 */
export const STAGE_STATE: Record<string, string> = {
  'data-an-mode': 'ghost',
  'data-an-method': 'none',
  'data-an-check': 'off',
  'data-an-verdict': 'none',
  'data-an-failed': '0',
  'data-an-ok': '0',
  'data-an-mutual': 'off',
  'data-an-tag': 'off',
  'data-an-mark': 'none',
  'data-an-settled': 'off',
};

/** What each capsule starts at: a caller presenting nothing. */
export const EVIDENCE_STATE: Evidence = 'none';

// --- markup ----------------------------------------------------------------

/** Non-breaking spaces, so a monospaced label keeps its gaps in SVG. */
const mono = (text: string): string => text.replace(/ /g, '&#160;');

const pad = (n: number): string => `\n${' '.repeat(n)}`;

/** One caller: the name it goes by, and whatever it is holding up right now. */
const capsule = (index: number): string => {
  const id = CLIENT_IDS[index] ?? 'user';
  const x = CAPSULE_XS[index] ?? 0;
  return `<g class="an-client an-client--${id}" data-an-ev="${EVIDENCE_STATE}">
      <rect class="an-client-bg" x="${x}" y="${CAPSULE.y}" width="${CAPSULE.w}" height="${CAPSULE.h}" rx="22" />
      <text class="scene-mono an-client-name" x="${x + CAPSULE_NAME_DX}" y="${CAPSULE_TEXT_Y}">${id}</text>
      ${(Object.keys(EVIDENCE_TEXT) as Exclude<Evidence, 'none'>[])
        .map(
          (value) =>
            `<text class="scene-counter scene-mono an-ev an-ev--${value}" x="${x + CAPSULE.w - CAPSULE_EV_DX}" y="${CAPSULE_TEXT_Y}" text-anchor="end">${mono(EVIDENCE_TEXT[value])}</text>`,
        )
        .join(pad(6))}
    </g>`;
};

/** The method in force, one word on a plate. The ghost door shows none of them. */
const methodPlate = `<g class="an-method">
      <rect class="an-method-bg" x="${METHOD.x}" y="${METHOD.y}" width="${METHOD.w}" height="${METHOD.h}" rx="22" />
      ${(Object.keys(METHOD_LABEL) as Exclude<Method, 'none'>[])
        .map(
          (value) =>
            `<text class="scene-counter scene-mono an-method-text an-method-text--${value}" x="${METHOD_TEXT.x}" y="${METHOD_TEXT.y}" text-anchor="middle">${mono(METHOD_LABEL[value])}</text>`,
        )
        .join(pad(6))}
    </g>`;

/**
 * The certificate the Verifier presents. It is drawn inside the Verifier
 * because it is not a call: it is the far end answering the same question the
 * callers have been answering all along.
 */
const ownCert = `<g class="an-own">
      <rect class="an-own-bg" x="${OWN_CERT.x}" y="${OWN_CERT.y}" width="${OWN_CERT.w}" height="${OWN_CERT.h}" rx="22" />
      <text class="scene-counter scene-mono an-own-text" x="${OWN_CERT_TEXT.x}" y="${OWN_CERT_TEXT.y}" text-anchor="middle">cert</text>
    </g>`;

/** The verdict: one lamp, and one of two words beside it. */
const verdictPlate = `<g class="an-verdict">
      <rect class="an-verdict-bg" x="${VERDICT.x}" y="${VERDICT.y}" width="${VERDICT.w}" height="${VERDICT.h}" rx="22" />
      <circle class="an-verdict-lamp" cx="${VERDICT_LAMP.cx}" cy="${VERDICT_LAMP.cy}" r="${VERDICT_LAMP.r}" />
      ${(['who', 'deny'] as const)
        .map(
          (value) =>
            `<text class="scene-counter scene-mono an-word an-word--${value}" x="${VERDICT_TEXT.x}" y="${VERDICT_TEXT.y}">${value}</text>`,
        )
        .join(pad(6))}
    </g>`;

/** How many calls the Verifier refused. One text per value, state picks one. */
const failedReadout = counterVariants({
  x: FAILED_TEXT.x,
  y: FAILED_TEXT.y,
  className: 'an-failed',
  max: FAILED_MAX,
  format: (n) => mono(`failed ${n}`),
  anchor: 'end',
});

/** How many calls the API answered. */
const okReadout = counterVariants({
  x: OK_TEXT.x,
  y: OK_TEXT.y,
  className: 'an-ok',
  max: OK_MAX,
  format: (n) => mono(`ok ${n}`),
  anchor: 'end',
});

/** The identity a landed call brought with it, or an empty plate when it had none. */
const tagPlate = `<g class="an-tag">
      <rect class="an-tag-bg" x="${TAG.x}" y="${TAG.y}" width="${TAG.w}" height="${TAG.h}" rx="22" />
      <text class="scene-counter scene-mono an-tag-text" x="${TAG_TEXT.x}" y="${TAG_TEXT.y}" text-anchor="middle">who</text>
    </g>`;

const stageAttrs = Object.entries(STAGE_STATE)
  .map(([name, value]) => `${name}="${value}"`)
  .join(' ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageAttrs} aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_USER, Y_CLIENTS_BOTTOM, Y_VERIFIER_TOP, 'scene-link an-lane')}
  ${verticalLink(X_SERVICE, Y_CLIENTS_BOTTOM, Y_VERIFIER_TOP, 'scene-link an-lane')}
  ${verticalLink(X_API, Y_VERIFIER_BOTTOM, Y_API_TOP, 'scene-link an-lane an-lane--api')}

  ${clientBox({
    x: CLIENTS.x,
    width: CLIENTS.w,
    y: CLIENTS.y,
    height: CLIENTS.h,
    title: 'Clients',
    titleX: CLIENTS_TITLE.x,
    titleY: CLIENTS_TITLE.y,
    titleAnchor: null,
    children: `
    ${capsule(0)}

    ${capsule(1)}`,
  })}

  ${serviceBox({
    x: VERIFIER.x,
    width: VERIFIER.w,
    y: VERIFIER.y,
    height: VERIFIER.h,
    title: 'Verifier',
    titleX: VERIFIER_TITLE.x,
    titleY: VERIFIER_TITLE.y,
    titleAnchor: null,
    className: 'scene-node an-verifier',
    children: `
    ${methodPlate}

    <circle class="an-check" cx="${CHECK_LAMP.cx}" cy="${CHECK_LAMP.cy}" r="${CHECK_LAMP.r}" />

    ${ownCert}

    ${verdictPlate}

    ${failedReadout}`,
  })}

  ${serviceBox({
    x: API.x,
    width: API.w,
    y: API.y,
    height: API.h,
    title: 'API',
    titleX: API_TITLE.x,
    titleY: API_TITLE.y,
    titleAnchor: null,
    className: 'scene-service an-api',
    children: `
    ${okReadout}

    ${tagPlate}`,
  })}

  ${requestsLayer()}
</svg>`;
