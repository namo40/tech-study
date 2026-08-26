---
title: "Garbage Collection"
summary: "The .NET garbage collector reclaims memory by generations: most objects die young and are swept cheaply from gen0, the few that survive are promoted, and a full gen2 collection is the one that stops everything. What you control is how much you allocate, and how much memory the process may use."
category: "Performance and optimization"
tags: ["memory", "latency"]
scene: garbage-collection
steps:
  - title: "Generations"
    text: "New objects land in gen0. When it fills, the collector pauses the threads for about a millisecond, throws away everything nothing points to, and moves the few survivors up a generation. Most objects die young, which is exactly why this is cheap."
  - title: "The expensive one"
    text: "Objects that live long, caches and sessions, pile up in gen2, and big arrays go straight to the large object heap. Collecting those means walking the whole heap with every thread stopped. That pause is your p99 spike."
  - title: "Allocation is the lever"
    text: "The collector runs as often as you fill gen0. A request that allocates a megabyte buffer forces collections and large-object churn; renting from a pool and slicing with Span allocates almost nothing. Fewer allocations, fewer collections, flatter tail."
  - title: "Server GC and the limit"
    text: "ASP.NET Core defaults to Server GC: one heap per core, collected in parallel, for shorter pauses at the price of a bigger footprint. In a container the collector sizes itself to the memory limit; run close to it and collections become constant, cross it and the process is killed."
related:
  - label: Server GC
    slug: server-gc
  - label: Workstation GC
    slug: workstation-gc
  - label: Large Object Heap
    slug: large-object-heap
  - label: ArrayPool
    slug: arraypool
  - label: "Span<T>"
    slug: span-t
  - label: Memory Pressure
    slug: memory-pressure
  - label: Object Pool
    slug: object-pool
  - label: Tail Latency
    slug: tail-latency
  - label: Resource Limit
    slug: resource-limit
  - label: Load Test
    slug: load-test
  - label: dotnet-counters
    slug: dotnet-counters
references:
  - title: Fundamentals of garbage collection
    url: https://learn.microsoft.com/en-us/dotnet/standard/garbage-collection/fundamentals
  - title: Runtime configuration options for garbage collection
    url: https://learn.microsoft.com/en-us/dotnet/core/runtime-config/garbage-collector
  - title: Memory management and garbage collection in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/memory?view=aspnetcore-10.0
---

## When to use

- Every service, all the time. Watch allocation rate, the gen0/gen1/gen2 collection counts, time in GC, heap size and large object heap size, and know what those numbers look like when the service is healthy.
- Tune only with evidence. A p99 spike that lines up with gen2 collections, or a container that keeps getting OOM-killed, is a reason to change something. A number you dislike is not.
- Before the collector, look at the allocations. Almost every garbage collection problem in a web service is an allocation problem wearing a different hat, and the collector settings are the last thing to reach for.

## Cautions

- Reduce allocation before tuning the collector: pooled buffers, `Span<T>`, streaming instead of whole-body strings, fewer LINQ temporaries on hot paths.
- Long-lived object graphs are what make gen2 big. Unbounded caches, static lists and closures captured by singletons all keep objects alive past the point where the collector could help; bound them.
- Server GC is the default for ASP.NET Core and is right for most services. Workstation GC suits small sidecars, or a node running many processes that would each otherwise claim a heap per core.
- In containers, set a memory limit and let the heap hard limit derive from it, which is 75% by default. Keep the steady-state heap well below that line, because a heap that lives against it collects constantly.
- Never call `GC.Collect()` in a production code path. It forces the expensive collection you were trying to avoid, and it does it at the moment you are least able to afford it.
- Measure with `dotnet-counters`, and reproduce with a load test before and after a change. A GC change that was not measured under load has not been tested.

## In .NET

The collector is configured in the project file, and both of these are already the default for a web project. Writing them down is a way of saying which one you meant.

```xml
<!-- The project file: defaults shown explicitly. -->
<PropertyGroup>
  <ServerGarbageCollection>true</ServerGarbageCollection>
  <ConcurrentGarbageCollection>true</ConcurrentGarbageCollection>
</PropertyGroup>
```

On a hot path, the buffer you do not allocate is the collection you do not pay for. `ArrayPool<T>` hands you an array that already exists, and `Span<T>` slices it without copying.

```csharp
// Rent instead of allocate on a hot path.
var buffer = ArrayPool<byte>.Shared.Rent(64 * 1024);
try
{
    int read = await stream.ReadAsync(buffer.AsMemory(0, 64 * 1024), ct);
    Process(buffer.AsSpan(0, read));          // a Span slices without copying
}
finally
{
    ArrayPool<byte>.Shared.Return(buffer);
}

// Read the collector's own view when diagnosing.
var info = GC.GetGCMemoryInfo();
logger.LogInformation("heap {Heap} MB, limit {Limit} MB, pause {Pause:P1}",
    info.HeapSizeBytes >> 20, info.TotalAvailableMemoryBytes >> 20, info.PauseTimePercentage / 100);
```

In a container the collector reads the limit rather than the machine, and sizes itself against it.

```text
# Container: memory limit 512Mi -> heap hard limit defaults to 75% (384 MB); override only with evidence.
DOTNET_GCHeapHardLimitPercent=0x4B   # 75, hex
dotnet-counters monitor --process-id <pid> System.Runtime   # gc-heap-size, gen-0/1/2-gc-count, time-in-gc, alloc-rate
```

Settings such as `DOTNET_gcServer`, `GCHeapCount` and `GCConserveMemory` change how the collector divides its work, and they are worth changing only when a load test and the counters agree that the current division is the problem.
