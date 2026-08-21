import type { SceneModule } from './types';

/**
 * Loads a scene timeline in the browser. Each branch is a static import
 * specifier so the bundler can split every scene into its own chunk.
 */
export async function loadScene(id: string): Promise<SceneModule | null> {
  switch (id) {
    case 'circuit-breaker':
      return (await import('./circuit-breaker/scene')).default;
    case 'retry':
      return (await import('./retry/scene')).default;
    case 'rate-limiter':
      return (await import('./rate-limiter/scene')).default;
    case 'bulkhead':
      return (await import('./bulkhead/scene')).default;
    default:
      return null;
  }
}
