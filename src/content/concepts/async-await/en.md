---
title: "Async/Await"
summary: "`await` is the point where a method gives its thread back: the I/O starts, the method returns an unfinished Task to its caller, and the rest of the method is queued to run when the I/O completes, on whatever thread is free then."
category: "Pools and resources"
scene: async-await
steps:
  - title: "What await does"
    text: "The method runs until it hits await. Then the I/O starts, the method hands an unfinished Task back to its caller, and the thread is free. When the I/O finishes, the rest of the method is queued and runs on whichever thread is free, not necessarily the same one."
  - title: "Sequential or concurrent"
    text: "Awaiting one call after another takes the sum of their times. Starting both first and awaiting them together takes the longest one. Same threads, same I/O; only the order of the awaits changed."
  - title: "Two mistakes"
    text: "Blocking with .Result keeps the thread busy doing nothing, and in a single-threaded context the continuation has nowhere to run: deadlock. An async void method returns nothing to await, so its exception has nowhere to go. Use async all the way down, and return a Task."
  - title: "Cancellation and errors ride the same path"
    text: "Pass the token all the way to the I/O, and cancelling stops the work instead of abandoning it. Whether it is a cancellation or a failure, awaiting the Task rethrows it right at the await, where a normal catch can handle it."
related:
  - label: Asynchronous I/O
    slug: asynchronous-io
  - label: Thread Pool
    slug: thread-pool
  - label: Thread Pool Starvation
    slug: threadpool-starvation
  - label: Cancellation Token
    slug: cancellation-token
  - label: Request Timeout
    slug: request-timeout
  - label: Tail Latency
    slug: tail-latency
  - label: I/O Completion Port
    slug: io-completion-port
  - label: Task
    slug: task
  - label: Batching
    slug: batching
references:
  - title: "Asynchronous programming with async and await (C#)"
    url: https://learn.microsoft.com/en-us/dotnet/csharp/asynchronous-programming/
  - title: "The Task asynchronous programming model"
    url: https://learn.microsoft.com/en-us/dotnet/csharp/asynchronous-programming/task-asynchronous-programming-model
  - title: "ASP.NET Core best practices"
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/best-practices?view=aspnetcore-10.0
---

## When to use

- For every piece of I/O: a database round trip, an HTTP call, a file read, a message sent to a broker. If the API offers an async method, use it, and keep the whole call chain async so no layer in the middle has to block.
- Wherever throughput matters more than the latency of one call. Async does not make a single request faster; it makes the thread that was waiting available to someone else, which is what keeps a server responsive under load.
- When several independent calls can be in flight at once. Starting them together and awaiting them together is the cheapest latency win most services have.

CPU-bound work is a different problem. `await` does not make a computation faster, and `Task.Run` only moves it to another pool thread, so the work still costs a thread for as long as it runs. Async is about waiting, not about working.

## Cautions

- Never block on a Task on the request path. `.Result`, `.Wait()` and `GetAwaiter().GetResult()` hold a pool thread that is doing nothing, and in a context with a single thread to come back to they deadlock outright.
- Never write `async void` except for an event handler. It returns nothing to await, so nobody can observe when it finished or what it threw, and an unhandled exception takes the process down. Return `Task` instead.
- Start independent calls first, then await them together with `Task.WhenAll`. Awaiting each one in turn adds the waits together for no reason.
- Pass a `CancellationToken` through every layer down to the I/O itself. A token that stops at the top of the stack cancels nothing; it just stops you waiting for work that carries on. In ASP.NET Core the token to pass is `HttpContext.RequestAborted`.
- `ConfigureAwait(false)` belongs in library code, where you cannot know what context the caller is on. It changes nothing in ASP.NET Core, which has no synchronization context.
- Fire-and-forget loses both the exception and the lifetime. A Task nobody holds can be abandoned mid-flight when the host shuts down, and its failure is never seen. Use a background service or a durable queue.
- An async method that never awaits still allocates its state machine and still warns you at compile time. Either await something or make it synchronous.

## In .NET

The difference between the two shapes below is nothing but the order of the awaits, and it is worth 300 ms on every request that makes both calls.

```csharp
// Sequential: 600 ms.
var a = await catalog.GetAsync(id, ct);
var b = await pricing.GetAsync(id, ct);

// Concurrent: 300 ms. Start both, then await both.
var aTask = catalog.GetAsync(id, ct);
var bTask = pricing.GetAsync(id, ct);
await Task.WhenAll(aTask, bTask);
var (item, price) = (aTask.Result, bTask.Result);   // safe here: both are already complete
```

Reading `.Result` after `WhenAll` is safe because both Tasks have already completed, so nothing blocks. Reading it on a Task that has not completed is the mistake the third step of the scene is about.

```csharp
// Wrong: blocks a pool thread and can deadlock in a single-threaded context.
var blocked = catalog.GetAsync(id, ct).Result;

// Wrong: nothing to await, exceptions are lost.
async void Fire() => await catalog.GetAsync(id, ct);
```

Cancellation flows down and exceptions flow up, and both of them travel through the await. That is why the token has to reach the call that does the waiting, and why a plain `catch` at the caller is enough to handle whatever comes back.

```csharp
try
{
    var item = await catalog.GetAsync(id, http.RequestAborted);
}
catch (OperationCanceledException) { /* client went away */ }
catch (HttpRequestException ex)    { /* dependency failed */ }
```

`ValueTask` is worth reaching for only on a hot path that usually completes synchronously, and only after measuring: it exists to avoid an allocation, not to be faster in general. It also has to be awaited exactly once, so treat it as a value you consume immediately rather than one you store.
