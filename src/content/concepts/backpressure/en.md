---
title: "Backpressure"
summary: "Backpressure couples the producer's pace to the consumer's: a bounded buffer between them fills, pushes back, and slows the input — because a queue only buys time, and a bigger queue is just a longer lie."
category: "Resilience"
tags: ["overload", "queue"]
scene: backpressure
steps:
  - title: "In balance, the queue is nearly empty"
    text: "The producer sends at the pace the consumer drains, and the buffer holds a moment of work, not a backlog. Depth near zero is what healthy looks like."
  - title: "The queue absorbs the spike — for a while"
    text: "Input triples; the consumer keeps its steady pace, and downstream never feels the burst. But a queue only buys time. While input stays above output the depth only grows, and with it, every item's wait."
  - title: "A full buffer pushes back"
    text: "The bounded queue refuses to pretend: at capacity, the producer waits. That wait travels upstream — the admits limit steps down, fewer items in flight — until input matches what can be done. Backpressure is the system telling itself the truth."
  - title: "Or make the drain faster"
    text: "The consumer batches: many small items, one trip each way. Output doubles, a burst at the same rate replays, and the depth barely moves. Fix the rates, not the buffer — a bigger queue is just a longer lie."
related:
  - label: Queue-Based Load Leveling
    slug: queue-based-load-leveling
  - label: Bounded Concurrency
    slug: bounded-concurrency
  - label: Batching
    slug: batching
  - label: Web Queue Worker
    slug: web-queue-worker
  - label: Work Queue
    slug: work-queue
  - label: Competing Consumers
    slug: competing-consumers
  - label: Rate Limiter
    slug: rate-limiter
  - label: Bulkhead
    slug: bulkhead
  - label: Thread Pool
    slug: thread-pool
  - label: Concurrency Limiter
    slug: concurrency-limiter
  - label: Spike Test
    slug: spike-test
references:
  - title: "System.Threading.Channels"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/channels
  - title: "Queue-Based Load Leveling pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/queue-based-load-leveling
  - title: "BoundedChannelOptions class"
    url: https://learn.microsoft.com/en-us/dotnet/api/system.threading.channels.boundedchanneloptions
---

## When to use

- Any producer/consumer seam, inside a process or between services. Ingestion pipelines, log shippers, message pumps, channel-based workers, an `IHostedService` reading from a broker: wherever one side hands work to another side that is slower, there is a seam, and the only question is whether it has a limit.
- Whenever "we added a queue" was the fix. A queue is a shock absorber, not a capacity plan. If nobody can say what happens when it is full, the answer is that it grows until something else breaks, and the queue has converted a fast, obvious failure into a slow, confusing one.
- When latency matters more than acceptance. A bounded buffer makes the wait bounded too: depth times service time is the worst case, and you can write it on a dashboard. An unbounded one gives you no number to write down.
- At the edge, where the true source is. Backpressure only works if it reaches whoever is generating the work. Inside a process that is a blocking write; across a network it is a 429, a 503, a `Retry-After`, or a protocol that has flow control built in.
- When the alternative is dropping. Sometimes waiting is wrong and dropping is right — a metrics pipeline should shed samples rather than stall the application it measures. Both are policies you choose; the mistake is having neither, which is what an unbounded queue is.

## Cautions

- An unbounded queue is not a queue, it is a memory leak with a schedule. Under sustained overload it does not settle at some larger depth; it grows for as long as the overload lasts. The failure arrives later, as an out-of-memory kill or a latency that has crept past every timeout in the system, and by then the work in it is stale anyway.
- Choose the full-buffer policy on purpose. Wait, drop the oldest, drop the newest, reject the writer: each is a different business decision, and each is right somewhere. Waiting protects correctness and spreads the pain upstream. Dropping the oldest is right for a live feed where only the latest value matters. Rejecting is right at an HTTP edge, where the client can be told and can decide. The default you did not pick is the one you will be explaining during the incident.
- The push-back has to propagate all the way. A bounded channel between two of your own components is easy; the hard part is the last hop, where the pressure has to leave your process. If the thread that fills the channel is a request handler, blocking it is how the pressure reaches the client — but only if the pool it belongs to is bounded too. If it is a background reader on a broker, stop acknowledging, or stop prefetching, or the broker will keep pushing into your memory instead.
- Watch depth and age, not throughput. Throughput looks identical whether the queue is empty or full; it is the last signal to move and the least useful. Depth tells you the buffer is filling, and the age of the oldest item tells you what a request is actually experiencing. Both move before anything fails.
- Batching buys throughput with latency, so cap the wait. A batch that fills in ten milliseconds is free; a batch that waits two seconds for its last member has made every item in it two seconds worse. Set a maximum batch size *and* a maximum delay, and take whichever comes first.
- Do not size the buffer by feel. Capacity should come from what you are willing to promise: if the worst acceptable wait is two seconds and the consumer does fifty a second, the buffer holds a hundred, and the hundred-and-first waits at the door. A buffer sized "big enough that we never see it full" is a buffer that has been asked to hide the problem.

