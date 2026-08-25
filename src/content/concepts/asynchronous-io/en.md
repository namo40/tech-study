---
title: "Asynchronous I/O"
summary: "Asynchronous I/O is a read or a write the operating system accepts now and reports on later, so nothing has to sit and wait for it. The request is handed to the device or the network stack, the calling thread is released, and the completion arrives as an event."
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
  - label: I/O Completion Port
    slug: io-completion-port
  - label: Cancellation Token
    slug: cancellation-token
  - label: Request Timeout
    slug: request-timeout
  - label: Tail Latency
    slug: tail-latency
references:
  - title: "Asynchronous file I/O"
    url: https://learn.microsoft.com/en-us/dotnet/standard/io/asynchronous-file-i-o
  - title: "I/O completion ports"
    url: https://learn.microsoft.com/en-us/windows/win32/fileio/i-o-completion-ports
  - title: "The managed thread pool"
    url: https://learn.microsoft.com/en-us/dotnet/standard/threading/the-managed-thread-pool
---

The first step of the scene shows the whole idea from the language's side: the thread lane goes dark while the I/O bar fills. This page is about why the lane can go dark at all, which is a property of the operating system rather than of C#.

A synchronous read asks the kernel for data and does not come back until there is some. The thread that made the call is parked in the kernel for the whole wait, and it costs a megabyte of stack and a slot in whatever pool it came from for as long as the disk or the network takes. An asynchronous read asks the same question differently: it hands the kernel a buffer and a way of being told later, and returns immediately. Nothing in user space is waiting. The device controller or the network stack does the work, and when the bytes are there the kernel queues a completion.

That queue is the part worth knowing by name. On Windows it is an I/O completion port, and the .NET thread pool has a small set of threads dedicated to draining it; on Linux the same job is done by `epoll` and, more recently, by `io_uring`. In every case the shape is identical: one small pool of threads serves a very large number of outstanding operations, because an operation that is merely outstanding does not need a thread. Ten thousand open sockets waiting for a client to say something cost ten thousand kernel structures and no threads at all. Ten thousand threads blocked in a synchronous read cost ten thousand stacks and a scheduler that spends its time switching between them.

This is what `await` is standing on. When a .NET method awaits a `FileStream.ReadAsync` or an `HttpClient.SendAsync`, the runtime issues the underlying operation asynchronously, registers the rest of the method as the thing to run when the completion arrives, and returns the thread to the pool. The completion comes back on a pool thread, which picks up the method where it left off. Nothing waited; something was scheduled.

The corollary is that async is only real if it is real all the way down. An API that offers a method with `Async` in its name but performs a blocking call inside a `Task.Run` has not removed the wait, it has moved it to a different thread, and the pool pays for it either way. In .NET the difference is usually visible: a genuinely asynchronous file handle has to be opened with the right option, and a driver or a provider that does not support overlapped operation will fall back to a blocking call however the method is named.

The same mechanism is what makes cancellation and timeouts meaningful. Because the operation is a thing the kernel is holding rather than a thread that is stuck, it can be cancelled: the request is withdrawn, the completion arrives with a cancellation status, and the resources go back. A blocked thread has nothing equivalent, which is why a synchronous call with no timeout of its own is so hard to bound.
