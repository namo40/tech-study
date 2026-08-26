---
title: "Timeout"
summary: "A timeout is the moment a caller stops waiting for an answer and decides the call has failed, which is the only thing standing between a slow dependency and a caller that never recovers."
category: "Resilience"
tags: ["latency"]
scene: request-timeout
related:
  - label: Request Timeout
    slug: request-timeout
  - label: Deadline
    slug: deadline
  - label: Cancellation Token
    slug: cancellation-token
  - label: Connection Timeout
    slug: connection-timeout
  - label: Retry
    slug: retry
  - label: Circuit Breaker
    slug: circuit-breaker
  - label: p99
    slug: p99
  - label: Thread Pool Starvation
    slug: threadpool-starvation
references:
  - title: Build resilient HTTP apps with .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience
  - title: Request timeouts middleware in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/timeouts?view=aspnetcore-10.0
  - title: Timeout resilience strategy
    url: https://www.pollydocs.org/strategies/timeout.html
---

A timeout is not an error handler. It is the decision, made in advance, about how long an answer is still worth having. That distinction matters because the failure a timeout prevents is not the slow call itself: it is everything queued behind the slow call. A caller waiting on a dependency is holding a thread, usually a pooled connection, often a socket and a chunk of memory, and it is holding all of it whether the dependency answers in two milliseconds or never. Without a ceiling, one stuck dependency converts into an exhausted thread pool, an exhausted connection pool, and an outage in a service that is itself perfectly healthy.

Picking the number is the part people avoid, and the temptation is to pick something large and safe. Large is not safe. A ten second timeout on a dependency that normally answers in twenty milliseconds is, in practice, no timeout at all: by the time it fires, everything behind it has already backed up. The useful starting point is the p99 of the dependency when it is healthy, plus enough headroom that ordinary variance does not trip it, and then a look at what the caller can actually afford. If the caller's own users will not wait longer than a second, no downstream call may be given two, whatever the dependency would like.

The mistake that survives the longest is treating a timeout as a complete answer. It is only half of one. A timeout tells the caller to stop waiting; it does not tell the dependency to stop working, and it does not say what should happen next. The other half is a cancellation that actually reaches the work, and a decision about the failure: retry it inside a budget, fall back to something cheaper, or fail the request outright. A timeout without that decision just turns a slow request into a fast error, over and over, at whatever rate the callers are arriving.
