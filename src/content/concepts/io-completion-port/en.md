---
title: "I/O Completion Port"
summary: "An I/O completion port lets waiting cost no thread: the operating system runs the I/O, drops a completion packet on the port when it finishes, and a pool thread picks the continuation up. A handful of threads can serve thousands of in-flight operations that way, unless the code re-blocks what the port set free."
category: "Pools and resources"
tags: ["memory", "latency"]
level: 9
scene: io-completion-port
steps:
  - title: "Waiting eats threads"
    text: "The ghost shows blocking I/O: each request parks a thread until the disk or the network answers, four requests park all four, and the pool fills with workers doing nothing. A thread is for running code; waiting pays a worker to watch a kettle."
  - title: "The completion arrives at the port; the thread after"
    text: "Start the I/O, register it, and give the thread straight back. The OS runs the operation with no thread attached; when it finishes, a completion packet lands on the port, and whichever pool thread is free picks up the continuation. Between start and finish there is genuinely nothing to run, so nothing runs."
  - title: "In-flight I/O and thread count are different numbers"
    text: "Six operations run at once while two threads serve them all: starts cost almost nothing, waits nothing at all, and finished work lands on the port as packets, handed out one at a time. That is how one process holds thousands of open sockets."
  - title: "Code can take back what the port gave"
    text: "Block a pool thread on a task and you have rebuilt the ghost one floor up; launch every operation at once and the packets pile into a wave. The port solves waiting, not discipline: after the wave drains, a gate goes up so the next never forms."
related:
  - label: Thread Pool
    slug: thread-pool
  - label: Thread Pool Starvation
    slug: threadpool-starvation
  - label: Asynchronous I/O
    slug: asynchronous-io
  - label: Async/Await
    slug: async-await
  - label: Bounded Concurrency
    slug: bounded-concurrency
  - label: Worker Thread
    slug: worker-thread
  - label: SemaphoreSlim
    slug: semaphoreslim
  - label: HttpClient Connection Pool
    slug: httpclient-connection-pool
  - label: Head-of-Line Blocking
    slug: head-of-line-blocking
references:
  - title: The managed thread pool
    url: https://learn.microsoft.com/en-us/dotnet/standard/threading/the-managed-thread-pool
  - title: Asynchronous programming scenarios
    url: https://learn.microsoft.com/en-us/dotnet/csharp/asynchronous-programming/async-scenarios
  - title: I/O Completion Ports
    url: https://learn.microsoft.com/en-us/windows/win32/fileio/i-o-completion-ports
---

## When to use

- You do not reach for this one; you are already standing on it. On Windows, every `await` on real asynchronous I/O in .NET rides a completion port — sockets, files opened for asynchronous access, named pipes. Linux and macOS have siblings rather than the same thing (epoll and kqueue under an event loop the runtime owns), and the shape of the argument is identical on all three: the wait belongs to the kernel, not to a thread.
- Read it when you are trying to explain why an asynchronous server scales. Threads track cores, in-flight I/O tracks demand, and those are separate numbers because something outside the pool is holding the waits. Once that clicks, most capacity conversations get shorter.
- Read it before you accept "add more threads" as a fix for I/O-bound slowness. If the threads are waiting rather than working, a bigger pool buys you more waiting; the fix is to stop waiting on a thread at all.
- Read it when a stack trace shows pool threads sitting in `WaitOne`, `Monitor.Wait` or a task's `.Result` while throughput has flatlined. That picture has one cause and the fourth step draws it.
- Use it as a mental model, not as an API. You will almost never call `CreateIoCompletionPort`; you write `await` and the runtime does the binding. What the model buys you is knowing what your code is spending, which is the difference between an asynchronous method that is genuinely free while it waits and one that only looks like it.

## Cautions

- Sync-over-async parks the very threads the port freed. `.Result`, `.Wait()` and `GetAwaiter().GetResult()` on a task that has not completed hold a pool thread for the whole operation, which is the ghost rebuilt one floor up. It is worst under load, because the continuation that would release you needs a pool thread too, and every blocked caller has taken one away.
- Fake async moves the block, it does not remove it. `Task.Run(() => stream.Read(...))` around a blocking call still holds a thread for the whole wait; you have only changed which thread. If the API has no real asynchronous form, wrapping it is a scheduling decision with a cost, not a conversion.
- Unbounded fan-out floods everything downstream. `items.Select(x => DoAsync(x))` followed by `WhenAll` over ten thousand items registers ten thousand starts, and both the remote service and the packet queue feel it at once. The port will happily hold them; the socket pool, the database and your tail latency will not. Bound the launches.
- Blocking inside a continuation delays every packet behind yours. A lock held across an `await`-free stretch, a long computation, a synchronous log write — whatever it is, it is running on a pool thread that other completions are queued for. Continuations should be short and non-blocking, and heavy CPU work belongs somewhere it cannot starve the completions.
- The continuation does not run on the thread that started the operation. It runs on whichever pool thread is available, unless a synchronization context puts it back somewhere specific. Code that assumes thread affinity across an `await` — thread-local state, a lock taken before and released after — is wrong even when it appears to work.
- Injection lag is the symptom, not the disease. When the pool is starved it adds threads slowly and deliberately, so throughput crawls back over seconds while the queue grows. Raising `ThreadPool.SetMinThreads` hides the symptom for a while; the blocking call that caused it is still there. Thread pool starvation is the page about that side of it.

## In .NET

Use asynchronous APIs end to end and the machinery is invisible. What is worth writing deliberately is the gate in front of a fan-out and the decision never to block a pool thread.

```csharp
// Real async I/O: the thread is given back at the await, and the continuation
// resumes on whichever pool thread is free when the packet lands.
await using var stream = new FileStream(
    path, FileMode.Open, FileAccess.Read, FileShare.Read,
    bufferSize: 4096, useAsync: true);          // on Windows, this is the port
var buffer = new byte[4096];
int read = await stream.ReadAsync(buffer, ct);

// A launch gate, so ten thousand items do not become ten thousand starts.
var gate = new SemaphoreSlim(20);
await Task.WhenAll(items.Select(async item =>
{
    await gate.WaitAsync(ct);                   // waits without holding a thread
    try { await ProcessAsync(item, ct); }
    finally { gate.Release(); }
}));

// The same bound, expressed by the framework rather than by hand.
await Parallel.ForEachAsync(
    items,
    new ParallelOptions { MaxDegreeOfParallelism = 20 },
    async (item, token) => await ProcessAsync(item, token));
```

Two things make the difference visible. On Windows, `useAsync: true` is what binds the handle to the port, so a `FileStream` opened without it turns `ReadAsync` into a blocking read on a pool thread wearing an asynchronous signature; on Linux there is no asynchronous file I/O to bind to at all, so every `FileStream.ReadAsync` is a synchronous read scheduled on the pool whatever the flag says. Sockets and `HttpClient` are genuinely free while they wait on both, which is why they scale so differently in practice. And `SemaphoreSlim.WaitAsync` is the asynchronous form on purpose: waiting at the gate has to be free of threads too, or the gate becomes the thing that starves you.

Watch it with numbers rather than intuition. `ThreadPool.ThreadCount` climbing while `ThreadPool.PendingWorkItemCount` stays high is starvation in progress, and the `System.Runtime` event counters expose both without a debugger attached. The rule of thumb worth keeping: if a pool thread is waiting, something is wrong with the code, not with the pool size.
