---
title: "Retry Queue"
summary: "A retry queue is the side road a failed message is put on so the main line can keep moving: it holds the message for a delay that grows with each attempt, then puts it back at the tail, and it is what turns head-of-line blocking into a background cost."
category: "Messaging and event processing"
tags: ["queue"]
scene: poison-message
sceneStep: 3
related:
  - label: Poison Message
    slug: poison-message
  - label: Dead Letter Queue
    slug: dead-letter-queue
  - label: Retry
    slug: retry
  - label: Exponential Backoff
    slug: exponential-backoff
  - label: At-Least-Once
    slug: at-least-once
  - label: Work Queue
    slug: work-queue
  - label: Competing Consumers
    slug: competing-consumers
  - label: Exactly-Once
    slug: exactly-once
  - label: Backpressure
    slug: backpressure
references:
  - title: Service Bus message sequencing and scheduled delivery
    url: https://learn.microsoft.com/en-us/azure/service-bus-messaging/message-sequencing
  - title: MassTransit exceptions and redelivery
    url: https://masstransit.massient.com/concepts/exceptions
  - title: Retry pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/retry
---

Watch what happens the moment the third step starts. The failed message is carried out of the consumer sideways, and the main line recovers immediately: the queue that had been standing still drains message after message, the depth falls, and the wait that had been climbing for ten seconds comes back down. Nothing about the bad message changed. What changed is that it is no longer at the head, and that is the entire value of a retry queue. Head-of-line blocking is not caused by the failure; it is caused by retrying the failure in the place where everyone else is waiting.

The mechanism is a delay and a re-entry point. The message is moved somewhere the consumer is not reading from, a timer is set, and when the timer fires it rejoins the queue at the tail rather than the head. Rejoining at the tail matters as much as the delay does: put it back at the head and you have rebuilt the wall as soon as the timer expires. The delay grows with each attempt, which is what the second ring in the scene is saying when it comes up as fifteen seconds after the first one was five. Backoff here is not politeness towards a struggling downstream, though it is that too. It is a budget for how much of the consumer's attention one message is allowed to take.

There are three common ways to build it. A broker with scheduled delivery lets you send the message to itself with a future enqueue time, which is what Azure Service Bus offers and the cheapest option when it is available. A dedicated queue with a per-message time to live and a dead-letter target pointing back at the main queue turns expiry into re-entry, which is the classic RabbitMQ construction. Or you keep a set of delay queues, one per backoff step, and route the message to the one matching its attempt number, which is how the Kafka ecosystem usually does it, since a log has no per-message timer. All three have the same shape and mostly the same trap: the redelivered message is usually a new message as far as the broker is concerned, so its delivery count starts at one again. The RabbitMQ construction is the exception, because each dead-lettering stamps an `x-death` entry whose `count` accumulates per queue and reason, and reading that is enough. With a Service Bus scheduled copy or a Kafka retry topic you have to carry the attempt number yourself, in a header, or the budget the fourth step depends on will never be spent.

The last thing to be honest about is what a retry queue does not fix. It does not make a poison message succeed, and it should not be tuned as if it might. If the delay ladder runs to hours, a message that can never work stays in the system for hours, consuming a slot, an alert, and somebody's attention on every attempt. Classify the failure first: permanent errors should not enter the retry queue at all, they should go straight to the dead-letter queue on the first attempt. The retry queue is for the messages that have a real chance of succeeding later, and for buying the main line its time back while that chance is being tested.
