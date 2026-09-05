import {
  SCENE_DURATION as errorBudgetDuration,
  stageMarkup as errorBudgetStage,
} from './error-budget/stage';
import errorBudgetCss from './error-budget/stage.css?raw';
import {
  SCENE_DURATION as evictionDuration,
  stageMarkup as evictionStage,
} from './eviction/stage';
import evictionCss from './eviction/stage.css?raw';
import {
  SCENE_DURATION as multiplexingDuration,
  stageMarkup as multiplexingStage,
} from './multiplexing/stage';
import multiplexingCss from './multiplexing/stage.css?raw';
import {
  SCENE_DURATION as crossSiteScriptingDuration,
  stageMarkup as crossSiteScriptingStage,
} from './cross-site-scripting/stage';
import crossSiteScriptingCss from './cross-site-scripting/stage.css?raw';
import {
  SCENE_DURATION as slidingWindowDuration,
  stageMarkup as slidingWindowStage,
} from './sliding-window/stage';
import slidingWindowCss from './sliding-window/stage.css?raw';
import {
  SCENE_DURATION as shadowDeploymentDuration,
  stageMarkup as shadowDeploymentStage,
} from './shadow-deployment/stage';
import shadowDeploymentCss from './shadow-deployment/stage.css?raw';
import {
  SCENE_DURATION as dependencyInjectionDuration,
  stageMarkup as dependencyInjectionStage,
} from './dependency-injection/stage';
import dependencyInjectionCss from './dependency-injection/stage.css?raw';
import {
  SCENE_DURATION as rollbackDuration,
  stageMarkup as rollbackStage,
} from './rollback/stage';
import rollbackCss from './rollback/stage.css?raw';
import {
  SCENE_DURATION as ioCompletionPortDuration,
  stageMarkup as ioCompletionPortStage,
} from './io-completion-port/stage';
import ioCompletionPortCss from './io-completion-port/stage.css?raw';
import {
  SCENE_DURATION as capTheoremDuration,
  stageMarkup as capTheoremStage,
} from './cap-theorem/stage';
import capTheoremCss from './cap-theorem/stage.css?raw';
import {
  SCENE_DURATION as sidecarDuration,
  stageMarkup as sidecarStage,
} from './sidecar/stage';
import sidecarCss from './sidecar/stage.css?raw';
import {
  SCENE_DURATION as hexagonalArchitectureDuration,
  stageMarkup as hexagonalArchitectureStage,
} from './hexagonal-architecture/stage';
import hexagonalArchitectureCss from './hexagonal-architecture/stage.css?raw';
import {
  SCENE_DURATION as crossShardQueryDuration,
  stageMarkup as crossShardQueryStage,
} from './cross-shard-query/stage';
import crossShardQueryCss from './cross-shard-query/stage.css?raw';
import {
  SCENE_DURATION as rebalancingDuration,
  stageMarkup as rebalancingStage,
} from './rebalancing/stage';
import rebalancingCss from './rebalancing/stage.css?raw';
import {
  SCENE_DURATION as partitioningDuration,
  stageMarkup as partitioningStage,
} from './partitioning/stage';
import partitioningCss from './partitioning/stage.css?raw';
import {
  SCENE_DURATION as secretInjectionDuration,
  stageMarkup as secretInjectionStage,
} from './secret-injection/stage';
import secretInjectionCss from './secret-injection/stage.css?raw';
import {
  SCENE_DURATION as resourceBasedAuthorizationDuration,
  stageMarkup as resourceBasedAuthorizationStage,
} from './resource-based-authorization/stage';
import resourceBasedAuthorizationCss from './resource-based-authorization/stage.css?raw';
import {
  SCENE_DURATION as sqlInjectionDuration,
  stageMarkup as sqlInjectionStage,
} from './sql-injection/stage';
import sqlInjectionCss from './sql-injection/stage.css?raw';
import {
  SCENE_DURATION as backgroundServiceDuration,
  stageMarkup as backgroundServiceStage,
} from './background-service/stage';
import backgroundServiceCss from './background-service/stage.css?raw';
import {
  SCENE_DURATION as workloadIdentityDuration,
  stageMarkup as workloadIdentityStage,
} from './workload-identity/stage';
import workloadIdentityCss from './workload-identity/stage.css?raw';
import {
  SCENE_DURATION as repositoryDuration,
  stageMarkup as repositoryStage,
} from './repository/stage';
import repositoryCss from './repository/stage.css?raw';
import {
  SCENE_DURATION as domainDrivenDesignDuration,
  stageMarkup as domainDrivenDesignStage,
} from './domain-driven-design/stage';
import domainDrivenDesignCss from './domain-driven-design/stage.css?raw';
import {
  SCENE_DURATION as throughputDuration,
  stageMarkup as throughputStage,
} from './throughput/stage';
import throughputCss from './throughput/stage.css?raw';
import {
  SCENE_DURATION as keyRotationDuration,
  stageMarkup as keyRotationStage,
} from './key-rotation/stage';
import keyRotationCss from './key-rotation/stage.css?raw';
import {
  SCENE_DURATION as paginationDuration,
  stageMarkup as paginationStage,
} from './pagination/stage';
import paginationCss from './pagination/stage.css?raw';
import {
  SCENE_DURATION as elasticityDuration,
  stageMarkup as elasticityStage,
} from './elasticity/stage';
import elasticityCss from './elasticity/stage.css?raw';
import {
  SCENE_DURATION as authenticationDuration,
  stageMarkup as authenticationStage,
} from './authentication/stage';
import authenticationCss from './authentication/stage.css?raw';
import {
  SCENE_DURATION as preparedStatementDuration,
  stageMarkup as preparedStatementStage,
} from './prepared-statement/stage';
import preparedStatementCss from './prepared-statement/stage.css?raw';
import {
  SCENE_DURATION as featureFlagDuration,
  stageMarkup as featureFlagStage,
} from './feature-flag/stage';
import featureFlagCss from './feature-flag/stage.css?raw';
import {
  SCENE_DURATION as authorizationDuration,
  stageMarkup as authorizationStage,
} from './authorization/stage';
import authorizationCss from './authorization/stage.css?raw';
import {
  SCENE_DURATION as databaseMigrationDuration,
  stageMarkup as databaseMigrationStage,
} from './database-migration/stage';
import databaseMigrationCss from './database-migration/stage.css?raw';
import {
  SCENE_DURATION as shardingDuration,
  stageMarkup as shardingStage,
} from './sharding/stage';
import shardingCss from './sharding/stage.css?raw';
import {
  SCENE_DURATION as oauth20Duration,
  stageMarkup as oauth20Stage,
} from './oauth-2-0/stage';
import oauth20Css from './oauth-2-0/stage.css?raw';
import {
  SCENE_DURATION as poisonMessageDuration,
  stageMarkup as poisonMessageStage,
} from './poison-message/stage';
import poisonMessageCss from './poison-message/stage.css?raw';
import {
  SCENE_DURATION as orderingDuration,
  stageMarkup as orderingStage,
} from './ordering/stage';
import orderingCss from './ordering/stage.css?raw';
import {
  SCENE_DURATION as publishSubscribeDuration,
  stageMarkup as publishSubscribeStage,
} from './publish-subscribe/stage';
import publishSubscribeCss from './publish-subscribe/stage.css?raw';
import {
  SCENE_DURATION as databaseIndexDuration,
  stageMarkup as databaseIndexStage,
} from './database-index/stage';
import databaseIndexCss from './database-index/stage.css?raw';
import {
  SCENE_DURATION as podDisruptionBudgetDuration,
  stageMarkup as podDisruptionBudgetStage,
} from './pod-disruption-budget/stage';
import podDisruptionBudgetCss from './pod-disruption-budget/stage.css?raw';
import {
  SCENE_DURATION as memoryPressureDuration,
  stageMarkup as memoryPressureStage,
} from './memory-pressure/stage';
import memoryPressureCss from './memory-pressure/stage.css?raw';
import {
  SCENE_DURATION as twoPhaseCommitDuration,
  stageMarkup as twoPhaseCommitStage,
} from './two-phase-commit/stage';
import twoPhaseCommitCss from './two-phase-commit/stage.css?raw';
import {
  SCENE_DURATION as workflowEngineDuration,
  stageMarkup as workflowEngineStage,
} from './workflow-engine/stage';
import workflowEngineCss from './workflow-engine/stage.css?raw';
import {
  SCENE_DURATION as eventSourcingDuration,
  stageMarkup as eventSourcingStage,
} from './event-sourcing/stage';
import eventSourcingCss from './event-sourcing/stage.css?raw';
import {
  SCENE_DURATION as backpressureDuration,
  stageMarkup as backpressureStage,
} from './backpressure/stage';
import backpressureCss from './backpressure/stage.css?raw';
import {
  SCENE_DURATION as fallbackDuration,
  stageMarkup as fallbackStage,
} from './fallback/stage';
import fallbackCss from './fallback/stage.css?raw';
import {
  SCENE_DURATION as failoverDuration,
  stageMarkup as failoverStage,
} from './failover/stage';
import failoverCss from './failover/stage.css?raw';
import {
  SCENE_DURATION as blueGreenDeploymentDuration,
  stageMarkup as blueGreenDeploymentStage,
} from './blue-green-deployment/stage';
import blueGreenDeploymentCss from './blue-green-deployment/stage.css?raw';
import {
  SCENE_DURATION as reverseProxyDuration,
  stageMarkup as reverseProxyStage,
} from './reverse-proxy/stage';
import reverseProxyCss from './reverse-proxy/stage.css?raw';
import {
  SCENE_DURATION as cacheStampedeDuration,
  stageMarkup as cacheStampedeStage,
} from './cache-stampede/stage';
import cacheStampedeCss from './cache-stampede/stage.css?raw';
import {
  SCENE_DURATION as cookieAuthenticationDuration,
  stageMarkup as cookieAuthenticationStage,
} from './cookie-authentication/stage';
import cookieAuthenticationCss from './cookie-authentication/stage.css?raw';
import {
  SCENE_DURATION as isolationLevelDuration,
  stageMarkup as isolationLevelStage,
} from './isolation-level/stage';
import isolationLevelCss from './isolation-level/stage.css?raw';
import {
  SCENE_DURATION as leaderElectionDuration,
  stageMarkup as leaderElectionStage,
} from './leader-election/stage';
import leaderElectionCss from './leader-election/stage.css?raw';
import {
  SCENE_DURATION as correlationIdDuration,
  stageMarkup as correlationIdStage,
} from './correlation-id/stage';
import correlationIdCss from './correlation-id/stage.css?raw';
import {
  SCENE_DURATION as deadLetterQueueDuration,
  stageMarkup as deadLetterQueueStage,
} from './dead-letter-queue/stage';
import deadLetterQueueCss from './dead-letter-queue/stage.css?raw';
import {
  SCENE_DURATION as bearerTokenDuration,
  stageMarkup as bearerTokenStage,
} from './bearer-token/stage';
import bearerTokenCss from './bearer-token/stage.css?raw';
import {
  SCENE_DURATION as readinessProbeDuration,
  stageMarkup as readinessProbeStage,
} from './readiness-probe/stage';
import readinessProbeCss from './readiness-probe/stage.css?raw';
import {
  SCENE_DURATION as transactionalOutboxDuration,
  stageMarkup as transactionalOutboxStage,
} from './transactional-outbox/stage';
import transactionalOutboxCss from './transactional-outbox/stage.css?raw';
import {
  SCENE_DURATION as eventualConsistencyDuration,
  stageMarkup as eventualConsistencyStage,
} from './eventual-consistency/stage';
import eventualConsistencyCss from './eventual-consistency/stage.css?raw';
import {
  SCENE_DURATION as loadTestDuration,
  stageMarkup as loadTestStage,
} from './load-test/stage';
import loadTestCss from './load-test/stage.css?raw';
import {
  SCENE_DURATION as changeTrackingDuration,
  stageMarkup as changeTrackingStage,
} from './change-tracking/stage';
import changeTrackingCss from './change-tracking/stage.css?raw';
import {
  SCENE_DURATION as garbageCollectionDuration,
  stageMarkup as garbageCollectionStage,
} from './garbage-collection/stage';
import garbageCollectionCss from './garbage-collection/stage.css?raw';
import {
  SCENE_DURATION as circuitBreakerDuration,
  stageMarkup as circuitBreakerStage,
} from './circuit-breaker/stage';
import circuitBreakerCss from './circuit-breaker/stage.css?raw';
import {
  SCENE_DURATION as nPlusOneDuration,
  stageMarkup as nPlusOneStage,
} from './n-plus-1-query/stage';
import nPlusOneCss from './n-plus-1-query/stage.css?raw';
import {
  SCENE_DURATION as middlewareDuration,
  stageMarkup as middlewareStage,
} from './middleware-pipeline/stage';
import middlewareCss from './middleware-pipeline/stage.css?raw';
import {
  SCENE_DURATION as threadPoolDuration,
  stageMarkup as threadPoolStage,
} from './thread-pool/stage';
import threadPoolCss from './thread-pool/stage.css?raw';
import {
  SCENE_DURATION as connectionPoolDuration,
  stageMarkup as connectionPoolStage,
} from './database-connection-pool/stage';
import connectionPoolCss from './database-connection-pool/stage.css?raw';
import {
  SCENE_DURATION as cacheInvalidationDuration,
  stageMarkup as cacheInvalidationStage,
} from './cache-invalidation/stage';
import cacheInvalidationCss from './cache-invalidation/stage.css?raw';
import {
  SCENE_DURATION as cacheAsideDuration,
  stageMarkup as cacheAsideStage,
} from './cache-aside/stage';
import cacheAsideCss from './cache-aside/stage.css?raw';
import {
  SCENE_DURATION as bulkheadDuration,
  stageMarkup as bulkheadStage,
} from './bulkhead/stage';
import bulkheadCss from './bulkhead/stage.css?raw';
import {
  SCENE_DURATION as rateLimiterDuration,
  stageMarkup as rateLimiterStage,
} from './rate-limiter/stage';
import rateLimiterCss from './rate-limiter/stage.css?raw';
import { SCENE_DURATION as retryDuration, stageMarkup as retryStage } from './retry/stage';
import retryCss from './retry/stage.css?raw';
import {
  SCENE_DURATION as tailLatencyDuration,
  stageMarkup as tailLatencyStage,
} from './tail-latency/stage';
import tailLatencyCss from './tail-latency/stage.css?raw';
import {
  SCENE_DURATION as stickySessionDuration,
  stageMarkup as stickySessionStage,
} from './sticky-session/stage';
import stickySessionCss from './sticky-session/stage.css?raw';
import {
  SCENE_DURATION as webQueueWorkerDuration,
  stageMarkup as webQueueWorkerStage,
} from './web-queue-worker/stage';
import webQueueWorkerCss from './web-queue-worker/stage.css?raw';
import {
  SCENE_DURATION as cqrsDuration,
  stageMarkup as cqrsStage,
} from './command-query-responsibility-segregation/stage';
import cqrsCss from './command-query-responsibility-segregation/stage.css?raw';
import {
  SCENE_DURATION as stranglerFigDuration,
  stageMarkup as stranglerFigStage,
} from './strangler-fig/stage';
import stranglerFigCss from './strangler-fig/stage.css?raw';
import {
  SCENE_DURATION as requestTimeoutDuration,
  stageMarkup as requestTimeoutStage,
} from './request-timeout/stage';
import requestTimeoutCss from './request-timeout/stage.css?raw';
import {
  SCENE_DURATION as idempotencyKeyDuration,
  stageMarkup as idempotencyKeyStage,
} from './idempotency-key/stage';
import idempotencyKeyCss from './idempotency-key/stage.css?raw';
import {
  SCENE_DURATION as competingConsumersDuration,
  stageMarkup as competingConsumersStage,
} from './competing-consumers/stage';
import competingConsumersCss from './competing-consumers/stage.css?raw';
import {
  SCENE_DURATION as loadBalancerDuration,
  stageMarkup as loadBalancerStage,
} from './load-balancer/stage';
import loadBalancerCss from './load-balancer/stage.css?raw';
import {
  SCENE_DURATION as materializedViewDuration,
  stageMarkup as materializedViewStage,
} from './materialized-view/stage';
import materializedViewCss from './materialized-view/stage.css?raw';
import {
  SCENE_DURATION as replicationLagDuration,
  stageMarkup as replicationLagStage,
} from './replication-lag/stage';
import replicationLagCss from './replication-lag/stage.css?raw';
import {
  SCENE_DURATION as deadlockDuration,
  stageMarkup as deadlockStage,
} from './deadlock/stage';
import deadlockCss from './deadlock/stage.css?raw';
import { SCENE_DURATION as sagaDuration, stageMarkup as sagaStage } from './saga/stage';
import sagaCss from './saga/stage.css?raw';
import {
  SCENE_DURATION as distributedLockDuration,
  stageMarkup as distributedLockStage,
} from './distributed-lock/stage';
import distributedLockCss from './distributed-lock/stage.css?raw';
import {
  SCENE_DURATION as authorizationCodeDuration,
  stageMarkup as authorizationCodeStage,
} from './authorization-code/stage';
import authorizationCodeCss from './authorization-code/stage.css?raw';
import { SCENE_DURATION as corsDuration, stageMarkup as corsStage } from './cors/stage';
import corsCss from './cors/stage.css?raw';
import {
  SCENE_DURATION as distributedTracingDuration,
  stageMarkup as distributedTracingStage,
} from './distributed-tracing/stage';
import distributedTracingCss from './distributed-tracing/stage.css?raw';
import {
  SCENE_DURATION as rollingUpdateDuration,
  stageMarkup as rollingUpdateStage,
} from './rolling-update/stage';
import rollingUpdateCss from './rolling-update/stage.css?raw';
import {
  SCENE_DURATION as horizontalPodAutoscalerDuration,
  stageMarkup as horizontalPodAutoscalerStage,
} from './horizontal-pod-autoscaler/stage';
import horizontalPodAutoscalerCss from './horizontal-pod-autoscaler/stage.css?raw';
import {
  SCENE_DURATION as asyncAwaitDuration,
  stageMarkup as asyncAwaitStage,
} from './async-await/stage';
import asyncAwaitCss from './async-await/stage.css?raw';
import {
  SCENE_DURATION as stateMachineDuration,
  stageMarkup as stateMachineStage,
} from './state-machine/stage';
import stateMachineCss from './state-machine/stage.css?raw';

