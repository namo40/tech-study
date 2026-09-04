---
title: "Fixed Window"
summary: "A fixed window counts requests inside clock-aligned buckets and resets on the clock, which makes it the cheapest limiter there is and the reason a burst scheduled across a boundary gets through at twice the configured limit."
category: "Resilience"
tags: ["overload"]
scene: sliding-window
sceneStep: 1
related:
  - label: Sliding Window
    slug: sliding-window
  - label: Rate Limiter
    slug: rate-limiter
  - label: Leaky Bucket
    slug: leaky-bucket
  - label: Token Bucket
    slug: token-bucket
  - label: Throttling
    slug: throttling
  - label: Load Shedding
    slug: load-shedding
references:
  - title: Rate limiting middleware in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/rate-limit
  - title: Rate Limiting pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/rate-limiting-pattern
---

A fixed window is the simplest rate limit that works. Divide time into equal buckets aligned to the clock, keep one counter per key per bucket, admit a request while the counter is below the limit, and let the counter go back to zero when the clock rolls into the next bucket. In Redis that is `INCR` and `EXPIRE` on a key whose name contains the current minute. In memory it is an integer and a timestamp. There is no algorithm here to get wrong, and that is most of the appeal.

The cost of that simplicity is entirely at the boundary. Because the counter resets on the clock rather than on the traffic, the last instant of one window and the first instant of the next are separated by a reset that hands the whole limit back at once. A client that sends its full allowance just before the boundary and its full allowance again just after has sent twice the limit in an interval shorter than one window, without breaking a single rule. With a limit of 100 per minute that is 200 requests in about two seconds; the effective peak of a fixed window is always twice its configured limit, and the interval it happens in is as short as the client cares to make it.

That is not a subtle failure mode, because the boundary is public. It is a round number on a wall clock, so a caller does not have to discover it, only look at the time, and anybody deliberately pushing against your limit will find it immediately. Worse, ordinary clients converge on it without meaning to: retries scheduled on the minute, cron jobs at the top of the hour, mobile clients woken by a shared schedule. Instead of the doubled burst being spread thinly across your key space, it arrives from everybody at once, which is precisely when your dependency can least afford it.

Two mitigations make a fixed window usable without changing what it is. The first is to give each key its own window origin, derived from a hash of the key, so that the seams are spread across the whole window instead of lining up on the clock. The doubled burst is still there per key, but it is no longer synchronized across the fleet, which is the difference between a spike and a wave. The second is honesty: write down that the real peak is twice the number in the configuration, size the thing behind the limiter for that peak, and never put the configured number in a contract or a billing tier, because it is not the number a client can actually be held to.

Size the window with the seam in mind as well. A short window makes the doubling smaller in absolute terms and more frequent, so a one-second window with a limit of ten peaks at twenty requests inside two seconds, while a one-hour window with a limit of thirty-six thousand peaks at seventy-two thousand. Shorter windows are usually kinder to whatever is downstream, at the cost of refusing legitimate short bursts that a longer window would have absorbed.

Reach for something else once the limit is a promise rather than a guard. A sliding window measures the last N seconds from now, so there is no reset to line up against and the limit holds at every instant. Its exact form remembers a timestamp per arrival, and the common approximation keeps two counters per key and weighs the previous one by how much of it still overlaps the present, which removes the free reset at a fraction of the memory. In .NET the choice is one class name: `FixedWindowRateLimiter` for this, `SlidingWindowRateLimiter` for the sliding one, both configured the same way and both partitioned by key through `PartitionedRateLimiter`. That second class is a different approximation from the weighted pair just described: it keeps `SegmentsPerWindow` counters and hands the oldest segment's permits back whole every `Window`/`SegmentsPerWindow`, with no weighting. And the in-process `FixedWindowRateLimiter` is not clock-aligned: its window starts when the limiter is created, and `PartitionedRateLimiter` builds one per key on that key's first request, so the seams are already spread out without you hashing anything. The clock-aligned version is the Redis `INCR` and `EXPIRE` one, and that is where skew between nodes matters. Whichever you use, return 429 with `Retry-After` on rejection, because a limiter that refuses without saying when to come back teaches every client to keep knocking.
