#!/usr/bin/env node
/**
 * Downloads the web fonts the site uses and writes a stylesheet for each
 * language, so a reader loads them from this site rather than from a font
 * host.
 *
 * One stylesheet per language, because a Korean page has no use for the
 * Japanese face and the other way round. Each stylesheet keeps the shape the
 * font host published: one `@font-face` per unicode range, `unicode-range`
 * intact, the subset comments intact. That split is what stops a CJK page from
 * pulling a whole script down at once — the browser reads the ranges and asks
 * only for the files the page's characters fall into.
 *
 * Why a browser user agent: the font host answers the same stylesheet URL
 * differently depending on who asks. An old or unknown agent gets TTF files
 * and one `@font-face` per family, with no unicode ranges at all. A current
 * Chrome gets woff2 and the range split. So the request carries a current
 * Chrome agent string, and it is worth keeping it current: the agent decides
 * which flavour of the files this script stores.
 *
 * Output, all of it ignored by Git and rebuilt on demand:
 *
 *   public/fonts/<lang>.css        the stylesheet a page links
 *   public/fonts/<16 hex>.woff2    the font files it points at
 *
 * File names are the first 16 hex of the SHA-1 of the source URL, so a rerun
 * names every file exactly as the run before it. The stylesheets point at them
 * with a relative URL, which resolves against the stylesheet's own address:
 * that keeps the output correct whether the site sits at a domain root or
 * under a sub-path, with no build-time base path baked in.
 *
 * Usage:
 *   node scripts/fetch-fonts.mjs            # fetch what is missing
 *   node scripts/fetch-fonts.mjs --force    # fetch everything again
 *
 * `npm run build` runs this first, so a clean checkout builds without a
 * separate step. A file already on disk is left alone, which makes the common
 * case a no-op and lets CI cache the directory.
 */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(HERE, '..', 'public', 'fonts');

/**
 * A current Chrome, for the reason in the header comment. Raising this changes
 * which files the host serves, so it belongs to a deliberate refresh
 * (`npm run fonts -- --force`) rather than to a passing edit.
 */
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/152.0.0.0 Safari/537.36';

/** Where the stylesheets are asked for. Nothing of it reaches the built site. */
const CSS_HOST = 'https://fonts.googleapis.com';

/** One family per language, at the three weights the styles use. */
const FAMILIES = [
  { lang: 'en', family: 'Noto Sans' },
  { lang: 'ko', family: 'Noto Sans KR' },
  { lang: 'ja', family: 'Noto Sans JP' },
];

const WEIGHTS = [400, 600, 700];

const force = process.argv.includes('--force');

/** The stylesheet URL for one family, the same one a browser would request. */
function stylesheetUrl(family) {
  const name = family.replaceAll(' ', '+');
  return `${CSS_HOST}/css2?family=${name}:wght@${WEIGHTS.join(';')}&display=swap`;
}

/** Deterministic local name for a source URL. */
function localName(url) {
  const digest = createHash('sha1').update(url).digest('hex').slice(0, 16);
  const extension = path.extname(new URL(url).pathname) || '.woff2';
  return `${digest}${extension}`;
}

/**
 * Fetches a URL, retrying a couple of times so one dropped connection in a
 * few hundred does not fail the build.
 */
async function get(url, label) {
  let last = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      return response;
    } catch (error) {
      last = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
      }
    }
  }
  throw new Error(`cannot fetch ${label}: ${last?.message ?? 'unknown error'}`);
}

/** Runs `worker` over `items`, a few at a time. */
async function pool(items, limit, worker) {
  const queue = [...items];
  const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) {
      await worker(queue.shift());
    }
  });
  await Promise.all(runners);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  /** Source URL to local name, shared across languages: one file, one download. */
  const files = new Map();
  let written = 0;

  for (const { lang, family } of FAMILIES) {
    const url = stylesheetUrl(family);
    const response = await get(url, `the stylesheet for ${family}`);
    const source = await response.text();

    if (!source.includes('@font-face')) {
      throw new Error(`the stylesheet for ${family} holds no @font-face rules`);
    }

    // Every `url(...)` becomes a name in this directory, and the source URL is
    // remembered so the file behind it can be fetched once.
    const rewritten = source.replace(/url\((['"]?)(https?:\/\/[^)'"]+)\1\)/g, (_all, _quote, href) => {
      const name = localName(href);
      files.set(href, name);
      return `url(./${name})`;
    });

    if (!rewritten.includes('url(./')) {
      throw new Error(`the stylesheet for ${family} names no font files`);
    }
    const leftover = rewritten.match(/https?:\/\/[^\s)'"]+/);
    if (leftover) {
      throw new Error(`an address survived the rewrite in ${lang}.css: ${leftover[0]}`);
    }

    const header =
      `/* Generated by scripts/fetch-fonts.mjs for the ${lang} pages. Not edited by hand. */\n`;
    await writeFile(path.join(OUT_DIR, `${lang}.css`), header + rewritten, 'utf8');
    const faces = rewritten.match(/@font-face/g)?.length ?? 0;
    const ranges = rewritten.match(/unicode-range/g)?.length ?? 0;
    console.log(`${lang}.css  ${faces} @font-face, ${ranges} unicode-range`);
    written++;
  }

  const pending = [...files].filter(([, name]) => force || !existsSync(path.join(OUT_DIR, name)));
  console.log(
    `${files.size} font file(s) referenced, ${pending.length} to fetch` +
      `${force ? ' (--force)' : ''}`,
  );

  let done = 0;
  await pool(pending, 8, async ([url, name]) => {
    const response = await get(url, `the font file ${name}`);
    const body = Buffer.from(await response.arrayBuffer());
    if (!body.length) {
      throw new Error(`the font file ${name} came back empty`);
    }
    await writeFile(path.join(OUT_DIR, name), body);
    done++;
    if (done % 32 === 0 || done === pending.length) {
      console.log(`  ${done}/${pending.length} font file(s)`);
    }
  });

  const names = await readdir(OUT_DIR);
  let bytes = 0;
  for (const name of names) {
    bytes += (await stat(path.join(OUT_DIR, name))).size;
  }
  const fonts = names.filter((name) => name.endsWith('.woff2')).length;
  console.log(
    `public/fonts: ${written} stylesheet(s), ${fonts} font file(s), ` +
      `${(bytes / 1024 / 1024).toFixed(1)} MB`,
  );
}

main().catch((error) => {
  console.error(`fetch-fonts: ${error.message}`);
  process.exit(1);
});
