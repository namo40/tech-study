/**
 * Static stage markup for the Change Tracking scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. The bands are the usual ones, with
 * the node stretched and the bottom box extended because both of them hold a
 * table rather than a widget:
 *   - y 0..400      above the cropped viewBox (see shared VIEWBOX)
 *   - y 400..440    the frame's top padding; nothing is drawn here
 *   - y 440..680    Code: four rows of a snippet and the cursor on the one the
 *                   reader is on
 *   - y 820..1330   DbContext: the lifetime it was given, the memory it is
 *                   holding, how many entities it is tracking, and the tracker
 *                   itself — four rows of entity, state, values and snapshot,
 *                   swapped for ten rows of texture when a bulk query fills it
 *   - y 1500..1840  Database: the statements SaveChanges sent, the transaction
 *                   they were sent inside, and how many rows they affected
 *
 * Two lanes, and each one carries traffic in a single direction. `X_CALL` is
 * what the code hands down: the call into the context, the entity an `Update`
 * or an `Attach` brings with it, and the statements SaveChanges sends on to the
 * database. `X_ROW` is what comes back up: an entity a query materialised. A
 * request and a response therefore never share a lane, and two travellers never
 * occupy the same point.
 *
 * Both lanes are vertical for their whole length and every segment drawn
 * between two boxes ends on a box edge. Nothing in any box is written right of
 * `CONTENT_RIGHT`, which is 34px clear of the left lane's halo, so a traveller
 * can cross a box from top to bottom without ever coming near a label. That is
 * why the tracker is 594px wide rather than the full 820: the corridor
 * x 784..932 belongs to the lanes for the whole height of the stage.
 *
 * The bulk rows are row texture rather than a table: no row carries a name, and
 * the pitch is set by how many have to be seen at once rather than by what a
 * label needs. Ten of them stand for a thousand tracked entities, which is the
 * same sampling the chip stream uses — one chip, one texture row, one hundred
 * rows of the result.
 */

import {
  VIEWBOX,
  clientBox,
  counterVariants,
  nodeFrame,
  requestsLayer,
  serviceBox,
  trackAndFill,
  verticalLink,
} from '../shared/stage';

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

// --- lanes -----------------------------------------------------------------

/** The lane the code hands work down, and the lane a materialised entity rides up. */
export const X_CALL = 810;
export const X_ROW = 906;

/** Where a traveller starts and stops on each lane. */
export const Y_CODE_OUT = 640;
export const Y_CODE_IN = 620;
export const Y_CTX = 1300;
export const Y_DB = 1560;

/** Pixels per second. One speed for everything, so distance reads as time. */
export const SPEED = 2000;

/** Nothing inside a box is written right of this, which keeps the lanes clear. */
const CONTENT_RIGHT = 750;

// --- the Code box ----------------------------------------------------------

const CODE_Y = 440;
const CODE_H = 240;
/** Top of each cursor row; the row's text sits on `top + 23`. */
export const CURSOR_TOP = [494, 538, 582, 626];
const CURSOR_H = 32;
const CURSOR_X = 148;
const CURSOR_W = 600;
const CODE_X = 164;

// --- the DbContext node ----------------------------------------------------

const NODE_Y = 820;
const NODE_H = 510;

/** The memory meter, which is read off how many entities are tracked. */
export const METER_X = 270;
export const METER_W = 200;
const METER_Y = 908;
const METER_H = 24;

/** Columns of the tracker, and the baseline its headers sit on. */
const COL_ENTITY = 156;
const COL_STATE = 300;
const COL_VALUE = 440;
const COL_TOTAL = 546;
const COL_SNAP = 600;
const HEADER_Y = 984;

/** The four rows the tracker names. Four is the most any step holds at once. */
export const ROW_COUNT = 4;
const ROW_TOP = 1010;
const ROW_PITCH = 56;
const ROW_H = 44;
const rowTop = (index: number): number => ROW_TOP + index * ROW_PITCH;

/**
 * The ten rows a bulk query stacks, one per hundred entities it materialised.
 * They are row texture rather than a table: no row carries a name, and the
 * pitch is set by how many have to be seen at once rather than by a label.
 */
