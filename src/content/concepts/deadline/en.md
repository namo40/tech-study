---
title: "Deadline"
summary: "A deadline is one point in time that the whole request is measured against, so every call underneath it is given what is left rather than a fresh timeout of its own."
category: "Resilience"
tags: ["latency"]
level: 4
scene: request-timeout
sceneStep: 3
related:
  - label: Request Timeout
    slug: request-timeout
  - label: Timeout
    slug: timeout
  - label: Cancellation Token
    slug: cancellation-token
  - label: Connection Timeout
    slug: connection-timeout
  - label: Retry
    slug: retry
  - label: Retry Budget
    slug: retry-budget
  - label: Tail Latency
    slug: tail-latency
  - label: p99
    slug: p99
references:
  - title: gRPC deadlines
    url: https://learn.microsoft.com/en-us/aspnet/core/grpc/deadlines-cancellation
  - title: Request timeouts middleware in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/timeouts?view=aspnetcore-10.0
  - title: CancellationTokenSource.CancelAfter
    url: https://learn.microsoft.com/en-us/dotnet/api/system.threading.cancellationtokensource.cancelafter
---

A timeout is a duration and a deadline is an instant, and the difference is the whole point. Give a request a deadline when it arrives and every call it makes afterwards has an answer to the question "how long may I take?" that shrinks as the request proceeds. Give each call a duration instead and nobody is tracking the total, so the guarantee the caller thought it had is the sum of every ceiling on the path, which is always much larger than any single one of them. Two calls of 500 ms each under a request that promised 800 ms are not a violation of any setting; they are simply a promise nobody was enforcing.

The arithmetic is worth doing once. A request with 800 ms spends 300 on the database, so the HTTP call it makes next gets 500, and if that call has to open a connection first, the connect comes out of the same 500 rather than being free. Budgets nest; they do not add. This also means a deadline is the only sound basis for deciding whether to retry: a second attempt is worth making when there is enough of the budget left to finish it, and is pure waste otherwise, which is a question a per-call timeout cannot even ask.

Passing the deadline across a process boundary is what makes it work in a system rather than in one service. gRPC has this built in, and a deadline set by the client is propagated on the wire and surfaces in the server as `context.CancellationToken`, so a server can stop work the client has already given up on. Over plain HTTP there is no standard header for it, so a convention has to be chosen and honoured. Within a process, `CancellationTokenSource.CreateLinkedTokenSource` with `CancelAfter(remaining)` is the shape: the linked token still cancels when the incoming request is aborted, and it also fires when the request's own clock runs out.
