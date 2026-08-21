---
title: "Open State"
summary: "Open is the state in which a circuit breaker rejects calls immediately, giving the failing dependency time to recover."
category: "Resilience"
scene: circuit-breaker
sceneStep: 2
related:
  - label: Circuit Breaker
    slug: circuit-breaker
  - label: Closed State
    slug: closed-state
  - label: Half-Open State
    slug: half-open-state
  - label: Retry
    slug: retry
references:
  - title: Circuit Breaker pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker
---

Open is the state in which a circuit breaker stops calling the dependency at all. Every call is rejected at the breaker and returns immediately, without a network round trip.

Failing fast is the service the breaker does for the caller. The alternative is a thread waiting out a timeout on a dependency that is already known to be down, and enough of those waiting threads take the caller down too.

The break duration is the one number to get right. Too short and the breaker keeps probing a dependency that has not recovered. Too long and healthy traffic stays blocked after it has.