export const BULK_COUNT = 10;
const BULK_TOP = 1010;
const BULK_PITCH = 21;
const BULK_H = 16;

/** One chip of the sampled stream, and the rows of the result it stands for. */
export const ROWS_PER_CHIP = 100;
/** How large a bulk result is, which is what the counter and the meter read. */
export const BULK_ROWS = BULK_COUNT * ROWS_PER_CHIP;

/** The row of flashes under the tracker. */
const FLASH_Y = 1268;

// --- the Database box ------------------------------------------------------

const DB_Y = 1500;
const DB_H = 340;

/** The frame that says these statements went inside one transaction. */
const TX_X = 150;
const TX_W = 600;
const TX_Y = 1602;
const TX_H = 128;

/** Baseline of each statement slot, and how many slots there are. */
export const SQL_COUNT = 3;
const SQL_BASELINE = [1636, 1678, 1720];
const SQL_X = 180;

const AFFECTED_Y = 1780;
const EXCEPTION_Y = 1822;

// --- what the tracker can say ----------------------------------------------

/** Every entity name a row can carry. */
export const ENTITY_NAMES = ['Order #12', 'Line #1', 'Line #2', 'Line #3', 'Line #4'] as const;
export type EntityName = (typeof ENTITY_NAMES)[number];

/** Every state a tracked row can be in, spelled the way EF Core spells it. */
export const ROW_STATES = ['Unchanged', 'Modified', 'Added', 'Deleted'] as const;
export type RowState = (typeof ROW_STATES)[number];

/** The first value column: an order's status, or a line's product. */
export const VALUE_TEXTS = [
  'New',
  'Paid',
  'Shipped',
  'Sent',
  'sku A',
  'sku B',
  'sku C',
  'sku D',
] as const;

/** The second value column: an order's total, or a line's quantity. */
export const TOTAL_TEXTS = ['40', '90', '1', '2'] as const;

/** Every snapshot a row can hold, plus the absence of one. */
export const SNAP_TEXTS = [
  '{New 40}',
  '{Paid 40}',
  '{Shipped 40}',
  '{Sent 40}',
  '{sku A 1}',
  '{sku B 1}',
  '{sku C 2}',
  '{sku D 2}',
  'none',
] as const;

/** The statements the database can be sent, written the way EF Core writes them. */
export const SQL_TEXTS = [
  'SELECT * FROM orders WHERE id = 12',
  'UPDATE orders SET status=@p0 WHERE id = 12',
  'INSERT INTO lines (sku, qty) VALUES (@p0,@p1)',
  'DELETE FROM lines WHERE id = 2',
  'DELETE FROM lines WHERE id = 1',
  'SELECT * FROM orders WHERE total > 20',
  'UPDATE orders SET status=@p0, total=@p1',
  '  WHERE id = 12',
  '  WHERE id = 12 AND rowversion = 0x1A',
  'UPDATE orders SET status=@p0',
] as const;

/**
 * Every number the tracked counter can show. The small values are the named
 * rows; the rest are the sampled bulk stream, one step per chip.
 */
export const TRACKED_VALUES: number[] = [
  0,
  1,
  2,
  3,
  4,
  5,
  ...Array.from({ length: BULK_COUNT }, (_value, index) => (index + 1) * ROWS_PER_CHIP),
];

/** Index of a tracked count, which is what the timeline writes. */
export const trackedIndex = (count: number): number => {
  const at = TRACKED_VALUES.indexOf(count);
  return at >= 0 ? at : TRACKED_VALUES.length - 1;
};

/**
 * The share of the context's budget a tracked entity costs. A snapshot per
 * entity is what the meter measures, so the width is read off the count rather
 * than written down: an empty context still holds itself.
 */
export const MEMORY_BASE = 10;
export const MEMORY_FULL = 70;
export const memoryPercent = (tracked: number): number =>
  MEMORY_BASE + (MEMORY_FULL - MEMORY_BASE) * Math.min(tracked / BULK_ROWS, 1);
