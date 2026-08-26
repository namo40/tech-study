---
title: "Bulkhead"
summary: "A bulkhead gives each dependency its own pool of slots, so a slow or failing dependency can exhaust only its own compartment and the rest of the service keeps working."
category: "Resilience"
tags: ["overload"]
scene: bulkhead
steps:
  - title: "One shared pool"
    text: "Every call, to A or to B, takes a slot from the same pool. While both dependencies are healthy, that is fine."
  - title: "No bulkhead"
    text: "B slows down and its calls hold every slot. Calls to healthy A now fail too, not because A is sick but because there is nowhere to put them."
  - title: "Bulkhead"
    text: "A wall splits the pool. B still fills its three slots and its extra calls fail fast, but B's failure stays on B's side. A keeps flowing."
  - title: "Timeouts free the slots"
    text: "A stuck call must not hold its slot forever. Pair every compartment with a timeout, size it for that dependency's budget, and B can recover without anyone else noticing."
related:
  - label: Concurrency Limiter
    slug: concurrency-limiter
  - label: Bounded Concurrency
    slug: bounded-concurrency
  - label: Fault Isolation
    slug: fault-isolation
  - label: Timeout
    slug: timeout
  - label: Circuit Breaker
    slug: circuit-breaker
  - label: Rate Limiter
    slug: rate-limiter
  - label: Thread Pool Starvation
    slug: threadpool-starvation
  - label: Pool Exhaustion
    slug: pool-exhaustion
  - label: Noisy Neighbor
    slug: noisy-neighbor
references:
  - title: Bulkhead pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/bulkhead
  - title: Introduction to resilient app development
    url: https://learn.microsoft.com/en-us/dotnet/core/resilience/
  - title: Build resilient HTTP apps with .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience
---

## When to use

- One service talks to several dependencies, and a slow one must not take the others down with it.
- Some callers or tenants matter more than others and deserve reserved capacity.
- A dependency is known to degrade by getting slow rather than by failing fast.

## Cautions

- A bulkhead without a timeout only delays the problem. Stuck calls hold their slots until the timeout frees them.
- Compartments that are too small waste capacity in normal operation. Size them from measured concurrency, then add headroom.
- Slots are not only HTTP calls. Thread pools, database connection pools, and queues need the same separation.
- Fail fast when a compartment is full, and make that rejection visible in metrics. A full compartment is an early warning, like an open circuit breaker.

## In .NET

Give each dependency its own `HttpClient` and its own pipeline.

```csharp
builder.Services
    .AddHttpClient("search", client =>
        client.BaseAddress = new Uri("https://search.internal"))
    .AddResilienceHandler("search-bulkhead", pipeline =>
    {
        // Search gets its own compartment: 20 calls in flight,
        // 10 waiting, everything beyond that fails fast.
        pipeline.AddConcurrencyLimiter(permitLimit: 20, queueLimit: 10);
        pipeline.AddTimeout(TimeSpan.FromSeconds(2));
    });

builder.Services
    .AddHttpClient("payments", client =>
        client.BaseAddress = new Uri("https://payments.internal"))
    .AddResilienceHandler("payments-bulkhead", pipeline =>
    {
        pipeline.AddConcurrencyLimiter(permitLimit: 50, queueLimit: 0);
        pipeline.AddTimeout(TimeSpan.FromSeconds(1));
    });
```

`SemaphoreSlim` puts the same compartment around any stretch of code, not just an outgoing call. Stronger isolation comes from separating processes, containers, and database pools, which a limit inside a single process cannot give you.
