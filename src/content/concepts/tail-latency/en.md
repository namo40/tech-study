---
title: "Tail Latency"
summary: "Tail latency is what the slowest few percent of requests experience. The average hides it, p99 measures it, and fan-out turns it into the latency most users actually feel."
category: "Requirements and quality attributes"
tags: ["latency", "metric"]
scene: tail-latency
steps:
  - title: "One slow request in a hundred"
    text: "The mean says 62 ms and p50 says 44. p99 says 400, because the tail is where the slow requests live."
  - title: "Fan-out"
    text: "A page that makes ten calls waits for the slowest one. With a 1% tail the maths says one page in ten; with the tail this service has, two of these three pages did."
  - title: "Hedge"
    text: "After the p95 wait, send a second copy to another replica and take whichever answers first. Cap hedges at a few percent of traffic — the third page here is over budget and eats the whole tail — or you have doubled the load on a slow service."
  - title: "Set the target on p99"
    text: "A timeout with a fallback puts a ceiling on the tail, and the p99 line tells you whether that ceiling is below your target. Here it is not, and that is the next thing to fix."
related:
  - label: Latency
    slug: latency
  - label: p50
    slug: p50
  - label: p95
    slug: p95
  - label: p99
    slug: p99
  - label: Hedging
    slug: hedging
  - label: Timeout
    slug: timeout
  - label: Fallback
    slug: fallback
  - label: SLO
    slug: slo
  - label: Histogram
    slug: histogram
  - label: Aggregator
    slug: aggregator
references:
  - title: Build resilient HTTP apps with .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience
  - title: Creating metrics in .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/metrics-instrumentation
  - title: The Tail at Scale
    url: https://research.google/pubs/the-tail-at-scale/
---

## When to use

- Any service with a latency objective. Measure p50, p95 and p99 for each endpoint and never only the mean, because one slow request in a hundred moves p99 and leaves the mean about where it was.
- Any request that fans out to several backends. The page waits for the slowest of its calls, so the backends' tails decide what the page costs and their medians barely matter.

## Cautions

- Hedging and retries amplify load. Give them a budget of a few percent of traffic, and only send a second copy of a call that is safe to repeat.
- A timeout without a fallback turns a slow answer into an error. Decide what the caller gets instead before you set one.
- Reduce fan-out where you can. Fewer, larger calls beat many small ones once there is a tail.
- Report histograms rather than averages. An average cannot be turned back into a percentile, and an average of averages is not even an average.

## In .NET

```csharp
// Hedge slow calls: after 80 ms (about p95), send one more and take the first answer.
builder.Services
    .AddHttpClient("catalog", client => client.BaseAddress = new Uri("https://catalog.internal"))
    .AddResilienceHandler("catalog-tail", pipeline =>
    {
        pipeline.AddHedging(new HttpHedgingStrategyOptions
        {
            MaxHedgedAttempts = 1,
            Delay = TimeSpan.FromMilliseconds(80),
        });
        pipeline.AddTimeout(TimeSpan.FromMilliseconds(250));
    });

// Measure the tail: a histogram, read as p50 / p95 / p99 in your metrics backend.
var meter = new Meter("Shop.Checkout");
var checkoutDuration = meter.CreateHistogram<double>("checkout.duration", unit: "ms");
checkoutDuration.Record(stopwatch.Elapsed.TotalMilliseconds);
```

That pipeline re-sends to the same `BaseAddress`. To hedge to a different replica rather than to the same address, use `AddStandardHedgingHandler` instead and give it a routing strategy, which is what picks the second endpoint.

ASP.NET Core and `HttpClient` already emit `http.server.request.duration` and `http.client.request.duration` as histograms, so collecting them with OpenTelemetry gives you p99 per endpoint without writing any instrumentation of your own.
