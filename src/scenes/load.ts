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
    case 'cache-aside':
      return (await import('./cache-aside/scene')).default;
    case 'cache-invalidation':
      return (await import('./cache-invalidation/scene')).default;
    case 'database-connection-pool':
      return (await import('./database-connection-pool/scene')).default;
    case 'thread-pool':
      return (await import('./thread-pool/scene')).default;
    case 'middleware-pipeline':
      return (await import('./middleware-pipeline/scene')).default;
    default:
      return null;
  }
}
