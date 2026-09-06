---
title: "Half-Open State"
summary: "Half-Open is the trial state of a circuit breaker: after the break duration it lets a single call through to test whether the dependency has recovered."
category: "Resilience"
level: 6
scene: circuit-breaker
sceneStep: 3
related:
  - label: Circuit Breaker
    slug: circuit-breaker
  - label: Open State
    slug: open-state
  - label: Closed State
    slug: closed-state
references:
  - title: Circuit Breaker pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker
---

Half-Open is the trial state. When the break duration expires, the breaker allows a small number of calls through, usually one, and rejects everything else while that trial is in flight.

It exists because there is no other way to know. Nothing tells the breaker that a dependency has recovered, so it has to ask, and it asks with the smallest possible sample rather than by reopening the floodgates.

The trial decides everything: success closes the breaker, failure opens it again for another break duration. Make sure the trial is a real call, not a health check that succeeds while the endpoint you actually use still fails.
