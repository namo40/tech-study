import type { SceneModule } from './types';

/**
 * Loads a scene timeline in the browser. Each branch is a static import
 * specifier so the bundler can split every scene into its own chunk.
 */
export async function loadScene(id: string): Promise<SceneModule | null> {
  switch (id) {
    case 'workload-identity':
      return (await import('./workload-identity/scene')).default;
    case 'repository':
      return (await import('./repository/scene')).default;
    case 'domain-driven-design':
      return (await import('./domain-driven-design/scene')).default;
    case 'throughput':
      return (await import('./throughput/scene')).default;
    case 'key-rotation':
      return (await import('./key-rotation/scene')).default;
    case 'pagination':
      return (await import('./pagination/scene')).default;
    case 'elasticity':
      return (await import('./elasticity/scene')).default;
    case 'authentication':
      return (await import('./authentication/scene')).default;
    case 'prepared-statement':
      return (await import('./prepared-statement/scene')).default;
    case 'feature-flag':
      return (await import('./feature-flag/scene')).default;
    case 'poison-message':
      return (await import('./poison-message/scene')).default;
    case 'ordering':
      return (await import('./ordering/scene')).default;
    case 'publish-subscribe':
      return (await import('./publish-subscribe/scene')).default;
    case 'database-index':
      return (await import('./database-index/scene')).default;
    case 'pod-disruption-budget':
      return (await import('./pod-disruption-budget/scene')).default;
    case 'memory-pressure':
      return (await import('./memory-pressure/scene')).default;
    case 'two-phase-commit':
      return (await import('./two-phase-commit/scene')).default;
    case 'workflow-engine':
      return (await import('./workflow-engine/scene')).default;
    case 'event-sourcing':
      return (await import('./event-sourcing/scene')).default;
    case 'backpressure':
      return (await import('./backpressure/scene')).default;
    case 'fallback':
      return (await import('./fallback/scene')).default;
    case 'failover':
      return (await import('./failover/scene')).default;
    case 'blue-green-deployment':
      return (await import('./blue-green-deployment/scene')).default;
    case 'reverse-proxy':
      return (await import('./reverse-proxy/scene')).default;
    case 'leader-election':
      return (await import('./leader-election/scene')).default;
    case 'cache-stampede':
      return (await import('./cache-stampede/scene')).default;
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
    case 'load-balancer':
      return (await import('./load-balancer/scene')).default;
    case 'materialized-view':
      return (await import('./materialized-view/scene')).default;
    case 'deadlock':
      return (await import('./deadlock/scene')).default;
    case 'replication-lag':
      return (await import('./replication-lag/scene')).default;
    case 'saga':
      return (await import('./saga/scene')).default;
    case 'distributed-lock':
      return (await import('./distributed-lock/scene')).default;
    case 'authorization-code':
      return (await import('./authorization-code/scene')).default;
    case 'cors':
      return (await import('./cors/scene')).default;
    case 'distributed-tracing':
      return (await import('./distributed-tracing/scene')).default;
    case 'horizontal-pod-autoscaler':
      return (await import('./horizontal-pod-autoscaler/scene')).default;
    case 'rolling-update':
      return (await import('./rolling-update/scene')).default;
    case 'async-await':
      return (await import('./async-await/scene')).default;
    case 'state-machine':
      return (await import('./state-machine/scene')).default;
    case 'load-test':
      return (await import('./load-test/scene')).default;
    case 'change-tracking':
      return (await import('./change-tracking/scene')).default;
    case 'garbage-collection':
      return (await import('./garbage-collection/scene')).default;
    case 'eventual-consistency':
      return (await import('./eventual-consistency/scene')).default;
    case 'transactional-outbox':
      return (await import('./transactional-outbox/scene')).default;
    case 'readiness-probe':
      return (await import('./readiness-probe/scene')).default;
    case 'bearer-token':
      return (await import('./bearer-token/scene')).default;
    case 'dead-letter-queue':
      return (await import('./dead-letter-queue/scene')).default;
    case 'correlation-id':
      return (await import('./correlation-id/scene')).default;
    case 'cookie-authentication':
      return (await import('./cookie-authentication/scene')).default;
    case 'isolation-level':
      return (await import('./isolation-level/scene')).default;
    case 'oauth-2-0':
      return (await import('./oauth-2-0/scene')).default;
    case 'sharding':
      return (await import('./sharding/scene')).default;
    case 'database-migration':
      return (await import('./database-migration/scene')).default;
    case 'authorization':
      return (await import('./authorization/scene')).default;
    default:
      return null;
  }
}
