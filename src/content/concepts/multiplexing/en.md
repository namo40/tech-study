---
title: "Multiplexing"
summary: "Multiplexing lets many streams share one connection at the same time: requests no longer queue behind each other, a slow response blocks only itself, and the order answers arrive in stops being the order they were asked in."
category: "Edge, routing and service networking"
tags: ["latency"]
level: 6
scene: multiplexing
steps:
  - title: "One connection, one question at a time"
    text: "Keep-alive means the connection survives between requests — but on it, requests still take turns. A finishes, then B may ask, then C. Three quick answers, and still the total is the sum of the line."
  - title: "The head of the line blocks everyone in it"
    text: "A turns out to be slow — and B and C, ready and cheap, wait anyway, because the lane belongs to whoever is at the front. One slow answer becomes everyone's latency. That is head-of-line blocking."
  - title: "Pipelining freed the questions, not the answers"
    text: "Requests may now leave back to back — but responses must return in order. B and C are done and sit waiting behind slow A's reply. The blocking did not disappear; it moved to the other side of the wire."
  - title: "Streams untie arrival from asking"
    text: "On HTTP/2 the three requests share the connection at once, each in its own stream. Slow A now blocks only A: B lands first, C follows, A comes when it comes. Same wire, same server — the queue itself is what disappeared."
related:
  - label: Head-of-Line Blocking
    slug: head-of-line-blocking
  - label: Pipelining
    slug: pipelining
  - label: Keep-Alive
    slug: keep-alive
  - label: HttpClient Connection Pool
    slug: httpclient-connection-pool
  - label: HTTP/2
    slug: http-2
  - label: gRPC
    slug: grpc
  - label: Streaming
    slug: streaming
  - label: Tail Latency
    slug: tail-latency
  - label: Request Timeout
    slug: request-timeout
references:
  - title: "Evolution of HTTP"
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Evolution_of_HTTP
  - title: "Use HTTP/2 with the ASP.NET Core Kestrel web server"
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/kestrel/http2?view=aspnetcore-10.0
  - title: "RFC 9113: HTTP/2"
    url: https://www.rfc-editor.org/rfc/rfc9113.html
---

## When to use

Multiplexing is not a feature you switch on so much as a property of the protocol you are already speaking. The useful question is whether the calls you make are shaped like the calls it helps, and whether anything in your stack is quietly taking it away from you.

- Read this when p95 climbs under fan-out and p50 does not move. That shape — a median that looks fine and a tail that does not — is what a queue in front of a shared resource produces. If the client is on HTTP/1.1 and something has pinned the path to one connection — a browser at its per-origin limit, an `HttpClient` with `MaxConnectionsPerServer` set low, a proxy hop that will only hold one — then the eighth of eight small calls to the same host is waiting for the first seven whether or not the server is busy.
- Look at it when one screen needs many small pieces. A dashboard assembling twelve widgets, a detail page pulling its related entities, a service composing an answer from four upstreams: all of them are the same three-requests-one-wire picture with a bigger number. Multiplexing turns that from a sum into a maximum.
- Take it seriously for service-to-service calls, because the shim they have is paid for in sockets. A browser hid the HTTP/1.1 problem for years by opening six connections per origin, which is parallelism bought with connections rather than won inside one. Your `HttpClient` buys it the same way and with no ceiling at all, since `MaxConnectionsPerServer` is unbounded by default, so a fan-out of eight opens eight connections and the cost arrives as handshakes and sockets in `TIME_WAIT` rather than as a queue. Set that ceiling, and the queue is back.
- Reach for it when one long-lived response would otherwise occupy the wire. A streaming endpoint, a server-sent event feed, a long poll: on HTTP/1.1 each of these owns a connection for its whole life, so they consume the very thing everything else needs. On HTTP/2 they are one stream among many.
- Assume it when gRPC is on the table. gRPC is HTTP/2 by definition, and its whole calling model — many concurrent calls on one channel, bidirectional streams that stay open — is built on the assumption that the transport multiplexes. A single `GrpcChannel` shared across a service is the intended shape, not a shortcut.
- Do not reach for it to fix a slow server. Multiplexing removes the waiting a request does for other requests. It does nothing at all about the time a request spends being answered, so if the slow call in the scene took a second because the query behind it takes a second, every step of the scene still ends no earlier than that second.

## Cautions

