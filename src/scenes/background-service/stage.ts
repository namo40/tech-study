/**
 * Static stage markup for the Background Service scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Three bands, one per party to work
 * nobody is waiting on:
 *   - y 0..400       above the cropped viewBox (see shared VIEWBOX)
 *   - y 400..440     the frame's top padding; nothing is drawn here
 *   - y 440..680     App (x 130..950): the one request capsule the reader
 *                    watches, the block that says what is happening inside it,
 *                    and the `reply n ms` readout that is the whole argument of
 *                    the first step. The block is a stack: a long purple bar is
 *                    a report being built inside the request, the same bar in
 *                    red is the client giving up on it, and a short blue stub is
 *                    the same request once all it does is hand the work over.
 *   - y 880..1270    Host (x 130..950): the `service` capsule with the word on
 *                    it, the loop ring that turns while the loop is consuming,
 *                    the marker that says a job is in its hands, the lease mark,
 *                    the second instance a scale-out adds, the process badge the
 *                    third step draws around it, the lifetime lamp with one of
 *                    `start` / `running` / `stopping` / `stopped` beside it, and
 *                    the queue: five slots and the `queue n` readout.
 *   - y 1500..1740   Jobs (x 280..800): the done strip, one mark per completed
 *                    job, the `done n` readout, and the `twice` lamp that lights
 *                    when one job was completed by two instances at once.
 *
 * Two lane segments and no others, both axis aligned and both one-directional:
 *   - `X_LANE` (540) from the App's bottom edge at 680 to the Host's top edge at
 *     880, carrying a request's work down to the queue. Nothing comes back up
 *     it: the reply is a readout inside the App, not a packet.
 *   - `X_LANE` (540) again from the Host's bottom edge at 1270 to the Jobs' top
 *     edge at 1500, carrying a finished job down to the strip.
 *   The two segments share a column but never a neighbourhood: they are 390px
 *   apart, and within each one the loop's own cadence keeps travellers further
 *   apart than the 52px halo.
 *
 * A traveller is a dot with a halo of r 26, so each lane sweeps a 52px band at
 * x 514..566 and everything written beside one keeps 30px off it. The upper lane
 * sweeps y 654..906, so the App writes nothing below y 620 in that column and
 * the Host writes nothing above y 981 in it. The lower lane sweeps y 1244..1526,
 * so the Host writes nothing below y 1210 in that column and the Jobs band
 * writes nothing above y 1556 in it — which is why the `Jobs` title sits on the
 * low line and the done strip starts under it.
 *
 * Declared texture: the request capsule and the block inside it, the service
 * capsule, its loop ring, its in-hand marker, its lease mark, the second
 * instance, the process badge, the lamp socket, the five queue slots, the ten
 * done marks and the doubled outline one of them can carry.
 * Everything else on the stage is a word, and every word is one of the twelve
 * fixed labels.
 *
 * Every value the reader can read is a stack of elements on one spot with a base
 * rule hiding all of them and the current `data-*` revealing one, so nothing is
 * interpolated and scrubbing backwards lands on the value rather than on an
 * average of two. There is no continuous quantity anywhere on this stage: a
 * queue is a count of slots and a reply time is a number, and both are drawn as
 * the number they are.
 */

import { VIEWBOX, clientBox, counterVariants, requestsLayer, serviceBox, verticalLink } from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- geometry --------------------------------------------------------------

/** The one column anything travels on, and the four edges it runs between. */
export const X_LANE = 540;
export const Y_APP_BOTTOM = 680;
export const Y_HOST_TOP = 880;
export const Y_HOST_BOTTOM = 1270;
export const Y_JOBS_TOP = 1500;

/** The App band: one request, and what is going on inside it. */
const APP = { x: 130, y: 440, w: 820, h: 240 };
const APP_TITLE = { x: 152, y: 503 };
const REQ = { x: 170, y: 528, w: 470, h: 92 };
const BLOCK = { x: 200, y: 552, h: 44, long: 400, stub: 90 };
const REPLY = { x: 920, y: 592 };

/** The Host band: the service, its lifetime, and the queue it drains. */
const HOST = { x: 130, y: 880, w: 820, h: 390 };
const HOST_TITLE = { x: 152, y: 948 };
const CAPSULE = { x: 170, y: 995, w: 400, h: 120 };
const SERVICE_TEXT = { x: 196, y: 1038 };
const HAND = { x: 196, y: 1060, w: 46, h: 34 };
const LOCK = { x: 400, y: 1046, w: 44, h: 36 };
const LOOP = { cx: 505, cy: 1055, r: 26 };
const SECOND = { x: 610, y: 1070, w: 300, h: 72 };
const BADGE = { x: 156, y: 981, w: 428, h: 148 };
const LAMP = { cx: 660, cy: 1030, r: 24 };
const LIFE_TEXT = { x: 704, y: 1043 };

