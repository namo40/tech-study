---
title: "Load Balancer"
summary: "A load balancer spreads requests across several servers. Which server gets the next request is a policy: round robin when the work is uniform, least connections when it is not, and only ever a server that has passed its health check."
category: "Edge, routing and service networking"
scene: load-balancer
steps:
  - title: "Round robin"
    text: "Each request goes to the next server in turn. When every request costs about the same, that is all the balancing you need."
  - title: "Uneven work"
    text: "Round robin does not know that server 2 is still busy with three slow requests, and keeps sending more. Least connections looks at what is in flight and sends the next request where there is room."
  - title: "Health checks"
    text: "Two failed probes take a server out of the rotation, and two successes bring it back. Between the fault and the second probe two requests still fail, which is why the probe interval matters."
  - title: "Scaling out"
    text: "A new server joins once its probes pass, and its share of the traffic ramps up while it warms its caches and its JIT. This only works because any server can answer any request: no state lives on just one of them."
related:
  - label: Round Robin
    slug: round-robin
  - label: Weighted Round Robin
    slug: weighted-round-robin
  - label: Least Connections
    slug: least-connections
  - label: Power of Two Choices
    slug: power-of-two-choices
  - label: Health-Based Routing
    slug: health-based-routing
  - label: Health Check
    slug: health-check
  - label: Layer 4 Load Balancing
    slug: layer-4-load-balancing
  - label: Layer 7 Load Balancing
    slug: layer-7-load-balancing
  - label: Reverse Proxy
    slug: reverse-proxy
  - label: YARP
    slug: yarp
  - label: Service Discovery
    slug: service-discovery
  - label: Sticky Session
    slug: sticky-session
  - label: Readiness Probe
    slug: readiness-probe
references:
  - title: Configure ASP.NET Core to work with proxy servers and load balancers
    url: https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/proxy-load-balancer?view=aspnetcore-10.0
  - title: YARP load balancing
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/yarp/load-balancing
  - title: YARP destination health checks
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/yarp/dests-health-checks
---

## When to use

- More than one instance of anything that answers requests: web servers, HTTP APIs, gRPC services.
- Zero-downtime deploys and scaling, both of which depend on instances being able to come and go without anyone noticing. The balancer is what makes that possible.
- Traffic that has to survive a single machine failing, where taking the broken instance out of the rotation is the whole of the recovery.

## Cautions

- Round robin assumes uniform work. Long-lived connections and slow endpoints call for least connections or power-of-two-choices instead, because a server that is already busy will still be handed its turn.
- Health checks must test the application, not just the port. A readiness endpoint that checks the dependencies the app needs to serve traffic is the honest signal, and the probe interval decides how long a failure lasts: two probes a second apart is two seconds of failed requests.
- Behind a proxy, configure forwarded headers so the app sees the real client IP and scheme. Without them every request looks like it came from the balancer, and redirects come back as `http` on an HTTPS site.
- Stickiness is a crutch. Externalise session state so that any server can take any request, and keep affinity for the cases that genuinely cannot be moved.
- Layer 4 balancers forward packets and are fast and protocol-agnostic. Layer 7 balancers read the request, so they can route by path, host and header, terminate TLS and retry idempotent calls, at the cost of doing more per request.
- Draining matters as much as adding. An instance being removed should stop being sent new work first and finish what it is holding second, or a deploy turns into a burst of errors.

## In .NET

YARP is a reverse proxy you configure rather than write. A cluster names its destinations, the policy decides which one gets the next request, and the active health check is what keeps a broken destination out of the rotation.

```json
{
  "ReverseProxy": {
    "Routes": { "api": { "ClusterId": "api", "Match": { "Path": "/{**catch-all}" } } },
    "Clusters": {
      "api": {
        "LoadBalancingPolicy": "LeastRequests",
        "HealthCheck": {
          "Active": { "Enabled": true, "Interval": "00:00:01", "Timeout": "00:00:01",
                      "Policy": "ConsecutiveFailures", "Path": "/healthz/ready" }
        },
        "Metadata": { "ConsecutiveFailuresHealthPolicy.Threshold": "2" },
        "Destinations": {
          "s1": { "Address": "http://api-1:8080/" },
          "s2": { "Address": "http://api-2:8080/" },
          "s3": { "Address": "http://api-3:8080/" }
        }
      }
    }
  }
}
```

The other half lives in the application, and it is the half that is easy to leave out: a readiness probe that answers for the dependencies the app needs, and forwarded headers so the app knows who it is really talking to.

```csharp
// The app side: a readiness probe that checks what the app needs to serve traffic.
builder.Services.AddHealthChecks()
    .AddNpgSql(builder.Configuration.GetConnectionString("shop")!, tags: ["ready"]);
builder.Services.Configure<ForwardedHeadersOptions>(o =>
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto);

var app = builder.Build();
app.UseForwardedHeaders();
app.MapHealthChecks("/healthz/ready", new HealthCheckOptions { Predicate = c => c.Tags.Contains("ready") });
```

`LeastRequests` is YARP's least connections, and `ConsecutiveFailures` with a threshold of two — YARP's own default, written out above for clarity — is the failure half of the rule the scene draws: one bad probe is noise, two in a row is a decision. Coming back is where YARP is simpler than the scene, because it marks a destination healthy again on its first successful probe; a success threshold like the scene's is a Kubernetes `successThreshold`-style setting rather than a YARP one. An L7 balancer such as Application Gateway or a Kubernetes Ingress is configured from the same three pieces: the policy that picks a destination, the health check that decides which destinations exist, and the forwarding headers that let the app behind it see the original request. An L4 one such as Azure Load Balancer or a Kubernetes Service has only the first two — and for a Service the second is the pods' readiness rather than a probe of its own — because it never reads the request and so has no headers to add to it.
