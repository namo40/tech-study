---
title: "Thread Pool"
summary: "The thread pool is a small, shared set of worker threads that run queued work. It stays healthy only when threads are returned quickly: block one on I/O and it is gone until the wait ends; await instead, and the thread serves someone else meanwhile."
category: "Pools and resources"
level: 5
scene: thread-pool
steps:
  - title: "Short work"
    text: "Requests arrive, a free thread runs each one for a moment, and the thread is back in the pool. Four threads are plenty."
  - title: "Blocked"
    text: "Each request parks on its thread while it waits for I/O. Soon every thread is waiting, the queue grows, three requests come back late, and the pool adds new ones only a couple per second. This is thread pool starvation."
  - title: "Await"
    text: "The same requests now await their I/O. Each one leaves its thread while it waits and comes back to any free thread afterwards. Four threads carry the whole stream."
  - title: "CPU work"
    text: "Long computations really do need a thread. Here two of them take two threads while the other two keep serving requests — bound how many run at once and the pool stays useful."
related:
  - label: Thread Pool Starvation
    slug: threadpool-starvation
  - label: Worker Thread
    slug: worker-thread
  - label: I/O Completion Port
    slug: io-completion-port
  - label: Async/Await
    slug: async-await
  - label: Asynchronous I/O
    slug: asynchronous-io
  - label: Bounded Concurrency
    slug: bounded-concurrency
  - label: SemaphoreSlim
    slug: semaphoreslim
  - label: Bulkhead
    slug: bulkhead
  - label: dotnet-counters
    slug: dotnet-counters
references:
  - title: The managed thread pool
    url: https://learn.microsoft.com/en-us/dotnet/standard/threading/the-managed-thread-pool
  - title: ASP.NET Core best practices
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/best-practices?view=aspnetcore-10.0
  - title: Asynchronous programming scenarios
    url: https://learn.microsoft.com/en-us/dotnet/csharp/asynchronous-programming/async-scenarios
---

## When to use

- There is no choosing it. Every ASP.NET Core request, every `Task` continuation, and every timer callback already runs on the pool. The only question is how not to starve it.

## Cautions

- Never block a pool thread on I/O. No `.Result`, no `.Wait()`, no `GetAwaiter().GetResult()`, and no synchronous database or HTTP calls on the request path.
- Raising `ThreadPool.SetMinThreads` hides starvation for a while and then moves it somewhere else. Find the blocking call instead.
- `Task.Run` around synchronous I/O still blocks a pool thread. It only changes which one.
- Bound CPU-heavy parallelism with `MaxDegreeOfParallelism` so it cannot take every thread away from handling requests.
- Watch the pool itself. A queue that keeps growing while the CPU sits idle is starvation, not load.

## In .NET

```csharp
// Wrong: blocks a pool thread for the whole wait. Under load this starves the pool.
public IActionResult GetSync(int id)
{
    var order = _client.GetFromJsonAsync<Order>($"/orders/{id}").Result;
    return Ok(order);
}

// Right: the thread is returned while the call is in flight.
public async Task<IActionResult> GetAsync(int id, CancellationToken ct)
{
    var order = await _client.GetFromJsonAsync<Order>($"/orders/{id}", ct);
    return Ok(order);
}

// CPU-bound work: real threads, but a bounded number of them.
await Parallel.ForEachAsync(
    images,
    new ParallelOptions { MaxDegreeOfParallelism = Environment.ProcessorCount / 2, CancellationToken = ct },
    async (image, token) => await ResizeAsync(image, token));
```

`dotnet-counters monitor --counters System.Runtime` shows the pool live: on .NET 9 and later as `dotnet.thread_pool.thread.count` and `dotnet.thread_pool.queue.length`, on older runtimes under the old display names `ThreadPool Thread Count` and `ThreadPool Queue Length`. A thread count that keeps climbing one or two per second, once past the pool's fast initial ramp to a few times the core count, while the queue keeps growing is the signature of starvation. Since .NET 6 the pool reacts faster to `Task.Wait`-style blocking, which shortens that climb without removing it.
