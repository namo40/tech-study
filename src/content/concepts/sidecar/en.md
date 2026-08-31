---
title: "Sidecar"
summary: "A sidecar rides next to the application — same pod, same lifecycle, separate container — taking over what every service needs (TLS, logs, retries) so the app keeps none of it in its code, in any of its languages."
category: "Application architecture"
tags: ["kubernetes"]
scene: sidecar
steps:
  - title: "Everything every service needs, every service rewrites"
    text: "The ghost shows TLS, logging and retries growing inside the app — then the same lumps in the next app, in another language, drifting apart with every patch. None of it is the app's business; it is the platform's. The fix is a second seat in the pod."
  - title: "Same pod, different container, one lifecycle"
    text: "The sidecar sits close enough to share the pod's network and fate — it starts with the app, dies with the app, scales with the app — yet it is a separate container: its own image, its own release cadence, its own language. Closeness is what makes it transparent; separation is what makes it reusable."
  - title: "The app knows only plaintext on localhost"
    text: "The sidecar terminates TLS, hands the request across the pod's loopback, and ships the logs out the back — certificates rotate, log formats change, and the app's code never hears about any of it. Attach the same sidecar to a service in another language tomorrow; that is the entire pitch."
  - title: "On the way out stands an ambassador"
    text: "The app calls what it thinks is a local service; the ambassador — a sidecar facing outward — carries the call to the real backend, retries the blip, and hands back one clean answer. Timeouts, routing, failover: negotiated by the diplomat, invisible to the app. In and out, the pod's second seat does the platform's talking."
related:
  - label: Ambassador
    slug: ambassador
  - label: API Gateway
    slug: api-gateway
  - label: Reverse Proxy
    slug: reverse-proxy
  - label: Secret Injection
    slug: secret-injection
  - label: Workload Identity
    slug: workload-identity
  - label: Retry
    slug: retry
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: Adapter
    slug: adapter
  - label: Facade
    slug: facade
  - label: Anti-Corruption Layer
    slug: anti-corruption-layer
references:
  - title: "Sidecar pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/sidecar
  - title: "Ambassador pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/ambassador
  - title: "Sidecar Containers"
    url: https://kubernetes.io/docs/concepts/workloads/pods/sidecar-containers/
---

## When to use

- When every service in the fleet needs the same thing and none of them is interested in it. TLS termination and mTLS, log and metric shipping, config reload, certificate rotation, outbound retries and timeouts: this is platform behaviour that keeps arriving in application repositories because there was nowhere else to put it. A sidecar is that somewhere else, and the test for whether something belongs in it is simple — could you describe the change without naming a single business rule?
- When the fleet speaks more than one language. A library is the cheaper answer for one runtime and the most expensive answer for five, because five implementations drift: the Go one gets the new header, the Node one gets it three sprints later, and the Python one is discovered to have never had it. One container image attached to every pod is one implementation, rolled once.
- When you have to retrofit platform behaviour onto something you cannot change. A vendor image, a service whose owning team disbanded, a binary whose build no longer runs: none of them can be recompiled, and all of them can have a container placed beside them. The app keeps listening on plain HTTP on a port it already listens on, and the world outside the pod gets mTLS anyway.
- When you are already running a service mesh, or heading for one. A mesh is this pattern at fleet scale — a proxy sidecar injected into every pod, plus a control plane that configures all of them together. Understanding one sidecar is understanding what the mesh does to a thousand pods, and it is worth understanding before you adopt one, because the mesh's bill is the sum of these hops.
- **Not** for one service, one language, one team. If there is a single deployment and it is written in the language your team writes, a library is less machinery for the same result: no extra container to size, no extra hop to measure, no extra image to roll. The pattern pays when the same problem has to be solved more than once, and a fleet of one solves it once.

## Cautions

