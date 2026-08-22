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
  { slot: 0, text: 'SELECT \u2026 FROM Orders' },
  ...Array.from({ length: 5 }, (_v, i) => ({
    slot: i + 1,
    text: `SELECT \u2026 Customers Id = ${i + 1}`,
  })),
  // Step 2: the same shape, but the tail is collapsed.
  { slot: 0, text: 'SELECT \u2026 FROM Orders' },
  ...Array.from({ length: 5 }, (_v, i) => ({
    slot: i + 1,
    text: `SELECT \u2026 Customers Id = ${i + 1}`,
  })),
  { slot: 6, text: '\u2026 +15 more' },
  // Step 3: one query with a join.
  { slot: 0, text: 'SELECT \u2026 Orders JOIN Customers' },
  // Step 4: a projection, then a list plus one batched lookup.
  { slot: 0, text: 'SELECT Id, Total, Name \u2026' },
  { slot: 0, text: 'SELECT \u2026 FROM Orders' },
  { slot: 1, text: '\u2026 WHERE Id IN (1, 2, 3, 4, 5)' },
];

const smallRow = (index: number): string => {
  const y = 505 + index * 23;
  return `<g class="nq-row">
        <rect class="nq-row-box" data-row-loaded="0" x="320" y="${y - 10}" width="440" height="20" rx="5" />
        <text class="nq-row-label" x="332" y="${y + 6}">order #${index + 1}</text>
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

const counter = (cls: string, x: number, y: number, anchor: string, label: (n: number) => string) =>
  Array.from({ length: 22 }, (_v, n) => n)
    .map(
      (n) =>
        `<text class="${cls} ${cls}--${n}" x="${x}" y="${y}" text-anchor="${anchor}">${label(n)}</text>`,
    )
    .join('\n    ');

const logLines = LOG_LINES.map(
  (line, index) =>
    `<text class="nq-log" data-log-shown="0" data-log-index="${index}" x="170" y="${LOG_Y + line.slot * LOG_STEP}">${line.text}</text>`,
).join('\n    ');

const ticks = Array.from({ length: TIME_CELLS - 1 }, (_v, i) => i + 1)
  .map(
    (i) =>
      `<line class="nq-time-tick" x1="${TIME_X + i * TIME_CELL}" y1="1788" x2="${TIME_X + i * TIME_CELL}" y2="1808" />`,
  )
  .join('\n  ');

export const stageMarkup = `<svg class="scene-stage" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg" data-rows="5" data-mode="none" data-queries="0" data-trips="0" data-overflow="off" aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  <line class="scene-link" x1="540" y1="680" x2="540" y2="880" />
  <line class="scene-link" x1="540" y1="1270" x2="540" y2="1500" />

  <g class="scene-client">
    <rect class="scene-box" x="280" y="440" width="520" height="240" rx="28" />
    <text class="nq-title" x="300" y="478">App</text>
    <text class="nq-times" x="770" y="478" text-anchor="end">\u00d720</text>

    <g class="nq-list nq-list--small">
      ${Array.from({ length: SMALL_ROWS }, (_v, i) => smallRow(i)).join('\n      ')}
    </g>
    <g class="nq-list nq-list--large">
      ${Array.from({ length: LARGE_ROWS }, (_v, i) => largeRow(i)).join('\n      ')}
    </g>
  </g>

  <g class="scene-node">
    <rect class="scene-box" x="130" y="880" width="820" height="390" rx="28" />
    <text class="scene-node-label" x="170" y="920">EF Core</text>
    ${counter('nq-queries', 910, 920, 'end', (n) => `queries ${n}`)}
    <text class="nq-mode nq-mode--include" x="910" y="975" text-anchor="end">Include</text>
    <text class="nq-mode nq-mode--select" x="910" y="975" text-anchor="end">Select</text>
    <text class="nq-mode nq-mode--in" x="910" y="975" text-anchor="end">IN (\u2026)</text>

    ${logLines}
  </g>

  <g class="nq-db">
    <rect class="scene-box nq-db-box" x="280" y="1500" width="520" height="240" rx="28" />
    <text class="scene-node-title" x="540" y="1570" text-anchor="middle">Database</text>
    ${counter('nq-trips', 540, 1640, 'middle', (n) => `round trips ${n}`)}
  </g>

  <text class="scene-caption-label nq-time-label" x="130" y="1806">time</text>
  <rect class="nq-time-track" x="${TIME_X}" y="1788" width="${TIME_CELL * TIME_CELLS}" height="20" rx="4" />
  <rect class="nq-time-fill" x="${TIME_X}" y="1788" width="0" height="20" rx="4" />
  ${ticks}
  <text class="nq-time-more" x="790" y="1806">\u2026</text>

  <g class="scene-requests"></g>
</svg>`;
