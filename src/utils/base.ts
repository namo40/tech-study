/**
 * Prefixes an absolute in-site path with the configured base path.
 *
 * Every internal link and asset URL goes through this helper so the same build
 * works at the domain root and under a sub-path.
 */
export function withBase(path = '/'): string {
  const base = import.meta.env.BASE_URL ?? '/';
  const trimmedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const absolutePath = path.startsWith('/') ? path : `/${path}`;
  return `${trimmedBase}${absolutePath}`;
}
