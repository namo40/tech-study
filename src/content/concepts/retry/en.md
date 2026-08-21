---
title: "Retry"
summary: "Retry repeats a failed call after a short wait, on the bet that the failure was transient. It only helps when the wait grows, is randomized, and is bounded."
category: "Resilience"
scene: retry
steps:
  - title: "Retry"
    text: "A call fails once. Retry waits briefly and sends it again, and this time it succeeds. The bet is that the failure was transient."
  - title: "Exponential backoff with jitter"
    text: "Each wait is longer than the last, and a random offset keeps retries from lining up. Doubling gives the dependency room to recover."
  - title: "Retry storm"
    text: "Clients that retry in lockstep hit the recovering service in waves and knock it over again. Jitter spreads the waves out."
  - title: "Bounded"
    text: "Retries stop at the budget or the deadline, and never run for calls that are not idempotent. Then fail fast and let the circuit breaker take over."
related:
  - label: Exponential Backoff
    slug: exponential-backoff
  - label: Jitter
    slug: jitter
  - label: Retry Storm
    slug: retry-storm
  - label: Retry Budget
    slug: retry-budget
  - label: Circuit Breaker
    slug: circuit-breaker
  - label: Timeout
    slug: timeout
  - label: Idempotency
    slug: idempotency
  - label: Hedging
    slug: hedging
references:
  - title: Build resilient HTTP apps with .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience
  - title: Retry pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/retry
  - title: Transient fault handling
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/transient-faults
---

## When to use

- The failure is transient: a connection reset, a DNS hiccup, 408, 429, 503, or a lock timeout.
- The call is idempotent, or carries an idempotency key so a repeat cannot double-apply.
- There is room left in the deadline and in the retry budget.

## Cautions

- Never retry blindly on POST or any other non-idempotent call.
- Let one layer own the retries. Client, gateway, and service each retrying three times turns one failure into twenty-seven calls.
- Honour `Retry-After`. The server is telling you when to come back.
- Record attempts and final outcomes as metrics. A rising retry rate is an early warning.

## In .NET

Use `Microsoft.Extensions.Http.Resilience`.

```csharp
builder.Services
    .AddHttpClient("catalog", client =>
        client.BaseAddress = new Uri("https://catalog.internal"))
    .AddResilienceHandler("catalog-pipeline", pipeline =>
    {
        pipeline.AddRetry(new HttpRetryStrategyOptions
        {
            MaxRetryAttempts = 3,
            Delay = TimeSpan.FromMilliseconds(500),
            BackoffType = DelayBackoffType.Exponential,
            UseJitter = true,
            ShouldRetryAfterHeader = true,
        });
        pipeline.AddTimeout(TimeSpan.FromSeconds(2));
    });
```

The default `ShouldHandle` treats 5xx responses, 408, 429, `HttpRequestException`, and an attempt timeout as transient. `AddStandardResilienceHandler()` bundles the same retry strategy with a rate limiter, timeouts, and a circuit breaker, so a hand-written pipeline is only needed when those defaults do not fit.
