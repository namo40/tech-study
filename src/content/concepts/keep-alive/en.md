---
title: "Keep-Alive"
summary: "Keep-alive is the agreement that a connection outlives the request that opened it, so the next request skips the handshake. It is default behaviour in HTTP/1.1, and almost everything interesting about it is the idle lifetime: how long each end keeps a quiet connection, and what happens when they disagree."
category: "Edge, routing and service networking"
tags: ["latency"]
scene: multiplexing
sceneStep: 1
related:
  - label: Multiplexing
    slug: multiplexing
  - label: HTTP/2
    slug: http-2
  - label: Pipelining
    slug: pipelining
  - label: HttpClient Connection Pool
    slug: httpclient-connection-pool
  - label: Idle Timeout
    slug: idle-timeout
  - label: Reverse Proxy
    slug: reverse-proxy
references:
  - title: "RFC 9112: HTTP/1.1"
    url: https://www.rfc-editor.org/rfc/rfc9112.html
  - title: "Use HTTP/2 with the ASP.NET Core Kestrel web server"
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/kestrel/http2?view=aspnetcore-10.0
---

The scene's first step opens by saying the connection survives between requests, and keep-alive is the name of that survival. Without it every request is its own TCP connection: a three-way handshake, a TLS negotiation on top of it, and a teardown afterwards, all paid again for the next request to the same host. Keep-alive is the agreement to leave the socket open instead, so requests two through two hundred start with the connection already established and warm. In HTTP/1.0 this had to be asked for with a `Connection: keep-alive` header; in HTTP/1.1 persistence is the default and the only thing worth sending is the opt-out, `Connection: close`. The step is careful about what this does not buy, and so is the protocol: a persistent connection is still one lane, requests on it still take turns, and keep-alive removes the setup cost without removing the queue.

What is left to decide, then, is how long a quiet connection is worth keeping, and that is where the real behaviour lives. Every participant has its own idle timer. Kestrel has a keep-alive timeout that defaults to two minutes, a reverse proxy has one of its own, a cloud load balancer has one set by its own defaults, and a NAT device in between has a flow table entry that ages out on a schedule nobody published. None of these are negotiated. Each end simply decides that a connection has been quiet long enough and closes it, and a server may also cap the number of requests or the total duration it allows on one connection. The client is not consulted and, in the HTTP/1.1 case, not warned: the close arrives as a TCP FIN whenever the other side gets around to it.

That is the setup for the failure everybody eventually meets. A client picks an idle connection out of its pool and writes a request onto it at the same moment the far end, having timed that connection out, closes it. The bytes go onto a socket that is already going away, and the caller gets a connection reset or an "unexpected end of stream" that has nothing to do with the request it was making. The race cannot be closed by configuration, because the two decisions are independent and there is no round trip that would make them agree. It can only be made rare and made survivable: keep the client's own idle limit comfortably shorter than the shortest idle cut anywhere on the path, so the client retires connections before anyone else does, and let the retry policy treat a request that failed before any response byte arrived as safe to send again. A database connection pool faces the same problem with the same shape of answer, which is what the idle timeout page is about.

HTTP/2 changes the arithmetic rather than the principle. There is normally one connection to an origin carrying every concurrent request as a stream, which the multiplexing page explains, so instead of a handful of connections idling in a pool there is one connection that is rarely idle at all, and the per-request handshake saving keep-alive was invented for is already gone by construction. The protocol also gives the two ends something to say to each other: `PING` frames let either side prove the connection is still alive, and a `GOAWAY` frame lets a server announce that it will finish the streams it has and accept no new ones, which turns a shutdown into an orderly handover instead of a race. Idle timeouts do not disappear, they just stop being the everyday hazard they are on HTTP/1.1. How many connections a .NET client keeps, and how long it keeps them, is a separate question that belongs to the HttpClient connection pool.
