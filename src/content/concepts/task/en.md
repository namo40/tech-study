---
title: "Task"
summary: "A Task is a promise object for work that has not finished yet: it holds the state, the result or the exception, and the continuations waiting on it. It is a handle, not a thread, and returning one says nothing about whether any thread is occupied."
category: "Pools and resources"
scene: async-await
sceneStep: 1
related:
  - label: Async/Await
    slug: async-await
  - label: Thread Pool
    slug: thread-pool
  - label: Thread Pool Starvation
    slug: threadpool-starvation
  - label: Bounded Concurrency
    slug: bounded-concurrency
references:
  - title: "The Task asynchronous programming model"
    url: https://learn.microsoft.com/en-us/dotnet/csharp/asynchronous-programming/task-asynchronous-programming-model
  - title: "Task-based Asynchronous Pattern (TAP)"
    url: https://learn.microsoft.com/en-us/dotnet/standard/asynchronous-programming-patterns/task-based-asynchronous-pattern-tap
---

The scene's first step ends with the method handing an unfinished `Task` back to its caller, and that object is what this page is about. A Task is a promise concerning work that has not finished: it carries a state, which is running, succeeded, faulted or cancelled; the result once there is one; the exception if there was one; and the list of continuations to run when it settles. It is not a thread, and it is not the work either. It is the handle by which somebody who is not doing the work can find out that the work is over.

Because it is an ordinary object, you can hold it, store it in a field, hand it to another method, and await it whenever you like — including twice, which returns the same result rather than repeating anything, since a settled Task is a value. The work has already started, because the call is what started it, and awaiting only decides when you would like to be told.

```csharp
Task<Order> pending = GetOrderAsync(id);   // running from here
var summary = BuildSummary();              // unrelated work, no waiting
Order order = await pending;               // the same object, collected later
```

Nothing about the type says a thread is involved. `Task.Run` schedules a delegate onto the thread pool, which is the right instrument for a CPU-bound computation you want off the current thread and the wrong one for I/O, where it parks a pool thread to wait for something the operating system was already handling on its own. A method that is asynchronous the whole way down returns a Task while occupying no thread at all in the meantime. Both return the same type, so the signature is not evidence: an `Async` suffix wrapped around a blocking call has moved the blocked thread rather than removed it, and the pool pays for it either way.

The composition helpers are where Tasks earn their keep, and each has an edge worth knowing. `Task.WhenAll` waits once for many, and awaiting it rethrows the first exception while the rest stay on the returned task, so a handler that logs only what the await threw has quietly dropped the others. `Task.WhenAny` gives you the first to settle and leaves the losers running, which means their eventual failures still need somewhere to go. `Task.CompletedTask` and `Task.FromResult` return something already settled with no scheduling at all, and `ValueTask` exists for hot paths that usually complete synchronously, at the price of being awaited only once. The sharpest edge is the Task nobody awaits: a fire-and-forget call discards the exception along with the result, and a list of Tasks all started before the first await is a concurrency level you chose by accident.
