---
title: Circuit Breaker
summary: "A circuit breaker stops calls to a dependency that keeps failing, so callers fail fast and the dependency gets time to recover."
category: Resilience
level: 5
scene: circuit-breaker
steps:
  - title: "Closed"
    text: "Requests flow through to the service. The breaker forwards every call and records the result. When the service starts failing, the breaker counts the failures against a sampling window."
  - title: "Open"
    text: "Once the failure rate crosses the threshold, the breaker opens. Calls fail fast at the breaker and never reach the service. The caller gets an immediate error instead of waiting out a timeout, and the service gets time to recover."
  - title: "Half-Open"
    text: "After the break duration, one trial call is allowed through. Other calls are still rejected. The trial answers a single question: is the dependency healthy again?"
  - title: "Closed again"
    text: "The trial succeeded, so traffic flows normally. If the trial had failed, the breaker would open again for another break duration."
related:
  - label: Retry
    slug: retry
  - label: Timeout
    slug: timeout
  - label: Bulkhead
    slug: bulkhead
  - label: Fallback
    slug: fallback
  - label: Closed State
    slug: closed-state
  - label: Open State
    slug: open-state
  - label: Half-Open State
    slug: half-open-state
  - label: Polly
    slug: polly
references:
  - title: Circuit Breaker pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker
  - title: Introduction to resilient app development
    url: https://learn.microsoft.com/en-us/dotnet/core/resilience/
  - title: Build resilient HTTP apps with .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience
---

## When to use

- A downstream dependency fails for sustained periods, not just in brief blips.
- Callers must stay responsive while the dependency is down.
- You can define what counts as failure: exceptions, timeouts, specific status codes.

## Cautions

- Scope the breaker correctly. One breaker per dependency endpoint is usually right; a breaker shared across unrelated endpoints blocks healthy traffic when one endpoint fails.
- Pair it with a timeout. Without timeouts, slow calls never register as failures.
- Put the breaker inside the retry. Retry probes whether a failure is transient; the breaker stops probing while recovery is unlikely. Inside, it counts attempts rather than whole operations, and an open circuit ends the retry sequence instead of feeding it.
- Emit state changes as metrics and logs. An open breaker is an operational signal, not just a code path.

## In .NET

Use `Microsoft.Extensions.Http.Resilience`. The older `Microsoft.Extensions.Http.Polly` package is deprecated.

```csharp
builder.Services
    .AddHttpClient("inventory", client =>
        client.BaseAddress = new Uri("https://inventory.internal"))
    .AddResilienceHandler("inventory-pipeline", pipeline =>
    {
        pipeline.AddCircuitBreaker(new HttpCircuitBreakerStrategyOptions
        {
            FailureRatio = 0.5,
            MinimumThroughput = 20,
            SamplingDuration = TimeSpan.FromSeconds(30),
            BreakDuration = TimeSpan.FromSeconds(15),
        });
        pipeline.AddTimeout(TimeSpan.FromSeconds(2));
    });
```

Strategies nest in the order they are added, so the attempt timeout added second sits inside the breaker and the `TimeoutRejectedException` it throws is counted as a failure. Added first it would wrap the breaker instead, and the `OperationCanceledException` that a slow call then ends with is not something the breaker's default `ShouldHandle` counts.

`AddStandardResilienceHandler()` bundles a rate limiter, a total request timeout, retry, a circuit breaker, and a per-attempt timeout with default settings, so a hand-written pipeline is only needed when those defaults do not fit.
