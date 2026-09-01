/**
 * Static stage markup for the Cross-site Scripting scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Three bands, read top to bottom as
 * the people who write and read, the application that keeps and serves what they
 * wrote, and the browser the answer finally lands in:
 *   - y 0..440       kept empty for the step title card
 *   - y 440..680     Users (x 130..950): the author's capsule with the comment
 *                    being written in it, three reader capsules, and the running
 *                    `ok n` readout of pages served without anything executing
 *   - y 880..1270    App (x 130..950): the `store` card holding the one comment
 *                    this scene follows, exactly as it was written; the `render`
 *                    pipe the value leaves through, drawn as an open channel or
 *                    as a channel with a comb across it; the `encode` word beside
 *                    it; the panel on the right, which is the three output
 *                    contexts in the third step and the `raw` door in the fourth
 *   - y 1500..1740   Browser (x 280..800): the `page` card with the policy net
 *                    above its display area, and beside it the `run` lamp and the
 *                    `cookie` leak that only ever light together
 *
 * Two lane segments and no others, both axis aligned and both ending on a box
 * edge:
 *   - `X_LANE` (540) between the Users band's bottom edge at 680 and the App
 *     band's top edge at 880: a comment being written, or a reader opening the
 *     page. Both travel downwards; nothing comes back up this column, because a
 *     page that came back is a state in the Browser rather than a packet.
 *   - `X_LANE` (540) between the App band's bottom edge at 1270 and the Browser
 *     band's top edge at 1500: what the render pipe let out.
 *
 * A traveller is a dot with a halo of r 26, so a lane sweeps a 52px band at
 * x 514..566. The upper segment sweeps y 654..906, so the Users band writes
 * nothing below y 624 in that column and the App band nothing above y 936 in it.
 * The lower segment sweeps y 1244..1526, so the App band writes nothing below
 * y 1214 in that column and the Browser band nothing above y 1556 in it — which
 * is why the render pipe stops at y 1216 and the `Browser` title sits left of the
 * corridor.
 *
 * Declared texture: the capsules and the faces inside them, the store card and
 * the comment held in it, the render pipe with its comb and the value passing
 * through, the three context rows and their seals, the raw door and its seam, the
 * page card with its policy net and its display, the run lamp and the cookie
 * leak. Everything else on the stage is a word, and every word is one of the
 * twelve fixed labels or a number.
 *
 * Nothing that carries the argument is told apart by colour alone. The comment
 * that carries a script is a **jagged ribbon**; an ordinary one is a **rounded
 * plate**. The render pipe is **two rails with an open gap** when nothing is
 * encoded and **the same rails with a comb of teeth across them** when something
 * is. A page that executed is **the jagged ribbon, filled, under a lit lamp**; a
 * page that displayed is **a row of even letter bars**; a page whose script was
 * refused is **the jagged ribbon, hollow, with a hatch drawn through it**. A seal
 * is **a dashed empty box** while a context is unsealed, **a solid box carrying
 * that context's own glyph** once it is, and **a solid box carrying the wrong
 * glyph with a tear through it** where the wrong rules were applied. The raw door
 * is **two leaves meeting on a locked bar**, and the attempt that hits it is **a
 * burst on the seam**.
 *
 * No script text is drawn anywhere on this stage, in any state. The comment that
 * carries one is a shape, because a shape is all the reader needs and all the
 * scene is willing to say.
 *
 * Every value the reader can read is a stack of elements on one spot with a base
 * rule hiding all of them and the current `data-*` revealing exactly one, so
 * nothing is interpolated and scrubbing backwards lands on the value rather than
 * on an average of two: the `ok n` readout, the draft chip, the stored comment,
 * the pipe body, the value held in the pipe, the page display, the three seals,
 * the raw seam, and each reader's face. There is no continuous quantity on this
 * stage at all.
 */

import { VIEWBOX, clientBox, counterVariants, requestsLayer, serviceBox, verticalLink } from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- geometry ---------------------------------------------------------------

/** The one column anything travels on, and the four edges it runs between. */
export const X_LANE = 540;
export const Y_USERS_BOTTOM = 680;
export const Y_APP_TOP = 880;
export const Y_APP_BOTTOM = 1270;
export const Y_BROWSER_TOP = 1500;

