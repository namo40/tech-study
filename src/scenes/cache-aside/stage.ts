/**
 * Static stage markup for the Cache-Aside scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. Bands match the other scenes:
 *   - y 0..440      kept empty for the step title card
 *   - y 440..680    Client box, one lane at x 540
 *   - y 880..1270   Cache node: three entry rows and the hit/miss flash
 *   - y 1500..1740  Database box with the current value and a read counter
 *
 * The lane runs at x 540, which falls in the gap between each row's value chip
 * and its TTL bar, so a request passes through the rows without covering them.
 */

/** Total length of the scene in seconds. */
export const SCENE_DURATION = 24;

/** Full width of a TTL bar. */
export const TTL_WIDTH = 200;
/**
 * How long a full bar takes to drain. Chosen so the entry filled at 2.9s
 * expires at 12.8s, and so the refill at 15.6s cannot expire before the scene
 * ends.
 */
export const TTL_DURATION = 9.9;

/** y of each entry row's centre. Row 1 is `user:42`, the one the scene follows. */
export const ROW_Y = [1015, 1090, 1165];

const KEYS = ['user:42', 'order:7', 'item:9'];

const row = (index: number): string => {
  const centre = ROW_Y[index] ?? 0;
  const top = centre - 29;
  const state = index === 0 ? 'empty' : 'fresh';
  return `<g class="ca-row ca-row--${index + 1}" data-entry="${state}" data-value="v1">
      <rect class="ca-row-bg" x="170" y="${top}" width="740" height="58" rx="16" />
      <text class="ca-key" x="195" y="${centre + 9}">${KEYS[index]}</text>
      <g class="ca-chip">
        <rect class="ca-chip-bg" x="400" y="${centre - 22}" width="90" height="44" rx="22" />
        <text class="ca-chip-text ca-chip-text--v1" x="445" y="${centre + 9}" text-anchor="middle">v1</text>
        <text class="ca-chip-text ca-chip-text--v2" x="445" y="${centre + 9}" text-anchor="middle">v2</text>
      </g>
      <rect class="ca-ttl-track" x="600" y="${centre - 7}" width="${TTL_WIDTH}" height="14" rx="7" />
      <rect class="ca-ttl-fill" x="600" y="${centre - 7}" width="${index === 0 ? 0 : TTL_WIDTH}" height="14" rx="7" />
    </g>`;
};

const flashes = ['hit', 'miss', 'stale', 'invalidate']
  .map(
    (name) =>
      `<text class="ca-flash ca-flash--${name}" x="890" y="940" text-anchor="end">${name}</text>`,
  )
  .join('\n    ');

const reads = [0, 1, 2, 3]
  .map(
    (n) =>
      `<text class="ca-reads ca-reads--${n}" x="780" y="1725" text-anchor="end">db reads ${n}</text>`,
  )
  .join('\n    ');

export const stageMarkup = `<svg class="scene-stage" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg" data-flash="none" data-reads="0" data-db="v1" aria-hidden="true" focusable="false">
  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  <line class="scene-link" x1="540" y1="680" x2="540" y2="880" />
  <line class="scene-link" x1="540" y1="1270" x2="540" y2="1500" />

  <g class="scene-client">
    <rect class="scene-box" x="280" y="440" width="520" height="240" rx="28" />
    <text class="scene-node-title" x="540" y="575" text-anchor="middle">Client</text>
  </g>

  <g class="scene-node">
    <rect class="scene-box" x="130" y="880" width="820" height="390" rx="28" />
    <text class="scene-node-label" x="170" y="938">Cache</text>
    <text class="scene-caption-label ca-ttl-label" x="700" y="972" text-anchor="middle">TTL</text>
    ${flashes}

    ${row(0)}
    ${row(1)}
    ${row(2)}
  </g>

  <g class="ca-db">
    <rect class="scene-box" x="280" y="1500" width="520" height="240" rx="28" />
    <text class="scene-node-title" x="540" y="1565" text-anchor="middle">Database</text>
    <g class="ca-db-chip">
      <rect class="ca-db-chip-bg" x="490" y="1668" width="100" height="44" rx="22" />
      <text class="ca-db-value ca-db-value--v1" x="540" y="1699" text-anchor="middle">v1</text>
      <text class="ca-db-value ca-db-value--v2" x="540" y="1699" text-anchor="middle">v2</text>
    </g>
    ${reads}
  </g>

  <g class="scene-requests"></g>
</svg>`;
