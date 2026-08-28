---
title: "Allocation Rate"
summary: "How many bytes a second the process asks the allocator for. It is not a cost in itself — it is the input that decides how often the collector runs, and therefore what pressure the heap is under."
category: "Containers and orchestration"
tags: ["memory"]
scene: memory-pressure
sceneStep: 2
related:
  - label: Memory Pressure
    slug: memory-pressure
  - label: Garbage Collection
    slug: garbage-collection
  - label: Object Pool
    slug: object-pool
  - label: ArrayPool
    slug: arraypool
  - label: "Span<T>"
    slug: span-t
  - label: Large Object Heap
    slug: large-object-heap
  - label: Memory Limit
    slug: memory-limit
  - label: Server GC
    slug: server-gc
  - label: Workstation GC
    slug: workstation-gc
  - label: Resource Limit
    slug: resource-limit
references:
  - title: "Fundamentals of garbage collection"
    url: https://learn.microsoft.com/en-us/dotnet/standard/garbage-collection/fundamentals
  - title: "dotnet-counters diagnostic tool"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/dotnet-counters
  - title: "Memory management and patterns in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/memory
---

The second step of the scene changes exactly one number. The allocation rate goes from 20 MB/s to 60 MB/s, and nothing else on the stage is touched: the same limit, the same collector, the same code path, the same requests. Everything the reader then watches happen — the collector firing five times as often, the pause climbing from two milliseconds towards twelve, the gauge drifting up and staying up — is a consequence of that one change. That is what makes the allocation rate worth its own page. It is the input, and the rest of the diagram is output.

The mechanism is simpler than it looks. A collection is scheduled by bytes, not by seconds: the runtime gives the nursery a budget, and when a program has allocated that many bytes the collector runs. Double the rate and you fill the budget in half the time, so the collector runs twice as often, and it does so with no change in behaviour, no threshold crossed and no warning issued. This is why the first symptom of an allocation regression is never a memory alert. It is a latency graph that moved for no visible reason, because every request in the process is now paying a share of a collection that runs twice as often as it used to.

There is a second effect, and it is the one that turns frequency into pressure. Most objects are meant to die young, and the collector's efficiency depends on them having had time to become unreachable before it arrives. A shorter cycle means the collector shows up earlier, finds more of the heap still referenced, and promotes it instead of reclaiming it. So a higher allocation rate does not merely mean more collections of the same kind — each one gets back less than the one before, which is exactly what the scene draws as the gauge climbing while the sawtooth teeth get shallower. Premature promotion is the name for it, and gen2 growing across a release with no change in the live set is what it looks like on a dashboard.

Measuring it is not hard, and it is worth doing before anything is changed. `dotnet-counters monitor --counters System.Runtime[alloc-rate]` reports bytes allocated per interval on a live process, and it should be read next to `gc-heap-size` and `time-in-gc` rather than on its own. What matters is not the absolute figure — a batch job that allocates 500 MB/s and has room for it is perfectly healthy — but the ratio between what the process produces and what the collector can absorb inside the limit it has been given. Allocation profiling in a trace goes the rest of the way and tells you which call sites are responsible, which is usually a much shorter list than anybody expects.

The reason to care about the number rather than the symptom is that the allocation rate is the one thing in this whole picture you can actually change. The limit is a ceiling the platform enforces; the collector's behaviour is mostly derived from the limit; the traffic is the business. What is left is how many bytes each request costs, and that is nearly always dominated by a handful of avoidable things: a response buffered into a string before it is written, a `ToList()` on something that was already being streamed, a large array allocated per call instead of rented, a `string.Format` in a logging path that runs on every request. Fixing two or three of those routinely moves the rate by an order of magnitude, and with it every other number the scene shows.

It is also the number that makes the fourth step honest. Pooling the big buffers does not give the collector a better algorithm or the container more room. It removes the bytes, so the nursery fills more slowly, so the collector runs less often, so more of what it finds has had time to die, so it reclaims more per pass and the heap settles well below its ceiling. The whole recovery is one lever pulled once, and the arrow of causation runs in exactly the direction the second step ran it in.