## In .NET

`System.Threading.Channels` is the in-process version of the whole diagram. `CreateBounded` gives you the eight cells, and `FullMode` is the policy the scene turns into a `wait` chip.

```csharp
// The seam: eight cells, and a producer that is made to wait for one.
var channel = Channel.CreateBounded<WorkItem>(new BoundedChannelOptions(capacity: 8)
{
    FullMode = BoundedChannelFullMode.Wait,
    SingleReader = true,
});

// Producer. WriteAsync does not complete until there is a cell to write into,
// so the pace of this loop is the consumer's pace and nothing else. That one
// await is the whole pattern.
await foreach (var item in source.ReadAllAsync(token))
{
    await channel.Writer.WriteAsync(item, token);
}
channel.Writer.Complete();

// Consumer.
await foreach (var item in channel.Reader.ReadAllAsync(token))
{
    await handler.HandleAsync(item, token);
}
```

`Channel.CreateUnbounded` is the same code with the limit deleted, and it is the version that fails in production: `WriteAsync` always completes, the producer never learns anything, and the queue becomes the place the overload is stored rather than the place it is signalled. If you find yourself reaching for it because the bounded one blocks, that block is the information you were asking for.

The other three `FullMode` values do not block. `DropOldest` and `DropNewest` keep the writer moving and throw work away instead, which is the right choice for a feed where the latest value supersedes the earlier ones, and the wrong choice for anything you promised to process. `DropWrite` discards the item being written and reports success to the writer: `TryWrite` returns `true`, `WriteAsync` completes, and the only signal is the `itemDropped` callback on `Channel.CreateBounded`. Nothing in the channel refuses a write the way a 503 refuses a request, so if the producer has to be told, stay in `Wait` mode and let `TryWrite` return false, or put a timeout on `WriteAsync`.

The concurrency limit in the scene is a semaphore. It bounds how much work can be in flight at the source, which is what keeps the push-back from stopping at the first thing that has a buffer.

```csharp
// At most eight items outstanding, whatever the source offers. The permit is
// taken before the item is queued and given back only once the consumer is
// done with it; releasing it after WriteAsync would bound the writers instead,
// which the bounded channel already does.
var admits = new SemaphoreSlim(initialCount: 8, maxCount: 8);

// Producer.
await admits.WaitAsync(token);
await channel.Writer.WriteAsync(item, token);

// Consumer.
try
{
    await handler.HandleAsync(item, token);
}
finally
{
    admits.Release();
}
```

At an HTTP edge the same limit is `AddConcurrencyLimiter`, and there the queue is explicit: `QueueLimit` is how many callers may wait for a permit, and everything past it is refused with a status code rather than parked in memory. That is the difference between backpressure and load shedding, and both belong in the same system — the semaphore slows the callers you can make wait, and the limiter refuses the ones you cannot.

Batching is the fourth step, and the delay cap is the part that gets forgotten.

```csharp
// Take up to `max` items, but never wait longer than `window` for the rest.
static async IAsyncEnumerable<T[]> Batches<T>(
    ChannelReader<T> reader,
    int max,
    TimeSpan window,
    [EnumeratorCancellation] CancellationToken token)
{
    var batch = new List<T>(max);
    while (await reader.WaitToReadAsync(token))
    {
        using var cap = CancellationTokenSource.CreateLinkedTokenSource(token);
        cap.CancelAfter(window);
        try
        {
            while (batch.Count < max && await reader.WaitToReadAsync(cap.Token))
            {
                while (batch.Count < max && reader.TryRead(out var item)) batch.Add(item);
            }
        }
        catch (OperationCanceledException) when (!token.IsCancellationRequested)
        {
            // The window closed. Send what we have rather than wait for a full batch.
        }

        if (batch.Count == 0) continue;
        yield return batch.ToArray();
        batch.Clear();
    }
}
```

One round trip for many items is usually a large win — a single `SqlBulkCopy`, one `SendMessagesAsync`, one bulk index request — because the per-call cost is paid once instead of `max` times. The scene shows the consequence rather than the mechanism: the drain rate doubles, the same spike arrives, and the depth barely moves. That is the honest fix. Raising the capacity from eight to eight thousand would have made the badge stop lighting without making the consumer any faster, which is not a fix, it is a longer lie.
