---
title: "Resource Request"
summary: "A resource request is what a container asks for: the CPU and memory the scheduler reserves for it on a node. It decides where the pod lands, what share of a busy node it is entitled to, and what the autoscaler's CPU percentage is a percentage of."
category: "Containers and orchestration"
scene: horizontal-pod-autoscaler
sceneStep: 4
related:
  - label: Horizontal Pod Autoscaler
    slug: horizontal-pod-autoscaler
  - label: Resource Limit
    slug: resource-limit
  - label: Vertical Pod Autoscaler
    slug: vertical-pod-autoscaler
  - label: Cluster Autoscaler
    slug: cluster-autoscaler
  - label: Readiness Probe
    slug: readiness-probe
  - label: Elasticity
    slug: elasticity
references:
  - title: "Kubernetes: resource management for pods and containers"
    url: https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/
  - title: "Kubernetes: assign CPU resources to containers"
    url: https://kubernetes.io/docs/tasks/configure-pod-container/assign-cpu-resource/
  - title: "Kubernetes: quality of service for pods"
    url: https://kubernetes.io/docs/concepts/workloads/pods/pod-qos/
---

The fourth step of the scene puts `requests: 500m` next to the CPU reading, and that label is doing more work than it looks. A pod at 95% CPU is not at 95% of the node. It is at 95% of half a core, because `500m` is half a core and that is what it asked for. Change the request and every percentage in the scene changes with it, without the pod doing anything differently.

A request is a reservation. The scheduler adds up the requests of everything already on a node and only places a pod where the remainder fits, so the request is what decides which node a pod lands on, and whether it lands at all. It is not a cap: a container may use more than it requested if the node happens to be idle. What the request guarantees is the floor. When the node is contended, CPU is shared out in proportion to requests, so a container that asked for `500m` gets at least that much of a saturated machine.

That floor is why the number matters twice. Set it too low and the pod is scheduled onto a crowded node and squeezed the moment its neighbours get busy, and the symptom is latency that moves with what other teams deployed rather than with your own traffic. Set it too high and the scheduler needs a bigger hole than the workload really occupies, so nodes fill up with reservations nobody is using and the cluster autoscaler buys machines to hold air.

For memory the request is a reservation in the same sense, but the consequence of being wrong is sharper. CPU is compressible, so a container that wants more than its share is slowed down. Memory is not, so a node that runs out evicts pods, and it evicts the ones using most above their request first. A memory request that honestly reflects the working set is what keeps a pod off that list.

The autoscaler's dependency is the one the scene draws. `averageUtilization: 60` means sixty percent of the request, summed over the pods and divided by the replica count. A container with no CPU request has no denominator, so the metric simply does not exist and the HorizontalPodAutoscaler reports that it cannot compute a recommendation. Requests and limits together also decide the pod's quality of service class: equal requests and limits give `Guaranteed`, a request without a matching limit gives `Burstable`, and neither gives `BestEffort`, which is the first thing evicted when a node is under pressure.

In .NET the number to start from is measured rather than guessed. Run the workload under a representative load, watch `process.cpu.utilization` and the GC's heap size, and set the request near the steady state rather than near the peak, because the peak is what headroom and the autoscaler are for. On .NET the memory request is worth revisiting after any change to `ServerGarbageCollection`, since server GC sizes its heaps from the CPU and memory the container is allowed to see.
