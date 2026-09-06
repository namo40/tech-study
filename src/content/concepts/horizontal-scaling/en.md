---
title: "Horizontal Scaling"
summary: "Adding capacity by adding instances rather than by making one instance bigger. The arithmetic is easy; the precondition is not, because it only works if any instance can serve any request and if the work actually divides."
category: "Containers and orchestration"
tags: ["kubernetes"]
level: 3
scene: horizontal-pod-autoscaler
sceneStep: 2
related:
  - label: Horizontal Pod Autoscaler
    slug: horizontal-pod-autoscaler
  - label: Elasticity
    slug: elasticity
  - label: Stateless Server
    slug: stateless-server
  - label: Sharding
    slug: sharding
  - label: Load Balancer
    slug: load-balancer
  - label: Vertical Pod Autoscaler
    slug: vertical-pod-autoscaler
references:
  - title: Autoscaling guidance
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/auto-scaling
  - title: "Kubernetes: autoscaling workloads"
    url: https://kubernetes.io/docs/concepts/workloads/autoscaling/
---

When traffic triples in the scene's second step, the answer is four pods rather than two larger ones, and that choice is the whole subject. Horizontal scaling means meeting more load with more copies of the same thing, each one identical and each one carrying a share. Vertical scaling means meeting it with a bigger machine: more cores, more memory, a faster disk. Both are real answers and the second is often the cheaper one to reach, because it needs no change to the application at all, but it ends in three places every time. There is a largest instance the platform sells and no rung above it. Changing size usually means a restart, so capacity is added with an outage or with a failover. And however large that instance is, it is still one instance, so the machine that holds all of your capacity is also the machine whose failure removes all of it. Adding copies has no such ceiling and produces redundancy as a side effect: the same four pods that carry the spike also mean that losing one costs a quarter of the fleet rather than everything.

The catch is that copies only help if a request can go to any of them, which makes the precondition an architectural property rather than a configuration. An instance that holds a user's session in its own memory, writes files to its own disk, keeps a counter that enforces a limit, or runs a scheduled job because it happened to start first, is an instance that some requests need. Statelessness is the property that removes that need, and getting there is the actual work of scaling out: session and cache moved to a shared store, uploads moved to object storage, singleton jobs moved behind a lease. Two more preconditions ride along. Something in front has to spread the traffic, so a balancer or a service address is part of the design rather than an add-on. And a new instance is only useful once it is ready, so start-up time, cache warm-up and connection pool creation are all part of how quickly capacity can arrive, which is why the pods the scene adds are not useful the instant they appear.

The interesting limit is not the ceiling but the things that refuse to divide. Every replica of a stateless service talks to the same database, and while reads can be spread across replicas, writes converge on one writer that gains nothing from a larger fleet in front of it; past a point, more application instances only mean more connections and more contention on the same rows. A licence counted per node, a third-party API with a fixed quota, an external system that serialises calls per account, and any work that requires the whole dataset in one process behave the same way. Coordination itself is a cost: instances that have to agree, take locks or re-balance among themselves lose part of each addition to the agreeing. When the wall is the single writer, the next move is to stop scaling the workers and start dividing the data, which is what sharding is for.

So the discipline is to know which resource you are actually adding, and to check the arithmetic against measurement rather than intuition. Doubling the instances of a service whose bottleneck is downstream buys nothing and can make things worse by doubling the pressure on the bottleneck. Adding a replica to absorb a burst is a different decision from running one permanently for redundancy, and both are different from the question of who presses the button: deciding the number automatically, and how eagerly to remove capacity again, belongs to the autoscaler this scene is about.
