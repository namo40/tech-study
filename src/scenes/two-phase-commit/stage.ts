/**
 * Static stage markup for the Two-Phase Commit scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Four boxes in three bands, laid out
 * as the protocol is: one thing that decides, two things that promise, and the
 * caller that has to be told a single answer.
 *   - y 0..400       above the cropped viewBox (see shared VIEWBOX)
 *   - y 400..440     the frame's top padding; nothing is drawn here
 *   - y 440..680     Coordinator: the phase it is in (`prepare`, `commit`,
 *                    `abort`), the `votes n/2` readout, and the `down` plate it
 *                    shows when the process is gone. The phase plate is also
 *                    the decision log: it holds the word the coordinator wrote
 *                    down, which is what a restarted coordinator reads back.
 *   - y 880..1270    Orders (x 130..490) and Payments (x 590..950), each with
 *                    the badge that says where it stands (`idle`, `prepared`,
 *                    `committed`, `aborted`), the `lock` plate that burns while
 *                    it is holding one, and the row card underneath — the
 *                    change this transaction is making to that store
 *   - y 1500..1740   App, which shows only what it was told: `waiting`, then
 *                    `ok` or `fail`
 *
 * Two lanes carry everything, and they are the only two. `X_ORDERS` at 310 and
 * `X_PAYMENTS` at 770 both run from the Coordinator's bottom edge to the top
 * edge of the store they belong to, both are the centre column of that store,
 * and both carry traffic in both directions: instructions down, votes up. A
 * traveller sweeps 26px around every point it reaches and a label keeps 30px
 * clear of that, so the two lanes own two keep-outs, x 254..366 and x 714..826,
 * each from y 624 to y 936. That is what decides the layout: the Coordinator
 * writes everything above y 606, and both stores write everything below y 955.
 *
 * The third line, `X_APP` at 540, joins the Coordinator to the App and is drawn
 * quiet, because nothing travels on it inside the scene. The request that
 * started all this arrived before the first frame — the App is already
 * `waiting` at 0.6 — and the answer it is given is drawn as the App's own
 * state rather than as a dot going home. The line still has to be honest
 * geometry: it is vertical, it runs through the centre of both boxes it joins,
 * it ends on their edges, and between them it passes through the 100px gap
 * between the two stores rather than over either of them.
 *
 * Declared texture: the chip plates and the two row cards. A row card carries
 * no text because it is not a readout — it is the change itself, drawn as a
 * block that is empty, held, or written, which is the one thing the badge word
 * cannot say on its own.
 */

import {
  VIEWBOX,
  chip,
  clientBox,
  counterVariants,
  requestsLayer,
  serviceBox,
  verticalLink,
} from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- geometry --------------------------------------------------------------

/** The two lanes, and the edges they run between. */
export const X_ORDERS = 310;
export const X_PAYMENTS = 770;
export const Y_COORD_BOTTOM = 680;
export const Y_STORE_TOP = 880;

/** The quiet line between the Coordinator and the App. */
const X_APP = 540;
const Y_APP_TOP = 1500;

/** The Coordinator band. */
const COORD = { x: 130, y: 440, w: 820, h: 240 };
const COORD_TITLE_X = 170;
const COORD_TITLE_Y = 505;
const PHASE_CHIP = { x: 170, y: 540, w: 260, h: 66 };
const VOTES_X = 470;
const DOWN_CHIP = { x: 730, y: 540, w: 200, h: 66 };
const COORD_TEXT_Y = 585;

/** The two stores. Everything inside one is written from its left edge. */
const STORE = { y: 880, w: 360, h: 390 };
const STORE_X = { orders: 130, payments: 590 } as const;
const STORE_TITLE_DX = 40;
const STORE_TITLE_Y = 990;
const BADGE_CHIP = { dx: 40, y: 1024, w: 260, h: 66 };
const BADGE_TEXT_Y = 1067;
const LOCK_CHIP = { dx: 40, y: 1112, w: 140, h: 56 };
const LOCK_TEXT_Y = 1149;
const ROW_CARD = { dx: 40, y: 1194, w: 260, h: 44 };

/** The App band. */
const APP = { x: 280, y: 1500, w: 520, h: 240 };
const APP_TITLE_Y = 1580;
const APP_CHIP = { x: 420, y: 1616, w: 240, h: 66 };
const APP_TEXT_Y = 1659;

