/**
 * Stage markup builders.
 *
 * Every scene draws the same handful of things: a client box at the top, a node
 * in the middle, a service or database at the bottom, and inside them a small
 * vocabulary of widgets — health dots, slot rows, counter stacks, timer rings,
 * track-and-fill bars, value chips. The shapes were copied between stages, so
 * the same rectangle picked up nine slightly different spellings.
 *
 * These are pure string functions and every coordinate is a parameter, so a
 * stage keeps its own numbers: nothing here decides where anything goes. That
 * matters, because the odd ones are deliberate — the Middleware client box is
 * shorter, its node is taller, and the node labels sit on five different
 * baselines because the content under them differs.
 *
 * This module is imported on the server, so like the stages themselves it must
 * stay free of animation libraries.
 *
 * Indentation is part of the output. Each builder takes the fragment it is
 * pasted into as given: `indent` is how deep the fragment's own first line sits
 * in the stage template, and the builder indents its remaining lines to match.
 */

/** The canvas every stage is drawn on. */
export const VIEWBOX = '0 0 1080 1920';

/** Corner radius shared by the client, node, service and database boxes. */
const BOX_RADIUS = 28;

/** Newline plus `n` spaces, the separator between lines of one fragment. */
const pad = (n: number): string => `\n${' '.repeat(n)}`;

/** ` text-anchor="…"`, or nothing when the element does not set one. */
const anchorOf = (anchor: string | null): string =>
  anchor ? ` text-anchor="${anchor}"` : '';

// --- boxes ----------------------------------------------------------------

export interface ClientBoxOptions {
  /** Top edge. Middleware sits its client box in a shorter band. */
  y?: number;
  height?: number;
  /** Left edge and width, for a stage whose lane is not at x 540. */
  x?: number;
  width?: number;
  title: string;
  titleY: number;
  titleX?: number;
  titleClass?: string;
  titleAnchor?: string | null;
  /** Added to the group, for scenes that address the box from CSS. */
  extraClass?: string;
  /** Markup that goes inside the box, below the title. */
  children?: string;
}

/** The box at the top of a stage, where requests start. */
export function clientBox({
  y = 440,
  height = 240,
  x = 280,
  width = 520,
  title,
  titleY,
  titleX = 540,
  titleClass = 'scene-node-title',
  titleAnchor = 'middle',
  extraClass = '',
  children = '',
}: ClientBoxOptions): string {
  return `<g class="scene-client${extraClass ? ` ${extraClass}` : ''}">
    <rect class="scene-box" x="${x}" y="${y}" width="${width}" height="${height}" rx="${BOX_RADIUS}" />
    <text class="${titleClass}" x="${titleX}" y="${titleY}"${anchorOf(titleAnchor)}>${title}</text>${children}
  </g>`;
}

export interface NodeFrameOptions {
  y?: number;
  height?: number;
  label: string;
  /**
   * Baseline of the label. It differs per scene because the label has to clear
   * whatever the node puts under it.
   */
  labelY: number;
  /** Added to the label, for a scene that sizes its frame's name itself. */
  labelClass?: string;
  /** Everything the node contains, indented four spaces. */
  children?: string;
}

/** The wide frame in the middle of a stage, holding the pattern itself. */
export function nodeFrame({
  y = 880,
  height = 390,
  label,
  labelY,
  labelClass = 'scene-node-label',
  children = '',
}: NodeFrameOptions): string {
  return `<g class="scene-node">
    <rect class="scene-box" x="130" y="${y}" width="820" height="${height}" rx="${BOX_RADIUS}" />
    <text class="${labelClass}" x="170" y="${labelY}">${label}</text>
${children}
  </g>`;
}

