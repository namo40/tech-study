---
title: "Ordering"
summary: "Message ordering is a promise with a scope: global order dies the moment consumption goes parallel, so systems guarantee order only within a key — and choosing that key is choosing both what stays ordered and what can still scale."
category: "Messaging and event processing"
tags: ["queue", "consistency"]
scene: ordering
steps:
  - title: "Publish order is not processing order"
    text: "Plus-100 left before minus-30, but two parallel consumers finished them backwards, and for one moment the balance went negative. Nothing was lost, nothing was duplicated — only reordered. Parallelism is where global order goes to die."
  - title: "Order lives inside a key"
    text: "Same key, same partition, one appender, one consumer — inside that lane, sequence is physics, not hope. Different keys ride different lanes with no promise between them, and that is fine: the two accounts never needed mutual order anyway."
  - title: "The key that guarantees order also concentrates load"
    text: "One popular key means one hot partition: P0 boils while P1 idles, and adding consumers cannot help, because the promise itself pins the key to one lane. Ordering is bought with parallelism — the bill arrives at your hottest key."
  - title: "Scope the promise to the smallest unit that needs it"
    text: "Per-account order, not per-system order: each key keeps its lane, the lanes spread across partitions, and both properties hold at once — every account consistent, every partition busy. Order everything and you serialize everything; order just enough and you scale."
related:
  - label: Event Stream
    slug: event-stream
  - label: Hot Partition
    slug: hot-partition
  - label: Publish/Subscribe
    slug: publish-subscribe
  - label: Competing Consumers
    slug: competing-consumers
  - label: Offset
    slug: offset
  - label: Sharding
    slug: sharding
  - label: Consistent Hashing
    slug: consistent-hashing
  - label: Event Sourcing
    slug: event-sourcing
  - label: Event Replay
    slug: event-replay
  - label: At-Least-Once
    slug: at-least-once
  - label: Dead Letter Queue
    slug: dead-letter-queue
references:
  - title: Message sequencing and timestamps
    url: https://learn.microsoft.com/en-us/azure/service-bus-messaging/message-sequencing
  - title: Message sessions (Service Bus)
    url: https://learn.microsoft.com/en-us/azure/service-bus-messaging/message-sessions
  - title: Features and terminology in Azure Event Hubs
    url: https://learn.microsoft.com/en-us/azure/event-hubs/event-hubs-features
---

## When to use

Ordering is less a feature you turn on than a question you have to answer before you pick anything else: ordered with respect to *what*. The answer is a key, and it is a design decision with a throughput bill attached.

- A consumer's correctness depends on sequence. A balance that applies a withdrawal before the deposit that funded it, a state machine that receives `shipped` before `paid`, a CDC stream that applies an update to a row it has not inserted yet — in each case the events are all present and the outcome is still wrong.
- The sequence is per-entity, not per-system. Two accounts, two orders, two devices: they need internal order and nothing between them. That is the case ordering is built for, because it is the one where the promise and the parallelism can both be kept.
- You are about to add consumers to fix a backlog. That is the moment to work out what the added concurrency is allowed to reorder, because "just scale the consumers" and "keep the order" are the same sentence pulling in two directions.
- Replay has to produce the same result as the original run. A projection rebuilt from history is only reproducible if the replay applies each key's events in the order the log holds them.

## Cautions

- Global FIFO and parallel consumers are a contradiction, not a tuning problem. One queue drained by four workers has no order at all, and no setting recovers it; the only way to have both is to make the promise smaller than the whole stream.
- Retries and dead-letter queues break order silently, though not where you would expect. A session or a partition hands a failed message back in the same place, so the retries themselves cost order nothing; what breaks it is the end of the retry budget, when the broker sets that message aside and carries on with the rest of the lane. A dead letter put back later arrives with a new sequence number rather than in its old place, so the order it lost is not recoverable. Per-key order therefore needs per-key error handling: decide up front whether that key pauses, records the gap, or goes to a person.
- Timestamps are not order. Producer clocks skew, and two events stamped a millisecond apart may have been emitted in the other order entirely. The sequence inside one partition is the only order the system actually knows; a timestamp is a hint about when, not a statement about after.
- A hot key pins throughput. The celebrity account, the one warehouse, the single busy tenant: all of its events are, by construction, on one partition with one consumer, so the ceiling for that key is one consumer's speed no matter how many you run.
- Consumers must be single-threaded per key. Handing a partition's events to a thread pool re-parallelizes them and gives back exactly the problem the partition was there to solve. If you need concurrency inside a consumer, serialize per key — one channel, one worker, one key — rather than per batch.
- Repartitioning moves keys. Changing the partition count changes which lane a key lands on, and events for one key can be in two lanes at once while the change settles. Treat it as a migration with a drain, not as a slider.

