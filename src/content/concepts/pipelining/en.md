---
title: "Pipelining"
summary: "Pipelining sends the next request without waiting for the previous response, so questions stop taking turns. Responses still have to come back in the order they were asked, which is why it moved the blocking rather than removing it."
category: "Edge, routing and service networking"
tags: ["latency"]
scene: multiplexing
sceneStep: 3
related:
  - label: Multiplexing
    slug: multiplexing
  - label: Head-of-Line Blocking
    slug: head-of-line-blocking
  - label: Keep-Alive
    slug: keep-alive
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
  - label: Connection Timeout
    slug: connection-timeout
  - label: Database Connection Pool
    slug: database-connection-pool
  - label: I/O Completion Port
    slug: io-completion-port
  - label: SemaphoreSlim
    slug: semaphoreslim
references:
  - title: "Evolution of HTTP"
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Evolution_of_HTTP
  - title: "Use HTTP/2 with the ASP.NET Core Kestrel web server"
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/kestrel/http2?view=aspnetcore-10.0
  - title: "RFC 9113: HTTP/2"
    url: https://www.rfc-editor.org/rfc/rfc9113.html
---

Pipelining is the obvious next idea after keep-alive, and it is worth understanding precisely because it was the right instinct applied to the wrong half of the problem. Keep-alive stopped the connection from being torn down between requests; pipelining stops the client from waiting for an answer before it asks the next question. Three requests go out back to back, and the round-trip time that used to be paid three times is paid once. On a link with a long round trip, that is exactly the saving you would want.

The half it could not free is the answers. HTTP/1.1 has no request identifier on the wire: a response is matched to a request by position, so the second response is the answer to the second request by definition. That means responses must come back in the order the requests were sent, and a client that has pipelined three requests has committed to reading them in that order. If the first one is slow, the second and third can be finished, sitting in the server's buffers, and still not allowed out. The blocking has not gone anywhere. It has moved from the request side of the wire to the response side, which is the picture the scene draws.

That would still be a real improvement in many cases, and it is not why pipelining died. It died in the network. Intermediaries — proxies, transparent caches, load balancers — that were written against the one-request-one-response assumption dealt with a pipelined stream by dropping requests, reordering them, or silently corrupting the response boundaries. There was no way for a client to find out in advance whether the path to a server was safe, and a failure produced garbage rather than an error. Browsers shipped it disabled by default, then removed it, and the general advice today is that pipelining is not a thing to enable. It survives as an idea, in protocols with a channel of their own where the whole path is under one owner.

The lesson is that concurrency needs identity. Once responses can be labelled rather than counted, they can come back in any order, and the ordering constraint that pipelining could not remove simply stops existing. That is exactly what HTTP/2 frames do: every frame carries a stream identifier, so three requests can be in flight on one connection and their answers can arrive whenever they are ready. Pipelining is the version of that idea without the labels, and the difference between the two is the whole reason one is a footnote and the other is how the web works.
