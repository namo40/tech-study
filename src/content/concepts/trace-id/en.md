---
title: "Trace ID"
summary: "A trace id is the 16-byte value every span in one trace carries, so that spans recorded by different processes can be gathered back into a single request. It travels in the W3C `traceparent` header and belongs in every log line the request produces."
category: "Observability and operations"
scene: distributed-tracing
sceneStep: 2
related:
  - label: Distributed Tracing
    slug: distributed-tracing
  - label: Trace
    slug: trace
  - label: Span
    slug: span
  - label: Span ID
    slug: span-id
  - label: Correlation ID
    slug: correlation-id
  - label: Context Propagation
    slug: context-propagation
  - label: Structured Logging
    slug: structured-logging
references:
  - title: "W3C Trace Context"
    url: https://www.w3.org/TR/trace-context/
  - title: "Distributed tracing concepts in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/distributed-tracing-concepts
  - title: "Logging in .NET: log scopes"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/logging
---

In the second step of the scene the panel is empty and says `no trace id` until the gateway takes the request. The moment it does, an id appears and three bars become possible. That order matters: the id is not a label added to a trace afterwards, it is the thing that makes a trace exist at all. Before it, there are three services logging into three different files; after it, there is one request with three parts.

The value itself is sixteen random bytes, written as thirty-two hex characters. It is minted once, by the first instrumented component the request meets, and copied unchanged onto every span downstream. Randomness is the whole design: nothing coordinates the minting, so uniqueness has to come from the size of the space rather than from a registry, and a collision at that width is not a thing you plan for.

It travels in `traceparent`, which packs four fields into one header value: the version, the trace id, the id of the span that is sending, and one byte of flags whose low bit says whether this trace is being sampled. That last bit is why head sampling is a decision made once and respected by everyone downstream: a service that receives `traceparent` with the sampled flag off will not record spans for it, so nobody has to be asked twice.

The best return on a trace id is outside tracing. Put it on every log line the request produces and the log store becomes searchable by request: one query, every service, in order. In ASP.NET Core the value is already there as `Activity.Current?.TraceId`, and the default logging configuration writes it into scopes, so a structured logger picks it up without any code. Returning it to the caller in a response header is what turns a support ticket into a lookup instead of a reconstruction.

Two things to keep straight. A trace id is not a correlation id you invent: if you already have a business correlation id, put it on the root span as an attribute rather than replacing the trace id with it, because the two answer different questions. And a trace id is not a secret, but it is a strong join key, so it should not be used as an authorization token or as anything a client is trusted to choose.
