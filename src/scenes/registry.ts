import {
  SCENE_DURATION as circuitBreakerDuration,
  stageMarkup as circuitBreakerStage,
} from './circuit-breaker/stage';
import {
  SCENE_DURATION as nPlusOneDuration,
  stageMarkup as nPlusOneStage,
} from './n-plus-1-query/stage';
import {
  SCENE_DURATION as middlewareDuration,
  stageMarkup as middlewareStage,
} from './middleware-pipeline/stage';
import {
  SCENE_DURATION as threadPoolDuration,
  stageMarkup as threadPoolStage,
} from './thread-pool/stage';
import {
  SCENE_DURATION as connectionPoolDuration,
  stageMarkup as connectionPoolStage,
} from './database-connection-pool/stage';
import {
  SCENE_DURATION as cacheInvalidationDuration,
  stageMarkup as cacheInvalidationStage,
} from './cache-invalidation/stage';
import {
  SCENE_DURATION as cacheAsideDuration,
  stageMarkup as cacheAsideStage,
} from './cache-aside/stage';
import {
  SCENE_DURATION as bulkheadDuration,
  stageMarkup as bulkheadStage,
} from './bulkhead/stage';
import {
  SCENE_DURATION as rateLimiterDuration,
  stageMarkup as rateLimiterStage,
} from './rate-limiter/stage';
import { SCENE_DURATION as retryDuration, stageMarkup as retryStage } from './retry/stage';
import {
  SCENE_DURATION as tailLatencyDuration,
  stageMarkup as tailLatencyStage,
} from './tail-latency/stage';
import {
  SCENE_DURATION as stickySessionDuration,
  stageMarkup as stickySessionStage,
} from './sticky-session/stage';
import {
  SCENE_DURATION as webQueueWorkerDuration,
  stageMarkup as webQueueWorkerStage,
} from './web-queue-worker/stage';
import {
  SCENE_DURATION as cqrsDuration,
  stageMarkup as cqrsStage,
} from './command-query-responsibility-segregation/stage';
import {
  SCENE_DURATION as stranglerFigDuration,
  stageMarkup as stranglerFigStage,
} from './strangler-fig/stage';
import {
  SCENE_DURATION as requestTimeoutDuration,
  stageMarkup as requestTimeoutStage,
} from './request-timeout/stage';
import {
  SCENE_DURATION as idempotencyKeyDuration,
  stageMarkup as idempotencyKeyStage,
} from './idempotency-key/stage';
import {
  SCENE_DURATION as competingConsumersDuration,
  stageMarkup as competingConsumersStage,
} from './competing-consumers/stage';
import {
  SCENE_DURATION as loadBalancerDuration,
  stageMarkup as loadBalancerStage,
} from './load-balancer/stage';
import {
  SCENE_DURATION as materializedViewDuration,
  stageMarkup as materializedViewStage,
} from './materialized-view/stage';
import {
  SCENE_DURATION as replicationLagDuration,
  stageMarkup as replicationLagStage,
} from './replication-lag/stage';
import {
  SCENE_DURATION as deadlockDuration,
  stageMarkup as deadlockStage,
} from './deadlock/stage';
import { SCENE_DURATION as sagaDuration, stageMarkup as sagaStage } from './saga/stage';
import {
  SCENE_DURATION as distributedLockDuration,
  stageMarkup as distributedLockStage,
} from './distributed-lock/stage';
import {
  SCENE_DURATION as authorizationCodeDuration,
  stageMarkup as authorizationCodeStage,
} from './authorization-code/stage';
import { SCENE_DURATION as corsDuration, stageMarkup as corsStage } from './cors/stage';

/**
 * The part of a scene that renders on the server: its static stage markup and
 * its length. Timelines depend on GSAP and are loaded in the browser only,
 * through `load.ts`. Step text comes from the content collection, not from
 * here, so translators edit it alongside the rest of the page.
 */
export interface SceneAsset {
  markup: string;
  duration: number;
}

const scenes: Record<string, SceneAsset> = {
  'circuit-breaker': {
    markup: circuitBreakerStage,
    duration: circuitBreakerDuration,
  },
  retry: {
    markup: retryStage,
    duration: retryDuration,
  },
  'rate-limiter': {
    markup: rateLimiterStage,
    duration: rateLimiterDuration,
  },
  bulkhead: {
    markup: bulkheadStage,
    duration: bulkheadDuration,
  },
  'cache-aside': {
    markup: cacheAsideStage,
    duration: cacheAsideDuration,
  },
  'cache-invalidation': {
    markup: cacheInvalidationStage,
    duration: cacheInvalidationDuration,
  },
  'database-connection-pool': {
    markup: connectionPoolStage,
    duration: connectionPoolDuration,
  },
  'thread-pool': {
    markup: threadPoolStage,
    duration: threadPoolDuration,
  },
  'middleware-pipeline': {
    markup: middlewareStage,
    duration: middlewareDuration,
  },
  'n-plus-1-query': {
    markup: nPlusOneStage,
    duration: nPlusOneDuration,
  },
  'tail-latency': {
    markup: tailLatencyStage,
    duration: tailLatencyDuration,
  },
  'sticky-session': {
    markup: stickySessionStage,
    duration: stickySessionDuration,
  },
  'web-queue-worker': {
    markup: webQueueWorkerStage,
    duration: webQueueWorkerDuration,
  },
  'command-query-responsibility-segregation': {
    markup: cqrsStage,
    duration: cqrsDuration,
  },
  'strangler-fig': {
    markup: stranglerFigStage,
    duration: stranglerFigDuration,
  },
  'request-timeout': {
    markup: requestTimeoutStage,
    duration: requestTimeoutDuration,
  },
  'idempotency-key': {
    markup: idempotencyKeyStage,
    duration: idempotencyKeyDuration,
  },
  'competing-consumers': {
    markup: competingConsumersStage,
    duration: competingConsumersDuration,
  },
  'load-balancer': {
    markup: loadBalancerStage,
    duration: loadBalancerDuration,
  },
  'materialized-view': {
    markup: materializedViewStage,
    duration: materializedViewDuration,
  },
  deadlock: {
    markup: deadlockStage,
    duration: deadlockDuration,
  },
  'replication-lag': {
    markup: replicationLagStage,
    duration: replicationLagDuration,
  },
  saga: {
    markup: sagaStage,
    duration: sagaDuration,
  },
  'distributed-lock': {
    markup: distributedLockStage,
    duration: distributedLockDuration,
  },
  'authorization-code': {
    markup: authorizationCodeStage,
    duration: authorizationCodeDuration,
  },
  cors: {
    markup: corsStage,
    duration: corsDuration,
  },
};

export function getSceneAsset(id: string | undefined): SceneAsset | undefined {
  return id ? scenes[id] : undefined;
}
