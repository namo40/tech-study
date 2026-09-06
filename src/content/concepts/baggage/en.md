---
title: "Baggage"
summary: "Baggage is a small set of key-values that travels with the trace context, so a value set at the edge is readable everywhere downstream without being added to every method signature. It is convenient, it is broadcast to everyone you call, and it should stay tiny."
category: "Observability and operations"
level: 5
scene: distributed-tracing
sceneStep: 3
related:
  - label: Distributed Tracing
    slug: distributed-tracing
  - label: Context Propagation
    slug: context-propagation
  - label: Trace
    slug: trace
  - label: Span
    slug: span
  - label: Trace ID
    slug: trace-id
  - label: OpenTelemetry
    slug: opentelemetry
references:
  - title: "W3C Baggage"
    url: https://www.w3.org/TR/baggage/
  - title: "OpenTelemetry: baggage"
    url: https://opentelemetry.io/docs/concepts/signals/baggage/
  - title: "Distributed tracing in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/distributed-tracing
---

In the third step of the scene the plate the request carries says `tp + baggage`, and it keeps saying it across the queue and into the call the worker makes afterwards. When that call lands, payments writes `tenant=acme` in its log. Nobody passed the tenant down as a parameter; it was set once, at the edge, and every service after that could read it.

That is the whole feature. Baggage is a set of short key-value pairs attached to the context and carried in the `baggage` header alongside `traceparent`. The typical uses are the ones the scene shows: the tenant, so a shared service can attribute work; a synthetic-traffic flag, so load-test requests can be told from real ones; a feature or experiment cohort, so a downstream decision matches the one made upstream.

The cost is that baggage is broadcast rather than addressed. Every hop the context reaches sees it, including services owned by other teams and, if you propagate to external calls, third parties. Every entry is bytes on every request in the trace, and the standards put deliberately modest limits on the total size. The rules that follow are short: keep it to a couple of keys, keep the values small and bounded, never put anything secret or personal in it, and strip it at the boundary where your system stops.

Baggage is also not automatically on your spans. Being able to read a value is not the same as having it recorded, and a viewer will not show you a baggage entry unless something copied it onto a span as an attribute. Doing that deliberately, on the spans where the value is worth querying by, is better than a processor that copies everything onto everything, which is how a small convenience turns into a large bill.

In .NET, `Baggage.SetBaggage("tenant", value)` and `Baggage.GetBaggage("tenant")` are the API, and the entries flow on the async context the same way `Activity.Current` does. Propagation on the wire is handled by the composite propagator, which carries baggage together with the trace context, so HTTP hops need no code and message hops need the same inject and extract as the rest of the context. `Activity` also has `AddBaggage`, an older BCL-level spelling of the same idea, but the two are not one store: the OpenTelemetry propagator injects `Baggage.Current` and nothing else, so an entry added through `Activity.AddBaggage` never reaches the wire. The OpenTelemetry API README is explicit about it — the recommended way to add baggage is `Baggage.SetBaggage()`, and OpenTelemetry users should not use `Activity.AddBaggage`.

The rule of thumb that keeps this out of trouble: baggage is for values that influence or explain behaviour everywhere, not for passing data. If a downstream service needs a value in order to do its job, put it in the request. If everyone benefits from knowing it and nobody would be harmed by seeing it, baggage is the right place.
