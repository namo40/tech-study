---
title: "Poison Message"
summary: "A poison message fails every time it is processed, and at-least-once delivery keeps bringing it back: without a plan it blocks the queue and burns the consumer, so the plan is delays, a retry budget, and finally the dead-letter drawer."
category: "Messaging and event processing"
tags: ["queue"]
scene: poison-message
steps:
  - title: "One bad message, and the whole line waits"
    text: "Two messages process fine; the third fails, comes right back, and fails again. At-least-once delivery is doing its job — redelivering — and that job has turned the head of the queue into a wall. Everything behind it just ages."
  - title: "It keeps coming back because the system keeps its promise"
    text: "A message that is never acknowledged must be redelivered — that is what at-least-once means. Exactly-once holds only inside narrow boundaries; out here, redelivery is the guarantee, and a handler that cannot cope is the bug."
  - title: "Move the failure aside, and let time do the retrying"
    text: "The bad message goes to a delay queue; the main line flows again immediately. When the timer fires it rejoins at the back, fails again, and earns a longer delay. Backoff is not mercy for the message — it is protection for everyone behind it."
  - title: "A retry budget is what makes the drawer possible"
    text: "After the last allowed attempt, the message moves to the dead-letter queue — with its history attached — and an alert fires. Isolation is not disposal: it is the moment retrying stops and investigation starts, while the line behind flows as if nothing happened."
related:
  - label: Dead Letter Queue
    slug: dead-letter-queue
  - label: Retry Queue
    slug: retry-queue
  - label: Exactly-Once
    slug: exactly-once
  - label: At-Least-Once
    slug: at-least-once
  - label: Retry
    slug: retry
  - label: Idempotent Consumer
    slug: idempotent-consumer
  - label: Idempotency-Key
    slug: idempotency-key
  - label: Competing Consumers
    slug: competing-consumers
  - label: Work Queue
    slug: work-queue
  - label: Backpressure
    slug: backpressure
  - label: Ordering
    slug: ordering
references:
  - title: Service Bus dead-letter queues
    url: https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-dead-letter-queues
  - title: Retry pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/retry
  - title: Service Bus message sequencing and scheduled delivery
    url: https://learn.microsoft.com/en-us/azure/service-bus-messaging/message-sequencing
---

## When to use

This is not a pattern you choose; it is a failure you plan for. Every at-least-once consumer gets one eventually.

- A payload the handler cannot parse: a producer that changed its schema, a field that went from a number to a string, a null nobody expected.
- A bug that hates one specific input. The other ten thousand messages go through; this one takes the same branch every time and throws in the same place.
- A downstream that will reject one record forever, not just now: a foreign key that will never exist, an account that was deleted, a currency the pricing service does not know.
- A message that was valid when it was sent and is not any more, because the thing it refers to has been removed.

The common thread is that the outcome does not depend on when you try. That is what makes it poison rather than a transient fault, and it is the only distinction that matters for what you do next.

## Cautions

- Separate poison from transient before you retry anything. A timeout is worth another attempt; a deserialization error is not. Retrying poison harder is pure waste, so classify the exception and let the two kinds take different paths.
- Immediate redelivery is the default in most brokers, and it is the worst possible policy for a message that always fails. It maximises the damage: the consumer spends all of its time on the one message it can never finish, and everything behind it waits. Always put a delay between attempts.
- Cap the attempts and keep the count with the message, not in consumer memory. A count held in the process is lost on restart and invisible to the other replicas, which is why brokers carry a delivery count on the message itself.
- If you implement the delay by scheduling a copy of the message, the copy is a new message and its delivery count starts again. Carry your own attempt number in a header, or the budget will never be spent.
- A dead-letter queue with nobody watching it is a landfill. It needs an alert on the first message, an owner, and a documented way to replay a message once the cause is fixed.
- Order guarantees make all of this harder. In a partitioned stream or a session, the poison message cannot be skipped without skipping everything behind it for that key, because moving it aside is exactly what per-key order forbids. Either accept the pause, or decide up front that a message that has spent its budget is dropped from the sequence and the gap is recorded.
- Log enough to diagnose it later: the message id, the delivery count, the exception, and the payload if you are allowed to keep it. The whole point of isolating the message is that somebody can find out why.

## In .NET

Azure Service Bus does most of this for you. `MaxDeliveryCount` is the retry budget, enforced by the broker rather than the consumer, and the message is moved to the queue's dead-letter sub-queue automatically once it is spent. What is left to write is the split between transient and permanent, and the delay in between.

```csharp
var admin = new ServiceBusAdministrationClient(connectionString);
await admin.CreateQueueAsync(new CreateQueueOptions("orders")
{
    MaxDeliveryCount = 5,                    // the budget, counted by the broker
    LockDuration = TimeSpan.FromMinutes(1),  // how long a delivery may run before it comes back
});

const int MaxAttempts = 5;
var sender = client.CreateSender("orders");
var processor = client.CreateProcessor("orders", new ServiceBusProcessorOptions
{
    MaxConcurrentCalls = 4,
    AutoCompleteMessages = false,            // settle every message explicitly
});

processor.ProcessMessageAsync += async args =>
{
    var token = args.CancellationToken;
    try
    {
        var order = args.Message.Body.ToObjectFromJson<OrderPlaced>();
        await handler.HandleAsync(order, token);
        await args.CompleteMessageAsync(args.Message, token);
    }
    catch (Exception ex) when (IsPermanent(ex))
    {
        // Poison: it will fail the same way on the next delivery too, so spend
        // nothing more on it. The reason travels with the message.
        await args.DeadLetterMessageAsync(args.Message, ex.GetType().Name, ex.Message, token);
    }
    catch (Exception ex)
    {
        // Transient, or not classified yet: wait, then try again at the back of
        // the queue. The attempt number rides in a header, because scheduling a
        // copy resets the broker's own delivery count.
        var attempt = args.Message.ApplicationProperties.TryGetValue("attempt", out var v) ? (int)v : 1;
        if (attempt >= MaxAttempts)
        {
            await args.DeadLetterMessageAsync(args.Message, "RetryBudgetExhausted", ex.Message, token);
            return;
        }

        var retry = new ServiceBusMessage(args.Message);
        retry.ApplicationProperties["attempt"] = attempt + 1;
        var delay = TimeSpan.FromSeconds(5 * Math.Pow(3, attempt - 1));   // 5s, 15s, 45s, ...
        await sender.ScheduleMessageAsync(retry, DateTimeOffset.UtcNow.Add(delay), token);
        await args.CompleteMessageAsync(args.Message, token);
    }
};

static bool IsPermanent(Exception ex) =>
    ex is JsonException or ValidationException or ArgumentException;
```

`IsPermanent` is the whole design in one method, and it is worth more care than the retry policy around it. Everything it returns `true` for is dead-lettered on the first failure, which costs one attempt instead of five; everything else gets the delay ladder. Abandoning the message instead of scheduling a copy is simpler and keeps the broker's delivery count, but it hands the message straight back, which is the immediate redelivery the second step of the scene is about, so it is only reasonable when the lock duration is long enough to act as the delay.

On the other side, read the dead-letter queue like a queue and not like a log. `ServiceBusReceiver` opens it with `SubQueue.DeadLetter`, and each message carries `DeadLetterReason` and `DeadLetterErrorDescription` alongside the original body and headers. An alert on the message count, a page that shows the reasons, and a button that re-sends a message to the main queue once the bug is fixed are what turn the drawer into a workflow rather than a place messages go to be forgotten.
