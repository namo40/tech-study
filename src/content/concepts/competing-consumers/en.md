---
title: "Competing Consumers"
summary: "Competing consumers share one queue, so each message goes to exactly one of them and throughput grows by adding consumers; the price is at-least-once delivery and the loss of global order, which handlers safe to repeat and partitioning by key buy back."
category: "Messaging and event processing"
tags: ["queue"]
level: 5
scene: competing-consumers
steps:
  - title: "One consumer"
    text: "Messages arrive faster than one consumer can finish them. The queue grows, and so does the time each message waits in it."
  - title: "Competing consumers"
    text: "Four consumers pull from the same queue. Each message goes to exactly one of them, throughput quadruples, and the backlog drains while the producer keeps sending at the same pace."
  - title: "At least once"
    text: "A consumer that dies before acknowledging hands its message back to the queue. Someone else finishes it, and sometimes a copy arrives twice: handlers must be safe to repeat, and a message that keeps failing goes to the dead-letter queue."
  - title: "Order per key"
    text: "Competing consumers give up global order. When order matters for one customer or one order, partition by that key so a single consumer handles that key in sequence while the others run in parallel."
related:
  - label: Work Queue
    slug: work-queue
  - label: Web Queue Worker
    slug: web-queue-worker
  - label: Consumer Acknowledgement
    slug: consumer-acknowledgement
  - label: Idempotent Consumer
    slug: idempotent-consumer
  - label: Consumer Group
    slug: consumer-group
  - label: Deduplication
    slug: deduplication
  - label: At-Least-Once
    slug: at-least-once
  - label: Dead Letter Queue
    slug: dead-letter-queue
  - label: Background Job
    slug: background-job
references:
  - title: Competing Consumers pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/competing-consumers
  - title: RabbitMQ reliability guide
    url: https://www.rabbitmq.com/docs/reliability
  - title: MassTransit consumers
    url: https://masstransit.massient.com/concepts/consumers
---

## When to use

- Independent work items that can be handled in any order: sending email, generating thumbnails, delivering webhooks, syncing one record at a time.
- Throughput that has to grow by adding processes rather than by making one process faster, which is what you reach for when the work is I/O bound and the queue is already full.
- Arrival rates that spike, where the queue absorbs the burst and the consumers drain it at whatever pace they can manage.

## Cautions

- Delivery is at-least-once, not exactly-once. Deduplicate on the message id, or write handlers that can run twice without doing the work twice.
- Acknowledge after the work and its side effects are durable, never before. An early acknowledgement turns a crash into a lost message rather than a redelivered one.
- Bound the retries and send poison messages to a dead-letter queue, with a runbook for reprocessing them. A message that fails forever otherwise takes a consumer down with it every time it comes round.
- Global order is gone the moment there is more than one consumer. Where order matters within one customer or one order, partition by that key: Kafka partitions, Azure Service Bus sessions, or a RabbitMQ consistent-hash exchange.
- Tune prefetch. A high prefetch fills one consumer's buffer with messages the idle consumers could have taken, and every buffered message has to be redelivered when that consumer dies.
- Adding consumers stops helping once the bottleneck moves somewhere else. Five consumers against one small connection pool is one consumer with extra queueing in front of it.

## In .NET

MassTransit turns a receive endpoint into a competing consumer: every instance of the service binds to the same queue, and the broker hands each message to exactly one of them.

```csharp
builder.Services.AddMassTransit(x =>
{
    x.AddConsumer<OrderPlacedConsumer>();
    x.UsingRabbitMq((context, cfg) =>
    {
        cfg.Host("rabbitmq");
        cfg.ReceiveEndpoint("orders", e =>
        {
            e.PrefetchCount = 1;                 // one in flight per consumer
            e.ConcurrentMessageLimit = 1;
            e.UseMessageRetry(r => r.Exponential(3, TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(30), TimeSpan.FromSeconds(2)));
            e.ConfigureConsumer<OrderPlacedConsumer>(context);
            // After the retries are exhausted MassTransit moves the message to orders_error (the dead-letter queue).
        });
    });
});

public sealed class OrderPlacedConsumer(IProcessedMessages processed, IOrderProjector projector)
    : IConsumer<OrderPlaced>
{
    public async Task Consume(ConsumeContext<OrderPlaced> context)
    {
        var messageId = context.MessageId ?? throw new InvalidOperationException("MessageId is required");

        // One transaction inserts the message id against a unique constraint and
        // writes the projection. Marking the id first and applying afterwards is
        // how a message gets lost: if ApplyAsync throws, the in-process retry
        // finds the id already recorded, skips, and returns without an exception,
        // which acknowledges a projection that was never written.
        var claimed = await processed.RunOnceAsync(
            messageId,
            ct => projector.ApplyAsync(context.Message, ct),
            context.CancellationToken);

        if (!claimed) return;   // duplicate: the unique constraint rejected the insert
        // Returning without an exception acknowledges the message.
    }
}
```

`PrefetchCount` and `ConcurrentMessageLimit` decide how much work one instance holds at a time, and leaving both at one is the honest starting point, because it keeps the queue as the only place work waits. The retry policy runs inside the consumer's own process, so a transient fault costs no round trip through the broker, and once the policy is exhausted MassTransit moves the message to `orders_error` instead of letting it circulate. Scaling out is then a deployment concern: more replicas of the same service, each binding to the same `orders` queue. When order matters within one key, keep the competing consumers and change the routing instead — a consistent-hash exchange, a Service Bus session, or a Kafka partition key — so one key lands on one consumer while everything else still runs in parallel.
