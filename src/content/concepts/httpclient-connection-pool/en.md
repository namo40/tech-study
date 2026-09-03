---
title: "HttpClient Connection Pool"
summary: "The connections an HttpClient reuses live in its handler, not in the client: SocketsHttpHandler keeps a pool per endpoint and lends connections out. Getting the pool right is mostly two decisions, how long a pooled connection may live and how many there may be, plus the rule that the handler is the thing you are supposed to share."
category: "Edge, routing and service networking"
tags: ["latency"]
scene: multiplexing
sceneStep: 1
related:
  - label: Multiplexing
    slug: multiplexing
  - label: Keep-Alive
    slug: keep-alive
  - label: HTTP/2
    slug: http-2
  - label: Connection Lifetime
    slug: connection-lifetime
  - label: Database Connection Pool
    slug: database-connection-pool
  - label: Idle Timeout
    slug: idle-timeout
references:
  - title: "HttpClient guidelines for .NET"
    url: https://learn.microsoft.com/en-us/dotnet/fundamentals/networking/http/httpclient-guidelines
---

The scene's first step is a connection that survives between requests. On the .NET side the thing that owns those surviving connections is not `HttpClient` but the handler underneath it, and since .NET Core 2.1 that handler is `SocketsHttpHandler`. It keeps a pool of established connections and lends one to each request, opening a new one only when nothing is free. The pool is partitioned per endpoint, where an endpoint is the scheme, host and port taken together, along with the proxy, the credentials and the client certificate in use, so `https://a.example` and `https://b.example` never share a connection and neither do two clients configured with different certificates. This is why the shape of the object graph matters more than any setting on it: an `HttpClient` is a thin wrapper over a handler, so constructing and disposing one per call throws away the pool every time and leaves sockets stacked up in `TIME_WAIT` while the next call handshakes from scratch. One client for the life of the process, or `IHttpClientFactory` doing that bookkeeping for you, is what keeps a pool in existence at all.

```csharp
var handler = new SocketsHttpHandler
{
    PooledConnectionLifetime = TimeSpan.FromMinutes(2),
    PooledConnectionIdleTimeout = TimeSpan.FromMinutes(1),
    MaxConnectionsPerServer = 50,
};
var client = new HttpClient(handler) { BaseAddress = new Uri("https://api.example") };
```

`PooledConnectionLifetime` is the setting worth understanding, because its purpose is not health and not resource use. A connection is a TCP session to one IP address, chosen when it was opened, and it keeps talking to that address for as long as it exists no matter what DNS says afterwards. Move a service behind a new address, scale it out, or fail it over, and a long-lived pooled connection carries on addressing yesterday's topology; the client is not ignoring DNS, it simply has no reason to resolve a name it is not looking up. Retiring connections on a schedule is what forces the lookup to happen again, and the connections that replace them land wherever routing sends traffic today. This is exactly the argument the database pool's connection lifetime makes about server nodes, one layer down and with the same conclusion, that the value is a rebalancing interval rather than a timeout. The default is infinite, so on a raw handler this is an opt-in; `IHttpClientFactory` addresses the same problem from the other end by rotating whole handlers on a two-minute schedule, and the two mechanisms overlap, so the current guidance is to set a pooled connection lifetime and leave the handler lifetime alone rather than to tune both.

`PooledConnectionIdleTimeout` is the other half, and it decides how long an unused connection stays in the pool before being closed, which is the same disuse-based reclamation a database pool applies to its own connections. It is also the setting standing closest to the keep-alive race, since the shorter it is relative to the idle cutoffs on the network path, the more often it is the client that retires a connection rather than the client that discovers one has been retired underneath it. `MaxConnectionsPerServer` is a ceiling rather than a target, unbounded by default, and it is the knob that turns an unbounded fan-out into a queue you can reason about.

How the factory arranges all of this is the part that most often surprises people. A named or typed client does not own its handler: the factory keeps one handler chain per name and hands it to every client created under that name, which is why registering a typed client as transient is harmless while its connections are still shared and pooled behind it. It also means handler configuration is per name, so two typed clients pointing at the same host under different names get different handlers and therefore different pools. HTTP/2 then changes what the pool is even counting, because one connection carries many concurrent streams and the per-server connection count stops being the concurrency limit it is on HTTP/1.1; the HTTP/2 page covers the handler switch that permits more than one such connection. The protocol-level story of why connections persist at all, and what happens when the far end closes one first, belongs to keep-alive.
