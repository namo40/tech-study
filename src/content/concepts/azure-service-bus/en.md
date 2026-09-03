---
title: "Azure Service Bus"
summary: "Azure Service Bus is Azure's managed message broker: queues for commands, topics and subscriptions for fan-out, and a lock-based consumption model where redelivery, dead-lettering and ordered sessions are equipment that ships with the service rather than code you write."
category: "Messaging and event processing"
tags: ["queue"]
related:
  - label: Work Queue
    slug: work-queue
  - label: Web-Queue-Worker
    slug: web-queue-worker
  - label: Competing Consumers
    slug: competing-consumers
  - label: Dead Letter Queue
    slug: dead-letter-queue
  - label: Publish/Subscribe
    slug: publish-subscribe
  - label: Ordering
    slug: ordering
  - label: MassTransit
    slug: masstransit
  - label: RabbitMQ
    slug: rabbitmq
references:
  - title: "What is Azure Service Bus?"
    url: https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-messaging-overview
  - title: "Send and receive messages from an Azure Service Bus queue (.NET)"
    url: https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-dotnet-get-started-with-queues
---

## When to use

- Make it the default when the workload is on Azure and the messages are commands. A queue in front of a worker turns a slow request into an accepted one, the service is managed so there is no broker to patch or cluster to keep quorate, and the SDK, the Functions trigger and the managed-identity story are all already wired into the platform the rest of the application runs on.
- Use topics and subscriptions when one event has several independent readers. The publisher sends to a topic and each subscription holds its own copy with its own filter, its own delivery count and its own dead-letter queue, so a slow or broken consumer backs up only its own subscription rather than the publisher or its neighbours.
- Take it when you want lock-based consumption rather than an at-most-once read. In peek-lock mode a received message is invisible to other consumers but still on the broker: completing it removes it, abandoning it returns it immediately for another attempt, and doing neither lets the lock expire so the message comes back on its own. Crash-safety is the default rather than something you add.
- Reach for sessions when a group of related messages has to be processed in order by one consumer. A session id binds every message with that key to a single session-locked receiver, which is how per-customer or per-order sequencing survives a pool of competing consumers.

## Cautions

- The lock duration is a promise about processing time, and breaking it costs you a duplicate. The lock lasts up to five minutes; when it expires the message becomes visible again and is delivered to somebody else while the first handler is still working, so the same work happens twice. Renew the lock while long work is in flight, size `MaxAutoLockRenewalDuration` to the worst realistic case rather than the median, and keep the handler safe to run twice, because the lock can be lost to a network blip regardless.
- Dead-lettering is automatic and silent. Once a message exceeds `MaxDeliveryCount`, or expires with dead-lettering on expiration enabled, the broker moves it into the entity's dead-letter sub-queue and stops mentioning it. Nothing fails, no alert fires, and to the sending side it looks like the work was done. A queue without a reader and an alert on dead-letter depth is a queue that loses messages politely.
- The tier is a functional decision, not just a price. Message size limits, throughput, and features like large messages differ between Basic, Standard and Premium, and Premium's dedicated resources are also what give predictable latency. Discovering the ceiling when a payload grows past it in production is the expensive way to learn which tier the design assumed.
- It is a broker, not a stream. Service Bus is built for a few hundred thousand messages that each need routing, locking and a delivery count; high-volume telemetry ingestion with replay from an offset is Event Hubs' job. Choosing the wrong one shows up as cost and throttling rather than as an error message.

## In .NET

- `ServiceBusProcessor` is the receive loop, and its options are where the lock policy lives. The handler completes or abandons explicitly, and the error handler is not optional: without it, failures inside the pump are invisible.

```csharp
await using var client = new ServiceBusClient(fullyQualifiedNamespace, new DefaultAzureCredential());

var processor = client.CreateProcessor("orders", new ServiceBusProcessorOptions
{
    MaxConcurrentCalls = 8,
    // Do not settle for us: the handler decides.
    AutoCompleteMessages = false,
    // Long work keeps its lock instead of being redelivered under us.
    MaxAutoLockRenewalDuration = TimeSpan.FromMinutes(10),
});

processor.ProcessMessageAsync += async args =>
{
    try
    {
        await handler.HandleAsync(args.Message.Body.ToObjectFromJson<OrderPlaced>(), args.CancellationToken);
        await args.CompleteMessageAsync(args.Message);
    }
    catch (TransientException)
    {
        // Back to the queue now; the delivery count goes up, and at
        // MaxDeliveryCount the broker dead-letters it without asking.
        await args.AbandonMessageAsync(args.Message);
    }
};

processor.ProcessErrorAsync += args => logger.LogError(args.Exception, "{Source}", args.ErrorSource);
await processor.StartProcessingAsync();
```

- The Azure Functions Service Bus trigger is the same model with the pump hidden. The binding runs the function per message and settles it by the return value, which is convenient until you need a lock renewal or a manual abandon; from that point the processor above is the honest shape.
- Read the dead-letter queue as an ordinary entity. It is addressed by setting `SubQueue.DeadLetter` on a receiver, each message carries `DeadLetterReason` and `DeadLetterErrorDescription`, and resubmitting means sending a copy back to the main entity so the delivery count starts again.
- Scheduled messages and duplicate detection are broker features worth knowing before you rebuild them. `ScheduleMessageAsync` delivers a message at a future time without a timer in your process, and duplicate detection discards a repeat of the same `MessageId` inside a configured window, which covers a publisher's retry but not a consumer's second delivery.
