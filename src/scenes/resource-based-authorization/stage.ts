/**
 * Static stage markup for the Resource-based Authorization scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Three bands, arranged around the one
 * move this scene owns — the moment the thing being acted on becomes an input to
 * the decision, so that the same caller asking for the same verb gets a
 * different answer depending on which document arrived with the request:
 *   - y 0..400       above the cropped viewBox (see shared VIEWBOX)
 *   - y 400..440     the frame's top padding; nothing is drawn here
 *   - y 440..680     Users (x 130..950): the two callers, `A` and `B`, each a
 *                    capsule holding its name and the action tag it is asking
 *                    for (`edit`, later `share`). `B` picks up an `admin` badge
 *                    in the third step, which is the coarse outer gate arriving
 *                    rather than replacing anything
 *   - y 880..1270    Check (x 130..950): the three rule cards and the verdict
 *                    block beside them. A card is an action cell and
 *                    a condition cell: `edit` -> `owner`, `edit` -> `admin`,
 *                    `share` -> `owner`. The first slot also draws the ghost of a
 *                    role-only check, which is the same card with its condition
 *                    cell missing entirely — nothing to say about the document,
 *                    because it never looks at one. The third slot draws the
 *                    hollow card the fourth step's unmatched action falls
 *                    through, in the exact place the rule for it will go
 *   - y 1500..1740   Docs (x 280..800): `doc 1` and `doc 2`, each carrying the
 *                    owner mark that is the deciding fact and the edit mark left
 *                    by whatever last wrote to it
 *
 * Two lane segments and no others, both axis aligned and both one-directional:
 *   - `X_LANE` (540) from the Users' bottom edge at 680 to the Check's top edge
 *     at 880, carrying a request down to where it is judged.
 *   - `X_LANE` (540) again from the Check's bottom edge at 1270 to the Docs' top
 *     edge at 1500, carrying a granted write down to the document it changes.
 *   A refusal travels nowhere. It is the verdict block turning red and the
 *   document staying exactly as it was, because a request that was denied never
 *   reached the resource and drawing it going back would say it had.
 *
 * A traveller is a dot with a halo of r 26, so each lane sweeps a 52px band at
 * x 514..566 and everything written beside one keeps 30px off it. The upper lane
 * sweeps y 654..906, so the Users band writes nothing below y 624 in that column
 * and the Check nothing above y 936 in it. The lower lane sweeps y 1244..1526,
 * so the Check writes nothing below y 1214 in that column and the Docs nothing
 * above y 1556 — which is why the capsules end at y 596, the third rule card
 * stops exactly at y 1214, the `Check` title sits left of the corridor, and the
 * Docs band starts its cards under y 1594.
 *
 * Declared texture: the two capsules and their action chips, the admin badge,
 * the three rule cards with their action and condition cells, the verdict lamp,
 * the two document cards with their owner badges and edit marks. Everything else
 * on the stage is a word, and every word is one of the thirteen fixed labels.
 *
 * Every value the reader can read is a stack of elements on one spot with a base
 * rule hiding all of them and the current `data-*` revealing one, so nothing is
 * interpolated and scrubbing backwards lands on the value rather than on an
 * average of two.
 */

import { VIEWBOX, clientBox, counterVariants, requestsLayer, serviceBox, verticalLink } from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- geometry --------------------------------------------------------------

/** The one column anything travels on, and the four edges it runs between. */
export const X_LANE = 540;
export const Y_USERS_BOTTOM = 680;
export const Y_CHECK_TOP = 880;
export const Y_CHECK_BOTTOM = 1270;
export const Y_DOCS_TOP = 1500;

/** The Users band: who is asking, and for what. */
const USERS = { x: 130, y: 440, w: 820, h: 240 };
const USERS_TITLE = { x: 170, y: 512 };
const CAPSULE = { y: 538, w: 300, h: 64 };
const CAPSULE_XS = [166, 614] as const;
const CAPSULE_NAME_DX = 34;
const CAPSULE_TEXT_Y = 582;
const TAG = { dx: 122, dy: 14, w: 158, h: 36, rx: 18 };
const TAG_TEXT_DY = 42;
const BADGE = { x: 614, y: 614, w: 170, h: 48, rx: 14 };
const BADGE_TEXT = { x: 699, y: 647 };

