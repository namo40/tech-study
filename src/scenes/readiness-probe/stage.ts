/**
 * Static stage markup for the Readiness Probe scene.
 *
 * Imported on the server so the diagram is in the HTML before any script runs;
 * it must stay free of animation libraries. The bands are the usual ones:
 *   - y 0..400       above the cropped viewBox (see shared VIEWBOX)
 *   - y 400..440     the frame's top padding; nothing is drawn here
 *   - y 440..680     the Router: the endpoints list it routes to, and how many
 *                    of the three replicas are currently in it
 *   - y 880..1290    three pods side by side, each saying what its two probes
 *                    last answered, what state that leaves it in, and how many
 *                    times it has been restarted
 *   - y 1380         the two sentences that tell the probes apart, shown once
 *                    the third step has made the difference visible
 *   - y 1500..1800   the probe timeline, given the allowed extension because a
 *                    row holds two labelled lanes rather than one: an upper
 *                    lane for readiness and a lower lane for liveness, stamped
 *                    left to right as the kubelet asks
 *   - y 1826..1890   the database the fourth step points a probe at, with the
 *                    fleet's restart count on the same row to its left, and the
 *                    wire that says which of the two probes is pointed at it
 *
 * Three lanes and nothing else travels. A request leaves the bottom edge of the
 * Router on the lane of the pod the endpoints list sent it to and stops on that
 * pod's top edge; the lanes are the pod centres, so a lane never runs alongside
 * a box it is not part of. The wire that joins the probe timeline to the
 * database is one vertical bus with three horizontal stubs: every stub starts
 * on the right edge of the timeline box and ends on a point the bus passes
 * through, and the bus ends on the top edge of the database chip. Every leg is
 * vertical or horizontal and no leg has zero length.
 *
 * Inside a pod the rows are decided by what the lane sweeps. A dot stops on the
 * top edge at y 880 and its halo reaches y 906, so the pod writes nothing above
 * y 936: the name sits at 968 and everything else is stacked below it.
 *
 * The probe timeline is chart geometry, not travellers. Each mark is drawn at
 * the x its probe time maps to, so the three rows read against one axis and the
 * phase offset between the pods shows as the offset it is.
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

/** The Router, and the row inside it that lists the endpoints. */
const ROUTER_X = 130;
const ROUTER_W = 820;
const ROUTER_Y = 440;
const ROUTER_H = 240;
export const ROUTER_BOTTOM = ROUTER_Y + ROUTER_H;
const ROUTER_TITLE_Y = 500;
const EP_LABEL_Y = 552;
/** The readout sits a little higher, because it is set larger. */
const READY_Y = 546;
const EP_SLOT_Y = 572;
const EP_SLOT = 52;
const EP_LETTER_Y = 607;
const LEFT_EDGE = 170;
const RIGHT_EDGE = 910;

/** Centre x of each pod, which is also the lane its traffic arrives on. */
export const LANE_X = [250, 530, 810];
export const POD_COUNT = LANE_X.length;

/** The pod row. A dot stops on the top edge, so nothing is written above 936. */
export const POD_Y = 880;
const POD_H = 410;
const POD_W = 240;
const POD_NAME_Y = 968;
const CHIP_Y = 1000;
const CHIP_H = 52;
const CHIP_W = 96;
/** How far the centre of a chip sits from the centre of its pod. */
const CHIP_DX = 56;
const CHIP_TEXT_Y = 1035;
const NOTE_Y = 1086;
const BADGE_Y = 1136;
/** The ring sits left in its row and says what it is counting beside it. */
const RING_DX = -78;
const RING_CY = 1196;
const RING_R = 26;
const RING_LABEL_DX = -40;
const RING_LABEL_Y = 1202;
const RESTART_Y = 1262;

/** Circumference of a pod ring, which its progress arc is offset by. */
export const RING_CIRCUMFERENCE = Number((2 * Math.PI * RING_R).toFixed(2));

/** The two sentences that tell the probes apart. */
const SPLIT_Y = 1380;

/** The probe timeline. */
const PROBE_X = 130;
const PROBE_W = 820;
const PROBE_Y = 1500;
const PROBE_H = 300;
const PROBE_TITLE_Y = 1544;
const ROW_LABEL_X = 154;
const LANE_LABEL_X = 276;
/** Readiness lane and liveness lane of each pod row, top to bottom. */
const LANE_Y: readonly (readonly [number, number])[] = [
  [1580, 1618],
  [1658, 1696],
  [1736, 1774],
];
const ROW_LABEL_Y = [1608, 1686, 1764];
/** Where the time axis starts, and how wide the whole 24 seconds is on it. */
const TICK_X0 = 310;
const TICK_W = 600;
const MARK_R = 6.5;
/** How far each arm of a mark reaches, which both glyphs are drawn from. */
const ARM = Number((MARK_R * 0.7).toFixed(2));
const OK_PATH = `M ${-ARM - 0.5} 0.5 L -1.5 ${ARM} L ${ARM + 1} ${-ARM}`;
const FAIL_PATH = `M ${-ARM} ${-ARM} L ${ARM} ${ARM} M ${ARM} ${-ARM} L ${-ARM} ${ARM}`;

