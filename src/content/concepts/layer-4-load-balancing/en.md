---
title: "Layer 4 Load Balancing"
summary: "Balancing at the transport layer: the balancer picks a backend for a connection by looking at addresses and ports, forwards the bytes without reading them, and never learns what any request was. That is what makes it fast, protocol-agnostic and blind."
category: "Edge, routing and service networking"
scene: load-balancer
sceneStep: 1
related:
  - label: Load Balancer
    slug: load-balancer
  - label: Layer 7 Load Balancing
    slug: layer-7-load-balancing
  - label: Round Robin
    slug: round-robin
  - label: Reverse Proxy
    slug: reverse-proxy
  - label: gRPC
    slug: grpc
  - label: Sticky Session
    slug: sticky-session
references:
  - title: Load balancing options
    url: https://learn.microsoft.com/en-us/azure/architecture/guide/technology-choices/load-balancing-overview
---

The rotation in the scene's first step has to happen somewhere, and the layer it happens at decides what the balancer is allowed to know. A layer 4 balancer works at the transport layer, which means its entire input is the five-tuple of a connection: source address and port, destination address and port, protocol. It chooses a backend once, when the connection is opened, and after that it is a forwarding path. Bytes go through in both directions and the balancer never parses them, so it cannot tell a `GET /health` from a two-megabyte upload, and it never finds out how long either took.

That blindness is the whole bargain, and most of what it buys is on the good side. Because nothing is parsed there is nothing to buffer, so the work per connection is a table lookup and a rewrite, cheap enough to run in a kernel path or in hardware and to hold millions of concurrent flows on modest machines. Because nothing is parsed, the protocol does not matter either: the same balancer fronts a SQL port, an SMTP relay, a game server and an HTTPS site without knowing which is which, and it can pass TLS straight through to the backends, so no certificate or private key ever needs to live on the balancer. Whether the return traffic goes back through it, by rewriting addresses, or straight from the backend to the client, by direct server return, is a deployment detail, and the second one exists because the outbound side is usually the fat one.

The cost is a single sentence with long consequences: the unit of balancing is the connection, not the request. A short HTTP/1.1 connection hides that, because one connection is roughly one request. A long-lived one exposes it completely. gRPC holds one HTTP/2 connection and sends every call over it, so a single layer 4 decision pins every call from that client to whichever backend it first landed on, and a replica added afterwards receives nothing at all until clients reconnect; a WebSocket, a database connection pool and a message broker channel all behave the same way. The other losses follow from the same blindness. There is no routing on a path, a header or a cookie, a failed request cannot be retried elsewhere because the balancer never saw a request, and the health signal is at best a successful TCP connect, which a process can pass while returning errors to every caller.

None of this makes the layer a worse choice, only a different one, and the two layers are usually stacked rather than compared: a layer 4 balancer in front spreading connections across a set of layer 7 proxies, which then spread the requests. Reach for layer 4 when the traffic is not HTTP, when the volume is large enough that per-request parsing is the expense you are trying to avoid, or when nothing in the middle should be able to read what the client sent. Reach for the layer above when you need decisions made per request, and when the connections in front of you are the long-lived kind. Sticky behaviour is worth naming here too, because at this layer you get it whether you asked for it or not.
