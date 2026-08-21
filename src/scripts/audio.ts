import type { SceneCue } from '../scenes/types';

/**
 * Sound cues, synthesized with the Web Audio API.
 *
 * No audio files are shipped. Sound is off by default, the preference is kept
 * in `localStorage`, and the `AudioContext` is only created after a user
 * gesture so browsers never block or warn about autoplay.
 */

const STORAGE_KEY = 'sound';

let context: AudioContext | null = null;

export function isSoundEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

export function setSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // Storage is unavailable; the toggle still works for this page view.
  }
}

/** Creates or resumes the audio context. Must be called from a user gesture. */
export function unlockAudio(): void {
  try {
    if (!context) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      context = new Ctor();
    }
    if (context.state === 'suspended') void context.resume();
  } catch {
    context = null;
  }
}

interface ToneOptions {
  frequency: number;
  duration: number;
  type?: OscillatorType;
  peak?: number;
  delay?: number;
  /** Frequency to glide to over the tone, for the two-tone state change. */
  glideTo?: number;
}

function tone(ctx: AudioContext, options: ToneOptions): void {
  const { frequency, duration, type = 'sine', peak = 0.12, delay = 0, glideTo } = options;
  const start = ctx.currentTime + delay;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  if (glideTo !== undefined) {
    oscillator.frequency.exponentialRampToValueAtTime(glideTo, start + duration);
  }

  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.05);
}

/** A dry click for the moment the breaker changes position. */
function click(ctx: AudioContext): void {
  tone(ctx, { frequency: 1600, duration: 0.035, type: 'square', peak: 0.05 });
  tone(ctx, { frequency: 180, duration: 0.07, type: 'square', peak: 0.08, delay: 0.01 });
}

export function playCue(name: SceneCue): void {
  if (!context || context.state !== 'running') return;
  const ctx = context;

  switch (name) {
    case 'success':
      tone(ctx, { frequency: 920, duration: 0.11, peak: 0.09 });
      break;
    case 'failure':
      tone(ctx, { frequency: 190, duration: 0.13, type: 'triangle', peak: 0.11 });
      break;
    case 'state':
      tone(ctx, { frequency: 520, duration: 0.12, peak: 0.09 });
      tone(ctx, { frequency: 780, duration: 0.16, peak: 0.09, delay: 0.13 });
      break;
    case 'trip':
      click(ctx);
      break;
  }
}
