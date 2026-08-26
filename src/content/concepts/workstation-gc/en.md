---
title: "Workstation GC"
summary: "Workstation GC keeps one heap and collects it on the thread that ran out of room, which makes the process small and its pauses ordinary. It is the right choice for sidecars, tools, and any node running many processes, where a heap per core per process is memory nobody uses."
category: "Performance and optimization"
tags: ["memory"]
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

Workstation GC is the simple arrangement: one heap, one gen0 budget, and no dedicated collector threads. When a thread cannot allocate, that thread performs the collection and then carries on. There is no parallelism to divide the work, so a collection of the same live set takes longer in wall-clock terms than it would under Server GC — and for most of what runs alongside a service, that does not matter at all.

What it buys is size. One heap means one budget rather than one per core, so the process reaches its first collection sooner and settles at a smaller steady-state heap. On a node running twenty small processes, that difference is the whole memory bill. A sidecar that proxies a few requests a second, a migration tool, a queue consumer with a small working set, and anything that gets a fraction of a CPU are all better served by collecting a little more often on a heap a fraction of the size.

It is also the safer default when the process does not own its CPU. Server GC starts collector threads on the assumption that it has cores to run them on; a container limited to half a core will still start them, and they will contend with the request threads for the time the process does have. If a service must run under a tight CPU limit and Server GC is contending, Workstation GC removes the contention outright, and pinning `GCHeapCount` is the middle way between them.

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
dotnet-counters monitor --process-id <pid> System.Runtime   # compare gc-heap-size and time-in-gc against Server GC
```

Note what does not change. Generations, promotion, the large object heap, the 85,000 byte threshold and the heap hard limit derived from a container's memory limit all work exactly the same way; only the number of heaps and who runs the collection differ. Every allocation-reduction technique that pays off under Server GC pays off here too, and reaching for a collector mode is still the last move, not the first.

Choose between the two with a load test on the deployment shape you actually use, and compare `gc-heap-size`, `time-in-gc` and p99 side by side. A pod that fits comfortably under its memory limit with Workstation GC and gets OOM-killed under Server GC has told you which one it wants, and so has a service whose p99 halves when the collection is spread across four heaps.
