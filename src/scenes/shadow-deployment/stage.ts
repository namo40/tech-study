/**
 * Static stage markup for the Shadow Deployment scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Three bands, read top to bottom as
 * the traffic, the two versions it is offered to, and the world outside the
 * process that only one of them is allowed to touch:
 *   - y 0..440       kept empty for the step title card
 *   - y 440..680     Traffic (x 130..950): the running `ok n` count of answers
 *                    users actually received, and the first step's ghost — the
 *                    six even bars of a synthetic load, the deploy plate, and
 *                    the ragged bars production turns out to be made of
 *   - y 880..1270    Versions (x 130..950): the `live` card and the `shadow`
 *                    card side by side, the fork that says where a request and
 *                    its copy go, each card's outlet (an arrow home, or an
 *                    arrow into an open ring that is the void), and between
 *                    them the comparator holding `same n` and `diff`
 *   - y 1500..1740   Effects (x 280..800): the `db` and `mail` cards with one
 *                    mark for what passed and another for what was stopped,
 *                    the `config` switch that splits one build into two
 *                    environments, and the `block` gate the shadow's attempts
 *                    bounce off
 *
 * Three lane segments and no others, all axis aligned and all ending on a box
 * edge:
 *   - `X_CALL` (540) between the Traffic band's bottom edge at 680 and the
 *     Versions band's top edge at 880. It runs both ways: a request rides it
 *     down to whichever card is serving, and rides its answer back up. The
 *     cadence is longer than a whole round trip, so the lane never holds two
 *     travellers and the two directions cannot meet.
 *   - `X_LIVE_LANE` (310) between the Versions band's bottom edge at 1270 and
 *     the Effects band's top edge at 1500, downward only: a side effect the
 *     serving version really sends.
 *   - `X_SHADOW_LANE` (770) over the same two edges, downward only: a side
 *     effect the shadow tries to send. It is drawn slower than a real one and
 *     it never arrives, because the gate is what it is going to meet.
 *
 * What happens inside a band is not a traveller. Mirroring is the fork changing
 * which arms it draws, the shadow's answer reaching the comparator is a
 * connector rather than a packet, and promotion is two cards changing what they
 * say about themselves, because the whole argument of the scene is that the
 * shadow's work never leaves the band it is done in.
 *
 * A traveller is a dot with a halo of r 26, so a lane sweeps a 52px band and
 * everything written beside it keeps 30px off. The call lane sweeps y 654..906
 * at x 514..566, so the Traffic band writes nothing below y 624 in that column
 * and the Versions band nothing above y 936 in it. The two effect lanes sweep
 * y 1244..1526 at x 284..336 and x 744..796, so the Versions band writes
 * nothing below y 1214 in those columns and the Effects band nothing above
 * y 1556 in them — which is why the `Effects` title sits at x 396 rather than
 * at its band's left edge, where the live lane would run through it.
 *
 * Declared texture: the ghost's two bar rows, its result glyphs and deploy
 * plate; the fork's stub, bar and arms; the two version cards with their
 * plates, state bars and outlet glyphs; the comparator plate and its answer
 * connector; the gate bar; the two target cards with their plates and their
 * passed and stopped marks and the doubled-send warning; the `config` plate,
 * track and knob. Everything else on the stage is a word, and every word is one
 * of the twelve fixed labels or a number.
 *
 * Nothing is told apart by colour alone. A synthetic bar row is **six even bars
 * of one height**; the production row is **six ragged bars of six heights**. A
 * version slot with nothing in it is a **faint dashed hollow plate**, a
 * deployed one standing by is a **dashed plate with a dashed bar**, one taking
 * copies is a **hollow plate with a hatched bar and an arrow into an open
 * ring**, one being fixed is a **hatched plate with a broken bar**, one serving
 * is a **filled plate with a solid bar and an arrow pointing home**, and one
 * that has stepped aside is a **muted plate with a hollow bar struck through**.
 * The copy's fork arm is **dashed** where the real request's is solid. A side
 * effect that passed is a **filled square with a check**; one the gate stopped
 * is a **dashed hollow square with a bar across it**. The doubled-send warning
 * is **two faint overlapping plates inside a ring**. The `config` knob sits
 * **left for one environment and right for the other**.
 *
 * Every value the reader can read is a stack of elements on one spot with a
 * base rule hiding all of them and the current `data-*` revealing exactly one,
 * so nothing is interpolated and scrubbing backwards lands on the value rather
 * than on an average of two: the `ok n` and `same n` readouts, the `diff`
 * verdict, the ghost's five stages, the fork's three shapes, each card's six
 * plates, five bars and two outlets, each target card's four plates and its two
 * marks, the `config` plate's three states and its two knob positions, and the
 * gate's three. There is no continuous quantity anywhere on this stage.
 */

