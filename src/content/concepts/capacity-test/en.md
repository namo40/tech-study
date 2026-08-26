---
title: "Capacity Test"
summary: "A capacity test answers one question: what is the highest load at which the service still meets its objective? That number, not the peak, is what you can promise."
category: "Testing and verification"
tags: ["overload"]
scene: load-test
sceneStep: 3
related:
  - label: Load Test
    slug: load-test
  - label: Soak Test
    slug: soak-test
  - label: SLO
    slug: slo
  - label: Throughput
    slug: throughput
  - label: Tail Latency
    slug: tail-latency
  - label: Horizontal Pod Autoscaler
    slug: horizontal-pod-autoscaler
references:
  - title: Load and stress testing ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/test/load-tests?view=aspnetcore-10.0
  - title: dotnet-counters
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/dotnet-counters
---

A capacity test is a load test read backwards. Ramp until p95 crosses the objective, then back off to the last level that was under it and hold that level long enough to be sure it is stable rather than lucky. The peak throughput you saw on the way up is not the answer; it was measured at a latency nobody agreed to.

The answer is a number with three parts: a throughput, the objective it was measured against, and the request mix and data it was measured with. Reported without the last two it is a rumour, because the same service will hand you a much larger number on a read-only mix against one hot key, and a much smaller one once writes and cold reads are in proportion.

Leave headroom. Capacity measured on a warm, undisturbed system is a ceiling rather than a target, and deploys, garbage collection, a noisy neighbour, and one failed replica all eat into it. Pick a target well below the measured number, set the autoscaler so that scaling starts before you reach it, and remeasure after any change to the data layer, the pool sizes, or the instance type.