export const memoryWidth = (tracked: number): number =>
  Number(((METER_W * memoryPercent(tracked)) / 100).toFixed(2));

/** Thousands separators, so a four figure count reads as one. */
export const fmt = (value: number): string =>
  value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// --- the snippets ----------------------------------------------------------

/** What one row of a snippet does when the cursor reaches it. */
export type LineKind =
  | 'plain'
  | 'query'
  | 'assign'
  | 'add'
  | 'remove'
  | 'update'
  | 'attach'
  | 'mark'
  | 'save';

export interface CodeLine {
  text: string;
  kind: LineKind;
  /** Seconds the cursor rests on the row before it moves on. */
  cost: number;
  /** The entity the row acts on. */
  entity?: EntityName;
  /** The value an assignment writes, and the pair an attach brings with it. */
  value?: string;
  values?: [string, string];
  /** A query: how many rows come back, and whether the tracker sees them. */
  rows?: number;
  noTracking?: boolean;
  /** Index into `SQL_TEXTS` of the statement a query sends. */
  sql?: number;
}

export interface CodePlan {
  id: string;
  lines: CodeLine[];
}

const line = (
  text: string,
  kind: LineKind,
  cost: number,
  extra: Partial<CodeLine> = {},
): CodeLine => ({ text, kind, cost, ...extra });

/**
 * The eight snippets. Together with the instant each one is run and the costs
 * on its rows, they are the only thing this scene is told: every tracker row,
 * every statement and every counter falls out of walking them.
 */
export const PLANS: Record<string, CodePlan> = {
  s1: {
    id: 's1',
    lines: [
      line('var o = await db.Orders.FindAsync(12);', 'query', 1.2, {
        rows: 1,
        sql: 0,
        entity: 'Order #12',
        values: ['New', '40'],
      }),
      line('o.Status = "Paid";', 'assign', 1.2, { entity: 'Order #12', value: 'Paid' }),
      line('await db.SaveChangesAsync();', 'save', 1.4),
    ],
  },
  s2a: {
    id: 's2a',
    lines: [
      line('o.Status = "Shipped";', 'assign', 0.5, { entity: 'Order #12', value: 'Shipped' }),
      line('db.Lines.Add(newLine);', 'add', 0.5, {
        entity: 'Line #3',
        values: ['sku C', '2'],
      }),
      line('db.Lines.Remove(line2);', 'remove', 0.6, { entity: 'Line #2' }),
      line('await db.SaveChangesAsync();', 'save', 1.7),
    ],
  },
  s2b: {
    id: 's2b',
    lines: [
      line('o.Status = "Sent";', 'assign', 0.15, { entity: 'Order #12', value: 'Sent' }),
      line('db.Lines.Add(newLine4);', 'add', 0.15, {
        entity: 'Line #4',
        values: ['sku D', '2'],
      }),
      line('db.Lines.Remove(line1);', 'remove', 0.15, { entity: 'Line #1' }),
      line('await db.SaveChangesAsync();', 'save', 1.15),
    ],
  },
  s3: {
    id: 's3',
    lines: [
      line('var list = await db.Orders', 'plain', 0.04),
      line('    .Where(o => o.Total > 20)', 'plain', 0.04),
      line('    .ToListAsync();', 'query', 1.77, { rows: BULK_ROWS, sql: 5 }),
      line('await db.SaveChangesAsync();', 'save', 0.7),
    ],
  },
  s3n: {
    id: 's3n',
    lines: [
      line('var list = await db.Orders', 'plain', 0.03),
      line('    .AsNoTracking()', 'plain', 0.03),
      line('    .Where(o => o.Total > 20)', 'plain', 0.03),
      line('    .ToListAsync();', 'query', 1.6, { rows: BULK_ROWS, noTracking: true, sql: 5 }),
    ],
  },
  s4a: {
    id: 's4a',
    lines: [
      line('db.Update(orderFromClient);', 'update', 0.7, {
        entity: 'Order #12',
        values: ['Shipped', '40'],
      }),
      line('await db.SaveChangesAsync();', 'save', 0.9),
    ],
  },
  s4b: {
    id: 's4b',
    lines: [
      line('db.Attach(o);', 'attach', 0.4, {
        entity: 'Order #12',
        values: ['Shipped', '40'],
      }),
      line('db.Entry(o).Property(x => x.Status)', 'plain', 0.05),
      line('    .IsModified = true;', 'mark', 0.1, { entity: 'Order #12' }),
      line('await db.SaveChangesAsync();', 'save', 0.85),
    ],
  },
  s4c: {
    id: 's4c',
    lines: [
      line('o.Status = "Paid";', 'assign', 0.3, { entity: 'Order #12', value: 'Paid' }),
      line('await db.SaveChangesAsync();', 'save', 0.8),
    ],
  },
};

