---
title: "Span ID"
summary: "A span id is the eight-byte name of one span. Paired with a trace id it addresses a single operation, copied into a child's parent field it draws one edge of the tree, and carried on a log line it says which part of the request wrote it."
category: "Observability and operations"
scene: distributed-tracing
sceneStep: 2
related:
  - label: Distributed Tracing
    slug: distributed-tracing
  - label: Trace ID
    slug: trace-id
  - label: Span
    slug: span
  - label: Trace
    slug: trace
  - label: Structured Logging
    slug: structured-logging
  - label: ActivitySource
    slug: activitysource
references:
  - title: "W3C Trace Context"
    url: https://www.w3.org/TR/trace-context/
  - title: "Distributed tracing concepts in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/distributed-tracing-concepts
---

Every hop in the scene's second step records a span, and each of those spans needs a name that something else can point at. The span id is that name: eight random bytes, written as sixteen hexadecimal characters, minted by whoever starts the span and meaningless outside it. It is deliberately half the width of a trace id, and the reason is a difference in scope rather than a saving. A trace id has to stay unique across everything a backend will ever store, so it is sized against that; a span id only has to be unique among the spans of one trace, which is a set of tens or hundreds, so sixteen characters is generous. The value is random rather than sequential, it is not derived from the operation or the service, and a span id of all zeros is not a value but the encoding of "none".

Because the scope is narrow, a span id on its own addresses nothing. The pair is the address: the trace id says which request, the span id says which operation within it, and a viewer or a query needs both to land on one bar. The second job the id does is structural. Each span records, beside its own id, the id of the span it was started under, and that single field is the whole of the parent-child relationship. Nothing transmits the tree, nothing knows the tree while the request is running, and the services involved never see each other's shapes; the backend receives a pile of spans that each name one other span and reassembles a tree by matching ids. A span whose parent field is empty is a root, which is how the top of a trace is recognised rather than announced.

On the wire the id lives in the third field of the `traceparent` header, and the field's meaning depends on which side of the hop you are standing on. What a service sends there is the id of the span currently doing the sending; what the next service reads there is the parent of the span it is about to start. Then it mints a fresh span id for that new span and puts its own value in the header it sends onward, so the same sixteen characters are an identity going out and a parent link coming in. In .NET the two roles are two properties on the same object, `Activity.Current?.SpanId` and `ParentSpanId`, and the propagator handles the copying, which is why instrumentation code almost never touches the header itself. The one case where it does is a boundary that carries no `traceparent`, a queue message or a batch handoff, where the id has to be put somewhere by hand or the chain simply ends and the next service becomes a new root.

The everyday payoff is in the logs. A trace id on a log line narrows a search to one request, which is already most of the value, and the span id narrows it further to one operation inside that request, which is what you want when the request called the same service twice, retried a hop, or ran three things in parallel and only one of them was slow. With both on the line, a bar in the trace viewer and a block of log lines are the same thing looked at from two sides, and structured logging is what makes that a field to filter on rather than text to grep. Two habits keep this clean. Log the pair rather than the trace id alone, since the trace id without the span id cannot tell two attempts apart. And do not lend the value to any other purpose: it is per-attempt and it changes on a retry. It can also be absent, and the two ways that happens are worth keeping apart. When nothing is listening at all, `StartActivity` returns null, no span is created and there is no id to log. When the trace was merely sampled out, the activity still exists and still carries a span id — it is only never exported. Either way, an idempotency key or a business correlation id has to come from somewhere else.
