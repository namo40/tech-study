/**
 * Theme toggle. The initial `data-theme` value is set by an inline script in
 * the document head so there is no flash before the first paint; this module
 * only handles the click and keeps the button labels in sync.
 */

const STORAGE_KEY = 'theme';

type Theme = 'dark' | 'light';

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function persist(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private mode or blocked storage: the choice simply does not survive a reload.
  }
}

export function initThemeToggles(): void {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]'));
  if (buttons.length === 0) return;

  const sync = (): void => {
    const theme = currentTheme();
    for (const button of buttons) {
      button.setAttribute('aria-pressed', String(theme === 'dark'));
      const label = theme === 'dark' ? button.dataset.labelToLight : button.dataset.labelToDark;
      if (label) button.setAttribute('aria-label', label);
      const icons = button.querySelectorAll<SVGElement>('[data-theme-icon]');
      for (const icon of icons) {
        icon.classList.toggle('is-hidden', icon.dataset.themeIcon !== theme);
      }
    }
  };

  for (const button of buttons) {
    button.addEventListener('click', () => {
      const next: Theme = currentTheme() === 'light' ? 'dark' : 'light';
      document.documentElement.dataset.theme = next;
      persist(next);
      sync();
    });
  }

  sync();
}
