---
title: "Closed State"
summary: "Closed is the normal state of a circuit breaker: calls pass through to the dependency while the breaker counts how many of them fail."
category: "Resilience"
scene: circuit-breaker
sceneStep: 1
related:
  - label: Circuit Breaker
    slug: circuit-breaker
  - label: Open State
    slug: open-state
  - label: Half-Open State
    slug: half-open-state
references:
  - title: Circuit Breaker pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker
---

Closed is the normal state of a circuit breaker. Every call passes through to the dependency, and the breaker records whether it succeeded or failed.

The recording is the whole point. A closed breaker is not a pass-through: it is a sampling window holding a running failure ratio, and when that ratio crosses the threshold within the window the breaker opens.

Give the window a minimum throughput. Without one, two failures out of three calls read as a 67 percent failure rate and trip the breaker on a statistically meaningless sample.