/** The Check band: the rules, in the order they are read, and the verdict. */
const CHECK = { x: 130, y: 880, w: 820, h: 390 };
const CHECK_TITLE = { x: 170, y: 948 };
const CARD = { x: 170, w: 470, h: 70 };
/** Top edge of each card slot. The last one stops on the lower lane's keep-out. */
const CARD_YS = [976, 1060, 1144] as const;
const CARD_ACT = { dx: 16, dy: 12, w: 150, h: 46, rx: 23 };
const CARD_ARROW = { from: 352, to: 380, dy: 35 };
const CARD_COND = { dx: 226, dy: 12, w: 200, h: 46, rx: 23 };
const CELL_TEXT_DY = 45;
const VERDICT_LAMP = { cx: 712, cy: 1088, r: 24 };
const VERDICT_TEXT = { x: 752, y: 1101 };

/** The Docs band: the two documents, who owns them, what was written to them. */
const DOCS = { x: 280, y: 1500, w: 520, h: 240 };
const DOCS_TITLE = { x: 320, y: 1568 };
const DOC = { y: 1594, w: 216, h: 120 };
const DOC_XS = [312, 552] as const;
const DOC_NAME_DY = 40;
const DOC_OWN = { dx: 24, dy: 67, w: 68, h: 40, rx: 12 };
const DOC_OWN_TEXT_DY = 96;
const DOC_EDIT = { dx: 178, dy: 87, r: 20 };

// --- what the stage can say about itself -----------------------------------

/** The two callers, which are the two capsules on the stage. */
export const USER_IDS = ['A', 'B'] as const;
export type UserId = (typeof USER_IDS)[number];

/** The two documents, which are the two cards in the Docs box. */
export const DOC_IDS = ['1', '2'] as const;
export type DocId = (typeof DOC_IDS)[number];

/**
 * Who owns what. This is the whole of the authored world below the Check: every
 * verdict in the scene is this map read against the caller in the request.
 */
export const OWNER_OF: Record<DocId, UserId> = { '1': 'A', '2': 'B' };

/** The verbs a request can carry, which are also the words a card names. */
export const ACTIONS = ['edit', 'share'] as const;
export type Action = (typeof ACTIONS)[number];

/**
 * What the Check is deciding by. `role` is the world before the third input
 * exists — the owner marks are drawn but nothing reads them. `resource` is the
 * world where the document is loaded first and its owner is part of the answer.
 */
export const MODES = ['role', 'resource'] as const;
export type Mode = (typeof MODES)[number];

/**
 * The first card slot. `ghost` is the role-only check of the opening step: the
 * same card with no condition cell at all, which is not the same thing as a
 * condition that happens to be empty and must never read like one.
 */
export const OWN_RULE_STATES = ['off', 'ghost', 'owner'] as const;
export type OwnRuleState = (typeof OWN_RULE_STATES)[number];

/** The second card slot, which is the coarse role gate written as a rule. */
export const ADMIN_RULE_STATES = ['off', 'admin'] as const;
export type AdminRuleState = (typeof ADMIN_RULE_STATES)[number];

/**
 * The third card slot. `unmatched` is the hollow card an action no rule has
 * heard of falls through, drawn in the place the rule for it will later go.
 */
export const SHARE_RULE_STATES = ['off', 'unmatched', 'share'] as const;
export type ShareRuleState = (typeof SHARE_RULE_STATES)[number];

/** What the verdict block is showing: the running tally, or a refusal. */
export const VERDICTS = ['ok', 'deny'] as const;
export type Verdict = (typeof VERDICTS)[number];

/** The badge a caller can be wearing. `off` is a caller with no role at all. */
export const BADGE_STATES = ['off', 'admin'] as const;
export type BadgeState = (typeof BADGE_STATES)[number];

/**
 * What the last write left on a document. `wrong` is a write that landed on a
 * document its author does not own, which is the whole of the opening step.
 */
export const EDIT_MARKS = ['none', 'ok', 'wrong'] as const;
export type EditMark = (typeof EDIT_MARKS)[number];

