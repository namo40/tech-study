---
title: "Readiness Probe"
summary: "A readiness probe answers one question every few seconds: should this instance receive traffic right now? Fail it and the pod is quietly taken out of rotation; pass it and traffic returns. Liveness asks the harsher question, whether the process should keep existing at all, and answers with a restart."
category: "Containers and orchestration"
tags: ["kubernetes"]
scene: readiness-probe
steps:
  - title: "Two questions, two answers"
    text: "Readiness asks: should this instance receive traffic right now? Liveness asks: should this process keep existing? A pod that is starting up fails readiness, receives nothing, and joins the rotation the moment it is ready."
  - title: "Not ready is a quiet exit"
    text: "A dependency hiccups, readiness fails three times, and the pod is removed from the endpoints. Nothing is killed; traffic simply flows around it. When the probe passes again, traffic returns as quietly as it left."
  - title: "Liveness answers with a restart"
    text: "A hung process passes nothing, so the kubelet kills and restarts the container. The counter ticks, readiness gates the fresh start, and traffic waits until the pod is actually ready. Restart is the remedy for being stuck, not for being busy."
  - title: "Point liveness at yourself, readiness at your dependencies"
    text: "Let liveness check the database, and one blip restarts every pod at once: a self-inflicted outage. Split correctly, the same blip only pulls pods from rotation, and they return the moment the dependency does."
related:
  - label: Health Check
    slug: health-check
  - label: Liveness Probe
    slug: liveness-probe
  - label: Health-Based Routing
    slug: health-based-routing
  - label: Load Balancer
    slug: load-balancer
  - label: Rolling Update
    slug: rolling-update
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: Horizontal Pod Autoscaler
    slug: horizontal-pod-autoscaler
  - label: Connection Draining
    slug: connection-draining
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
  - label: Resource Limit
    slug: resource-limit
references:
  - title: "Kubernetes: liveness, readiness and startup probes"
    url: https://kubernetes.io/docs/concepts/workloads/pods/probes/
  - title: "Kubernetes: configure liveness, readiness and startup probes"
    url: https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/
  - title: "ASP.NET Core: health checks"
    url: https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/health-checks
---

## When to use

- On every deployment that sits behind a router. Readiness is what gates a rollout, a scale-out and a recovery alike: in all three cases something new appears, and the only reason traffic does not arrive too early is that a probe has not passed yet.
- Whenever an instance has warm-up work to do. Loading configuration, filling a cache, opening a pool, running migrations at start: all of it happens before the first request should arrive, and readiness is how the process says so.
- Wherever an instance can be temporarily unable to serve without being broken. A pod waiting on a dependency, a pod shedding load, a pod that has been told to stop and is draining: each of them wants to be skipped, not killed.
- Watch the ready count against the replica count, and watch the restart counter next to it. A ready count that dips while restarts climb usually means the probes are aimed at the wrong thing rather than that the fleet is sick.

## Cautions

- Readiness may check dependencies; liveness should check only the process itself. A liveness probe that reaches out to a database turns one slow query into a fleet-wide restart, and the restarts make the database slower still.
- Tune the initial delay, the period and the failure threshold to the application's real warm-up. A probe stricter than the process it watches produces flapping: in and out of the endpoints every few seconds, which is worse for callers than being out.
- Remember what the threshold costs. Three refusals at a two second period is six seconds of traffic sent to an instance that already knows it cannot serve, so the threshold trades a slower reaction for immunity to a single bad sample. Pick it deliberately rather than leaving it at the default and being surprised by it.
- A readiness check that fails under load shrinks the fleet exactly when you need it whole. If the check measures latency or queue depth, a busy instance removes itself, its share moves to its neighbours, and they remove themselves in turn. Pair the check with load shedding and a concurrency limit rather than with a looser probe.
- Use a startup probe for a slow starter instead of stretching liveness to cover boot time. A liveness probe generous enough for a two minute start is also generous enough to leave a hung process running for two minutes.
- Make readiness fail as soon as shutdown begins. Removing an instance from the endpoints is not instant, so a pod that starts refusing at the same moment it stops reporting ready will refuse requests that were routed a fraction of a second earlier.
- Keep the endpoint cheap and unauthenticated inside the cluster, and keep it off the public router. It runs several times a second on every instance, so a check that queries anything expensive is a load generator with a health-shaped name.

## In .NET

ASP.NET Core has the split built in. Register checks with tags, then map two endpoints that filter on those tags, so the readiness path can consult dependencies while the liveness path answers from the process alone.

```csharp
builder.Services.AddHealthChecks()
    .AddCheck("self", () => HealthCheckResult.Healthy(), tags: ["live"])
    .AddCheck<OrdersDbHealthCheck>("orders-db", tags: ["ready"])
    .AddCheck<CacheWarmHealthCheck>("cache-warm", tags: ["ready"]);

var app = builder.Build();
app.MapHealthChecks("/healthz/live", new HealthCheckOptions { Predicate = c => c.Tags.Contains("live") });
app.MapHealthChecks("/healthz/ready", new HealthCheckOptions { Predicate = c => c.Tags.Contains("ready") });
```

The manifest has to agree with those paths, and the numbers in it are the ones the scene is showing: how long before the first question, how often it is asked, and how many refusals in a row the kubelet acts on.

```yaml
readinessProbe:
  httpGet: { path: /healthz/ready, port: 8080 }
  initialDelaySeconds: 5
  periodSeconds: 2
  failureThreshold: 3
livenessProbe:
  httpGet: { path: /healthz/live, port: 8080 }   # the process only
  periodSeconds: 10
  failureThreshold: 3
startupProbe:
  httpGet: { path: /healthz/live, port: 8080 }
  periodSeconds: 5
  failureThreshold: 30                           # up to 150s to boot
```

The last piece is shutdown. Report not-ready the instant `ApplicationStopping` fires, so the endpoints change is already propagating while the in-flight requests finish, and keep the host's shutdown timeout inside the platform's grace period.

```csharp
// One flag, set by the lifetime and read by readiness, is the whole handshake.
builder.Services.AddSingleton<ShutdownState>();
builder.Services.AddHealthChecks()
    .AddCheck<ShutdownState>("not-shutting-down", tags: ["ready"]);

app.Lifetime.ApplicationStopping.Register(
    () => app.Services.GetRequiredService<ShutdownState>().Stopping = true);
```

For a worker with no HTTP surface the same idea works with a file or a socket: `exec` a command that checks a marker the process writes, or `tcpSocket` a listener the process opens only once it is ready. The shape of the check matters far less than which of the two questions it is answering.
