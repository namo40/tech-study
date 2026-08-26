---
title: "Server GC"
summary: "Server GC gives the process one heap and one collector thread per core and collects them in parallel, which shortens the pause a collection costs at the price of a larger footprint. It is the default for ASP.NET Core, and in a container it is also the setting most often left wrong."
category: "Performance and optimization"
tags: ["memory"]
scene: garbage-collection
sceneStep: 4
related:
  - label: Garbage Collection
    slug: garbage-collection
  - label: Workstation GC
    slug: workstation-gc
  - label: Resource Limit
    slug: resource-limit
  - label: Memory Pressure
    slug: memory-pressure
  - label: Tail Latency
    slug: tail-latency
  - label: Load Test
    slug: load-test
references:
  - title: Workstation and server garbage collection
    url: https://learn.microsoft.com/en-us/dotnet/standard/garbage-collection/workstation-server-gc
  - title: Runtime configuration options for garbage collection
    url: https://learn.microsoft.com/en-us/dotnet/core/runtime-config/garbage-collector
---

A collection has to stop the threads that are mutating the heap, so the way to make it shorter is to do the walking on more than one thread. Server GC does exactly that. Instead of one heap, the process gets one per core, each with its own allocation budget and its own dedicated collector thread, and a collection runs all of them at once. The wall-clock pause is roughly the work divided by the number of heaps, which is why a service that handles many requests per second wants it.

The price is footprint. Each heap has its own gen0 budget, so the amount the process allocates before any collection happens is multiplied by the number of heaps, and the steady-state heap is correspondingly larger. That is a deliberate trade — memory is being spent to buy pause time — and it is the right trade for a service that owns its machine or its container. It is the wrong trade for a sidecar, a CLI tool, or a node packing dozens of small processes, where every one of them claiming a heap per core adds up to memory nobody is using.

In a container it is easy to get half of this wrong. The runtime sizes the heap count from the CPUs it can see, and a CPU limit expressed as a fraction of a core still leaves the process seeing every core on the node unless the container runtime restricts it. The result is a process with far more heaps than it has CPU time to run them on, each holding its own budget. Set the container's CPU and memory limits, check what the process actually sees, and if the heap count is still wrong, pin it.

```xml
<!-- The default for a web project; written down so the choice is visible. -->
<PropertyGroup>
  <ServerGarbageCollection>true</ServerGarbageCollection>
  <ConcurrentGarbageCollection>true</ConcurrentGarbageCollection>
</PropertyGroup>
```

```text
# Same switches as environment variables, which is how a container usually sets them.
DOTNET_gcServer=1
DOTNET_GCHeapCount=0x2         # two heaps, hex; only with a measurement that says so
DOTNET_GCHeapHardLimitPercent=0x4B   # 75, hex
```

Concurrent (background) collection is a separate switch and it is on by default. It lets most of a gen2 collection run alongside the application threads, so the full collection that would otherwise be a long stop becomes two short ones with concurrent work in between. Turning it off (`ConcurrentGarbageCollection=false`) trades that back for a little less CPU and memory overhead, and it is only sensible for batch work where a long pause costs nothing.

Decide it with numbers, not defaults. Run the same load test under Server GC and Workstation GC on the shape of machine you actually deploy to, and compare `time-in-gc`, `gc-heap-size` and p99 together. Server GC that halves the pause while doubling the heap is a win in a container with headroom and a disaster in one sized to the old number, which is why the memory limit and the collector choice have to be made in the same conversation.
