---
title: "Large Object Heap"
summary: "Any allocation of 85,000 bytes or more goes on the large object heap instead of gen0. It is collected only when gen2 is collected, it is not compacted by default, and the holes it accumulates are why a process can hold far more memory than it is using."
category: "Performance and optimization"
tags: ["memory"]
level: 9
scene: garbage-collection
sceneStep: 2
related:
  - label: Garbage Collection
    slug: garbage-collection
  - label: ArrayPool
    slug: arraypool
  - label: "Span<T>"
    slug: span-t
  - label: Memory Pressure
    slug: memory-pressure
  - label: Server GC
    slug: server-gc
  - label: Tail Latency
    slug: tail-latency
references:
  - title: The large object heap
    url: https://learn.microsoft.com/en-us/dotnet/standard/garbage-collection/large-object-heap
  - title: Fundamentals of garbage collection
    url: https://learn.microsoft.com/en-us/dotnet/standard/garbage-collection/fundamentals
---

The generational collector rests on one observation: most objects die young, so sweeping the youngest generation is cheap. A 200 KB buffer breaks that assumption. Copying it between generations would cost more than leaving it where it is, so the runtime does not try. Anything of 85,000 bytes or more is allocated straight onto the large object heap, which the collector treats as part of gen2 from the moment it exists.

That single decision has two consequences, and both of them are felt as latency rather than as memory. The first is that a large object is never collected by a cheap collection. A gen0 sweep runs in about a millisecond and will not touch it; the buffer stays until something triggers a full gen2 collection, which stops every thread and walks the whole heap. The second is that allocating large objects is itself what triggers those collections, because the large object heap has a budget of its own and exceeding it schedules a gen2.

The third consequence is fragmentation. The large object heap is not compacted by default, so a block that is collected leaves a hole exactly its own size. A later allocation can reuse that hole only if it fits, and buffers whose sizes vary rarely fit. The heap then grows past holes it cannot use: `GC.GetGCMemoryInfo()` reports a large heap, the counters report a large heap, and the live set is a fraction of it. In a container with a memory limit, that is the shape of an OOM kill that no leak explains.

The fix is almost never a collector setting. It is to stop producing large objects on hot paths: rent a fixed-size buffer from `ArrayPool<byte>.Shared` and return it, slice it with `Span<T>` rather than copying pieces out of it, stream a response instead of building the whole body as one string, and read into a pooled buffer instead of calling `ToArray()` on a stream. A buffer that is rented at a size the pool already stocks is reused rather than allocated, and never reaches the large object heap at all.

```csharp
// 200 KB: over the 85,000 byte threshold, so this lands on the large object heap.
byte[] body = new byte[200 * 1024];

// The same work, from a pool: the array outlives the request and is never collected.
byte[] rented = ArrayPool<byte>.Shared.Rent(200 * 1024);
try
{
    int read = await stream.ReadAsync(rented.AsMemory(0, 200 * 1024), ct);
    Handle(rented.AsSpan(0, read));
}
finally
{
    ArrayPool<byte>.Shared.Return(rented);
}
```

When fragmentation is already the problem and the allocations cannot be removed quickly, the collector can be asked to compact the large object heap once, on the next full collection. It is an expensive, blocking operation and it belongs in a maintenance window or a quiet moment in a background job, never on a request path and never on a timer. The standing alternative is `DOTNET_GCConserveMemory` at any value from 1 to 9, which lets the collector compact the large object heap by itself once fragmentation gets bad, in exchange for collecting more often. Either way, compaction buys time; removing the allocation is what fixes it.

```csharp
// A one-off, in a background task and not on a request path.
GCSettings.LargeObjectHeapCompactionMode = GCLargeObjectHeapCompactionMode.CompactOnce;
GC.Collect();
```

Watch it on the counter that is specific to it before anything else. On .NET 9 and later that is `dotnet.gc.last_collection.heap.size` read at its `gc.heap.generation=loh` dimension; on .NET 8 and lower it is the `loh-size` EventCounter. That number climbing while the live set is flat, gen2 collection counts rising in step with a p99 spike, and a container whose memory grows without a matching object count are the three signals that point here rather than at a leak.
