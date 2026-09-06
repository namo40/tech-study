// @ts-check
import sitemap from '@astrojs/sitemap';
import { defineConfig, fontProviders } from 'astro/config';

/**
 * `SITE_URL` and `SITE_BASE` let the same build target a custom domain or a
 * project sub-path without touching the source. Everything internal is linked
 * through `import.meta.env.BASE_URL`, so changing `SITE_BASE` is enough.
 */
const site = process.env.SITE_URL ?? 'http://localhost:4321';
const base = process.env.SITE_BASE ?? '/';

/** The site root as a path, carrying the trailing slash the sitemap URLs use. */
const rootPath = base.endsWith('/') ? base : `${base}/`;

/**
 * Each Noto family arrives cut into one @font-face per unicode range, so a
 * reader downloads only the ranges a page puts on screen. That split survives
 * here only for the subsets named below, because anything left out is dropped
 * from the stylesheet along with its ranges. Both lists therefore name every
 * subset the source publishes for the family. The CJK ranges themselves carry
 * no subset name and ride along with whichever named subset precedes them.
 *
 * @type {[string, ...string[]]}
 */
const cjkSubsets = ['cyrillic', 'latin', 'latin-ext', 'vietnamese'];

/**
 * Noto Sans reaches further than the two CJK families and adds four scripts.
 *
 * @type {[string, ...string[]]}
 */
const latinSubsets = [...cjkSubsets, 'cyrillic-ext', 'devanagari', 'greek', 'greek-ext'];

/** Shared settings for the three Noto families, one per locale. */
const notoFamily = {
  provider: fontProviders.google(),
  weights: /** @type {[number, ...number[]]} */ ([400, 600, 700]),
  styles: /** @type {['normal']} */ (['normal']),
  fallbacks: ['system-ui', 'sans-serif'],
  display: /** @type {'swap'} */ ('swap'),
};

export default defineConfig({
  site,
  base,
  output: 'static',
  trailingSlash: 'ignore',
  /*
   * The font files are fetched at build time and served from this site, so a
   * page loads no stylesheet and no font from Google.
   */
  fonts: [
    { ...notoFamily, name: 'Noto Sans', cssVariable: '--font-noto-sans', subsets: latinSubsets },
    { ...notoFamily, name: 'Noto Sans KR', cssVariable: '--font-noto-sans-kr', subsets: cjkSubsets },
    { ...notoFamily, name: 'Noto Sans JP', cssVariable: '--font-noto-sans-jp', subsets: cjkSubsets },
  ],
  integrations: [
    sitemap({
      // Every page exists in all three languages, so each entry names the
      // other two as alternates under the language code the markup uses.
      i18n: {
        defaultLocale: 'en',
        locales: { en: 'en', ko: 'ko', ja: 'ja' },
      },
      /*
       * The root only forwards to the default locale, and the 404 stands in
       * for addresses that have no page. Neither is somewhere a reader should
       * land from a search result.
       */
      filter: (page) => {
        const { pathname } = new URL(page);
        return (
          pathname !== rootPath &&
          pathname !== `${rootPath}404` &&
          pathname !== `${rootPath}404/`
        );
      },
    }),
  ],
  markdown: {
    shikiConfig: {
      // Dual themes emit CSS variables instead of baked-in colours, so code
      // blocks follow the theme toggle like everything else.
      themes: { light: 'github-light', dark: 'github-dark' },
      defaultColor: false,
      wrap: false,
    },
  },
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'ko', 'ja'],
    routing: {
      prefixDefaultLocale: true,
      // The root redirect is served by `src/pages/index.astro`, which forwards
      // immediately. Astro's built-in root redirect would take priority over
      // that page and waits two seconds before moving on.
      redirectToDefaultLocale: false,
    },
  },
});
