---
title: "Worker Thread"
summary: "A worker thread is one of the pool’s general-purpose threads, the ones that run queued work items. I/O completion threads are a separate set that pick up operations the operating system has finished."
category: "Pools and resources"
level: 5
scene: thread-pool
sceneStep: 1
related:
  - label: Thread Pool
    slug: thread-pool
  - label: I/O Completion Port
    slug: io-completion-port
references:
  - title: The managed thread pool
    url: https://learn.microsoft.com/en-us/dotnet/standard/threading/the-managed-thread-pool
---

The pool keeps two kinds of thread. Worker threads run whatever was queued: `Task.Run` bodies, timer callbacks, the synchronous part of a request handler. I/O completion threads exist on Windows to pick up an operation the operating system has finished, so that the continuation after an `await` has somewhere to run without a worker thread having sat idle waiting for it. Both have their own minimum and maximum, and `ThreadPool.SetMinThreads` sets both. On Linux there is no completion port; a thread watching epoll hands each completion to the worker queue instead, so the second number in `ThreadPool.SetMinThreads` only matters on Windows.

The minimum is the number the pool will create on demand without hesitating; beyond it the pool ramps quickly to a few times the core count and then slows to one or two new threads per second. That rate is what makes starvation feel like a cliff rather than a slope, and it is why raising the minimum looks like a fix. It is not one. A higher minimum buys a larger burst before the same wall, so use it to survive a known startup spike, not to paper over a blocking call. Since .NET 6 the pool reacts faster to `Task.Wait`-style blocking, which shortens the climb without removing the cliff.
