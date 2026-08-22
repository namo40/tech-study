---
title: "Worker Thread"
summary: "A worker thread is one of the pool’s general-purpose threads, the ones that run queued work items. I/O completion threads are a separate set that pick up operations the operating system has finished."
category: "Pools and resources"
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

The pool keeps two kinds of thread. Worker threads run whatever was queued: `Task.Run` bodies, timer callbacks, the synchronous part of a request handler. I/O completion threads exist to pick up an operation the operating system has finished, so that the continuation after an `await` has somewhere to run without a worker thread having sat idle waiting for it. Both have their own minimum and maximum, and `ThreadPool.SetMinThreads` sets both.

The minimum is the number the pool will create on demand without hesitating; beyond it, new threads arrive slowly, roughly one per second. That rate is what makes starvation feel like a cliff rather than a slope, and it is why raising the minimum looks like a fix. It is not one. A higher minimum buys a larger burst before the same wall, so use it to survive a known startup spike, not to paper over a blocking call.
