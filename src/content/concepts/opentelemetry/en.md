---
title: "OpenTelemetry"
summary: "OpenTelemetry is the vendor-neutral standard for traces, metrics and logs: one set of APIs, one wire format and one propagated context, so instrumentation is written once and the backend that stores it stays a deployment-time choice."
category: "Observability and operations"
tags: ["metric"]
related:
  - label: Distributed Tracing
    slug: distributed-tracing
  - label: Span
    slug: span
  - label: Trace
    slug: trace
  - label: Baggage
    slug: baggage
  - label: Context Propagation
    slug: context-propagation
  - label: Structured Logging
    slug: structured-logging
  - label: Sampling
    slug: sampling
  - label: ActivitySource
    slug: activitysource
references:
  - title: OpenTelemetry Documentation
    url: https://opentelemetry.io/docs/
  - title: ".NET observability with OpenTelemetry"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/observability-with-otel
---

## When to use

- Adopt it when you want the instrumentation to outlive the vendor. The spans and metrics your code emits stay the same when the backend changes; only the exporter configuration moves. That is the whole promise, and it is worth having before the first contract renewal rather than during it.
- Reach for it when traces, metrics and logs need to answer one question together. Because all three carry the same trace id, a slow request can be opened as a span tree, matched against the latency histogram it fell in, and joined to the log lines the same request wrote, without anybody correlating timestamps by hand.
- Use it when a request crosses services written in different languages. The propagation format is the same everywhere, so a .NET gateway calling a Python worker calling a Java service produces one trace rather than three unrelated ones, which is the case where a house instrumentation library stops being cheaper.
- Standardise on it when several teams are naming the same thing differently. The semantic conventions give attribute names for HTTP, database and messaging operations, and shared names are what make a dashboard portable between services.

## Cautions

- It is a specification and an SDK, not a place to keep data. OpenTelemetry produces and exports the signals; where they are stored, how long they live and what a query costs are decisions you still make, and picking a backend late usually means discovering a retention bill late too.
- Cardinality is still your problem. The SDK will happily record a metric tagged with a user id or a full URL, and the cost lands in the backend as a series count that grows with traffic. Keep attribute values to bounded sets, and put the unbounded identifiers on spans, where they belong.
- Pin the semantic convention version you build dashboards against. Attribute names have changed across releases, and an upgrade that renames a tag breaks queries silently by returning an empty series rather than an error.
- Export in batches and keep the hot path out of it. The batch processor hands spans to a background exporter so request threads are not waiting on the collector, while the simple processor exports inline and is only appropriate in tests. An unreachable collector should degrade to dropped telemetry, never to blocked requests.

## In .NET

- The instrumentation API is the base class library, and OpenTelemetry is the export path. `ActivitySource` creates spans, `Activity` is a span, and `Meter` creates instruments; these are `System.Diagnostics` types that exist without any package reference. OpenTelemetry subscribes to them and ships what they produce, which is why instrumenting a library does not make it depend on OpenTelemetry.
- Registration is one builder with two branches, and the exporter is named once for both.

```csharp
builder.Services.AddOpenTelemetry()
    .ConfigureResource(resource => resource.AddService("checkout"))
    .WithTracing(tracing => tracing
        .AddAspNetCoreInstrumentation()
        .AddHttpClientInstrumentation()
        // Your own spans: the ActivitySource name, not a package.
        .AddSource("Contoso.Checkout")
        .AddOtlpExporter())
    .WithMetrics(metrics => metrics
        .AddAspNetCoreInstrumentation()
        .AddRuntimeInstrumentation()
        .AddOtlpExporter());
```

- The built-in instrumentation covers the boundaries before you write anything. ASP.NET Core produces server spans and the `http.server.request.duration` histogram, `HttpClient` produces the client spans that connect one service to the next, and the runtime package adds garbage collection and thread pool metrics, so the first useful trace arrives from configuration alone.
- Logs join the same pipeline through `ILogger`. Adding the OpenTelemetry logging provider stamps the active trace and span id onto every log record, which is what turns structured logging from a separate archive into another view of the same request.