import { VIEWBOX, requestsLayer, serviceBox, verticalLink } from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- geometry --------------------------------------------------------------

/** The three columns anything travels on, and the edges they run between. */
export const X_CALL = 540;
export const X_LIVE_LANE = 310;
export const X_SHADOW_LANE = 770;
export const Y_TRAFFIC_BOTTOM = 680;
export const Y_VERSIONS_TOP = 880;
export const Y_VERSIONS_BOTTOM = 1270;
export const Y_EFFECTS_TOP = 1500;

/** The Traffic band: what users got, and the world that trusted a fake load. */
const TRAFFIC = { x: 130, y: 440, w: 820, h: 240 };
const TRAFFIC_TITLE = { x: 152, y: 500 };
const OK = { x: 920, y: 500 };
const GHOST_BAR = { x0: 315, step: 76, w: 30, bottom: 606, even: 50 };
/** The six heights production turns out to have. The point is that they differ. */
const GHOST_WILD = [14, 50, 22, 62, 10, 38];
const GHOST_GLYPH = { cx: 760, cy: 581, r: 22 };
const DEPLOY = { x: 812, y: 557, w: 120, h: 48, rx: 16 };

/** The Versions band: two cards, the fork above them, the comparator between. */
const VERSIONS = { x: 130, y: 880, w: 820, h: 390 };
const VERSIONS_TITLE = { x: 152, y: 938 };
const FORK = { stubY0: 912, barY: 966, dropY1: 986, left: 295, right: 785 };
const CARD = { y: 986, w: 210, h: 168, rx: 22 };
const CARD_X = { live: 190, shadow: 680 };
const NAME = { dx: 28, y: 1036 };
const BAR = { dx: 28, y: 1068, w: 154, h: 28, rx: 14 };
const OUTLET = { dx: 168, y0: 1112, y1: 1140, ringCy: 1123, ringR: 13, head: 13 };
const COMP = { x: 440, y: 986, w: 200, h: 168, rx: 22 };
const SAME = { x: 540, y: 1040 };
const DIFF = { x: 540, y: 1110 };
const ANSWER = { x0: 640, x1: 680, y: 1082 };

/** The Effects band: what left the process, what was stopped, and by what. */
const EFFECTS = { x: 280, y: 1500, w: 520, h: 240 };
const EFFECTS_TITLE = { x: 396, y: 1557 };
const GATE = { x: 704, y: 1534, w: 84, h: 36, rx: 14 };
const BLOCK_WORD = { x: 686, y: 1552 };
const TARGET = { y: 1592, w: 160, h: 120, rx: 20 };
const TARGET_X: Record<string, number> = { db: 296, mail: 472 };
const TARGET_WORD = { dx: 20, y: 1634 };
const TARGET_MARK = { dx: 20, gap: 44, y: 1658, side: 28 };
const TWICE = { x: 580, y: 1654, w: 36, h: 36 };
const CONFIG = { x: 648, y: 1592, w: 140, h: 120, rx: 20 };
const CONFIG_WORD = { x: 718, y: 1634 };
const TRACK = { x: 668, y: 1656, w: 100, h: 20, rx: 10 };
const KNOB = { r: 9, cy: 1666, left: 683, right: 753 };