/** The queue: five slots and the count of what is standing in them. */
const SLOT = { first: 222, gap: 72, y: 1158, side: 52 };
export const QUEUE_SLOTS = 5;
const QUEUE_READOUT = { x: 920, y: 1203 };

/** The Jobs band: what got done, and the one job that got done twice. */
const JOBS = { x: 280, y: 1500, w: 520, h: 240 };
const JOBS_TITLE = { x: 312, y: 1568 };
const MARK = { first: 310, gap: 38, y: 1596, w: 26, h: 32 };
export const MAX_DONE = 10;
const DONE_READOUT = { x: 770, y: 1700 };
const TWICE = { cx: 326, cy: 1688, r: 16, textX: 360, textY: 1700 };

// --- what the stage can say about itself -----------------------------------

/**
 * The reply times the readout can show, in milliseconds, in the order the first
 * step reaches them. Index 0 is what a request costs when it hands its work
 * over; the rest are what the same request costs while it does the work itself,
 * and each is twice the one before it. The timeline writes the index, never the
 * number, so nothing here is ever interpolated.
 */
export const REPLY_VALUES = [20, 900, 1800, 3600] as const;

/** The reply a request that hands its work over comes back with. */
export const REPLY_FAST_INDEX = 0;

/** The first reply the ghost produces, and the index it is written as. */
export const REPLY_GHOST_INDEX = 1;

/** What the client stops waiting at. A reply past this is a failed request. */
export const TIMEOUT_MS = 3000;

/** What is going on inside the request: nothing, a long job, a client that gave
 *  up on one, or the stub that is left once the work is handed over. */
export const WORK_STATES = ['none', 'long', 'timeout', 'hand'] as const;
export type WorkState = (typeof WORK_STATES)[number];

/** Whether the App still does the work itself or hands it to the queue. */
export const MODES = ['inline', 'delegate'] as const;
export type Mode = (typeof MODES)[number];

/**
 * The lifetime contract, drawn as one lamp and one word. `idle` is the service
 * before the host has started it, and it lights nothing at all: the socket is
 * there, and it is empty. The other four are the four words.
 */
export const LIFE_STATES = ['idle', 'start', 'running', 'stopping', 'stopped'] as const;
export type LifeState = (typeof LIFE_STATES)[number];

/** The four words the lamp can be standing next to. */
export const LIFE_WORDS = ['start', 'running', 'stopping', 'stopped'] as const;

/** Whether the service is drawn inside the Host or as its own process. */
export const PLACES = ['host', 'split'] as const;
export type Place = (typeof PLACES)[number];

/** How many instances of the service are running. */
export const SCALES = ['one', 'two'] as const;
export type Scale = (typeof SCALES)[number];

/** A word the stage can say about itself, which is either said or not. */
export const FLAGS = ['off', 'on'] as const;
export type Flag = (typeof FLAGS)[number];

/** What the scene is holding up for a moment, drawn on the band it is about. */
export const MARKS = ['none', 'split', 'apart', 'truth'] as const;
export type Mark = (typeof MARKS)[number];

/**
 * What every `data-*` on the stage starts at, keyed by the target the timeline
 * addresses it through. The markup below is written from this, so the opening
 * frame is the whole diagram in its starting state — one request answering in
 * 20 ms with nothing going on inside it, a service the host has not started, an
 * empty queue, an empty done strip and nothing in flight — and the timeline
 * never restates a value already there.
 */
export const STAGE_STATE: Record<string, string> = {
  'stage@data-bs-work': 'none',
  'stage@data-bs-mode': 'inline',
  'stage@data-bs-reply': String(REPLY_FAST_INDEX),
  'stage@data-bs-app': 'up',
  'stage@data-bs-life': 'idle',
  'stage@data-bs-hand': 'off',
  'stage@data-bs-place': 'host',
  'stage@data-bs-scale': 'one',
  'stage@data-bs-lease': 'off',
  'stage@data-bs-queue': '0',
  'stage@data-bs-done': '0',
  'stage@data-bs-twice': 'off',
  'stage@data-bs-mark': 'none',
  'stage@data-bs-settled': 'off',
};

