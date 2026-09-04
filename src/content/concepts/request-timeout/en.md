---
title: "Request Timeout"
summary: "A request timeout is the upper bound a caller puts on a remote call: without one, a hung dependency holds the caller forever; with one, the caller fails fast, passes the remaining budget down, and cancels the work it no longer needs."
category: "Resilience"
tags: ["latency"]
scene: request-timeout
steps:
  - title: "No timeout"
    text: "The dependency hangs, so the call hangs, and so does every thread and connection behind it. The user gives up after five seconds; the server is still waiting."
  - title: "Several ceilings"
    text: "Connecting, one attempt, and the whole request are three different limits. Connect and attempt fire here; the total caps the whole request, and a slow answer becomes a fast error while the thread goes back to work."
  - title: "Pass the remaining budget down"
    text: "One request, 800 ms. The database took 300, so the next call gets 500, not a fresh timeout of its own. Run the same pair with a fresh 500 ms ceiling on the second call and it lands 300 ms past the deadline."
  - title: "Cancel what you stopped waiting for"
    text: "A timeout without cancellation leaves the dependency doing ghost work for nobody. Flow the cancellation token all the way down, so the cut is real."
related:
  - label: Timeout
    slug: timeout
  - label: Deadline
    slug: deadline
  - label: Cancellation Token
    slug: cancellation-token
  - label: Connection Timeout
    slug: connection-timeout
  - label: Idle Timeout
    slug: idle-timeout
  - label: Retry
    slug: retry
  - label: Circuit Breaker
    slug: circuit-breaker
  - label: Hedging
    slug: hedging
  - label: Thread Pool Starvation
    slug: threadpool-starvation
  - label: Database Connection Pool
    slug: database-connection-pool
references:
  - title: Request timeouts middleware in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/timeouts?view=aspnetcore-10.0
  - title: Build resilient HTTP apps with .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience
  - title: Cancellation in managed threads
    url: https://learn.microsoft.com/en-us/dotnet/standard/threading/cancellation-in-managed-threads
---

## When to use

- Every remote call, without exception: HTTP, gRPC, database, cache, message broker.
- Every request that fans out to more than one dependency: give the request one deadline and derive each call's timeout from what is left of it.
- Anywhere the caller holds something scarce while it waits, which is almost everywhere: a thread, a pooled connection, a socket.

## Cautions

- Connect timeout, per-attempt timeout, total request timeout and idle timeout are four different settings. Set the ones that matter for each call instead of assuming one of them covers the others.
- A timeout is not a retry policy. Decide separately whether the call may be retried at all, and inside which budget.
- Pass a `CancellationToken` into every async call. A timeout that does not cancel only moves the waste from the caller to the dependency.
- Too short a timeout fails healthy calls under ordinary variance. Start from the p99 of a healthy dependency and add headroom.
- "No timeout" is a decision as much as any number is. Most clients ship with one, so find out what it actually is before you rely on it.
- The request timeouts middleware does not fire while a debugger is attached, the same as Kestrel's own timeouts. Test it without one, or the conclusion "our timeout does not work" will be about the debugger.

## In .NET

One deadline is set for the whole request, and every call underneath it is bounded by what is left rather than by a fresh limit of its own.

```csharp
// One deadline for the whole request (ASP.NET Core request timeouts middleware).
builder.Services.AddRequestTimeouts(options =>
    options.DefaultPolicy = new RequestTimeoutPolicy { Timeout = TimeSpan.FromMilliseconds(800) });
app.UseRequestTimeouts();

app.MapGet("/checkout/{id:int}", async (int id, ShopDbContext db, HttpClient pricing, HttpContext http) =>
{
    var ct = http.RequestAborted;                        // cancelled on timeout or client disconnect
    var started = Stopwatch.GetTimestamp();

    var order = await db.Orders.FindAsync([id], ct);     // token flows into the database call

    var left = TimeSpan.FromMilliseconds(800) - Stopwatch.GetElapsedTime(started);
    using var pricingCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
    pricingCts.CancelAfter(left);                        // what is left, not a fresh 800

    var price = await pricing.GetFromJsonAsync<Price>($"/prices/{order!.Sku}", pricingCts.Token);
    return Results.Ok(new { order.Id, price });
});
```

The ceilings on an `HttpClient` are separate settings again. `AddStandardResilienceHandler()` gives the pipeline both a total request timeout and a per-attempt timeout, and the ceiling on opening the connection is `SocketsHttpHandler.ConnectTimeout`, which belongs to neither of them. Setting all three is what makes "the call took too long" a statement about a specific stage rather than a shrug.
