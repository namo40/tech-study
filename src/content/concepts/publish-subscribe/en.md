---
title: "Publish/Subscribe"
summary: "Publish-subscribe delivers one event as a copy to every subscription: each subscriber reads at its own pace from its own position, crashes and rejoins where it left off, and the publisher never knows any of them exist."
category: "Messaging and event processing"
tags: ["queue"]
scene: publish-subscribe
steps:
  - title: "One event, a copy each"
    text: "A queue hands work to one; a topic hands a copy to everyone. Three events go out, and each lands twice — once per subscription. The publisher publishes and walks away: it never learns how many are listening, and that ignorance is the decoupling."
  - title: "Each at its own pace"
    text: "Every subscription reads at its own pace, from its own position. A stays current; B falls behind; neither knows about the other. An offset is just a bookmark in the shared log — and a slow reader with a bookmark blocks nobody."
  - title: "Crash and resume"
    text: "A crashed subscriber loses nothing but time. B checkpoints its position, dies, and misses two events — which wait in the log, not in B's memory. On restart it resumes from the checkpoint and drains the backlog. The log is the safety net; the checkpoint is where you land on it."
  - title: "A new subscriber, and retention"
    text: "A new subscriber chooses its beginning. C joins months later and replays history from the start — the same events, again, because the log kept them. As C reads, the window closes behind it: events 1 and 2 age out. Join later and they are gone."
related:
  - label: Competing Consumers
    slug: competing-consumers
  - label: Work Queue
    slug: work-queue
  - label: Event Stream
    slug: event-stream
  - label: Offset
    slug: offset
  - label: Checkpoint
    slug: checkpoint
  - label: Ordering
    slug: ordering
  - label: Event Replay
    slug: event-replay
  - label: Event Sourcing
    slug: event-sourcing
  - label: Transactional Outbox
    slug: transactional-outbox
  - label: At-Least-Once
    slug: at-least-once
  - label: Dead Letter Queue
    slug: dead-letter-queue
references:
  - title: Publisher-Subscriber pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/publisher-subscriber
  - title: Service Bus queues, topics, and subscriptions
    url: https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-queues-topics-subscriptions
  - title: EventPosition (Event Hubs)
    url: https://learn.microsoft.com/en-us/dotnet/api/azure.messaging.eventhubs.consumer.eventposition
---

## When to use

- One fact, many independent reactions. `OrderPlaced` has to reach email, analytics, inventory and audit, and none of those four is the reason the order was placed.
- Adding a consumer must not touch the producer. A new subscription is a deployment on the consumer side and nothing at all on the publisher side, which is what "decoupled" buys you in practice.
- Replay and backfill matter. On a log-based broker a new consumer can start at the beginning and rebuild its view out of history, so a projection can be thrown away and recreated rather than migrated.
- Consumers run at different speeds and you want them to. A nightly analytics job and a real-time notification service can share one stream without the slow one becoming the fast one's problem.

## Cautions

- Publish-subscribe multiplies delivery, not understanding. Every subscriber still needs its own retries, its own dead-letter queue and its own tolerance for a message it has already seen; fan-out means the same bug now runs N times.
- A subscription nobody drains grows forever. On Service Bus the subscription's backlog counts against the topic's size quota, which is 1 to 5 GB on Standard and 80 GB partitioned or on Premium, and once the topic is full new sends are rejected; on Event Hubs a consumer that falls behind the retention window silently loses the events it never read. Alert on lag, not just on errors.
- Ordering is per-partition at best, and only if one consumer owns the partition. Across a topic there is no global order, so a handler that assumes "created before updated" needs a partition key, a Service Bus session, or a version on the event.
- Delivery is at-least-once. The same copy can arrive twice after a crash between the work and the checkpoint, so a handler has to be safe to run again.
- Filters are not free. Service Bus SQL filters are evaluated per subscription per message, and a topic with dozens of overlapping rules turns a cheap fan-out into a per-message rules engine. Prefer correlation filters where the match is an equality test.
- The publisher's ignorance cuts both ways. Nothing tells it that a subscription was deleted, misconfigured, or is throwing on every message, so the health of the fan-out has to be watched from the consumer side.

## In .NET

Azure Service Bus draws the boundary as topics and subscriptions: one send, one copy per subscription, and each subscription is drained by its own processor with its own concurrency and its own dead-letter queue.

```csharp
var client = new ServiceBusClient(connectionString);

// One processor per subscription. Nothing here names the publisher, and nothing
// the publisher does names this.
var processor = client.CreateProcessor("orders", "inventory", new ServiceBusProcessorOptions
{
    MaxConcurrentCalls = 4,
    PrefetchCount = 20,
    AutoCompleteMessages = false,        // complete after the work is durable
    MaxAutoLockRenewalDuration = TimeSpan.FromMinutes(5),
});

processor.ProcessMessageAsync += async args =>
{
    var placed = args.Message.Body.ToObjectFromJson<OrderPlaced>();

    // At-least-once: this copy may have arrived before. The id and the
    // reservation are written by one transaction, so a failure inside
    // ReserveAsync rolls the claim back with it rather than leaving the
    // redelivery to recognise the id and skip work that never happened.
    await processed.RunOnceAsync(
        args.Message.MessageId,
        ct => inventory.ReserveAsync(placed, ct),
        args.CancellationToken);

    await args.CompleteMessageAsync(args.Message, args.CancellationToken);
};

processor.ProcessErrorAsync += args => { logger.LogError(args.Exception, "inventory subscription"); return Task.CompletedTask; };
await processor.StartProcessingAsync();
```

Adding an `analytics` subscription to the same topic is a second `CreateProcessor` call in a different service. The publisher's `SendMessageAsync` does not change, does not learn about it, and does not get slower. Rules and filters decide which subscriptions a message reaches: a correlation filter on `Subject` or an application property is an index lookup, while a SQL filter is an expression evaluated per message, so keep the cheap one as the default.

Azure Event Hubs draws the same boundary differently, and it is the shape the scene's third and fourth steps are about. There is one partitioned log; a consumer group is a subscription, and its position is a checkpoint written to blob storage rather than a lock held on the broker.

```csharp
var storage = new BlobContainerClient(storageConnectionString, "checkpoints");
var processor = new EventProcessorClient(storage, "analytics", eventHubConnectionString, "orders");

processor.ProcessEventAsync += async args =>
{
    if (!args.HasEvent) return;
    await projection.ApplyAsync(args.Data, args.CancellationToken);

    // The checkpoint is where a restart lands, so write it after the work, and
    // not on every event: each one is a blob write.
    if (args.Data.SequenceNumber % 100 == 0)
    {
        await args.UpdateCheckpointAsync(args.CancellationToken);
    }
};

// Both handlers are required: StartProcessingAsync throws without an error one.
processor.ProcessErrorAsync += args =>
{
    logger.LogError(args.Exception, "{Operation} on partition {Partition}", args.Operation, args.PartitionId);
    return Task.CompletedTask;
};
```

`EventProcessorClient` starts a consumer group from its stored checkpoint, and from `EventPosition` when there is none: `EventPosition.Earliest` replays everything the retention window still holds, `EventPosition.Latest` takes only what arrives from now on. That is C's choice in the fourth step, and it is a one-line decision with very different consequences. Two things follow from checkpointing being your own write. Checkpoint after the side effects are durable, or a crash between the two loses work rather than repeating it — and repeating it is the failure you want. And checkpoint on an interval rather than per event: every `UpdateCheckpointAsync` is a round trip to blob storage, so the honest tuning question is how many events you are willing to reprocess after a crash.
