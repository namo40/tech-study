import { loadScene } from '../scenes/load';
import type { SceneCue, SceneStep } from '../scenes/types';
import { isSoundEnabled, playCue, setSoundEnabled, unlockAudio } from './audio';

/**
 * Scene player.
 *
 * The scene owns the timeline; this module only drives it and mirrors its
 * position into the controls and the step title card. The timeline is built
 * paused on the first frame and then starts playing, unless the reader prefers
 * reduced motion, in which case it stays on that still frame until they ask
 * for movement.
 */

const reducedMotion = (): boolean =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function must<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`scene player: element "${selector}" is missing`);
  return element;
}

function formatTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

function stepIndexAt(steps: SceneStep[], time: number): number {
  let index = 0;
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    if (step && time + 0.002 >= step.time) index = i;
  }
  return index;
}

async function initPlayer(root: HTMLElement): Promise<void> {
  const sceneId = root.dataset.scene;
  if (!sceneId) return;

  const stage = root.querySelector<SVGSVGElement>('[data-stage] svg');
  if (!stage) return;

  const scene = await loadScene(sceneId);
  if (!scene) return;

  const playButton = must<HTMLButtonElement>(root, '[data-play]');
  const previousButton = must<HTMLButtonElement>(root, '[data-previous]');
  const nextButton = must<HTMLButtonElement>(root, '[data-next]');
  const loopButton = must<HTMLButtonElement>(root, '[data-loop]');
  const soundButton = must<HTMLButtonElement>(root, '[data-sound]');
  const scrub = must<HTMLInputElement>(root, '[data-scrub]');
  const timeLabel = must<HTMLElement>(root, '[data-time]');
  const stepCards = Array.from(root.querySelectorAll<HTMLElement>('[data-caption]'));
  const stepButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-step]'));
  const playIcons = Array.from(playButton.querySelectorAll<SVGElement>('[data-play-icon]'));

  let scrubbing = false;
  let soundOn = isSoundEnabled();
  let shownStep = -1;
  let wasPaused = true;

  /**
   * Scenes ask for a sound at storyboard times. Suppress it while the reader is
   * dragging the scrub bar and whenever the timeline is not actually running,
   * so seeking never produces a burst of cues.
   */
  const cue = (name: SceneCue): void => {
    if (!soundOn || scrubbing || tl.paused()) return;
    playCue(name);
  };

  const { tl, steps } = scene.build(stage, { cue });

  const applyStep = (index: number): void => {
    for (const card of stepCards) {
      card.toggleAttribute('hidden', Number(card.dataset.caption) !== index);
    }
    for (const button of stepButtons) {
      const isCurrent = Number(button.dataset.step) === index;
      button.setAttribute('aria-current', String(isCurrent));
    }
  };

  const syncPlayButton = (): void => {
    const paused = tl.paused();
    wasPaused = paused;
    playButton.setAttribute('aria-pressed', String(!paused));
    const label = paused ? playButton.dataset.labelPlay : playButton.dataset.labelPause;
    if (label) playButton.setAttribute('aria-label', label);
    for (const icon of playIcons) {
      icon.classList.toggle('is-hidden', icon.dataset.playIcon !== (paused ? 'play' : 'pause'));
    }
  };

  const render = (): void => {
    const duration = tl.duration();
    const time = tl.time();

    if (!scrubbing) {
      scrub.value = String(Math.round((duration > 0 ? time / duration : 0) * 1000));
    }
    timeLabel.textContent = `${formatTime(time)} / ${formatTime(duration)}`;

    const index = stepIndexAt(steps, time);
    if (index !== shownStep) {
      shownStep = index;
      applyStep(index);
    }

    if (tl.paused() !== wasPaused) syncPlayButton();
  };

  tl.eventCallback('onUpdate', render);
  tl.eventCallback('onComplete', () => {
    render();
    syncPlayButton();
  });

  const seekTo = (time: number, keepPlaying: boolean): void => {
    tl.seek(time, true);
    if (reducedMotion() || !keepPlaying) tl.pause();
    render();
    syncPlayButton();
  };

  const goToStep = (index: number): void => {
    const clamped = Math.min(Math.max(index, 0), steps.length - 1);
    const step = steps[clamped];
    if (!step) return;
    seekTo(step.time, !tl.paused());
  };

  const togglePlay = (): void => {
    if (tl.paused()) {
      unlockAudio();
      if (tl.progress() >= 1 && tl.repeat() === 0) tl.restart();
      else tl.play();
    } else {
      tl.pause();
    }
    render();
    syncPlayButton();
  };

  playButton.addEventListener('click', togglePlay);
  previousButton.addEventListener('click', () => goToStep(shownStep - 1));
  nextButton.addEventListener('click', () => goToStep(shownStep + 1));

  for (const button of stepButtons) {
    button.addEventListener('click', () => goToStep(Number(button.dataset.step)));
  }

  loopButton.addEventListener('click', () => {
    const looping = loopButton.getAttribute('aria-pressed') === 'true';
    loopButton.setAttribute('aria-pressed', String(!looping));
    tl.repeat(looping ? 0 : -1);
  });

  soundButton.addEventListener('click', () => {
    soundOn = !soundOn;
    setSoundEnabled(soundOn);
    soundButton.setAttribute('aria-pressed', String(soundOn));
    if (soundOn) unlockAudio();
  });
  soundButton.setAttribute('aria-pressed', String(soundOn));

  const stopScrubbing = (): void => {
    scrubbing = false;
  };

  scrub.addEventListener('pointerdown', () => {
    scrubbing = true;
  });
  scrub.addEventListener('input', () => {
    scrubbing = true;
    tl.progress(Number(scrub.value) / 1000, true);
    render();
  });
  scrub.addEventListener('change', stopScrubbing);
  scrub.addEventListener('pointerup', stopScrubbing);
  scrub.addEventListener('pointercancel', stopScrubbing);
  scrub.addEventListener('blur', stopScrubbing);

  root.addEventListener('keydown', (event: KeyboardEvent) => {
    const target = event.target;
    // The scrub bar has its own arrow key handling.
    if (target instanceof HTMLInputElement) return;
    const onButton = target instanceof HTMLButtonElement;

    switch (event.key) {
      case ' ':
      case 'Spacebar':
        if (onButton) return;
        event.preventDefault();
        togglePlay();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        goToStep(shownStep - 1);
        break;
      case 'ArrowRight':
        event.preventDefault();
        goToStep(shownStep + 1);
        break;
      case 'Home':
        event.preventDefault();
        seekTo(0, false);
        break;
      default:
        break;
    }
  });

  // A sub-keyword page opens on the step it is about; every other page opens
  // on step 1. Then playback starts, unless the reader prefers reduced motion,
  // in which case that still frame is what they keep.
  const requestedStep = Number(root.dataset.startStep);
  const startIndex = Number.isFinite(requestedStep)
    ? Math.min(Math.max(requestedStep - 1, 0), steps.length - 1)
    : 0;
  const startTime = steps[startIndex]?.time ?? 0;

  tl.pause(startTime);
  applyStep(startIndex);
  shownStep = startIndex;
  syncPlayButton();
  render();

  if (!reducedMotion()) {
    tl.play();
    syncPlayButton();
  }
}

export function initScenePlayers(): void {
  for (const root of Array.from(document.querySelectorAll<HTMLElement>('[data-player]'))) {
    void initPlayer(root);
  }
}
