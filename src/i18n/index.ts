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
 * The `cssVariable` each font family is registered under in the Astro config.
 * A page loads the one its locale needs, so a reader never downloads a CJK
 * face they have no use for.
 */
export const fontVariable: Record<Locale, import('astro:assets').CssVariable> = {
  en: '--font-noto-sans',
  ko: '--font-noto-sans-kr',
  ja: '--font-noto-sans-jp',
};

/**
 * CSS `font-family` stack for each locale. The variable already carries the
 * family name and the fallbacks behind it, so nothing is repeated here.
 */
export const fontFamily: Record<Locale, string> = {
  en: 'var(--font-noto-sans)',
  ko: 'var(--font-noto-sans-kr)',
  ja: 'var(--font-noto-sans-jp)',
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

/**
 * Splits a message around a single `{name}` placeholder, for the cases where
 * the value is an element rather than a string. Returns the text before and
 * after the placeholder.
 */
export function tSplit(locale: Locale, key: MessageKey, name: string): [string, string] {
  const template = messages[locale][key];
  const token = `{${name}}`;
  const index = template.indexOf(token);
  if (index < 0) return [template, ''];
  return [template.slice(0, index), template.slice(index + token.length)];
}

/** The autonym of `target`, taken from the message set of `locale`. */
export function localeName(locale: Locale, target: Locale): string {
  return t(locale, `lang.${target}` as MessageKey);
}

/** Every locale variant of the same page, for the language switcher and `hreflang`. */
export function alternatePaths(path = ''): { locale: Locale; path: string }[] {
  return locales.map((locale) => ({ locale, path: localePath(locale, path) }));
}