// --- what the stage can say about itself -----------------------------------

/** The two version slots. `shadow` is the new build; `live` is what users get. */
export const SIDE_IDS = ['live', 'shadow'] as const;
export type SideId = (typeof SIDE_IDS)[number];

/**
 * What a version card says about itself.
 *  - `empty` is a slot with nothing deployed in it.
 *  - `warm` is deployed and running, taking nothing.
 *  - `mirror` is taking copies and answering into the comparator, never a user.
 *  - `fix` is the same card with a mismatch being worked on.
 *  - `serving` is holding real traffic and answering users.
 *  - `retired` is the version that has just been stepped down from.
 */
export const SIDE_STATES = ['empty', 'warm', 'mirror', 'fix', 'serving', 'retired'] as const;
export type SideState = (typeof SIDE_STATES)[number];

/** The two things outside the process either version might try to touch. */
export const TARGET_IDS = ['db', 'mail'] as const;
export type TargetId = (typeof TARGET_IDS)[number];

/**
 * What a target card has seen. `pass` and `blocked` are independent facts, so a
 * card that has seen one of each says `both` and draws both marks at once —
 * which is the whole picture the third step is about.
 */
export const TARGET_STATES = ['none', 'pass', 'blocked', 'both'] as const;
export type TargetState = (typeof TARGET_STATES)[number];

/** The world the first step is set in, stage by stage. */
export const GHOST_STATES = ['idle', 'pass', 'deploy', 'break', 'off'] as const;
export type GhostState = (typeof GHOST_STATES)[number];

/** Where a request and its copy go: one card, both cards, or the new one. */
export const FORK_STATES = ['solo', 'mirror', 'new'] as const;
export type ForkState = (typeof FORK_STATES)[number];

/** What the comparator is saying: nothing yet, matching, mismatched, finished. */
export const VERDICTS = ['idle', 'same', 'diff', 'done'] as const;
export type Verdict = (typeof VERDICTS)[number];

/** The switch that splits one build into two environments. */
export const CONFIG_STATES = ['off', 'on', 'split'] as const;
export type ConfigState = (typeof CONFIG_STATES)[number];

/** The gate: not there, standing, or something has just bounced off it. */
export const BLOCK_STATES = ['off', 'armed', 'hit'] as const;
export type BlockState = (typeof BLOCK_STATES)[number];

/** What the scene holds up for a moment, drawn on the thing it is about. */
export const MARKS = ['none', 'shadow', 'copy', 'unseen', 'zero'] as const;
export type Mark = (typeof MARKS)[number];

/** The highest `ok n` and `same n` the readouts are ever asked for. */
export const OK_MAX = 8;
export const SAME_MAX = 4;

/** How many bars a load is drawn as, in either row. */
export const BAR_COUNT = 6;

/**
 * What every `data-*` on the stage starts at. The markup below is written from
 * this, so the opening frame is the whole diagram in its starting state — one
 * version serving, an empty slot beside it, a fork with a single arm, a
 * comparator that has compared nothing, a synthetic load drawn but not yet run,
 * no cage because there is nothing to cage, and nothing in flight — and the
 * timeline never restates a value that is already there.
 */
export const STAGE_STATE: Record<string, string> = {
  'stage@data-sd-ghost': 'idle',
  'stage@data-sd-fork': 'solo',
  'stage@data-sd-ok': '0',
  'stage@data-sd-same': '0',
  'stage@data-sd-verdict': 'idle',
  'stage@data-sd-config': 'off',
  'stage@data-sd-block': 'off',
  'stage@data-sd-twice': 'off',
  'stage@data-sd-mark': 'none',
  'stage@data-sd-settled': 'off',
  'live@data-sd-side': 'serving',
  'shadow@data-sd-side': 'empty',
  'db@data-sd-target': 'none',
  'mail@data-sd-target': 'none',
};

// --- markup ----------------------------------------------------------------