/** The Users band: who wrote the comment, who is reading, and how it went. */
const USERS = { x: 130, y: 440, w: 820, h: 240 };
const USERS_TITLE = { x: 152, y: 506 };
const OK_TEXT = { x: 920, y: 506 };
const AUTHOR = { x: 170, y: 548, w: 240, h: 88, rx: 26 };
const DRAFT = { x: 196, y: 566, w: 188, h: 52 };
/** Left edge of each reader capsule, in reading order. */
const READER_XS = [618, 726, 834] as const;
const READER = { y: 548, w: 88, h: 88, rx: 26 };

/** The App band: what is kept, what leaves, and the rules the way out obeys. */
const APP = { x: 130, y: 880, w: 820, h: 390 };
const APP_TITLE = { x: 152, y: 940 };
const STORE_CARD = { x: 170, y: 968, w: 330, h: 134, rx: 22 };
const STORE_TEXT = { x: 196, y: 1004 };
const STORED = { x: 206, y: 1030, w: 264, h: 56 };

/** The render pipe, centred on the lane the value leaves by. */
const PIPE = { x: 320, y: 1136, w: 440, h: 80, rx: 18 };
const RENDER_TEXT = { x: 296, y: 1184 };
const ENCODE_TEXT = { x: 790, y: 1184 };
const COMB = { x: 360, y: 1146, w: 110, h: 60, teeth: 6 };
const HELD = { x: 520, y: 1152, w: 80, h: 48 };

/** The three output contexts, one row each, and the seal at the end of a row. */
const CTX_X = 590;
const CTX_W = 220;
const CTX_H = 44;
const CTX_YS = { body: 962, attr: 1018, url: 1074 } as const;
const SEAL = { x: 826, w: 72 };

/** The raw-output door, which shares its ground with the context rows. */
const DOOR = { x: 660, y: 980, w: 240, h: 120, rx: 16 };
const RAW_TEXT = { x: 640, y: 1050 };

/** The Browser band: what the page showed, and what it ran. */
const BROWSER = { x: 280, y: 1500, w: 520, h: 240 };
const BROWSER_TITLE = { x: 300, y: 1560 };
const PAGE_CARD = { x: 300, y: 1590, w: 300, h: 126, rx: 20 };
const PAGE_TEXT = { x: 322, y: 1626 };
const TEXT_WORD = { x: 578, y: 1626 };
const NET = { x: 314, y: 1650, w: 272, h: 18 };
const DISPLAY = { x: 322, y: 1680, w: 256, h: 26 };
const RUN_LAMP = { cx: 630, cy: 1612, r: 20, ringR: 30 };
const RUN_TEXT = { x: 676, y: 1624 };
const COOKIE_MARK = { cx: 630, cy: 1688, r: 20 };
const COOKIE_TEXT = { x: 676, y: 1700 };

// --- what the stage can say about itself ------------------------------------

/** How many readers the page has. Each one is a capsule with its own face. */
export const READERS = READER_XS.length;

/** The highest the `ok n` readout ever counts to, so the stack is written once. */
export const OK_MAX = 4;

/**
 * The shape of a comment. `spiky` is one carrying markup that a browser would
 * take for code; `plain` is an ordinary one. The scene never spells either of
 * them out — the difference is a silhouette, and that is deliberate.
 */
export const SHAPES = ['spiky', 'plain'] as const;
export type Shape = (typeof SHAPES)[number];

/** What the author's capsule is holding. `none` is a capsule nobody is typing in. */
export const DRAFT_STATES = ['none', ...SHAPES] as const;
export type DraftState = (typeof DRAFT_STATES)[number];

/** Whether the store is holding the comment this scene follows. */
export const STORE_STATES = ['none', 'held'] as const;
export type StoreState = (typeof STORE_STATES)[number];

/**
 * What the way out does to a value. `plain` is an open channel that hands the
 * markup on untouched; `encode` is the same channel with a comb across it. The
 * two are drawn on one spot, so the change reads as a change of shape.
 */
export const MODES = ['plain', 'encode'] as const;
export type Mode = (typeof MODES)[number];

/** What is sitting in the pipe right now, drawn in the two comment shapes. */
export const HOLD_STATES = ['none', ...SHAPES] as const;
export type HoldState = (typeof HOLD_STATES)[number];

