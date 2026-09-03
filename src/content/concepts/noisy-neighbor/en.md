---
title: "Noisy Neighbor"
summary: "A noisy neighbour is one tenant or workload consuming enough of a shared resource that the others degrade. Every symptom appears on the victim and every cause sits outside it, which is why the work is diagnosis — measuring the shared resource per consumer — before it is remedy."
category: "Resilience"
tags: ["overload"]
scene: bulkhead
sceneStep: 2
related:
  - label: Bulkhead
    slug: bulkhead
  - label: Fault Isolation
    slug: fault-isolation
  - label: Rate Limiter
    slug: rate-limiter
  - label: CPU Limit
    slug: cpu-limit
  - label: Sharding
    slug: sharding
references:
  - title: "Noisy Neighbor antipattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/antipatterns/noisy-neighbor/noisy-neighbor
---

The scene's second step is this pathology with the names removed. B slows down, B's calls take every slot in the shared pool, and calls to a perfectly healthy A start failing because there is nowhere to put them. Swap the dependencies for tenants, or for two workloads on one node, or for two services against one database, and the picture is unchanged. The fault-isolation page states the underlying condition exactly — nothing between the parties was ever divided — and the name is worth having on top of that, because it is the name people reach for during an incident when a service is degraded and nothing in its own code, its own deploys, or its own traffic explains it.

The useful part of the metaphor is that the harm travels through the building rather than through the wall. The two parties never call each other, share no code path, and often do not know the other exists; what they share is a finite thing several layers down. That is why the diagnosis is so consistently slow. Every symptom lands on the victim — the victim's latency graph bends, the victim's timeouts fire, the victim's on-call is paged — and everything the victim can see about itself is correct. Its request rate is normal, its code did not change, its error budget was fine yesterday, and its dependency is technically up. The cause is not in the trace, because the neighbour's work does not appear anywhere in the victim's request.

So the move that actually resolves it is a measurement change, and it is the one thing this page will insist on. Stop looking at the shared resource in aggregate and start attributing it per consumer. A connection pool at a hundred percent utilisation tells you nothing at all; the same pool broken down by tenant tells you everything in one glance. In practice that means carrying the key you would partition by — tenant, customer, API key, queue, shard — as a dimension on the metrics for the things that are shared, and then looking at the distribution rather than the average, because a noisy neighbour is by definition an outlier and an average is the statistic designed to hide it. Database time by tenant, cache bytes by tenant, pool slots held by dependency, CPU by container on the node. The shared thing is usually less obvious than it sounds: a cache where one tenant's large entries evict everyone else's, a shard that one customer's growth has made hot, a thread pool, a shared build agent.

The remedies are not this page's, and pointing at them is the honest end of it. A noisy neighbour is a fact about a resource with no partition in it, so the fixes all consist of putting a partition somewhere: a bulkhead gives each consumer its own compartment of slots, a rate limiter keyed by tenant bounds what any one of them can ask for per second, a CPU limit stops one container taking a node's processor from the containers beside it, and sharding moves the largest tenants onto capacity they cannot take from anybody else. Fault isolation is the page that argues about where the boundary belongs. What is worth carrying away from the name itself is the temptation it creates and the one to resist: the neighbour is not the problem to be solved, and a system that stays healthy only while every tenant behaves reasonably has not been isolated at all.
