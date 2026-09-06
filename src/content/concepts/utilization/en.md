---
title: "Utilization"
summary: "The share of a resource that is in use. It is the cheapest early signal you have, because it says how much ceiling is left before waiting time starts to climb."
category: "Requirements and quality attributes"
tags: ["metric"]
level: 3
scene: throughput
sceneStep: 2
related:
  - label: Throughput
    slug: throughput
  - label: Saturation
    slug: saturation
  - label: Tail Latency
    slug: tail-latency
  - label: p95
    slug: p95
  - label: p99
    slug: p99
  - label: Backpressure
    slug: backpressure
  - label: Bounded Concurrency
    slug: bounded-concurrency
  - label: Load Shedding
    slug: load-shedding
  - label: Thread Pool
    slug: thread-pool
  - label: Database Connection Pool
    slug: database-connection-pool
  - label: Elasticity
    slug: elasticity
  - label: Horizontal Pod Autoscaler
    slug: horizontal-pod-autoscaler
  - label: Batching
    slug: batching
references:
  - title: "The USE Method"
    url: https://www.brendangregg.com/usemethod.html
  - title: "Performance efficiency design principles"
    url: https://learn.microsoft.com/en-us/azure/well-architected/performance-efficiency/principles
  - title: "Collect metrics in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/metrics-collection
---

The second step of the scene is the boring part of the curve, and boring is exactly what it is for. Arrivals go up, the slot row fills, `busy` climbs from 25% to 40% to 80%, and `out` climbs with it the whole way. The line stays empty and the wait stays at nothing. This is the linear region: every extra unit of load that arrives becomes an extra unit of work that finishes, and the only thing that changed about the reader's experience is that the Server is doing more.

Utilization is worth watching precisely because it moves during that stretch, and almost nothing else does. Latency in the linear region is flat, so a latency alert will not fire. Throughput is rising, so a throughput alert will not fire either, and if anything it looks like good news. Error rates are zero. The one number that has been quietly telling you something the whole time is the share of the resource that is in use, because it is the distance to the ceiling, and the distance to the ceiling is the only thing that predicts what happens next.

What it predicts is not linear, and that is the part that catches people out. Waiting time grows roughly with the reciprocal of what is left, so going from 40% to 50% costs almost nothing and going from 90% to 95% roughly doubles the queueing delay. The chart of utilization against latency is a hockey stick, and the flat part of it is much longer than the steep part, which is why a system can spend months looking fine and then fall over during one busy afternoon. The scene's third step is what the far end of that curve looks like.

So the number to target is headroom rather than utilization, and it should be chosen rather than discovered. Seventy to eighty percent at peak is the common answer, and it is not a superstition: it leaves enough spare capacity to absorb a burst, to survive losing an instance, and to finish the work that was already in flight when the traffic changed. If somebody is proud that the fleet runs at 95%, what they have bought is a lower bill and a system with no answer to a bad minute. Run the arithmetic the other way round: decide what burst you want to survive, and the utilization target falls out of it.

Two measurement traps are worth knowing. The first is averaging: a resource at 50% for a minute may have been at 100% for thirty seconds, and thirty seconds at 100% is a queue with real customers in it. Look at a short window and a high percentile, not a one-minute mean. The second is measuring the wrong resource. Utilization is per-resource, so CPU at 30% tells you nothing about a connection pool at 100%, and the pool is what your requests are actually waiting for. The USE method is the discipline here: for every resource, look at its utilization, its saturation and its errors, and do it for the resources that can run out rather than the ones that are easy to graph.

In .NET the resources that run out are rarely the CPU. The thread pool, a `SemaphoreSlim` gate, `HttpClient`'s connection limit per endpoint once you set one, and the SQL connection pool are all fixed-size things with a queue behind them, and each one has a number you can read. Publish permits-in-use against permits-configured for anything you bound yourself, watch `threadpool-queue-length` — or `dotnet.thread_pool.queue.length`, its `Meter` equivalent since .NET 9 — and the pool counters for the ones the framework bounds for you, and treat any of them sitting near its limit as the same warning the scene draws: the ceiling is close, and the next thing that happens is the queue.
