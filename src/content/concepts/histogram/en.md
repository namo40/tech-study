---
title: "Histogram"
summary: "A histogram stores a measurement as counts per bucket rather than as individual observations, which is what makes percentiles computable at fixed cost. Bucket boundaries set the precision, and because counts add across instances, a fleet percentile is read from merged buckets rather than from averaged percentiles."
category: "Requirements and quality attributes"
tags: ["metric"]
level: 4
scene: tail-latency
sceneStep: 4
related:
  - label: Tail Latency
    slug: tail-latency
  - label: p95
    slug: p95
  - label: p99
    slug: p99
  - label: Latency
    slug: latency
  - label: Sampling
    slug: sampling
  - label: OpenTelemetry
    slug: opentelemetry
references:
  - title: "Creating metrics in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/metrics-instrumentation
  - title: "Histograms and summaries"
    url: https://prometheus.io/docs/practices/histograms/
---

The scene's fourth step sets the target on p99 and then reads the histogram to see whether the ceiling clears it. The histogram is what makes that reading possible at all. Instead of keeping every observation, you keep one counter per bucket and increment whichever bucket the observation falls into, so a million requests cost the same memory as a thousand. A percentile is then a walk: accumulate the counts from the bottom until you pass 99 percent of the total, and the bucket you are standing in is the answer. Nothing about that requires the original values, which is the whole trick.

Bucket boundaries are therefore the precision control, and they are a design decision rather than a default to accept. A percentile lands inside a bucket rather than on a value, so it is reported as that bucket's edge or as an interpolation across it, and a bucket running from 100 ms to 500 ms can only ever say the answer is somewhere in there. Boundaries need to be dense where your target sits and may be sparse elsewhere. `Histogram<T>` itself has no buckets: the explicit ones come from the OpenTelemetry SDK's default aggregation, or from the boundaries the instrument suggests through `InstrumentAdvice<T>.HistogramBucketBoundaries`. Either way they are a fixed list of edges, and the default list is unit-agnostic, so read in milliseconds it clusters under a second, which suits an HTTP handler and suits nothing else; exponential bucket histograms pick a scale automatically so the relative error stays constant across the range, which is what you want when the same instrument has to record 2 ms and 20 s.

Counts add, and that is the property that makes histograms the right shape for a fleet rather than a single process. Bucket counters from ten instances sum into one histogram whose percentiles belong to the ten together, whereas ten p99 values have no legal way to be combined into anything. So the order of operations matters: each instance exports buckets, the backend merges buckets, and the percentile is computed last, at query time, for whichever grouping and window someone asked for. An instance that computes the percentile itself and exports only that number has thrown away every question except the one it already answered.

What a histogram costs is buckets multiplied by label cardinality, because every bucket of every label combination is a separate time series. Ten buckets and a status code are cheap; ten buckets and a customer id will be the most expensive object in the metrics system, and the usual sign of it is a backend bill that grows with your user count. Keep the labels bounded and the bucket list short enough to justify each edge. Finally, a histogram describes the shape but can never say which request was slow: exemplars close that gap by attaching a sampled trace id to a bucket, so the bar sitting at 400 ms becomes a link into one of the traces that put it there.
