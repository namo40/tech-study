---
title: "Dead Letter Queue"
summary: "A dead-letter queue is where the broker sets aside a message it has tried to deliver too many times, so one poison message stops costing throughput and starts waiting for a person. Nothing is lost: it is parked, with its history attached."
category: "Messaging and event processing"
tags: ["queue"]
scene: dead-letter-queue
steps:
  - title: "One poison message costs the whole line"
    text: "Processing fails, the broker redelivers, and the count ticks up — at least once, exactly as promised. Meanwhile everything behind it waits, and the queue's depth is the bill."
  - title: "The limit is mercy"
    text: "At the third failure the broker stops insisting: the message is moved aside, history attached, and the consumer is free. Throughput snaps back the moment the poison leaves the line. Nothing was lost — it is parked."
  - title: "What lands there tells you why"
    text: "A message that can never be parsed, one whose retries ran out, one that expired before anyone got to it — each arrives with a reason. The dead-letter queue is not a trash can; it is a labelled shelf."
  - title: "Depth is an alarm, replay is the repair"
    text: "Watch the shelf: a rising count means something upstream is wrong right now. Fix the cause, resubmit what can run again, discard what is truly dead — deliberately, with a record, not by letting it rot."
related:
  - label: Competing Consumers
    slug: competing-consumers
  - label: Consumer Acknowledgement
    slug: consumer-acknowledgement
  - label: Work Queue
    slug: work-queue
  - label: Web-Queue-Worker
    slug: web-queue-worker
  - label: Idempotent Consumer
    slug: idempotent-consumer
  - label: At-Least-Once
    slug: at-least-once
  - label: Message ID
    slug: message-id
  - label: Deduplication
    slug: deduplication
  - label: Retry
    slug: retry
  - label: Transactional Outbox
    slug: transactional-outbox
references:
  - title: Service Bus dead-letter queues
    url: https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-dead-letter-queues
  - title: Message expiration and time to live
    url: https://learn.microsoft.com/en-us/azure/service-bus-messaging/message-expiration
  - title: RabbitMQ dead letter exchanges
    url: https://www.rabbitmq.com/docs/dlx
---

## When to use

- Every queue that retries needs one. Without it the only two endings are a poison message circulating forever in front of the work, or a broker quietly dropping it, and both are worse than a shelf.
- Messages that can fail for reasons a retry will never fix: a payload that does not deserialize, a reference to a row somebody deleted, a version of the contract this consumer has never seen.
- Work with a deadline, where a message that has waited too long should be set aside rather than run late. Time to live and dead-lettering are the same mechanism seen from two sides.
- Any pipeline where you would otherwise be reading logs to find out what failed. A dead-letter queue turns "something went wrong last night" into a list you can count, filter, and replay.

## Cautions

- The delivery limit is a real trade. Too high and the consumer burns throughput on messages that will never succeed; too low and one slow dependency dead-letters a whole batch of perfectly good work. Pair the limit with a backoff, so the retries are spread out rather than spent in a second.
- A dead-letter queue nobody watches is silent loss with extra steps. Alert on its depth and on the age of its oldest message, and treat both as first-class signals rather than as debug output. A rising count means something upstream is broken right now.
- Resubmitting is a duplicate by design: the message may already have had partial effects on an earlier attempt. Consumers have to be safe to run twice before replay is safe to offer, which usually means a message id and a record of what has already been handled.
- Record why each message was dead-lettered, and record why you discarded one. The reason is the whole value of the shelf, and a discard with no note is indistinguishable from a message that vanished.
- Fix the cause before you replay. Resubmitting into the same broken dependency just fills the shelf again, and the second round of history makes the first harder to read.
- The dead-letter queue is a queue like any other, with its own quota and its own expiry. Left to fill, it stops accepting, and then the failures really are lost.

## In .NET

Azure Service Bus gives every queue and subscription a dead-letter sub-queue for free. `MaxDeliveryCount` decides when the broker moves a message there on its own, and `DeadLetterMessageAsync` lets the consumer move one immediately when it can already tell that no retry will help.

```csharp
// Entity setup: three deliveries, then the broker sets the message aside itself.
await admin.CreateQueueAsync(new CreateQueueOptions("orders")
{
    MaxDeliveryCount = 3,
    DefaultMessageTimeToLive = TimeSpan.FromMinutes(30),
    DeadLetteringOnMessageExpiration = true,
});

processor.ProcessMessageAsync += async args =>
{
    OrderPlaced order;
    try
    {
        order = args.Message.Body.ToObjectFromJson<OrderPlaced>();
    }
    catch (JsonException ex)
    {
        // A retry cannot fix a payload that does not parse: shelve it now, with the reason.
        await args.DeadLetterMessageAsync(args.Message, "DeserializationFailed", ex.Message);
        return;
    }

    await handler.HandleAsync(order, args.CancellationToken);   // throwing here just abandons the lock
};

// Reading the shelf, and putting a message back once the cause is fixed.
var dead = client.CreateReceiver("orders", new ServiceBusReceiverOptions
{
    SubQueue = SubQueue.DeadLetter,
});

await foreach (var message in dead.ReceiveMessagesAsync())
{
    var reason = message.DeadLetterReason;               // MaxDeliveryCountExceeded, TTLExpired, or yours
    var detail = message.DeadLetterErrorDescription;

    if (!CanRunAgain(reason)) { await dead.CompleteMessageAsync(message); continue; }   // discarded, on purpose

    await sender.SendMessageAsync(new ServiceBusMessage(message)); // resubmit: a fresh delivery count
    await dead.CompleteMessageAsync(message);
}
```

Two details are worth knowing. `DeadLetterMessageAsync` takes a reason and a description, and they arrive on the message as `DeadLetterReason` and `DeadLetterErrorDescription`, which is the difference between a shelf you can triage and a pile you have to open one at a time. And a resubmit is a new message: copying the old one through `new ServiceBusMessage(message)` keeps the body and the application properties, including your own `MessageId`, so a consumer that deduplicates on it still recognises the repeat. RabbitMQ arranges the same thing differently, with a dead letter exchange named in the queue's `x-dead-letter-exchange` argument; the queue it routes to is an ordinary queue, which is what makes replay there just another publish.
