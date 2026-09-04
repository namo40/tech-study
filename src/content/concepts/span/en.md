---
title: "Span"
summary: "A span is one unit of work inside a trace: a name, a start, an end, the span that called it, and a handful of attributes. It is the only thing a service actually records, and everything a trace viewer shows is assembled from them."
category: "Observability and operations"
scene: distributed-tracing
sceneStep: 2
related:
  - label: Distributed Tracing
    slug: distributed-tracing
  - label: Trace
    slug: trace
  - label: Trace ID
    slug: trace-id
  - label: Span ID
    slug: span-id
  - label: ActivitySource
    slug: activitysource
  - label: Context Propagation
    slug: context-propagation
  - label: Structured Logging
    slug: structured-logging
references:
  - title: "Distributed tracing concepts in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/distributed-tracing-concepts
  - title: "OpenTelemetry: traces"
    url: https://opentelemetry.io/docs/concepts/signals/traces/
  - title: "System.Diagnostics.Activity"
    url: https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.activity
---

Watch one bar in the second step of the scene. It appears the moment the request reaches a service, it grows for exactly as long as that service is holding the request, and it stops when the answer leaves. That is a span, and the bar is not an illustration of it: start and end are the two facts a span is made of, and the length is the subtraction.

Around those two timestamps a span carries a name, a kind, an id of its own, the id of its parent, a status, and attributes. The name should describe the operation and not the instance, so `GET /orders/{id}` rather than `GET /orders/4197`, because a name with an id baked into it produces a million distinct operations that can never be aggregated. The kind says whether this was a server handling a call, a client making one, a producer, a consumer, or internal work, and it is what lets a viewer tell the two ends of one network hop apart.

Attributes are the part people overspend on. A few well-chosen keys pay for themselves: the route template, the status code, the database system and statement shape, the queue name, the tenant. Anything unbounded does not belong there, because attributes are recorded on every sampled span and they are indexed. When you want the detail, log it with the trace id attached and let the log store carry the volume. That division, spans for the shape and logs for the detail, is what keeps tracing affordable.

A span also holds the error, if there was one. Setting the status to error and recording the exception is what makes a failed hop findable later, and it is the signal tail sampling uses to decide the trace was worth keeping. A span that swallowed an exception and returned a fallback should still say so, otherwise the trace claims everything was fine.

In .NET a span is an `Activity`. `ActivitySource.StartActivity` returns one, or returns null when nobody is listening, which is why every example writes `activity?.SetTag(...)`. Disposing the activity is what stops it, so the `using` is the end timestamp, and a span you forget to dispose never ends, is never exported, and simply disappears from the trace. The parent is picked up from `Activity.Current` on the same async flow, which is how a child span inside a request handler nests itself without being told anything.