/** Newline plus `n` spaces, the separator between lines of one fragment. */
const pad = (n: number): string => `\n${' '.repeat(n)}`;

/** Non-breaking spaces, so a monospaced readout keeps its gaps in SVG. */
const mono = (text: string): string => text.replace(/ /g, '&#160;');

/** One spot, one text per value it can hold. Exactly one is ever revealed. */
const readout = (
  x: number,
  y: number,
  className: string,
  values: readonly string[],
  format: (value: string) => string,
  anchor: string,
  indent: number,
): string =>
  values
    .map(
      (value) =>
        `<text class="scene-counter ${className} ${className}--${value}" x="${x}" y="${y}" text-anchor="${anchor}">${mono(format(value))}</text>`,
    )
    .join(pad(indent));

const okReadout = readout(
  OK.x,
  OK.y,
  'sd-ok',
  Array.from({ length: OK_MAX + 1 }, (_v, n) => String(n)),
  (value) => `ok ${value}`,
  'end',
  4,
);

const sameReadout = readout(
  SAME.x,
  SAME.y,
  'sd-same',
  Array.from({ length: SAME_MAX + 1 }, (_v, n) => String(n)),
  (value) => `same ${value}`,
  'middle',
  6,
);

/** The centre of bar `index` in either load row. */
const barX = (index: number): number => GHOST_BAR.x0 + index * GHOST_BAR.step;

/** The row a synthetic load is: six bars of one height, evenly spaced. */
const evenRow = Array.from({ length: BAR_COUNT }, (_v, n) => n)
  .map(
    (n) =>
      `<rect class="sd-bar sd-bar--even" x="${barX(n) - GHOST_BAR.w / 2}" y="${GHOST_BAR.bottom - GHOST_BAR.even}" width="${GHOST_BAR.w}" height="${GHOST_BAR.even}" rx="6" />`,
  )
  .join(pad(6));

/** The row production is: the same six slots, six different heights. */
const wildRow = GHOST_WILD.map(
  (height, n) =>
    `<rect class="sd-bar sd-bar--wild" x="${barX(n) - GHOST_BAR.w / 2}" y="${GHOST_BAR.bottom - height}" width="${GHOST_BAR.w}" height="${height}" rx="6" />`,
).join(pad(6));

/** The two things a load can be said to have done, drawn as a check and a cross. */
const ghostGlyphs = [
  `<path class="sd-ghost-glyph sd-ghost-glyph--pass" d="M ${GHOST_GLYPH.cx - 16} ${GHOST_GLYPH.cy + 1} L ${GHOST_GLYPH.cx - 5} ${GHOST_GLYPH.cy + 12} L ${GHOST_GLYPH.cx + 17} ${GHOST_GLYPH.cy - 13}" />`,
  `<path class="sd-ghost-glyph sd-ghost-glyph--break" d="M ${GHOST_GLYPH.cx - 14} ${GHOST_GLYPH.cy - 14} L ${GHOST_GLYPH.cx + 14} ${GHOST_GLYPH.cy + 14} M ${GHOST_GLYPH.cx + 14} ${GHOST_GLYPH.cy - 14} L ${GHOST_GLYPH.cx - 14} ${GHOST_GLYPH.cy + 14}" />`,
  `<circle class="sd-ghost-ring" cx="${GHOST_GLYPH.cx}" cy="${GHOST_GLYPH.cy}" r="${GHOST_GLYPH.r + 12}" />`,
].join(pad(6));

/** The plate that says the build went out, with the arrow that is a deploy. */
const deployPlate = `<g class="sd-deploy">
      <rect class="sd-deploy-bg" x="${DEPLOY.x}" y="${DEPLOY.y}" width="${DEPLOY.w}" height="${DEPLOY.h}" rx="${DEPLOY.rx}" />
      <path class="sd-deploy-arrow" d="M ${DEPLOY.x + 34} ${DEPLOY.y + 12} L ${DEPLOY.x + 34} ${DEPLOY.y + 26} L ${DEPLOY.x + 22} ${DEPLOY.y + 26} L ${DEPLOY.x + 44} ${DEPLOY.y + 40} L ${DEPLOY.x + 66} ${DEPLOY.y + 26} L ${DEPLOY.x + 54} ${DEPLOY.y + 26} L ${DEPLOY.x + 54} ${DEPLOY.y + 12} Z" />
      <rect class="sd-deploy-slab" x="${DEPLOY.x + 78}" y="${DEPLOY.y + 12}" width="26" height="28" rx="6" />
    </g>`;

