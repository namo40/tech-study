// `gsap` is an ambient global namespace declared by the GSAP type definitions.

/** A named point on the timeline that the player can jump to. */
export interface SceneStep {
  /** Stable identifier, e.g. `step-1`. */
  id: string;
  /** GSAP timeline label placed at `time`. */
  label: string;
  /** Absolute position in seconds. */
  time: number;
}

/** What a scene hands back to the player once its timeline is built. */
export interface SceneInstance {
  tl: gsap.core.Timeline;
  steps: SceneStep[];
}

/** Sound cues a scene can request. The player decides whether to play them. */
export type SceneCue = 'success' | 'failure' | 'state' | 'trip';

export interface SceneBuildOptions {
  /**
   * Called from timeline callbacks. The player suppresses the cue while the
   * timeline is scrubbing, paused, or seeking.
   */
  cue: (name: SceneCue) => void;
}

/** A scene module: static stage markup plus a timeline builder. */
export interface SceneModule {
  id: string;
  /** Total length in seconds, used for the initial time readout. */
  duration: number;
  build: (stage: SVGSVGElement, options: SceneBuildOptions) => SceneInstance;
}
