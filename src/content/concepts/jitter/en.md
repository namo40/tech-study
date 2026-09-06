---
title: "Jitter"
summary: "Jitter adds a random offset to each backoff wait, so retries from many clients do not land at the same instant."
category: "Resilience"
tags: ["overload"]
level: 4
scene: retry
sceneStep: 2
related:
  - label: Retry
    slug: retry
  - label: Exponential Backoff
    slug: exponential-backoff
  - label: Retry Storm
    slug: retry-storm
references:
  - title: Build resilient HTTP apps with .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience
---

Jitter adds a random offset to every backoff wait. Instead of retrying at exactly one second, a client retries somewhere between half a second and one and a half.

It matters because clients fail together. A dependency that goes down takes every caller with it, and every caller then starts the same backoff schedule at the same moment. Without jitter their retries arrive as a single spike, again and again.

Prefer full jitter, which picks the delay uniformly between zero and the current backoff ceiling. It spreads load better than adding a small wobble to a fixed value. Polly's `UseJitter` is not that: it applies a decorrelated jitter formula to exponential backoff and ±25% to constant or linear backoff, and full jitter needs a `DelayGenerator` of your own.
