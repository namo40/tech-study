---
title: "Resource Limit"
summary: "A resource limit is the ceiling a container is held to. Above the CPU limit it is throttled, above the memory limit it is killed, and the two failure modes look nothing alike: one is a service that got slow, the other is a process that vanished."
category: "Containers and orchestration"
tags: ["kubernetes", "memory"]
scene: horizontal-pod-autoscaler
sceneStep: 4
related:
  - label: Horizontal Pod Autoscaler
    slug: horizontal-pod-autoscaler
  - label: Resource Request
    slug: resource-request
  - label: Vertical Pod Autoscaler
    slug: vertical-pod-autoscaler
  - label: Tail Latency
    slug: tail-latency
  - label: Garbage Collection
    slug: garbage-collection
  - label: Elasticity
    slug: elasticity
references:
  - title: "Kubernetes: resource management for pods and containers"
    url: https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/
  - title: "Kubernetes: quality of service for pods"
    url: https://kubernetes.io/docs/concepts/workloads/pods/pod-qos/
  - title: "Run .NET applications in containers"
    url: https://learn.microsoft.com/en-us/dotnet/core/docs/containers/
---

The request in the fourth step of the scene is the floor a container is promised. The limit is the ceiling it is held to, and the two are set in the same block for the same container, which is why they are so easily confused. The request is what the scheduler reserves; the limit is what the runtime enforces.

The CPU limit is enforced by throttling. The kernel gives the container a quota per hundred-millisecond period, and when the quota runs out the threads are stopped until the next period begins. Nothing errors and nothing is logged by the application, so the only trace is latency: a p50 that looks fine and a p99 that has a hundred-millisecond step in it. A CPU limit set close to the request on a bursty service is one of the more common causes of a tail that nobody can explain, because the average utilisation the dashboards show never approaches the limit that is doing the damage.

The memory limit is enforced by killing. There is no throttling a process into using less memory, so a container that goes over is terminated, the pod records `OOMKilled`, and the restart shows up as availability rather than as latency. That difference is worth internalising: a CPU limit that is too low degrades a service, and a memory limit that is too low removes it.

The two also decide the quality of service class together with the request. Setting the limit equal to the request gives `Guaranteed`, which is what latency-sensitive workloads want, because the container is never throttled below what it reserved and is the last to be evicted. Setting a limit well above the request gives `Burstable`, which is efficient when the bursts are short and genuinely spare, and dangerous when several containers on the node burst at the same time.

For .NET the memory limit is not just a fence, it is an input. The runtime reads the cgroup limit and sizes the GC heap from it, and `GCHeapHardLimitPercent` (75% of the limit by default) is what the collector treats as the top of its budget. Raising the memory limit therefore makes .NET collect less often and use more, which is usually what you want, but it means a limit chosen from a memory graph taken under the old limit will be wrong. Server GC also sizes its heap count from the CPU the container can see, so a CPU limit quietly changes the shape of the GC as well.

The practical setting for most services is a memory limit equal to the memory request, and a CPU limit either absent or generously above the CPU request. That combination gives the memory guarantee that keeps a pod off the eviction list, without the throttling that puts a step in the tail. Whichever way you go, make `container_cpu_cfs_throttled_seconds_total` and the pod restart reason things you look at, because both failures are invisible from inside the process.