/**
 * What the page is showing. `script` is markup the browser took for code,
 * `text` is the same characters shown as letters, and `held` is markup that
 * reached the page and was refused by the policy net.
 */
export const PAGE_STATES = ['blank', 'script', 'text', 'held'] as const;
export type PageState = (typeof PAGE_STATES)[number];

/**
 * A seal on one output context. `open` is a context nothing has been escaped
 * for; `sealed` is one escaped by its own rules; `wrong` is one escaped by
 * somebody else's, which is a seal that is present and does not hold.
 */
export const SEAL_STATES = ['open', 'sealed', 'wrong'] as const;
export type SealState = (typeof SEAL_STATES)[number];

/** The raw-output door: absent, shut, or shut with something hitting it. */
export const RAW_STATES = ['off', 'shut', 'hit'] as const;
export type RawState = (typeof RAW_STATES)[number];

/** A reader: not looking, looking, or looking at a page that ran a script. */
export const FACE_STATES = ['idle', 'view', 'hit'] as const;
export type FaceState = (typeof FACE_STATES)[number];

/** A word the stage can say about itself, which is either said or not. */
export const FLAGS = ['off', 'on'] as const;
export type Flag = (typeof FLAGS)[number];

/** What the scene is holding up for a moment, drawn on the band it is about. */
export const MARKS = ['none', 'become', 'victim', 'output', 'edge', 'where'] as const;
export type Mark = (typeof MARKS)[number];

/**
 * What every `data-*` on the stage starts at. The markup below is written from
 * these, so the opening frame is the whole diagram in its starting state — an
 * author who has typed nothing, an empty store, a way out that encodes nothing,
 * no context rules and no door, a blank page with no net over it, and nothing in
 * flight — and the timeline never restates a value already there.
 */
export const STAGE_STATE: Record<string, string> = {
  'data-xss-ghost': 'off',
  'data-xss-draft': 'none',
  'data-xss-store': 'none',
  'data-xss-mode': 'plain',
  'data-xss-encode': 'off',
  'data-xss-hold': 'none',
  'data-xss-ctx': 'off',
  'data-xss-body': 'open',
  'data-xss-attr': 'open',
  'data-xss-url': 'open',
  'data-xss-raw': 'off',
  'data-xss-page': 'blank',
  'data-xss-run': 'off',
  'data-xss-cookie': 'off',
  'data-xss-net': 'off',
  'data-xss-ok': '0',
  'data-xss-mark': 'none',
  'data-xss-settled': 'off',
};

/** What each reader's capsule starts at, written on the capsule itself. */
export const FACE_ATTR = 'data-xss-face';
export const FACE_INITIAL: FaceState = 'idle';

// --- drawing ----------------------------------------------------------------

/** Newline plus `n` spaces, the separator between lines of one fragment. */
const pad = (n: number): string => `\n${' '.repeat(n)}`;

/** Non-breaking spaces, so a monospaced readout keeps its gaps in SVG. */
const mono = (text: string): string => text.replace(/ /g, '&#160;');

const fixed2 = (value: number): string => Number(value.toFixed(2)).toString();

/**
 * A jagged ribbon across a box: a zigzag along the top edge and the mirror of it
 * along the bottom, so the silhouette is teeth rather than a rounded plate. This
 * is the whole of what the scene ever says about a comment that carries markup.
 */
function spikyPoints(x: number, y: number, w: number, h: number, teeth: number): string {
  const mid = y + h / 2;
  const step = w / (teeth * 2);
  const top: string[] = [];
  const bottom: string[] = [];
  for (let i = 0; i <= teeth * 2; i += 1) {
    const px = x + step * i;
    top.push(`${fixed2(px)},${fixed2(i % 2 === 0 ? mid : y)}`);
    if (i > 0 && i < teeth * 2) bottom.push(`${fixed2(px)},${fixed2(i % 2 === 0 ? mid : y + h)}`);
  }
  return [...top, ...bottom.reverse()].join(' ');
}

/**
 * A star centred on the origin. It is the silhouette a comment carrying markup
 * travels as, built here so the chip and the traveller are one definition.
 */
function starPoints(outer: number, inner: number, points: number): string {
  const out: string[] = [];
  for (let i = 0; i < points * 2; i += 1) {
    const r = i % 2 === 0 ? outer : inner;
    const angle = (Math.PI / points) * i - Math.PI / 2;
    out.push(`${fixed2(Math.cos(angle) * r)},${fixed2(Math.sin(angle) * r)}`);
  }
  return out.join(' ');
}

