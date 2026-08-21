import {
  SCENE_DURATION as circuitBreakerDuration,
  stageMarkup as circuitBreakerStage,
} from './circuit-breaker/stage';
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
};

export function getSceneAsset(id: string | undefined): SceneAsset | undefined {
  return id ? scenes[id] : undefined;
}
