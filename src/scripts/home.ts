import { loadScene } from '../scenes/load';
import type { SceneInstance, SceneStep } from '../scenes/types';

/**
 * Concept index.
 *
 * Two independent pieces of behaviour. The theater drives one scene timeline
 * at a time and can swap the scene in place: the markup of every featured
 * scene ships with the page, so switching is a clone plus a fresh timeline and
 * never a navigation. The filter narrows the index by title and hides the
 * sections it empties.
 *
 * The theater borrows the driving pattern of the scene player: the scene owns
 * the timeline, this module only mirrors its position into the controls. There
 * is no audio here, so the cue callback does nothing.
 */

const reducedMotion = (): boolean =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

function initTheater(root: HTMLElement): void {
  const stage = root.querySelector<HTMLElement>('[data-stage]');
  const controls = root.querySelector<HTMLElement>('[data-controls]');
  const sceneTitle = root.querySelector<HTMLElement>('[data-scene-title]');
  const cta = root.querySelector<HTMLAnchorElement>('[data-scene-cta]');
  const scrub = root.querySelector<HTMLInputElement>('[data-scrub]');
  const timeLabel = root.querySelector<HTMLElement>('[data-time]');
  const playButton = root.querySelector<HTMLButtonElement>('[data-play]');
  const stepBar = root.querySelector<HTMLElement>('[data-steps]');
  if (!stage || !controls || !sceneTitle || !cta || !scrub || !timeLabel || !playButton || !stepBar) {
    return;
  }

  const rows = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-scene-row]'));
  const playIcons = Array.from(playButton.querySelectorAll<SVGElement>('[data-play-icon]'));
  const stepLabelBefore = controls.dataset.stepLabelBefore ?? '';
  const stepLabelAfter = controls.dataset.stepLabelAfter ?? '';

  let instance: SceneInstance | null = null;
  let stepButtons: HTMLButtonElement[] = [];
  let shownStep = -1;
  let wasPaused = true;
  let scrubbing = false;
  let serverRendered = true;
  /** Guards against an older scene chunk resolving after a newer switch. */
  let switchToken = 0;
  let activeId =
    rows.find((row) => row.getAttribute('aria-current') === 'true')?.dataset.sceneRow ?? '';

  const applyStep = (index: number): void => {
    for (const button of stepButtons) {
      button.setAttribute('aria-current', String(Number(button.dataset.step) === index));
    }
  };

  const syncPlayButton = (): void => {
    const paused = instance ? instance.tl.paused() : true;
    wasPaused = paused;
    playButton.setAttribute('aria-pressed', String(!paused));
    const label = paused ? playButton.dataset.labelPlay : playButton.dataset.labelPause;
    if (label) playButton.setAttribute('aria-label', label);
    for (const icon of playIcons) {
      icon.classList.toggle('is-hidden', icon.dataset.playIcon !== (paused ? 'play' : 'pause'));
    }
  };

  const render = (): void => {
    if (!instance) return;
    const duration = instance.tl.duration();
    const time = instance.tl.time();

    if (!scrubbing) {
      scrub.value = String(Math.round((duration > 0 ? time / duration : 0) * 1000));
    }
    timeLabel.textContent = `${formatTime(time)} / ${formatTime(duration)}`;

    const index = stepIndexAt(instance.steps, time);
    if (index !== shownStep) {
      shownStep = index;
      applyStep(index);
    }

    if (instance.tl.paused() !== wasPaused) syncPlayButton();
  };

  const goToStep = (index: number): void => {
    if (!instance) return;
    const clamped = Math.min(Math.max(index, 0), instance.steps.length - 1);
    const step = instance.steps[clamped];
    if (!step) return;
    const keepPlaying = !instance.tl.paused();
    instance.tl.seek(step.time, true);
    if (reducedMotion() || !keepPlaying) instance.tl.pause();
    render();
    syncPlayButton();
  };

  /** Step count differs from scene to scene, so the pills are rebuilt on every switch. */
  const buildSteps = (steps: SceneStep[]): void => {
    stepBar.replaceChildren();
    stepButtons = steps.map((_step, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'home-controls__step';
      button.dataset.step = String(index);
      button.textContent = String(index + 1);
      button.setAttribute('aria-current', 'false');
      button.setAttribute('aria-label', `${stepLabelBefore}${index + 1}${stepLabelAfter}`);
      button.addEventListener('click', () => goToStep(index));
      stepBar.append(button);
      return button;
    });
  };

  const teardown = (): void => {
    if (!instance) return;
    instance.tl.eventCallback('onUpdate', null);
    instance.tl.eventCallback('onComplete', null);
    instance.tl.kill();
    instance = null;
  };

  const activate = async (id: string): Promise<void> => {
    if (!id) return;
    // Asking for the scene already running is a no-op, so a second click on
    // the active row never restarts it.
    if (id === activeId && instance) return;

    const ticket = (switchToken += 1);
    activeId = id;

    // The card follows the click straight away; only the timeline waits for
    // the scene chunk.
    const row = rows.find((item) => item.dataset.sceneRow === id);
    for (const item of rows) {
      item.setAttribute('aria-current', String(item === row));
    }
    const label = row?.querySelector<HTMLElement>('.home-scene__title')?.textContent?.trim();
    if (label) sceneTitle.textContent = label;
    if (row?.dataset.href) cta.href = row.dataset.href;

    teardown();
    shownStep = -1;
    scrubbing = false;
    scrub.value = '0';
    syncPlayButton();

    if (serverRendered) {
      // The first scene is already on the page, drawn at build time.
      serverRendered = false;
    } else {
      const template = document.querySelector<HTMLTemplateElement>(`[data-scene-markup="${id}"]`);
      if (!template) return;
      // Always clone, so a scene that ran before comes back on a clean stage.
      stage.replaceChildren(template.content.cloneNode(true));
    }

    const scene = await loadScene(id);
    if (ticket !== switchToken) return;

    const svg = stage.querySelector<SVGSVGElement>('svg');
    if (!scene || !svg) return;

    const built = scene.build(svg, { cue: () => undefined });
    if (ticket !== switchToken) {
      built.tl.kill();
      return;
    }

    instance = built;
    buildSteps(built.steps);
    built.tl.eventCallback('onUpdate', render);
    built.tl.eventCallback('onComplete', () => {
      render();
      syncPlayButton();
    });

    built.tl.pause(0);
    render();
    syncPlayButton();

    // Reduced motion keeps the first frame until the reader asks for movement.
    if (!reducedMotion()) {
      built.tl.play();
      syncPlayButton();
    }
  };

  playButton.addEventListener('click', () => {
    if (!instance) return;
    const { tl } = instance;
    if (tl.paused()) {
      if (tl.progress() >= 1 && tl.repeat() === 0) tl.restart();
      else tl.play();
    } else {
      tl.pause();
    }
    render();
    syncPlayButton();
  });

  for (const row of rows) {
    row.addEventListener('click', () => {
      void activate(row.dataset.sceneRow ?? '');
    });
  }

  const stopScrubbing = (): void => {
    scrubbing = false;
  };

  scrub.addEventListener('pointerdown', () => {
    scrubbing = true;
  });
  scrub.addEventListener('input', () => {
    if (!instance) return;
    scrubbing = true;
    instance.tl.progress(Number(scrub.value) / 1000, true);
    render();
  });
  scrub.addEventListener('change', stopScrubbing);
  scrub.addEventListener('pointerup', stopScrubbing);
  scrub.addEventListener('pointercancel', stopScrubbing);
  scrub.addEventListener('blur', stopScrubbing);

  void activate(activeId);
}

