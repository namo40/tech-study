---
title: "Reverse Proxy"
summary: "A reverse proxy is the one public front door for many private services: it accepts every request on the clients' behalf, does the boundary work — TLS, routing, forwarded headers, health — and passes the rest inside."
category: "Edge, routing and service networking"
scene: reverse-proxy
steps:
  - title: "One address, many services"
    text: "Every client talks to the same front door. The proxy reads the path, forwards `/app` here and `/api` there, and hands the answer back. The backends keep private addresses no client ever sees."
  - title: "The edge does the boundary work"
    text: "TLS ends at the proxy: encrypted outside, plain inside. And because the backend now sees the proxy as its caller, the original client rides along in `X-Forwarded-For` — a header to trust only when your own proxy wrote it."
  - title: "Failure stays behind the door"
    text: "The proxy keeps probing its backends. When an instance goes down, the next request flows to the healthy one without a client noticing; when it comes back, it quietly rejoins. The edge is where failure gets absorbed."
  - title: "Give the seat product duties and it becomes a gateway"
    text: "Same position, more jobs: reject the request with no token, trim the burst over the limit, add a third route to the same front door. An API gateway is a reverse proxy that has taken on product concerns."
related:
  - label: Load Balancer
    slug: load-balancer
  - label: Round Robin
    slug: round-robin
  - label: Least Connections
    slug: least-connections
  - label: Layer 7 Load Balancing
    slug: layer-7-load-balancing
  - label: Health-Based Routing
    slug: health-based-routing
  - label: Sticky Session
    slug: sticky-session
  - label: Strangler Fig
    slug: strangler-fig
  - label: Facade
    slug: facade
  - label: CORS
    slug: cors
  - label: YARP
    slug: yarp
  - label: API Gateway
    slug: api-gateway
references:
  - title: "YARP: Getting started"
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/yarp/getting-started?view=aspnetcore-10.0
  - title: Configure ASP.NET Core to work with proxy servers and load balancers
    url: https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/proxy-load-balancer?view=aspnetcore-10.0
  - title: "X-Forwarded-For"
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Forwarded-For
---

## When to use

- Several services need to look like one site. Clients get one hostname and one certificate, and the path decides which service answers. Nobody has to know that `/app` and `/api` are different processes on different machines.
- Certificates and TLS belong in one place. Renewing them, choosing the cipher suites, turning HTTP/2 on: doing that once at the edge is far less work than doing it in every service, and far less likely to be done wrong in one of them.
- The topology should stay private. Backends listen on addresses no client can route to, which removes a whole class of mistakes — an internal admin endpoint that was never meant to be public simply cannot be reached.
- One instance of a service must be able to fail without the caller seeing it. The proxy probes its backends and stops sending work to the ones that stopped answering, so a deployment, a crash or a restart is absorbed at the edge.
- A migration needs somewhere to make the old-or-new decision. Strangler-style rewrites work because the proxy can send one path to the new service while everything else still goes to the old one, and can move the line one path at a time.
- Cross-cutting concerns want one home. Compression, request logging, correlation identifiers, redirects from HTTP to HTTPS: all of them are cheaper as one rule at the front than as a library every service has to keep up to date.

## Cautions

- Forwarded headers are input, not fact. `X-Forwarded-For` and `X-Forwarded-Proto` are written by whoever sent the request unless something strips them, so a client can claim any address it likes. Configure `ForwardedHeaders` with the proxies and networks you actually trust, and treat the values as untrusted anywhere else.
- The number of hops matters as much as the trust. If two proxies sit in front of your service, the header holds two addresses and `ForwardLimit` decides how far back it reads. Get that wrong and rate limiting, geolocation and audit logs all record the wrong client.
- Timeouts and retries exist at both layers and multiply. A proxy that waits 30 seconds in front of a service that waits 30 seconds gives a client a minute of silence; a proxy that retries twice in front of a service that retries twice can turn one request into nine. Set the outer budget below the inner one, and retry in one place.
- The proxy is itself a single point. Everything behind it can be redundant and it will not matter if there is one of it. Run at least two, put something in front that can fail over between them, and remember that its configuration reload is now a production-critical path.
- Buffering is a decision, not a default. Proxies that buffer request and response bodies protect slow backends but break streaming: server-sent events arrive in one lump at the end, large uploads sit in memory, and gRPC streams do not work at all. Know which endpoints need to pass through untouched.
- WebSockets, gRPC and long polling need explicit thought. They are connections rather than request-response pairs, so idle timeouts, upgrade headers and connection draining during a deploy all behave differently from the ordinary case.
- Routing rules are code that lives outside your code. A path prefix that two services both claim, a rule that matches before the more specific one, a trailing slash that changes the match: all of these are bugs, and none of them will show up in the tests of either service.

