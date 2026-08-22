/**
 * Static stage markup for the N+1 Query scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Bands match the other scenes:
 *   - y 0..440      kept empty for the step title card
 *   - y 440..680    App box, holding the result list
 *   - y 880..1270   EF Core node: the query log and the query counter
 *   - y 1500..1740  Database box, with the round trip counter
 *   - y 1788..1808  the time bar, which is what actually grows
 *
 * Both result lists are laid out up front, five rows and twenty, and only one
 * is shown at a time. Compressing one into the other would move every row.
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

/** Rows in each of the two lists. */
export const SMALL_ROWS = 5;
export const LARGE_ROWS = 20;

/** Resting y of a query dot inside the app box. */
export const Y_CLIENT = 645;
/** y a query reaches inside the database box. */
export const Y_DB = 1690;

/** The time bar: one cell per round trip. */
export const TIME_X = 210;
export const TIME_CELL = 28;
export const TIME_CELLS = 20;

/** Log lines the node can show before it starts collapsing them. */
export const LOG_SLOTS = 6;
const LOG_Y = 1000;
const LOG_STEP = 38;

/** Every line the log ever shows, with the slot it occupies. */
export const LOG_LINES: { slot: number; text: string }[] = [
  // Step 1: the list, then one per row.
  { slot: 0, text: 'SELECT … FROM Orders' },
  ...Array.from({ length: 5 }, (_v, i) => ({
    slot: i + 1,
    text: `SELECT … Customers Id = ${i + 1}`,
  })),
  // Step 2: the same shape, but the tail is collapsed.
  { slot: 0, text: 'SELECT … FROM Orders' },
  ...Array.from({ length: 5 }, (_v, i) => ({
    slot: i + 1,
    text: `SELECT … Customers Id = ${i + 1}`,
  })),
  { slot: 6, text: '… +15 more' },
  // Step 3: one query with a join.
  { slot: 0, text: 'SELECT … Orders JOIN Customers' },
  // Step 4: a projection, then a list plus one batched lookup.
  { slot: 0, text: 'SELECT Id, Total, Name …' },
  { slot: 0, text: 'SELECT … FROM Orders' },
  { slot: 1, text: '… WHERE Id IN (1, 2, 3, 4, 5)' },
];

const smallRow = (index: number): string => {
  const y = 505 + index * 23;
  return `<g class="nq-row">
        <rect class="nq-row-box" data-row-loaded="0" x="320" y="${y - 10}" width="440" height="20" rx="5" />
        <text class="scene-mono nq-row-label" x="332" y="${y + 6}">order #${index + 1}</text>
        <rect class="nq-slot" data-slot-filled="0" x="600" y="${y - 8}" width="150" height="16" rx="4" />
      </g>`;
};

const largeRow = (index: number): string => {
  const y = 502 + index * 5;
  return `<g class="nq-row">
        <rect class="nq-row-box" data-row-loaded="0" x="320" y="${y - 2}" width="440" height="4" rx="2" />
        <rect class="nq-slot" data-slot-filled="0" x="600" y="${y - 2}" width="150" height="4" rx="2" />
      </g>`;
};

/** Both counters run to 21, which is one list query plus twenty lookups. */
const COUNTER_VARIANTS = 22;

const queries = counterVariants({
  x: 910,
  y: 920,
  className: 'nq-queries',
  count: COUNTER_VARIANTS,
  anchor: 'end',
  format: (n) => `queries ${n}`,
});

const trips = counterVariants({
  x: 540,
  y: 1640,
  className: 'nq-trips',
  count: COUNTER_VARIANTS,
  anchor: 'middle',
  format: (n) => `round trips ${n}`,
});

const logLines = LOG_LINES.map(
  (line, index) =>
    `<text class="scene-mono nq-log" data-log-shown="0" data-log-index="${index}" x="170" y="${LOG_Y + line.slot * LOG_STEP}">${line.text}</text>`,
).join('\n    ');

const ticks = Array.from({ length: TIME_CELLS - 1 }, (_v, i) => i + 1)
  .map(
    (i) =>
      `<line class="nq-time-tick" x1="${TIME_X + i * TIME_CELL}" y1="1788" x2="${TIME_X + i * TIME_CELL}" y2="1808" />`,
  )
  .join('\n  ');

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" data-rows="5" data-mode="none" data-queries="0" data-trips="0" data-overflow="off" aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${verticalLink(540, 680, 880)}
  ${verticalLink(540, 1270, 1500)}

  ${clientBox({
    title: 'App',
    titleY: 478,
    titleX: 300,
    titleClass: 'nq-title',
    titleAnchor: null,
    children: `
    <text class="nq-times" x="770" y="478" text-anchor="end">×20</text>

    <g class="nq-list nq-list--small">
      ${Array.from({ length: SMALL_ROWS }, (_v, i) => smallRow(i)).join('\n      ')}
    </g>
    <g class="nq-list nq-list--large">
      ${Array.from({ length: LARGE_ROWS }, (_v, i) => largeRow(i)).join('\n      ')}
    </g>`,
  })}

  ${nodeFrame({
    label: 'EF Core',
    labelY: 920,
    children: `    ${queries}
    <text class="scene-flash nq-mode nq-mode--include" x="910" y="975" text-anchor="end">Include</text>
    <text class="scene-flash nq-mode nq-mode--select" x="910" y="975" text-anchor="end">Select</text>
    <text class="scene-flash nq-mode nq-mode--in" x="910" y="975" text-anchor="end">IN (…)</text>

    ${logLines}`,
  })}

  ${serviceBox({
    className: 'nq-db',
    boxClass: 'scene-box nq-db-box',
    title: 'Database',
    titleY: 1570,
    children: `
    ${trips}`,
  })}

  <text class="scene-caption-label nq-time-label" x="130" y="1806">time</text>
  ${trackAndFill({
    x: TIME_X,
    y: 1788,
    width: TIME_CELL * TIME_CELLS,
    height: 20,
    rx: 4,
    className: 'nq-time',
    indent: 2,
  })}
  ${ticks}
  <text class="scene-flash nq-time-more" x="790" y="1806">…</text>

  ${requestsLayer()}
</svg>`;
