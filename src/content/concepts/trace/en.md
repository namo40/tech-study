---
title: "Trace"
summary: "A trace is everything one request set off, gathered under a single id. It is a tree of spans with one root, and drawn against a clock it becomes the waterfall that says which hop the time went into."
category: "Observability and operations"
scene: distributed-tracing
sceneStep: 2
related:
  - label: Distributed Tracing
    slug: distributed-tracing
  - label: Span
    slug: span
  - label: Trace ID
    slug: trace-id
  - label: Context Propagation
    slug: context-propagation
  - label: Baggage
    slug: baggage
  - label: Sampling
    slug: sampling
  - label: OpenTelemetry
    slug: opentelemetry
  - label: Tail Latency
    slug: tail-latency
references:
  - title: "Distributed tracing in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/distributed-tracing
  - title: "W3C Trace Context"
    url: https://www.w3.org/TR/trace-context/
  - title: "OpenTelemetry: traces"
    url: https://opentelemetry.io/docs/concepts/signals/traces/
---

The second step of the scene is one trace being assembled while you watch. The gateway takes the request, mints an id, and opens the root span; orders opens a child under it; payments opens a child under that. Three bars appear in the panel, each starting where its hop started and stopping where its hop answered, and the shape they make is the trace.

What makes it a trace rather than three unrelated recordings is that all three carry the same id and each one names its parent. The id is what lets a backend collect spans that arrived from three different processes, possibly seconds apart and out of order, and the parent is what turns that pile into a tree. Nothing about the tree is transmitted: each span reports only itself and who its parent was, and the shape is reconstructed at the far end.

The waterfall is just that tree drawn against a clock, and it is worth being precise about what it shows. A child bar sitting entirely inside its parent means the parent was waiting on it, and the parent's own width minus its children is the time the parent spent doing its own work. In the scene the root runs about 1,167 ms, `charge` accounts for 800 of them, and the rest is network legs plus a few milliseconds of work in each service. That reading is the whole reason to have traces at all: it is an answer, not a hint.

A trace has exactly one root, which is the span with no parent, and it ends when the last span in it ends. That is later than most people expect. An asynchronous consumer picked up through a queue belongs to the same trace but starts long after the request went home, which is why the scene links it rather than nesting it, and why the "duration" a viewer shows for a trace is the span of the whole tree rather than what the caller waited.

The practical limits are worth knowing. A trace is bounded by propagation: it reaches exactly as far as the context does, and stops dead at the first hop that drops the header. It is also bounded by sampling, which is a decision about traces, not about spans. Either the whole trace is kept or none of it is, because half a trace answers nothing.
