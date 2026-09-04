---
title: "Exponential Backoff"
summary: "Exponential backoff multiplies the wait between attempts, so a struggling dependency gets a longer gap with every retry."
category: "Resilience"
tags: ["overload"]
scene: retry
sceneStep: 2
related:
  - label: Retry
    slug: retry
  - label: Jitter
    slug: jitter
  - label: Retry Storm
    slug: retry-storm
  - label: Circuit Breaker
    slug: circuit-breaker
references:
  - title: Build resilient HTTP apps with .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience
---

Exponential backoff multiplies the wait between attempts, usually by two. A first retry after 500 ms is followed by one second, then two, then four. The dependency gets a longer gap every time instead of the same short one.

A fixed interval is the problem it solves. Retrying every 200 ms turns a slow dependency into a dependency under load, because the caller keeps adding work while nothing is draining. Doubling the gap gives the queue a chance to clear.

Cap it. Growth without a ceiling eventually produces waits nobody will sit through, so pair the multiplier with a maximum delay and an overall deadline. In Polly those are `MaxDelay` on the retry options, which is unset by default, and a timeout strategy added before the retry so that it nests outside it.
