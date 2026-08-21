import { withBase } from '../utils/base';
import en, { type MessageKey, type Messages } from './en';
import ko from './ko';
import ja from './ja';

export const locales = ['en', 'ko', 'ja'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';

export type { MessageKey, Messages };

const messages: Record<Locale, Messages> = { en, ko, ja };

/** HTML `lang` / `hreflang` values for each locale. */
export const htmlLang: Record<Locale, string> = {
  en: 'en',
  ko: 'ko',
  ja: 'ja',
};

/**
 * One Google Fonts stylesheet per locale, so a reader never downloads the CJK
 * face they do not need.
 */
export const fontStylesheet: Record<Locale, string> = {
  en: 'https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;600;700&display=swap',
  ko: 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;600;700&display=swap',
  ja: 'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;600;700&display=swap',
};

/** CSS `font-family` stack for each locale. */
export const fontFamily: Record<Locale, string> = {
  en: "'Noto Sans', system-ui, sans-serif",
  ko: "'Noto Sans KR', system-ui, sans-serif",
  ja: "'Noto Sans JP', system-ui, sans-serif",
};

export function isLocale(value: string | undefined): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}

export function toLocale(value: string | undefined): Locale {
  return isLocale(value) ? value : defaultLocale;
}

/**
 * Looks up a message and fills `{name}` placeholders.
 */
export function t(locale: Locale, key: MessageKey, params?: Record<string, string | number>): string {
  const template = messages[locale][key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

/**
 * Builds an in-site path for a locale.
 *
 * @param path Path below the locale segment, without a leading slash.
 */
export function localePath(locale: Locale, path = ''): string {
  const suffix = path ? `${path.replace(/^\/+|\/+$/g, '')}/` : '';
  return withBase(`/${locale}/${suffix}`);
}

/** The autonym of `target`, taken from the message set of `locale`. */
export function localeName(locale: Locale, target: Locale): string {
  return t(locale, `lang.${target}` as MessageKey);
}

/** Every locale variant of the same page, for the language switcher and `hreflang`. */
export function alternatePaths(path = ''): { locale: Locale; path: string }[] {
  return locales.map((locale) => ({ locale, path: localePath(locale, path) }));
}
