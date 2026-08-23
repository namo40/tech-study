---
title: "Consumer Acknowledgement"
summary: "A consumer acknowledgement is the message telling the broker the work is finished, which is what removes the message from the queue: until it arrives the broker still owns the message and will give it to somebody else."
category: "Messaging and event processing"
scene: competing-consumers
sceneStep: 3
related:
  - label: Competing Consumers
    slug: competing-consumers
  - label: At-Least-Once
    slug: at-least-once
  - label: Idempotent Consumer
    slug: idempotent-consumer
  - label: Dead Letter Queue
    slug: dead-letter-queue
  - label: Work Queue
    slug: work-queue
  - label: Retry
    slug: retry
  - label: Web-Queue-Worker
    slug: web-queue-worker
references:
  - title: RabbitMQ consumer acknowledgements and publisher confirms
    url: https://www.rabbitmq.com/docs/confirms
  - title: Message transfers and locks in Azure Service Bus
    url: https://learn.microsoft.com/en-us/azure/service-bus-messaging/message-transfers-locks-settlement
  - title: Competing Consumers pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/competing-consumers
---

Delivering a message and finishing it are two different events, and the acknowledgement is the second one. When a consumer takes a message the broker does not delete it; it marks it as delivered to that consumer and keeps it, unacknowledged, until either the acknowledgement arrives or the delivery is lost. That is why a consumer that dies mid-message costs nothing but time: the connection drops, the broker sees an unfinished delivery, and the message goes back to the front of the queue for whoever is free. The same mechanism is why exactly-once delivery is not on offer. A consumer can finish the work and die before the acknowledgement leaves the process, and the broker has no way to tell that apart from a consumer that died before doing anything at all, so it redelivers.

The rule that falls out of this is that the acknowledgement goes after the work and its side effects are durable, never before. Automatic acknowledgement on receipt is the setting that quietly converts every crash, every deployment and every OOM kill into lost messages, and it is the default in more clients than it should be. A failure that the handler can see gets a negative acknowledgement instead, and there the choice is whether to requeue or to dead-letter: requeue for something that may work on the next attempt, dead-letter for something that will not. Brokers count deliveries so this decision can be made for you, and the count is worth reading in the handler as well, because the second attempt at a message is a good moment to log more and try less.

Prefetch decides how many unacknowledged messages one consumer may hold at once, and it is the setting that quietly turns competing consumers back into one consumer. With a prefetch of one, an idle consumer always gets the next message and the queue is the only buffer, at the cost of a round trip per message. With a prefetch of a hundred, a single consumer can pull a hundred messages into its own memory while its neighbours sit idle, and if it dies all hundred have to be redelivered. Raise it when the messages are small and uniform and the round trips are the bottleneck; leave it low when the messages vary in cost, because a fair share of messages is not a fair share of work.
