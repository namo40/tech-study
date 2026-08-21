// @ts-check
import { defineConfig } from 'astro/config';

/**
 * `SITE_URL` and `SITE_BASE` let the same build target a custom domain or a
 * project sub-path without touching the source. Everything internal is linked
 * through `import.meta.env.BASE_URL`, so changing `SITE_BASE` is enough.
 */
const site = process.env.SITE_URL ?? 'http://localhost:4321';
const base = process.env.SITE_BASE ?? '/';

export default defineConfig({
  site,
  base,
  output: 'static',
  trailingSlash: 'ignore',
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