/** The fork: a stub off the lane, then one arm per card it feeds. */
const forkArm = (name: string, from: number, to: number, drop: number): string =>
  `<g class="sd-fork-arm sd-fork-arm--${name}">
      <line class="sd-fork-line" x1="${from}" y1="${FORK.barY}" x2="${to}" y2="${FORK.barY}" />
      <line class="sd-fork-line" x1="${drop}" y1="${FORK.barY}" x2="${drop}" y2="${FORK.dropY1}" />
      <path class="sd-fork-head" d="M ${drop - 12} ${FORK.dropY1 - 16} L ${drop} ${FORK.dropY1} L ${drop + 12} ${FORK.dropY1 - 16}" />
    </g>`;

const fork = `<g class="sd-fork">
      <line class="sd-fork-stub" x1="${X_CALL}" y1="${FORK.stubY0}" x2="${X_CALL}" y2="${FORK.barY}" />
      ${forkArm('live', X_CALL, FORK.left, FORK.left)}
      ${forkArm('copy', X_CALL, FORK.right, FORK.right)}
      ${forkArm('new', X_CALL, FORK.right, FORK.right)}
    </g>`;

/**
 * One version: six plates, its name, five state bars, and the two outlets that
 * say where its answer goes — home to the user, or into an open ring.
 */
const versionCard = (id: SideId): string => {
  const x = CARD_X[id];
  const cx = x + OUTLET.dx;
  const plates = SIDE_STATES.map(
    (state) =>
      `<rect class="sd-card-bg sd-card-bg--${state}" x="${x}" y="${CARD.y}" width="${CARD.w}" height="${CARD.h}" rx="${CARD.rx}" />`,
  ).join(pad(8));
  const bars = (['warm', 'mirror', 'fix', 'serving', 'retired'] as const)
    .map(
      (state) =>
        `<rect class="sd-card-bar sd-card-bar--${state}" x="${x + BAR.dx}" y="${BAR.y}" width="${BAR.w}" height="${BAR.h}" rx="${BAR.rx}" />`,
    )
    .join(pad(8));
  return `<g class="sd-card sd-card--${id}" data-sd-side="${STAGE_STATE[`${id}@data-sd-side`]}">
        ${plates}
        <text class="scene-mono sd-card-name" x="${x + NAME.dx}" y="${NAME.y}">${id}</text>
        ${bars}
        <line class="sd-card-break" x1="${x + BAR.dx + 62}" y1="${BAR.y - 8}" x2="${x + BAR.dx + 92}" y2="${BAR.y + BAR.h + 8}" />
        <line class="sd-card-strike" x1="${x + BAR.dx}" y1="${BAR.y + BAR.h / 2}" x2="${x + BAR.dx + BAR.w}" y2="${BAR.y + BAR.h / 2}" />
        <g class="sd-outlet sd-outlet--home">
          <line class="sd-outlet-shaft" x1="${cx}" y1="${OUTLET.y1}" x2="${cx}" y2="${OUTLET.y0}" />
          <path class="sd-outlet-head" d="M ${cx - OUTLET.head} ${OUTLET.y0 + OUTLET.head} L ${cx} ${OUTLET.y0} L ${cx + OUTLET.head} ${OUTLET.y0 + OUTLET.head}" />
        </g>
        <g class="sd-outlet sd-outlet--void">
          <line class="sd-outlet-shaft" x1="${cx}" y1="${OUTLET.y1}" x2="${cx}" y2="${OUTLET.ringCy + OUTLET.ringR}" />
          <circle class="sd-outlet-ring" cx="${cx}" cy="${OUTLET.ringCy}" r="${OUTLET.ringR}" />
        </g>
      </g>`;
};

