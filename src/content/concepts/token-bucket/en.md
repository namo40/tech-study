---
title: "Token Bucket"
summary: "A token bucket allows a burst up to its capacity and a sustained rate equal to its refill rate, which is what makes it the usual algorithm behind a rate limiter."
category: "Resilience"
tags: ["overload"]
scene: rate-limiter
related:
  - label: Rate Limiter
    slug: rate-limiter
  - label: Leaky Bucket
    slug: leaky-bucket
  - label: Fixed Window
    slug: fixed-window
  - label: Sliding Window
    slug: sliding-window
references:
  - title: System.Threading.RateLimiting
    url: https://learn.microsoft.com/en-us/dotnet/api/system.threading.ratelimiting
  - title: Rate Limiting pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/rate-limiting-pattern
---

A token bucket holds up to a fixed number of tokens and refills at a fixed rate. Every request removes one token, and a request that arrives at an empty bucket is rejected. Two numbers describe the whole algorithm: capacity and refill rate.

Capacity is the burst allowance. A bucket of 20 lets a client that has been quiet send 20 requests back to back, because the tokens accumulated while it was idle. Refill rate is the sustained rate: over a long enough window, a client can never exceed it.

A fixed window counter has a boundary problem that a bucket does not. With a limit of 100 per minute, a client can send 100 just before the minute ends and another 100 just after, which is 200 requests in about a second and entirely within the rules. Tokens are spent and replaced continuously, so there is no boundary to line up against.

Pick the refill rate from what the dependency can sustain, then pick capacity from how large a legitimate burst is. A few seconds of refill is a common starting point for capacity. Much more than that and the limit stops protecting anything for as long as the burst lasts.
