---
title: "IHostedService"
summary: "IHostedService is the contract that ties a long-running piece of work to the host's lifetime: the host calls StartAsync when it comes up and StopAsync when it goes down, and everything graceful shutdown means is what the service does with the token it is given."
category: "Scheduled work and workflows"
tags: ["queue"]
scene: background-service
sceneStep: 2
related:
  - label: Background Service
    slug: background-service
  - label: Worker Service
    slug: worker-service
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: Cancellation Token
    slug: cancellation-token
  - label: Work Queue
    slug: work-queue
  - label: Background Job
    slug: background-job
  - label: Readiness Probe
    slug: readiness-probe
  - label: Rolling Update
    slug: rolling-update
  - label: At-Least-Once
    slug: at-least-once
references:
  - title: Background tasks with hosted services in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/host/hosted-services
  - title: Worker services in .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/workers
  - title: Create a Queue Service
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/queue-service
---

The second step of the scene is a lamp with four words on it, and the interesting one is the third. `start` is the host bringing the service up; `running` is the loop taking jobs off the queue; `stopped` is the process gone. `stopping` is the state in between, and it exists because shutdown is a request rather than an event: the service has been told, it is no longer taking new work, and it still has one job in its hands. The lamp does not reach `stopped` until that job has landed on the strip, which is the whole difference between a shutdown and a kill.

`IHostedService` is a two-method interface. The host calls `StartAsync` on every registered service as the application comes up, in registration order, and awaits each one before moving to the next; on shutdown it calls `StopAsync` in reverse order with a token that is already counting down. That ordering is why long work does not belong in `StartAsync`: the host is blocked on it, and an application that takes forty seconds to start looks to a container platform like an application that failed to start. Start the loop, return, and let the work happen after the host is up.

`BackgroundService` is the base class almost everyone should use instead of implementing the interface directly. It implements `StartAsync` by calling your `ExecuteAsync` and *not* awaiting it past the first incomplete await, which is exactly the "start the loop and return" behaviour you would otherwise have to write yourself. It implements `StopAsync` by cancelling the token it handed you and then waiting for your task to finish, bounded by `HostOptions.ShutdownTimeout`, which defaults to thirty seconds. So the token is not advisory: it is the mechanism by which the host asks, and your `Task` completing is the answer.

That makes one parameter carry the entire contract. `stoppingToken` has to reach every await inside the loop — the receive, the HTTP call, the database call, the delay — because a loop that only checks `IsCancellationRequested` at the top of each iteration is still going to sit inside a thirty-second poll when shutdown arrives. When cancellation lands mid-job, the honest thing is usually to let the `OperationCanceledException` propagate rather than swallow it: the job was not finished, the message was never acknowledged, and the queue will hand it to somebody else. Swallowing it and reporting success is how work disappears.

The other half of the contract is what the host does when the service falls over. If `ExecuteAsync` throws, the task faults, and since .NET 6 the default `BackgroundServiceExceptionBehavior.StopHost` brings the application down with it — loud, and usually right, because a worker that is not working should not pass a health check. The alternative, `Ignore`, is the older behaviour and the more dangerous one: a registered service that quietly no longer runs, with nothing in the logs after the first exception and every probe still green. Catch inside the loop where you can decide what a failure means, and let the ones you cannot handle escape.

Two smaller things follow from the service being a singleton. Scoped dependencies cannot be injected into its constructor, because there is no scope at the time it is built and the one context you got would live as long as the process; create a scope per iteration with `IServiceScopeFactory` instead. And `IHostApplicationLifetime` is the way to talk about shutdown rather than merely react to it: `ApplicationStopping` fires before the token is cancelled, and `StopApplication()` is how a worker that has decided it cannot continue asks the host to go down cleanly instead of throwing and hoping.
