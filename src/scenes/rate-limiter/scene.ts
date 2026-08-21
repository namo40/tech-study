import gsap from 'gsap';
import {
  CAPACITY,
  DRIP,
  DRIP_SPLIT,
  RETRY_CIRCUMFERENCE,
  SCENE_DURATION,
  SPLIT_OFFSET,
  SPLIT_SCALE,
} from './stage';
import { q, qa } from '../shared/dom';
import { addTrip, haloRequest, mountRequests, parkRequest } from '../shared/request';
import type { SceneBuildOptions, SceneInstance, SceneModule, SceneStep } from '../types';

/**
 * Rate Limiter scene: a 24 second, four step timeline.
 *
 * Same two rules as the other scenes. Every tween sits at an absolute position,
 * and every discrete change is a zero-duration tween on a `data-*` attribute
 * that GSAP reverts when the playhead moves back past it.
 *
 * The token counts are not authored by hand. `refill 2/s` is taken literally:
 * a tick every 0.5s for the whole scene, adding a token whenever the bucket is
 * below capacity. A small simulation below plays the refill ticks against the
 * moments requests reach the node, and everything the viewer sees is emitted
 * from its result: which requests are granted a token, which get a 429, when
 * the count changes, and which ticks are worth animating a falling token for.
 * Nothing about the bucket lives in a JavaScript variable at playback time, so
 * scrubbing to any moment shows the count that belongs to it.
 */

const ID = 'rate-limiter';

/** Horizontal axis a request travels along while there is one bucket. */
const X = 540;
/** Lanes used once the limiter is partitioned by key, one per bucket centre. */
const LANE_A = 350;
const LANE_B = 730;

/** Resting y of a request inside the client box. */
const Y_CLIENT = 620;
/** y of the limiter node, in the empty upper part of the bucket. */
const Y_NODE = 1045;
/** y a request reaches inside the service box, above the health dot. */
const Y_SERVICE = 1630;

/** Seconds between refill ticks. `refill 2/s`. */
const REFILL_PERIOD = 0.5;
/** Travel times, in seconds. */
const NODE_LEG = 0.5;
const SERVICE_LEG = 0.5;
const BACK_LEG = 0.6;
const REJECT_BACK_LEG = 0.5;
/** How long a refill token takes to fall into the bucket. */
const DRIP_FALL = 0.35;
/** When the limiter is partitioned by key. */
const SPLIT_AT = 19;

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 13 },
  { id: 'step-4', label: 'step-4', time: 19 },
];

type BucketId = 'a' | 'b';

interface RequestPlan {
  /** Departure from the client. */
  start: number;
  lane: number;
  bucket: BucketId;
}

const round = (value: number): number => Number(value.toFixed(3));

function burst(from: number, count: number, gap: number, lane: number, bucket: BucketId): RequestPlan[] {
  return Array.from({ length: count }, (_value, index) => ({
    start: round(from + index * gap),
    lane,
    bucket,
  }));
}

/**
 * Every request in the scene, in departure order.
 *
 * Bursts are placed between two refill ticks wherever the story needs an exact
 * number of rejections, so the outcome falls out of the refill rate rather than
 * being asserted. Step 4 deliberately runs long enough to swallow two ticks:
 * that is what a noisy caller looks like against a bucket that keeps filling.
 */
const REQUESTS: RequestPlan[] = [
  // Step 1: one request at a time, comfortably slower than the refill.
  ...[0.5, 1.3, 2.1, 2.9, 3.7, 4.5].map((start) => ({ start, lane: X, bucket: 'a' as const })),
  // Step 2: a burst that lands entirely between the 7.0 and 7.5 ticks.
  ...burst(6.55, 8, 0.06, X, 'a'),
  // Step 3: a drain burst empties the bucket, then one more request gets a 429.
  ...burst(13.01, 6, 0.09, X, 'a'),
  // Step 3: the client waits out Retry-After and comes back.
  { start: 15.8, lane: X, bucket: 'a' as const },
  // Step 4: key A floods its own bucket. The burst ends early enough that the
  // five remaining refill ticks bring the bucket back to capacity by 23.5, and
  // it is offset off the half-second grid so no arrival collides with a tick.
  ...burst(19.83, 10, 0.1, LANE_A, 'a'),
  // Step 4: key B keeps a steady pace and is never starved.
  ...[20.2, 21.0, 21.8].map((start) => ({ start, lane: LANE_B, bucket: 'b' as const })),
];

interface SimEvent {
  at: number;
  kind: 'refill' | 'consume';
  bucket: BucketId;
  index: number;
}

