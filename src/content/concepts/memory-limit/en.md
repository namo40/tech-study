---
title: "Memory Limit"
summary: "The ceiling a container is held to. Over the CPU limit a process is throttled; over the memory limit it is killed, with no exception to catch and no line in the log."
category: "Containers and orchestration"
tags: ["memory", "kubernetes"]
scene: memory-pressure
sceneStep: 3
related:
  - label: Memory Pressure
    slug: memory-pressure
  - label: Resource Limit
    slug: resource-limit
  - label: Resource Request
    slug: resource-request
  - label: CPU Limit
    slug: cpu-limit
  - label: Allocation Rate
    slug: allocation-rate
  - label: Object Pool
    slug: object-pool
  - label: Garbage Collection
    slug: garbage-collection
  - label: Large Object Heap
    slug: large-object-heap
  - label: Server GC
    slug: server-gc
  - label: ArrayPool
    slug: arraypool
references:
  - title: "Resource Management for Pods and Containers"
    url: https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/
  - title: "Assign Memory Resources to Containers and Pods"
    url: https://kubernetes.io/docs/tasks/configure-pod-container/assign-memory-resource/
  - title: "Runtime configuration options for garbage collection"
    url: https://learn.microsoft.com/en-us/dotnet/core/runtime-config/garbage-collector
---

A memory limit is a number in a manifest and a kernel enforcement mechanism behind it. The container runtime writes the figure into a cgroup, and when the processes inside that cgroup have more anonymous memory in use than the cgroup allows, the kernel picks one and sends it SIGKILL. There is no negotiation, no back-pressure and no grace period. The third step of the scene is that instant, and the only thing that happens in the application at that moment is that it stops.

The important word is SIGKILL. It cannot be handled, so nothing in the process runs afterwards: no `catch`, no `finally`, no `IHostApplicationLifetime.ApplicationStopping`, no last flush of the log buffer, no in-flight request completed or failed. This is what separates an OOM kill from an `OutOfMemoryException`, which is an ordinary managed exception thrown when the runtime cannot satisfy an allocation and which you can, in principle, catch. At the cgroup boundary there is no allocation to fail. The process is simply not there on the next instruction, and the request that was mid-flight ends as a connection reset the caller has to interpret for itself.

That has a direct consequence for how the failure is diagnosed. Every reflex built around a stack trace fails, because there is no stack. What is left is outside the process: the pod's restart count, its `lastState.terminated` block with `reason: OOMKilled` and `exitCode: 137` — 128 plus signal 9 — the events on the pod, and the memory graph up to the moment the line stops. A service that restarts every twenty minutes with nothing in its logs is not a mystery; it is this, and the way to confirm it is `kubectl describe pod` rather than another logging statement.

The limit also has a second reader, and the two have to agree. .NET is container-aware: it reads the cgroup limit and sets its heap hard limit to seventy-five percent of it by default, leaving the remaining quarter for stacks, the JIT, native buffers and everything else the process holds that is not the managed heap. When those two views match, the collector gets progressively more aggressive as the heap approaches its own ceiling and often keeps the process alive. When they do not — an explicit `DOTNET_GCHeapHardLimit` that somebody set for a different machine, a runtime too old for cgroup v2, a limit applied where the runtime cannot see it — the collector stays relaxed right up to the moment the kernel kills a process it thought was comfortable.

The request beside the limit is a different decision, and it is worth keeping them apart. The request is what the scheduler reserves and what the node's capacity is planned against; the limit is what the kernel enforces. Setting them equal makes the pod Guaranteed, which is the highest quality-of-service class and the last to be evicted when the node itself runs short — a real benefit that costs the ability to use spare memory on a quiet node. Setting a limit far above the request lets a pod use that spare memory and makes it Burstable, which is fine until the node is under pressure and the pod is chosen for eviction at the worst possible time.

None of which makes the limit the thing to change. The fourth step of the scene exists because raising a limit moves the cliff without changing the slope: the heap fills more slowly towards a further-away ceiling, and each collection walks a larger live set and stops the world for longer on the way. A container that dies every forty minutes at 512 Mi will die every eighty at 1 Gi, with worse pauses in between, and the graph will look almost exactly the same with a different number on the axis. Raise it to buy time while the real change is written, and be clear with yourself that it is a stay of execution rather than a fix.
