/**
 * Reading state.
 *
 * What a reader has read and bookmarked stays in that reader's browser. There
 * is no account and no server behind this site, so localStorage is the whole
 * store: it belongs to one browser, it is the reader's to clear, and nothing
 * about it leaves the page.
 *
 * The key carries the site's name because GitHub Pages puts every project site
 * of an account on one `*.github.io` origin, and that origin has one
 * localStorage. A bare `reading` key would collide with the neighbours.
 *
 * A page that has been read remembers the content revision it was read at, per
 * locale, so a page rewritten since can say so instead of staying quietly
 * marked as read. Reading the English page and reading the Korean page are the
 * same act to a reader, so one entry covers the slug and the revisions sit
 * beside each other inside it.
 */

const STORAGE_KEY = 'tech-study:reading';

/** Fired on `window` after every write, so several controls in one document refresh together. */
const CHANGE_EVENT = 'tech-study:reading-change';

/** One page the reader has marked as read, with the revision read in each locale. */
export type ReadEntry = { at: number; rev: Record<string, string> };

export type ReadingState = {
  /** Schema version. A stored state that does not match is dropped rather than migrated. */
  v: 1;
  read: Record<string, ReadEntry>;
  bookmarks: Record<string, number>;
};

export type ReadState = 'unread' | 'read' | 'updated';

/**
 * This document's copy of the state. When storage is blocked the reader still
 * gets a button that answers for the length of the visit, which is better than
 * a control that silently does nothing.
 */
let memory: ReadingState | undefined;