/** The wire from the timeline to the database, and the database itself. */
const BUS_X = 990;
const DB_X = 920;
const DB_W = 140;
const DB_Y = 1826;
const DB_H = 64;
const DB_TEXT_Y = 1868;
const TOTAL_Y = 1858;

// --- what the probes are told ----------------------------------------------

/** How often the kubelet asks, in seconds. Both probes of a pod share it. */
export const PROBE_PERIOD = 1;
/** When each pod's first probe of the run lands, so the rows do not align. */
export const PROBE_PHASE = [0.4, 0.7, 0.5];
/** How many answers in a row a probe needs before the kubelet acts on them. */
export const FAILURE_THRESHOLD = 3;

/** Every probe time of one pod, in order. */
export function probeTimes(pod: number): number[] {
  const phase = PROBE_PHASE[pod] ?? 0;
  const times: number[] = [];
  for (let at = phase; at < SCENE_DURATION; at += PROBE_PERIOD) {
    times.push(Number(at.toFixed(3)));
  }
  return times;
}

/** Where on the time axis a probe at `at` is stamped. */
const tickX = (at: number): number =>
  Number((TICK_X0 + (at / SCENE_DURATION) * TICK_W).toFixed(1));

/** The name each pod goes by, in the row label and on the box. */
const POD_NAME = ['Pod A', 'Pod B', 'Pod C'];
/** The letter each endpoint slot carries. */
const EP_LETTER = ['A', 'B', 'C'];

/**
 * What every `data-*` on the stage starts at, keyed by the target the timeline
 * addresses it through. The markup below is written from this, so a change that
 * writes a value something already holds can be dropped rather than tweened.
 */
export const STAGE_STATE: Record<string, string> = {
  'stage@data-rp-ready': '2',
  'stage@data-rp-total': '0',
  'stage@data-rp-wire': 'none',
  'stage@data-rp-db': 'off',
  'stage@data-rp-split': 'off',
};
for (let pod = 0; pod < POD_COUNT; pod += 1) {
  const starting = pod === 2;
  STAGE_STATE[`pod-${pod}@data-rp-pod`] = starting ? 'starting' : 'ready';
  STAGE_STATE[`pod-${pod}@data-rp-r`] = starting ? 'fail' : 'ok';
  STAGE_STATE[`pod-${pod}@data-rp-l`] = 'ok';
  STAGE_STATE[`pod-${pod}@data-rp-ring`] = starting ? 'delay' : 'off';
  STAGE_STATE[`pod-${pod}@data-rp-restarts`] = '0';
  STAGE_STATE[`ep-${pod}@data-rp-ep`] = starting ? 'off' : 'on';
  for (const lane of ['r', 'l']) {
    probeTimes(pod).forEach((_at, index) => {
      STAGE_STATE[`tick-${pod}-${lane}-${index}@data-rp-tick`] = 'off';
    });
  }
}

// --- markup ----------------------------------------------------------------

/** One endpoint slot in the Router: a plate that is lit or dim, and its letter. */
const endpointSlot = (pod: number): string => {
  const centre = LANE_X[pod] ?? 0;
  const state = pod === 2 ? 'off' : 'on';
  return `<g class="rp-ep rp-ep--${pod}" data-rp-ep="${state}">
      <rect class="rp-ep-box" x="${centre - EP_SLOT / 2}" y="${EP_SLOT_Y}" width="${EP_SLOT}" height="${EP_SLOT}" rx="14" />
      <text class="rp-ep-letter" x="${centre}" y="${EP_LETTER_Y}" text-anchor="middle">${EP_LETTER[pod]}</text>
    </g>`;
};

/** The verdict plate of one probe: the letter it answers for, and the answer. */
const probeChip = (centre: number, kind: 'r' | 'l'): string => {
  const cx = centre + (kind === 'r' ? -CHIP_DX : CHIP_DX);
  const letter = kind === 'r' ? 'R' : 'L';
  const text = ['ok', 'fail']
    .map(
      (value) =>
        `<text class="scene-counter rp-chip-text rp-${kind}--${value}" x="${cx}" y="${CHIP_TEXT_Y}" text-anchor="middle">${letter} ${value === 'ok' ? '✓' : '✗'}</text>`,
    )
    .join('\n        ');
  return chip({
    x: cx - CHIP_W / 2,
    y: CHIP_Y,
    width: CHIP_W,
    height: CHIP_H,
    rx: 14,
    className: `rp-chip rp-chip--${kind}`,
    bgClass: `rp-chip-box rp-chip-box--${kind}`,
    variant: 'outline',
    text,
    indent: 6,
  });
};

