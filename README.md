# Tech Study

**English** | [한국어](README.ko.md) | [日本語](README.ja.md)

Motion explainers for server technology.

Tech Study is a static site that explains server technology keywords with short animated scenes. One keyword gets one page, and every page is published in English, Korean, and Japanese. Each concept is explained in general terms first, then shown the way it looks in .NET.

## Stack

- **Astro** for static output, content collections, and locale-prefixed routing.
- **SVG and GSAP** for the scenes. Each scene is one 9:16 canvas driven by a single timeline, with play, pause, step, and scrub controls.
- **TypeScript** for the player, the sound cues, and the theme toggle. There is no UI framework.
- Markdown content collections hold the page prose. Interface strings live in typed TypeScript modules.
- Sound effects are synthesized with the Web Audio API, so no audio files are shipped.

## Getting started

```sh
npm install
npm run dev
```

| Command | What it does |
| --- | --- |
| `npm install` | Installs dependencies |
| `npm run dev` | Starts the dev server on `http://localhost:4321` |
| `npm run build` | Builds the static site into `dist/` |
| `npm run preview` | Serves the built site locally |
| `npm run check` | Type checks the project with `astro check` |

## Configuration

Two environment variables control where the site is published.

| Variable | Default | Purpose |
| --- | --- | --- |
| `SITE_URL` | `http://localhost:4321` | Absolute origin used for canonical and `hreflang` URLs |
| `SITE_BASE` | `/` | Base path, for publishing under a sub-path |

```sh
SITE_URL=https://example.com SITE_BASE=/tech-study/ npm run build
```

Every internal link and asset goes through the base path, so moving between a domain root and a sub-path needs no source changes.

## Project structure

```
astro.config.mjs        Site URL, base path, and locale routing
src/
  content.config.ts     Schema for the concepts collection
  content/concepts/     One markdown file per locale, per keyword
  i18n/                 Interface strings; English defines the key set
  layouts/              Document shell: head, fonts, theme, header, footer
  pages/                Root redirect, /{lang}/, /{lang}/{slug}
  components/           Header, language switcher, theme toggle, scene player
  scenes/               Stage markup and GSAP timelines
  scripts/              Player, sound cues, theme toggle
  styles/               Design tokens, global styles, scene styles
```

## Languages

English is the canonical language, and Korean and Japanese are translated from it. Interface strings live in `src/i18n`, where the English file defines the key set and the other two are type checked against it. Page prose lives in the content collection as one markdown file per locale. All three README files are kept in sync.

## Accessibility and motion

Scenes start playing when the page loads. When the reader prefers reduced motion, the player waits on the first frame instead, and moving between steps jumps to the start of the step and stays paused. The current step is shown as a title card on the stage, so the explanation and the diagram stay together. Captions are page text rather than drawings, states are labelled as well as coloured, and results are marked with a check or a cross so colour is never the only signal.

## License

MIT. See [LICENSE](LICENSE).