/** The silhouette a comment carrying markup carries down the lane. */
export const SPIKE_POINTS = starPoints(19, 8.5, 8);

/** The burst drawn where something ran into something that would not move. */
const BURST_POINTS = starPoints(22, 9, 7);

/** One row of the comb the encoder puts across the way out. */
function combTeeth(box: { x: number; y: number; w: number; h: number; teeth: number }): string {
  const step = box.w / (box.teeth - 1);
  const parts: string[] = [];
  for (let i = 0; i < box.teeth; i += 1) {
    const px = fixed2(box.x + step * i);
    parts.push(`M ${px} ${box.y} L ${px} ${box.y + box.h}`);
  }
  return parts.join(' ');
}

/** A pair of crossing zigzags: a net, drawn as a net rather than as a colour. */
function netPolylines(x: number, y: number, w: number, h: number, cells: number): [string, string] {
  const step = w / cells;
  const up: string[] = [];
  const down: string[] = [];
  for (let i = 0; i <= cells; i += 1) {
    const px = fixed2(x + step * i);
    up.push(`${px},${fixed2(i % 2 === 0 ? y + h : y)}`);
    down.push(`${px},${fixed2(i % 2 === 0 ? y : y + h)}`);
  }
  return [up.join(' '), down.join(' ')];
}

/** Diagonal strokes drawn through something that was stopped. */
function hatchPath(x: number, y: number, w: number, h: number, gap: number): string {
  const parts: string[] = [];
  for (let px = x; px <= x + w - h; px += gap) {
    parts.push(`M ${fixed2(px)} ${fixed2(y + h)} L ${fixed2(px + h)} ${fixed2(y)}`);
  }
  return parts.join(' ');
}

/** The row of even bars a page shows when markup arrived as letters. */
function letterBars(x: number, y: number, w: number, h: number): string {
  const widths = [10, 6, 12, 8, 14, 6, 10, 12, 7, 11, 9, 13, 6, 10];
  const bars: string[] = [];
  let px = x + 4;
  for (const bw of widths) {
    if (px + bw > x + w - 4) break;
    bars.push(`<rect class="xss-letter" x="${px}" y="${y}" width="${bw}" height="${h}" rx="3" />`);
    px += bw + 6;
  }
  return bars.join('');
}

/** The two comment shapes drawn on one spot: a ribbon of teeth, and a plate. */
const shapeStack = (className: string, box: { x: number; y: number; w: number; h: number }, teeth: number, indent: number): string =>
  [
    `<polygon class="${className} ${className}--spiky" points="${spikyPoints(box.x, box.y, box.w, box.h, teeth)}" />`,
    `<rect class="${className} ${className}--plain" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="${box.h / 2}" />`,
  ].join(pad(indent));

/**
 * One output context: the silhouette of the place a value lands in, and the seal
 * at the end of the row saying whether it was escaped for that place. The three
 * silhouettes and the three seal glyphs differ from one another, because the
 * whole argument of the step is that these are not the same job.
 */
