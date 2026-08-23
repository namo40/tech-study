---
title: "Cancellation Token"
summary: "A cancellation token is how the decision to stop waiting reaches the work itself, which is what turns a timeout from a message to the caller into a cut that the dependency also sees."
category: "Resilience"
scene: request-timeout
sceneStep: 4
related:
  - label: Request Timeout
    slug: request-timeout
  - label: Timeout
    slug: timeout
  - label: Deadline
    slug: deadline
  - label: Thread Pool
    slug: thread-pool
  - label: Thread Pool Starvation
    slug: threadpool-starvation
  - label: Background Job
    slug: background-job
  - label: Hedging
    slug: hedging
  - label: Retry
    slug: retry
references:
  - title: Cancellation in managed threads
    url: https://learn.microsoft.com/en-us/dotnet/standard/threading/cancellation-in-managed-threads
  - title: HttpContext.RequestAborted
    url: https://learn.microsoft.com/en-us/dotnet/api/microsoft.aspnetcore.http.httpcontext.requestaborted
  - title: gRPC deadlines and cancellation
    url: https://learn.microsoft.com/en-us/aspnet/core/grpc/deadlines-cancellation
---

A timeout that nobody downstream hears about does not save any work; it moves it. The caller stops waiting, releases its thread and returns an error, and the dependency carries on with a query, a request and a response that no one will ever read. Under load this is the worst of both outcomes: the caller is failing fast and the dependency is still running at full capacity on results that are thrown away, so the thing that caused the timeouts never gets a chance to recover. A cancellation token is the channel that closes that gap, and it only works if it is passed down every level rather than accepted and dropped at the first one.

In ASP.NET Core the token to start from is `HttpContext.RequestAborted`, which fires both when the client disconnects and when a request timeout policy trips. Everything the handler awaits should take it: `FindAsync([id], ct)`, `GetFromJsonAsync(url, ct)`, `ReadAsync(buffer, ct)`. Where a step needs a tighter bound than the request as a whole, the answer is a linked source rather than a separate one, because `CreateLinkedTokenSource(ct)` plus `CancelAfter(remaining)` keeps both reasons for stopping alive. Over gRPC the client's deadline arrives as cancellation on the server side, so honouring the token there is what makes a client's deadline mean something at the far end.

Two habits make this real rather than decorative. First, treat a parameter of type `CancellationToken` as something to pass on, never as something to ignore: an `async` method that accepts a token and does not use it is worse than one that does not accept it, because it looks correct. Second, be deliberate about work that must not be cancelled. A request that has already committed a payment should finish writing what it did, so the token belongs on the calls before the commit and not on the ones that record it, and long work that has to outlive the request belongs in a background job with a token of its own rather than borrowing the request's.
