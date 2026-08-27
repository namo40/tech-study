---
title: "Fallback"
summary: "A fallback is the answer you give when the right answer is unavailable: a cached copy, a default, a smaller page — degraded on purpose, so the failure stays inside the service instead of reaching the user."
category: "Resilience"
scene: fallback
steps:
  - title: "The full answer, while everything is up"
    text: "A request fans out to the core data and the recommendation service, and the page comes back complete. Nobody thinks about the seams on a good day, which is exactly when to draw them."
  - title: "When a dependency dies, answer anyway"
    text: "The recommendation call fails; instead of failing the page, the service serves yesterday's cached list and marks it a fallback. The user still gets an answer. The error stays inside."
  - title: "Under overload, shed before you sink"
    text: "More requests than capacity: throttle the rate and shed the excess early with a cheap refusal. A fast 503 costs one client a retry; a slow timeout costs everyone. The core stays fast because the edge gave way first."
  - title: "Degradation is a mode you design"
    text: "Extras off, core on. The service runs in its planned smaller shape until the dependency returns, then restores feature by feature. Systems that know how to be partially alive rarely end up fully dead."
related:
  - label: Circuit Breaker
    slug: circuit-breaker
  - label: Retry
    slug: retry
  - label: Request Timeout
    slug: request-timeout
  - label: Bulkhead
    slug: bulkhead
  - label: Rate Limiter
    slug: rate-limiter
  - label: Tail Latency
    slug: tail-latency
  - label: Load Shedding
    slug: load-shedding
  - label: Throttling
    slug: throttling
  - label: Graceful Degradation
    slug: graceful-degradation
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

## When to use

- Any call whose failure has an answer cheaper than an error. A cached or stale copy, a default value, a smaller page, a queued "accepted, we will finish this later": if you can name what you would rather return than a 500, you have a fallback, and the only remaining question is where to put it.
- Enrichment before essentials. Recommendations, related items, personalisation, avatars, review counts, delivery estimates: the parts of a page nobody buys anything for. These are the calls that should never be able to take the page down, and they are usually the calls most likely to be slow, because they are the newest and the least invested in.
- Alongside a circuit breaker, not instead of one. The breaker decides *when* to stop calling something that is failing; the fallback decides *what to say* in the meantime. A breaker with no fallback still returns an error, just faster. A fallback with no breaker keeps paying for a call it already knows will fail.
- Under load, as a way of choosing who suffers. Throttling caps how fast you accept work and shedding refuses the excess immediately, which is a fallback for the whole service rather than for one call: the answer to "we cannot serve everyone right now" is a fast, honest refusal to some rather than a slow timeout for all.
- When the degraded answer can be written down in advance. If you cannot say, before the incident, what the page looks like without recommendations, then during the incident somebody will invent it, and what they invent will be an error page.

## Cautions

- The fallback must be cheaper and more reliable than the path it replaces, or it fails with it. Falling back to the same database that just timed out is not a fallback, it is a second attempt with extra steps. Prefer a local cache, a static default, or a value already in memory. If the fallback needs a network call of its own, ask what happens when that one is slow too.
- Mark degraded responses and measure the rate. A response served from a fallback should say so, in a header, a flag on the payload, a span attribute, something. Without that, a fallback is an outage with the alarm disconnected: recommendations have been stale for six days, everything is green, and the first person to notice is a customer. The fallback rate belongs on the same dashboard as the error rate, because it *is* the error rate for the part of the system that stopped answering.
- Some answers must not be faked. Balances, payment states, permissions, stock levels that will be charged against: a plausible wrong number is worse than an error, because the user acts on it. For those calls, fail honestly and say so. The rule of thumb is whether the reader will make a decision from the value; if they will, and it is stale, the fallback is a lie with good manners.
- Shedding needs a priority rule, or it drops the checkout with the recommendations. Rejecting whatever arrives when the bucket is empty treats a payment confirmation and a thumbnail request as equals. Partition the limits by endpoint or by cost, and make sure the cheap, optional traffic is what gets refused first.
- A fallback that has never run is a hypothesis. Force it in a test: point the dependency at a black hole, run the request, read the page. The parts that break are rarely the fallback itself; they are the serialiser that cannot handle the empty list, the view that assumes at least one item, and the log line that fires on every request and floods the sink.
- Watch for the fallback becoming the load-bearing path. If the cached copy is good enough for months, you have learnt something about the dependency, and the honest response is to delete the call, not to keep it as decoration that occasionally causes an incident.