/** The comparator: what the shadow's answers are graded against. */
const comparator = `<g class="sd-comp">
      <rect class="sd-comp-bg" x="${COMP.x}" y="${COMP.y}" width="${COMP.w}" height="${COMP.h}" rx="${COMP.rx}" />
      ${sameReadout}
      <text class="scene-counter scene-mono sd-diff" x="${DIFF.x}" y="${DIFF.y}" text-anchor="middle">diff</text>
    </g>

    <g class="sd-answer">
      <line class="sd-answer-line" x1="${ANSWER.x1}" y1="${ANSWER.y}" x2="${ANSWER.x0 + 14}" y2="${ANSWER.y}" />
      <path class="sd-answer-head" d="M ${ANSWER.x0 + 16} ${ANSWER.y - 12} L ${ANSWER.x0} ${ANSWER.y} L ${ANSWER.x0 + 16} ${ANSWER.y + 12}" />
    </g>`;

/** The gate the shadow's attempts bounce off, and the word for it. */
const gate = `<g class="sd-gate">
      <rect class="sd-gate-bg" x="${GATE.x}" y="${GATE.y}" width="${GATE.w}" height="${GATE.h}" rx="${GATE.rx}" />
      <line class="sd-gate-bolt" x1="${GATE.x + 14}" y1="${GATE.y + GATE.h / 2}" x2="${GATE.x + GATE.w - 14}" y2="${GATE.y + GATE.h / 2}" />
    </g>
    <text class="scene-mono sd-block-word" x="${BLOCK_WORD.x}" y="${BLOCK_WORD.y}" text-anchor="end">block</text>`;

/** One thing outside the process: four plates, its name, and its two marks. */
const targetCard = (id: TargetId): string => {
  const x = TARGET_X[id] ?? 0;
  const plates = TARGET_STATES.map(
    (state) =>
      `<rect class="sd-target-bg sd-target-bg--${state}" x="${x}" y="${TARGET.y}" width="${TARGET.w}" height="${TARGET.h}" rx="${TARGET.rx}" />`,
  ).join(pad(8));
  const passX = x + TARGET_MARK.dx;
  const stopX = passX + TARGET_MARK.gap;
  const side = TARGET_MARK.side;
  const my = TARGET_MARK.y;
  return `<g class="sd-target sd-target--${id}" data-sd-target="${STAGE_STATE[`${id}@data-sd-target`]}">
        ${plates}
        <text class="scene-mono sd-target-word" x="${x + TARGET_WORD.dx}" y="${TARGET_WORD.y}">${id}</text>
        <g class="sd-mark sd-mark--pass">
          <rect class="sd-mark-bg" x="${passX}" y="${my}" width="${side}" height="${side}" rx="7" />
          <path class="sd-mark-glyph" d="M ${passX + 6} ${my + 15} L ${passX + 12} ${my + 21} L ${passX + 23} ${my + 8}" />
        </g>
        <g class="sd-mark sd-mark--stop">
          <rect class="sd-stop-bg" x="${stopX}" y="${my}" width="${side}" height="${side}" rx="7" />
          <line class="sd-stop-bar" x1="${stopX + 5}" y1="${my + side - 5}" x2="${stopX + side - 5}" y2="${my + 5}" />
        </g>
      </g>`;
};

/** What the gate stopped, drawn as the second send that would have gone out. */
const twiceWarning = `<g class="sd-twice">
      <rect class="sd-twice-back" x="${TWICE.x}" y="${TWICE.y}" width="${TWICE.w - 10}" height="${TWICE.h - 10}" rx="7" />
      <rect class="sd-twice-front" x="${TWICE.x + 10}" y="${TWICE.y + 10}" width="${TWICE.w - 10}" height="${TWICE.h - 10}" rx="7" />
      <circle class="sd-twice-ring" cx="${TWICE.x + TWICE.w / 2}" cy="${TWICE.y + TWICE.h / 2}" r="${TWICE.w / 2 + 8}" />
    </g>`;