function contextRow(name: 'body' | 'attr' | 'url', y: number, glyph: number, indent: number): string {
  const inner = ' '.repeat(indent + 2);
  const mid = y + CTX_H / 2;
  const shapes: string[] = [];
  if (name === 'body') {
    // A paragraph: markup that lands between tags is a run of lines.
    for (let i = 0; i < 3; i += 1) {
      const w = [CTX_W - 20, CTX_W - 62, CTX_W - 108][i] ?? CTX_W;
      shapes.push(`<rect class="xss-ctx-line" x="${CTX_X}" y="${y + 6 + i * 13}" width="${w}" height="7" rx="3" />`);
    }
  } else if (name === 'attr') {
    // A quoted slot: two brackets, and above them the pair of quote marks the
    // step is about, because an attribute is only closed while they are there.
    shapes.push(`<path class="xss-ctx-bracket" d="M ${CTX_X + 22} ${y + 8} L ${CTX_X} ${y + 8} L ${CTX_X} ${y + CTX_H - 8} L ${CTX_X + 22} ${y + CTX_H - 8}" />`);
    shapes.push(`<path class="xss-ctx-bracket" d="M ${CTX_X + CTX_W - 22} ${y + 8} L ${CTX_X + CTX_W} ${y + 8} L ${CTX_X + CTX_W} ${y + CTX_H - 8} L ${CTX_X + CTX_W - 22} ${y + CTX_H - 8}" />`);
    shapes.push(`<rect class="xss-ctx-slot" x="${CTX_X + 40}" y="${mid - 7}" width="${CTX_W - 80}" height="14" rx="7" />`);
    shapes.push(`<path class="xss-ctx-quote" d="M ${CTX_X + 34} ${y + 9} L ${CTX_X + 34} ${y + 21} M ${CTX_X + CTX_W - 34} ${y + 9} L ${CTX_X + CTX_W - 34} ${y + 21}" />`);
  } else {
    // A path: segments with separators between them, which is a fourth grammar.
    for (let i = 0; i < 3; i += 1) {
      shapes.push(`<rect class="xss-ctx-seg" x="${CTX_X + i * 76}" y="${mid - 9}" width="58" height="18" rx="6" />`);
    }
    shapes.push(`<path class="xss-ctx-slash" d="M ${CTX_X + 64} ${mid + 12} L ${CTX_X + 72} ${mid - 12} M ${CTX_X + 140} ${mid + 12} L ${CTX_X + 148} ${mid - 12}" />`);
  }

  // The seal. `open` is a dashed empty box; `sealed` carries this context's own
  // glyph; the attribute row also carries the seal that was made for somewhere
  // else, with the tear that says it did not hold.
  const glyphMarks = (count: number, cls: string): string => {
    const marks: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const gx = SEAL.x + SEAL.w / 2 + (i - (count - 1) / 2) * 16;
      marks.push(
        count === 3
          ? `<circle class="${cls}" cx="${fixed2(gx)}" cy="${mid}" r="5" />`
          : `<rect class="${cls}" x="${fixed2(gx - 3.5)}" y="${mid - 12}" width="7" height="24" rx="3" />`,
      );
    }
    return marks.join('');
  };

  const seals = [
    `<rect class="xss-seal xss-seal--open" x="${SEAL.x}" y="${y}" width="${SEAL.w}" height="${CTX_H}" rx="10" />`,
    `<g class="xss-seal xss-seal--sealed">`,
    `${inner}<rect class="xss-seal-box" x="${SEAL.x}" y="${y}" width="${SEAL.w}" height="${CTX_H}" rx="10" />${glyphMarks(glyph, 'xss-seal-glyph')}`,
    `${' '.repeat(indent)}</g>`,
  ];
  if (name === 'attr') {
    seals.push(
      `<g class="xss-seal xss-seal--wrong">`,
      `${inner}<rect class="xss-seal-box xss-seal-box--wrong" x="${SEAL.x}" y="${y}" width="${SEAL.w}" height="${CTX_H}" rx="10" />${glyphMarks(1, 'xss-seal-glyph xss-seal-glyph--wrong')}`,
      `${inner}<polyline class="xss-seal-tear" points="${SEAL.x + 8},${mid + 16} ${SEAL.x + 26},${mid - 4} ${SEAL.x + 44},${mid + 8} ${SEAL.x + 64},${mid - 16}" />`,
      `${' '.repeat(indent)}</g>`,
    );
  }

  return [`<g class="xss-ctx xss-ctx--${name}">`, `${inner}${shapes.join(pad(indent + 2))}`, `${inner}${seals.join(pad(indent + 2))}`, `${' '.repeat(indent)}</g>`].join(pad(indent));
}

// --- markup -----------------------------------------------------------------

/** How many pages have been served with nothing executing in them. */
const okReadout = counterVariants({
  x: OK_TEXT.x,
  y: OK_TEXT.y,
  className: 'xss-ok',
  max: OK_MAX,
  format: (n) => mono(`ok ${n}`),
  anchor: 'end',
  indent: 4,
});

