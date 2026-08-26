---
title: "p50"
summary: "p50 is the median: half of the requests are faster than it and half are slower. It describes the typical request and says nothing about the slow ones."
category: "Requirements and quality attributes"
tags: ["metric", "latency"]
scene: tail-latency
sceneStep: 1
related:
  - label: Tail Latency
    slug: tail-latency
  - label: p95
    slug: p95
  - label: p99
    slug: p99
  - label: Hedging
    slug: hedging
references:
  - title: Creating metrics in .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/metrics-instrumentation
---

The median is what the mean pretends to be. One request of 400 ms in a sample of twenty pulls the mean up by 18 ms and leaves the median exactly where it was, which is why a dashboard built on averages can look calm while a tenth of the traffic is unhappy.

p50 is the right number for capacity and for the shape of the normal path, because it tells you what the code costs when nothing unusual happens. When p50 moves, something changed for everybody: a query plan, a release, a machine that is now doing more work than it used to.

What p50 cannot do is see the tail. A service can hold p50 at 44 ms for months while one request in a hundred takes 400, and nobody watching p50 alone will ever find out. Read it next to p95 and p99, never on its own.
