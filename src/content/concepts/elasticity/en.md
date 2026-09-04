---
title: "Elasticity"
summary: "Elasticity is capacity that follows demand: replicas multiply when load rises, pods are re-sized when their requests are wrong, and the node pool beneath grows and shrinks to fit, so you pay for what runs rather than for what might."
category: "Containers and orchestration"
tags: ["kubernetes"]
scene: elasticity
steps:
  - title: "Fixed capacity fails twice a day"
    text: "At the morning peak three pods drown and users wait; at 3 a.m. the same three pods idle and the bill runs on. Sizing for the peak wastes the night; sizing for the night breaks the morning. Elasticity refuses the choice: capacity follows demand instead of guessing it."
  - title: "Horizontal first: more of the same pod"
    text: "Demand climbs, CPU crosses the target, and the autoscaler adds a replica — an identical pod behind one service, taking a share. Demand falls and the extra is removed, on a delay: scaling in too eagerly turns every ripple into a restart storm."
  - title: "Vertical when the pod itself is the wrong size"
    text: "Requests written a year ago meet today's workload: one pod starves in a too-small box while another sits in one far bigger than it uses. The vertical autoscaler re-rights them at the price of a restart."
  - title: "The node pool is elastic too — pods need somewhere to stand"
    text: "Scale-out fills the nodes, the next pod goes pending, and the cluster autoscaler adds a machine for it. When demand recedes, an emptied node is drained and returned. The bill finally tracks the work: you pay for what runs, not for what might someday."
related:
  - label: Horizontal Pod Autoscaler
    slug: horizontal-pod-autoscaler
  - label: Vertical Pod Autoscaler
    slug: vertical-pod-autoscaler
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
  - title: "Kubernetes: cluster autoscaling"
    url: https://kubernetes.io/docs/concepts/cluster-administration/node-autoscaling/
  - title: "Scaling options for applications in AKS"
    url: https://learn.microsoft.com/en-us/azure/aks/concepts-scale
---

## When to use

- Demand that varies by hour or by event: daily cycles, campaigns, batch windows, anything whose traffic graph has a shape rather than a level.
- When you are paying for idle capacity kept "just in case", and the just-in-case is most of the day.
- When the latency budget breaks at peaks a fixed fleet cannot absorb, and buying for the peak means buying for a few hours a week.
- Any Kubernetes workload whose replica count or resource requests were last looked at months ago. The numbers were right for a workload that has since moved.

## Cautions

- Elasticity needs a signal it can act on. Autoscaling on a metric the application does not actually bottleneck on scales the wrong thing, expensively: CPU says nothing about a service waiting on a database, and adding replicas to a queue that is already saturating its consumer group adds only connections.
- Scale-out is never faster than pod startup. Image pull, JIT warm-up and cache priming all land between the traffic arriving and the capacity arriving, and if that gap is a minute then a five minute peak is half over before the pods are ready. Pre-pull images, keep startup lean, and hold headroom for the gap.
- The horizontal and vertical autoscalers will fight if you point them at the same metric. Split the responsibilities: horizontal on load, vertical on right-sizing, or run the vertical one in recommendation mode and let a human apply what it learns.
- Scale-in is the dangerous direction, and a disruption budget will not help with it. Lowering the replica count makes the controller delete a pod, which never goes through the eviction API and so never consults a budget; budgets constrain the evictions that come from a node drain or a cluster scale-down instead. What makes scale-in safe is the stabilisation window and a graceful shutdown that finishes what the pod was holding. Scaling out eagerly and in patiently is not an inconsistency; it is the whole asymmetry.
- Stateful workloads stretch differently. Storage does not multiply the way stateless pods do, and a replica that owns a shard or a lease cannot simply be doubled. Elasticity applies to the layer that holds no state, and the layer that does needs a different plan.
- The cluster autoscaler plans from requests, not from usage. A fleet whose requests are wrong gets a node pool that is wrong in the same direction, which is why right-sizing is not a separate concern from capacity planning but the input to it.

## In .NET

Most of the work is in the application, not the manifest. A service that scales out has to hold nothing locally that a second copy would need, has to finish what it is holding when it is told to stop, and has to report itself unready until it can actually serve.

```csharp
var builder = WebApplication.CreateBuilder(args);

// Shared state lives outside the pod, so any replica can answer any request.
// This registers `IDistributedCache`; session state needs `AddSession` on top.
builder.Services.AddStackExchangeRedisCache(options =>
    options.Configuration = builder.Configuration.GetConnectionString("Redis"));

// Readiness gates traffic: a pod that reports ready before it can serve makes
// a spike worse, because the balancer sends it a share it then fails.
builder.Services.AddHealthChecks()
    .AddCheck<WarmupHealthCheck>("warmup", tags: ["ready"]);

var app = builder.Build();
app.MapHealthChecks("/healthz/ready", new HealthCheckOptions
{
    Predicate = check => check.Tags.Contains("ready"),
});

// Scale-in is an eviction. Finish the work in hand before the process leaves.
var lifetime = app.Services.GetRequiredService<IHostApplicationLifetime>();
lifetime.ApplicationStopping.Register(() => Drain.Begin());
app.Run();
```

For work that is driven by a queue rather than by HTTP, KEDA scales on queue depth or consumer lag directly, which is the signal that actually moves when a worker falls behind. It also scales to zero between batches, which no CPU-based rule can do, because a worker with nothing to do uses no CPU either way.
