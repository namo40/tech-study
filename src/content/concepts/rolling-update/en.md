---
title: "Rolling Update"
summary: "A rolling update replaces pods one batch at a time: a new one starts, passes its readiness probe, takes traffic, and only then is an old one told to stop and drain. Nobody notices, provided the two versions can run side by side."
category: "Containers and orchestration"
tags: ["kubernetes", "deployment"]
scene: rolling-update
steps:
  - title: "One at a time"
    text: "A new pod starts, passes readiness, joins the endpoints, and only then is an old pod asked to stop. The count never drops below four, so the traffic never notices. For a while, both versions serve."
  - title: "Readiness is the gate"
    text: "The new version fails its probe, so it never joins the endpoints and never sees a request. The rollout stalls with the old pods still serving, and undoing it is one command. A broken build stays invisible."
  - title: "Drain, then exit"
    text: "A terminating pod is removed from the endpoints, but that takes a moment to propagate, so it keeps accepting for a beat and finishes every request it already has before it exits. SIGTERM is a request to stop, not a kill, and the grace period is the deadline."
  - title: "Two versions, one database"
    text: "During the rollout old and new pods share the schema and the API. Expand first, add the column, keep the old one, ship the code that handles both, and contract only after the last old pod is gone. A rename in one step breaks the version still running."
related:
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: Connection Draining
    slug: connection-draining
  - label: Readiness Probe
    slug: readiness-probe
  - label: SIGTERM
    slug: sigterm
  - label: Termination Grace Period
    slug: termination-grace-period
  - label: Pre-Stop Hook
    slug: pre-stop-hook
  - label: Expand-Contract Migration
    slug: expand-contract-migration
  - label: Blue-Green Deployment
    slug: blue-green-deployment
  - label: Canary Release
    slug: canary-release
  - label: Pod Disruption Budget
    slug: pod-disruption-budget
  - label: Horizontal Pod Autoscaler
    slug: horizontal-pod-autoscaler
  - label: Load Balancer
    slug: load-balancer
  - label: Sticky Session
    slug: sticky-session
  - label: Replication Lag
    slug: replication-lag
references:
  - title: "Kubernetes: Deployments"
    url: https://kubernetes.io/docs/concepts/workloads/controllers/deployment/
  - title: "Kubernetes: liveness, readiness and startup probes"
    url: https://kubernetes.io/docs/concepts/workloads/pods/probes/
  - title: ".NET Generic Host: host shutdown"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/generic-host
---

## When to use

- As the default deployment strategy for stateless services, on Kubernetes and on most platforms that run more than one copy of a process.
- Whenever you can afford two versions running at once. If you cannot, blue-green is the alternative, and it needs a compatible data layer just the same.
- When the replicas are interchangeable. A rolling update assumes any pod can answer any request, so anything pinned to one instance has to be moved out of memory first.

## Cautions

- Readiness probes have to reflect the ability to serve, not the ability to start. A probe that passes before the dependencies are reachable and the caches are warm routes traffic into failures, and the failures arrive exactly when half the fleet is new.
- Handle SIGTERM. Stop accepting new work, finish what is in flight, and exit before the grace period runs out. The host shutdown timeout belongs below `terminationGracePeriodSeconds`, not above it, or the process is killed mid-request.
- Keep a short pre-stop delay. Removing a pod from the endpoints is not instant, so a listener that closes the moment SIGTERM arrives refuses requests that were routed a fraction of a second earlier.
- Make every schema and API change compatible across one version. Add before you remove, ship code that handles both shapes, and only then take the old shape away.
- Set a progress deadline and keep revision history. Without them a rollout that never becomes ready sits there, and the fix is a command nobody has run before.
- Watch what the surge does to everything behind the pods. `maxSurge` briefly adds a whole replica's worth of connections to the database and the broker, and a pool sized for four pods is not sized for five.
- Long-lived connections do not drain the way requests do. A WebSocket or a gRPC stream survives the grace period by design, so the client has to be told to reconnect rather than waited on.

## In .NET

The manifest is where most of the behaviour lives. `maxUnavailable: 0` is what keeps capacity flat, the readiness probe is what holds traffic off a new pod, and the pre-stop sleep is what covers the gap between a pod being told to stop and the endpoints change reaching whoever is routing.

```yaml
spec:
  replicas: 4
  strategy:
    type: RollingUpdate
    rollingUpdate: { maxSurge: 1, maxUnavailable: 0 }
  progressDeadlineSeconds: 300
  template:
    spec:
      terminationGracePeriodSeconds: 30
      containers:
        - name: api
          readinessProbe: { httpGet: { path: /healthz/ready, port: 8080 }, periodSeconds: 5 }
          lifecycle:
            preStop: { exec: { command: ["sh", "-c", "sleep 5"] } }   # let endpoints propagate
```

The application's half is smaller than it looks. Report not-ready as soon as shutdown starts, so the endpoints change is already on its way while the in-flight requests are still finishing, and keep the shutdown timeout inside the grace period.

```csharp
// Report not-ready as soon as shutdown starts, then finish in-flight work.
builder.Services.Configure<HostOptions>(o => o.ShutdownTimeout = TimeSpan.FromSeconds(20));
builder.Services.AddHealthChecks()
    .AddCheck("shutting-down", () => lifetimeState.IsStopping
        ? HealthCheckResult.Unhealthy("shutting down")
        : HealthCheckResult.Healthy(), tags: ["ready"]);

var app = builder.Build();
app.Lifetime.ApplicationStopping.Register(() => lifetimeState.IsStopping = true);
app.MapHealthChecks("/healthz/ready", new HealthCheckOptions { Predicate = c => c.Tags.Contains("ready") });
```

Data is the part the manifest cannot help with. Split an EF Core migration into an expand deployment and a contract deployment, and put a release in between: add the column as nullable, write both, backfill, switch the reads, and only then drop the old column. A migration that renames in one step is a migration that breaks the pods still running the old code, which during a rolling update is half of them.

Long-lived connections need their own answer. SignalR and gRPC streams outlive the grace period, so register an `ApplicationStopping` handler that closes them deliberately and tells the client to reconnect, rather than leaving the platform to cut them off when the deadline passes.
