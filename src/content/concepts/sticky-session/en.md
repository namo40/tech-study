---
title: "Sticky Session"
summary: "A sticky session pins each user to the instance that holds their in-memory state, which makes a stateful app scale at the price of uneven load and a session that dies with its instance. Moving the session to a shared store removes the need for it."
category: "Server state management"
level: 5
scene: sticky-session
steps:
  - title: "Round robin, in-memory session"
    text: "A logs in on instance 1, and her next request lands on instance 2, which has never seen her: logged out, because this app keeps its sign-in state in the session. B logs in on instance 3, and her next lands on instance 1: logged out again."
  - title: "Sticky"
    text: "The load balancer sets a cookie and sends every request from A back to instance 1. It works. It also means one busy user can pile up on one instance while another sits idle."
  - title: "The instance goes, the session goes"
    text: "A deploy restarts instance 1. A's cookie still points there, the state is gone, and she logs in again on whichever instance the rotation offers. Every rollout logs someone out."
  - title: "Externalise the session"
    text: "Keep it in a shared store and any instance can serve any user. Deploys stop logging people out, the load spreads, and stickiness becomes an optional cache optimisation."
related:
  - label: Session State
    slug: session-state
  - label: Distributed Session
    slug: distributed-session
  - label: Stateless Server
    slug: stateless-server
  - label: Stateful Server
    slug: stateful-server
  - label: Load Balancer
    slug: load-balancer
  - label: Round Robin
    slug: round-robin
  - label: Redis
    slug: redis
  - label: ASP.NET Core Data Protection
    slug: aspnet-core-data-protection
  - label: Rolling Update
    slug: rolling-update
references:
  - title: Session and state management in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/app-state?view=aspnetcore-10.0
  - title: Configure ASP.NET Core Data Protection
    url: https://learn.microsoft.com/en-us/aspnet/core/security/data-protection/configuration/overview?view=aspnetcore-10.0
  - title: YARP session affinity
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/yarp/session-affinity
---

## When to use

- As a bridge. An existing application keeps its state in memory, it has to run on more than one instance today, and rewriting it is not this week's work.
- As an optimisation. A user's hot data is cached per instance, routing them back to it saves rebuilding that cache, and correctness never depends on where they land.

## Cautions

- Stickiness is not durability. Scale-in, deploys, and crashes drop every session pinned to that instance, and for an app that keeps its sign-in state in the session the user sees a logout rather than an error. In ASP.NET Core, where identity rides in the authentication cookie instead, the same symptom usually means the key ring below is not shared.
- Load skews toward the instances that happen to hold busy users. Autoscaling adds capacity that routing has already decided not to use.
- In ASP.NET Core, moving session state is not enough. The Data Protection key ring has to be shared as well, or an authentication cookie issued by one instance is rejected by the next.
- For game rooms and real-time collaboration, where the state and the computation belong together, prefer an explicit stateful partition model over forcing either stickiness or statelessness onto the problem.

## In .NET

```csharp
var redis = ConnectionMultiplexer.Connect(builder.Configuration["Redis"]!);

// Session state lives in Redis, so any instance can read it. One multiplexer
// shared with the key ring below, rather than a second connection per instance.
builder.Services.AddStackExchangeRedisCache(options =>
    options.ConnectionMultiplexerFactory = () => Task.FromResult<IConnectionMultiplexer>(redis));
builder.Services.AddSession(options =>
{
    options.IdleTimeout = TimeSpan.FromMinutes(20);
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Lax;
});

// The key ring must be shared as well, or cookies signed on one
// instance are unreadable on the next.
builder.Services.AddDataProtection()
    .PersistKeysToStackExchangeRedis(redis, "shop:data-protection-keys")
    .SetApplicationName("shop");

var app = builder.Build();
app.UseSession();
```

Leave the session affinity option on YARP or on a cloud load balancer switched on if it earns its keep, but keep it there for cache hits rather than for correctness. Once the session is in a shared store, a request that lands on the wrong instance costs one round trip and nothing else.
