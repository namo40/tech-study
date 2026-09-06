---
title: "Head-of-Line Blocking"
summary: "Head-of-line blocking is the delay a queue passes on: when the item at the front cannot be finished, everything behind it waits, however cheap and however ready it is. It is a property of ordering, not of load."
category: "Edge, routing and service networking"
tags: ["latency"]
level: 6
scene: multiplexing
sceneStep: 2
related:
  - label: Multiplexing
    slug: multiplexing
  - label: Pipelining
    slug: pipelining
  - label: Keep-Alive
    slug: keep-alive
  - label: HttpClient Connection Pool
    slug: httpclient-connection-pool
  - label: HTTP/2
    slug: http-2
  - label: Streaming
    slug: streaming
  - label: Tail Latency
    slug: tail-latency
references:
  - title: "Evolution of HTTP"
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Evolution_of_HTTP
  - title: "RFC 9113: HTTP/2"
    url: https://www.rfc-editor.org/rfc/rfc9113.html
  - title: "Use HTTP/2 with the ASP.NET Core Kestrel web server"
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/kestrel/http2?view=aspnetcore-10.0
---

Head-of-line blocking is what a queue does to the items that are not at the front of it. The one being served cannot be finished, so nothing else can be started, and the cost of that one item is charged to everybody behind it. The name comes from network switching, where a packet at the head of an input queue that cannot be forwarded stalls perfectly forwardable packets behind it, but the shape is much older and much more general than networking. It is a property of ordering. It appears wherever work is taken in a fixed sequence and one unit of that work is allowed to take as long as it needs.

What makes it worth a name of its own is that the queue is invisible in the measurement that matters. Look at the server and every request was answered quickly except one. Look at the client and three requests each took as long as the slowest. The waiting happened before the work began, in a place neither side is instrumented for, which is why the symptom reaches you as a latency distribution with a fat tail rather than as an error. Median stays honest because the median request usually is not behind the slow one; p95 and p99 collapse because they are exactly the requests that were.

On HTTP/1.1 the queue is the connection. Keep-alive lets a connection carry request after request without being reopened, which is worth a great deal, but it carries them one at a time: the client may not send the next request until the previous response has been read. So a single slow answer occupies the wire for its whole duration, and the small, ready, cheap requests behind it pay the full price. Browsers hid this for a decade by opening several connections per origin, which converts the problem into contention for connections rather than removing it. Service-to-service callers get the same shim from their connection pool, at the price of a socket per concurrent request, and the queue reappears the moment that pool is capped or the path is forced onto one connection.

The general fix is to stop imposing an order that the work does not require. HTTP/2 gives each request its own stream on one connection, so a slow stream blocks only itself, and the same move appears everywhere the pattern does: a partitioned queue so one poison message does not stall a topic, a bounded parallel pipeline instead of a strictly sequential one, a separate pool for the calls that are allowed to be slow. What does not fix it is adding capacity, because the queue is not full — it is ordered. And ordering can survive a layer change: HTTP/2 removes the blocking at the HTTP layer and leaves it at the TCP layer, where one lost packet still stalls every stream sharing that connection. That residue is the reason HTTP/3 moved to QUIC, and it is a good reminder that the question to ask is always which layer is insisting on the order.
