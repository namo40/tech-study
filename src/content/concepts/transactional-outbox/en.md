---
title: "Transactional Outbox"
summary: "The transactional outbox writes the business change and the message it implies in one local transaction, and a relay publishes the message afterwards. The broker may be down and the relay may crash and retry; the message is never lost and never invented, only sometimes repeated."
category: "Distributed transactions and message consistency"
tags: ["consistency", "queue"]
scene: transactional-outbox
steps:
  - title: "Two writes, no transaction"
    text: "Commit the order, then publish the event, and the broker is down: the database says Paid and the world never hears it. Publish first instead, and a failed commit invents an event for an order that does not exist."
  - title: "One transaction, two rows"
    text: "The change and the message it implies are written together: the order into its table, the event into the outbox, one commit for both. Fail, and there is no order and no message. Succeed, and the message already exists; a dead broker no longer matters."
  - title: "The relay retries, so delivery is at least once"
    text: "A relay reads pending rows, publishes them, and marks them sent. Crash between publish and mark, and after restart the same message goes out again with the same id. Consumers may see a duplicate; they never see a hole."
  - title: "Sequence, batch, clean up"
    text: "The outbox is a log: rows leave in insert order, in batches, and sent rows are trimmed. When polling gets expensive, change data capture reads the database log instead, and the relay disappears into infrastructure."
related:
  - label: Saga
    slug: saga
  - label: Choreography
    slug: choreography
  - label: Orchestration
    slug: orchestration
  - label: Idempotency-Key
    slug: idempotency-key
  - label: Idempotent Consumer
    slug: idempotent-consumer
  - label: Deduplication
    slug: deduplication
  - label: Message ID
    slug: message-id
  - label: Change Data Capture
    slug: change-data-capture
  - label: Competing Consumers
    slug: competing-consumers
  - label: Consumer Acknowledgement
    slug: consumer-acknowledgement
  - label: Dead Letter Queue
    slug: dead-letter-queue
  - label: Local Transaction
    slug: local-transaction
references:
  - title: Transactional Outbox pattern with Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/azure/architecture/databases/guide/transactional-outbox-cosmos
  - title: Using transactions (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/saving/transactions
  - title: Transactional Outbox (MassTransit)
    url: https://masstransit.io/documentation/patterns/transactional-outbox
  - title: Implementing event-based communication between microservices
    url: https://learn.microsoft.com/en-us/dotnet/architecture/microservices/multi-container-microservice-net-applications/subscribe-events
---

## When to use

- Reach for it whenever one operation has to change state and tell the world in the same breath: an order placed, an account created, a payment captured, a document approved. Those are the two writes that must not come apart, and no amount of retrying around a broker will hold them together.
- It answers the dual write, not slow messaging. If the event is only a convenience, or the reader can rebuild it by asking, a second table and a relay to drain it is upkeep you have bought for nothing.
- The outbox has to live in the same database and be written by the same transaction as the change. A second database, a second connection, or a publish fired from a save callback puts you back where you started with an extra table for company.
- Watch two numbers: how many rows are still pending, and how long the oldest of them has been waiting. A pending count that climbs and never falls is the earliest sign the pipeline has stopped, long before anyone downstream notices a missing event.
- Decide how sent rows leave before you need to. The outbox is a queue that happens to be a table, and a table nobody trims becomes the largest one in the database.

## Cautions

- The pattern buys at-least-once delivery, not exactly-once. A relay can publish a message and die before it records that it did, and the relay that takes over will publish it again with the same id. Design the consumer side first: a stable message id, a record of what has already been handled, and a rule for what a repeat is allowed to mean.
- Publishing in order costs throughput. If consumers care about the order of events for one order or one account, that aggregate's rows have to leave one at a time; if they do not, let the relay batch and run several at once.
- Two relays polling the same table will claim the same rows unless claiming is a lock. `SELECT ... FOR UPDATE SKIP LOCKED`, an owner column holding a short lease, or a single elected leader are the three usual answers, and a scaled-out service needs one of them from the first day.
- The row is written by the transaction, so it carries the shape of the code that wrote it. Keep the payload an explicit contract rather than a serialized domain entity, or a deployment will hand consumers a shape they cannot read.
- Polling has a floor. A relay that wakes every second adds a second of latency and a query per second per instance, and shortening the interval trades one cost for the other. When neither end of that trade is acceptable, change data capture reads the database log instead and the table stops being polled at all.

## In .NET

With EF Core, the entity and the outbox row are added to the same `DbContext` and committed by one `SaveChanges`, or wrapped in an explicit `BeginTransaction` when several calls have to land together. The relay is usually a `BackgroundService` that claims a batch of pending rows, publishes them, and marks them sent, with `FOR UPDATE SKIP LOCKED` on PostgreSQL or `READPAST` on SQL Server so that two instances never take the same row. MassTransit ships an outbox that does all of this against your own `DbContext`, which is worth reading even if you write your own. When polling costs too much, SQL Server change data capture or a Debezium connector reads the log and the relay becomes part of the infrastructure rather than part of the service.
