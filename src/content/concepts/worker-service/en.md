---
title: "Worker Service"
summary: "A worker service is the same background loop moved into a process of its own: it deploys on its own schedule, scales on queue depth rather than on web traffic, and keeps running while the app it used to live inside is restarting."
category: "Scheduled work and workflows"
tags: ["queue"]
level: 4
scene: background-service
sceneStep: 3
related:
  - label: Background Service
    slug: background-service
  - label: IHostedService
    slug: ihostedservice
  - label: Competing Consumers
    slug: competing-consumers
  - label: Work Queue
    slug: work-queue
  - label: Elasticity
    slug: elasticity
  - label: Horizontal Pod Autoscaler
    slug: horizontal-pod-autoscaler
  - label: Web Queue Worker
    slug: web-queue-worker
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: Poison Message
    slug: poison-message
references:
  - title: Worker services in .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/workers
  - title: Create a Queue Service
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/queue-service
  - title: Background tasks with hosted services in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/host/hosted-services
---

The third step of the scene changes almost nothing about the loop and everything about what it is attached to. The `service` capsule picks up a process boundary of its own, and from that moment the two restarts in the step read differently: the app goes dark and the loop keeps taking jobs, then the loop goes away and the queue simply gets deeper until it comes back. Neither of those is a feature somebody added. They are what having two lifetimes instead of one looks like.

In code the move is small. `dotnet new worker` gives you a `Host` instead of a `WebApplication`, the same `BackgroundService` subclass, and no HTTP pipeline at all. Everything the hosting model gives a web app — configuration, logging, dependency injection, options, health of the process itself — is there, because the generic host was always the thing underneath and the web bits were the part layered on top. If the loop already lived in your API as a hosted service, moving it usually means copying one class and its registration into a new project and deleting them from the old one.

What you buy is decoupling of three things that were previously fused. Deployment: the worker ships when the worker changes, and a fix to the report generator no longer means a rolling restart of the tier that answers customers. Scale: web replicas track requests per second and worker replicas track queue depth, which are unrelated numbers, and running one on the other's signal means either idle workers during a traffic spike or a backlog nobody is adding capacity for. Failure: a memory-hungry job that recycles the process now recycles a process nobody is waiting on, instead of taking the API's request pipeline down with it.

The price is that the worker is now a distributed component, and two consequences arrive with it. The queue has to be real — a broker or a table, not a `Channel<T>` in memory, because the producer and the consumer are no longer in the same process and there is nothing shared to put an in-memory channel in. And once there is more than one replica, two of them will reach for the same item unless something prevents it: a per-message lock from the broker, a lease you take and renew, or a partitioning scheme where each replica owns a slice of the keyspace. This is the fourth step of the scene, and it is the part that makes scaling a worker out different from setting a replica count.

Two operational details are worth setting deliberately. Shutdown: a container platform sends SIGTERM and then waits, so `HostOptions.ShutdownTimeout` has to be shorter than the platform's grace period or the process is killed while it still believes it is finishing a job. And health: a worker with no HTTP endpoint has nothing for a probe to call, so either add a minimal health endpoint, or report liveness by touching a file or a metric the platform can read. A worker whose loop has quietly stopped looks exactly like a worker with nothing to do, and the difference between those two is worth being able to see.

Where a worker stops being the right shape is where the work needs to be coordinated rather than merely consumed. Fan-out with a join, steps that must resume after a crash halfway through, human approval in the middle, compensation when a later step fails: those want durable state per run and something that owns it. A worker service is a loop and a queue, and that is a lot; it is not a workflow engine, and building one inside `ExecuteAsync` is how a hundred lines of consumer turns into an unowned orchestrator.