/** One capsule per reader, each carrying its own face. */
const readers = READER_XS.map((x, index) => {
  const face = { x: x + 18, y: READER.y + 24, w: READER.w - 36, h: READER.h - 48 };
  return [
    `<g class="xss-reader xss-reader--${index}" ${FACE_ATTR}="${FACE_INITIAL}">`,
    `      <rect class="xss-capsule" x="${x}" y="${READER.y}" width="${READER.w}" height="${READER.h}" rx="${READER.rx}" />`,
    `      <rect class="xss-face xss-face--idle" x="${face.x}" y="${face.y}" width="${face.w}" height="${face.h}" rx="${face.h / 2}" />`,
    `      <rect class="xss-face xss-face--view" x="${face.x}" y="${face.y}" width="${face.w}" height="${face.h}" rx="${face.h / 2}" />`,
    `      <g class="xss-face xss-face--hit">`,
    `        <rect class="xss-face-plate" x="${face.x}" y="${face.y}" width="${face.w}" height="${face.h}" rx="${face.h / 2}" />`,
    `        <polygon class="xss-face-burst" points="${BURST_POINTS}" transform="translate(${x + READER.w / 2} ${READER.y + READER.h / 2})" />`,
    `      </g>`,
    `    </g>`,
  ].join('\n');
}).join('\n    ');

const netLines = netPolylines(NET.x, NET.y, NET.w, NET.h, 16);

