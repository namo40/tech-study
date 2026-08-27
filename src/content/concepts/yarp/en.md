---
title: "YARP"
summary: "YARP is a reverse proxy you host inside an ASP.NET Core application, so the front door in the scene becomes a routes-and-clusters configuration file plus two lines of startup, and everything else stays the middleware pipeline you already write."
category: "Edge, routing and service networking"
scene: reverse-proxy
sceneStep: 1
related:
  - label: Reverse Proxy
    slug: reverse-proxy
  - label: API Gateway
    slug: api-gateway
  - label: Load Balancer
    slug: load-balancer
  - label: Health-Based Routing
    slug: health-based-routing
  - label: Least Connections
    slug: least-connections
  - label: Round Robin
    slug: round-robin
  - label: Sticky Session
    slug: sticky-session
  - label: Strangler Fig
    slug: strangler-fig
  - label: Facade
    slug: facade
  - label: CORS
    slug: cors
references:
  - title: "YARP: Getting started"
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/yarp/getting-started?view=aspnetcore-10.0
  - title: Configure ASP.NET Core to work with proxy servers and load balancers
    url: https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/proxy-load-balancer?view=aspnetcore-10.0
  - title: "X-Forwarded-For"
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Forwarded-For
---

The first step of the scene is a card with two rows on it, and YARP is that card made real. You add `AddReverseProxy().LoadFromConfig(...)` to the service collection, `MapReverseProxy()` to the pipeline, and hand it a section of configuration holding two dictionaries. Routes say what an incoming request has to look like and which cluster answers it. Clusters say which addresses are behind that name and how to choose between them. There is no third concept, and once you have seen the pair, the whole scene reads as one configuration file.

What makes it different from the proxies it replaces is where it runs. Nginx and HAProxy are separate processes with their own configuration languages, their own reload semantics and their own idea of what a request is. YARP is a NuGet package inside an application you already own, which means the front door is built with the same tools as everything behind it. Authentication runs as ASP.NET Core authentication, `RequireAuthorization` on a route means what it means everywhere else, your logging provider and your telemetry are already wired up, and a rule too specific to express in configuration is just a `RequestTransform` you write in C#. The proxy stops being a piece of infrastructure somebody else configures and becomes part of the codebase.

The price of that is the price of any in-process proxy: it is a .NET application, so it has a startup time, a garbage collector and a memory footprint, and it is doing work on the hot path of every single request in your system. That is a fine trade when the routing is interesting and the traffic is ordinary, and a poor one when the routing is trivial and the traffic is enormous. If all you need is "terminate TLS and send everything to one place", something written in C is going to do it with less machinery. YARP earns its place when the decisions at the door are the kind you would otherwise be writing code for anyway.

Configuration can come from anywhere `IConfiguration` comes from, and that turns out to matter more than it sounds. `LoadFromConfig` binds to a section, so a change to `appsettings.json` or to whatever provider is behind it is picked up without a restart: existing connections drain, new requests use the new table. That makes the strangler-style migration in the fourth step practical rather than theoretical, because moving one path from the old cluster to the new one is a configuration change rather than a deployment. When the table has to come from a database or a control plane instead, `LoadFromMemory` and the `IProxyConfigProvider` interface let you supply it yourself, with the same reload contract.

The destination health in the third step of the scene is a cluster setting rather than something you write. Active health checks give YARP a path to call and an interval to call it on, and a destination that fails leaves the set until it passes again; passive checks watch the real traffic instead and take a destination out when enough of its responses fail. Active checks cost you a request per destination per interval and tell you about a failure before a user finds it. Passive checks cost nothing and only notice after somebody has already had a bad time. Most systems want active checks with an interval short enough that the window in the scene stays small, which is the same argument as everywhere else: the interval is not free and neither is the delay.

One habit is worth forming early, and it is the one thing the scene cannot show you. A proxy makes its own request to the backend, so everything the backend used to learn from the connection is now about the proxy: the remote address, the scheme, the port. YARP forwards the originals in `X-Forwarded-*` headers, but the backend has to be told to believe them, and told which proxies are allowed to say so. That is `UseForwardedHeaders` with a configured `KnownNetworks` or `KnownProxies`, placed before authentication and before anything that redirects. Skip it and the symptoms are strange rather than obvious: every client appears to come from one address, rate limits fire against the proxy instead of the caller, and HTTPS redirection loops forever because the service is sure the request arrived over plain HTTP.
