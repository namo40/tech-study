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
    case 'n-plus-1-query':
      return (await import('./n-plus-1-query/scene')).default;
    case 'tail-latency':
      return (await import('./tail-latency/scene')).default;
    case 'sticky-session':
      return (await import('./sticky-session/scene')).default;
    case 'web-queue-worker':
      return (await import('./web-queue-worker/scene')).default;
    case 'command-query-responsibility-segregation':
      return (await import('./command-query-responsibility-segregation/scene')).default;
    case 'strangler-fig':
      return (await import('./strangler-fig/scene')).default;
    case 'request-timeout':
      return (await import('./request-timeout/scene')).default;
    case 'idempotency-key':
      return (await import('./idempotency-key/scene')).default;
    case 'competing-consumers':
      return (await import('./competing-consumers/scene')).default;
    default:
      return null;
  }
}
