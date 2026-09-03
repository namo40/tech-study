---
title: "Polly"
summary: "Polly is the .NET resilience library, and since v8 its unit is the ResiliencePipeline: a chain of strategies wrapped around the call you execute. The order they are added in is the order they nest, which is why a retry and a timeout mean different things depending on which one is outside."
category: "Resilience"
scene: circuit-breaker
sceneStep: 1
related:
  - label: Circuit Breaker
    slug: circuit-breaker
  - label: Retry
    slug: retry
  - label: Request Timeout
    slug: request-timeout
  - label: Fallback
    slug: fallback
  - label: Bulkhead
    slug: bulkhead
references:
  - title: "Meet Polly: The .NET resilience library"
    url: https://www.pollydocs.org/
  - title: "Build resilient HTTP apps with .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience
---

The scene's first step shows a breaker in its closed state, counting results against a sampling window. Polly is where a .NET application gets that machine without writing it. Since v8 the unit is a `ResiliencePipeline`: a chain of strategies wrapped around whatever callback you hand to `ExecuteAsync`, assembled once through `ResiliencePipelineBuilder`. Pipelines hold state, which is the part people get wrong first. The failure counts, the open-circuit clock and the rate limiter's permits all live in the pipeline object, so it belongs in a field or in dependency injection as a singleton; a pipeline built per request gives every request a breaker that has never seen a failure and can therefore never open. Strategies then nest in the order they are added, outermost first, and that ordering changes what each one means.

```csharp
ResiliencePipeline pipeline = new ResiliencePipelineBuilder()
    .AddTimeout(TimeSpan.FromSeconds(30))  // whole call, retries included
    .AddRetry(new RetryStrategyOptions { MaxRetryAttempts = 3 })
    .AddCircuitBreaker(new CircuitBreakerStrategyOptions { FailureRatio = 0.1 })
    .AddTimeout(TimeSpan.FromSeconds(10))  // one attempt
    .Build();
```

The outer timeout bounds the whole operation including its retries, so a caller's own deadline has somewhere to live. The inner one bounds a single attempt, which is what turns a hung dependency into a countable failure instead of a hang. The breaker sits inside the retry so it counts attempts rather than operations and can open partway through a retry sequence, which is precisely what stops a retry storm from being the thing that keeps a dying dependency down.

Most .NET applications never assemble that by hand, because `Microsoft.Extensions.Http.Resilience` ships it. Calling `AddStandardResilienceHandler()` on an `IHttpClientBuilder` installs exactly this arrangement as a delegating handler, with defaults that are worth reading rather than guessing: a rate limiter outermost, a 30 second total timeout, three retries with exponential backoff and jitter, a breaker that opens at a 10 percent failure ratio over a 30 second window with a minimum throughput of 100 calls, and a 10 second attempt timeout. It also already treats HTTP 500 and above, 408 and 429 as failures, which a pipeline you build yourself does not: for a generic pipeline, a returned result is only a failure if `ShouldHandle` says so, and only thrown exceptions count by default. One handler means one shared breaker for that client, so a client that talks to several hosts wants pipelines selected per authority rather than one breaker that any single bad host can open.

What Polly cannot supply is the judgement. It does not know whether an operation is safe to repeat, and a retry strategy in front of a call that is not is a way to charge a customer twice. It does not know what your caller's deadline is, so the outer timeout is a number you have to obtain rather than invent. And its strategies are the neighbouring pages made executable: retry, circuit breaker, timeout, fallback, hedging and rate limiting are all builder methods, which makes it easy to add four of them without deciding what each is protecting. Add one at a time, with the telemetry the pipeline emits turned on, so that the breaker opening is an event you can see rather than an error your users report.