for (let index = 1; index <= QUEUE_SLOTS; index += 1) {
  STAGE_STATE[`slot-${index}@data-bs-slot`] = 'free';
}
for (let index = 1; index <= MAX_DONE; index += 1) {
  STAGE_STATE[`mark-${index}@data-bs-done-mark`] = 'off';
  STAGE_STATE[`mark-${index}@data-bs-dup`] = 'off';
}

// --- markup ----------------------------------------------------------------

/** Newline plus `n` spaces, the separator between lines of one fragment. */
const pad = (n: number): string => `\n${' '.repeat(n)}`;

/** Non-breaking spaces, so a monospaced readout keeps its gaps in SVG. */
const mono = (text: string): string => text.replace(/ /g, '&#160;');

/** Centre x of queue slot `index`, counting from one. */
export const slotX = (index: number): number => SLOT.first + SLOT.gap * (index - 1);

/**
 * What is going on inside the request, drawn as three blocks on one row. The
 * long one is a report being built where the caller is waiting for it; the same
 * length in red is the client giving up; the stub is the same request once all
 * it does is put the work somewhere else. Base hides all three.
 */
const workBlocks = (['long', 'timeout', 'hand'] as const)
  .map(
    (state) =>
      `<rect class="bs-work bs-work--${state}" x="${BLOCK.x}" y="${BLOCK.y}" width="${state === 'hand' ? BLOCK.stub : BLOCK.long}" height="${BLOCK.h}" rx="12" />`,
  )
  .join(pad(4));

/** What the request cost the caller. One text per value, one of them shown. */
const replyReadout = counterVariants({
  x: REPLY.x,
  y: REPLY.y,
  className: 'bs-reply',
  count: REPLY_VALUES.length,
  format: (n) => mono(`reply ${REPLY_VALUES[n]} ms`),
  anchor: 'end',
  indent: 4,
});

/** The four things the lamp can be lit as. `idle` lights none of them. */
const lampGlyphs = (['start', 'running', 'stopping', 'stopped'] as const)
  .map((state) => {
    const inner =
      state === 'start'
        ? `<circle class="bs-lamp-ring" cx="${LAMP.cx}" cy="${LAMP.cy}" r="16" />`
        : state === 'running'
          ? `<circle class="bs-lamp-dot" cx="${LAMP.cx}" cy="${LAMP.cy}" r="16" />`
          : state === 'stopping'
            ? `<circle class="bs-lamp-dot" cx="${LAMP.cx}" cy="${LAMP.cy}" r="10" /><circle class="bs-lamp-halo" cx="${LAMP.cx}" cy="${LAMP.cy}" r="20" />`
            : `<circle class="bs-lamp-hollow" cx="${LAMP.cx}" cy="${LAMP.cy}" r="16" /><path class="bs-lamp-bar" d="M ${LAMP.cx - 16} ${LAMP.cy} L ${LAMP.cx + 16} ${LAMP.cy}" />`;
    return `<g class="bs-glyph bs-lamp--${state}">${inner}</g>`;
  })
  .join(pad(4));

/** The four words, stacked on one spot. Base hides all four. */
const lifeWords = LIFE_WORDS.map(
  (word) => `<text class="bs-life-text bs-life-text--${word}" x="${LIFE_TEXT.x}" y="${LIFE_TEXT.y}">${word}</text>`,
).join(pad(4));

/** One slot in the queue. A free slot is room; a held slot is a waiting job. */
const slot = (index: number): string =>
  `<rect class="scene-slot bs-slot bs-slot--${index}" data-bs-slot="free" x="${slotX(index) - SLOT.side / 2}" y="${SLOT.y}" width="${SLOT.side}" height="${SLOT.side}" rx="12" />`;

/** How many jobs are standing in the queue. */
const queueReadout = counterVariants({
  x: QUEUE_READOUT.x,
  y: QUEUE_READOUT.y,
  className: 'bs-queue',
  max: QUEUE_SLOTS,
  format: (n) => mono(`queue ${n}`),
  anchor: 'end',
  indent: 4,
});

/**
 * One mark on the done strip. The doubled outline behind it is the record of a
 * job two instances both finished, which is why it is drawn on the job rather
 * than announced: the count still says one, because one job was done.
 */
const doneMark = (index: number): string => {
  const x = MARK.first + MARK.gap * (index - 1);
  return `<g class="bs-mark bs-mark--${index}" data-bs-done-mark="off" data-bs-dup="off">
      <rect class="bs-mark-dup" x="${x + 7}" y="${MARK.y - 7}" width="${MARK.w}" height="${MARK.h}" rx="7" />
      <rect class="bs-mark-bg" x="${x}" y="${MARK.y}" width="${MARK.w}" height="${MARK.h}" rx="7" />
    </g>`;
};

