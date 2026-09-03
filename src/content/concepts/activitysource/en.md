---
title: "ActivitySource"
summary: "ActivitySource is the .NET object that creates spans: a named factory you construct once and keep in a static field, whose name is the string a collector subscribes to. When nobody is subscribed, StartActivity returns null, so instrumentation left in the code costs almost nothing."
category: "Observability and operations"
scene: distributed-tracing
sceneStep: 2
related:
  - label: Distributed Tracing
    slug: distributed-tracing
  - label: Span
    slug: span
  - label: Trace
    slug: trace
  - label: OpenTelemetry
    slug: opentelemetry
  - label: Context Propagation
    slug: context-propagation
references:
  - title: "Add distributed tracing instrumentation"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/distributed-tracing-instrumentation-walkthroughs
  - title: ".NET observability with OpenTelemetry"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/observability-with-otel
---

In the scene's second step every hop records a span with its own start and end. In .NET the span is an `Activity`, and the thing that makes one is an `ActivitySource`: a named factory, constructed once and held in a static readonly field for the life of the process. Nothing about it is per-request, and you are not meant to have many of them. The usual shape is one source per library or per component, named after the assembly it lives in, because that name is the unit everything else works in terms of.

`new ActivitySource("Contoso.Orders")` publishes under that string, with an optional version alongside it. A collector turns the instrumentation on by naming the same string back: in OpenTelemetry that is `AddSource("Contoso.Orders")`, or `AddSource("Contoso.*")` when a whole family should be picked up. The indirection is the whole design. A library ships instrumentation with no reference to any tracing SDK and no opinion about where the data goes, and the application decides at startup which sources it wants to hear. It also means the most common tracing failure is a spelling mistake: a service that shows up in a trace with no spans of its own has usually forgotten to name its source, and nothing anywhere reports an error.

`StartActivity` returns `Activity?`, and the null case is not an error path — it is what happens when nobody is listening. No object is allocated and no timestamps are taken, which is why the `activity?.SetTag(...)` in every example is the disabled path costing next to nothing. Listeners are also where sampling is decided: an `ActivityListener` is consulted for each candidate and answers with how much to record, from nothing at all up to a fully recorded and sampled activity, so a source that is subscribed but sampled out stays cheap too. When you want to skip expensive work that exists only to enrich a span, `ActivitySource.HasListeners()` answers that question directly.

A few habits keep this tidy. Construct sources statically and never per request, since each construction registers with the runtime and is meant to outlive the call. Give the constructor a version if the component ships one: the name and version travel with every span as its instrumentation scope, which is how a backend tells your spans apart from the HTTP client's. And treat the name as public API, because changing it silently unsubscribes every collector configured against the old string. The wiring on the other side of the subscription — exporters, resource attributes, the SDK that turns listened-to activities into exported spans — belongs to OpenTelemetry; ActivitySource is only the end of the pipe your own code holds.
