/**
 * Static stage markup for the Authorization scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Four bands, arranged around the one
 * question this scene is about — not "who is calling" but "may this caller do
 * this, to this":
 *   - y 0..440       kept empty for the step title card
 *   - y 440..680     the Users: two capsules, `A` and `B`, each carrying the
 *                    role badge it was granted (`editor`, `viewer`). The badge
 *                    is the only thing the gate knows about a caller before it
 *                    looks at the resource
 *   - y 880..1270    the Gate: the two stages a request passes through, `authn`
 *                    on top and `authz` under it, the mode the second stage is
 *                    deciding by (`role` or `policy`), the decision lamp
 *                    (`allow` / `deny`) and the `denied n` readout
 *   - y 1500..1740   the Docs: `doc A` and `doc B`, the `owner` mark the policy
 *                    lights while it asks whose document this is, and `ok n`
 *
 * Three lane segments and no others, every one axis aligned. A request from `A`
 * leaves the Users box at x 310 and reaches the Gate's top edge; a request from
 * `B` leaves at x 770 and reaches the same edge; a request the Gate allowed
 * leaves the Gate's bottom edge at x 540 and reaches the Docs box. A refusal
 * travels nowhere: it is the decision lamp turning red and `denied n` counting
 * up, because a request that is denied never reaches the resource, and drawing
 * it going back would say it had been somewhere.
 *
 * A traveller sweeps 26px around every point it reaches and a label keeps 30px
 * clear of that, so the three segments own three keep-outs: x 254..366 and
 * x 714..826 from y 624 to y 936, and x 484..596 from y 1214 to y 1556. That is
 * what decides the layout. The Users box keeps its capsules above y 624. The
 * Gate names itself below y 936 and puts its decision on the left, clear of the
 * lower column. The Docs box writes its title and `ok n` on a line at y 1580,
 * under the third keep-out, and hangs the two document cells below that.
 *
 * Declared texture: the two document cells. A cell carries the document's name
 * and nothing else, because what the scene asks of it is not "what is in it"
 * but "who owns it, and did this caller get to touch it" — and both of those
 * are answered by the cell's state rather than by more writing inside it.
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

/** The three lane columns: A's requests, B's requests, and what was allowed. */
export const X_A = 310;
export const X_B = 770;
export const X_DOCS = 540;

export const Y_USERS_BOTTOM = 680;
export const Y_GATE_TOP = 880;
export const Y_GATE_BOTTOM = 1270;
export const Y_DOCS_TOP = 1500;

/** The Users band, and the two capsules that are the callers in it. */
const USERS = { x: 130, y: 440, w: 820, h: 240 };
const USERS_TITLE_X = 170;
const USERS_TITLE_Y = 512;
const CAPSULE = { y: 546, w: 300, h: 66 };
const CAPSULE_XS = [166, 614] as const;
const CAPSULE_NAME_DX = 34;
const CAPSULE_TEXT_Y = 590;

/** The Gate band: two stages, the rule in force, and the verdict. */
const GATE = { x: 130, y: 880, w: 820, h: 390 };
const GATE_TITLE_X = 170;
/** Below the two upper keep-outs, which reach y 936 at the top of the box. */
const GATE_TITLE_Y = 984;

/** The two stage plates, stacked in the order a request passes through them. */
const STAGE_PLATE = { x: 260, w: 560, h: 66 };
const AUTHN_Y = 1016;
const AUTHZ_Y = 1098;
const STAGE_LAMP_DX = 42;
const STAGE_TEXT_DX = 80;
/** Baseline of a stage label, measured from the top of its plate. */
const STAGE_TEXT_DY = 45;
/** Right edge of the mode word, which sits at the far end of the authz plate. */
const MODE_TEXT_X = 780;

/** The verdict: a lamp with the word beside it, kept clear of the lower lane. */
const DECISION = { x: 170, y: 1180, w: 260, h: 66 };
const DECISION_LAMP = { cx: 212, cy: 1213, r: 18 };
const DECISION_TEXT_X = 250;
const DECISION_TEXT_Y = 1225;
const DENIED_X = 914;

/** The Docs band: two documents, who owns them, and how many calls landed. */
const DOCS = { x: 280, y: 1500, w: 520, h: 240 };
const DOCS_TITLE_X = 320;
const DOCS_TITLE_Y = 1580;
const OK_X = 760;
const CELL = { y: 1612, w: 216, h: 76 };
const CELL_XS = [312, 552] as const;
const CELL_TEXT_Y = 1660;
const OWNER_X = 540;
const OWNER_Y = 1710;

/** The most calls the Docs box can answer, which is what `ok n` counts to. */
export const OK_MAX = 7;
/** The most refusals the Gate can hand out, which is what `denied n` counts to. */
export const DENIED_MAX = 3;

