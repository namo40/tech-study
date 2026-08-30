---
title: "Vertical Pod Autoscaler"
summary: "The Vertical Pod Autoscaler watches what a container actually uses and re-writes its CPU and memory requests to match. It buys accuracy with a restart, and the honest numbers it produces are what the scheduler and the cluster autoscaler plan from."
category: "Containers and orchestration"
tags: ["kubernetes"]
scene: elasticity
sceneStep: 3
related:
  - label: Elasticity
    slug: elasticity
  - label: Horizontal Pod Autoscaler
    slug: horizontal-pod-autoscaler
  - label: Cluster Autoscaler
    slug: cluster-autoscaler
  - label: Resource Limit
    slug: resource-limit
  - label: Memory Pressure
    slug: memory-pressure
  - label: Pod Disruption Budget
    slug: pod-disruption-budget
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: Rolling Update
    slug: rolling-update
  - label: Load Balancer
    slug: load-balancer
  - label: Backpressure
    slug: backpressure
  - label: Throughput
    slug: throughput
references:
  - title: "Kubernetes: autoscaling workloads"
    url: https://kubernetes.io/docs/concepts/workloads/autoscaling/
  - title: "Vertical Pod Autoscaler"
    url: https://github.com/kubernetes/autoscaler/tree/master/vertical-pod-autoscaler
  - title: "Kubernetes: resource management for pods and containers"
    url: https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/
---

Watch the third step of the scene and notice what does not change: the number of capsules. Two of them change shape instead. One has been drawn short all along, because the box it was given is smaller than the work it is doing; the other has been drawn tall, because it was given far more room than it has ever touched. Both are the same defect seen from opposite ends, and neither is fixed by adding a fourth pod.

A request is a promise in two directions. It tells the scheduler how much of a node to set aside for this container, and it tells the kubelet what share of the node's CPU the container is entitled to when the node is busy. Nothing checks the promise against reality. A number typed into a manifest a year ago stays there through every deploy, and the workload underneath it drifts: a new serialiser, a bigger payload, a cache that grew, a dependency that got faster. The vertical autoscaler is the piece that closes that loop. It reads the actual usage history of the containers in a workload, computes a recommendation from the distribution rather than from the last five minutes, and can apply it.

The applying is the expensive half. For most of Kubernetes' history a pod's resources were immutable once it was admitted, so changing a request meant evicting the pod and letting the controller create a replacement with the new numbers. That is why the scene charges a restart for the correction: the capsules go down, come back, and come back the right size. In-place resizing has since arrived and removes the restart for many cases, but it is not universal — it depends on the resize policy, the resource, and the container runtime — so plan for the eviction and treat the in-place path as the improvement rather than the assumption.

The recommendation is worth having even when you do not let anything act on it. Running the autoscaler with an update mode of `Off` produces a recommendation object and changes nothing, which turns it into a measurement tool: it will tell you, per container, what the ninetieth percentile of memory actually was over the last week. Teams routinely find that half their requests are double what they need and a handful are dangerously under, and that is a report worth reading before it is a controller worth trusting.

Two cautions matter more than the rest. The first is that the vertical autoscaler and the horizontal one must not be pointed at the same signal. If one is adding replicas because CPU is high while the other is raising the CPU request because usage is high, they are both reacting to the same number and each one's action changes the other's input; the standard split is horizontal on CPU or a custom load metric, vertical on memory only, or vertical in recommendation mode. The second is that eviction is a disruption like any other. A workload with a single replica and no disruption budget will simply go away for a moment when its requests are corrected, so the correction belongs behind the same protections as a drain.

What makes this the middle step rather than a footnote is the last line of the caption. Every other layer plans from requests. The scheduler decides what fits on a node from requests, not usage; the cluster autoscaler decides how many machines to buy from requests, not usage. A fleet whose requests are inflated buys machines it does not need, and a fleet whose requests are too small gets pods that are throttled or killed on nodes that looked comfortable. Right-sizing is not a tidiness exercise. It is the input the other two autoscalers do their arithmetic on.
