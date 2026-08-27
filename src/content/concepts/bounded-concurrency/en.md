---
title: "Bounded Concurrency"
summary: "Fixing how many operations may be in flight at once. It is the channel backpressure travels up: when the limit is reached, the next caller waits, and the wait is what reaches the source."
category: "Resilience"
tags: ["overload"]
scene: backpressure
sceneStep: 3
related:
  - label: Backpressure
    slug: backpressure
  - label: Queue-Based Load Leveling
    slug: queue-based-load-leveling
  - label: Batching
    slug: batching
  - label: Concurrency Limiter
    slug: concurrency-limiter
  - label: Bulkhead
    slug: bulkhead
  - label: Thread Pool
    slug: thread-pool
  - label: Rate Limiter
    slug: rate-limiter
  - label: Web-Queue-Worker
    slug: web-queue-worker
  - label: Competing Consumers
    slug: competing-consumers
  - label: Work Queue
    slug: work-queue
references:
  - title: "System.Threading.Channels"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/channels
  - title: "BoundedChannelOptions class"
    url: https://learn.microsoft.com/en-us/dotnet/api/system.threading.channels.boundedchanneloptions
  - title: "Queue-Based Load Leveling pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/queue-based-load-leveling
---

The third step of the scene is the moment the buffer stops being polite. It is at capacity, it has nothing left to offer, and rather than grow it makes the producer wait. The `admits` number falling from eight to three is that wait travelling upstream: fewer things may be in flight at once, so fewer things are started, so the input rate falls until it matches what the consumer can actually get through. Notice that nothing measured a rate and nothing was configured to slow down. The limit is a count, the count is full, and the pace falls out of that.

A count is a better control than a rate for the same reason a queue depth is a better signal than throughput: it is closed-loop. A rate limit is a guess about how fast the downstream can go, made in advance, in a config file, by somebody who did not know what today would look like. A concurrency limit does not guess. If the downstream slows down, each permit is held longer, fewer permits come free per second, and the offered rate falls by exactly as much as the downstream slowed — automatically, with no metric, no controller and no deploy. Little's law is the whole mechanism: with N permits and an average service time of L, the achievable rate is N over L, and L is measured by reality rather than by you.

That self-correction is also the trap, because a bound on concurrency is not a bound on latency. Eight permits against a dependency that has gone from 20 ms to 4 seconds still admits eight, and the callers waiting behind them now wait a very long time. So a permit needs a deadline as well as a number: a timeout on the wait itself, so a caller that cannot get in soon is told so rather than parked forever, and a timeout on the work, so a permit is never held by something that is not coming back. Without both, the limiter turns a slow dependency into an unbounded queue of waiters, which is the failure it was installed to prevent.

Where the limit sits decides what it protects. Put it around a dependency and it is a bulkhead: the point is to stop one slow thing from consuming every thread in the process, and the right number comes from that dependency's capacity. Put it at the source, as the scene does, and it is backpressure: the point is to stop the producer from generating work faster than the system can retire it, and the right number comes from the buffer behind it. Same primitive, opposite reasoning, and it is worth knowing which one you are arguing about, because the numbers that follow are different.

Picking the number is less mysterious than it looks. Start from the resource that will run out first — connections in a pool, cores, a partner's documented concurrency — and set the limit at or just below it, because a limit above the real constraint does nothing except move the queue somewhere less visible. Then check the arithmetic against the latency you want: N over L is the rate you will achieve, and if that is far below what you need, the answer is a faster consumer or more of them, not a larger N. Raising N against a saturated dependency buys queueing, not throughput.

The last part is that a limiter has to be visible. Permits in use, callers waiting, and time spent waiting are three numbers that turn "the system feels slow" into "we have been at the limit for six minutes". The scene draws them because a limit that nobody can see is indistinguishable from a bug: the work is arriving, the process is not busy, and nothing in the logs says that eight things are already in flight and a ninth is standing at the door.
