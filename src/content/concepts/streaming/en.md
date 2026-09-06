---
title: "Streaming"
summary: "Streaming means the consumer starts seeing the answer before the producer has finished making it. It trades a buffer for a flow, which changes what memory costs and when the first byte arrives, and it is why cancellation and backpressure become the two things you have to handle."
category: "Edge, routing and service networking"
tags: ["latency"]
level: 6
scene: multiplexing
related:
  - label: Multiplexing
    slug: multiplexing
  - label: HTTP/2
    slug: http-2
  - label: gRPC
    slug: grpc
  - label: Backpressure
    slug: backpressure
  - label: Head-of-Line Blocking
    slug: head-of-line-blocking
references:
  - title: "RFC 9113: HTTP/2"
    url: https://www.rfc-editor.org/rfc/rfc9113.html
  - title: gRPC Documentation
    url: https://grpc.io/docs/
---

In the scene's fourth step each of the three requests gets a stream of its own, and streaming is what you do with a stream once you have one. The word is doing two jobs there and it is worth separating them. A stream in the transport sense is the numbered, independent channel the frames of one exchange travel on, and that is the property the step is demonstrating. Streaming in the sense this page means is a property of the message rather than the wire: the response is produced and consumed as a sequence over time instead of as one finished object, so the caller can read the first row while the server is still finding the tenth. The transport makes it practical, and the interleaving the scene ends on is why: because the frames of one stream travel between another's, a response can leave in pieces over time without holding the connection to itself while it does. The decision is still made in the application, and the same choice exists over a plain HTTP/1.1 response with chunked encoding as it does over an HTTP/2 stream.

The contrast that makes it worth choosing is buffering, which is what happens by default nearly everywhere. A buffered response is assembled completely before any of it is sent: the query runs to the last row, the list is serialised into an array of bytes, and only then does a byte leave the process. Two costs follow from that, and they are different in kind. Memory is proportional to the size of the largest response multiplied by how many are in flight, which is how an endpoint that is fine in testing becomes an out-of-memory incident under concurrency. Time to first byte equals time to last byte, so a caller waits out the whole computation before it can display anything or begin its own work. Streaming makes the first cost roughly constant and the second one the time to produce a single item. What it costs in exchange is honesty about the ending: the length is generally unknown when the headers go out, the status code is committed before the body is known to succeed, so a failure discovered halfway through arrives inside a response that already said `200`, and a retry is no longer a clean do-over once bytes have been delivered. In ASP.NET Core the mechanism is unremarkable, an action returning `IAsyncEnumerable<T>` streams its items, and a data layer that yields rows as it reads them rather than materialising a list is what makes that more than a formality.

Cancellation stops being optional the moment work is in flight. In a buffered call the expensive part is over before the response begins, so a client that disappears costs nothing beyond the bytes nobody reads. In a streaming call the producer is still running when the consumer walks away, and if nothing tells it to stop it will keep querying, computing and serialising for an audience that is gone, holding a connection, a database connection and a thread's worth of work the whole time. That is why the cancellation token has to be threaded from the request all the way down into the query and honoured at every await rather than accepted and ignored, and why `HttpContext.RequestAborted` is the signal that matters on the server side.

Backpressure follows for the mirror-image reason: the producer can be faster than the consumer. A stream with nothing regulating it converts a speed difference into a growing buffer, which is the failure the backpressure page describes in general terms, and the reason streaming APIs are written so that writing awaits the flush rather than returning immediately. Getting that right is what keeps a slow reader from becoming the server's memory problem. The four call shapes people usually mean by streaming, and the way they turn into ordinary method signatures, are gRPC's contribution and are covered on the gRPC page. One last inheritance from the transport is worth knowing: streams are independent at the HTTP/2 layer but share one TCP connection underneath, so a long-lived stream and its neighbours still sit in the same recovery when a segment is lost, which is the head-of-line blocking story.
