---
title: "Strangler Fig"
summary: "The strangler fig replaces a system one capability at a time: a routing facade sits in front of the old system, each capability is rebuilt and its route flipped to the new one, and the old system shrinks until nothing is left behind the facade."
category: "Application architecture"
scene: strangler-fig
steps:
  - title: "A facade first"
    text: "Put a router in front of the old system. On day one it changes nothing: every route still points at legacy. What changed is that you can now move routes one at a time."
  - title: "Move one capability"
    text: "Rebuild customers in the new system, flip its route, leave everything else alone. Where the new code still needs old data, an anti-corruption layer translates instead of leaking the legacy model."
  - title: "Flip gradually"
    text: "Send a tenth of the orders traffic to the new code, then half, then all. A failure means flipping the route back, not rolling back a deployment."
  - title: "Until nothing is left"
    text: "Reports moves last, the data with it, and the old system is retired behind a router whose rows all say new. Finish the migration; a half-strangled system is the worst of both."
related:
  - label: Anti-Corruption Layer
    slug: anti-corruption-layer
  - label: Facade
    slug: facade
  - label: Adapter
    slug: adapter
  - label: Reverse Proxy
    slug: reverse-proxy
  - label: YARP
    slug: yarp
  - label: API Gateway
    slug: api-gateway
  - label: Canary Release
    slug: canary-release
  - label: Modular Monolith
    slug: modular-monolith
  - label: Database per Service
    slug: database-per-service
  - label: Bounded Context
    slug: bounded-context
references:
  - title: Strangler Fig pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/strangler-fig
  - title: Anti-Corruption Layer pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/anti-corruption-layer
  - title: YARP configuration files
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/yarp/config-files
---

## When to use

- Replacing a system that is too large or too risky to rewrite in one step.
- Capabilities can be separated behind routes, and each one has a clear data owner after the move.
- You need the ability to roll a capability back without redeploying the old system.

## Cautions

- Decide data ownership per capability before moving it; the anti-corruption layer is a translation, not a shared database.
- Each flipped route needs observability on both sides until the old path is retired.
- Do not let the facade become the new monolith: it routes, it does not contain logic.
- Finish. A migration that stalls half-way doubles the operational surface for good.

## In .NET

A YARP facade moves one capability at a time by pointing its route at a different cluster. `customers` has already moved, `orders` is being served to a canary slice, and `reports` has not moved at all.

```json
{
  "ReverseProxy": {
    "Routes": {
      "customers": { "ClusterId": "new",    "Match": { "Path": "/customers/{**rest}" } },
      "orders-canary": {
        "ClusterId": "new", "Order": 0,
        "Match": { "Path": "/orders/{**rest}", "Headers": [ { "Name": "X-Canary", "Values": [ "1" ] } ] }
      },
      "orders":    { "ClusterId": "legacy", "Order": 1, "Match": { "Path": "/orders/{**rest}" } },
      "reports":   { "ClusterId": "legacy", "Match": { "Path": "/reports/{**rest}" } }
    },
    "Clusters": {
      "legacy": { "Destinations": { "d1": { "Address": "https://legacy.internal/" } } },
      "new":    { "Destinations": { "d1": { "Address": "https://shop-new.internal/" } } }
    }
  }
}
```

```csharp
builder.Services.AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"));
var app = builder.Build();
app.MapReverseProxy();
```

Because a route is configuration, moving one back is a configuration change: no redeploy of the old system, no revert commit, no window where both versions are half-live. A share of traffic rather than a header match is the same idea one step further on, and comes from either a match on a header or cookie that a small slice of clients carries, or a custom load balancing policy over a cluster that holds both destinations.