/** The switch: one build, and the setting that decides which world it is in. */
const configSwitch = `<g class="sd-config">
      <rect class="sd-config-bg" x="${CONFIG.x}" y="${CONFIG.y}" width="${CONFIG.w}" height="${CONFIG.h}" rx="${CONFIG.rx}" />
      <text class="scene-mono sd-config-word" x="${CONFIG_WORD.x}" y="${CONFIG_WORD.y}" text-anchor="middle">config</text>
      <rect class="sd-config-track" x="${TRACK.x}" y="${TRACK.y}" width="${TRACK.w}" height="${TRACK.h}" rx="${TRACK.rx}" />
      <circle class="sd-config-knob sd-config-knob--left" cx="${KNOB.left}" cy="${KNOB.cy}" r="${KNOB.r}" />
      <circle class="sd-config-knob sd-config-knob--right" cx="${KNOB.right}" cy="${KNOB.cy}" r="${KNOB.r}" />
    </g>`;

const stageAttrs = Object.entries(STAGE_STATE)
  .filter(([key]) => key.startsWith('stage@'))
  .map(([key, value]) => `${key.slice('stage@'.length)}="${value}"`)
  .join(' ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageAttrs} aria-hidden="true" focusable="false">
  <defs>
    <pattern id="sd-hatch" width="14" height="14" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
      <line class="sd-hatch-line" x1="0" y1="0" x2="0" y2="14" stroke-width="6" />
    </pattern>
  </defs>

  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_CALL, Y_TRAFFIC_BOTTOM, Y_VERSIONS_TOP, 'scene-link sd-lane--call')}
  ${verticalLink(X_LIVE_LANE, Y_VERSIONS_BOTTOM, Y_EFFECTS_TOP, 'scene-link sd-lane--effect')}
  ${verticalLink(X_SHADOW_LANE, Y_VERSIONS_BOTTOM, Y_EFFECTS_TOP, 'scene-link sd-lane--attempt')}

  ${serviceBox({
    x: TRAFFIC.x,
    width: TRAFFIC.w,
    y: TRAFFIC.y,
    height: TRAFFIC.h,
    title: 'Traffic',
    titleX: TRAFFIC_TITLE.x,
    titleY: TRAFFIC_TITLE.y,
    titleClass: 'scene-node-title sd-title',
    titleAnchor: null,
    className: 'scene-client sd-traffic',
    children: `
    ${okReadout}

    <g class="sd-ghost">
      ${evenRow}

      ${wildRow}

      ${ghostGlyphs}
    </g>

    ${deployPlate}`,
  })}

  ${serviceBox({
    x: VERSIONS.x,
    width: VERSIONS.w,
    y: VERSIONS.y,
    height: VERSIONS.h,
    title: 'Versions',
    titleX: VERSIONS_TITLE.x,
    titleY: VERSIONS_TITLE.y,
    titleClass: 'scene-node-title sd-title',
    titleAnchor: null,
    className: 'scene-node sd-versions',
    children: `
    ${fork}

    ${SIDE_IDS.map((id) => versionCard(id)).join(`\n\n      `)}

    ${comparator}`,
  })}

  ${serviceBox({
    x: EFFECTS.x,
    width: EFFECTS.w,
    y: EFFECTS.y,
    height: EFFECTS.h,
    title: 'Effects',
    titleX: EFFECTS_TITLE.x,
    titleY: EFFECTS_TITLE.y,
    titleClass: 'scene-node-title sd-title',
    titleAnchor: null,
    className: 'scene-service sd-effects',
    children: `
    ${gate}

    ${TARGET_IDS.map((id) => targetCard(id)).join(`\n\n      `)}

    ${twiceWarning}

    ${configSwitch}`,
  })}

  ${requestsLayer()}
</svg>`;
