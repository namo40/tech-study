---
title: "Round Robin"
summary: "Round robin hands each request to the next server in a fixed rotation. It needs no state beyond a cursor and no measurement of anything, which makes it the right default exactly when every request costs about the same."
category: "Edge, routing and service networking"
level: 3
scene: load-balancer
sceneStep: 1
related:
  - label: Load Balancer
    slug: load-balancer
  - label: Least Connections
    slug: least-connections
  - label: Health-Based Routing
    slug: health-based-routing
  - label: Weighted Round Robin
    slug: weighted-round-robin
  - label: Layer 7 Load Balancing
    slug: layer-7-load-balancing
  - label: Reverse Proxy
    slug: reverse-proxy
  - label: YARP
    slug: yarp
references:
  - title: YARP load balancing
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/yarp/load-balancing
  - title: Configure ASP.NET Core to work with proxy servers and load balancers
    url: https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/proxy-load-balancer?view=aspnetcore-10.0
  - title: Kubernetes Service and kube-proxy
    url: https://kubernetes.io/docs/reference/networking/virtual-ips/
---

## When to use

- Instances of the same size doing work of about the same cost: a stateless HTTP API whose endpoints all finish in a few milliseconds.
- A first configuration, before there is any evidence that the cost is uneven. Round robin is cheap enough to be the thing you change away from rather than the thing you tune.
- Anywhere the balancer cannot see how long a request takes, which is most layer 4 balancers: they forward packets and never learn what a response cost.

## Cautions

- The rotation is blind. A server that is still holding three slow requests gets its turn anyway, which is the failure the second step of the scene shows.
- Instances of different sizes need weights. Weighted round robin gives a server twice the memory twice the turns, and it is still the same rotation underneath: the weight only changes how often a name comes up.
- Rotation is per balancer. Several balancer instances each running their own cursor add up to something closer to random than to a rotation, which is fine for load but confusing when you read one instance's logs.
- Long-lived connections defeat it entirely. When the balancer routes connections rather than requests, one round robin decision serves every request on that connection, and a WebSocket or a gRPC channel can hold one server for hours.
- A new server joining an established rotation gets a full share on its first turn, which is the reason for warming it up rather than letting it take a quarter of the traffic cold.

## In .NET

`RoundRobin` is one of YARP's built-in policies — the default, if a cluster names none, is `PowerOfTwoChoices` — and `FirstAlphabetical` is the one to reach for when you deliberately want no spreading at all. None of the built-in policies is weighted: weights go on the destination as metadata, and a custom `ILoadBalancingPolicy` is what reads them.

```csharp
builder.Services.AddReverseProxy().LoadFromMemory(
    routes: [new RouteConfig { RouteId = "api", ClusterId = "api", Match = new RouteMatch { Path = "/{**catch-all}" } }],
    clusters:
    [
        new ClusterConfig
        {
            ClusterId = "api",
            LoadBalancingPolicy = LoadBalancingPolicies.RoundRobin,
            Destinations = new Dictionary<string, DestinationConfig>
            {
                ["s1"] = new() { Address = "http://api-1:8080/" },
                ["s2"] = new() { Address = "http://api-2:8080/" },
                ["s3"] = new() { Address = "http://api-3:8080/" },
            },
        },
    ]);
```

The same policy appears everywhere else under other names. `kube-proxy` in iptables mode picks a backend at random per connection, which averages out to round robin; in IPVS mode `rr` is the literal algorithm. Nginx uses weighted round robin unless told otherwise, and Azure Load Balancer hashes the five-tuple, which spreads connections evenly without keeping a cursor at all. In every one of them the same caution applies: the rotation is fair in turns, not in work.
