# Tech Study

**English** | [한국어](README.ko.md) | [日本語](README.ja.md)

Motion explainers for server technology.

Tech Study is a static site that explains server technology keywords with short animated scenes. One keyword gets one page, and every page is published in English, Korean, and Japanese. Each concept is explained in general terms first, then shown the way it looks in .NET.

## Stack

- **Astro** for static output, content collections, and locale-prefixed routing.
- **SVG and GSAP** for the scenes. Each scene is one 1080×1520 canvas driven by a single timeline, with play, pause, step, and scrub controls.
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
| `npm run verify` | Checks every scene against the timeline contract |
| `npm run baseline` | Records a frame-by-frame fingerprint of every scene |
| `npm run baseline:compare` | Compares the scenes against the recorded fingerprint |

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

The site is published at `https://namo40.github.io/tech-study/` by `.github/workflows/deploy.yml`, which runs on every push to `main` and can also be started by hand from the Actions tab. It type checks the project, verifies the scenes, builds with `SITE_URL=https://namo40.github.io` and `SITE_BASE=/tech-study/`, and hands the result to GitHub Pages. Nothing is committed to a `gh-pages` branch, so the repository's Pages source has to be set to **GitHub Actions** rather than to a branch.

`public/robots.txt` is copied to the site as it is, and its `Sitemap:` line spells out the full address of the sitemap index. That line is the one place the published address is written by hand, so changing `SITE_URL` or `SITE_BASE` means editing it as well.

The sitemap itself is generated from `site`, which falls back to `http://localhost:4321` when `SITE_URL` is unset. A plain local build therefore writes localhost URLs into `sitemap-0.xml`; only a build with both variables set produces a sitemap worth publishing.

## Project structure

```
astro.config.mjs        Site URL, base path, and locale routing
src/
  content.config.ts     Schema for the concepts collection
  content/concepts/     One markdown file per locale, per keyword
  i18n/                 Interface strings; English defines the key set
  layouts/              Document shell: head, fonts, theme, header, footer
  pages/                Root redirect, 404, /{lang}/, /{lang}/{slug}
  components/           Header, language switcher, theme toggle, scene player
  scenes/               Stage markup, stage styles, and GSAP timelines
  scripts/              Player, sound cues, theme toggle
  styles/               Design tokens, global styles, shared scene widgets
```

A page either owns a scene, points at one step of a parent scene with `sceneStep`, or borrows the whole parent scene as an alias; the last two reuse the parent's step text.

## Adding a scene

A scene is a folder under `src/scenes/<id>/` holding two modules and a stylesheet.

`stage.ts` exports `stageMarkup`, the static SVG the page ships with. Build it from the shared builders in `src/scenes/shared/stage.ts`: `clientBox`, `nodeFrame`, `serviceBox`, `verticalLink`, `healthDot`, `slotRow`, `counterVariants`, `timerRing`, `trackAndFill`, `chip`, `requestsLayer`. Every coordinate is an argument, so a stage keeps its own numbers and still reads as the same diagram as its neighbours. Coordinates are written in a 1080 × 1920 space that the shared `VIEWBOX` crops to `0 400 1080 1520`, so `y` 0..400 is outside the canvas and `y` 400..440 is the frame's top padding above the first box. The module is imported on the server, so it must not pull in GSAP, and it has to end with the empty `scene-requests` layer the player fills at run time.

`scene.ts` exports the default `SceneModule` and builds the timeline. Open with `createSceneTimeline()` and close with `finishSceneTimeline(tl, SCENE_DURATION)` from `src/scenes/shared/timeline.ts`: the first gives you a paused timeline, and the second pins the length and warms the timeline up in both directions so a state change scrubbed backwards for the first time still reverts. Register the finished scene in `src/scenes/registry.ts`.

Change state by attribute, never from a callback. `attr(tl, target, name, value, at)` in `src/scenes/shared/state.ts` writes a `data-*` value with a zero-length tween, and CSS keyed on that attribute decides what it looks like. That is what keeps both scrub directions and both themes correct, because the colour is never interpolated.

`stage.css` holds the rules for that one stage. The registry reads it as text and the page that draws the scene inlines it, so a reader downloads the rules for the stage in front of them and not for the other ninety. What every stage shares stays in `src/styles/scene.css`: the boxes, the connectors, and the widget classes — `.scene-track`, `.scene-fill`, `.scene-ring`, `.scene-counter`, `.scene-flash`, `.scene-slot`, `.scene-chip`, `.scene-mono`, `.scene-health` — which you write next to your own prefixed class. The scene rule then says only what is different, which is usually a custom property (`--fill-color`, `--ring-color`, `--ring-width`, `--flash-color`) and a font size. The shared stylesheet is linked from the head and the scene's is inlined in the body, so a prefixed rule still wins over the widget rule it sits next to. A rule written only with shared classes or state attributes can reach any stage, so it belongs in the shared stylesheet too, under its `Rules shared across stages` section, not in a scene's own file.

A scene with a queue, a pool, or anything else where one event books the next should work out its schedule first and lay tweens down afterwards. `createScheduler()` in `src/scenes/shared/simulation.ts` runs booked events earliest first and lets a running event book more, and `collapseLast` and `collapseAtInstant` fold changes that land on the same instant so a single frame does not depend on which way the reader scrubbed.

Sounds come from four cues: `success`, `failure`, `state`, `trip`. Anchor each one where the viewer sees the thing happen — a cache miss sounds when the request reaches the cache, not when the simulation decided it.

Every scene keeps the same contract: 24 seconds long, four steps labelled `step-1` to `step-4` in ascending order, `steps[]` times matching those labels, no request visible on the first or last frame, and forward and backward scrubbing agreeing at every 10 ms. `npm run verify` checks all of it and needs nothing recorded in advance. Once a scene is finished, `npm run baseline` records its frames and `npm run baseline:compare` holds later edits to them.

## Languages

English is the canonical language, and Korean and Japanese are translated from it. Interface strings live in `src/i18n`, where the English file defines the key set and the other two are type checked against it. Page prose lives in the content collection as one markdown file per locale. All three README files are kept in sync.

## Accessibility and motion

Scenes start playing when the page loads. When the reader prefers reduced motion, the player waits on the first frame instead, and moving between steps jumps to the start of the step and stays paused. The current step is shown as a caption card beside the stage on a wide screen and above it on a narrow one, so the explanation and the diagram stay together without either covering the other. Captions are page text rather than drawings, states are labelled as well as coloured, and results are marked with a check or a cross so colour is never the only signal. The text size button in the header steps the body text and the captions through five sizes and remembers the choice, while the drawing on the stage keeps the size it was designed at.

## License

MIT. See [LICENSE](LICENSE).