/** The snippet the stage ships showing, so the first frame is the whole diagram. */
export const FIRST_PLAN = 's1';

// --- what the stage starts in ---------------------------------------------

/**
 * What every `data-*` on the stage starts at, keyed by the target the timeline
 * addresses it through. The markup below is written from this, so a change that
 * writes a value something already holds is dropped rather than tweened.
 */
export const STAGE_STATE: Record<string, string> = {
  'stage@data-snippet': FIRST_PLAN,
  'stage@data-cursor': 'none',
  'stage@data-table': 'rows',
  'stage@data-tracked': '0',
  'stage@data-detect': 'off',
  'stage@data-bypass': 'off',
  'stage@data-allcols': 'off',
  'stage@data-rowversion': 'off',
  'stage@data-lifetime': 'off',
  'stage@data-leak': 'off',
  'stage@data-other': 'off',
  'stage@data-tx': 'off',
  'stage@data-affected': 'none',
  'stage@data-result': 'none',
  'stage@data-exception': 'off',
  ...Object.fromEntries(
    Array.from({ length: ROW_COUNT }, (_value, index) => [
      [`row-${index}@data-row`, 'empty'],
      [`row-${index}@data-name`, 'none'],
      [`row-${index}@data-value`, 'none'],
      [`row-${index}@data-total`, 'none'],
      [`row-${index}@data-snap`, 'none'],
      [`row-${index}@data-dirty`, 'none'],
      [`row-${index}@data-scan`, 'off'],
    ]).flat(),
  ),
  ...Object.fromEntries(
    Array.from({ length: BULK_COUNT }, (_value, index) => [
      [`bulk-${index}@data-bulk`, 'off'],
      [`bulk-${index}@data-scan`, 'off'],
    ]).flat(),
  ),
  ...Object.fromEntries(
    Array.from({ length: SQL_COUNT }, (_value, index) => [
      [`sql-${index}@data-stmt`, 'none'],
      [`sql-${index}@data-run`, 'off'],
    ]).flat(),
  ),
};

// --- markup ---------------------------------------------------------------

const stageState = Object.entries(STAGE_STATE)
  .filter(([key]) => key.startsWith('stage@'))
  .map(([key, value]) => `${key.slice('stage@'.length)}="${value}"`)
  .join(' ');

/** Spaces have to survive as glyphs, so a snippet keeps its indentation. */
const mono = (text: string): string => text.replace(/ /g, '&#160;');

/** Every row of every snippet, stacked on the four baselines. */
const codeRows = Object.values(PLANS)
  .flatMap((plan) =>
    plan.lines.map(
      (row, index) =>
        `<text class="scene-mono ct-code ct-code--${plan.id} ct-code-row--${index}" x="${CODE_X}" y="${(CURSOR_TOP[index] ?? 0) + 23}">${mono(row.text)}</text>`,
    ),
  )
  .join('\n      ');

const cursors = CURSOR_TOP.map(
  (top, index) =>
    `<rect class="ct-cursor ct-cursor--${index}" x="${CURSOR_X}" y="${top}" width="${CURSOR_W}" height="${CURSOR_H}" rx="12" />`,
).join('\n      ');

