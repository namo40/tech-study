---
title: "Health-Based Routing"
summary: "Health-based routing is the balancer deciding, from probes and from what its own forwarded requests did, which destinations still exist. It is what turns a failed machine into a shorter rotation instead of a share of failed requests."
category: "Edge, routing and service networking"
scene: load-balancer
sceneStep: 3
related:
  - label: Load Balancer
    slug: load-balancer
  - label: Least Connections
    slug: least-connections
  - label: Round Robin
    slug: round-robin
  - label: Health Check
  - label: Readiness
  - label: Liveness
  - label: Circuit Breaker
    slug: circuit-breaker
  - label: Graceful Shutdown
  - label: YARP
references:
  - title: YARP destination health checks
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/yarp/dests-health-checks
  - title: Health checks in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/health-checks?view=aspnetcore-10.0
  - title: Configure liveness, readiness and startup probes
    url: https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/
---

## When to use

- Any pool with more than one member, which is to say any pool. A balancer without health checks converts one broken instance into a fixed fraction of failed requests for as long as nobody notices.
- Rolling deploys, where an instance has to be taken out of the rotation before it is stopped and put back only once it can actually serve.
- Dependencies that can fail on their own. An instance whose database connection is gone is up but cannot serve, and only a readiness check that asks about the database can tell the difference.

## Cautions

- Active checks probe on a schedule; passive checks read the outcomes of real traffic. Active checks notice an idle instance failing; passive checks notice a failure the probe endpoint does not reproduce. Run both where you can.
- The threshold and the interval are one decision. Two consecutive failures a second apart means up to two seconds of requests going to a dead instance, which is exactly the gap the third step of the scene draws. A shorter interval closes it and costs more probes.
- One failure is noise. Reacting to a single bad probe makes the rotation flap, and a flapping rotation moves load between instances faster than any of them can warm up.
- Probe the application, not the port. A TCP connect test only proves that something is listening, and a `/healthz` that returns 200 unconditionally proves less than that.
- Keep liveness and readiness apart. Readiness answers "should I be sent traffic", liveness answers "should I be restarted", and wiring a dependency check into liveness turns a database outage into a restart loop across the whole fleet.
- Failing the readiness check first is also how a clean shutdown starts: stop being sent new work, finish what is in flight, then exit.

## In .NET

The balancer's half is an active check with a consecutive-failures policy; the application's half is a readiness endpoint that answers for its dependencies. Neither is useful alone.

```csharp
// The balancer: probe /healthz/ready once a second, two strikes and out.
builder.Services.AddReverseProxy().LoadFromMemory(
    routes: [new RouteConfig { RouteId = "api", ClusterId = "api", Match = new RouteMatch { Path = "/{**catch-all}" } }],
    clusters:
    [
        new ClusterConfig
        {
            ClusterId = "api",
            LoadBalancingPolicy = LoadBalancingPolicies.LeastRequests,
            HealthCheck = new HealthCheckConfig
            {
                Active = new ActiveHealthCheckConfig
                {
                    Enabled = true,
                    Interval = TimeSpan.FromSeconds(1),
                    Timeout = TimeSpan.FromSeconds(1),
                    Policy = HealthCheckConstants.ActivePolicy.ConsecutiveFailures,
                    Path = "/healthz/ready",
                },
                Passive = new PassiveHealthCheckConfig
                {
                    Enabled = true,
                    Policy = HealthCheckConstants.PassivePolicy.TransportFailureRate,
                    ReactivationPeriod = TimeSpan.FromSeconds(10),
                },
            },
            Metadata = new Dictionary<string, string> { ["ConsecutiveFailuresHealthPolicy.Threshold"] = "2" },
            Destinations = new Dictionary<string, DestinationConfig>
            {
                ["s1"] = new() { Address = "http://api-1:8080/" },
                ["s2"] = new() { Address = "http://api-2:8080/" },
            },
        },
    ]);
```

```csharp
// The application: liveness says nothing about dependencies, readiness says everything.
builder.Services.AddHealthChecks()
    .AddNpgSql(builder.Configuration.GetConnectionString("shop")!, tags: ["ready"]);

var app = builder.Build();
app.MapHealthChecks("/healthz/live", new HealthCheckOptions { Predicate = _ => false });
app.MapHealthChecks("/healthz/ready", new HealthCheckOptions { Predicate = c => c.Tags.Contains("ready") });
```

`Predicate = _ => false` is the point of the liveness endpoint: it runs no checks, so it answers 200 whenever the process is still able to answer anything, and a database outage never restarts the fleet. Kubernetes reads the same two endpoints as `readinessProbe` and `livenessProbe`, with `failureThreshold` and `periodSeconds` playing the parts of the threshold and the interval above, and a `startupProbe` in front of both so a slow-starting instance is not killed before it has finished warming up.
