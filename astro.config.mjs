// @ts-check
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

/**
 * `SITE_URL` and `SITE_BASE` let the same build target a custom domain or a
 * project sub-path without touching the source. Everything internal is linked
 * through `import.meta.env.BASE_URL`, so changing `SITE_BASE` is enough.
 */
const site = process.env.SITE_URL ?? 'http://localhost:4321';
const base = process.env.SITE_BASE ?? '/';

/** The site root as a path, carrying the trailing slash the sitemap URLs use. */
const rootPath = base.endsWith('/') ? base : `${base}/`;

export default defineConfig({
  site,
  base,
  output: 'static',
  trailingSlash: 'ignore',
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