interface Simulation {
  /** Whether each request found a token, by request index. */
  granted: boolean[];
  /** Count changes per bucket, as `[time, count]` in time order. */
  counts: Record<BucketId, [number, number][]>;
  /** Ticks that actually added a token, and so deserve a falling token. */
  drips: { at: number; bucket: BucketId }[];
}

/**
 * Plays refill ticks against request arrivals. At equal times the refill lands
 * first: the token has dripped in and is there for the request to take.
 */
function simulate(requests: RequestPlan[]): Simulation {
  const events: SimEvent[] = [];

  for (let tick = 1; tick * REFILL_PERIOD < SCENE_DURATION; tick += 1) {
    const at = round(tick * REFILL_PERIOD);
    events.push({ at, kind: 'refill', bucket: 'a', index: -1 });
    // The second bucket only exists from the split onwards.
    if (at >= SPLIT_AT) events.push({ at, kind: 'refill', bucket: 'b', index: -1 });
  }

  requests.forEach((request, index) => {
    events.push({
      at: round(request.start + NODE_LEG),
      kind: 'consume',
      bucket: request.bucket,
      index,
    });
  });

  events.sort((left, right) => {
    if (left.at !== right.at) return left.at - right.at;
    if (left.kind === right.kind) return left.index - right.index;
    return left.kind === 'refill' ? -1 : 1;
  });

  const count: Record<BucketId, number> = { a: CAPACITY, b: CAPACITY };
  const granted: boolean[] = requests.map(() => false);
  const counts: Record<BucketId, [number, number][]> = { a: [], b: [] };
  const drips: { at: number; bucket: BucketId }[] = [];

  /*
   * Records a count change, collapsing anything that lands on an instant that
   * already has one. Two zero-duration tweens at the same position render in
   * insertion order going forwards and in reverse going backwards, so leaving
   * both would make that single frame depend on which way the reader scrubbed.
   */
  const record = (bucket: BucketId, at: number): void => {
    const series = counts[bucket];
    const previous = series[series.length - 1];
    if (previous && previous[0] === at) previous[1] = count[bucket];
    else series.push([at, count[bucket]]);
  };

  for (const event of events) {
    const bucket = event.bucket;
    if (event.kind === 'refill') {
      if (count[bucket] >= CAPACITY) continue;
      count[bucket] += 1;
      record(bucket, event.at);
      drips.push({ at: event.at, bucket });
      continue;
    }
    if (count[bucket] <= 0) continue;
    count[bucket] -= 1;
    granted[event.index] = true;
    record(bucket, event.at);
  }

  return { granted, counts, drips };
}