/** What a probe is pointed at, written under its plate once step four says. */
const probeNote = (centre: number, kind: 'r' | 'l'): string => {
  const cx = centre + (kind === 'r' ? -CHIP_DX : CHIP_DX);
  return ['db', 'self']
    .map(
      (target) =>
        `<text class="scene-counter rp-note rp-note-${kind}--${target}" x="${cx}" y="${NOTE_Y}" text-anchor="middle">${target === 'db' ? 'DB' : 'self'}</text>`,
    )
    .join('\n      ');
};

/** The word a pod says about itself. One of these shows at a time. */
const podBadge = (centre: number): string =>
  [
    ['starting', 'starting'],
    ['ready', 'ready'],
    ['notready', 'not ready'],
    ['restarting', 'restarting'],
  ]
    .map(
      ([key, text]) =>
        `<text class="scene-flash rp-badge rp-badge--${key}" x="${centre}" y="${BADGE_Y}" text-anchor="middle">${text}</text>`,
    )
    .join('\n      ');

/** The ring, which counts a warm-up down or a run of failures up. */
const podRing = (centre: number, pod: number): string => {
  const cx = centre + RING_DX;
  return `<g class="scene-ring rp-ring rp-ring--${pod}">
        <circle class="scene-ring-track rp-ring-track" cx="${cx}" cy="${RING_CY}" r="${RING_R}" />
        <circle class="scene-ring-progress rp-ring-progress" cx="${cx}" cy="${RING_CY}" r="${RING_R}" transform="rotate(-90 ${cx} ${RING_CY})" stroke-dasharray="${RING_CIRCUMFERENCE}" stroke-dashoffset="${RING_CIRCUMFERENCE}" />
      </g>
      <text class="scene-caption-label rp-ring-label rp-ring-label--delay" x="${centre + RING_LABEL_DX}" y="${RING_LABEL_Y}">initial delay</text>
      <text class="scene-caption-label rp-ring-label rp-ring-label--fail" x="${centre + RING_LABEL_DX}" y="${RING_LABEL_Y}">3× fail</text>`;
};

/** One pod: its name, its two probe plates, what it is, and its restart count. */
const podBox = (pod: number): string => {
  const centre = LANE_X[pod] ?? 0;
  const left = centre - POD_W / 2;
  const starting = pod === 2;
  const restarts = counterVariants({
    x: centre,
    y: RESTART_Y,
    className: 'rp-restarts',
    max: 3,
    format: (n) => `restarts ${n}`,
    anchor: 'middle',
    indent: 6,
  });
  return `<g class="rp-pod rp-pod--${pod}" data-rp-pod="${starting ? 'starting' : 'ready'}" data-rp-r="${starting ? 'fail' : 'ok'}" data-rp-l="ok" data-rp-ring="${starting ? 'delay' : 'off'}" data-rp-restarts="0">
      <rect class="scene-box rp-pod-box" x="${left}" y="${POD_Y}" width="${POD_W}" height="${POD_H}" rx="28" />
      <rect class="rp-hatch" x="${left}" y="${POD_Y}" width="${POD_W}" height="${POD_H}" rx="28" />
      <text class="rp-pod-name" x="${centre}" y="${POD_NAME_Y}" text-anchor="middle">${POD_NAME[pod]}</text>
      ${probeChip(centre, 'r')}
      ${probeChip(centre, 'l')}
      ${probeNote(centre, 'r')}
      ${probeNote(centre, 'l')}
      ${podBadge(centre)}
      ${restarts}
      ${podRing(centre, pod)}
    </g>`;
};

/** One probe answer, stamped at the x its time maps to. */
const tickMark = (pod: number, kind: 'r' | 'l', index: number, at: number): string => {
  const y = (LANE_Y[pod] ?? [0, 0])[kind === 'r' ? 0 : 1];
  return `<g class="rp-tick rp-tick--${pod}-${kind}-${index}" data-rp-tick="off" transform="translate(${tickX(at)} ${y})"><path class="rp-tick-ok" d="${OK_PATH}" /><path class="rp-tick-fail" d="${FAIL_PATH}" /></g>`;
};

