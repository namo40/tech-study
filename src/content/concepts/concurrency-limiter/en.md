---
title: "Concurrency Limiter"
summary: "A concurrency limiter caps how many calls may be in flight at once, holds a bounded number more in a queue, and rejects the rest."
category: "Resilience"
scene: bulkhead
related:
  - label: Bulkhead
    slug: bulkhead
  - label: Rate Limiter
    slug: rate-limiter
  - label: Bounded Concurrency
    slug: bounded-concurrency
  - label: SemaphoreSlim
    slug: semaphoreslim
references:
  - title: Introduction to resilient app development
    url: https://learn.microsoft.com/en-us/dotnet/core/resilience/
  - title: Bulkhead pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/bulkhead
---

A concurrency limiter is built from permits. One permit is one call in flight, and the permit limit is how many the dependency may be handling at any instant. A call takes a permit on the way out and gives it back when the response arrives or the timeout fires.

The queue is a bounded waiting room. When every permit is taken, the next few callers wait for one to come free instead of failing immediately. Bounding it is the whole point. An unbounded queue turns a slow dependency into unbounded memory and unbounded latency, which is a worse outcome than a rejection.

When the permits and the queue are both full, the limiter rejects. That rejection is a feature rather than a failure to cope: it is what keeps the caller responsive, and it is what makes a full compartment visible in metrics.

A rate limiter and a concurrency limiter measure different things. A rate limiter counts requests per window of time; a concurrency limiter counts requests in flight right now. A dependency that answers in a millisecond can absorb a huge rate at a small concurrency, and one that takes ten seconds cannot. Most services need both.
