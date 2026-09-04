---
title: "CPU Limit"
summary: "The CPU limit is the memory limit's opposite number. Over the memory limit a container is killed; over the CPU limit it is throttled — de-scheduled until the next period, so the failure arrives as latency with nothing in the log and no exception to catch."
category: "Containers and orchestration"
tags: ["kubernetes"]
scene: memory-pressure
sceneStep: 3
related:
  - label: Memory Pressure
    slug: memory-pressure
  - label: Memory Limit
    slug: memory-limit
  - label: Resource Limit
    slug: resource-limit
  - label: Resource Request
    slug: resource-request
  - label: Horizontal Pod Autoscaler
    slug: horizontal-pod-autoscaler
  - label: Throughput
    slug: throughput
  - label: Thread Pool
    slug: thread-pool
references:
  - title: "Resource Management for Pods and Containers"
    url: https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/
---

The scene's third step is the moment a container crosses its memory limit and simply stops existing. The CPU limit is the same kind of number in the same manifest, enforced by the same kernel, and it does the opposite thing. CPU is a compressible resource: if a process wants more than it is allowed, the kernel can give it less and keep going. Memory is not, because there is no way to hold three hundred megabytes in two hundred. So the two limits express the same intent through different mechanisms, and the difference is worth stating once as a sentence you can carry: the memory limit kills, the CPU limit throttles.

The throttle is a quota over a repeating window rather than a speed governor. The kernel's scheduler hands the container's cgroup an allowance of CPU time for each period — one hundred milliseconds by default — and when the allowance is spent every thread in that group is taken off the processor until the next period begins. A limit of `500m` means fifty milliseconds of CPU time per hundred, and how quickly that runs out depends on how many threads are running. One busy thread uses it evenly. Eight busy threads under a limit of `1` consume the whole hundred-millisecond allowance in twelve and a half milliseconds of wall clock, then all eight sit still for the remaining eighty-seven. That is the shape of a throttled service: not a slow machine, but a fast machine that is switched off for most of every tenth of a second.

Which is why the symptom is latency rather than errors, and why it is diagnosed from the wrong end so often. Nothing throws, nothing restarts, the CPU utilisation graph looks unremarkable because the container really is using only what it was allowed, and the whole effect shows up as a p99 that has doubled for no reason anyone can point at. Garbage collection pauses look longer than the collector's own counters say they are, because the pause is partly the collector and partly eighty-seven milliseconds of not being scheduled. Health check timeouts start firing on a service that is perfectly healthy. The counter that actually answers the question is the throttling one — the periods in which the group was throttled, as a fraction of periods elapsed — and a service throttled in a meaningful share of its periods is not short of capacity in any way another replica will fix.

The limit's companion, the CPU request, is a different decision here than it is for memory, and the pair is worth separating precisely once. The request is what the scheduler reserves when it places the pod and what the node's spare capacity is divided by when several containers want the processor at the same time; it is a weight and a guarantee of a share. The limit is a ceiling the kernel enforces whether or not anybody else wants the CPU, so a container can be throttled while the node it sits on is eighty percent idle. The runtime is the second party that reads these numbers and the one most often surprised by them. .NET is container-aware and derives its processor count from the CPU limit, sizing Server GC's heaps and the thread pool's worker minimum from that figure. When only a request is set, or the limit is applied somewhere the runtime cannot see it, the process sizes itself for all the node's cores: a thread pool whose worker minimum is built for a machine it is not allowed to use, and — with DATAS off — dozens of GC heaps whose every collection becomes a contended operation inside a fraction of one CPU. DATAS, on by default for Server GC since .NET 9, takes the heap half of that away by starting from a single heap and growing the count only when the workload earns it. The thread pool and everything else that reads `Environment.ProcessorCount` are untouched by it, which is why `DOTNET_PROCESSOR_COUNT` is still the override for the cases where the two views cannot be made to agree on their own.
