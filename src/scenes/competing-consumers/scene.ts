import gsap from 'gsap';
import {
  CONSUMER_X,
  SCENE_DURATION,
  SIMULATION,
  X_LANE,
  Y_PRODUCER,
} from './stage';
import type { Segment } from './stage';
import { q, qa } from '../shared/dom';
import { attr } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneInstance, SceneStep } from '../types';

/**
 * Competing Consumers scene: a 24 second, four step timeline.
 *
 * The simulation itself lives in `stage.ts`, because the stage has to render
 * what it produced: the shared store shows the message ids in the order they
 * were acknowledged, and the key table shows which consumer each key ended up
 * on. Both of those are outputs, not decisions, and writing them in two places
 * would let the diagram and the timeline drift apart.
 *
 * Nothing the reader counts is authored. The scene says only when the producer
 * sends each message, when consumers join, which consumer dies and when it
 * comes back, which message the broker delivers a second time, which message
 * always throws, and when the broker starts sending each key to one consumer.
 * Everything else falls out: how deep the queue gets, who takes what, how long
 * each message waited, which attempt is a redelivery, what the store holds,
 * which key belongs to which consumer, and how far every meter has filled.
 *
 * This module only turns that into tweens. Every one sits at an absolute
 * position, and every discrete change is a zero-duration tween on a `data-*`
 * attribute that GSAP reverts when the playhead moves back past it.
 */

const ID = 'competing-consumers';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const targets: Record<string, Element> = { stage };
  for (let index = 1; index <= CONSUMER_X.length; index += 1) {
    targets[`consumer-${index}`] = q<SVGGElement>(stage, `.cc-consumer--${index}`, ID);
  }
  SIMULATION.seen.forEach((_label, index) => {
    targets[`seen-${index + 1}`] = q<SVGGElement>(stage, `.cc-seen--${index + 1}`, ID);
  });
  SIMULATION.keys.forEach((_label, index) => {
    targets[`key-${index + 1}`] = q<SVGGElement>(stage, `.cc-key--${index + 1}`, ID);
  });

  const barFills = qa<SVGRectElement>(stage, '.cc-bar-fill');
  const latencyFill = q<SVGRectElement>(stage, '.cc-lat-fill', ID);
  const chipEls = qa<SVGGElement>(stage, '.cc-chip');

  const tl = createSceneTimeline();

  // --- discrete state -----------------------------------------------------

  for (const change of SIMULATION.attrs) {
    const element = targets[change.key];
    if (!element) continue;
    attr(tl, element, change.name, change.value, change.at);
  }

  // --- the meters ---------------------------------------------------------

  const widen = (element: Element, segment: Segment): void => {
    if (segment.to <= segment.from || segment.vFrom === segment.vTo) return;
    tl.fromTo(
      element,
      { attr: { width: segment.vFrom } },
      {
        attr: { width: segment.vTo },
        duration: segment.to - segment.from,
        ease: 'none',
        immediateRender: false,
      },
      segment.from,
    );
  };
  SIMULATION.bars.forEach((segments, index) => {
    const element = barFills[index];
    if (!element) return;
    for (const segment of segments) widen(element, segment);
  });
  for (const segment of SIMULATION.latency) widen(latencyFill, segment);

  // --- message chips ------------------------------------------------------

  SIMULATION.chips.forEach((chip, index) => {
    const element = chipEls[index];
    if (!element) return;
    gsap.set(element, { x: X_LANE, y: Y_PRODUCER, opacity: 0 });
    if (chip.moves.length === 0) return;

    tl.set(element, { opacity: 1, immediateRender: false }, chip.showAt);
    for (const step of chip.moves) {
      tl.to(
        element,
        { x: step.x, y: step.y, duration: step.duration, ease: 'none', immediateRender: false },
        step.at,
      );
    }
    let held = 'queued';
    for (const [at, state] of chip.states) {
      if (state === held) continue;
      held = state;
      attr(tl, element, 'data-chip', state, at);
    }
    if (chip.fadeAt !== null) {
      tl.to(element, { opacity: 0, duration: SIMULATION.fade, immediateRender: false }, chip.fadeAt);
    }
  });

  // --- sound --------------------------------------------------------------

  for (const [at, name] of SIMULATION.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels --------------------------------------------------------

  // The stage is complete on the first frame: an empty queue at zero depth, one
  // consumer waiting, four outlined but not there yet, an empty dead-letter
  // queue and an empty store.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
