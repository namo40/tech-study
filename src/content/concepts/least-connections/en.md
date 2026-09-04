---
title: "Least Connections"
summary: "Least connections sends the next request to whichever server is holding the fewest in flight. It replaces the assumption that every request costs the same with a measurement the balancer already has, which is why it is the policy to reach for when the work is uneven."
category: "Edge, routing and service networking"
scene: load-balancer
sceneStep: 2
related:
  - label: Load Balancer
    slug: load-balancer
  - label: Round Robin
    slug: round-robin
  - label: Health-Based Routing
    slug: health-based-routing
  - label: Power of Two Choices
    slug: power-of-two-choices
  - label: Tail Latency
    slug: tail-latency
  - label: Concurrency Limiter
    slug: concurrency-limiter
  - label: YARP
    slug: yarp
references:
  - title: YARP load balancing
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/yarp/load-balancing
  - title: The Power of Two Choices in Randomized Load Balancing
    url: https://www.eecs.harvard.edu/~michaelm/postscripts/handbook2001.pdf
  - title: Configure ASP.NET Core to work with proxy servers and load balancers
    url: https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/proxy-load-balancer?view=aspnetcore-10.0
---

## When to use

- Request costs that vary by an order of magnitude: a search endpoint next to a health endpoint, a report next to a lookup.
- Long-lived connections, where the balancer routes a connection once and that connection then carries whatever traffic it likes. Counting connections is the only handle it has left.
- Backends of different speeds, whether because the hardware differs or because one of them is having a bad time. A slow server accumulates in-flight requests, and the count is what tells the balancer to stop adding to them.

## Cautions

- The count is in flight, not queued. A server that fails instantly looks like the least loaded one, so a broken instance attracts more traffic than a healthy one until the health check catches it. That is the third step of the scene, and it is the reason least connections and health checks belong together.
- Every balancer counts only its own connections. With several balancer instances, each has a partial view, and the sum of several locally optimal choices is not a globally optimal one.
- Keeping an exact count over a large backend pool costs something. Power-of-two-choices picks two destinations at random and takes the shorter queue, which gets most of the benefit with none of the coordination, and is what most large systems actually run.
- Ties need a rule. Break them by rotating, not by always taking the first, or an idle pool degenerates into sending everything to one server.
- It balances concurrency, not latency. If what you care about is the tail, pair it with per-server concurrency limits and a timeout, so one slow server sheds work rather than absorbing it.

## In .NET

YARP calls it `LeastRequests`, and `PowerOfTwoChoices` is its default policy precisely because it approximates least connections without the bookkeeping.

```csharp
builder.Services.AddReverseProxy().LoadFromMemory(
    routes: [new RouteConfig { RouteId = "api", ClusterId = "api", Match = new RouteMatch { Path = "/{**catch-all}" } }],
    clusters:
    [
        new ClusterConfig
        {
            ClusterId = "api",
            // LeastRequests reads the exact in-flight count; PowerOfTwoChoices
            // samples two destinations and takes the smaller of the two.
            LoadBalancingPolicy = LoadBalancingPolicies.LeastRequests,
            HttpRequest = new ForwarderRequestConfig { ActivityTimeout = TimeSpan.FromSeconds(10) },
            Destinations = new Dictionary<string, DestinationConfig>
            {
                ["s1"] = new() { Address = "http://api-1:8080/" },
                ["s2"] = new() { Address = "http://api-2:8080/" },
                ["s3"] = new() { Address = "http://api-3:8080/" },
            },
        },
    ]);
```

The `ActivityTimeout` above is not decoration. Least connections only works if a request eventually leaves the count, and a request that hangs forever holds a slot forever: the policy and the timeout are the same mechanism seen from two ends. Nginx spells the policy `least_conn`, HAProxy spells it `leastconn`, and Envoy's `LEAST_REQUEST` is power-of-two-choices with a configurable sample size, though the policy an Envoy cluster gets when it names none is `ROUND_ROBIN`.
