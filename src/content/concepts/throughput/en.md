---
title: "Throughput"
summary: "Throughput is how much work finishes per second, which is a different axis from latency: utilization says how busy the resource is, saturation is the queue that forms when arrivals outrun capacity, and near the ceiling latency explodes long before throughput gains another unit."
category: "Requirements and quality attributes"
tags: ["metric", "overload"]
scene: throughput
steps:
  - title: "Throughput and latency are different axes"
    text: "One slot that turns a job over quickly serves ten per second — so do four slots that each take four times as long. Fast responses do not guarantee volume, and volume does not require speed. A system has both numbers."
  - title: "Utilization is how busy; throughput is how much gets done"
    text: "Push arrivals up and both climb together — at 40% busy, everything that arrives leaves promptly; at 80%, still fine, with less room for bursts. Utilization is the cheapest early signal you have, because it tells you how much ceiling is left before anything hurts."
  - title: "Saturation is the queue — and latency lives in the queue"
    text: "Arrivals cross capacity and the line grows: throughput flatlines at the ceiling while waiting time explodes, because every new request now stands behind everyone already waiting. The server is 100% busy and getting nothing extra done. Full is not fast; full is where slow begins."
  - title: "The ceiling belongs to the bottleneck; headroom is a design choice"
    text: "More capacity raises the ceiling, and the pressure that saturated four slots sits at 80% of six. Running near 80% buys the burst room that keeps queues short: throughput is bought at the bottleneck, peace with headroom."
related:
  - label: Utilization
    slug: utilization
  - label: Saturation
    slug: saturation
  - label: Tail Latency
    slug: tail-latency
  - label: p95
    slug: p95
  - label: p99
    slug: p99
  - label: Backpressure
    slug: backpressure
  - label: Bounded Concurrency
    slug: bounded-concurrency
  - label: Load Shedding
    slug: load-shedding
  - label: Thread Pool
    slug: thread-pool
  - label: Database Connection Pool
    slug: database-connection-pool
  - label: Elasticity
    slug: elasticity
  - label: Horizontal Pod Autoscaler
    slug: horizontal-pod-autoscaler
  - label: Batching
    slug: batching
references:
  - title: "Performance efficiency design principles"
    url: https://learn.microsoft.com/en-us/azure/well-architected/performance-efficiency/principles
  - title: "The USE Method"
    url: https://www.brendangregg.com/usemethod.html
  - title: "Well-known EventCounters in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/available-counters
---

## When to use

- Sizing anything. Pools, replicas, partitions, connection limits, worker counts: every one of those questions is "how much work per second do we need, and what is the narrowest stage between here and there". A size chosen without a throughput number is a size chosen by how it felt during the demo.
- Reading a load test. The knee in the latency curve *is* saturation, and it is the only interesting point on the chart. Below it, throughput rises with load and latency barely moves. Above it, throughput stops rising and latency goes wherever the queue goes. Knowing where the knee sits tells you both the ceiling and the safe operating band.
- Designing an SLO. A latency target quietly caps utilization, because waiting time climbs steeply as a resource approaches full. "p99 under 200 ms" and "run the fleet at 95%" are not two requirements; they are one requirement and one contradiction of it.
- Queue-backed workers. When arrivals and service are both rates, the backlog's fate is decided by their difference and nothing else. If arrivals exceed service for long enough, no amount of queue tuning helps, and the only real questions are whether to add capacity or to accept less work.
- Any time somebody says "the system is slow". Slow at what? A saturated resource is slow in a way that adding threads makes worse, and a genuinely slow dependency is slow in a way that adding threads does not fix either. Throughput and utilization together tell you which conversation you are in.

## Cautions

