/**
 * Text size cycle. The initial `data-text-size` value is set by an inline
 * script in the document head, so the reader's choice is in place before the
 * first paint; this module only handles the press and keeps the button's step
 * dots and label in sync. One dot is filled per step reached, so the count is
 * the step's own place in the cycle.
 *
 * Only the type scale moves with the setting. The stage pins its own font
 * size, so the drawings stay the size they were designed at.
 */

const STORAGE_KEY = 'text-size';

const ORDER = ['normal', 'large', 'larger', 'xlarge', 'largest'] as const;
type TextSize = (typeof ORDER)[number];

/** Where the component parked each step's label, as a `dataset` key. */
const LABEL: Record<TextSize, string> = {
  normal: 'labelNormal',
  large: 'labelLarge',
  larger: 'labelLarger',
  xlarge: 'labelXlarge',
  largest: 'labelLargest',
};

function isTextSize(value: string | undefined): value is TextSize {
  return (ORDER as readonly string[]).includes(value ?? '');
}

function currentSize(): TextSize {
  const value = document.documentElement.dataset.textSize;
  return isTextSize(value) ? value : 'normal';
}

/** Normal is the absence of the setting, both in the DOM and in storage. */
function apply(size: TextSize): void {
  const root = document.documentElement;
  if (size === 'normal') delete root.dataset.textSize;
  else root.dataset.textSize = size;

  try {
    if (size === 'normal') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, size);
  } catch {
    // Private mode or blocked storage: the choice simply does not survive a reload.
  }
}

export function initTextSizeToggles(): void {
  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-text-size-toggle]'),
  );
  if (buttons.length === 0) return;

  const sync = (): void => {
    const size = currentSize();
    for (const button of buttons) {
      const label = button.dataset[LABEL[size]];
      if (label) button.setAttribute('aria-label', label);
      const filled = ORDER.indexOf(size) + 1;
      const dots = button.querySelectorAll<SVGElement>('[data-text-size-dots] circle');
      dots.forEach((dot, index) => dot.classList.toggle('is-on', index < filled));
    }
  };

  for (const button of buttons) {
    button.addEventListener('click', () => {
      const next = ORDER[(ORDER.indexOf(currentSize()) + 1) % ORDER.length];
      apply(next);
      sync();
    });
  }

  sync();
}