export interface ServiceBoxOptions {
  x?: number;
  width?: number;
  y?: number;
  height?: number;
  title: string;
  titleY: number;
  /** Defaults to the centre of the box. */
  titleX?: number;
  titleClass?: string;
  titleAnchor?: string | null;
  /** Group class, so a scene can name its bottom box a database or an endpoint. */
  className?: string;
  /** Extra attributes on the group, for scenes that drive it from `data-*`. */
  attrs?: string;
  boxClass?: string;
  /** Markup between the box and the title. */
  before?: string;
  /** Markup below the title, indented four spaces. */
  children?: string;
}

/** The box at the bottom of a stage: a service, a database, an endpoint. */
export function serviceBox({
  x = 280,
  width = 520,
  y = 1500,
  height = 240,
  title,
  titleY,
  titleX,
  titleClass = 'scene-node-title',
  titleAnchor = 'middle',
  className = 'scene-service',
  attrs = '',
  boxClass = 'scene-box',
  before = '',
  children = '',
}: ServiceBoxOptions): string {
  const centre = titleX ?? x + width / 2;
  return `<g class="${className}"${attrs}>
    <rect class="${boxClass}" x="${x}" y="${y}" width="${width}" height="${height}" rx="${BOX_RADIUS}" />${before}
    <text class="${titleClass}" x="${centre}" y="${titleY}"${anchorOf(titleAnchor)}>${title}</text>${children}
  </g>`;
}

/** One of the lines that joins the boxes. Every link in every scene is vertical. */
export function verticalLink(x: number, y1: number, y2: number, className = 'scene-link'): string {
  return `<line class="${className}" x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" />`;
}

/** The empty layer the player fills with request groups at run time. */
export function requestsLayer(): string {
  return '<g class="scene-requests"></g>';
}

// --- widgets --------------------------------------------------------------

export interface HealthDotOptions {
  cx: number;
  cy: number;
  /** Scene class carried alongside the widget class, for scene-only rules. */
  extraClass?: string;
  /** Extra attributes on both circles, for element-scoped health state. */
  attrs?: string;
  r?: number;
  ringR?: number;
  indent?: number;
}

/**
 * The dot that says whether a service is answering, with the ring that appears
 * around it once it is not. Health lives either on the stage root (`data-health`)
 * or on the circles themselves, so the attributes are a parameter.
 */
export function healthDot({
  cx,
  cy,
  extraClass = '',
  attrs = '',
  r = 20,
  ringR = 32,
  indent = 4,
}: HealthDotOptions): string {
  const dot = extraClass ? ` ${extraClass}` : '';
  const ring = extraClass ? ` ${extraClass}-ring` : '';
  return [
    `<circle class="scene-health-ring${ring}"${attrs} cx="${cx}" cy="${cy}" r="${ringR}" />`,
    `<circle class="scene-health${dot}"${attrs} cx="${cx}" cy="${cy}" r="${r}" />`,
  ].join(pad(indent));
}

export interface SlotRowOptions {
  /** Centre x of each slot, left to right. */
  xs: readonly number[];
  y: number;
  side: number;
  rx: number;
  className: string;
  /** State the slot starts in, which differs by what a free slot means. */
  initialState: string;
  attrName: string;
  indent?: number;
}

/** A row of square slots, one per unit of a fixed pool. */
export function slotRow({
  xs,
  y,
  side,
  rx,
  className,
  initialState,
  attrName,
  indent = 4,
}: SlotRowOptions): string {
  return xs
    .map(
      (x, index) =>
        `<rect class="scene-slot ${className} ${className}--${index + 1}" ${attrName}="${initialState}" x="${x - side / 2}" y="${y}" width="${side}" height="${side}" rx="${rx}" />`,
    )
    .join(pad(indent));
}

export interface CounterVariantsOptions {
  x: number;
  y: number;
  className: string;
  /** How many variants to write, or the highest value they count to. */
  count?: number;
  max?: number;
  /** The text of variant `n`. */
  format: (n: number) => string;
  anchor?: string | null;
  indent?: number;
}

/**
 * A counter is n+1 text elements stacked on one spot, with CSS showing the one
 * the current `data-*` value names. Nothing animates, so scrubbing backwards
 * lands on the right number without the timeline having to undo anything.
 */
