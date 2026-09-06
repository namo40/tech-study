---
title: "Quota"
summary: "A quota is an allowance spent over a long window — a day, a month, a billing period. A rate limit protects the service in the moment; a quota holds a client to what it agreed to consume, and the two refuse for entirely different reasons."
category: "Resilience"
tags: ["overload"]
level: 4
scene: rate-limiter
sceneStep: 4
related:
  - label: Rate Limiter
    slug: rate-limiter
  - label: Token Bucket
    slug: token-bucket
  - label: Throttling
    slug: throttling
  - label: Error Budget
    slug: error-budget
  - label: API Gateway
    slug: api-gateway
references:
  - title: Rate Limiting pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/rate-limiting-pattern
  - title: Rate limiting middleware in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/rate-limit?view=aspnetcore-10.0
---

The scene's fourth step gives every client its own bucket, so one caller's burst empties only its own. A quota partitions the same way and measures something else entirely. The bucket exists so the service survives the next second; the quota exists so a client stays inside the volume it was sold. Those are independent axes, and a client can sit on either one without touching the other: a caller that never exceeds ten requests per second can still burn a month's allowance of ten million by the third of the month, and a caller with ninety percent of its monthly allowance untouched can still be refused right now for sending two hundred requests in one second. Most public APIs enforce both, on the same partition key, and the algorithms that shape the per-second side belong to token bucket and its neighbours rather than here.

The long window changes the mechanism more than it looks like it should. A per-second bucket can live in memory and be rebuilt from nothing after a restart, because a second of forgiveness costs nothing; a month-to-date counter cannot be rebuilt, so quota state is durable state with all that implies — it needs a store, a backup, and a decision about what happens when two regions both count. The reset is a calendar event rather than a sliding refill, which produces its own load pattern: a quota that resets at midnight on the first makes the first the busiest day of the month, as every client that has been rationing itself stops. And the thing being counted is often not requests at all. A quota is a proxy for cost, so it counts whatever the cost actually is — rows returned, bytes transferred, tokens processed, compute-seconds, messages published — and a single request can consume a thousand units of allowance or one.

Because a quota is a commercial promise before it is a mechanism, the client has to be able to see it continuously rather than only at the moment of refusal. That means the allowance travels in response headers on successful calls — the limit, the amount remaining, and the moment the window resets — so a client can slow itself down, alert its own operators, or buy more before anything breaks. It also means a rejection has to be distinguishable from a rate-limit rejection, which is awkward, because both are usually a `429`. A client that treats them the same will read a `Retry-After` measured in weeks and either sleep on it or retry it as though it were seconds; the honest thing is to say which limit was hit in the body or a header, and to reserve the retryable answer for the one that is actually retryable soon.

The last difference is who resolves the failure. A rate limit that trips is an engineering signal about capacity or a misbehaving client, and it is handled by backing off. A quota that runs out is a contract event: nothing is broken, no capacity is short, and the correct response is a larger plan, a different tier, or an approved overage — a conversation with a person rather than a retry. The design choice underneath is whether the cap is hard or soft: refusing at a hundred percent is predictable and occasionally catastrophic for the customer, while allowing an overage and billing it keeps the service running and turns a technical limit into an invoice. Error budget is the same shape of thinking pointed at reliability instead of consumption, which is why a quota conversation and a budget conversation tend to sound so similar.
