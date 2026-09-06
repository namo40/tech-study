---
title: "Leaky Bucket"
summary: "A leaky bucket holds arrivals and releases them at one fixed rate, so a bursty input leaves as a steady drip: it shapes traffic rather than counting it, its queue is where the delay comes from, and what arrives at a full bucket is dropped."
category: "Resilience"
tags: ["overload", "queue"]
level: 4
scene: sliding-window
sceneStep: 4
related:
  - label: Sliding Window
    slug: sliding-window
  - label: Token Bucket
    slug: token-bucket
  - label: Rate Limiter
    slug: rate-limiter
  - label: Fixed Window
    slug: fixed-window
  - label: Backpressure
    slug: backpressure
  - label: Bounded Concurrency
    slug: bounded-concurrency
  - label: Throttling
    slug: throttling
references:
  - title: Rate Limiting pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/rate-limiting-pattern
  - title: Rate limiting middleware in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/rate-limit
---

A leaky bucket is a queue with a hole in the bottom. Arrivals go in as they come, however lumpy that is, and the bucket lets one out every fixed interval regardless. Two numbers describe it completely: the capacity, which is how many arrivals it will hold, and the leak rate, which is how often it releases one. Everything else follows. The output is perfectly even for as long as the bucket has anything in it, the delay a request experiences is the number of items ahead of it times the leak period, and an arrival that finds the bucket full is dropped, because there is nowhere to put it.

That makes it a different kind of tool from a window. A fixed or sliding window answers "how many may pass in this interval" and says yes or no; the traffic that gets through keeps whatever shape it arrived with, bursts and all. A bucket answers "when may this pass" and gives every departure the same spacing. Reach for it when the thing downstream cares about the interval between requests rather than the count in a minute: a legacy system that falls over above a fixed write rate, a per-connection cap, a device that must be polled evenly, an outbound integration whose provider will throttle you if you go faster than their published rate.

The queueing delay is not a defect to be tuned away; it is the mechanism. If nothing waited, nothing would be smoothed. What has to be designed is the bound on that wait, and the capacity is what sets it: a bucket of twenty draining at ten a second makes the worst wait two seconds, and no amount of hoping changes that arithmetic. Pick the capacity from the delay you are willing to inflict, not from how much memory you have, and add a per-item deadline on top so that a request whose caller has already given up is dropped rather than delivered to a socket nobody is reading.

A full bucket needs a drop policy chosen on purpose. Tail drop is the usual default and it refuses the newest arrival, which under sustained overload is the one whose caller is still on the line while older, staler items ahead of it are still being delivered. Head drop refuses the oldest, which favours freshness and is often the better answer for telemetry or price updates. Priority drop keeps a class of item and sheds the rest. Whichever it is, tell the caller: return 429 with a `Retry-After` derived from the real drain time, so a client that behaves well has something to behave well with.

It is worth being precise about the difference from its sibling. A token bucket accumulates allowance while it is idle and lets a client spend it all at once, so it permits a burst up to its capacity and limits only the sustained rate. A leaky bucket accumulates nothing and permits no burst at all downstream; it absorbs the burst on the input side and pays it out evenly. Smoothing versus saved credit is the whole of the choice: if your dependency can take a burst and you want callers to feel responsive, use the token bucket, and if your dependency cannot, use this.

In .NET the shape appears twice. `TokenBucketRateLimiter` with a `QueueLimit` above zero behaves as a leaky bucket from the caller's side once the bucket is empty, since requests wait for a permit instead of being refused and the permits arrive at a fixed rate; keep `TokenLimit` no larger than `TokensPerPeriod` if you want that shaping from the first request rather than a saved burst first. `QueueProcessingOrder` is close to the drop policy but is not the same thing: `NewestFirst` fails the oldest waiter when the queue is full, which is roughly head drop, but it also serves the newest waiter first, and a bucket that does that is no longer FIFO. For a true leaky bucket keep `OldestFirst` and accept tail drop; the rate-limiting middleware surfaces the same options per endpoint. For shaping your own outbound traffic, a bounded `System.Threading.Channels` channel with a single reader pulling on a `PeriodicTimer` is the pattern written by hand, and `BoundedChannelFullMode` is the drop policy in one enum. Whichever you build, expose the depth of the bucket as a metric: a bucket that is usually empty is doing nothing, and one that is usually full is a queue that has become a delay nobody agreed to.