- HTTP-level head-of-line blocking is gone; TCP-level head-of-line blocking is not. All those streams ride one TCP connection, and TCP delivers bytes in order. Lose one packet and every stream stalls until it is retransmitted, because the bytes behind it cannot be handed up. On a clean network this is invisible; on a lossy mobile link it can make HTTP/2 slower than several HTTP/1.1 connections would have been. That single fact is the reason HTTP/3 exists and runs over QUIC instead.
- One connection means one congestion window. Every stream is competing for the same bandwidth allowance, so a few very large responses can starve the small ones sharing the wire with them, and a connection that has just been opened is slow for all of its streams at once. Prioritisation exists in the protocol to address this, and support for it in the wild is uneven enough that it is not something to plan around.
- Concurrency on a connection is capped, and the cap is the server's to set. `SETTINGS_MAX_CONCURRENT_STREAMS` is a number the peer advertises; once it is reached, further requests queue on the client exactly as they would have under HTTP/1.1. The default in Kestrel is 100, which is generous for a page and small for a service fanning out hard, and it is worth knowing the value rather than assuming it is unlimited.
- Pipelining is not an option to enable. It is in the scene because it is the instructive failure: it freed the requests and left the responses ordered, which moved the blocking rather than removing it, and it broke badly enough in the presence of intermediaries that clients disabled it and never came back. If you find yourself reasoning about whether to turn it on, the answer is no, and the thing you actually want is HTTP/2.
- Check what is between you and the server. A load balancer, a reverse proxy or a service mesh sidecar terminating HTTP/2 and speaking HTTP/1.1 onward gives you multiplexing to the edge and a queue after it. That is not necessarily wrong — the hop behind the edge is often short and the connection pool there is large — but it is worth knowing where the property stops rather than assuming it reaches the origin.
- Fewer connections change your failure and balancing behaviour. One connection carrying everything means one connection whose loss takes everything with it, and layer-4 load balancers distribute connections rather than requests, so a long-lived multiplexed connection pins all of its traffic to whichever backend it landed on. Both are usually acceptable, and both are surprises if nobody said them out loud.

## In .NET

- `SocketsHttpHandler` is where the client-side behaviour lives. Set the version and the policy on the request or the client, and remember that `HttpVersion.Version20` on its own is a preference that will fall back, because the default policy is `RequestVersionOrLower`. `RequestVersionOrHigher`, used below, refuses to drop below HTTP/2 but lets the handler take HTTP/3 if the server advertises it; `RequestVersionExact` pins HTTP/2 and nothing else. Either one makes a failure to negotiate an error rather than a silent downgrade to a queue.

```csharp
var handler = new SocketsHttpHandler
{
    EnableMultipleHttp2Connections = true,
    PooledConnectionLifetime = TimeSpan.FromMinutes(2),
};

var client = new HttpClient(handler)
{
    DefaultRequestVersion = HttpVersion.Version20,
    DefaultVersionPolicy = HttpVersionPolicy.RequestVersionOrHigher,
};
```

- `EnableMultipleHttp2Connections` is the setting to know about. Without it, one `HttpClient` uses exactly one HTTP/2 connection per endpoint, and when that connection hits the peer's stream limit, requests wait. With it, the handler opens another connection instead of queueing. Turn it on for any client that fans out.
- Share the `HttpClient`, and let `IHttpClientFactory` own the handler. The multiplexing is a property of the connection inside the handler, so a client constructed per call gets none of it, and the socket exhaustion story that made factories the recommendation is the same story from the other side.
- On the server, Kestrel decides what it will accept. `Http1AndHttp2` is the default so that HTTP/1.1 clients keep working; the stream limit is per connection and applies to every client equally.

```csharp
builder.WebHost.ConfigureKestrel(options =>
{
    options.ConfigureEndpointDefaults(endpoint =>
    {
        endpoint.Protocols = HttpProtocols.Http1AndHttp2;
    });
    options.Limits.Http2.MaxStreamsPerConnection = 200;
});
```

- Over cleartext, negotiation has no handshake to do it for you. HTTP/2 is usually agreed during the TLS handshake through ALPN, so a plain `http://` endpoint has to be told which protocol it speaks — `HttpProtocols.Http2` on that endpoint on the server, and `HttpVersionPolicy.RequestVersionExact` on the client — which is exactly the case a gRPC service inside a cluster tends to be in.
- For gRPC, create one `GrpcChannel` per address and keep it. The channel holds the connection, all calls on it are streams, and the concurrency limit that matters is the server's `MaxStreamsPerConnection` rather than anything in your calling code. If a load test plateaus at a suspiciously round number of concurrent calls, that setting is the first place to look.