- Throughput and latency answer different questions, so report both and never average them into one score. A number that mixes them cannot go up or down for a reason you can act on. The scene's first step is the whole problem in miniature: two systems with the same throughput and a fourfold difference in latency, and no single figure that tells them apart.
- Utilization near 100% is not efficiency, it is a queue about to happen. Waiting time is roughly proportional to the reciprocal of what is left, so the last few percent of a resource cost far more latency than the first eighty. Target headroom on purpose — commonly 70–80% at peak — and treat "we got it to 95%" as a report of fragility rather than of thrift.
- The bottleneck sets the ceiling, so optimising anything else changes the bill and nothing else. Doubling the web tier in front of a saturated database buys a longer queue, not more work finished. Find the stage that is at 100% while the others are not, and spend there.
- Queues hide in every layer and each one adds wait. The thread pool has one, the connection pool has one, the network card has one, the disk has one, the broker has one. A request that looks fast at every span you instrumented can still be slow, because the time was spent in a queue nobody drew.
- Little's law is the sanity check. Queue length equals arrival rate times wait, so if two of the three numbers you are looking at do not imply the third, one of them is measured wrong or the system is not in the steady state you assumed. It costs one multiplication and catches a surprising amount of nonsense.
- Goodput is not throughput. Retries, timeouts that already gave up, and responses nobody read all inflate the second number without moving the first. Under overload the gap widens fastest, exactly when the dashboard is most likely to be believed, so count work that was useful rather than work that was done.
- A rate without a window is not a measurement. "Two thousand a second" over a minute can be a flat two thousand or thirty seconds of four thousand and thirty seconds of nothing, and only one of those fits in a system sized for two thousand.

## In .NET

Measure before you argue. `dotnet-counters` gives you the three numbers this scene draws — the rate work is arriving, how much of a pool is in use, and how long the queue is — without a code change or a restart.

```bash
# Arrival rate, thread pool queue depth, and connection pool pressure, live.
dotnet-counters monitor --process-id 1234 \
  --counters System.Runtime,Microsoft.AspNetCore.Hosting,Microsoft.Data.SqlClient.EventSource
```

`Microsoft.AspNetCore.Hosting` reports `requests-per-second` and `current-requests`, which are your `in` and your in-flight count; `out` is what you have to compute from completions, and the gap between the two is the queue. `System.Runtime` reports `threadpool-queue-length`: anything persistently above zero means work is waiting for a thread, and that wait is latency you will not find in any span. Those are the EventCounter names. The same tool reads the newer `Meter` instruments, and they map the axes better: `http.server.active_requests` is the in-flight count, the count on the `http.server.request.duration` histogram is recorded at completion and so gives you `out` rather than `in`, and since .NET 9 `dotnet.thread_pool.queue.length` on `System.Runtime` is the queue depth.

For your own stages, publish rates and durations as a `Meter` so the same two axes exist per component rather than only at the edge.

```csharp
// One meter per stage, so the bottleneck names itself instead of being guessed.
private static readonly Meter Meter = new("Orders.Pipeline");
private static readonly Counter<long> Finished = Meter.CreateCounter<long>("orders.finished");
private static readonly Histogram<double> Wait =
    Meter.CreateHistogram<double>("orders.queue_wait", unit: "ms");
private static readonly UpDownCounter<int> InFlight =
    Meter.CreateUpDownCounter<int>("orders.in_flight");

public async Task<Receipt> HandleAsync(Order order, CancellationToken token)
{
    var queued = Stopwatch.GetTimestamp();
    await _gate.WaitAsync(token);          // the bounded stage: this is the queue
    Wait.Record(Stopwatch.GetElapsedTime(queued).TotalMilliseconds);
    InFlight.Add(1);
    try
    {
        var receipt = await _work.RunAsync(order, token);
        Finished.Add(1);                   // goodput: only what actually completed
        return receipt;
    }
    finally
    {
        InFlight.Add(-1);
        _gate.Release();
    }
}
```

Three habits make the numbers worth having. Load-test past the knee on purpose, because a test that stops at the comfortable band never tells you where the ceiling is or what the far side looks like. Record the wait separately from the work, because the sum of the two is the only latency your caller experiences and the two are fixed by completely different means. And fix the stage the numbers name: the one sitting at 100% while its neighbours idle is the ceiling, and every hour spent on the others buys nothing at all.
