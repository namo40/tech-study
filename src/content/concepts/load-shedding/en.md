---
title: "Load Shedding"
summary: "Dropping some of the work before saturation, on purpose. When more is offered than the service can do, a fast refusal to a few is cheaper than a slow failure for everyone."
category: "Resilience"
tags: ["overload"]
scene: fallback
sceneStep: 3
related:
  - label: Fallback
    slug: fallback
  - label: Throttling
    slug: throttling
  - label: Rate Limiter
    slug: rate-limiter
  - label: Graceful Degradation
    slug: graceful-degradation
  - label: Bulkhead
    slug: bulkhead
  - label: Request Timeout
    slug: request-timeout
  - label: Tail Latency
    slug: tail-latency
  - label: Circuit Breaker
    slug: circuit-breaker
  - label: Retry
    slug: retry
  - label: Cache-Aside
    slug: cache-aside
references:
  - title: "Rate limiting middleware in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/rate-limit
  - title: "Throttling pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/throttling
  - title: "Fallback resilience strategy (Polly)"
    url: https://www.pollydocs.org/strategies/fallback.html
---

The third step of the scene is the moment the service stops trying to serve everyone. The offered rate climbs past what it can do, the `shed` chip lights, and a request that arrives with no allowance left is turned around at the door with a `503` before it has touched a database, a cache, or a thread that matters. The counter beside the composition card is what that policy cost, and it is meant to be read as a price rather than as a fault.

The argument for shedding is arithmetic, not resignation. A service that can do C requests a second and is offered R of them, with R larger than C, has already lost the ability to serve everyone; the only question left is how the shortfall gets delivered. If nothing sheds, the excess queues, and a queue under sustained overload does not settle at some larger depth, it grows for as long as the overload lasts. That converts a capacity problem into a latency problem, and a latency problem touches every request rather than only the excess ones. Everybody waits, everybody eventually times out, and the work the service did manage to finish is thrown away by clients that had already given up. Shedding takes the same shortfall and concentrates it instead of spreading it: a minority get a fast, cheap, honest refusal, and the majority are served at the speed they would have had on a quiet afternoon.

The refusal has to be genuinely cheap, which is the part that is easy to get wrong. If the 503 is produced after authentication, after model binding, after a database round trip to look up the tenant, then shedding costs nearly as much as serving and the service sinks anyway, just with worse numbers on the dashboard. Shed at the outermost edge you control, before the expensive work, and make sure the refusal path allocates as little as possible. In ASP.NET Core that means the rate limiter middleware sits early in the pipeline, and `QueueLimit = 0` so an over-capacity request is refused rather than parked.

Deciding *which* requests to drop is where the design actually lives, and dropping by arrival order is the default that nobody chose. A limiter that refuses whatever turns up when the bucket is empty treats a checkout confirmation and a thumbnail request as equals, which means that during the busiest ten minutes of the year the service will cheerfully refuse the traffic that pays for it. Partition the limits: one bucket per endpoint class, or per cost, or per customer tier. Give browse and search a limit that bites early, give checkout and payment callbacks a limit that barely bites at all, and leave health and readiness endpoints out of it entirely, because shedding your own probe is how a busy service gets restarted into a cold one.

Shedding and retries interact badly unless you plan for it. A refused client will try again, and a client that tries again immediately has converted your shed request into two shed requests. Send `Retry-After`, make the clients you control respect it, and add jitter so the retries do not arrive back as a wave. This is the same conversation as retry storms, seen from the server's end: the cheapest refusal in the world does not help if it triples the offered rate.

Finally, treat the shed rate as a first-class signal rather than an error to be hidden. It is the most direct measurement of the gap between what you were asked to do and what you can do, and it moves before latency does, which makes it a better autoscaling trigger and a better page than a p99 that has not degraded yet. A service shedding two percent of browse traffic at peak is working as designed; a service shedding twenty percent, or shedding anything at all at three in the morning, is telling you something about capacity that nobody had to guess.
