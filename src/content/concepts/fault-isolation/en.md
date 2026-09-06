---
title: "Fault Isolation"
summary: "Deciding at design time how far a failure is allowed to travel. The boundary has to be drawn before the incident, it has to divide something finite, and everything on the far side of it survives by not sharing."
category: "Resilience"
level: 5
scene: bulkhead
sceneStep: 3
related:
  - label: Bulkhead
    slug: bulkhead
  - label: Circuit Breaker
    slug: circuit-breaker
  - label: Request Timeout
    slug: request-timeout
  - label: Noisy Neighbor
    slug: noisy-neighbor
  - label: Pod Disruption Budget
    slug: pod-disruption-budget
  - label: Sharding
    slug: sharding
references:
  - title: Bulkhead pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/bulkhead
  - title: Introduction to resilient app development
    url: https://learn.microsoft.com/en-us/dotnet/core/resilience/
---

The wall that appears in the scene's third step is one drawing of a general idea, and the idea is worth separating from the drawing. Fault isolation is the practice of deciding, in advance, how far the effects of a failure are permitted to spread, and then building a boundary that enforces the decision. The failure itself is not prevented by any of this. The dependency still breaks, the disk still fills, the deployment still ships the bad build; what changes is the answer to the question of who else finds out. That answer is called the blast radius, and the useful design exercise is to write it down as a sentence before an incident forces you to discover it: when this fails, these things stop working, and those things do not.

What makes a boundary real is that it divides something finite. Two workloads sharing a resource that has no partition in it are one workload as far as failure is concerned, because the first one to exhaust the resource takes it from the second, and nothing about the second was wrong. The shared thing is usually less visible than a wall suggests: a connection pool, a thread pool, a CPU quota, a disk, a database, a deployment pipeline, a shared secret, an on-call engineer's attention. Anything on that list which is not divided is a path a failure can take, and the boundaries that hold in practice are the ones drawn where the contention actually is rather than where the diagram is prettiest. That is the pathology behind a noisy neighbour: not that one tenant misbehaved, but that nothing between the tenants was ever divided.

The principle then shows up at every scale, each instance a different answer to what gets divided and how strictly. Splitting a pool so a slow dependency cannot consume every slot is the version the scene draws, and it is the cheapest to adopt. A timeout is isolation in the time dimension, because it puts an upper bound on how long one call may hold anything, and a concurrency cap does the same in quantity. Separate processes or containers isolate a memory leak or a crash that a shared runtime would spread. Separate deployments isolate a bad release, which is why a canary is a blast-radius decision as much as a testing one. Above that sit cells: a whole self-contained copy of the stack, with its own data and its own capacity, serving a defined slice of customers, so a failure that would have been global instead affects one slice. Availability zones and regions are the same principle applied to infrastructure that fails together for physical reasons.

The price is paid in utilisation and in complexity, and it is paid whether or not the failure ever arrives. Reserved compartments idle while another compartment queues, so a fleet divided into eight isolated parts needs headroom in each of the eight rather than one shared pool of slack, and the finer the division the more of the bill is spare capacity. More boundaries also mean more things to configure, size and monitor, and a boundary sized wrongly fails in both directions: too small and it rejects healthy traffic, too large and it never engages before the resource is gone. Two habits keep it honest. Draw the boundary along the axis that failures actually follow, which is usually the dependency, the tenant or the deployment unit rather than the org chart. And verify it the only way it can be verified, by breaking one side on purpose and watching whether the other side notices.