// --- what the stage can say about itself -----------------------------------

/** The two stores, in the order the markup writes them. */
export const STORES = ['orders', 'payments'] as const;
export type StoreKey = (typeof STORES)[number];

/** The name each store shows, which never changes. */
const STORE_TITLES: Record<StoreKey, string> = { orders: 'Orders', payments: 'Payments' };

/**
 * Which phase the coordinator is in. `idle` is the absence of a transaction,
 * so it has no word and the plate is not drawn at all: between transactions
 * there is no phase to be in. For the other three the plate is also the log —
 * `commit` written there is the decision a restarted coordinator reads back.
 */
export const PHASES = ['idle', 'prepare', 'commit', 'abort'] as const;
export type Phase = (typeof PHASES)[number];

/** The words the phase plate can carry, which is every phase but `idle`. */
export const PHASE_WORDS = ['prepare', 'commit', 'abort'] as const;

/** Whether the coordinator process is there at all. */
export const COORD_STATES = ['up', 'down'] as const;
export type CoordState = (typeof COORD_STATES)[number];

/** Where a store stands in the current transaction. */
export const BADGES = ['idle', 'prepared', 'committed', 'aborted'] as const;
export type Badge = (typeof BADGES)[number];

/** Whether a store is holding a lock. It burns exactly while it is prepared. */
export const LOCKS = ['off', 'on'] as const;
export type Lock = (typeof LOCKS)[number];

/**
 * The half-state demonstration in the first step. It is not a badge: it is a
 * hypothetical drawn over one, which is why it has its own attribute and its
 * own dashed treatment. The real badges stay `idle` underneath it, so the two
 * stores never actually contradict each other at any moment of the scene.
 */
export const GHOSTS = ['off', 'committed', 'aborted'] as const;
export type Ghost = (typeof GHOSTS)[number];

/** What the App has been told. `idle` is before it has been told anything. */
export const APP_STATES = ['idle', 'waiting', 'ok', 'fail'] as const;
export type AppState = (typeof APP_STATES)[number];

/**
 * The word each App state shows. `idle` and `waiting` share one, because the
 * request that started all this arrived before the first frame: the App has
 * been waiting the whole time, and the only thing 0.6 changes is that the
 * scene says so.
 */
const APP_WORDS: Record<AppState, string> = {
  idle: 'waiting',
  waiting: 'waiting',
  ok: 'ok',
  fail: 'fail',
};

/** How many votes the coordinator is waiting for, which is how many stores. */
export const VOTE_TARGET = 2;

/**
 * Which reading is being held up for a moment, and why. `half` marks the
 * contradiction the first step demonstrates, `atomic` the promise that answers
 * it, `promise` the moment where everyone has voted and nobody has committed,
 * `contrast` the pair of outcomes that agree, and `indoubt` the locks nobody
 * can release while the coordinator is gone.
 */
export const MARKS = ['off', 'half', 'atomic', 'promise', 'contrast', 'indoubt'] as const;
export type Mark = (typeof MARKS)[number];

/**
 * What every `data-*` on the stage root starts at. The markup below is written
 * from these, so the first frame is the whole diagram in its opening state — a
 * coordinator with no phase and no votes, two stores holding nothing, an App
 * that has not been told anything yet — and the timeline never restates it.
 */
export const STAGE_STATE: Record<string, string> = {
  'data-tpc-phase': 'idle',
  'data-tpc-votes': '0',
  'data-tpc-coord': 'up',
  'data-tpc-app': 'idle',
  'data-tpc-mark': 'off',
  'data-tpc-settled': 'off',
};

/** What every store starts at, for the same reason. */
export const STORE_STATE: Record<string, string> = {
  'data-tpc-badge': 'idle',
  'data-tpc-lock': 'off',
  'data-tpc-ghost': 'off',
};

// --- markup ----------------------------------------------------------------

/** Non-breaking spaces, so a monospaced label keeps its gaps in SVG. */
const mono = (text: string): string => text.replace(/ /g, '&#160;');

/**
 * A plate with one word per state stacked on it, the widget class hiding all of
 * them and the state picking the one that shows. Nothing interpolates, so
 * scrubbing backwards is exact and neither theme has a colour to average.
 */
