---
title: "RabbitMQ"
summary: "RabbitMQ is an open-source broker you run yourself: publishers send to an exchange, bindings decide which queues get a copy, and routing is something you declare in the broker over a standard protocol rather than something a cloud service decides for you."
category: "Messaging and event processing"
tags: ["queue"]
level: 4
related:
  - label: Work Queue
    slug: work-queue
  - label: Web Queue Worker
    slug: web-queue-worker
  - label: Competing Consumers
    slug: competing-consumers
  - label: Dead Letter Queue
    slug: dead-letter-queue
  - label: Publish/Subscribe
    slug: publish-subscribe
  - label: Backpressure
    slug: backpressure
  - label: MassTransit
    slug: masstransit
  - label: Azure Service Bus
    slug: azure-service-bus
references:
  - title: RabbitMQ documentation
    url: https://www.rabbitmq.com/docs
  - title: ".NET/C# Client API Guide"
    url: https://www.rabbitmq.com/client-libraries/dotnet-api-guide
---

## When to use

- Choose it when the broker has to run where you run and belong to nobody else. It installs on a server, in a container or in a Kubernetes cluster, it speaks AMQP 0-9-1, and AMQP 1.0 natively since 4.0, so the clients are not tied to a vendor, and moving from a laptop to a data centre to a different cloud is the same broker with a different address.
- Use it when routing belongs in the broker rather than in the consumers. An exchange type is the routing rule made explicit: `direct` matches a routing key exactly, `topic` matches patterns like `orders.*.created`, `fanout` copies to everything bound to it, and `headers` matches on attributes. Adding a new reader is a binding, not a code change on the publisher.
- Take it for work queues with fair distribution across a pool of workers. Several consumers share one queue, each holds a bounded number of unacknowledged messages, and the broker hands the next message to whoever has capacity rather than dealing them out in turn to a worker that is already busy.
- Reach for it when development, test and production should be the same broker. The image starts in seconds, the management UI shows the exchanges and queues your code declared, and the behaviour you debug locally is the behaviour you get in production instead of an emulator's approximation of it.

## Cautions

- The default unlimited prefetch is the pitfall to fix on the first day. Prefetch is the cap on unacknowledged messages a consumer may hold; with no cap the broker pushes the whole queue at whichever consumer connected first, so the other workers idle, memory grows, and every one of those messages is redelivered if that consumer dies. Call `BasicQosAsync` with a small `prefetchCount` and raise it deliberately.
- Unacknowledged work comes back, which means duplicates are normal. If the channel closes or the connection drops before the ack, the broker requeues the message and another consumer runs it, so a consumer with external side effects needs a message id and a record of what it has already handled. Acknowledge after the work, not before, and use `BasicNackAsync` with `requeue: false` plus a dead-letter exchange for messages a retry will never fix.
- A classic queue lives on one node, and clustering does not change that by itself. If that node goes down the queue is unavailable and, without durability, gone. Replication is an explicit choice: declare quorum queues for anything that must survive a node loss, mark queues durable and messages persistent, and remember that durability costs disk writes on the publish path.
- Running it is your job, and it fails in ways a managed broker hides. Memory and disk watermarks put publishers into flow control, thousands of short-lived connections exhaust file descriptors, and an unbounded queue eventually blocks the whole node rather than only its own consumers. Set queue length limits, monitor the watermarks, and upgrade on a schedule instead of on an incident.

## In .NET

- The official `RabbitMQ.Client` package gives you a connection, a channel and a consumer. Declare the topology idempotently at startup, set the prefetch before consuming, and acknowledge only once the work has succeeded.

```csharp
var factory = new ConnectionFactory { HostName = "localhost" };
await using var connection = await factory.CreateConnectionAsync();
await using var channel = await connection.CreateChannelAsync();

// Declaring is safe to repeat: it creates or verifies, it does not duplicate.
await channel.QueueDeclareAsync("orders", durable: true, exclusive: false, autoDelete: false);

// The cap on in-flight messages. Without it the first consumer takes the lot.
await channel.BasicQosAsync(prefetchSize: 0, prefetchCount: 16, global: false);

var consumer = new AsyncEventingBasicConsumer(channel);
consumer.ReceivedAsync += async (_, ea) =>
{
    try
    {
        await handler.HandleAsync(Decode(ea.Body.Span), ea.CancellationToken);
        await channel.BasicAckAsync(ea.DeliveryTag, multiple: false);
    }
    catch (PoisonMessageException)
    {
        // No requeue: the dead-letter exchange on the queue takes it from here.
        await channel.BasicNackAsync(ea.DeliveryTag, multiple: false, requeue: false);
    }
};

await channel.BasicConsumeAsync("orders", autoAck: false, consumer: consumer);
```

- Connections are expensive and channels are not thread-safe. Open one long-lived connection per application and give each consumer or publishing thread its own channel; sharing a channel across threads corrupts the protocol frames and produces failures that look like broker bugs. The client's automatic recovery reopens connections, channels and consumers after a network break, and it is worth leaving on.
- `autoAck: true` is at-most-once, and it is rarely what you want. It acknowledges on delivery, so a crash mid-handler loses the message silently; manual acknowledgement is what makes the redelivery above possible.
- Publisher confirms are the other half of not losing messages. A publish is fire-and-forget until the broker confirms it, so a publisher that must not drop work waits for the confirm, and durable queue plus persistent message plus confirm is the full set for surviving a broker restart.