function emptyState(): ReadingState {
  return { v: 1, read: {}, bookmarks: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isState(value: unknown): value is ReadingState {
  if (!isRecord(value)) return false;
  if (value.v !== 1 || !isRecord(value.read) || !isRecord(value.bookmarks)) return false;
  return (
    Object.values(value.read).every(
      (entry) => isRecord(entry) && typeof entry.at === 'number' && isRecord(entry.rev),
    ) &&
    Object.values(value.bookmarks).every((at) => typeof at === 'number')
  );
}

/** Anything the store cannot be trusted to hold reads as nothing at all. */
function parseState(raw: string | null): ReadingState | undefined {
  if (raw === null) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isState(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function loadState(): ReadingState {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private mode or blocked storage: this visit runs on its own copy.
    if (!memory) memory = emptyState();
    return memory;
  }
  memory = parseState(raw) ?? emptyState();
  return memory;
}

export function saveState(state: ReadingState): void {
  memory = state;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Blocked storage or a full quota: the change holds for this visit only.
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

/**
 * Calls `handler` after every change, whether it came from this document or
 * from the same site open in another tab. Returns the unsubscribe.
 */
export function onReadingChange(handler: () => void): () => void {
  const onLocal = (): void => handler();
  const onStorage = (event: StorageEvent): void => {
    // A null key means the other tab cleared the whole store, which takes this key with it.
    if (event.key === null || event.key === STORAGE_KEY) handler();
  };
  window.addEventListener(CHANGE_EVENT, onLocal);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onLocal);
    window.removeEventListener('storage', onStorage);
  };
}

/**
 * A page read in another language still counts as read, because the reader
 * knows the concept either way. Only the language actually read carries a
 * revision, so only that language can report the page as rewritten.
 */
export function readStateOf(state: ReadingState, slug: string, lang: string, rev: string): ReadState {
  const entry: ReadEntry | undefined = state.read[slug];
  if (!entry) return 'unread';
  const seen: string | undefined = entry.rev[lang];
  return seen !== undefined && seen !== rev ? 'updated' : 'read';
}

export function markRead(slug: string, lang: string, rev: string): ReadingState {
  const state = loadState();
  const entry: ReadEntry | undefined = state.read[slug];
  const next: ReadingState = {
    ...state,
    read: {
      ...state.read,
      [slug]: { at: Date.now(), rev: { ...entry?.rev, [lang]: rev } },
    },
  };
  saveState(next);
  return next;
}

export function markUnread(slug: string): ReadingState {
  const state = loadState();
  const read = { ...state.read };
  delete read[slug];
  const next: ReadingState = { ...state, read };
  saveState(next);
  return next;
}

export function isBookmarked(state: ReadingState, slug: string): boolean {
  return Object.prototype.hasOwnProperty.call(state.bookmarks, slug);
}

export function toggleBookmark(slug: string): ReadingState {
  const state = loadState();
  const bookmarks = { ...state.bookmarks };
  if (isBookmarked(state, slug)) delete bookmarks[slug];
  else bookmarks[slug] = Date.now();
  const next: ReadingState = { ...state, bookmarks };
  saveState(next);
  return next;
}

/** The symbol each state wears, so the state still reads with the colour taken away. */
const READ_SYMBOL: Record<ReadState, string> = {
  unread: '',
  read: '✓',
  updated: '↻',
};

const BOOKMARK_SYMBOL = { off: '☆', on: '★' };

/** A title is the extra sentence for the pressed state only, so the unpressed state drops it. */
function setTitle(button: HTMLButtonElement, title: string | undefined): void {
  if (title) button.setAttribute('title', title);
  else button.removeAttribute('title');
}

/**
 * Wires one set of controls and hands back the function that redraws it, or
 * nothing when the element is missing a part it cannot work without. The read
 * toggle is required; the bookmark button is not, because the row that closes
 * the body offers the toggle alone.
 *
 * A press only writes. The redraw arrives through the change event, which is
 * what keeps a second row on the same page, and a second tab, in step with it.
 */
function wireControls(root: HTMLElement): ((state: ReadingState) => void) | undefined {
  const readButton = root.querySelector<HTMLButtonElement>('[data-read-toggle]');
  const readSymbol = root.querySelector<HTMLElement>('[data-read-symbol]');
  const readLabel = root.querySelector<HTMLElement>('[data-read-label]');
  const updatedNote = root.querySelector<HTMLElement>('[data-updated-note]');
  if (!readButton || !readSymbol || !readLabel || !updatedNote) return undefined;

  const bookmarkButton = root.querySelector<HTMLButtonElement>('[data-bookmark-toggle]');
  const bookmarkSymbol = root.querySelector<HTMLElement>('[data-bookmark-symbol]');
  const bookmarkLabel = root.querySelector<HTMLElement>('[data-bookmark-label]');

  const slug = root.dataset.slug ?? '';
  const lang = root.dataset.lang ?? '';
  const rev = root.dataset.rev ?? '';

  readButton.addEventListener('click', () => {
    // Read at the press rather than trusting the drawn state, which another tab may have moved on from.
    if (readStateOf(loadState(), slug, lang, rev) === 'read') markUnread(slug);
    else markRead(slug, lang, rev);
  });

  if (bookmarkButton) {
    bookmarkButton.addEventListener('click', () => {
      toggleBookmark(slug);
    });
  }

  return (state) => {
    const read = readStateOf(state, slug, lang, rev);
    const labels = readButton.dataset;
    const label =
      read === 'read'
        ? labels.labelRead
        : read === 'updated'
          ? labels.labelUpdated
          : labels.labelUnread;
    readSymbol.textContent = READ_SYMBOL[read];
    readLabel.textContent = label ?? '';
    readButton.setAttribute('aria-pressed', String(read === 'read'));
    setTitle(readButton, read === 'read' ? labels.titleRead : undefined);
    updatedNote.hidden = read !== 'updated';

    if (!bookmarkButton || !bookmarkSymbol || !bookmarkLabel) return;
    const marked = isBookmarked(state, slug);
    bookmarkSymbol.textContent = marked ? BOOKMARK_SYMBOL.on : BOOKMARK_SYMBOL.off;
    bookmarkLabel.textContent =
      (marked ? bookmarkButton.dataset.labelOn : bookmarkButton.dataset.labelOff) ?? '';
    bookmarkButton.setAttribute('aria-pressed', String(marked));
    setTitle(bookmarkButton, marked ? bookmarkButton.dataset.titleOn : undefined);
  };
}

/**
 * Wires every set of controls on the page, and does nothing on a page with
 * none. A concept page carries two, one on the meta line and one under the
 * body, and they share a single subscription and a single read of the stored
 * state so that they can never disagree about it.
 */
export function initReadingControls(): void {
  const renders = Array.from(
    document.querySelectorAll<HTMLElement>('[data-reading]'),
    wireControls,
  ).filter((render): render is (state: ReadingState) => void => render !== undefined);
  if (renders.length === 0) return;

  const renderAll = (): void => {
    const state = loadState();
    for (const render of renders) render(state);
  };

  onReadingChange(renderAll);
  renderAll();
}
