---
title: "Graceful Degradation"
summary: "A planned mode that keeps the core and folds everything else away. The skill is knowing how to be partially alive, so a system that loses a part does not have to lose itself."
category: "Resilience"
tags: ["overload"]
scene: fallback
sceneStep: 4
related:
  - label: Fallback
    slug: fallback
  - label: Load Shedding
    slug: load-shedding
  - label: Throttling
    slug: throttling
  - label: Circuit Breaker
    slug: circuit-breaker
  - label: Bulkhead
    slug: bulkhead
  - label: Request Timeout
    slug: request-timeout
  - label: Rate Limiter
    slug: rate-limiter
  - label: Tail Latency
    slug: tail-latency
  - label: Retry
    slug: retry
  - label: Cache-Aside
    slug: cache-aside
references:
  - title: "Fallback resilience strategy (Polly)"
    url: https://www.pollydocs.org/strategies/fallback.html
  - title: "Throttling pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/throttling
  - title: "Rate limiting middleware in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/rate-limit
---

In the last step of the scene the `core only` chip lights and the recommendations row does not go red, it goes away. That difference is the whole idea. A failure is something that happens to you; a mode is something you designed, gave a name, wrote down, and can switch on deliberately at three in the morning. The row folding shut is the service saying "I am not doing that part right now", which is a sentence a system can only say if somebody wrote it in advance.

The design work is deciding, while nothing is on fire, which parts of the product are core and which are not. That conversation is uncomfortable in exactly the way it should be, because it forces the question nobody wants during an incident: if we can only serve one thing, what is it? A shop that can take money is alive; the same shop without recommendations, without the personalised banner, without review counts and delivery estimates, is a worse shop that is still a shop. Write the ranking down and keep it with the runbook. Half of the value is the switch and half is the list, and the list is the half that decides how quickly anybody dares to use the switch.

Then the mode has to be reachable. A degradation that requires a deploy is not a mode, it is a release under pressure, which is the state in which engineering makes its worst decisions. Put the parts behind feature flags whose default is on and whose off path has been executed, so that turning the extras off is one change to configuration and takes effect in seconds. It is worth wiring the flags in groups rather than one per feature: an operator who has to remember eleven switches under stress will get one of them wrong, whereas a single `core only` that turns eleven things off is a decision anyone can make.

Degrading is only half a mode; the other half is coming back. In the scene the recovery is deliberately not a single flip. The dependency reports itself healthy, the smaller shape is switched off, the next request proves the recommendation service is really answering, and only then does the fallback chip go out, with the limiter unwound one feature at a time behind it. Restoring everything at once takes a dependency that has just come up and points the entire suppressed load at it, which is a reliable way to knock it straight back down. Come back the way you went down, in stages, watching after each one.

The degraded state has to be visible to more than the operator. Users tolerate a smaller product remarkably well and tolerate a mysterious one badly, so say something: a quiet line about recommendations being unavailable is worth more than an empty box that reads as a bug. Internally the mode belongs on the dashboard next to the error rate, because a service that has been running in `core only` for a week is a service where somebody switched something off and the ticket to switch it back on was never written. Every degradation mode wants an expiry date, or at least an alarm that goes off if it is still on tomorrow.

The last thing worth saying is that this is a property you build in, not one you add later. Graceful degradation shows up as boundaries in the code: the enrichment call is separate from the core query, it has its own timeout, its own budget, its own flag, and the view can render without it. A page that fetches everything in one query and one template cannot degrade at all, because it has no seam to fold along. Systems that know how to be partially alive rarely end up fully dead, and the reason is not resilience libraries; it is that somebody drew the seams while everything was still working.
