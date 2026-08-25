---
title: "Distributed Tracing"
summary: "Distributed tracing follows one request across every service it touches. A trace id travels with the request, each hop records a span with its own start and end, and the spans assemble into a timeline that shows where the time actually went."
category: "Observability and operations"
scene: distributed-tracing
steps:
  - title: "Three logs, no answer"
    text: "A request crosses three services and comes back slow. Each service logged something, but nothing ties the three lines together, so nobody can say which hop took the time."
  - title: "One id, many spans"
    text: "The gateway mints a trace id and passes it along in a header. Every hop records a span with its own start and end. Laid out in time, the spans show the 800 ms sitting inside payments."
  - title: "Across the message"
    text: "The context rides the message headers as well as the HTTP headers, so the worker that picks the job up later still belongs to the same trace, linked rather than nested. Baggage carries a few key-values, like the tenant, the whole way."
  - title: "Sample"
    text: "Keeping every trace costs more than the system it watches. Head sampling decides at the start and is cheap, but it can throw away the one slow request. Tail sampling decides at the end and keeps the errors and the outliers."
related:
  - label: Trace
    slug: trace
  - label: Span
    slug: span
  - label: Trace ID
    slug: trace-id
  - label: Context Propagation
    slug: context-propagation
  - label: Baggage
    slug: baggage
  - label: OpenTelemetry
    slug: opentelemetry
  - label: ActivitySource
    slug: activitysource
  - label: Correlation ID
    slug: correlation-id
  - label: Structured Logging
    slug: structured-logging
  - label: Sampling
    slug: sampling
  - label: Tail Latency
    slug: tail-latency
  - label: Competing Consumers
    slug: competing-consumers
references:
  - title: ".NET observability with OpenTelemetry"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/observability-with-otel
  - title: "Distributed tracing in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/distributed-tracing
  - title: "W3C Trace Context"
    url: https://www.w3.org/TR/trace-context/
---

## When to use

- Any request that crosses a process boundary: gateway to service, service to service, service to worker through a queue. The moment one log file stops holding the whole story, tracing is what puts it back together.
- Latency investigations. A waterfall answers "which hop" in seconds, where three log files and a shared timestamp answer it in an afternoon, badly.
- Error attribution across a call chain, where the service that reported the failure is rarely the service that caused it.
- Dependency maps and service-level objectives, both of which fall out of spans you were already recording rather than needing their own instrumentation.

## Cautions

- Propagate the W3C `traceparent` header, and `baggage` if you use it, on every outbound call and every message you publish. One hop that drops it breaks the trace into two unrelated halves, and the break is invisible until you go looking for it.
- Spans are not logs. Record a few attributes per span and put the detail in log lines correlated by trace id. A span with fifty attributes on it costs on every request, forever.
- Sample deliberately. Head sampling at the edge keeps volume down but decides before it knows whether the request was interesting; tail sampling in the collector costs a buffer but keeps the errors and the slow calls. Most systems want both.
- Baggage travels everywhere the context does, including to third parties you call. Keep it to a few short keys and never put anything secret or personal in it.
- Use the built-in instrumentation before writing custom spans. ASP.NET Core, `HttpClient`, EF Core and the major messaging libraries already produce well-named spans with the right parent, and hand-rolled ones usually duplicate them.
- A trace across a queue is a link, not a parent. The consumer often starts long after the producing span closed, and forcing it to nest produces a span that appears to last for hours.

## In .NET

.NET has tracing in the base class library. `Activity` and `ActivitySource` in `System.Diagnostics` are the API, and OpenTelemetry is the configuration and export layer on top of them, so a library that only references the BCL still shows up in your traces.

```csharp
builder.Services.AddOpenTelemetry()
    .ConfigureResource(r => r.AddService("orders"))
    .WithTracing(t => t
        .AddAspNetCoreInstrumentation()
        .AddHttpClientInstrumentation()
        .AddSource("Shop.Orders")
        .AddOtlpExporter());

// A custom span inside the built-in request span.
private static readonly ActivitySource Source = new("Shop.Orders");

public async Task PlaceAsync(Order order, CancellationToken ct)
{
    using var activity = Source.StartActivity("place order");
    activity?.SetTag("order.id", order.Id);
    Baggage.SetBaggage("tenant", order.TenantId);

    // Carry the context on the message so the consumer continues the same trace.
    var headers = new Dictionary<string, string>();
    Propagators.DefaultTextMapPropagator.Inject(
        new PropagationContext(activity!.Context, Baggage.Current), headers,
        (carrier, key, value) => carrier[key] = value);
    await bus.PublishAsync(new OrderPlaced(order.Id), headers, ct);
}
```

`AddAspNetCoreInstrumentation` reads `traceparent` off the incoming request and makes the request span a child of whatever sent it, and `AddHttpClientInstrumentation` writes the header back out on every outgoing call, so an HTTP-only chain needs no propagation code at all. The `ActivitySource` name you pass to `AddSource` has to match the one the code constructs, or your custom spans are created and then dropped on the floor.

The consumer side of a message reads the headers back with `Propagators.DefaultTextMapPropagator.Extract`, starts an activity with `ActivityKind.Consumer`, and passes the extracted context as a link rather than as the parent when the work is genuinely detached from the request that queued it. Libraries such as MassTransit and the Azure Service Bus SDK do the inject and extract themselves, so the only thing left to get right is not swallowing the headers in your own envelope format.

Sampling is configured next to the exporter: `SetSampler(new TraceIdRatioBasedSampler(0.1))` is head sampling in the process, and a tail sampling processor in the OpenTelemetry Collector is where the decision to keep errors and outliers belongs, because only the collector has seen the whole trace.