// --- what the stage can say about itself -----------------------------------

/** The two callers, which are the two capsules on the stage. */
export const USER_IDS = ['A', 'B'] as const;
export type UserId = (typeof USER_IDS)[number];

/** The role each caller was granted. A badge is a name for a set of verbs. */
export const ROLES = ['editor', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

/** The two documents, which are the two cells in the Docs box. */
export const DOC_IDS = ['A', 'B'] as const;
export type DocId = (typeof DOC_IDS)[number];

/**
 * The authn stage. It never refuses anyone here: both callers are signed in,
 * which is exactly the premise the scene is arguing with.
 */
export const AUTHN_STATES = ['idle', 'busy'] as const;
export type AuthnState = (typeof AUTHN_STATES)[number];

/**
 * The authz stage. `dark` is the ghost gate of the first step — a deployment
 * with no authorization stage at all, which is not the same thing as a stage
 * that is present and idle, and must never read like one.
 */
export const AUTHZ_STATES = ['dark', 'idle', 'busy'] as const;
export type AuthzState = (typeof AUTHZ_STATES)[number];

/** Which rule the second stage is deciding by. `none` is the dark gate. */
export const MODES = ['none', 'role', 'policy'] as const;
export type Mode = (typeof MODES)[number];

/** The verdict lamp. `none` is between requests, including the first frame. */
export const DECISIONS = ['none', 'allow', 'deny'] as const;
export type Decision = (typeof DECISIONS)[number];

/** Whether the caller owns the document the policy is asking about. */
export const OWNER_STATES = ['off', 'match', 'mismatch'] as const;
export type OwnerState = (typeof OWNER_STATES)[number];

/**
 * A document cell. `probe` is the policy holding it up to ask whose it is;
 * `hit` is its owner touching it; `breach` is somebody else's call landing on
 * it, which is what both of the scene's failures look like from down here.
 */
export const CELL_STATES = ['idle', 'probe', 'hit', 'breach'] as const;
export type CellState = (typeof CELL_STATES)[number];

/** What the scene is holding up for a moment, if anything. */
export const MARKS = [
  'none',
  'ghost',
  'two',
  'role',
  'bundle',
  'resource',
  'silence',
  'least',
] as const;
export type Mark = (typeof MARKS)[number];

/**
 * What every `data-*` on the stage starts at. The markup below is written from
 * these, so the first frame is the whole diagram in its opening state — two
 * badged callers, a gate whose second stage is not there, no verdict given, no
 * document touched — and the timeline never restates it.
 */
export const STAGE_STATE: Record<string, string> = {
  'data-az-authn': 'idle',
  'data-az-authz': 'dark',
  'data-az-mode': 'none',
  'data-az-decision': 'none',
  'data-az-denied': '0',
  'data-az-ok': '0',
  'data-az-owner': 'off',
  'data-az-mark': 'none',
  'data-az-settled': 'off',
};

/** What each capsule and each document cell starts at. */
export const ROLE_STATE: Record<UserId, Role> = { A: 'editor', B: 'viewer' };
export const CELL_STATE: CellState = 'idle';

// --- markup ----------------------------------------------------------------

/** Non-breaking spaces, so a monospaced label keeps its gaps in SVG. */
const mono = (text: string): string => text.replace(/ /g, '&#160;');

const pad = (n: number): string => `\n${' '.repeat(n)}`;

/** One caller: the letter it is known by, and the badge it was granted. */
const capsule = (index: number): string => {
  const id = USER_IDS[index] ?? 'A';
  const x = CAPSULE_XS[index] ?? 0;
  const centre = x + CAPSULE.w / 2;
  return `<g class="az-user az-user--${id}" data-az-role="${ROLE_STATE[id]}">
      <rect class="az-user-bg" x="${x}" y="${CAPSULE.y}" width="${CAPSULE.w}" height="${CAPSULE.h}" rx="22" />
      <text class="scene-mono az-user-name" x="${x + CAPSULE_NAME_DX}" y="${CAPSULE_TEXT_Y}">${id}</text>
      ${ROLES.map(
        (role) =>
          `<text class="scene-counter scene-mono az-badge az-badge--${role}" x="${centre}" y="${CAPSULE_TEXT_Y}" text-anchor="middle">${role}</text>`,
      ).join(pad(6))}
    </g>`;
};

/** One stage of the pipeline: a lamp that lights while it is deciding. */
const stagePlate = (name: 'authn' | 'authz', y: number, children = ''): string =>
  `<g class="az-stage az-stage--${name}">
      <rect class="az-stage-bg" x="${STAGE_PLATE.x}" y="${y}" width="${STAGE_PLATE.w}" height="${STAGE_PLATE.h}" rx="22" />
      <circle class="az-stage-lamp" cx="${STAGE_PLATE.x + STAGE_LAMP_DX}" cy="${y + STAGE_PLATE.h / 2}" r="16" />
      <text class="scene-mono az-stage-text" x="${STAGE_PLATE.x + STAGE_TEXT_DX}" y="${y + STAGE_TEXT_DY}">${name}</text>${children}
    </g>`;

/** The rule the second stage is deciding by, written at the far end of it. */
const modeText = (['role', 'policy'] as const)
  .map(
    (mode) =>
      `<text class="scene-counter scene-mono az-mode az-mode--${mode}" x="${MODE_TEXT_X}" y="${AUTHZ_Y + STAGE_TEXT_DY}" text-anchor="end">${mode}</text>`,
  )
  .join(pad(6));

/** The verdict: one lamp, and one of two words beside it. */
const decisionPlate = `<g class="az-decision">
      <rect class="az-decision-bg" x="${DECISION.x}" y="${DECISION.y}" width="${DECISION.w}" height="${DECISION.h}" rx="22" />
      <circle class="az-decision-lamp" cx="${DECISION_LAMP.cx}" cy="${DECISION_LAMP.cy}" r="${DECISION_LAMP.r}" />
      ${(['allow', 'deny'] as const)
        .map(
          (value) =>
            `<text class="scene-counter scene-mono az-verdict az-verdict--${value}" x="${DECISION_TEXT_X}" y="${DECISION_TEXT_Y}">${value}</text>`,
        )
        .join(pad(6))}
    </g>`;

/** How many requests the Gate has refused. One text per value, state picks one. */
const deniedReadout = counterVariants({
  x: DENIED_X,
  y: DECISION_TEXT_Y,
  className: 'az-denied',
  max: DENIED_MAX,
  format: (n) => mono(`denied ${n}`),
  anchor: 'end',
});

/** One document: the name it is known by, and the state of the last call on it. */
const cell = (index: number): string => {
  const id = DOC_IDS[index] ?? 'A';
  const x = CELL_XS[index] ?? 0;
  return [
    `<rect class="az-cell az-cell--${id}" data-az-cell="${CELL_STATE}" x="${x}" y="${CELL.y}" width="${CELL.w}" height="${CELL.h}" rx="14" />`,
    `<text class="scene-mono az-doc az-doc--${id}" x="${x + CELL.w / 2}" y="${CELL_TEXT_Y}" text-anchor="middle">${mono(`doc ${id}`)}</text>`,
  ].join(pad(4));
};

/** How many calls the documents answered. */
const okReadout = counterVariants({
  x: OK_X,
  y: DOCS_TITLE_Y,
  className: 'az-ok',
  max: OK_MAX,
  format: (n) => mono(`ok ${n}`),
  anchor: 'end',
});

const stageAttrs = Object.entries(STAGE_STATE)
  .map(([name, value]) => `${name}="${value}"`)
  .join(' ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageAttrs} aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_A, Y_USERS_BOTTOM, Y_GATE_TOP, 'scene-link az-lane')}
  ${verticalLink(X_B, Y_USERS_BOTTOM, Y_GATE_TOP, 'scene-link az-lane')}
  ${verticalLink(X_DOCS, Y_GATE_BOTTOM, Y_DOCS_TOP, 'scene-link az-lane az-lane--docs')}

  ${clientBox({
    x: USERS.x,
    width: USERS.w,
    y: USERS.y,
    height: USERS.h,
    title: 'Users',
    titleX: USERS_TITLE_X,
    titleY: USERS_TITLE_Y,
    titleAnchor: null,
    children: `
    ${capsule(0)}

    ${capsule(1)}`,
  })}

  ${serviceBox({
    x: GATE.x,
    width: GATE.w,
    y: GATE.y,
    height: GATE.h,
    title: 'Gate',
    titleX: GATE_TITLE_X,
    titleY: GATE_TITLE_Y,
    titleAnchor: null,
    className: 'scene-node az-gate',
    children: `
    ${stagePlate('authn', AUTHN_Y)}

    ${stagePlate('authz', AUTHZ_Y, `
      ${modeText}`)}

    ${decisionPlate}

    ${deniedReadout}`,
  })}

  ${serviceBox({
    x: DOCS.x,
    width: DOCS.w,
    y: DOCS.y,
    height: DOCS.h,
    title: 'Docs',
    titleX: DOCS_TITLE_X,
    titleY: DOCS_TITLE_Y,
    titleAnchor: null,
    className: 'scene-service az-docs',
    children: `
    ${okReadout}

    ${cell(0)}

    ${cell(1)}

    <text class="scene-counter scene-mono az-owner" x="${OWNER_X}" y="${OWNER_Y}" text-anchor="middle">owner</text>`,
  })}

  ${requestsLayer()}
</svg>`;
