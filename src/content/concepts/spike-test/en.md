---
title: "Spike Test"
summary: "A spike test raises the load in one step instead of a ramp, because a marketing email, a flushed cache, and a failover all arrive that way."
category: "Testing and verification"
scene: load-test
sceneStep: 2
related:
  - label: Load Test
    slug: load-test
  - label: Stress Test
    slug: stress-test
  - label: Horizontal Pod Autoscaler
    slug: horizontal-pod-autoscaler
  - label: Cache Stampede
    slug: cache-stampede
  - label: Rate Limiter
    slug: rate-limiter
  - label: Backpressure
    slug: backpressure
references:
  - title: Load and stress testing ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/test/load-tests?view=aspnetcore-10.0
  - title: Horizontal Pod Autoscaler
    url: https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/
---

A ramp is polite and real traffic is not. A spike test jumps straight from the resting load to several times it and holds there, which is what happens when a campaign email goes out, when a cache is flushed, or when half a fleet fails over onto the other half. The number worth having is not the steady state at the new level, because a load test already measured that. It is what the minutes in between cost.

Everything that absorbs a spike has a lag. An autoscaler reads its metric over a window and then waits for new instances to pass a readiness probe. A connection pool opens connections one at a time and each one costs a handshake. A cache that was just emptied has to be refilled by the very traffic that is overwhelming the system, and without request coalescing every miss becomes its own query. Measure the latency and the errors during that lag rather than after it.

The fix is usually the lag rather than the ceiling. Keep enough headroom that the first seconds do not need a scale-out, warm instances before you need them, bound the queue so a burst is refused quickly instead of absorbed slowly, and make sure a rate limiter stands in front of the dependency that cannot scale at all.
