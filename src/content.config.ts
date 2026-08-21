import { glob } from 'astro/loaders';
import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';

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
    /** Identifier of the animated scene, when the page has one. */
    scene: z.string().optional(),
    /**
     * Step of the scene this page is about. Sub-keyword pages set it so the
     * player opens on that step and reuses the parent page's step text.
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
