---
title: "Saturation"
summary: "The queue that forms when arrivals outrun capacity. Throughput has already stopped rising by then, so everything extra becomes waiting time, and saturation is where latency actually lives."
category: "Requirements and quality attributes"
tags: ["metric", "overload"]
scene: throughput
sceneStep: 3
related:
  - label: Throughput
    slug: throughput
  - label: Utilization
    slug: utilization
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
  - title: "Throttling pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/throttling
  - title: "Well-known EventCounters in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/available-counters
---

The third step of the scene is the moment the two axes come apart for good. Arrivals cross the ceiling, and from that instant `out` stops moving: it is pinned at capacity, because capacity is what capacity means. Every unit of load above the line has to go somewhere, and the only place left is the queue, so the cells fill one at a time and `wait` climbs with them. The Server is at 100% and it is finishing exactly as much work as it was finishing a second before the surge started. Full is not fast; full is where slow begins.

That is the whole of saturation, and the reason it deserves its own word is that utilization stops being informative here. Above the ceiling, `busy` reads 100% whether arrivals are one percent over or three times over, so the number that warned you in the linear region is now flat and useless. Queue depth is what still moves, and it moves in proportion to how far past the ceiling you are. This is why the USE method asks for saturation separately from utilization: the first tells you how bad it is, the second only tells you that it is bad.

Latency in a saturated system is not a property of the work, it is a property of the position in the line. A request that takes 20 ms to serve waits behind everyone already queued, so its response time is the queue depth times the service time plus its own. Nothing about the code got slower. The scene draws that arithmetic directly: five units of backlog against a Server retiring one every 300 ms is a wait of a second and a half, and it is a second and a half for a request that would have been instant a moment earlier. Fixing the "slow endpoint" by profiling it will find nothing, because the time is not being spent in it.

The queue also does not go away on its own when the surge stops. When arrivals fall back to exactly capacity, the line simply stops growing: nothing is retiring faster than it arrives, so the backlog and the wait it causes stay exactly where they are. That is the beat between the third step and the fourth, and it is the thing operators consistently get wrong during an incident. Draining a backlog needs arrivals *below* capacity, or capacity above arrivals, and the difference between the two rates is the only thing that decides how long it takes. A queue that took three minutes to build takes three minutes to clear at the same imbalance reversed, and longer if the imbalance is smaller.

Watch depth and age rather than throughput, then, because throughput is the last signal to move and the least useful when it does. Depth tells you the surge exists; the age of the oldest item tells you what a request is actually experiencing right now. Both of them move before anything fails, and both of them are readable at every layer that queues: the thread pool queue, connection pool waiters, broker lag, disk queue length. When a request is slow and every span looks fast, the missing time is in one of those.

There are exactly two ways out and it is worth naming them plainly, because the third step of the scene does not choose between them. Raise the ceiling, which means more capacity at the bottleneck and nowhere else, or lower the arrivals, which means shedding, throttling or pushing back on whoever is generating the work. Everything else is a rearrangement. A bigger queue buys time and nothing more, and if the imbalance is sustained rather than a burst, all it buys is a longer wait before the same failure, with staler work in it when it happens.
