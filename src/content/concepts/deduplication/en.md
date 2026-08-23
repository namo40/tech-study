---
title: "Deduplication"
summary: "Deduplication is remembering which ids have already been handled and dropping the arrivals that repeat one, which is how at-least-once delivery is turned into one effect per intent."
category: "APIs and real-time communication"
scene: idempotency-key
sceneStep: 2
related:
  - label: Idempotency-Key
    slug: idempotency-key
  - label: Idempotency
    slug: idempotency
  - label: Message ID
    slug: message-id
  - label: Idempotent Consumer
    slug: idempotent-consumer
  - label: TTL
    slug: ttl
  - label: Unique Constraint
    slug: unique-constraint
  - label: Retry
    slug: retry
  - label: Web-Queue-Worker
    slug: web-queue-worker
references:
  - title: Duplicate detection in Azure Service Bus
    url: https://learn.microsoft.com/en-us/azure/service-bus-messaging/duplicate-detection
  - title: Idempotent Receiver (Enterprise Integration Patterns)
    url: https://www.enterpriseintegrationpatterns.com/patterns/messaging/IdempotentReceiver.html
  - title: The Idempotency-Key HTTP Header Field (IETF draft)
    url: https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/
---

Deduplication is a store of ids and a rule: if this id is already in the store, this arrival is a repeat, so do not do the work again. The id has to come from the sender, because only the sender knows that two arrivals mean one intent. Over HTTP it is the `Idempotency-Key` header; on a queue it is the message id, or a business id inside the payload when the broker mints a fresh message id on every redelivery. Storing the id alone is enough to drop a duplicate; storing the outcome with it is what lets you answer the duplicate properly rather than with silence, which is the difference between a consumer that shrugs and an API that replays the original 201.

Where the store lives decides what it actually protects. A broker can deduplicate on its own, and Azure Service Bus will discard a message whose `MessageId` it has seen inside a configured window, but that only covers duplicates the broker itself can see: it does nothing about the same work being delivered once and processed twice because the consumer crashed after the effect and before the acknowledgement. The store that protects your effect is the one next to the effect, ideally in the same transaction as it, so recording "handled" and doing the work either both happen or neither does. A unique constraint on the business table is the cheapest version of this and needs no separate store at all.

Every dedupe store is a promise with an expiry on it. Keeping ids forever is a growing table nobody has budgeted for, so ids get a time to live, and that time to live is the real window of the guarantee: outside it, a duplicate is indistinguishable from a new request. Size it against how long the sender may keep retrying and how long the broker may keep redelivering, add headroom, and write the number down, because the failure it produces is a late duplicate that gets processed as new work. The claim also has to be atomic, an insert that fails on conflict rather than a read followed by a write, or two copies that arrive at the same moment both find the store empty and both proceed.
