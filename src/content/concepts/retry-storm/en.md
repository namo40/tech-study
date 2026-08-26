---
title: "Retry Storm"
summary: "A retry storm is the surge of synchronized retries that knocks a dependency over just as it starts to recover."
category: "Resilience"
tags: ["overload"]
scene: retry
sceneStep: 3
related:
  - label: Retry
    slug: retry
  - label: Jitter
    slug: jitter
  - label: Retry Budget
    slug: retry-budget
  - label: Circuit Breaker
    slug: circuit-breaker
references:
  - title: Build resilient HTTP apps with .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience
---

A retry storm is what happens when many clients retry on the same schedule. The dependency fails, every caller backs off for the same interval, and they all come back at the same instant. The surge knocks the dependency over before it has finished recovering.

The damage is self-inflicted. The original fault may have been brief, but the retry policy converts it into a repeating wave that keeps the dependency down. Retries at several layers multiply: three attempts each turns one call into twenty-seven.

Jitter is the first fix, a retry budget is the second, and a circuit breaker is the backstop. Together they break the synchronization, cap the volume, and stop the probing entirely while recovery is unlikely.
