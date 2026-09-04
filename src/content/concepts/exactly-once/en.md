---
title: "Exactly-Once"
summary: "Exactly-once is a property of a boundary, not of a network: inside one transactional scope a broker can make a read, a write and an acknowledgement atomic, but the moment a side effect leaves that scope the guarantee you actually have is at-least-once plus a handler that can survive being run twice."
category: "Messaging and event processing"
tags: ["queue", "duplicates"]
scene: poison-message
sceneStep: 2
related:
  - label: Poison Message
    slug: poison-message
  - label: At-Least-Once
    slug: at-least-once
  - label: Idempotent Consumer
    slug: idempotent-consumer
  - label: Idempotency Key
    slug: idempotency-key
  - label: Deduplication
    slug: deduplication
  - label: Consumer Acknowledgement
    slug: consumer-acknowledgement
  - label: Transactional Outbox
    slug: transactional-outbox
  - label: Retry Queue
    slug: retry-queue
  - label: Dead Letter Queue
    slug: dead-letter-queue
references:
  - title: Service Bus duplicate detection
    url: https://learn.microsoft.com/en-us/azure/service-bus-messaging/duplicate-detection
  - title: Service Bus message transfers, locks, and settlement
    url: https://learn.microsoft.com/en-us/azure/service-bus-messaging/message-transfers-locks-settlement
  - title: Transient fault handling
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/transient-faults
---

The second step of the scene is the picture of a world without exactly-once, and the point of it is that the world is behaving correctly. The message goes down to the consumer, fails, and comes straight back to the head of the queue. Nobody is doing anything wrong: the consumer never acknowledged it, so as far as the broker is concerned that delivery may have been lost in transit, and the only safe thing to do with a message whose fate is unknown is to deliver it again. Redelivery is not the failure mode. Redelivery is the guarantee working.

That is the whole of at-least-once, and it is what a network gives you for free. What it cannot give you is the other half. An acknowledgement is a message too, and it can be lost on the way back, so the broker can never tell "the consumer never got it" apart from "the consumer did the work and the ack went missing". A protocol that could distinguish those two would need one more round trip, and that round trip has the same problem. This is the two generals problem wearing a different hat, and no amount of engineering makes it go away.

So where does exactly-once come from, given that vendors keep selling it? From a boundary. If the incoming message, the state change it causes, and the acknowledgement all commit in one transaction, then either all three happened or none of them did, and duplicates are impossible because a redelivery finds the state already committed and the offset already moved. Kafka's transactions do this for a read-process-write loop that stays inside Kafka. A broker's duplicate detection window does a weaker version by remembering message ids for a while. Both are real, and both stop at the edge of the system that implements them: the instant your handler charges a card, sends an email or calls a third-party API, the side effect is outside the transaction and the guarantee is gone.

The practical reading is to stop asking for exactly-once delivery and start building exactly-once effect. Give every message a stable id and record that id in the same transaction as the work it causes, so a second delivery finds the record and returns without doing anything. Make the write itself safe to repeat where you can, with an upsert keyed on the message id rather than a blind insert. Keep the surface that talks to the outside world small and put an idempotency key on it. Then redelivery costs nothing and the queue can keep its promise for free, which matters most for the messages that keep coming back for a different reason: a poison message is redelivered too, and a handler that is not safe to repeat turns one broken payload into a series of half-finished side effects.
