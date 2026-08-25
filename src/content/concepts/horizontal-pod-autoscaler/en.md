---
title: "Horizontal Pod Autoscaler"
summary: "The Horizontal Pod Autoscaler changes how many replicas of a workload run, from a metric and a target: desired = ceil(current × actual / target). It reacts after the fact, new pods take time to become ready, and it is only as good as the metric it watches."
category: "Containers and orchestration"
scene: horizontal-pod-autoscaler
steps:
  - title: "Steady"
    text: "Two pods run at 35% CPU against a 60% target. Every fifteen seconds the autoscaler recomputes the desired count and gets the same answer: two. Nothing changes, which is the point."
  - title: "The spike"
    text: "Traffic triples, the two pods saturate, and requests start being refused. The autoscaler notices on its next tick, asks for four, and the new pods take half a minute to start. Until they are ready, the old two carry everything. Headroom is what covers that gap."
  - title: "Scale in slowly"
    text: "When traffic drops the arithmetic says two again, but the autoscaler waits out a stabilisation window before removing pods, so a brief spike in between does not make it flap. Scaling out is eager; scaling in is patient."
  - title: "The right metric"
    text: "The work becomes I/O bound. CPU sits at 30% and never asks for anything, while the queue behind the pods grows until requests are being dropped. Point the autoscaler at the queue instead and the same formula finally says four."
related:
  - label: Vertical Pod Autoscaler
    slug: vertical-pod-autoscaler
  - label: Cluster Autoscaler
    slug: cluster-autoscaler
  - label: Resource Request
    slug: resource-request
  - label: Resource Limit
    slug: resource-limit
  - label: Readiness Probe
    slug: readiness-probe
  - label: Horizontal Scaling
    slug: horizontal-scaling
  - label: Elasticity
    slug: elasticity
  - label: Load Balancer
    slug: load-balancer
  - label: Queue-Based Load Leveling
    slug: queue-based-load-leveling
  - label: Web Queue Worker
    slug: web-queue-worker
  - label: Tail Latency
    slug: tail-latency
references:
  - title: "Kubernetes: autoscaling workloads"
    url: https://kubernetes.io/docs/concepts/workloads/autoscaling/
  - title: "HorizontalPodAutoscaler walkthrough"
    url: https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/
  - title: "Kubernetes: liveness, readiness and startup probes"
    url: https://kubernetes.io/docs/concepts/workloads/pods/probes/
---

## When to use

- Stateless workloads whose load varies through the day: web and API pods, consumers, background workers.
- When adding replicas actually adds capacity, which means the things behind them (the database, the cache, the broker) have room for the extra connections too.
- When you can name the number that means "too busy" and export it. The autoscaler is a controller, and a controller needs a signal that moves before the users notice.

## Cautions

- Scaling is reactive, and pods take time to become ready. The gap between the load arriving and the capacity arriving is covered by headroom, so a lower target and a fast startup are worth more here than a clever policy.
- Set resource requests. CPU utilisation is a percentage of the request, not of the node, and a pod without one gives the autoscaler nothing to divide by.
- Readiness probes gate traffic to new pods. A pod that reports ready before it can actually serve makes the spike worse, because the balancer sends it a share of the traffic it then fails.
- Scale in behind a stabilisation window and scale out without one. Removing a pod is cheap to delay and expensive to get wrong, and the window is what stops a brief dip from turning into a cycle of removing and re-adding the same replicas.
- CPU is the wrong metric for I/O bound and queue driven work. In-flight requests, queue depth or age, consumer lag, and p95 latency all move when CPU does not, and all of them are available as custom or external metrics.
- Check the rest of the chain before raising `max`. Sixteen pods holding ten connections each is a hundred and sixty connections, and the database may be configured for a hundred.
- Two pods is not the same as two pods' worth of capacity if the work is uneven. Watch what a scale-out does to the tail, not just to the average.

## In .NET

The manifest is where the policy lives. `behavior` is the half that is easy to leave out, and it is the half that decides whether the deployment flaps: a stabilisation window on the way down, none on the way up.

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata: { name: orders-worker }
spec:
  scaleTargetRef: { apiVersion: apps/v1, kind: Deployment, name: orders-worker }
  minReplicas: 2
  maxReplicas: 8
  behavior:
    scaleDown: { stabilizationWindowSeconds: 300 }
    scaleUp:   { stabilizationWindowSeconds: 0 }
  metrics:
    - type: Resource
      resource: { name: cpu, target: { type: Utilization, averageUtilization: 60 } }
    - type: Pods
      pods:
        metric: { name: orders_queue_depth }
        target: { type: AverageValue, averageValue: "100" }
```

The second metric only exists because the application exports it. An `ObservableGauge` read through the Prometheus exporter, and an adapter in the cluster that turns the scrape into a custom metric, is the whole of the plumbing.

```csharp
// The app exports the number the autoscaler scales on.
private static readonly Meter Meter = new("Shop.Orders");
private static readonly ObservableGauge<long> QueueDepth =
    Meter.CreateObservableGauge("orders_queue_depth", () => queue.ApproximateDepth);

builder.Services.AddOpenTelemetry()
    .WithMetrics(m => m.AddMeter("Shop.Orders").AddPrometheusExporter());
app.MapPrometheusScrapingEndpoint();          // /metrics
```

Two lines of the Deployment matter as much as the autoscaler itself. `resources.requests.cpu` is the denominator the CPU percentage is a percentage of, and a readiness probe is what holds traffic off a pod until it can serve. Without the first the formula has nothing to work with; without the second the new pods join the rotation before they are any use, which is exactly when the load is highest.
