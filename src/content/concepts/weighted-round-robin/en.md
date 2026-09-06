---
title: "Weighted Round Robin"
summary: "Weighted round robin is the same rotation with a number attached to each server, so a destination with twice the weight comes up twice as often. The weight is a static claim about capacity, which makes going stale its characteristic failure rather than a rare one."
category: "Edge, routing and service networking"
level: 4
scene: load-balancer
sceneStep: 1
related:
  - label: Load Balancer
    slug: load-balancer
  - label: Round Robin
    slug: round-robin
  - label: Least Connections
    slug: least-connections
  - label: Layer 4 Load Balancing
    slug: layer-4-load-balancing
  - label: Canary Release
    slug: canary-release
references:
  - title: Load balancing options
    url: https://learn.microsoft.com/en-us/azure/architecture/guide/technology-choices/load-balancing-overview
---

The scene's first step hands each request to the next server in turn, which is exactly the right thing when the servers are interchangeable. Weighted round robin is what you reach for when they are not. The rotation is unchanged and the round robin page still describes it; the only addition is a number per destination that decides how often its name comes up. Give one server a weight of two and its neighbours a weight of one, and it receives half the requests instead of a third. Nothing is measured, nothing is observed at request time, and the policy remains as cheap and as predictable as the unweighted one.

Two implementation details are worth knowing because they change the traffic shape. The naive way to honour weights is to expand the rotation — list the heavy server twice and cycle through the expanded list — which delivers the right proportion over a full cycle and delivers it in bursts, sending two consecutive requests to the same destination before moving on. The refinement that most balancers actually run, smooth weighted round robin, interleaves instead, so a 5:1:1 split produces a sequence that returns to the heavy server regularly rather than firing five at it in a row. Over a hundred requests the two are identical; over the five requests that happen to arrive during a spike they are not, and burstiness at the destination is the thing a concurrency-sensitive backend notices.

The honest use of a weight is to encode heterogeneous capacity that you actually know about. A fleet that grew across two instance types, a pair of on-premises machines beside a cloud tier, a region where one datacentre has more of everything: these are cases where the difference is real, stable and knowable at provisioning time, and where letting the small machine take an equal share means it saturates while the large one idles. Ratios drawn from something structural — core count, memory, a published throughput figure — survive better than numbers arrived at by tuning, because the structural thing changes on a change ticket and the tuned number changes in someone's memory.

The characteristic failure is that the weight is a claim nothing re-checks. Capacity was declared once and the fleet keeps moving underneath it: an instance type is replaced, a noisy neighbour takes half a node's processor, one machine warms up cold after a restart, a disk degrades to a fraction of its throughput. The rotation keeps sending the heavy server its full share, because the weight does not know any of this happened, and the symptom is a destination whose error rate or p99 diverges from its peers while the traffic split stays exactly as configured. Two habits keep it honest: keep the vocabulary coarse, a handful of values like one, two and four rather than a spectrum, so nobody is tempted to hand-tune; and put the per-destination latency and error rate on one chart so drift is visible without anyone going to look for it. Where capacity varies by the minute rather than by the quarter, the answer is a policy that measures instead of a weight that remembers, which is what least connections and its sampling cousin are for. And the same weighted split has a second life that has nothing to do with capacity: sending five percent of traffic to a new version is the mechanism of a canary release, where the number expresses how much risk you are willing to take rather than how much the server can hold.