export function counterVariants({
  x,
  y,
  className,
  count,
  max,
  format,
  anchor = null,
  indent = 4,
}: CounterVariantsOptions): string {
  const total = count ?? (max ?? 0) + 1;
  return Array.from({ length: total }, (_value, n) => n)
    .map(
      (n) =>
        `<text class="scene-counter ${className} ${className}--${n}" x="${x}" y="${y}"${anchorOf(anchor)}>${format(n)}</text>`,
    )
    .join(pad(indent));
}

export interface TimerRingOptions {
  cx: number;
  cy: number;
  r: number;
  /** Base class; track and progress take the same name with a suffix. */
  className: string;
  /** Group class, when the scene has more than one ring to tell apart. */
  groupClass?: string;
  labelText?: string;
  labelY?: number;
  labelClass?: string;
  indent?: number;
}

/**
 * A countdown drawn as an arc. The progress circle starts fully offset and the
 * timeline sweeps `stroke-dashoffset` to zero, so the arc grows clockwise from
 * twelve o'clock.
 */
export function timerRing({
  cx,
  cy,
  r,
  className,
  groupClass,
  labelText,
  labelY,
  labelClass = 'scene-caption-label',
  indent = 4,
}: TimerRingOptions): string {
  const circumference = (2 * Math.PI * r).toFixed(2);
  const lines = [
    `<g class="scene-ring ${groupClass ?? className}">`,
    `${' '.repeat(indent + 2)}<circle class="scene-ring-track ${className}-track" cx="${cx}" cy="${cy}" r="${r}" />`,
    `${' '.repeat(indent + 2)}<circle class="scene-ring-progress ${className}-progress" cx="${cx}" cy="${cy}" r="${r}" transform="rotate(-90 ${cx} ${cy})" stroke-dasharray="${circumference}" stroke-dashoffset="${circumference}" />`,
  ];
  if (labelText !== undefined && labelY !== undefined) {
    lines.push(
      `${' '.repeat(indent + 2)}<text class="${labelClass}" x="${cx}" y="${labelY}" text-anchor="middle">${labelText}</text>`,
    );
  }
  lines.push(`${' '.repeat(indent)}</g>`);
  return lines.join('\n');
}

export interface TrackAndFillOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  rx: number;
  /** Base class; track and fill take the same name with a suffix. */
  className: string;
  /** Width the fill starts at. Bars that drain start full. */
  fillWidth?: number;
  indent?: number;
}

/** A bar drawn as a fixed track with a fill the timeline tweens the width of. */
export function trackAndFill({
  x,
  y,
  width,
  height,
  rx,
  className,
  fillWidth = 0,
  indent = 4,
}: TrackAndFillOptions): string {
  return [
    `<rect class="scene-track ${className}-track" x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" />`,
    `<rect class="scene-fill ${className}-fill" x="${x}" y="${y}" width="${fillWidth}" height="${height}" rx="${rx}" />`,
  ].join(pad(indent));
}

export interface ChipOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  rx: number;
  /** Group class; the background takes the same name with `-bg` appended. */
  className: string;
  bgClass?: string;
  /** Which background the chip has: a live value, an authoritative one, or its own. */
  variant?: 'filled' | 'outline' | null;
  /** The stacked text variants, already indented by the caller. */
  text?: string;
  indent?: number;
}

/** A rounded plate carrying a value, with one text variant per value it shows. */
export function chip({
  x,
  y,
  width,
  height,
  rx,
  className,
  bgClass,
  variant = null,
  text = '',
  indent = 4,
}: ChipOptions): string {
  const inner = ' '.repeat(indent + 2);
  const widget = variant === null ? '' : `scene-chip-${variant === 'filled' ? 'bg' : 'outline'} `;
  return `<g class="scene-chip ${className}">
${inner}<rect class="${widget}${bgClass ?? `${className}-bg`}" x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" />
${inner}${text}
${' '.repeat(indent)}</g>`;
}