## In .NET

YARP is a reverse proxy you host inside an ASP.NET Core application, which means the routing table is configuration and everything else is the middleware pipeline you already know.

```csharp
var builder = WebApplication.CreateBuilder(args);

builder.Services
    .AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"));

var app = builder.Build();

app.MapReverseProxy();
app.Run();
```

The configuration is two lists that reference each other: routes match an incoming request and name a cluster, and a cluster is the set of addresses that can answer it.

```json
{
  "ReverseProxy": {
    "Routes": {
      "app": {
        "ClusterId": "app",
        "Match": { "Path": "/app/{**catch-all}" }
      },
      "api": {
        "ClusterId": "api",
        "Match": { "Path": "/api/{**catch-all}" }
      }
    },
    "Clusters": {
      "app": {
        "LoadBalancingPolicy": "PowerOfTwoChoices",
        "HealthCheck": {
          "Active": {
            "Enabled": true,
            "Interval": "00:00:05",
            "Policy": "ConsecutiveFailures",
            "Path": "/healthz"
          }
        },
        "Destinations": {
          "a1": { "Address": "http://10.0.1.11:8080/" },
          "a2": { "Address": "http://10.0.1.12:8080/" }
        }
      },
      "api": {
        "Destinations": {
          "api1": { "Address": "http://10.0.2.11:8080/" }
        }
      }
    }
  }
}
```

That is the third step of the scene written down. The active health check is the probe: when `a1` stops answering `/healthz` it leaves the destination set, new requests go to `a2`, and when it starts answering again it comes back. Nothing in the client's request changes, which is exactly the point — the interval is how long the proxy can keep sending work to something that has already died, so it is the number to argue about rather than the mechanism.

On the backend side there is one thing you must do, and it is the piece that is most often skipped. Once a proxy is in front of you, `HttpContext.Connection.RemoteIpAddress` is the proxy, and `Request.Scheme` is `http` even though the client used HTTPS. `UseForwardedHeaders` puts the real values back, and it must be told what to trust.

```csharp
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;

    // The defaults trust only loopback. Say which proxies are yours.
    options.KnownProxies.Clear();
    options.KnownNetworks.Clear();
    options.KnownNetworks.Add(new IPNetwork(IPAddress.Parse("10.0.0.0"), 8));

    // Two hops in front means two addresses in the header.
    options.ForwardLimit = 2;
});

var app = builder.Build();

// Before anything that reads the scheme or the client address.
app.UseForwardedHeaders();
app.UseAuthentication();
```

The ordering is not decoration. Authentication, rate limiting, redirect-to-HTTPS and request logging all read the values `UseForwardedHeaders` writes, so it goes first, before any of them. If it runs late, you get a redirect loop: the service sees `http`, redirects to `https`, and the proxy sends the same request back in as `http` again.

When you need a rule that configuration cannot express, YARP gives you a transform, which is the same pipeline idea applied to the request the proxy makes on your behalf. The callback below runs for every route; when the rule belongs to one of them, check `context.Route` inside it or put a `Transforms` entry on that route in configuration instead.

```csharp
builder.Services
    .AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"))
    .AddTransforms(context =>
    {
        // The seat knows which cluster answered; the client should not.
        context.AddResponseHeaderRemove("Server");
        context.AddRequestTransform(transform =>
        {
            transform.ProxyRequest.Headers.Remove("X-Internal-Token");
            return ValueTask.CompletedTask;
        });
    });
```

The last step of the scene is what happens when you keep going: `.RequireAuthorization()` on the routes, `AddRateLimiter` in front of `MapReverseProxy`, an endpoint that fans out to two clusters and joins the answers. None of that changes what the seat is. It is still one address in front of many services, and the reason to be careful about adding to it is that every rule you put there is a rule that no service can see, test or reason about on its own.