const stageAttrs = Object.entries(STAGE_STATE)
  .map(([name, value]) => `${name}="${value}"`)
  .join(' ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageAttrs} aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_LANE, Y_USERS_BOTTOM, Y_APP_TOP, 'scene-link xss-lane xss-lane--in')}
  ${verticalLink(X_LANE, Y_APP_BOTTOM, Y_BROWSER_TOP, 'scene-link xss-lane xss-lane--out')}

  ${clientBox({
    x: USERS.x,
    width: USERS.w,
    y: USERS.y,
    height: USERS.h,
    title: 'Users',
    titleX: USERS_TITLE.x,
    titleY: USERS_TITLE.y,
    titleAnchor: null,
    extraClass: 'xss-users',
    children: `
    ${okReadout}

    <rect class="xss-capsule" x="${AUTHOR.x}" y="${AUTHOR.y}" width="${AUTHOR.w}" height="${AUTHOR.h}" rx="${AUTHOR.rx}" />
    ${shapeStack('xss-draft', DRAFT, 4, 4)}

    ${readers}`,
  })}

  ${serviceBox({
    x: APP.x,
    width: APP.w,
    y: APP.y,
    height: APP.h,
    title: 'App',
    titleX: APP_TITLE.x,
    titleY: APP_TITLE.y,
    titleAnchor: null,
    className: 'scene-node xss-app',
    children: `
    <rect class="xss-card xss-store-card" x="${STORE_CARD.x}" y="${STORE_CARD.y}" width="${STORE_CARD.w}" height="${STORE_CARD.h}" rx="${STORE_CARD.rx}" />
    <text class="xss-store-text" x="${STORE_TEXT.x}" y="${STORE_TEXT.y}">store</text>
    <polygon class="xss-stored" points="${spikyPoints(STORED.x, STORED.y, STORED.w, STORED.h, 5)}" />

    <path class="xss-pipe xss-pipe--plain" d="M ${PIPE.x} ${PIPE.y} H ${PIPE.x + PIPE.w} M ${PIPE.x} ${PIPE.y + PIPE.h} H ${PIPE.x + PIPE.w}" />
    <path class="xss-pipe xss-pipe--encode" d="M ${PIPE.x} ${PIPE.y} H ${PIPE.x + PIPE.w} M ${PIPE.x} ${PIPE.y + PIPE.h} H ${PIPE.x + PIPE.w}" />
    <path class="xss-comb" d="${combTeeth(COMB)}" />
    ${shapeStack('xss-hold', HELD, 3, 4)}
    <text class="xss-render-text" x="${RENDER_TEXT.x}" y="${RENDER_TEXT.y}" text-anchor="end">render</text>
    <text class="xss-encode-text" x="${ENCODE_TEXT.x}" y="${ENCODE_TEXT.y}">encode</text>

    <g class="xss-contexts">
      ${contextRow('body', CTX_YS.body, 1, 6)}
      ${contextRow('attr', CTX_YS.attr, 2, 6)}
      ${contextRow('url', CTX_YS.url, 3, 6)}
    </g>

    <g class="xss-rawdoor">
      <rect class="xss-door" x="${DOOR.x}" y="${DOOR.y}" width="${DOOR.w}" height="${DOOR.h}" rx="${DOOR.rx}" />
      <rect class="xss-leaf" x="${DOOR.x + 12}" y="${DOOR.y + 12}" width="${DOOR.w / 2 - 16}" height="${DOOR.h - 24}" rx="8" />
      <rect class="xss-leaf" x="${DOOR.x + DOOR.w / 2 + 4}" y="${DOOR.y + 12}" width="${DOOR.w / 2 - 16}" height="${DOOR.h - 24}" rx="8" />
      <rect class="xss-seam xss-seam--shut" x="${DOOR.x + 40}" y="${DOOR.y + DOOR.h / 2 - 9}" width="${DOOR.w - 80}" height="18" rx="9" />
      <polygon class="xss-seam xss-seam--hit" points="${BURST_POINTS}" transform="translate(${DOOR.x + DOOR.w / 2} ${DOOR.y + DOOR.h / 2})" />
      <text class="xss-raw-text" x="${RAW_TEXT.x}" y="${RAW_TEXT.y}" text-anchor="end">raw</text>
    </g>`,
  })}

  ${serviceBox({
    x: BROWSER.x,
    width: BROWSER.w,
    y: BROWSER.y,
    height: BROWSER.h,
    title: 'Browser',
    titleX: BROWSER_TITLE.x,
    titleY: BROWSER_TITLE.y,
    titleAnchor: null,
    className: 'scene-service xss-browser',
    children: `
    <rect class="xss-card" x="${PAGE_CARD.x}" y="${PAGE_CARD.y}" width="${PAGE_CARD.w}" height="${PAGE_CARD.h}" rx="${PAGE_CARD.rx}" />
    <text class="xss-page-text" x="${PAGE_TEXT.x}" y="${PAGE_TEXT.y}">page</text>
    <text class="xss-text-word" x="${TEXT_WORD.x}" y="${TEXT_WORD.y}" text-anchor="end">text</text>

    <g class="xss-net">
      <polyline class="xss-net-line" points="${netLines[0]}" />
      <polyline class="xss-net-line" points="${netLines[1]}" />
    </g>

    <polygon class="xss-display xss-display--script" points="${spikyPoints(DISPLAY.x, DISPLAY.y, DISPLAY.w, DISPLAY.h, 6)}" />
    <g class="xss-display xss-display--text">${letterBars(DISPLAY.x, DISPLAY.y, DISPLAY.w, DISPLAY.h)}</g>
    <g class="xss-display xss-display--held">
      <polygon class="xss-held-shape" points="${spikyPoints(DISPLAY.x, DISPLAY.y, DISPLAY.w, DISPLAY.h, 6)}" />
      <path class="xss-held-hatch" d="${hatchPath(DISPLAY.x, DISPLAY.y, DISPLAY.w, DISPLAY.h, 22)}" />
    </g>

    <g class="xss-run">
      <circle class="xss-run-ring" cx="${RUN_LAMP.cx}" cy="${RUN_LAMP.cy}" r="${RUN_LAMP.ringR}" />
      <circle class="xss-run-lamp" cx="${RUN_LAMP.cx}" cy="${RUN_LAMP.cy}" r="${RUN_LAMP.r}" />
      <text class="xss-run-text" x="${RUN_TEXT.x}" y="${RUN_TEXT.y}">run</text>
    </g>

    <g class="xss-cookie">
      <circle class="xss-cookie-disc" cx="${COOKIE_MARK.cx}" cy="${COOKIE_MARK.cy}" r="${COOKIE_MARK.r}" />
      <circle class="xss-cookie-chip" cx="${COOKIE_MARK.cx - 7}" cy="${COOKIE_MARK.cy - 5}" r="3.5" />
      <circle class="xss-cookie-chip" cx="${COOKIE_MARK.cx + 6}" cy="${COOKIE_MARK.cy + 4}" r="3.5" />
      <circle class="xss-cookie-chip" cx="${COOKIE_MARK.cx + 1}" cy="${COOKIE_MARK.cy - 9}" r="3.5" />
      <path class="xss-cookie-trail" d="M ${COOKIE_MARK.cx + 18} ${COOKIE_MARK.cy + 14} L ${COOKIE_MARK.cx - 16} ${COOKIE_MARK.cy + 26}" />
      <text class="xss-cookie-text" x="${COOKIE_TEXT.x}" y="${COOKIE_TEXT.y}">cookie</text>
    </g>`,
  })}

  ${requestsLayer()}
</svg>`;
