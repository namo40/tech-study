import { loadScene, loadStage, type SceneStage } from '../scenes/load';
import type { SceneInstance, SceneStep } from '../scenes/types';
import { bandRange, levelBand, rangeBand } from '../utils/level';
import { formatSpeed, getSpeed, nextSpeed, setSpeed } from './speed';

/**
 * Concept index.
 *
 * Two independent pieces of behaviour. The theater drives one scene timeline
 * at a time and can swap the scene in place: only the scene it opens on ships
 * with the page, and the others are fetched on the click that asks for them,
 * so switching is a download plus a fresh timeline and never a navigation. The
 * filter narrows the index by title, by tag, and by difficulty band, and hides
 * the sections it empties.
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
  const stageCss = root.querySelector<HTMLStyleElement>('[data-scene-css]');
  const controls = root.querySelector<HTMLElement>('[data-controls]');
  const sceneTitle = root.querySelector<HTMLElement>('[data-scene-title]');
  const cta = root.querySelector<HTMLAnchorElement>('[data-scene-cta]');
  const scrub = root.querySelector<HTMLInputElement>('[data-scrub]');
  const timeLabel = root.querySelector<HTMLElement>('[data-time]');
  const playButton = root.querySelector<HTMLButtonElement>('[data-play]');
  const speedButton = root.querySelector<HTMLButtonElement>('[data-speed]');
  const stepBar = root.querySelector<HTMLElement>('[data-steps]');
  if (
    !stage ||
    !stageCss ||
    !controls ||
    !sceneTitle ||
    !cta ||
    !scrub ||
    !timeLabel ||
    !playButton ||
    !speedButton ||
    !stepBar
  ) {
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
  let speed = getSpeed();
  let activeId =
    rows.find((row) => row.getAttribute('aria-current') === 'true')?.dataset.sceneRow ?? '';

  /**
   * The stages already in hand, so a scene that ran before comes back without
   * a second download. The scene the page was built with is read off the
   * document, before any timeline has touched it.
   */
  const stages = new Map<string, SceneStage>();
  if (activeId) {
    stages.set(activeId, { markup: stage.innerHTML, css: stageCss.textContent ?? '' });
  }

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
      const next = stages.get(id) ?? (await loadStage(id).catch(() => null));
      if (ticket !== switchToken) return;
      // A stage that never arrives leaves the one on screen where it is,
      // rather than emptying the theater.
      if (!next) return;
      stages.set(id, next);
      // Always rewrite, so a scene that ran before comes back on a clean stage.
      stage.innerHTML = next.markup;
      stageCss.textContent = next.css;
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
    // Every switch builds a fresh timeline, so the chosen rate is applied again.
    built.tl.timeScale(speed);
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

  speedButton.addEventListener('click', () => {
    speed = nextSpeed(speed);
    setSpeed(speed);
    if (instance) instance.tl.timeScale(speed);
    speedButton.textContent = formatSpeed(speed);
  });
  speedButton.textContent = formatSpeed(speed);

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

/**
 * Narrows the index by name, by tag, and by difficulty band at once. The three
 * conditions are an AND, so a tag plus a band plus a query is the intersection
 * of all three, and each of the two chip rows holds at most one choice:
 * clicking the chip already pressed clears it.
 *
 * Both choices are mirrored into `?tag=` and `?level=`, which makes the
 * filtered index a link the chips of a concept page can point at. A band goes
 * into the address as its range, so `?level=5-6` picks the third band.
 */
function initFilter(root: HTMLElement): void {
  const input = root.querySelector<HTMLInputElement>('[data-filter]');
  if (!input) return;

  const empty = root.querySelector<HTMLElement>('[data-empty]');
  const tagButtons = Array.from(
    root.querySelectorAll<HTMLButtonElement>('[data-tags-row] [data-tag]'),
  );
  const levelButtons = Array.from(
    root.querySelectorAll<HTMLButtonElement>('[data-levels-row] [data-level-band]'),
  );
  const sections = Array.from(root.querySelectorAll<HTMLElement>('[data-section]')).map(
    (section) => ({
      section,
      rows: Array.from(section.querySelectorAll<HTMLElement>('[data-entry]')).map((row) => ({
        row,
        // Titles are matched as the locale wrote them, only case folded.
        title: (row.dataset.title ?? '').toLowerCase(),
        // Tag slugs are English in every locale, so they need no folding.
        tags: (row.dataset.tags ?? '').split(' ').filter(Boolean),
        // Band 0 stands for a page nobody has rated, which no chip matches:
        // picking a band hides it rather than showing it under a difficulty
        // it does not claim.
        band: row.dataset.level ? levelBand(Number(row.dataset.level)) : 0,
      })),
    }),
  );

  let activeTag = '';
  let activeBand = 0;

  const apply = (): void => {
    const query = input.value.trim().toLowerCase();
    let matches = 0;

    for (const group of sections) {
      let visible = 0;
      for (const item of group.rows) {
        const hit =
          (query === '' || item.title.includes(query)) &&
          (activeTag === '' || item.tags.includes(activeTag)) &&
          (activeBand === 0 || item.band === activeBand);
        item.row.hidden = !hit;
        if (hit) visible += 1;
      }
      // A section with nothing left in it takes its header with it.
      group.section.hidden = visible === 0;
      matches += visible;
    }

    if (empty) empty.hidden = matches > 0;
  };

  /** Mirrors both chip rows, so a click on either shows up on the pressed one. */
  const syncChips = (): void => {
    for (const button of tagButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.tag === activeTag));
    }
    for (const button of levelButtons) {
      button.setAttribute('aria-pressed', String(Number(button.dataset.levelBand) === activeBand));
    }
  };

  /** Rewrites the address without adding a history entry, so Back still leaves the page. */
  const syncUrl = (): void => {
    const url = new URL(window.location.href);
    if (activeTag) url.searchParams.set('tag', activeTag);
    else url.searchParams.delete('tag');
    if (activeBand) url.searchParams.set('level', bandRange(activeBand));
    else url.searchParams.delete('level');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  };

  for (const button of tagButtons) {
    button.addEventListener('click', () => {
      const tag = button.dataset.tag ?? '';
      activeTag = tag === activeTag ? '' : tag;
      syncChips();
      syncUrl();
      apply();
    });
  }

  for (const button of levelButtons) {
    button.addEventListener('click', () => {
      const band = Number(button.dataset.levelBand);
      activeBand = band === activeBand ? 0 : band;
      syncChips();
      syncUrl();
      apply();
    });
  }

  input.addEventListener('input', apply);

  // A `?tag=` or `?level=` the page was opened with picks that chip, and a
  // value no chip carries is left alone: the index simply opens unfiltered on
  // that axis.
  const params = new URLSearchParams(window.location.search);
  const requestedTag = params.get('tag') ?? '';
  if (tagButtons.some((button) => button.dataset.tag === requestedTag)) activeTag = requestedTag;

  const requestedBand = rangeBand(params.get('level') ?? '');
  if (
    requestedBand !== undefined &&
    levelButtons.some((button) => Number(button.dataset.levelBand) === requestedBand)
  ) {
    activeBand = requestedBand;
  }

  syncChips();
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