/** Whether a document is being written to right now. */
export const FLAGS = ['off', 'on'] as const;
export type Flag = (typeof FLAGS)[number];

/** What the scene is holding up for a moment, drawn on the band it is about. */
export const MARKS = ['none', 'three', 'hand', 'answer', 'layers', 'narrow', 'place', 'safe'] as const;
export type Mark = (typeof MARKS)[number];

/** The most grants the Check can hand out, which is what `ok n` counts to. */
export const OK_MAX = 5;

/**
 * What every `data-*` on the stage starts at. The markup below is written from
 * these, so the opening frame is the whole diagram in its starting state — two
 * callers each asking to edit, no rule card anywhere, a Check that has granted
 * nothing, two documents nobody has written to, and nothing in flight — and the
 * timeline never restates a value already there.
 */
export const STAGE_STATE: Record<string, string> = {
  'data-rba-mode': 'role',
  'data-rba-own-rule': 'off',
  'data-rba-admin-rule': 'off',
  'data-rba-share-rule': 'off',
  'data-rba-verdict': 'ok',
  'data-rba-ok': '0',
  'data-rba-badge': 'off',
  'data-rba-act-a': 'edit',
  'data-rba-act-b': 'edit',
  'data-rba-mark': 'none',
  'data-rba-settled': 'off',
};

/** What each document card starts at: owned by someone, written to by nobody. */
export const DOC_EDIT_STATE: EditMark = 'none';
export const DOC_HIT_STATE: Flag = 'off';

// --- markup ----------------------------------------------------------------

/** Newline plus `n` spaces, the separator between lines of one fragment. */
const pad = (n: number): string => `\n${' '.repeat(n)}`;

/** Non-breaking spaces, so a monospaced readout keeps its gaps in SVG. */
const mono = (text: string): string => text.replace(/ /g, '&#160;');

/** One spot, one text per value it can hold. Exactly one is ever revealed. */
const textStack = (
  x: number,
  y: number,
  className: string,
  values: readonly string[],
  format: (value: string) => string,
  anchor: string | null,
  indent: number,
): string =>
  values
    .map(
      (value) =>
        `<text class="scene-counter scene-mono ${className} ${className}--${value}" x="${x}" y="${y}"${
          anchor ? ` text-anchor="${anchor}"` : ''
        }>${format(value)}</text>`,
    )
    .join(pad(indent));

/** One caller: the name it is known by, and the verb it is asking for. */
const capsule = (index: number): string => {
  const id = USER_IDS[index] ?? 'A';
  const x = CAPSULE_XS[index] ?? 0;
  const key = id.toLowerCase();
  return `<g class="rba-user--${id}">
      <rect class="rba-user-bg" x="${x}" y="${CAPSULE.y}" width="${CAPSULE.w}" height="${CAPSULE.h}" rx="22" />
      <text class="scene-mono rba-user-name" x="${x + CAPSULE_NAME_DX}" y="${CAPSULE_TEXT_Y}">${id}</text>
      <rect class="rba-tag-bg" x="${x + TAG.dx}" y="${CAPSULE.y + TAG.dy}" width="${TAG.w}" height="${TAG.h}" rx="${TAG.rx}" />
      ${textStack(
        x + TAG.dx + TAG.w / 2,
        CAPSULE.y + TAG_TEXT_DY,
        `rba-tag-${key}`,
        ACTIONS,
        (value) => value,
        'middle',
        6,
      )}
    </g>`;
};

/** The coarse outer gate, worn by the caller it was granted to. */
const adminBadge = `<g class="rba-badge">
      <rect class="rba-badge-bg" x="${BADGE.x}" y="${BADGE.y}" width="${BADGE.w}" height="${BADGE.h}" rx="${BADGE.rx}" />
      <text class="scene-mono rba-badge-text" x="${BADGE_TEXT.x}" y="${BADGE_TEXT.y}" text-anchor="middle">admin</text>
    </g>`;

