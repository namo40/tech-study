---
title: "Ambassador"
summary: "An ambassador is a sidecar facing outward: the app calls a port on localhost and believes it is talking to the service, while the container beside it does the discovery, the retries, the timeouts and the failover, and hands back one clean answer."
category: "Application architecture"
tags: ["kubernetes"]
level: 5
scene: sidecar
sceneStep: 4
related:
  - label: Sidecar
    slug: sidecar
  - label: Retry
    slug: retry
  - label: Request Timeout
    slug: request-timeout
  - label: Circuit Breaker
    slug: circuit-breaker
  - label: Failover
    slug: failover
  - label: Load Balancer
    slug: load-balancer
  - label: API Gateway
    slug: api-gateway
  - label: Reverse Proxy
    slug: reverse-proxy
  - label: Anti-Corruption Layer
    slug: anti-corruption-layer
  - label: Adapter
    slug: adapter
references:
  - title: "Ambassador pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/ambassador
  - title: "Sidecar pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/sidecar
  - title: "Sidecar Containers"
    url: https://kubernetes.io/docs/concepts/workloads/pods/sidecar-containers/
---

An ambassador is the outbound half of the sidecar idea. Inbound, the sidecar is the thing traffic reaches before the app does; outbound, it is the thing the app reaches before the network does. The app is configured with a base address like `http://localhost:3500` and makes an ordinary call to it. On the other side of that loopback sits a container that knows where the real service is today, which of its instances are healthy, what timeout applies, how many attempts are reasonable, and what to do when the answer never comes. The application code contains none of that, which is the whole point: a call in the app is a call, and everything that makes a call in a distributed system difficult has been moved one process to the left.

What the scene's fourth step shows is the smallest interesting version of it. The app makes one call. The far service has a blip and refuses the first attempt. The ambassador tries again and gets an answer, and the app is handed that answer as though nothing had happened. The app's own record says it made one call; the network's record says two requests went out. Both are true, and the gap between them is exactly the value of the pattern. Notice what the app did *not* have to contain to get that: no attempt counter, no backoff schedule, no classification of which status codes deserve another try. That policy is the retry pattern's subject, and the ambassador is where it lives once it has left the application.

The reason to reach for this rather than a client library is the same reason as for any sidecar, and it is worth being honest that it is a fleet argument rather than a service argument. One service in one language should use a resilience library and be done: `IHttpClientFactory` with a handler, or its equivalent, is less machinery and one fewer hop. The ambassador earns its keep when the same policy has to be identical across services written in different languages, when a legacy binary cannot be recompiled to gain a retry policy, or when the platform team needs to change a timeout across the whole estate without opening a single application repository. It is also how you retrofit connection pooling, circuit breaking or protocol translation onto a client that was never written to have any of them.

The costs are the ones the shape implies. Every outbound call now crosses the loopback, so there is a hop to measure, and the ambassador is a process that can be unhealthy while the app is fine. Debugging gets a step longer, because a failed call has two places to look and the app's logs describe only its half. Configuration moves out of the app and into the platform, which is a gain for consistency and a loss for locality: the person reading the code can no longer see what the timeout is. The practical answers are to keep the ambassador's own telemetry good enough to answer "what actually happened out there", to propagate the correlation identifier through it so both halves of a call can be joined, and to make sure a caller's deadline survives the hop rather than being silently replaced by the ambassador's default.