## In .NET

Polly v8 puts the fallback in the pipeline as a strategy, which means the substitute answer is produced in the same place as the timeout and the retry rather than in a `catch` block at the call site.

```csharp
// The recommendations call: short timeout, and a cached list when it fails.
var recommendations = new ResiliencePipelineBuilder<IReadOnlyList<Item>>()
    .AddFallback(new FallbackStrategyOptions<IReadOnlyList<Item>>
    {
        ShouldHandle = new PredicateBuilder<IReadOnlyList<Item>>()
            .Handle<HttpRequestException>()
            .Handle<TimeoutRejectedException>()
            .Handle<BrokenCircuitException>(),
        FallbackAction = async args =>
        {
            var cached = await store.LastKnownGoodAsync(args.Context.CancellationToken);
            return Outcome.FromResult<IReadOnlyList<Item>>(cached ?? Array.Empty<Item>());
        },
        // The response has to admit what it is, or the outage is invisible.
        OnFallback = args =>
        {
            degraded.Value = true;
            metrics.Add(1, new KeyValuePair<string, object?>("reason", "recommendations"));
            return default;
        },
    })
    .AddCircuitBreaker(new CircuitBreakerStrategyOptions<IReadOnlyList<Item>>())
    .AddTimeout(TimeSpan.FromMilliseconds(300))
    .Build();
```

Strategies run outermost first in the order they are added, so the fallback here wraps the breaker, which wraps the timeout: a call that runs past 300 ms is cancelled, the breaker counts it, and the fallback turns whichever of those failures arrives into a list. Note what is *not* in the pipeline: the core data call. That one has no fallback, because there is no honest substitute for it, and a request that cannot read it should fail.

Throttling and shedding are middleware rather than a policy, because they have to happen before the request reaches anything expensive.

```csharp
builder.Services.AddRateLimiter(options =>
{
    // A refusal, not a queue: 503 now beats a timeout in thirty seconds.
    options.RejectionStatusCode = StatusCodes.Status503ServiceUnavailable;
    options.OnRejected = async (context, token) =>
    {
        context.HttpContext.Response.Headers.RetryAfter = "2";
        await context.HttpContext.Response.WriteAsync("busy", token);
    };

    options.AddTokenBucketLimiter("browse", limiter =>
    {
        limiter.TokenLimit = 40;
        limiter.TokensPerPeriod = 20;
        limiter.ReplenishmentPeriod = TimeSpan.FromSeconds(1);
        limiter.QueueLimit = 0;
    });
});

app.MapGet("/products/{id}", GetProduct).RequireRateLimiting("browse");
app.MapPost("/checkout", Checkout); // never shed
```

`QueueLimit = 0` is the whole argument in one line: an over-capacity request is refused immediately instead of waiting for a token it may never get. Note that only the browse endpoint is limited. Checkout is left alone deliberately, because shedding without a priority rule refuses the traffic that pays for the servers.

The planned smaller shape is a feature flag, and it is worth building before you need it. A `core only` switch that turns off recommendations, related items and the personalised banner in one move gives an operator something to do at three in the morning other than restarting things, and it converts a page that would have timed out into a page that loads. `Microsoft.FeatureManagement` covers this well enough; the important part is not the library but that the flag exists, is documented, and has been turned on once in an exercise, so nobody discovers during the incident that the view still calls the recommendation service directly.