function initFilter(root: HTMLElement): void {
  const input = root.querySelector<HTMLInputElement>('[data-filter]');
  if (!input) return;

  const empty = root.querySelector<HTMLElement>('[data-empty]');
  const sections = Array.from(root.querySelectorAll<HTMLElement>('[data-section]')).map(
    (section) => ({
      section,
      rows: Array.from(section.querySelectorAll<HTMLElement>('[data-entry]')).map((row) => ({
        row,
        // Titles are matched as the locale wrote them, only case folded.
        title: (row.dataset.title ?? '').toLowerCase(),
      })),
    }),
  );

  const apply = (): void => {
    const query = input.value.trim().toLowerCase();
    let matches = 0;

    for (const group of sections) {
      let visible = 0;
      for (const item of group.rows) {
        const hit = query === '' || item.title.includes(query);
        item.row.hidden = !hit;
        if (hit) visible += 1;
      }
      // A section with nothing left in it takes its header with it.
      group.section.hidden = visible === 0;
      matches += visible;
    }

    if (empty) empty.hidden = matches > 0;
  };

  input.addEventListener('input', apply);
  apply();
}

/** Gap kept below the theater when it is taller than the viewport and pins to the bottom. */
const THEATER_BOTTOM_GAP = 16;

/**
 * The theater sticks under the header while it fits the viewport and sticks to
 * the bottom edge once it is taller than one, which the stylesheet works out
 * from its measured height. Kept fresh through a resize observer, so a window
 * resize, a breakpoint change, or a scene with a different number of step
 * buttons all correct the offset.
 */
function initStickyTheater(root: HTMLElement): void {
  const theater = root.querySelector<HTMLElement>('.home-theater');
  if (!theater) return;

  const measure = (): void => {
    root.style.setProperty(
      '--home-theater-height',
      `${theater.offsetHeight + THEATER_BOTTOM_GAP}px`,
    );
  };

  measure();

  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(measure).observe(theater);
  } else {
    window.addEventListener('resize', measure);
  }
}

export function initHome(): void {
  const root = document.querySelector<HTMLElement>('[data-home]');
  if (!root) return;
  initFilter(root);
  initTheater(root);
  initStickyTheater(root);
}