const DRIP_MARKUP = '<circle class="rl-drip" r="18" />';

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const bucketA = q<SVGGElement>(stage, '.rl-bucket--a', ID);
  const bucketB = q<SVGGElement>(stage, '.rl-bucket--b', ID);
  const retry = q<SVGGElement>(stage, '.rl-retry', ID);
  const retryProgress = q<SVGCircleElement>(stage, '.rl-retry-progress', ID);
  const requestLayer = q<SVGGElement>(stage, '.scene-requests', ID);
  const dripLayer = q<SVGGElement>(stage, '.rl-drips', ID);

  const sim = simulate(REQUESTS);

  const requests = mountRequests(requestLayer, REQUESTS.length, ID);
  dripLayer.innerHTML = sim.drips.map(() => DRIP_MARKUP).join('');
  const drips = qa<SVGCircleElement>(dripLayer, '.rl-drip');

  const tl = gsap.timeline({ paused: true });

  const attr = (name: string, value: string, at: number): void => {
    tl.set(stage, { attr: { [name]: value }, immediateRender: false }, at);
  };

  // --- token counts, straight from the simulation ------------------------

  for (const [at, count] of sim.counts.a) {
    tl.set(bucketA, { attr: { 'data-count': String(count) }, immediateRender: false }, at);
    // The legend text reads the stage, not the bucket, so it survives the split.
    attr('data-tokens', String(count), at);
  }
  for (const [at, count] of sim.counts.b) {
    tl.set(bucketB, { attr: { 'data-count': String(count) }, immediateRender: false }, at);
  }

  // --- falling tokens, one per tick that actually added one --------------

  sim.drips.forEach((spec, index) => {
    const drip = drips[index];
    if (!drip) return;
    const split = spec.at >= SPLIT_AT;
    const x = split ? (spec.bucket === 'a' ? DRIP_SPLIT.a : DRIP_SPLIT.b) : DRIP.x;
    const from = split ? DRIP_SPLIT.from : DRIP.from;
    const to = split ? DRIP_SPLIT.to : DRIP.to;

    gsap.set(drip, { x, y: from, opacity: 0 });
    const start = spec.at - DRIP_FALL;
    tl.set(drip, { opacity: 1, immediateRender: false }, start);
    tl.fromTo(
      drip,
      { y: from },
      { y: to, duration: DRIP_FALL, ease: 'power1.in', immediateRender: false },
      start,
    );
    tl.to(drip, { opacity: 0, duration: 0.12, immediateRender: false }, spec.at);
  });

  // --- requests, granted or rejected as the simulation decided -----------

  REQUESTS.forEach((plan, index) => {
    const parts = requests[index];
    if (!parts) return;
    parkRequest(parts, plan.lane, Y_CLIENT);
    const atNode = round(plan.start + NODE_LEG);

    if (sim.granted[index]) {
      const home = addTrip(tl, parts, {
        start: plan.start,
        down: [
          { to: Y_NODE, duration: NODE_LEG },
          { to: Y_SERVICE, duration: SERVICE_LEG },
        ],
        result: 'ok',
        up: [{ to: Y_CLIENT, duration: BACK_LEG }],
      });
      // Spending a token shows as a brief ring around the request.
      haloRequest(tl, parts, atNode, atNode + 0.5);
      tl.call(() => cue('success'), undefined, home);
      return;
    }

    addTrip(tl, parts, {
      start: plan.start,
      down: [{ to: Y_NODE, duration: NODE_LEG }],
      result: 'fail',
      up: [{ to: Y_CLIENT, duration: REJECT_BACK_LEG }],
    });
    tl.call(() => cue('failure'), undefined, atNode);
  });

  // --- 429 flashes, one per run of rejections ----------------------------

  const arrival = (plan: RequestPlan): number => round(plan.start + NODE_LEG);
  const rejectedAt = REQUESTS.filter((_plan, index) => !sim.granted[index])
    .map(arrival)
    .sort((left, right) => left - right);
  const grantedAt = REQUESTS.filter((_plan, index) => sim.granted[index])
    .map(arrival)
    .sort((left, right) => left - right);

  for (let i = 0; i < rejectedAt.length; ) {
    const from = rejectedAt[i] ?? 0;
    let last = i;
    // A run ends at a gap of more than half a second, or as soon as a request
    // does get a token: the bucket is no longer empty, so it stops flashing.
    while (last + 1 < rejectedAt.length) {
      const current = rejectedAt[last] ?? 0;
      const next = rejectedAt[last + 1] ?? 0;
      if (next - current > 0.5) break;
      if (grantedAt.some((time) => time > current && time < next)) break;
      last += 1;
    }
    const end = rejectedAt[last] ?? from;
    const nextGranted = grantedAt.find((time) => time > end) ?? Number.POSITIVE_INFINITY;
    const to = Math.max(from + 0.08, Math.min(end + 0.3, nextGranted));
    attr('data-reject', 'on', from);
    attr('data-reject', 'off', to);
    i = last + 1;
  }

  // --- step labels and the set pieces -------------------------------------

  // The stage is complete on the first frame: the bucket starts at 5/5.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 13);

  // The client waits out the hint instead of retrying immediately.
  tl.to(retry, { opacity: 1, duration: 0.25, immediateRender: false }, 14.3);
  tl.fromTo(
    retryProgress,
    { attr: { 'stroke-dashoffset': RETRY_CIRCUMFERENCE } },
    { attr: { 'stroke-dashoffset': 0 }, duration: 1.5, ease: 'none', immediateRender: false },
    14.3,
  );
  tl.call(() => cue('trip'), undefined, 15.8);
  tl.to(retry, { opacity: 0, duration: 0.25, immediateRender: false }, 15.9);

  tl.addLabel('step-4', SPLIT_AT);
  attr('data-split', 'on', SPLIT_AT);
  tl.call(() => cue('state'), undefined, SPLIT_AT);
  tl.to(
    bucketA,
    {
      scale: SPLIT_SCALE,
      x: SPLIT_OFFSET,
      transformOrigin: '50% 50%',
      duration: 0.6,
      ease: 'power2.inOut',
      immediateRender: false,
    },
    SPLIT_AT,
  );

  // Pin the total length so the scrub bar covers the closing hold.
  tl.to({}, { duration: 0.01 }, SCENE_DURATION - 0.01);

  // Render once in each direction so every zero-duration tween records its
  // start value before a reader can scrub backwards past it.
  tl.progress(1, true).progress(0, true).pause();

  return { tl, steps: STEPS };
}

const scene: SceneModule = {
  id: ID,
  duration: SCENE_DURATION,
  build,
};

export default scene;
