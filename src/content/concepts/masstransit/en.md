---
title: "MassTransit"
summary: "MassTransit is an application framework that sits on top of a message broker: consumers, retry policies, redelivery and sagas are written once as .NET code, and the transport underneath is a configuration line rather than the shape of your application."
category: "Messaging and event processing"
tags: ["queue"]
related:
  - label: Web-Queue-Worker
    slug: web-queue-worker
  - label: Work Queue
    slug: work-queue
  - label: Competing Consumers
    slug: competing-consumers
  - label: Dead Letter Queue
    slug: dead-letter-queue
  - label: Saga
    slug: saga
  - label: Orchestration
    slug: orchestration
  - label: Transactional Outbox
    slug: transactional-outbox
  - label: Azure Service Bus
    slug: azure-service-bus
  - label: RabbitMQ
    slug: rabbitmq
references:
  - title: MassTransit concepts
    url: https://masstransit.io/documentation/concepts
---

## When to use

- Take it when handling a message should look like handling a request. A consumer is a class with one `Consume` method, it is resolved from the container like everything else in the application, and the framework owns the receive loop, the deserialization and the acknowledgement. That is the difference between a broker SDK call buried in a hosted service and a unit of work your team can find, inject into and test.
- Use it when retry, redelivery and the error queue should be declared rather than hand-rolled. Immediate retries for a transient blip, scheduled redelivery minutes later for a dependency that is down, and a move to the error queue when the attempts run out are three lines of configuration on the endpoint, applied uniformly to every consumer instead of reimplemented in each one.
- Reach for it when a conversation spans several messages and has to remember where it got to. A saga state machine gives that conversation an explicit type: states, events, the transitions between them and a persisted instance keyed by a correlation id, which is the piece a folder of `IHostedService` classes never grows on its own.
- Choose it when the transport is a deployment decision rather than a design one. The same consumer code runs against the in-memory transport in tests, RabbitMQ on a developer machine and Azure Service Bus in production, because what changes is the `UsingRabbitMq` or `UsingAzureServiceBus` call in startup and not the classes around it.

## Cautions

- The framework decides the broker topology, and not knowing its conventions makes the broker console unreadable. MassTransit routes by message type: publishing an `OrderPlaced` creates an exchange or a topic named after that type, and every consumer of it gets a queue bound to that name. The entities in the portal will not match anything you typed, so learn the naming rules before an incident is the first time you look.
- The abstraction hides brokers from each other, not their differences from you. Service Bus sessions, partition keys, RabbitMQ exchange types and per-transport quotas are still there, and reaching them means transport-specific configuration that quietly ties the code to one broker. Portability is real for the ordinary path and a claim worth testing for anything else.
- A consumer can still be called twice, and the framework does not change that. Retries, redelivery and a broker's at-least-once delivery all mean the same handler may see the same message again, so a consumer whose side effects are external needs the usual defence: a message id, a record of what has already been processed, or a transactional outbox on the producing side.
- Major versions have moved a lot, and samples age badly. Configuration APIs, the outbox and the scheduling story all changed shape across releases, and licensing terms have changed for newer versions too. Pin a version, read that version's documentation, and treat a blog post from two majors ago as a hint rather than as instructions.

## In .NET

- Registration is one call, and it wires the consumers, the transport and the endpoints together. `AddMassTransit` collects the consumers, the transport call chooses the broker, and the retry and redelivery policies sit on the receive endpoint rather than inside the handler.

```csharp
builder.Services.AddMassTransit(x =>
{
    x.AddConsumer<OrderPlacedConsumer>();

    x.UsingRabbitMq((context, cfg) =>
    {
        cfg.Host("rabbitmq://localhost");

        cfg.ReceiveEndpoint("order-processing", e =>
        {
            // Fast attempts for a transient blip...
            e.UseMessageRetry(r => r.Interval(3, TimeSpan.FromSeconds(2)));
            // ...and a scheduled return to the queue for a dependency that is down.
            e.UseDelayedRedelivery(r => r.Intervals(
                TimeSpan.FromMinutes(1), TimeSpan.FromMinutes(10)));

            e.ConfigureConsumer<OrderPlacedConsumer>(context);
        });
    });
});

public class OrderPlacedConsumer : IConsumer<OrderPlaced>
{
    public async Task Consume(ConsumeContext<OrderPlaced> context)
    {
        // Throwing here is the signal to the endpoint's retry policy; the
        // framework acknowledges only when this method returns.
        await handler.HandleAsync(context.Message, context.CancellationToken);
    }
}
```

- Publishing and sending are different verbs on purpose. `Publish` fans a message out to every consumer subscribed to its type, `Send` addresses one endpoint directly, and picking the wrong one is how an event ends up delivered once or a command ends up delivered four times.
- The in-memory test harness is what makes consumers testable without a broker. It starts the bus in process, lets the test publish a message and then assert that the consumer was invoked and that the expected message was produced, so the retry and routing configuration is covered by ordinary unit tests rather than by a docker-compose file.
- The transactional outbox is a first-class feature rather than something you build. Enabling it with the Entity Framework Core integration writes outgoing messages in the same transaction as the state change and delivers them afterwards, which closes the gap where a database commit succeeds and the publish does not.
