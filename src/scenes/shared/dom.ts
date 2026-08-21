/**
 * Queries a required element and fails loudly when the stage markup and the
 * timeline have drifted apart.
 */
export function q<T extends Element>(root: ParentNode, selector: string, sceneId: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`${sceneId} scene: element "${selector}" is missing`);
  return element;
}

/** Queries every match, in document order. */
export function qa<T extends Element>(root: ParentNode, selector: string): T[] {
  return Array.from(root.querySelectorAll<T>(selector));
}