/** How many jobs the strip has marked. It never goes backwards. */
const doneReadout = counterVariants({
  x: DONE_READOUT.x,
  y: DONE_READOUT.y,
  className: 'bs-done',
  max: MAX_DONE,
  format: (n) => mono(`done ${n}`),
  anchor: 'end',
  indent: 4,
});

const stageAttrs = Object.entries(STAGE_STATE)
  .filter(([key]) => key.startsWith('stage@'))
  .map(([key, value]) => `${key.slice('stage@'.length)}="${value}"`)
  .join(' ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageAttrs} aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_LANE, Y_APP_BOTTOM, Y_HOST_TOP, 'scene-link bs-lane--work')}
  ${verticalLink(X_LANE, Y_HOST_BOTTOM, Y_JOBS_TOP, 'scene-link bs-lane--done')}

  ${clientBox({
    x: APP.x,
    width: APP.w,
    y: APP.y,
    height: APP.h,
    title: 'App',
    titleX: APP_TITLE.x,
    titleY: APP_TITLE.y,
    titleAnchor: null,
    extraClass: 'bs-app',
    children: `
    <rect class="bs-req-bg" x="${REQ.x}" y="${REQ.y}" width="${REQ.w}" height="${REQ.h}" rx="22" />

    ${workBlocks}

    ${replyReadout}`,
  })}

  ${serviceBox({
    x: HOST.x,
    width: HOST.w,
    y: HOST.y,
    height: HOST.h,
    title: 'Host',
    titleX: HOST_TITLE.x,
    titleY: HOST_TITLE.y,
    titleAnchor: null,
    className: 'scene-node bs-host',
    children: `
    <rect class="bs-shadow" x="${SECOND.x}" y="${SECOND.y}" width="${SECOND.w}" height="${SECOND.h}" rx="20" />
    <rect class="bs-badge" x="${BADGE.x}" y="${BADGE.y}" width="${BADGE.w}" height="${BADGE.h}" rx="28" />
    <rect class="bs-capsule" x="${CAPSULE.x}" y="${CAPSULE.y}" width="${CAPSULE.w}" height="${CAPSULE.h}" rx="22" />
    <text class="bs-service" x="${SERVICE_TEXT.x}" y="${SERVICE_TEXT.y}">service</text>
    <rect class="bs-hand" x="${HAND.x}" y="${HAND.y}" width="${HAND.w}" height="${HAND.h}" rx="9" />
    <g class="bs-lease">
      <path class="bs-lease-shackle" d="M ${LOCK.x + 11} ${LOCK.y} L ${LOCK.x + 11} ${LOCK.y - 12} A 11 11 0 0 1 ${LOCK.x + 33} ${LOCK.y - 12} L ${LOCK.x + 33} ${LOCK.y}" />
      <rect class="bs-lease-body" x="${LOCK.x}" y="${LOCK.y}" width="${LOCK.w}" height="${LOCK.h}" rx="8" />
    </g>
    <circle class="bs-loop" cx="${LOOP.cx}" cy="${LOOP.cy}" r="${LOOP.r}" />

    <circle class="bs-socket" cx="${LAMP.cx}" cy="${LAMP.cy}" r="${LAMP.r}" />
    ${lampGlyphs}

    ${lifeWords}

    ${Array.from({ length: QUEUE_SLOTS }, (_value, n) => slot(n + 1)).join(pad(4))}

    ${queueReadout}`,
  })}

  ${serviceBox({
    x: JOBS.x,
    width: JOBS.w,
    y: JOBS.y,
    height: JOBS.h,
    title: 'Jobs',
    titleX: JOBS_TITLE.x,
    titleY: JOBS_TITLE.y,
    titleAnchor: null,
    className: 'scene-service bs-jobs',
    children: `
    ${Array.from({ length: MAX_DONE }, (_value, n) => doneMark(n + 1)).join(pad(4))}

    ${doneReadout}

    <g class="bs-twice">
      <circle class="bs-twice-lamp" cx="${TWICE.cx}" cy="${TWICE.cy}" r="${TWICE.r}" />
      <text class="bs-twice-text" x="${TWICE.textX}" y="${TWICE.textY}">twice</text>
    </g>`,
  })}

  ${requestsLayer()}
</svg>`;