/** One row of the tracker: what it holds, how it stands, and what it remembers. */
const trackerRow = (index: number): string => {
  const top = rowTop(index);
  const baseline = top + 30;
  const names = ENTITY_NAMES.map(
    (name, slot) =>
      `<text class="scene-mono ct-name ct-name--${slot}" x="${COL_ENTITY}" y="${baseline}">${name}</text>`,
  ).join('\n        ');
  const states = ROW_STATES.map(
    (state) =>
      `<text class="scene-mono ct-state ct-state--${state.toLowerCase()}" x="${COL_STATE}" y="${baseline}">${state}</text>`,
  ).join('\n        ');
  const values = VALUE_TEXTS.map(
    (text, slot) =>
      `<text class="scene-mono ct-value ct-value--${slot}" x="${COL_VALUE}" y="${baseline}">${mono(text)}</text>`,
  ).join('\n        ');
  const totals = TOTAL_TEXTS.map(
    (text, slot) =>
      `<text class="scene-mono ct-total ct-total--${slot}" x="${COL_TOTAL}" y="${baseline}">${text}</text>`,
  ).join('\n        ');
  const snaps = SNAP_TEXTS.map(
    (text, slot) =>
      `<text class="scene-mono ct-snap ct-snap--${slot}" x="${COL_SNAP}" y="${baseline}">${mono(text)}</text>`,
  ).join('\n        ');
  return `<g class="ct-row ct-row--${index}" data-row="empty" data-name="none" data-value="none" data-total="none" data-snap="none" data-dirty="none" data-scan="off">
        <rect class="ct-row-bg" x="${COL_ENTITY - 16}" y="${top}" width="${CONTENT_RIGHT - COL_ENTITY + 16}" height="${ROW_H}" rx="14" />
        ${names}
        ${states}
        ${values}
        ${totals}
        ${snaps}
      </g>`;
};

/** One row of texture: a hundred entities the tracker is holding a snapshot of. */
const bulkRow = (index: number): string =>
  `<rect class="ct-bulk ct-bulk--${index}" data-bulk="off" data-scan="off" x="${COL_ENTITY - 16}" y="${BULK_TOP + index * BULK_PITCH}" width="${CONTENT_RIGHT - COL_ENTITY + 16}" height="${BULK_H}" rx="6" />`;

/** One statement slot, with every statement it could be holding stacked on it. */
const sqlSlot = (index: number): string => {
  const baseline = SQL_BASELINE[index] ?? 0;
  const texts = SQL_TEXTS.map(
    (text, slot) =>
      `<text class="scene-mono ct-sql ct-sql--${slot}" x="${SQL_X}" y="${baseline}">${mono(text)}</text>`,
  ).join('\n        ');
  return `<g class="ct-stmt ct-stmt--${index}" data-stmt="none" data-run="off">
        ${texts}
      </g>`;
};

const trackedCounter = TRACKED_VALUES.map(
  (value, index) =>
    `<text class="scene-counter ct-tracked ct-tracked--${index}" x="${CONTENT_RIGHT}" y="932" text-anchor="end">tracked ${fmt(value)}</text>`,
).join('\n    ');

