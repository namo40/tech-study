import { glob } from 'astro/loaders';
import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';

/**
 * Cross-cutting keyword tags. They run across the category axis rather than
 * repeating it, so a page can carry a few of them or none at all. The English
 * slug is canonical and the display label comes from the `tag.<slug>` message
 * key, which is why tags are written in the English file only.
 */
export const TAGS = [
  'consistency',
  'database',
  'deployment',
  'duplicates',
  'ef-core',
  'kubernetes',
  'latency',
  'memory',
  'metric',
  'oauth',
  'overload',
  'queue',
] as const;

export type Tag = (typeof TAGS)[number];

/**
 * One markdown file per locale, stored as `<slug>/<locale>.md`. The loader
 * derives the entry id from that path, so `circuit-breaker/ko` identifies the
 * Korean version of the `circuit-breaker` page.
 */
const concepts = defineCollection({
  loader: glob({ base: './src/content/concepts', pattern: '**/*.md' }),
  schema: z.object({
    title: z.string(),
    /** One sentence definition shown under the heading. */
    summary: z.string(),
    /** Localized category label. */
    category: z.string(),
    /**
     * Cross-cutting keyword tags, at most three. Written in the English file
     * only: the index reads them from there so every locale shows the same
     * tags on the same page.
     */
    tags: z.array(z.enum(TAGS)).max(3).default([]),
    /**
     * Identifier of the animated scene, when the page has one. Three kinds of
     * page name a scene. The page that owns it names its own slug and writes
     * the steps. A sub-keyword page names the owning page and adds `sceneStep`,
     * so the player opens on that step. An alias page, whose concept is the
     * whole scene, names the owning page and leaves `sceneStep` out, so the
     * player runs from the first step. The last two borrow the owner's steps.
     */
    scene: z.string().optional(),
    /**
     * Step of the scene this page is about. A sub-keyword page sets it so the
     * player opens on that step and reuses the parent page's step text. A page
     * that owns its scene, or that borrows a parent scene whole, leaves it out.
     */
    sceneStep: z.number().int().min(1).max(8).optional(),
    /**
     * Step-by-step explanation, shown as a title card over the scene. A page
     * that leaves it empty inherits the steps of its parent scene page.
     */
    steps: z
      .array(
        z.object({
          title: z.string(),
          text: z.string(),
        }),
      )
      .default([]),
    /** Neighbouring concepts. Entries without a published page render as text. */
    related: z
      .array(
        z.object({
          label: z.string(),
          slug: z.string().optional(),
        }),
      )
      .default([]),
    /** Primary sources, rendered as a link list. */
    references: z
      .array(
        z.object({
          title: z.string(),
          url: z.string(),
        }),
      )
      .default([]),
  }),
});

export const collections = { concepts };
