---
title: "Sampling"
summary: "Sampling is the decision to keep some traces and throw the rest away, because recording every request costs more than the system being watched. Head sampling decides at the start and is cheap; tail sampling decides at the end and keeps the interesting ones."
category: "Observability and operations"
level: 5
scene: correlation-id
sceneStep: 4
related:
  - label: Correlation ID
    slug: correlation-id
  - label: Distributed Tracing
    slug: distributed-tracing
  - label: Structured Logging
    slug: structured-logging
  - label: Trace ID
    slug: trace-id
  - label: Trace
    slug: trace
  - label: Span
    slug: span
  - label: Context Propagation
    slug: context-propagation
references:
  - title: "OpenTelemetry sampling"
    url: https://opentelemetry.io/docs/concepts/sampling/
  - title: "Sampling in OpenTelemetry .NET"
    url: https://opentelemetry.io/docs/languages/dotnet/sampling/
  - title: ".NET distributed tracing concepts"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/distributed-tracing-concepts
  - title: "Tail sampling processor"
    url: https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/processor/tailsamplingprocessor
---

The last step of the scene shows a `sampling 10%` chip appear and the `trace` chip go out under a cross, while the log lines stay exactly where they were. That is the whole argument in one frame. Sampling is not a failure mode and not a misconfiguration; it is the normal, correct state of a tracing system under load, and the reason the correlation id in the logs is worth having on its own. On a busy day, the flow you are investigating may simply never have had a trace, and no amount of clicking in the tracing UI will produce one after the fact.

The reason it has to exist is arithmetic. A trace is many spans, each with attributes, events and links, and a service handling a few thousand requests a second produces more trace data than it produces business data. Keeping all of it costs storage, network and, less obviously, the CPU of the process being observed. So a sampler exists to make the volume a decision rather than an accident, and the only real question is where the decision gets made.

Head sampling decides at the beginning, before anything has happened. A ratio-based sampler hashes the trace id and keeps a fixed fraction, and because the decision travels in the `traceparent` sampled flag, every service downstream makes the same choice: a trace is kept whole or dropped whole, which is what stops half-traces from filling the backend. It is cheap, it is predictable, and it is blind. The request that took eight seconds and the request that threw had exactly the same chance of being kept as everything else, which is a strange property for a tool whose main use is investigating requests that took eight seconds and threw.

Tail sampling decides at the end, in a collector that has buffered the whole trace. Now the decision can be made on what actually happened: keep everything with an error, everything slower than a threshold, everything from a tenant currently under investigation, and a small percentage of the rest for a baseline. It answers the objection to head sampling exactly, and it costs a component that has to hold every in-flight trace in memory long enough to see it finish, sized for the peak rather than the average. Most systems that care end up with both: a generous head sample so the collector sees enough, and a tail policy that decides what survives.

There is a second kind of decision worth separating from the first. A sampler chooses whether to record; a filter chooses whether to instrument. Dropping health-check and static-asset spans at the source is not sampling, it is deciding those requests were never interesting, and doing it in an `ActivityListener` or with an instrumentation filter costs nothing at all, unlike deciding it in the collector after the data has already crossed the network.

What survives all of this is the log. Logs are usually kept whole, kept longer, and sampled far less aggressively than traces, and they are the only record that spans a flow which outlived its trace: a message that sat in a queue overnight, a job retried the next morning, a saga that ran for three days. That is the division of labour the fourth step draws. The trace answers "where did the time go" for the requests it happened to keep. The correlation id in the logs answers "what happened to this one" for every request, including the one the sampler dropped.

In .NET the head decision is a sampler on the tracer provider, and the useful form is one sampler wrapped in another: `.SetSampler(new ParentBasedSampler(new TraceIdRatioBasedSampler(0.1)))` keeps a tenth of the traces it starts and respects the decision an upstream caller already made for everything else. The default is already parent-based with an always-on root sampler, so a service that is never the root follows the caller without any configuration at all; the mistake is setting a bare `TraceIdRatioBasedSampler`, which re-rolls the dice at every hop and tears the trace in half. The `traceparent` header's sampled flag carries that decision, and `Activity.Recorded` is where your own code can read it, which matters because an unrecorded activity still exists and still propagates: the ids are there for you to log even when nothing is being exported. Tail sampling is not a library setting at all but a processor in the OpenTelemetry Collector, configured with policies on status code, latency and attributes, and it is worth remembering that it changes where your buffering and your peak memory live.
