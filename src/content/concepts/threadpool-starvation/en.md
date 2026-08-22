---
title: "Thread Pool Starvation"
summary: "Thread pool starvation is when the pool has threads but they are all blocked instead of working, so the queue grows and latency climbs in steps while the CPU sits idle."
category: "Pools and resources"
scene: thread-pool
sceneStep: 2
related:
  - label: Thread Pool
    slug: thread-pool
  - label: Async/Await
    slug: async-await
  - label: dotnet-counters
    slug: dotnet-counters
references:
  - title: The managed thread pool
    url: https://learn.microsoft.com/en-us/dotnet/standard/threading/the-managed-thread-pool
---

The symptoms are distinctive. Latency jumps in steps rather than climbing smoothly, because the pool injects threads slowly and each new one relieves the queue for a moment. The queue length keeps growing, and the CPU stays low the whole time. A machine that is barely working while requests time out is almost never short of capacity.

The cause is nearly always sync-over-async: a `.Result`, a `.Wait()`, a `GetAwaiter().GetResult()`, or a synchronous database or HTTP call somewhere on the request path. Each of those parks a pool thread for the whole wait, and once the requests outnumber the threads, every new request queues behind work that is doing nothing but waiting.

Diagnose it with `dotnet-counters monitor --counters System.Runtime`. If `ThreadPool Queue Length` climbs while `ThreadPool Thread Count` creeps up about one per second and CPU usage stays flat, that is starvation, and the fix is to find the blocking call rather than to raise the minimum thread count.
