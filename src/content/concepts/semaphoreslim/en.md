---
title: "SemaphoreSlim"
summary: "SemaphoreSlim is the concurrency gate of the asynchronous world: WaitAsync waits without holding a thread, so bounding how many operations start at once turns a wave into a queue without giving back the thread you just saved."
category: "Pools and resources"
tags: ["overload"]
scene: io-completion-port
sceneStep: 4
related:
  - label: I/O Completion Port
    slug: io-completion-port
  - label: Bounded Concurrency
    slug: bounded-concurrency
  - label: Thread Pool
    slug: thread-pool
  - label: Thread Pool Starvation
    slug: threadpool-starvation
  - label: Asynchronous I/O
    slug: asynchronous-io
  - label: Async/Await
    slug: async-await
  - label: Worker Thread
    slug: worker-thread
  - label: HttpClient Connection Pool
    slug: httpclient-connection-pool
  - label: Head-of-Line Blocking
    slug: head-of-line-blocking
references:
  - title: SemaphoreSlim Class
    url: https://learn.microsoft.com/en-us/dotnet/api/system.threading.semaphoreslim
  - title: Asynchronous programming scenarios
    url: https://learn.microsoft.com/en-us/dotnet/csharp/asynchronous-programming/async-scenarios
  - title: The managed thread pool
    url: https://learn.microsoft.com/en-us/dotnet/standard/threading/the-managed-thread-pool
---

A semaphore is a count of permits. `new SemaphoreSlim(20)` says twenty callers may be inside at once; the twenty-first waits at the door until somebody leaves. That is the same idea a classic `Semaphore` has, and the interesting part is the one method the classic one does not have: `WaitAsync`. Waiting at the gate is itself a wait, and if the gate holds a pool thread while you queue for it then the gate has become exactly the problem it was meant to prevent. `WaitAsync` returns a task instead, so a caller queued at the door costs a continuation and not a thread — which is why this is the gate that belongs in front of asynchronous work, and `lock` or `Semaphore` is not.

The reason to want a gate at all is that a completion port will accept anything you hand it. Ten thousand items turned into ten thousand starts is a legal program: every start is nearly free, every wait is genuinely free, and nothing in the runtime pushes back. What pushes back is everything downstream — the connection pool that only has so many sockets, the database that only has so many workers, the remote service whose rate limit you are about to discover, and the packet queue that now has ten thousand completions landing in a wave. Bounding the launches turns that wave into a steady line, and the number you choose is a statement about the slowest thing behind you rather than about your own process.

Use it in the pattern the fourth step of the scene draws: take a permit, do the work, release it in a `finally`. The `finally` is not decoration. A permit leaked by an exception is a permit gone for the life of the process, and a gate that quietly shrinks from twenty to nineteen to eighteen looks exactly like a service that gets slower with age. Release exactly once per successful wait, never speculatively, and never from a different path than the one that took it. If the wait can be cancelled, pass the token to `WaitAsync` so a cancelled caller does not take a permit it will never use, and remember that the cancelled wait throws rather than returning, so the release must sit under the acquisition and not beside it.

Two habits keep it honest. Prefer the framework's own bound where one exists — `Parallel.ForEachAsync` with `MaxDegreeOfParallelism`, a channel with a bounded capacity, `HttpClient`'s own connection limit — because a bound the library enforces cannot be leaked. And keep the gate close to the resource it protects, one per dependency rather than one for the whole application: a single global gate makes a slow report throttle the login page, which is the failure mode the bulkhead pattern exists to avoid. `SemaphoreSlim(1)` is worth naming separately: it is an asynchronous mutual exclusion, useful for the one-writer-at-a-time cases where a real `lock` cannot be held across an `await` at all, and it is not reentrant, so the same flow taking it twice will wait for itself forever.
