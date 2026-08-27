---
title: "Throttling"
summary: "Slowing the rate, and shrinking the feature set, to protect the service. The limit is a design value chosen from what the system can actually do, not a number that appears once it is already failing."
category: "Resilience"
tags: ["overload"]
scene: fallback
sceneStep: 3
related:
  - label: Fallback
    slug: fallback
  - label: Load Shedding
    slug: load-shedding
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
  - title: "Throttling pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/throttling
  - title: "Rate limiting middleware in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/rate-limit
  - title: "Fallback resilience strategy (Polly)"
    url: https://www.pollydocs.org/strategies/fallback.html
---

In the third step the `throttle` chip lights half a second before `shed` does, and the order is the point. Throttling is the decision about how much work the service will accept per second; shedding is what happens to whatever exceeds it. One is a policy, the other is that policy's consequence, and a service that has the second without the first is refusing requests according to a number nobody chose.

That number is the whole of the design. A throttle limit is not a guess about how much traffic you expect, it is a statement about how much the system can do while still meeting its latency target, and the only honest way to get it is to measure. Load test until the response time curve bends, note the rate at the bend rather than the rate at the peak throughput, and set the limit a little below it. The distinction matters because a service pushed past the bend often still shows rising throughput for a while, which is why capacity chosen from a throughput graph tends to be a capacity at which nothing is fast any more.

Throttling also has a second, less obvious form, and the scene shows both. Reducing the rate is one way to spend less per second; reducing what each request does is another. When the service is under load and the recommendation service is already known to be down, it stops making that call at all rather than spending a connection, a thread and a timeout on a result it can predict. Turning off enrichment, lowering an image resolution, returning twenty results instead of a hundred, skipping the expensive personalisation query: all of it is throttling, in that it changes the cost of a unit of work rather than the number of units. It is usually cheaper to buy than more machines, and it is available in seconds rather than minutes.

Where the limit lives determines what it can protect. A limit in the client protects the dependency but not you, because a client that ignores it still arrives. A limit in the gateway protects the whole fleet and can be changed without a deploy, but it does not know how loaded any individual instance is. A limit inside the process knows exactly that, and is the only one that survives somebody calling the service directly. Most systems that survive their own success have all three, sized so that the outer ones bite first and the inner one is the backstop.

The other half of a throttle is telling the client. A limit that silently refuses is indistinguishable from an outage, so return a status the caller can act on, `429` for "you personally are over your share" and `503` for "the service as a whole is over capacity", and put `Retry-After` on both. Publish the limits in your documentation, expose the remaining allowance in a header if the callers are yours, and warn the noisy ones before you start refusing them. Nearly every unpleasant conversation about rate limits is really a conversation about a limit that was discovered rather than announced.

Finally, a throttle is not a bulkhead, and confusing them leaves a gap. A throttle bounds the rate of arrivals; a bulkhead bounds how much of a shared resource one caller or one dependency can hold at once. A service can be comfortably inside its request-per-second limit and still have every thread in the pool parked on one slow downstream call. The two are complementary, and the reason both appear next to this scene is that overload rarely arrives as a single kind of problem.
