---
title: "Idempotent Consumer"
summary: "An idempotent consumer is one that can be handed the same message twice and leave the system in the state it would have been in after handling it once, which is what makes at-least-once delivery survivable."
category: "Messaging and event processing"
scene: competing-consumers
sceneStep: 3
related:
  - label: Competing Consumers
    slug: competing-consumers
  - label: Idempotency
    slug: idempotency
  - label: Idempotency-Key
    slug: idempotency-key
  - label: Deduplication
    slug: deduplication
  - label: Consumer Acknowledgement
    slug: consumer-acknowledgement
  - label: At-Least-Once
    slug: at-least-once
  - label: Unique Constraint
    slug: unique-constraint
  - label: TTL
    slug: ttl
references:
  - title: Idempotent Receiver (Enterprise Integration Patterns)
    url: https://www.enterpriseintegrationpatterns.com/patterns/messaging/IdempotentReceiver.html
  - title: Duplicate detection in Azure Service Bus
    url: https://learn.microsoft.com/en-us/azure/service-bus-messaging/duplicate-detection
  - title: MassTransit consumers
    url: https://masstransit.io/documentation/concepts/consumers
---

Every broker worth using promises at-least-once delivery and nothing more, so the handler will see the same message twice: a consumer that crashed between the effect and the acknowledgement, a redelivery after a network partition, a replay after a rebalance, an operator moving a batch back out of the dead-letter queue. The consumer is the only place that can absorb this, because it is the only place that knows what the effect was. Making it absorb them means one of two things: recognising the repeat and doing nothing, or writing the effect in a form that produces the same result however many times it runs.

Recognising the repeat is a store of message ids and a claim against it, and the claim has to be atomic and in the same transaction as the effect. An `INSERT` of the message id into a table with a unique constraint, in the transaction that also writes the order row, either both happens or neither does; a read followed by a write does not, and two copies delivered at the same moment will both find the store empty and both proceed. Where the effect is not in the same database as the store, the problem moves rather than disappearing: calling a payment API and then recording the id is two systems again, and the way out is usually to make the call itself carry the key so the far side deduplicates, or to write an outbox row and let a separate process do the call.

Designing the repeat away is better when it is available, because it needs no extra table and no expiry. An upsert keyed on a business id, an absolute assignment rather than an increment, a state transition that is a no-op when the row is already in the target state: all of these are safe to run twice by construction. Where a store is unavoidable, give the ids a time to live and understand what that window means, because outside it a late duplicate is indistinguishable from new work. Size it against how long the broker may keep redelivering and how long an operator may take to replay a dead-letter batch, add headroom, and write the number down.
