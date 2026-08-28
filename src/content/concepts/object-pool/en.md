---
title: "Object Pool"
summary: "Keep a set of expensive objects and lend them out instead of making new ones. It does not make allocation cheaper — it removes the allocation, which is the only move that changes what the collector has to do."
category: "Containers and orchestration"
tags: ["memory"]
scene: memory-pressure
sceneStep: 4
related:
  - label: Memory Pressure
    slug: memory-pressure
  - label: ArrayPool
    slug: arraypool
  - label: Allocation Rate
    slug: allocation-rate
  - label: "Span<T>"
    slug: span-t
  - label: Large Object Heap
    slug: large-object-heap
  - label: Garbage Collection
    slug: garbage-collection
  - label: Memory Limit
    slug: memory-limit
  - label: Server GC
    slug: server-gc
  - label: Workstation GC
    slug: workstation-gc
  - label: Resource Limit
    slug: resource-limit
references:
  - title: "ArrayPool<T> Class"
    url: https://learn.microsoft.com/en-us/dotnet/api/system.buffers.arraypool-1
  - title: "Object reuse with ObjectPool in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/objectpool
  - title: "MemoryPool<T> Class"
    url: https://learn.microsoft.com/en-us/dotnet/api/system.buffers.memorypool-1
---

A pool is a set of already-made objects with a rent and a return. Ask it for one and you get either something it was holding or, if it has nothing spare, a new one; give it back and it keeps it for the next caller. Nothing about that is clever, and it is worth being precise about what it buys: not a faster allocator, but an allocation that never happens. In the fourth step of the scene the allocation rate falls from 60 MB/s to 15 MB/s for exactly this reason, and every other number on the stage follows it down without being touched.

The chain is worth walking, because it is the argument for doing this at all. Fewer bytes allocated means the collector's budget fills more slowly, which means it runs less often. Running less often means each cycle is longer, which means more of what it finds has had time to become unreachable, which means it reclaims more per pass instead of promoting things that were about to die anyway. So the heap settles well below the ceiling, the pauses shrink, and the gauge stops living against the limit. One change, and the whole regime moves.

The case where this matters most is large buffers, which is why `ArrayPool<T>.Shared` is the pool most services need and the only one many of them ever need. Anything from 85,000 bytes upwards goes on the large object heap, is collected only when gen2 is, and is not compacted unless you explicitly ask — so a workload that allocates a big array per request fragments the LOH into holes it cannot reuse. Renting instead means the same handful of arrays are used forever and the LOH stays the size it started at. `MemoryPool<T>` is the same idea behind an `IMemoryOwner<T>` for code that wants a disposable handle rather than a raw array.

The rent-and-return contract is where pools go wrong, and it goes wrong in three recognisable ways. Forgetting to return is the mild one: the pool simply allocates a new buffer next time, so nothing leaks, but the reason for the pool is gone and the metric quietly goes back to where it was. Returning twice, or keeping a reference to a buffer after returning it, is the serious one: two pieces of code now believe they own the same array, and the bug that produces looks like data corruption rather than a memory problem. And a rented buffer is not blank — it holds whatever the last user left in it — so anything that copies from it before writing to it will read someone else's data. `try`/`finally` around every rent, `clearArray: true` on return where the contents were sensitive, and never holding the reference past the `finally` are the whole discipline.

Pools also make things worse when they are used for the wrong shape of object. Something cheap to construct gains nothing and pays for the pool's own synchronisation; something that holds a connection, a transaction or per-request state gains a bug, because pooling stateful objects means the next caller inherits whatever the last one left behind — this is why `DbContext` pooling in EF Core is a specific mechanism with a reset step and not just an object pool with a `DbContext` in it. And a pool of large buffers is a floor under the process's memory: those bytes are permanently resident by design, which is the trade being made and is the right trade only when the same buffers are genuinely reused.

Finally, pooling is one of several ways to stop producing the garbage, and often not the first to reach for. Streaming a response instead of buffering it removes the allocation entirely rather than reusing it. `Span<T>` and `Memory<T>` let a parser slice what it was given instead of copying pieces out of it. `IAsyncEnumerable<T>` keeps a large result set from ever existing as a list. Pooling is the answer when the buffer genuinely has to exist and has to be large; when it does not have to exist, not allocating it is better than renting it, and the fourth step of the scene would look the same either way.