/**
 * The part of a scene that renders on the server: its static stage markup, its
 * length, and the rules for its own stage. Timelines depend on GSAP and are
 * loaded in the browser only, through `load.ts`. Step text comes from the
 * content collection, not from here, so translators edit it alongside the rest
 * of the page.
 *
 * `css` is the scene's `stage.css` read as text so the page that shows the
 * scene can inline it: a page carries the rules for the one stage it draws
 * instead of the rules for all 91.
 */
export interface SceneAsset {
  markup: string;
  duration: number;
  css: string;
}

const scenes: Record<string, SceneAsset> = {
  'poison-message': {
    markup: poisonMessageStage,
    duration: poisonMessageDuration,
    css: poisonMessageCss,
  },
  ordering: {
    markup: orderingStage,
    duration: orderingDuration,
    css: orderingCss,
  },
  'publish-subscribe': {
    markup: publishSubscribeStage,
    duration: publishSubscribeDuration,
    css: publishSubscribeCss,
  },
  'database-index': {
    markup: databaseIndexStage,
    duration: databaseIndexDuration,
    css: databaseIndexCss,
  },
  'pod-disruption-budget': {
    markup: podDisruptionBudgetStage,
    duration: podDisruptionBudgetDuration,
    css: podDisruptionBudgetCss,
  },
  'memory-pressure': {
    markup: memoryPressureStage,
    duration: memoryPressureDuration,
    css: memoryPressureCss,
  },
  'two-phase-commit': {
    markup: twoPhaseCommitStage,
    duration: twoPhaseCommitDuration,
    css: twoPhaseCommitCss,
  },
  'workflow-engine': {
    markup: workflowEngineStage,
    duration: workflowEngineDuration,
    css: workflowEngineCss,
  },
  'event-sourcing': {
    markup: eventSourcingStage,
    duration: eventSourcingDuration,
    css: eventSourcingCss,
  },
  backpressure: {
    markup: backpressureStage,
    duration: backpressureDuration,
    css: backpressureCss,
  },
  fallback: {
    markup: fallbackStage,
    duration: fallbackDuration,
    css: fallbackCss,
  },
  failover: {
    markup: failoverStage,
    duration: failoverDuration,
    css: failoverCss,
  },
  'blue-green-deployment': {
    markup: blueGreenDeploymentStage,
    duration: blueGreenDeploymentDuration,
    css: blueGreenDeploymentCss,
  },
  'reverse-proxy': {
    markup: reverseProxyStage,
    duration: reverseProxyDuration,
    css: reverseProxyCss,
  },
  'leader-election': {
    markup: leaderElectionStage,
    duration: leaderElectionDuration,
    css: leaderElectionCss,
  },
  'cache-stampede': {
    markup: cacheStampedeStage,
    duration: cacheStampedeDuration,
    css: cacheStampedeCss,
  },
  'circuit-breaker': {
    markup: circuitBreakerStage,
    duration: circuitBreakerDuration,
    css: circuitBreakerCss,
  },
  retry: {
    markup: retryStage,
    duration: retryDuration,
    css: retryCss,
  },
  'rate-limiter': {
    markup: rateLimiterStage,
    duration: rateLimiterDuration,
    css: rateLimiterCss,
  },
  bulkhead: {
    markup: bulkheadStage,
    duration: bulkheadDuration,
    css: bulkheadCss,
  },
  'cache-aside': {
    markup: cacheAsideStage,
    duration: cacheAsideDuration,
    css: cacheAsideCss,
  },
  'cache-invalidation': {
    markup: cacheInvalidationStage,
    duration: cacheInvalidationDuration,
    css: cacheInvalidationCss,
  },
  'database-connection-pool': {
    markup: connectionPoolStage,
    duration: connectionPoolDuration,
    css: connectionPoolCss,
  },
  'thread-pool': {
    markup: threadPoolStage,
    duration: threadPoolDuration,
    css: threadPoolCss,
  },
  'middleware-pipeline': {
    markup: middlewareStage,
    duration: middlewareDuration,
    css: middlewareCss,
  },
  'n-plus-1-query': {
    markup: nPlusOneStage,
    duration: nPlusOneDuration,
    css: nPlusOneCss,
  },
  'tail-latency': {
    markup: tailLatencyStage,
    duration: tailLatencyDuration,
    css: tailLatencyCss,
  },
  'sticky-session': {
    markup: stickySessionStage,
    duration: stickySessionDuration,
    css: stickySessionCss,
  },
  'web-queue-worker': {
    markup: webQueueWorkerStage,
    duration: webQueueWorkerDuration,
    css: webQueueWorkerCss,
  },
  'command-query-responsibility-segregation': {
    markup: cqrsStage,
    duration: cqrsDuration,
    css: cqrsCss,
  },
  'strangler-fig': {
    markup: stranglerFigStage,
    duration: stranglerFigDuration,
    css: stranglerFigCss,
  },
  'request-timeout': {
    markup: requestTimeoutStage,
    duration: requestTimeoutDuration,
    css: requestTimeoutCss,
  },
  'idempotency-key': {
    markup: idempotencyKeyStage,
    duration: idempotencyKeyDuration,
    css: idempotencyKeyCss,
  },
  'competing-consumers': {
    markup: competingConsumersStage,
    duration: competingConsumersDuration,
    css: competingConsumersCss,
  },
  'load-balancer': {
    markup: loadBalancerStage,
    duration: loadBalancerDuration,
    css: loadBalancerCss,
  },
  'materialized-view': {
    markup: materializedViewStage,
    duration: materializedViewDuration,
    css: materializedViewCss,
  },
  deadlock: {
    markup: deadlockStage,
    duration: deadlockDuration,
    css: deadlockCss,
  },
  'replication-lag': {
    markup: replicationLagStage,
    duration: replicationLagDuration,
    css: replicationLagCss,
  },
  saga: {
    markup: sagaStage,
    duration: sagaDuration,
    css: sagaCss,
  },
  'distributed-lock': {
    markup: distributedLockStage,
    duration: distributedLockDuration,
    css: distributedLockCss,
  },
  'authorization-code': {
    markup: authorizationCodeStage,
    duration: authorizationCodeDuration,
    css: authorizationCodeCss,
  },
  cors: {
    markup: corsStage,
    duration: corsDuration,
    css: corsCss,
  },
  'distributed-tracing': {
    markup: distributedTracingStage,
    duration: distributedTracingDuration,
    css: distributedTracingCss,
  },
  'horizontal-pod-autoscaler': {
    markup: horizontalPodAutoscalerStage,
    duration: horizontalPodAutoscalerDuration,
    css: horizontalPodAutoscalerCss,
  },
  'rolling-update': {
    markup: rollingUpdateStage,
    duration: rollingUpdateDuration,
    css: rollingUpdateCss,
  },
  'async-await': {
    markup: asyncAwaitStage,
    duration: asyncAwaitDuration,
    css: asyncAwaitCss,
  },
  'state-machine': {
    markup: stateMachineStage,
    duration: stateMachineDuration,
    css: stateMachineCss,
  },
  'load-test': {
    markup: loadTestStage,
    duration: loadTestDuration,
    css: loadTestCss,
  },
  'change-tracking': {
    markup: changeTrackingStage,
    duration: changeTrackingDuration,
    css: changeTrackingCss,
  },
  'garbage-collection': {
    markup: garbageCollectionStage,
    duration: garbageCollectionDuration,
    css: garbageCollectionCss,
  },
  'eventual-consistency': {
    markup: eventualConsistencyStage,
    duration: eventualConsistencyDuration,
    css: eventualConsistencyCss,
  },
  'transactional-outbox': {
    markup: transactionalOutboxStage,
    duration: transactionalOutboxDuration,
    css: transactionalOutboxCss,
  },
  'readiness-probe': {
    markup: readinessProbeStage,
    duration: readinessProbeDuration,
    css: readinessProbeCss,
  },
  'bearer-token': {
    markup: bearerTokenStage,
    duration: bearerTokenDuration,
    css: bearerTokenCss,
  },
  'dead-letter-queue': {
    markup: deadLetterQueueStage,
    duration: deadLetterQueueDuration,
    css: deadLetterQueueCss,
  },
  'correlation-id': {
    markup: correlationIdStage,
    duration: correlationIdDuration,
    css: correlationIdCss,
  },
  'cookie-authentication': {
    markup: cookieAuthenticationStage,
    duration: cookieAuthenticationDuration,
    css: cookieAuthenticationCss,
  },
  'isolation-level': {
    markup: isolationLevelStage,
    duration: isolationLevelDuration,
    css: isolationLevelCss,
  },
  'oauth-2-0': {
    markup: oauth20Stage,
    duration: oauth20Duration,
    css: oauth20Css,
  },
  sharding: {
    markup: shardingStage,
    duration: shardingDuration,
    css: shardingCss,
  },
  'database-migration': {
    markup: databaseMigrationStage,
    duration: databaseMigrationDuration,
    css: databaseMigrationCss,
  },
  authorization: {
    markup: authorizationStage,
    duration: authorizationDuration,
    css: authorizationCss,
  },
  'feature-flag': {
    markup: featureFlagStage,
    duration: featureFlagDuration,
    css: featureFlagCss,
  },
  'prepared-statement': {
    markup: preparedStatementStage,
    duration: preparedStatementDuration,
    css: preparedStatementCss,
  },
  authentication: {
    markup: authenticationStage,
    duration: authenticationDuration,
    css: authenticationCss,
  },
  elasticity: {
    markup: elasticityStage,
    duration: elasticityDuration,
    css: elasticityCss,
  },
  pagination: {
    markup: paginationStage,
    duration: paginationDuration,
    css: paginationCss,
  },
  'key-rotation': {
    markup: keyRotationStage,
    duration: keyRotationDuration,
    css: keyRotationCss,
  },
  throughput: {
    markup: throughputStage,
    duration: throughputDuration,
    css: throughputCss,
  },
  'domain-driven-design': {
    markup: domainDrivenDesignStage,
    duration: domainDrivenDesignDuration,
    css: domainDrivenDesignCss,
  },
  repository: {
    markup: repositoryStage,
    duration: repositoryDuration,
    css: repositoryCss,
  },
  'workload-identity': {
    markup: workloadIdentityStage,
    duration: workloadIdentityDuration,
    css: workloadIdentityCss,
  },
  'background-service': {
    markup: backgroundServiceStage,
    duration: backgroundServiceDuration,
    css: backgroundServiceCss,
  },
  'sql-injection': {
    markup: sqlInjectionStage,
    duration: sqlInjectionDuration,
    css: sqlInjectionCss,
  },
  'resource-based-authorization': {
    markup: resourceBasedAuthorizationStage,
    duration: resourceBasedAuthorizationDuration,
    css: resourceBasedAuthorizationCss,
  },
  'secret-injection': {
    markup: secretInjectionStage,
    duration: secretInjectionDuration,
    css: secretInjectionCss,
  },
  partitioning: {
    markup: partitioningStage,
    duration: partitioningDuration,
    css: partitioningCss,
  },
  rebalancing: {
    markup: rebalancingStage,
    duration: rebalancingDuration,
    css: rebalancingCss,
  },
  'cross-shard-query': {
    markup: crossShardQueryStage,
    duration: crossShardQueryDuration,
    css: crossShardQueryCss,
  },
  'hexagonal-architecture': {
    markup: hexagonalArchitectureStage,
    duration: hexagonalArchitectureDuration,
    css: hexagonalArchitectureCss,
  },
  sidecar: {
    markup: sidecarStage,
    duration: sidecarDuration,
    css: sidecarCss,
  },
  'cap-theorem': {
    markup: capTheoremStage,
    duration: capTheoremDuration,
    css: capTheoremCss,
  },
  'io-completion-port': {
    markup: ioCompletionPortStage,
    duration: ioCompletionPortDuration,
    css: ioCompletionPortCss,
  },
  rollback: {
    markup: rollbackStage,
    duration: rollbackDuration,
    css: rollbackCss,
  },
  'dependency-injection': {
    markup: dependencyInjectionStage,
    duration: dependencyInjectionDuration,
    css: dependencyInjectionCss,
  },
  'shadow-deployment': {
    markup: shadowDeploymentStage,
    duration: shadowDeploymentDuration,
    css: shadowDeploymentCss,
  },
  'sliding-window': {
    markup: slidingWindowStage,
    duration: slidingWindowDuration,
    css: slidingWindowCss,
  },
  'cross-site-scripting': {
    markup: crossSiteScriptingStage,
    duration: crossSiteScriptingDuration,
    css: crossSiteScriptingCss,
  },
  multiplexing: {
    markup: multiplexingStage,
    duration: multiplexingDuration,
    css: multiplexingCss,
  },
  eviction: {
    markup: evictionStage,
    duration: evictionDuration,
    css: evictionCss,
  },
  'error-budget': {
    markup: errorBudgetStage,
    duration: errorBudgetDuration,
    css: errorBudgetCss,
  },
};

export function getSceneAsset(id: string | undefined): SceneAsset | undefined {
  return id ? scenes[id] : undefined;
}
