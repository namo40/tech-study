---
title: "API Gateway"
summary: "An API gateway is a reverse proxy that has taken on product concerns: the same single entry point, now also refusing requests without a token, trimming traffic over the limit, and composing one API surface out of several services."
category: "Edge, routing and service networking"
level: 5
scene: reverse-proxy
sceneStep: 4
related:
  - label: Reverse Proxy
    slug: reverse-proxy
  - label: YARP
    slug: yarp
  - label: Load Balancer
    slug: load-balancer
  - label: Service Discovery
    slug: service-discovery
  - label: Facade
    slug: facade
  - label: Strangler Fig
    slug: strangler-fig
  - label: CORS
    slug: cors
  - label: Sticky Session
    slug: sticky-session
  - label: Health-Based Routing
    slug: health-based-routing
  - label: Round Robin
    slug: round-robin
  - label: Least Connections
    slug: least-connections
references:
  - title: "YARP: Getting started"
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/yarp/getting-started?view=aspnetcore-10.0
  - title: Configure ASP.NET Core to work with proxy servers and load balancers
    url: https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/proxy-load-balancer?view=aspnetcore-10.0
  - title: "X-Forwarded-For"
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Forwarded-For
---

Watch the last step of the scene and notice what does not move. The seat is in the same place, the lanes run to the same services, and the round trip is the round trip from the first step. What changed is the number of questions asked at the door: does this caller have a token, is there room for another request right now, and does this path exist at all. That is the whole distinction. An API gateway is not a different component from a reverse proxy; it is a reverse proxy that has been given work belonging to the product rather than to the network.

The distinction is worth keeping because the two kinds of work fail differently. Terminating TLS, choosing a healthy destination, rewriting a path and forwarding a header are decisions the proxy can make correctly without knowing anything about your business. Deciding that this token grants access to this resource, that this customer's plan allows sixty requests a minute, or that the mobile client should get a trimmed version of this response: all of those are answers only your domain knows. Move them to the edge and the edge starts needing to be deployed when your product changes, which is exactly the coupling the single entry point was supposed to avoid.

Which is not an argument against doing it. Some concerns genuinely belong at the door, and authentication is the clearest case. Validating a token's signature, expiry and issuer once at the edge means every service behind it can trust the identity it is handed, and a request with no credentials never reaches anything that could be tricked by it. Rate limiting is the second clear case, because a limit only means anything if it is applied where all the traffic converges; a per-service limit lets a burst through three times over. Both of these are cheaper and safer as one rule at the front than as a library each service has to keep current.

Composition is the ambitious part and the part that goes wrong. The appeal is obvious: one endpoint the client calls, several services the gateway calls, one response assembled from the pieces, and a mobile client that makes one round trip rather than five. The trouble is that the assembling code now knows the shape of every service it touches, so a field renamed in one of them breaks a deployment nobody expected, and the gateway slowly grows into the distributed monolith that the services were split up to avoid. The usual discipline is to keep composition shallow and read-only, and to give a client with genuinely different needs its own small gateway rather than adding another branch to the shared one.

The failure modes follow from the position rather than the features. Everything goes through it, so its latency is on every request and its outage is everybody's outage; run more than one and make its configuration reload a rehearsed operation rather than a hopeful one. Its authorisation rules live outside the services they protect, so a service that is also reachable on its internal address is protected by nothing, which is why the backends in the scene are marked `private` and why that badge matters more in this step than in any other. And because a gateway accumulates responsibilities by nature, the rules pile up in a place no service can test, until the only way to know whether a request will be accepted is to send one.

So treat the label as a description of load rather than a decision to make. You do not choose between a reverse proxy and an API gateway at the start of a project; you put a seat at the front because you need one address, and then you decide, one duty at a time, whether the next question really belongs at the door or belongs in the service that can answer it properly. When the answer is honestly the door, put it there and write down why. When it is not, the seat stays what it was, and that is a good outcome rather than a missed opportunity.