/** One row of the probe timeline: the pod it belongs to and its two lanes. */
const probeRow = (pod: number): string => {
  const [readyY, liveY] = LANE_Y[pod] ?? [0, 0];
  const times = probeTimes(pod);
  const marks = (['r', 'l'] as const)
    .map((kind) => times.map((at, index) => tickMark(pod, kind, index, at)).join('\n    '))
    .join('\n    ');
  return `<text class="rp-row-label" x="${ROW_LABEL_X}" y="${ROW_LABEL_Y[pod]}">${POD_NAME[pod]}</text>
    <text class="rp-lane-label" x="${LANE_LABEL_X}" y="${readyY + 6}" text-anchor="middle">R</text>
    <text class="rp-lane-label" x="${LANE_LABEL_X}" y="${liveY + 6}" text-anchor="middle">L</text>
    ${marks}`;
};

/** The wire that says which of the two probes is pointed at the database. */
const wire = (kind: 'r' | 'l'): string => {
  const lane = kind === 'r' ? 0 : 1;
  const ys = LANE_Y.map((row) => row[lane]);
  const stubs = ys
    .map(
      (y) =>
        `<line class="rp-wire-line" x1="${PROBE_X + PROBE_W}" y1="${y}" x2="${BUS_X}" y2="${y}" />`,
    )
    .join('\n    ');
  return `<g class="rp-wire rp-wire--${kind}">
    ${stubs}
    <line class="rp-wire-line" x1="${BUS_X}" y1="${ys[0]}" x2="${BUS_X}" y2="${DB_Y}" />
  </g>`;
};

const readyReadout = counterVariants({
  x: RIGHT_EDGE,
  y: READY_Y,
  className: 'rp-ready',
  max: POD_COUNT,
  format: (n) => `ready ${n}/${POD_COUNT}`,
  anchor: 'end',
  indent: 4,
});

const totalReadout = counterVariants({
  x: LEFT_EDGE,
  y: TOTAL_Y,
  className: 'rp-total',
  max: 4,
  format: (n) => `restarts ${n}`,
  indent: 2,
});

const dbChip = chip({
  x: DB_X,
  y: DB_Y,
  width: DB_W,
  height: DB_H,
  rx: 16,
  className: 'rp-db',
  bgClass: 'rp-db-box',
  variant: 'outline',
  text: ['ok', 'fail']
    .map(
      (value) =>
        `<text class="scene-counter rp-db-text rp-db-text--${value}" x="${DB_X + DB_W / 2}" y="${DB_TEXT_Y}" text-anchor="middle">DB ${value === 'ok' ? '✓' : '✗'}</text>`,
    )
    .join('\n    '),
  indent: 2,
});

export const stageMarkup = `<svg class="scene-stage" viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" data-rp-ready="2" data-rp-total="0" data-rp-wire="none" data-rp-db="off" data-rp-split="off" aria-hidden="true" focusable="false">
  <defs>
    <pattern id="rp-hatch" width="18" height="18" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
      <line class="rp-hatch-line" x1="0" y1="0" x2="0" y2="18" stroke-width="5" />
    </pattern>
  </defs>

  <rect class="scene-bg" x="0" y="0" width="1080" height="1920" />

  ${LANE_X.map((x) => verticalLink(x, ROUTER_BOTTOM, POD_Y, 'scene-link rp-lane')).join('\n  ')}

  ${clientBox({
    x: ROUTER_X,
    width: ROUTER_W,
    y: ROUTER_Y,
    height: ROUTER_H,
    title: 'Router',
    titleX: LEFT_EDGE,
    titleY: ROUTER_TITLE_Y,
    titleAnchor: null,
    extraClass: 'rp-router',
    children: `
    <text class="scene-caption-label rp-ep-label" x="${LEFT_EDGE}" y="${EP_LABEL_Y}">endpoints</text>
    ${readyReadout}
    ${LANE_X.map((_x, pod) => endpointSlot(pod)).join('\n    ')}`,
  })}

  ${LANE_X.map((_x, pod) => podBox(pod)).join('\n\n  ')}

  <text class="rp-split rp-split--readiness" x="${LEFT_EDGE}" y="${SPLIT_Y}">readiness = traffic</text>
  <text class="rp-split rp-split--liveness" x="${RIGHT_EDGE}" y="${SPLIT_Y}" text-anchor="end">liveness = process</text>

  ${serviceBox({
    x: PROBE_X,
    width: PROBE_W,
    y: PROBE_Y,
    height: PROBE_H,
    title: 'Probes',
    titleX: LEFT_EDGE,
    titleY: PROBE_TITLE_Y,
    titleClass: 'scene-node-label',
    titleAnchor: null,
    className: 'rp-probes',
    children: `
    ${LANE_X.map((_x, pod) => probeRow(pod)).join('\n\n    ')}`,
  })}

  ${wire('l')}
  ${wire('r')}

  ${totalReadout}
  ${dbChip}

  ${requestsLayer()}
</svg>`;
