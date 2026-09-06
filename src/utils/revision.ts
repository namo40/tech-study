import { createHash } from 'node:crypto';

/**
 * Eight hex characters that change whenever the page's readable content
 * changes.
 *
 * The site is static, so the revision is settled at build time and ships in
 * the markup. It is computed from one locale file, not from the page as a
 * whole: the Korean text can be rewritten while the English text stands still,
 * and only the reader who read the Korean version should hear about it.
 *
 * A reader who marks a page as read keeps a copy of the revision they read.
 * When the stored copy and the built one no longer agree, the page has been
 * rewritten since that reading, and the page can say so instead of quietly
 * staying marked as read.
 *
 * A hand-written version field in the frontmatter would be the obvious
 * alternative, but it would be one number per locale file across several
 * hundred pages, and the one that matters would always be the one somebody
 * forgot to raise. Hashing what the reader actually sees cannot be forgotten.
 */
export function pageRevision(entry: {
  body?: string;
  data: { summary: string; steps: { title: string; text: string }[] };
}): string {
  const content = `${entry.data.summary}\n${JSON.stringify(entry.data.steps)}\n${entry.body ?? ''}`;
  return createHash('sha1').update(content).digest('hex').slice(0, 8);
}