const wordChip = (
  name: string,
  states: readonly string[],
  box: { x: number; y: number; w: number; h: number },
  textY: number,
  /** The word state `s` shows, when it is not the state's own name. */
  wordOf: (state: string) => string = (state) => state,
  indent = 4,
): string => {
  const centre = box.x + box.w / 2;
  const text = states
    .map(
      (state) =>
        `<text class="scene-counter tpc-${name} tpc-${name}--${state}" x="${centre}" y="${textY}" text-anchor="middle">${wordOf(state)}</text>`,
    )
    .join(`\n${' '.repeat(indent + 2)}`);
  return chip({
    x: box.x,
    y: box.y,
    width: box.w,
    height: box.h,
    rx: 18,
    className: `tpc-chip-${name}`,
    variant: 'outline',
    text,
    indent,
  });
};

/** How many votes are in, out of how many the coordinator needs. */
const votesReadout = counterVariants({
  x: VOTES_X,
  y: COORD_TEXT_Y,
  className: 'tpc-votes',
  count: VOTE_TARGET + 1,
  format: (n) => mono(`votes ${n}/${VOTE_TARGET}`),
  indent: 4,
});

/**
 * One store: its name, the badge that says where it stands, the `lock` plate
 * that burns while it is holding one, and the row card underneath.
 */
const store = (key: StoreKey): string => {
  const x = STORE_X[key];
  const badge = { x: x + BADGE_CHIP.dx, y: BADGE_CHIP.y, w: BADGE_CHIP.w, h: BADGE_CHIP.h };
  const lock = { x: x + LOCK_CHIP.dx, y: LOCK_CHIP.y, w: LOCK_CHIP.w, h: LOCK_CHIP.h };
  const attrs = Object.entries(STORE_STATE)
    .map(([name, value]) => ` ${name}="${value}"`)
    .join('');
  return serviceBox({
    x,
    width: STORE.w,
    y: STORE.y,
    height: STORE.h,
    title: STORE_TITLES[key],
    titleX: x + STORE_TITLE_DX,
    titleY: STORE_TITLE_Y,
    titleClass: 'scene-node-title',
    titleAnchor: null,
    className: `scene-node tpc-store tpc-store--${key}`,
    attrs,
    children: `
    ${wordChip('badge', BADGES, badge, BADGE_TEXT_Y)}

    ${wordChip('lock', ['on'], lock, LOCK_TEXT_Y, () => 'lock')}

    <rect class="tpc-row" x="${x + ROW_CARD.dx}" y="${ROW_CARD.y}" width="${ROW_CARD.w}" height="${ROW_CARD.h}" rx="14" />`,
  });
};

const stageAttrs = Object.entries(STAGE_STATE)
  .map(([name, value]) => `${name}="${value}"`)
  .join(' ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageAttrs} aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_APP, Y_COORD_BOTTOM, Y_APP_TOP, 'scene-link tpc-lane-app')}
  ${verticalLink(X_ORDERS, Y_COORD_BOTTOM, Y_STORE_TOP, 'scene-link tpc-lane')}
  ${verticalLink(X_PAYMENTS, Y_COORD_BOTTOM, Y_STORE_TOP, 'scene-link tpc-lane')}

  ${clientBox({
    x: COORD.x,
    width: COORD.w,
    y: COORD.y,
    height: COORD.h,
    title: 'Coordinator',
    titleX: COORD_TITLE_X,
    titleY: COORD_TITLE_Y,
    titleAnchor: null,
    titleClass: 'scene-node-title tpc-coord-title',
    extraClass: 'tpc-coordinator',
    children: `
    ${wordChip('phase', PHASE_WORDS, PHASE_CHIP, COORD_TEXT_Y)}

    ${votesReadout}

    ${wordChip('down', ['down'], DOWN_CHIP, COORD_TEXT_Y)}`,
  })}

  ${store('orders')}

  ${store('payments')}

  ${serviceBox({
    x: APP.x,
    width: APP.w,
    y: APP.y,
    height: APP.h,
    title: 'App',
    titleY: APP_TITLE_Y,
    className: 'scene-service tpc-app-box',
    children: `
    ${wordChip('app', APP_STATES, APP_CHIP, APP_TEXT_Y, (state) => APP_WORDS[state as AppState])}`,
  })}

  ${requestsLayer()}
</svg>`;
