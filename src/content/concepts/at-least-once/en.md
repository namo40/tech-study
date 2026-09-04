---
title: "At-Least-Once"
summary: "At-least-once is the delivery contract that chooses duplicates over loss: the broker keeps handing a message out until somebody acknowledges it, so a crash costs a repeat rather than a hole. Redelivery is the guarantee working, not the guarantee failing."
category: "Messaging and event processing"
tags: ["queue", "duplicates"]
scene: dead-letter-queue
sceneStep: 1
related:
  - label: Dead Letter Queue
    slug: dead-letter-queue
  - label: Consumer Acknowledgement
    slug: consumer-acknowledgement
  - label: Idempotent Consumer
    slug: idempotent-consumer
  - label: Deduplication
    slug: deduplication
  - label: Message ID
    slug: message-id
  - label: Competing Consumers
    slug: competing-consumers
  - label: Consumer Group
    slug: consumer-group
  - label: Retry
    slug: retry
  - label: Transactional Outbox
    slug: transactional-outbox
references:
  - title: Message transfers, locks, and settlement
    url: https://learn.microsoft.com/en-us/azure/service-bus-messaging/message-transfers-locks-settlement
  - title: Consumer acknowledgements and publisher confirms
    url: https://www.rabbitmq.com/docs/confirms
  - title: MassTransit exceptions, retries and redelivery
    url: https://masstransit.massient.com/concepts/exceptions
---

The first step of the scene shows the same message going to the consumer three times, and it is easy to read that as the system misbehaving. It is the opposite: the broker is keeping a promise. At-least-once says that a message will be delivered until somebody confirms they are finished with it, and the only way to keep that promise across a consumer that might die is to hand the message out again when no confirmation arrives. The delivery count ticking up is the guarantee doing its work in public.

The reason this is the contract almost every broker offers is that the alternative is worse. Acknowledge before you do the work and delivery becomes at-most-once: a crash halfway through leaves a message nobody will ever see again, and no amount of monitoring recovers what was never written down. Acknowledge after, and a crash halfway through leaves a message that will come back. One of those failures is a duplicate you can plan for, and the other is a hole you cannot even detect. Exactly-once, meanwhile, is not a thing a broker can hand you on its own: the acknowledgement and the side effect live in different systems, so there is always an instant where one has happened and the other has not.

That means the choice is really about where the ack goes, and it goes after the work and everything durable that follows from it. In practice a message is not so much delivered as leased: the broker hands it out with a lock and a timeout, and if the consumer neither completes nor renews before the lock expires, the message becomes available again. So a consumer that is merely slow produces a redelivery just as surely as one that crashed, which is why a handler that runs longer than the lock is one of the commonest sources of surprise duplicates.

The bill for all of this is duplicates, and the consumer pays it. There are two ways to pay. The cheaper one is to write handlers whose effect is the same the second time: set a status rather than increment a counter, upsert a row rather than insert one, use the message's own id as the key of whatever you write. The other is to remember what you have already handled, keyed on a message id the producer assigns and keeps stable across redeliveries, and to skip anything you recognise. Most systems end up with both, because the memory has a horizon and the handler is what covers a duplicate that arrives after it.

Duplicates are also not the only thing that comes with the contract. Redelivery reorders: a message that failed and came back is now behind messages that arrived after it, so anything that assumed a sequence has to key on something in the payload rather than on arrival order. And redelivery is unbounded unless something bounds it, which is where the delivery limit and the dead-letter queue come in. Without them a message that always fails is redelivered forever, and at-least-once turns from a promise into a treadmill.

In .NET this is what the Azure Service Bus receive modes are about. `ServiceBusReceiveMode.PeekLock` is the at-least-once path: `CompleteMessageAsync` after the work, `AbandonMessageAsync` to give it back straight away, `RenewMessageLockAsync` when the handler legitimately needs longer, and a lock that simply expires if the process disappears. `ServiceBusReceiveMode.ReceiveAndDelete` is the at-most-once path, and it is the right choice only where losing a message costs less than handling it twice, such as a telemetry stream. RabbitMQ draws the same line with `autoAck`: leave it off, acknowledge after the work, and let `basic.nack` with requeue hand a message back deliberately.