interface CardOptions {
  /** Which slot it sits in, top to bottom. */
  slot: number;
  /** Class stem, which is also the `data-*` the slot is driven by. */
  name: string;
  /** The verb the card names, drawn in its action cell. */
  action: Action;
  /** The fact the card asks about, drawn in its condition cell. */
  condition: string;
  /** Whether the slot also draws the ghost of a check with no condition at all. */
  ghost?: boolean;
  /** Whether the slot also draws the hollow card an unmatched action falls through. */
  hollow?: boolean;
}

/**
 * One rule, drawn as the two questions it asks: which verb, and what has to be
 * true of the resource. The ghost variant is the same plate with the condition
 * cell replaced by an empty socket, so a check that never looks at the document
 * is told apart by shape before it is told apart by colour.
 */
const ruleCard = ({ slot, name, action, condition, ghost = false, hollow = false }: CardOptions): string => {
  const y = CARD_YS[slot] ?? 0;
  const lines: string[] = [`<g class="rba-card rba-card--${name}">`];
  if (hollow) {
    lines.push(
      `      <rect class="rba-card-plate rba-card-plate--hollow" x="${CARD.x}" y="${y}" width="${CARD.w}" height="${CARD.h}" rx="18" />`,
    );
  }
  lines.push(
    `      <rect class="rba-card-plate rba-card-plate--live" x="${CARD.x}" y="${y}" width="${CARD.w}" height="${CARD.h}" rx="18" />`,
    `      <rect class="rba-cell rba-cell--act" x="${CARD.x + CARD_ACT.dx}" y="${y + CARD_ACT.dy}" width="${CARD_ACT.w}" height="${CARD_ACT.h}" rx="${CARD_ACT.rx}" />`,
    `      <text class="scene-mono rba-cell-text rba-cell-text--act" x="${CARD.x + CARD_ACT.dx + CARD_ACT.w / 2}" y="${y + CELL_TEXT_DY}" text-anchor="middle">${action}</text>`,
    `      <line class="rba-card-arrow" x1="${CARD_ARROW.from}" y1="${y + CARD_ARROW.dy}" x2="${CARD_ARROW.to}" y2="${y + CARD_ARROW.dy}" />`,
    `      <rect class="rba-cell rba-cell--cond" x="${CARD.x + CARD_COND.dx}" y="${y + CARD_COND.dy}" width="${CARD_COND.w}" height="${CARD_COND.h}" rx="${CARD_COND.rx}" />`,
    `      <text class="scene-mono rba-cell-text rba-cell-text--cond" x="${CARD.x + CARD_COND.dx + CARD_COND.w / 2}" y="${y + CELL_TEXT_DY}" text-anchor="middle">${condition}</text>`,
  );
  if (ghost) {
    lines.push(
      `      <rect class="rba-socket" x="${CARD.x + CARD_COND.dx}" y="${y + CARD_COND.dy}" width="${CARD_COND.w}" height="${CARD_COND.h}" rx="${CARD_COND.rx}" />`,
    );
  }
  lines.push('    </g>');
  return lines.join('\n');
};

/** The verdict: a lamp, and one word beside it that is the tally or a refusal. */
const verdictBlock = [
  `<circle class="rba-verdict-lamp" cx="${VERDICT_LAMP.cx}" cy="${VERDICT_LAMP.cy}" r="${VERDICT_LAMP.r}" />`,
  counterVariants({
    x: VERDICT_TEXT.x,
    y: VERDICT_TEXT.y,
    className: 'rba-ok',
    max: OK_MAX,
    format: (n) => mono(`ok ${n}`),
    anchor: null,
    indent: 4,
  }),
  `<text class="scene-counter scene-mono rba-deny" x="${VERDICT_TEXT.x}" y="${VERDICT_TEXT.y}">deny</text>`,
].join(pad(4));

