---
title: "Layer 7 Load Balancing"
summary: "Balancing at the application layer: the balancer terminates the connection, reads the request, and decides per request rather than per connection. Everything it can do that layer 4 cannot follows from having parsed the message."
category: "Edge, routing and service networking"
level: 4
scene: load-balancer
sceneStep: 2
related:
  - label: Load Balancer
    slug: load-balancer
  - label: Layer 4 Load Balancing
    slug: layer-4-load-balancing
  - label: Least Connections
    slug: least-connections
  - label: Reverse Proxy
    slug: reverse-proxy
  - label: API Gateway
    slug: api-gateway
  - label: gRPC
    slug: grpc
references:
  - title: Load balancing options
    url: https://learn.microsoft.com/en-us/azure/architecture/guide/technology-choices/load-balancing-overview
  - title: YARP load balancing
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/yarp/load-balancing
---

The scene's second step is about a balancer that keeps feeding a server which is already struggling, and every fix for that begins with the same prerequisite: the balancer has to be able to see requests at all. A layer 7 balancer can, because it works at the application layer. It accepts the client's connection and terminates it, reads the HTTP message, chooses a backend, and opens or reuses its own connection to that backend to forward the request. It is two connections joined by a decision, not a wire with a table in the middle, and it is the reason the same box is usually also called a reverse proxy.

Having the message in hand changes what a routing rule can say. Requests can go to different backend pools by path, host, header, cookie or method, so `/api` and `/images` can be entirely different deployments behind one address, and a canary can be selected by a header on one percent of traffic. It also changes the granularity of balancing itself: because each request is a separate decision, a hundred calls arriving over one HTTP/2 connection can land on a hundred different backends, which is exactly the case a lower layer cannot serve and the reason gRPC traffic wants a proxy that speaks its protocol. The same position makes a set of cross-cutting jobs natural. A failed idempotent request can be retried on another backend, because the balancer still holds it. Per-request timeouts, header rewriting, compression, request logging and rate limiting all live here for the same reason. TLS termination belongs here by necessity rather than convention: the request has to be plaintext before anyone can read a path out of it.

All of that is paid for. Parsing, buffering and holding two connections per client costs CPU and memory that a forwarding path does not spend, so throughput per instance is lower and a balancer becomes a tier that itself needs scaling. Terminating TLS means certificates, renewals and private keys now live on the edge, and the hop to the backend has to be secured separately if the network between them is not trusted. There is latency in the parse and, if bodies are buffered rather than streamed, in the buffering; a large upload can be held in full before the backend sees a byte. And a component that understands your protocol is a component that can be wrong about it, so an oversized header, an unusual verb or a streaming response can be rejected or stalled by the middlebox rather than by the application. It is a server, and it needs the same operational care as one.

The two layers divide by what they can see, not by which is better, and the honest way to choose is to ask what the decision has to be made from. If the traffic is not HTTP, if the payload must stay encrypted end to end, or if the point is to move packets as cheaply as possible, the decision can only be made from addresses and ports, and it belongs a layer down. If routing depends on the content of the request, if the connections are long-lived enough that one decision per connection would pin them, or if retries, TLS termination and per-request metrics are wanted at the edge, the request has to be parsed and this is where that happens. Large systems commonly run both, and an API gateway is this layer with product features on top.
