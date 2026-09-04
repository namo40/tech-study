---
title: "Cluster Autoscaler"
summary: "The Cluster Autoscaler watches for pods that cannot be scheduled and adds machines for them, then drains and returns nodes that nothing needs any more. It plans from requests rather than usage, so the fleet it buys is only as honest as the numbers on the pods."
category: "Containers and orchestration"
tags: ["kubernetes"]
scene: elasticity
sceneStep: 4
related:
  - label: Elasticity
    slug: elasticity
  - label: Horizontal Pod Autoscaler
    slug: horizontal-pod-autoscaler
  - label: Vertical Pod Autoscaler
    slug: vertical-pod-autoscaler
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
  - title: "Kubernetes: cluster autoscaling"
    url: https://kubernetes.io/docs/concepts/cluster-administration/node-autoscaling/
  - title: "Cluster Autoscaler"
    url: https://github.com/kubernetes/autoscaler/tree/master/cluster-autoscaler
  - title: "Use the cluster autoscaler in Azure Kubernetes Service"
    url: https://learn.microsoft.com/en-us/azure/aks/cluster-autoscaler
---

The fourth step is where the picture stops being about software. Three replicas became five, the two machines underneath were already full, and the fifth pod had nowhere to stand. It did not fail, and it was not refused; it went `pending`, which is Kubernetes saying that it accepted the pod and cannot place it. Everything the cluster autoscaler does starts from that one condition.

The trigger is a pod the scheduler could not fit, not a node that looks busy. That distinction is the whole design. A node at ninety per cent of its requests is fine and nothing happens; a single unschedulable pod is a problem and something does. The autoscaler takes the pending pod, asks each node group it manages whether a new node of that shape would make the pod schedulable, and if one would, it raises that group's size by the smallest number that clears the backlog. The cloud provider does the rest, and a minute or two later a node registers, the scheduler notices it, and the pod is placed. In the scene those two events are the machine appearing and the pod stepping onto it.

Scaling down is the half that has to be careful, and it is deliberately slow. A node becomes a candidate when the sum of the requests on it stays under a threshold for a while, and it is only actually removed when every pod on it can be moved somewhere else. Pods that block that are common and mostly reasonable: anything without a controller to recreate it, anything with local storage, anything whose disruption budget would be violated by the move, anything the operator has annotated as unsafe to evict. When the node does go, it is cordoned, its pods are evicted through the same budgets a manual drain respects, and then the machine is returned. The scene draws it as a cell that empties, is marked `drain`, and leaves.

The word that ties this page to the previous one is `requests`. The autoscaler simulates scheduling, and scheduling reads requests, so the capacity it buys is a function of the numbers written on the pods rather than of what those pods do. A fleet that over-requests will hold nodes it does not need and never scale down, because on paper every node is comfortably occupied. A fleet that under-requests will look like it fits, buy too few machines, and discover the truth as throttling and out-of-memory kills on nodes the scheduler thought had room. Neither failure shows up as an autoscaler bug. Both show up as a bill or an incident.

Two practical points decide how well this works. The first is node group shape: a group of very large machines makes the smallest possible scale-out expensive and the smallest possible scale-in rare, while a group of small ones wastes a larger fraction of each node on system overhead and hits per-node pod limits sooner. Most clusters end up with a couple of groups of different shapes and let the autoscaler choose. The second is the startup path. Adding a node is minutes, not seconds, so a workload that must absorb a spike immediately needs either headroom or a pool of low-priority placeholder pods that real work can evict — capacity you have already paid for, held by something that will get out of the way.

That is the honest summary of the whole scene. Elasticity does not make capacity free or instant. It makes the size of the bill a function of the size of the work, on a delay you have to design around, and only if the numbers the layers hand each other are true.