- Every hop is latency and a new way to fail. A request that used to arrive at the app now arrives at the sidecar, crosses the loopback, and only then reaches the app, and the answer walks back the same way. On the pod's own network that is cheap, but it is not free, and it is a component that can be starved, deadlocked, or out of memory while the app itself is perfectly healthy. Measure the added hop rather than assuming it is noise, and make sure your health checks can tell you which container is sick.
- The sidecar's resources come out of the pod's. Its CPU and memory requests are added to the app's when the scheduler places the pod, so a fleet-wide sidecar with a generous request quietly changes how many pods fit on a node. Size both containers deliberately, and remember that the sidecar's limit is the one that decides whether a burst of log shipping starves the thing everybody is actually waiting on.
- Lifecycle ordering is where this pattern actually bites. The sidecar has to be ready before the app receives its first request, or early traffic fails on a proxy that is not listening yet, and it has to drain after the app stops, or the last requests in flight lose the thing carrying them. Kubernetes native sidecar containers — an init container with `restartPolicy: Always` — exist precisely for this: they start before the main containers and are terminated after them. Reach for that before you reach for sleep loops in a `preStop` hook.
- It is a platform component, so version it like one. The sidecar is now in the path of every request in the fleet, which means a bad image is a fleet-wide outage rather than one service's bad afternoon. Pin the version per workload rather than floating on `latest`, roll it the way you would roll a load balancer configuration, and keep the ability to roll it back without touching a single application deployment.
- Do not let business logic move in. The moment the sidecar knows what an order is, it is a second application with none of a second application's tests, and every deploy of it becomes a deploy of your domain. Keep the line at behaviour any service could want. And prefer one container doing five jobs to five containers doing one each: each sidecar is another process, another set of requests against the pod, and another thing that has to be ready before the app can serve.

## In .NET

The visible result is subtraction. The app stops doing the platform's work, which means the interesting diff is what leaves `Program.cs`.

```csharp
// Before: the app owns TLS, log shipping, and the retry policy for every
// outbound call. All three are the platform's business, in the app's repo.
builder.WebHost.ConfigureKestrel(o => o.ListenAnyIP(443, l => l.UseHttps(LoadCertificate())));
builder.Logging.AddOpenTelemetry(o => o.AddOtlpExporter(e => e.Endpoint = CollectorUri));
builder.Services.AddHttpClient<PricingClient>(c => c.BaseAddress = new Uri("https://pricing.internal"))
    .AddPolicyHandler(HttpPolicyExtensions.HandleTransientHttpError()
        .WaitAndRetryAsync(3, attempt => TimeSpan.FromMilliseconds(200 * attempt)));
```

```csharp
// After: plain HTTP on the loopback, logs to stdout, and a base address that
// is a port on this very pod. No certificate code, no exporter, no policy.
builder.WebHost.ConfigureKestrel(o => o.ListenLocalhost(8080));
builder.Logging.AddSimpleConsole(o => o.SingleLine = true);
builder.Services.AddHttpClient<PricingClient>(c => c.BaseAddress = new Uri("http://localhost:3500"));
```

Kestrel listening on `ListenLocalhost` is worth stating plainly: the app is no longer reachable from outside the pod at all, and the only thing that can call it is a process sharing the pod's network namespace. That is the sidecar. Terminating TLS somewhere else is not a downgrade if the plaintext never leaves the loopback.

The manifest is where the second seat and the shared lifetime are declared. The native sidecar is an init container that never exits, which is what buys the start-before and stop-after ordering.

```yaml
spec:
  initContainers:
    - name: sidecar
      image: registry.internal/platform/edge:2.14.0
      restartPolicy: Always          # this is what makes it a sidecar, not an init step
      ports: [{ containerPort: 443 }]
      resources:
        requests: { cpu: 50m, memory: 64Mi }
        limits:   { cpu: 500m, memory: 128Mi }
  containers:
    - name: app
      image: registry.internal/shop/api:9.3.1
      env:
        - name: PRICING_BASE_URL
          value: http://localhost:3500      # the ambassador, not the real host
```

Health checks then have to be honest about which container is being asked. The app's readiness probe should answer for the app, not for whatever is in front of it, and the sidecar publishes its own.

```csharp
builder.Services.AddHealthChecks()
    .AddDbContextCheck<ShopDbContext>("db")
    .AddCheck("self", () => HealthCheckResult.Healthy());

app.MapHealthChecks("/healthz/ready", new HealthCheckOptions { Predicate = _ => true });
app.MapHealthChecks("/healthz/live", new HealthCheckOptions { Predicate = c => c.Name == "self" });
```

Dapr is the ready-made version of this for .NET, and it is worth naming because it is the same picture with the parts already built: a sidecar per pod that does service invocation, pub/sub, state and secrets, and an SDK whose calls resolve to `http://localhost:3500` on the way out.

```csharp
builder.Services.AddDaprClient();

// The app names a service, not a host. Discovery, mTLS, retries and timeouts
// are the sidecar's problem, and the code above cannot tell the difference.
app.MapPost("/orders", async (Order order, DaprClient dapr, CancellationToken ct) =>
{
    var quote = await dapr.InvokeMethodAsync<Basket, Quote>(
        HttpMethod.Post, "pricing", "quote", order.Basket, ct);
    return Results.Ok(quote);
});
```

If moving to another cluster, rotating a certificate authority, or changing the log format is a change to the sidecar image and nothing else, the split is in the right place. If any of those still requires opening the application solution, something crossed the line and moved back in.