/** One document: its name, the owner that decides, and what was last written. */
const docCard = (index: number): string => {
  const id = DOC_IDS[index] ?? '1';
  const x = DOC_XS[index] ?? 0;
  return `<g class="rba-doc" data-rba-own="${OWNER_OF[id]}" data-rba-edit="${DOC_EDIT_STATE}" data-rba-hit="${DOC_HIT_STATE}">
      <rect class="rba-doc-bg" x="${x}" y="${DOC.y}" width="${DOC.w}" height="${DOC.h}" rx="16" />
      <text class="scene-mono rba-doc-name" x="${x + DOC.w / 2}" y="${DOC.y + DOC_NAME_DY}" text-anchor="middle">${mono(`doc ${id}`)}</text>
      <rect class="rba-own-bg" x="${x + DOC_OWN.dx}" y="${DOC.y + DOC_OWN.dy}" width="${DOC_OWN.w}" height="${DOC_OWN.h}" rx="${DOC_OWN.rx}" />
      ${textStack(
        x + DOC_OWN.dx + DOC_OWN.w / 2,
        DOC.y + DOC_OWN_TEXT_DY,
        'rba-own',
        USER_IDS,
        (value) => value,
        'middle',
        6,
      )}
      <g class="rba-edit rba-edit--ok">
        <circle class="rba-edit-bg" cx="${x + DOC_EDIT.dx}" cy="${DOC.y + DOC_EDIT.dy}" r="${DOC_EDIT.r}" />
        <path class="rba-edit-glyph" d="M ${x + DOC_EDIT.dx - 9} ${DOC.y + DOC_EDIT.dy + 1} L ${x + DOC_EDIT.dx - 3} ${DOC.y + DOC_EDIT.dy + 8} L ${x + DOC_EDIT.dx + 10} ${DOC.y + DOC_EDIT.dy - 7}" />
      </g>
      <g class="rba-edit rba-edit--wrong">
        <circle class="rba-edit-bg" cx="${x + DOC_EDIT.dx}" cy="${DOC.y + DOC_EDIT.dy}" r="${DOC_EDIT.r}" />
        <path class="rba-edit-glyph" d="M ${x + DOC_EDIT.dx - 8} ${DOC.y + DOC_EDIT.dy - 8} L ${x + DOC_EDIT.dx + 8} ${DOC.y + DOC_EDIT.dy + 8} M ${x + DOC_EDIT.dx + 8} ${DOC.y + DOC_EDIT.dy - 8} L ${x + DOC_EDIT.dx - 8} ${DOC.y + DOC_EDIT.dy + 8}" />
      </g>
    </g>`;
};

const stageAttrs = Object.entries(STAGE_STATE)
  .map(([name, value]) => `${name}="${value}"`)
  .join(' ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageAttrs} aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_LANE, Y_USERS_BOTTOM, Y_CHECK_TOP, 'scene-link rba-lane rba-lane--ask')}
  ${verticalLink(X_LANE, Y_CHECK_BOTTOM, Y_DOCS_TOP, 'scene-link rba-lane rba-lane--write')}

  ${clientBox({
    x: USERS.x,
    width: USERS.w,
    y: USERS.y,
    height: USERS.h,
    title: 'Users',
    titleX: USERS_TITLE.x,
    titleY: USERS_TITLE.y,
    titleAnchor: null,
    children: `
    ${capsule(0)}

    ${capsule(1)}

    ${adminBadge}`,
  })}

  ${serviceBox({
    x: CHECK.x,
    width: CHECK.w,
    y: CHECK.y,
    height: CHECK.h,
    title: 'Check',
    titleX: CHECK_TITLE.x,
    titleY: CHECK_TITLE.y,
    titleAnchor: null,
    className: 'scene-node rba-check',
    children: `
    ${ruleCard({ slot: 0, name: 'own', action: 'edit', condition: 'owner', ghost: true })}

    ${ruleCard({ slot: 1, name: 'admin', action: 'edit', condition: 'admin' })}

    ${ruleCard({ slot: 2, name: 'share', action: 'share', condition: 'owner', hollow: true })}

    ${verdictBlock}`,
  })}

  ${serviceBox({
    x: DOCS.x,
    width: DOCS.w,
    y: DOCS.y,
    height: DOCS.h,
    title: 'Docs',
    titleX: DOCS_TITLE.x,
    titleY: DOCS_TITLE.y,
    titleAnchor: null,
    className: 'scene-service rba-docs',
    children: `
    ${docCard(0)}

    ${docCard(1)}`,
  })}

  ${requestsLayer()}
</svg>`;
