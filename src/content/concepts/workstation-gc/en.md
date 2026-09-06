---
title: "Workstation GC"
summary: "Workstation GC keeps one heap and collects it on the thread that ran out of room, which makes the process small and its pauses ordinary. It is the right choice for sidecars, tools, and any node running many processes, where a heap per core per process is memory nobody uses."
category: "Performance and optimization"
tags: ["memory"]
level: 8
scene: garbage-collection
sceneStep: 4
related:
  - label: Garbage Collection
    slug: garbage-collection
  - label: Server GC
    slug: server-gc
  - label: Resource Limit
    slug: resource-limit
  - label: Memory Pressure
    slug: memory-pressure
  - label: Resource Request
    slug: resource-request
  - label: Load Test
    slug: load-test
references:
  - title: Workstation and server garbage collection
    url: https://learn.microsoft.com/en-us/dotnet/standard/garbage-collection/workstation-server-gc
  - title: Runtime configuration options for garbage collection
    url: https://learn.microsoft.com/en-us/dotnet/core/runtime-config/garbage-collector
---

Workstation GC is the simple arrangement: one heap, one gen0 budget, and no per-core collector threads. A blocking collection runs on the thread that ran out of room, which then carries on; background gen2, which is on by default here as well, runs on a single dedicated thread instead. Either way there is no parallelism to divide the work, so a collection of the same live set takes longer in wall-clock terms than it would under Server GC — and for most of what runs alongside a service, that does not matter at all.

What it buys is size, and it buys it unconditionally. One heap means one gen0 budget that never multiplies, so the process reaches its first collection sooner and settles at a smaller steady-state heap. On a node running twenty small processes, that difference is the whole memory bill. A sidecar that proxies a few requests a second, a migration tool, a queue consumer with a small working set, and anything that gets a fraction of a CPU are all better served by collecting a little more often on a heap a fraction of the size.

It is also the safer default when the process does not own its CPU, though not in the case people usually name. A limit of half a core rounds up to one logical CPU, and on one logical CPU the runtime uses Workstation GC whatever the configuration says, so there is nothing to decide. The contention case is a small limit on a big node: Server GC sizes its heaps and threads from the rounded-up limit — or from every core on the node, if only a CPU request was set and no limit — and those collector threads then compete for the same slice of quota as the request threads. Where that happens, Workstation GC removes the contention outright, and pinning `GCHeapCount` is the middle way between them.

```xml
<!-- A sidecar or a tool: one heap, and still collect in the background. -->
<PropertyGroup>
  <ServerGarbageCollection>false</ServerGarbageCollection>
  <ConcurrentGarbageCollection>true</ConcurrentGarbageCollection>
</PropertyGroup>
```

```text
# The same choice as environment variables.
DOTNET_gcServer=0
DOTNET_gcConcurrent=1
dotnet-counters monitor --process-id <pid> --counters System.Runtime
# Compare against Server GC: dotnet.gc.last_collection.heap.size and dotnet.gc.pause.time on .NET 9+,
# gc-heap-size and time-in-gc on .NET 8 and lower.
```

Note what does not change. Generations, promotion, the large object heap, the 85,000 byte threshold and the heap hard limit derived from a container's memory limit all work exactly the same way; only the number of heaps and who runs the collection differ. Every allocation-reduction technique that pays off under Server GC pays off here too, and reaching for a collector mode is still the last move, not the first.

Choose between the two with a load test on the deployment shape you actually use, and compare heap size, time in GC and p99 side by side. A pod that fits comfortably under its memory limit with Workstation GC and gets OOM-killed under Server GC has told you which one it wants, and so has a service whose p99 halves when the collection is spread across four heaps.
