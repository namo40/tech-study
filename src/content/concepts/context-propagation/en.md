---
title: "Context Propagation"
summary: "Context propagation is copying the trace context onto whatever leaves the process: an HTTP header, a gRPC metadata entry, a message property. It is the only reason a trace survives a process boundary, and the first hop that skips it cuts the trace in half."
category: "Observability and operations"
scene: distributed-tracing
sceneStep: 3
related:
  - label: Distributed Tracing
    slug: distributed-tracing
  - label: Trace
    slug: trace
  - label: Trace ID
    slug: trace-id
  - label: Baggage
    slug: baggage
  - label: Competing Consumers
    slug: competing-consumers
  - label: OpenTelemetry
    slug: opentelemetry
  - label: ActivitySource
    slug: activitysource
references:
  - title: "W3C Trace Context"
    url: https://www.w3.org/TR/trace-context/
  - title: "Distributed tracing in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/distributed-tracing
  - title: "OpenTelemetry: context propagation"
    url: https://opentelemetry.io/docs/concepts/context-propagation/
---

The third step of the scene is about the one place propagation is easy to lose. Over HTTP the plate rides along with the request and the trace stays whole without anyone writing code, because the client instrumentation writes `traceparent` on the way out and the server instrumentation reads it on the way in. Then orders publishes a message, and the request that produced it goes home. Whatever happens to that message later is only part of the same trace if the context was written onto the message itself.

The mechanism is deliberately dull. Propagation is inject and extract over a carrier: inject writes the current context as key-value pairs into whatever the transport can carry, and extract reads them back and gives you a context to start a span from. The standard names are `traceparent` for the ids and the sampled flag, `tracestate` for vendor-specific additions, and `baggage` for your own key-values. Because the format is a W3C standard, a request that crosses from a .NET service to a Go service to a managed gateway keeps one trace id through all of it.

Two details decide whether it works in practice. The first is that in-process propagation is separate from the wire: within a process, `Activity.Current` flows on the async execution context, so a child span finds its parent by itself, but that flow is broken by anything that hands the work over rather than awaiting it: a channel consumed by a background service, a thread you started yourself, or code that suppressed the execution context. A fire-and-forget `Task.Run` is the opposite trap. It captures the execution context, so `Activity.Current` does flow into it — and the span it starts then hangs under a request span that closed minutes ago, which a viewer draws as a parent lasting far longer than the request did. The second is that a message consumer usually should not make the producing span its parent. It starts after that span closed, and often after the request went home, so it belongs to the trace as a link.

The failure mode is quiet, which is what makes it worth a step of its own. Nothing errors when a hop drops the header. You get two traces instead of one, both of which look complete, and the missing hop shows up as an absence you have to notice rather than as a red bar. The usual culprits are hand-written HTTP clients that build requests from scratch, message envelopes that copy only the fields the schema knows about, and any component that unwraps and re-wraps a payload.

In .NET, `AddHttpClientInstrumentation` covers outgoing HTTP and `AddAspNetCoreInstrumentation` covers incoming, so the whole synchronous half is free. For messaging, either use a library that injects and extracts for you, or do it explicitly with `Propagators.DefaultTextMapPropagator` and carry the resulting dictionary in the transport's own header collection, never in the body.