## In .NET

Azure Service Bus calls the key a session. `SessionId` on the message is the key; the broker gives one session to one processor at a time and holds a lock on it, which is what makes "one consumer per key" a property of the broker rather than a convention in your code.

```csharp
var client = new ServiceBusClient(connectionString);

// Sessions are the whole mechanism: concurrent sessions scale the consumer,
// and the single call per session is what keeps each key in order.
var processor = client.CreateSessionProcessor("ledger", new ServiceBusSessionProcessorOptions
{
    MaxConcurrentSessions = 8,           // eight keys at once
    MaxConcurrentCallsPerSession = 1,    // one message at a time inside a key
    AutoCompleteMessages = false,
    SessionIdleTimeout = TimeSpan.FromSeconds(30),
});

processor.ProcessMessageAsync += async args =>
{
    var entry = args.Message.Body.ToObjectFromJson<LedgerEntry>();
    try
    {
        await ledger.ApplyAsync(args.SessionId, entry, args.CancellationToken);
        await args.CompleteMessageAsync(args.Message, args.CancellationToken);
    }
    catch (Exception ex) when (args.Message.DeliveryCount >= 5)
    {
        // A session hands a failed message back in the same place, so the retries
        // cost order nothing. What breaks it is the end of the budget: the broker
        // dead-letters the message and carries on with the rest of the session.
        // Record the gap in the session state before that happens.
        await args.SetSessionStateAsync(
            new BinaryData($"poisoned at {args.Message.SequenceNumber}"), args.CancellationToken);
        await args.DeadLetterMessageAsync(
            args.Message, "SessionPoisoned", ex.Message, args.CancellationToken);
    }
};

// The error handler only sees faults in the pump itself, which is why the
// decision about a session belongs above, next to the message that failed.
processor.ProcessErrorAsync += args =>
{
    logger.LogError(args.Exception, "ledger pump: {Source}", args.ErrorSource);
    return Task.CompletedTask;
};

await processor.StartProcessingAsync();
```

The sending side is one property, and it is the design decision the whole page is about:

```csharp
await sender.SendMessageAsync(new ServiceBusMessage(payload)
{
    SessionId = accountId,   // the scope of the promise, chosen here
});
```

Azure Event Hubs draws the same line as partitions. `PartitionKey` is hashed to a partition, everything with that key appends to that partition's log in order, and `EventProcessorClient` gives each partition to exactly one processor instance in the consumer group.

```csharp
await using var producer = new EventHubProducerClient(connectionString, "ledger");

// Same key, same partition, same order. Batching by key rather than by size is
// what keeps that true.
using var batch = await producer.CreateBatchAsync(new CreateBatchOptions { PartitionKey = accountId });
batch.TryAdd(new EventData(payload));
await producer.SendAsync(batch);
```

Two things about the consuming side are worth being precise about. `ProcessEventAsync` is invoked one event at a time within a partition, with different partitions running concurrently, so as long as the handler is `await`-ed to completion that partition stays ordered — but the moment you fire work off without awaiting it, or hand the event to a background queue, the guarantee is gone and nothing will tell you. And a checkpoint is per partition, so it records how far *that lane* has been processed; a partition that skips a failed event and checkpoints past it has silently converted an ordering guarantee into a best effort.

In process, the same shape is a `Channel` per key: a dictionary of channels, one reader task each, and a router that picks the channel by key. It is the smallest honest model of the whole page — the router is the partitioner, the channel is the partition, the single reader is the promise, and a key that gets most of the traffic makes exactly one of the readers the bottleneck.

```csharp
// One channel per key, one reader per channel. Concurrency across keys,
// strict order inside a key.
private readonly ConcurrentDictionary<string, Lazy<Channel<LedgerEntry>>> lanes = new();

private ChannelWriter<LedgerEntry> LaneFor(string key) =>
    // GetOrAdd may run its factory more than once for the same key and throw the
    // loser away, so the reader task starts inside a Lazy that runs exactly once.
    lanes.GetOrAdd(key, k => new Lazy<Channel<LedgerEntry>>(() =>
    {
        var channel = Channel.CreateBounded<LedgerEntry>(new BoundedChannelOptions(256)
        {
            SingleReader = true,   // the promise, stated as an option
            SingleWriter = false,
        });
        _ = Task.Run(() => DrainAsync(k, channel.Reader));
        return channel;
    })).Value.Writer;
```
