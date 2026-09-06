---
title: "p99"
summary: "p99 is the latency the slowest one request in a hundred sees. A latency objective usually belongs here, and it needs enough samples in the window to mean anything at all."
category: "Requirements and quality attributes"
tags: ["metric", "latency"]
level: 3
scene: tail-latency
sceneStep: 1
related:
  - label: Tail Latency
    slug: tail-latency
  - label: p50
    slug: p50
  - label: p95
    slug: p95
  - label: Hedging
    slug: hedging
references:
  - title: The Tail at Scale
    url: https://research.google/pubs/the-tail-at-scale/
---

An objective belongs on p99 because p99 is the number a real session actually meets. Somebody who opens thirty pages in a visit is very likely to hit the slowest one percent at least once, and that one page is the one they remember.

p99 needs samples. A minute at ten requests per second is six hundred observations, so p99 is decided by six of them and a single unlucky garbage collection moves it. Widen the window or the scope until the number stops jumping, and treat a p99 per endpoint, per instance, per minute as mostly noise.

Beware of how it is aggregated. Percentiles do not average: taking the p99 of ten instances and averaging the ten results gives a number that is neither the fleet's p99 nor anything else. Merge the histogram buckets first and read the percentile off the merged histogram.
