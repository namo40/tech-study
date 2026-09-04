---
title: "HTTP/2"
summary: "HTTP/2 keeps HTTP's semantics and replaces its wire format: text lines become binary frames, headers become a compressed table, and one connection carries many independent streams at once instead of one request at a time."
category: "Edge, routing and service networking"
tags: ["latency"]
related:
  - label: Multiplexing
    slug: multiplexing
  - label: Head-of-Line Blocking
    slug: head-of-line-blocking
  - label: Pipelining
    slug: pipelining
  - label: Keep-Alive
    slug: keep-alive
  - label: Streaming
    slug: streaming
  - label: gRPC
    slug: grpc
  - label: Reverse Proxy
    slug: reverse-proxy
references:
  - title: "RFC 9113: HTTP/2"
    url: https://www.rfc-editor.org/rfc/rfc9113.html
  - title: Use HTTP/2 with the ASP.NET Core Kestrel web server
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/kestrel/http2?view=aspnetcore-10.0
---

## When to use

- Take it wherever a client makes many concurrent calls to one origin. Each call becomes a stream with its own identifier, and frames from different streams interleave on the same connection, so the six-connections-per-origin limit browsers imposed and the client-side queue behind it both stop existing. The multiplexing page is where that property is explained; this page is the protocol that provides it.
- Assume it if gRPC is anywhere in the design. gRPC is defined over HTTP/2 rather than merely happening to use it: its four call shapes are streams, its metadata is HTTP/2 headers, and its trailers depend on the frame layout. A hop that downgrades to HTTP/1.1 does not slow gRPC down, it breaks it.
- Reach for it when the traffic is many small requests with large headers. HPACK compresses header fields against a static table of common names and a dynamic table that both peers maintain, so the tenth request carrying the same bearer token, the same `user-agent` and the same ten custom headers sends indices rather than kilobytes. On an API where the headers are bigger than the bodies, that is most of the bytes.
- Use it to collapse the connection count behind a reverse proxy. A proxy terminating a thousand client connections can carry their requests to each backend over a handful of HTTP/2 connections, which turns the backend's accept path, socket table and TLS handshake budget into a much smaller number than the fan-in in front of it.

## Cautions

- The blocking moved down a layer rather than disappearing. All streams ride one TCP connection, TCP delivers bytes in order, and a single lost segment stalls every stream until it is retransmitted. On a clean datacentre link this is invisible; on a lossy mobile network it can make HTTP/2 slower than several HTTP/1.1 connections were. That fact is precisely why HTTP/3 exists and runs over QUIC, and the head-of-line blocking page walks through it.
- In practice HTTP/2 means TLS, because negotiation happens in the handshake. ALPN advertises `h2` during the TLS `ClientHello` and the server picks it, which costs no extra round trip. Cleartext `h2c` exists in the specification and no major browser implements it, and RFC 9113 deprecated the `Upgrade`-based path to it, so a plain `http://` endpoint has to be configured on both ends to speak HTTP/2 with no negotiation at all.
- Server push is a dead feature; do not build on it. It was in the original specification, it never reliably beat the cache it kept fighting with, browsers removed support, and Kestrel never implemented it. Early hints on a `103` response are the surviving answer to the problem push was aimed at.
- Flow control is two windows, not one, and both default low. Every stream has a window and the connection has its own, each starting at 65,535 bytes (just under 64 KiB) per the specification, and a sender stops when either is exhausted until the peer sends `WINDOW_UPDATE`. Large uploads and long-lived server streams are the traffic that notices, and the fix is to raise the windows deliberately rather than to discover the ceiling under load.

## In .NET

- Kestrel's default endpoint protocol is `Http1AndHttp2`, so a TLS endpoint already negotiates HTTP/2 with any client that asks for it through ALPN and keeps serving HTTP/1.1 to those that do not. The interesting configuration is the cleartext case and the limits, not turning the protocol on.
- On the client, the version is a preference until you make it a requirement.

```csharp
var handler = new SocketsHttpHandler
{
    // Without this, one client holds one HTTP/2 connection per endpoint and
    // queues once the peer's stream limit is reached.
    EnableMultipleHttp2Connections = true,
};

var client = new HttpClient(handler)
{
    DefaultRequestVersion = HttpVersion.Version20,
    // The default, RequestVersionOrLower, silently falls back to HTTP/1.1;
    // RequestVersionExact (or RequestVersionOrHigher) turns a failed negotiation
    // into an exception instead of a quiet downgrade.
    DefaultVersionPolicy = HttpVersionPolicy.RequestVersionExact,
};
```

- The limits worth knowing live on `options.Limits.Http2`. `MaxStreamsPerConnection` defaults to 100 and is the number a fan-out client will hit first, `InitialConnectionWindowSize` and `InitialStreamWindowSize` default to 1 MiB and 768 KiB, and `HeaderTableSize` bounds the HPACK dynamic table the server will keep per connection.
- For a gRPC service inside a cluster with TLS terminated at the edge, set `HttpProtocols.Http2` explicitly on the cleartext endpoint. There is no ALPN to agree the protocol there, so the endpoint has to be told, and a client talking to it needs `RequestVersionExact` for the same reason.
