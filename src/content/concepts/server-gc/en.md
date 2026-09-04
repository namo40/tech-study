---
title: "Server GC"
summary: "Server GC spreads the heap across several collector threads and collects them in parallel, which shortens the pause a collection costs at the price of a larger footprint. It is the default for ASP.NET Core, and in a container it is also the setting most often left wrong."
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

A collection has to stop the threads that are mutating the heap, so the way to make it shorter is to do the walking on more than one thread. Server GC does exactly that. Instead of one heap the process gets several, each with its own allocation budget and its own dedicated collector thread, up to one per logical CPU, and a collection runs all of them at once. The wall-clock pause is roughly the work divided by the number of heaps, which is why a service that handles many requests per second wants it.

The price is footprint. Each heap has its own gen0 budget, so the amount the process allocates before any collection happens scales with the number of heaps, and the steady-state heap is correspondingly larger. That is a deliberate trade — memory is being spent to buy pause time — and it is the right trade for a service that owns its machine or its container. It is the wrong trade for a sidecar, a CLI tool, or a node packing dozens of small processes, where each of them sizing itself for the whole machine adds up to memory nobody is using.

How many heaps you actually get is no longer decided once at startup. Since .NET 9, Server GC runs with DATAS — Dynamic Adaptation To Application Sizes — enabled by default, and DATAS always starts with a single heap, then adds and removes heaps as the load moves so that the throughput cost of collecting stays near a target of 2%. A small service under light traffic therefore looks much closer to Workstation GC on footprint than the paragraph above suggests, and only pays for the extra heaps while it is busy. `DOTNET_GCDynamicAdaptationMode=0` restores the old behaviour of sizing every heap up front, and it is worth knowing which of the two you are measuring.

In a container it is easy to get half of this wrong, because what the runtime can see depends on which knob you set. A CPU *request* with no limit leaves every core on the node visible, so a two-core service on a sixty-four-core node sizes itself for sixty-four. A *limit* is read from the cgroup and rounded up — 1.5 becomes 2 — and a limit at or below one core makes the runtime use Workstation GC instead, whatever the setting says, because that is what it always does on a single logical CPU. Set the memory and CPU limits, check what `Environment.ProcessorCount` reports from inside the container, and pin the heap count only if it is still wrong.

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
DOTNET_GCDynamicAdaptationMode=1     # DATAS, the default since .NET 9; 0 sizes every heap up front
DOTNET_GCHeapCount=0x2               # a fixed two heaps, hex; reach for this after DATAS, not before
DOTNET_GCHeapHardLimitPercent=0x4B   # 75, hex
```

Concurrent (background) collection is a separate switch and it is on by default. It lets most of a gen2 collection run alongside the application threads, so the full collection that would otherwise be a long stop becomes two short ones with concurrent work in between. Turning it off (`ConcurrentGarbageCollection=false`) trades that back for a little less CPU and memory overhead, and it is only sensible for batch work where a long pause costs nothing.

Decide it with numbers, not defaults. Run the same load test under Server GC and Workstation GC on the shape of machine you actually deploy to, and compare time in GC, heap size and p99 together. Server GC that halves the pause while doubling the heap is a win in a container with headroom and a disaster in one sized to the old number, which is why the memory limit and the collector choice have to be made in the same conversation.