const affectedCounter = counterVariants({
  x: SQL_X,
  y: AFFECTED_Y,
  className: 'ct-affected',
  max: SQL_COUNT,
  format: (n) => `rows affected ${n}`,
  indent: 4,
});

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${stageState} aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(X_CALL, CODE_Y + CODE_H, NODE_Y)}
  ${verticalLink(X_CALL, NODE_Y + NODE_H, DB_Y)}
  ${verticalLink(X_ROW, CODE_Y + CODE_H, NODE_Y)}
  ${verticalLink(X_ROW, NODE_Y + NODE_H, DB_Y)}

  ${clientBox({
    x: 130,
    width: 820,
    y: CODE_Y,
    height: CODE_H,
    title: 'Code',
    titleX: 170,
    titleY: 476,
    titleClass: 'scene-node-label',
    titleAnchor: null,
    extraClass: 'ct-code-box',
    children: `
    <g class="ct-code-group">
      ${cursors}
      ${codeRows}
    </g>`,
  })}

  ${nodeFrame({
    y: NODE_Y,
    height: NODE_H,
    label: 'DbContext',
    labelY: 878,
    children: `    <rect class="ct-bypass-lane" x="${X_ROW - 26}" y="${NODE_Y}" width="52" height="${NODE_H}" rx="26" />

    <text class="scene-flash ct-lifetime ct-lifetime--request" x="400" y="878">per request</text>
    <text class="scene-flash ct-lifetime ct-lifetime--singleton" x="400" y="878">singleton</text>
    <text class="scene-flash ct-bypass-label" x="${CONTENT_RIGHT}" y="878" text-anchor="end">AsNoTracking</text>

    <text class="scene-caption-label ct-meter-label" x="${COL_ENTITY}" y="928">memory</text>
    ${trackAndFill({
      x: METER_X,
      y: METER_Y,
      width: METER_W,
      height: METER_H,
      rx: METER_H / 2,
      className: 'ct-meter',
      fillWidth: memoryWidth(0),
      indent: 4,
    })}
    <g class="ct-leak">
      <path class="ct-leak-glyph" d="M 502 913 L 528 939 M 528 913 L 502 939" />
    </g>
    ${trackedCounter}

    <text class="scene-caption-label ct-head" x="${COL_ENTITY}" y="${HEADER_Y}">entity</text>
    <text class="scene-caption-label ct-head" x="${COL_STATE}" y="${HEADER_Y}">state</text>
    <text class="scene-caption-label ct-head" x="${COL_VALUE}" y="${HEADER_Y}">values</text>
    <text class="scene-caption-label ct-head" x="${COL_SNAP}" y="${HEADER_Y}">snapshot</text>

    <g class="ct-bulk-group">
      ${Array.from({ length: BULK_COUNT }, (_value, index) => bulkRow(index)).join('\n      ')}
    </g>

    <g class="ct-rows">
      ${Array.from({ length: ROW_COUNT }, (_value, index) => trackerRow(index)).join('\n      ')}
    </g>

    <text class="scene-flash ct-detect" x="${COL_ENTITY}" y="${FLASH_Y}">DetectChanges</text>
    <text class="scene-flash ct-allcols" x="380" y="${FLASH_Y}">all columns</text>
    <text class="scene-flash ct-rowversion" x="${CONTENT_RIGHT}" y="${FLASH_Y}" text-anchor="end">rowversion 0x1A</text>`,
  })}

  ${serviceBox({
    x: 130,
    width: 820,
    y: DB_Y,
    height: DB_H,
    className: 'scene-service ct-db',
    title: 'Database',
    titleX: 170,
    titleY: 1552,
    titleClass: 'scene-node-label',
    titleAnchor: null,
    children: `
    <text class="scene-mono ct-other" x="${CONTENT_RIGHT}" y="1552" text-anchor="end">other: rowversion 0x1B</text>

    <text class="scene-caption-label ct-tx-label" x="${SQL_X}" y="1596">transaction</text>
    <rect class="ct-tx-frame" x="${TX_X}" y="${TX_Y}" width="${TX_W}" height="${TX_H}" rx="18" />

    ${Array.from({ length: SQL_COUNT }, (_value, index) => sqlSlot(index)).join('\n    ')}

    ${affectedCounter}
    <g class="ct-mark ct-mark--ok">
      <path class="ct-mark-glyph" d="M 444 1772 L 454 1782 L 474 1760" />
    </g>
    <g class="ct-mark ct-mark--fail">
      <path class="ct-mark-glyph" d="M 446 1760 L 470 1784 M 470 1760 L 446 1784" />
    </g>
    <text class="scene-flash ct-commit" x="${CONTENT_RIGHT}" y="${AFFECTED_Y}" text-anchor="end">commit</text>
    <text class="scene-flash ct-rollback" x="${CONTENT_RIGHT}" y="${AFFECTED_Y}" text-anchor="end">rollback</text>
    <text class="scene-flash ct-exception" x="${SQL_X}" y="${EXCEPTION_Y}">DbUpdateConcurrencyException</text>`,
  })}

  ${requestsLayer()}
</svg>`;
