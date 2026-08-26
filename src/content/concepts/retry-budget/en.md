---
title: "Retry Budget"
summary: "A retry budget caps how much of your traffic may be retries, so a failing dependency cannot be handed several times the load it is already struggling with."
category: "Resilience"
tags: ["overload"]
scene: retry
sceneStep: 4
related:
  - label: Retry
    slug: retry
  - label: Retry Storm
    slug: retry-storm
  - label: Circuit Breaker
    slug: circuit-breaker
  - label: Timeout
    slug: timeout
references:
  - title: Build resilient HTTP apps with .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience
---

A retry budget caps retries as a share of normal traffic, for example ten percent. Once the share is spent, further failures go back to the caller instead of being retried.

A per-call limit is not enough. Three attempts per call sounds modest until every call is failing, at which point the dependency receives three times its usual load exactly when it can least afford it. A budget is a limit on the system, not on one call.

Set the budget against the dependency’s headroom rather than against how patient the caller feels, and emit its utilisation as a metric. It saturates before the error rate does.
