---
title: "Hedging"
summary: "Hedging sends a second copy of a slow call to another replica after a short wait and uses whichever answer comes back first."
category: "Requirements and quality attributes"
tags: ["latency"]
level: 4
scene: tail-latency
sceneStep: 3
related:
  - label: Tail Latency
    slug: tail-latency
  - label: p50
    slug: p50
  - label: p95
    slug: p95
  - label: p99
    slug: p99
references:
  - title: Build resilient HTTP apps with .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience
---

The wait is what makes hedging cheap. Set it at about p95 and only one call in twenty is ever duplicated, so the extra load stays at a few percent while the calls that were heading into the tail get a second and usually much faster chance.

There are two conditions. The call has to be safe to send twice, because both copies may run to the end even though only one answer is used. And the hedges need a budget, a fixed share of traffic enforced across the whole client, so that a backend which has gone slow everywhere does not receive double the traffic exactly when it can least absorb it.

In .NET, `AddHedging` on a resilience pipeline takes `MaxHedgedAttempts` and `Delay`, and cancels the attempt that loses once one of them answers. Setting `Delay` to zero is a different pattern: it fans every call out in parallel from the start, which doubles the load whether or not the first copy was slow.
