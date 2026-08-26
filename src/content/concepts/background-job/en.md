---
title: "Background Job"
summary: "A background job is work that runs outside the request that asked for it, so the response can come back before the work is done. The caller gets a receipt and finds out the outcome separately."
category: "Application architecture"
tags: ["queue"]
scene: web-queue-worker
sceneStep: 2
related:
  - label: Web-Queue-Worker
    slug: web-queue-worker
  - label: Work Queue
    slug: work-queue
  - label: BackgroundService
    slug: background-service
  - label: Worker Service
    slug: worker-service
  - label: Idempotent Consumer
    slug: idempotent-consumer
  - label: Graceful Shutdown
    slug: graceful-shutdown
references:
  - title: Worker services in .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/workers
  - title: Background tasks with hosted services in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/host/hosted-services?view=aspnetcore-10.0
  - title: Generic Host lifetime and shutdown
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/generic-host
---

A background job is the second half of a request that only did the first half. The endpoint records what was asked for, hands back an identifier, and returns; the work itself starts later, triggered either by the message the endpoint left on a queue or by a schedule. The user is not waiting on a connection for any of it, which is what makes work that takes thirty seconds an acceptable thing to offer at all.

In .NET the job runs inside a `BackgroundService`, the base class for a long-lived `IHostedService`. Registering one in the web application is the smallest possible step and it is the right one for jobs that are cheap and can be lost, because the job then shares everything with the site: its process, its memory, its deployments, and its scaling rules. A Worker Service project is the same class in its own host, deployed on its own and scaled on queue depth rather than on request rate. That separation is the point of the pattern, and it is worth taking as soon as the jobs are heavy enough to compete with the requests for CPU.

Because the job outlives the request, it cannot borrow anything the request owned. Resolve a fresh dependency injection scope per job rather than capturing scoped services in the constructor, and never hold on to `HttpContext`. Observe the `CancellationToken` the host passes in so a shutdown stops the job at a point it can be resumed from, and expect to be stopped mid-job anyway: the message will come back, so the handler has to be safe to run more than once. The client still needs to be told how it ended, which is a status endpoint, a webhook, or a notification, because `202 Accepted` only ever said the work was accepted.
