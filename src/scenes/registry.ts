import {
  SCENE_DURATION as circuitBreakerDuration,
  stageMarkup as circuitBreakerStage,
} from './circuit-breaker/stage';
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
};

export function getSceneAsset(id: string | undefined): SceneAsset | undefined {
  return id ? scenes[id] : undefined;
}
