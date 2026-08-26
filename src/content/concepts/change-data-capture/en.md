---
title: "Change Data Capture"
summary: "Change data capture reads the log a database already writes for its own recovery and turns each committed row change into an event. Nothing polls a table and nothing is written twice: the change is the message, and the pipeline reads it from where the database put it."
category: "Distributed transactions and message consistency"
tags: ["database", "consistency"]
scene: transactional-outbox
sceneStep: 4
related:
  - label: Transactional Outbox
    slug: transactional-outbox
  - label: Replication
    slug: replication
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Materialized View
    slug: materialized-view
  - label: Projection
    slug: projection
  - label: Event Sourcing
    slug: event-sourcing
  - label: Message ID
    slug: message-id
references:
  - title: About change data capture (SQL Server)
    url: https://learn.microsoft.com/en-us/sql/relational-databases/track-changes/about-change-data-capture-sql-server
  - title: Track data changes (SQL Server)
    url: https://learn.microsoft.com/en-us/sql/relational-databases/track-changes/track-data-changes-sql-server
  - title: Outbox event router (Debezium)
    url: https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html
---

A relay that polls an outbox is asking a question it usually gets no answer to. Every wake-up costs a query, the interval sets a floor under the latency, and shortening it only moves the cost from one column to the other. Change data capture removes the question. Every committed change is already in the database's own write-ahead log, because that is how the database survives a crash and how its replicas stay in step, and a capture process reads that log and emits one event per row change. The transaction is still the thing that decides what happened; the pipeline just stops asking and starts listening.

What comes out is lower level than what an outbox row carries, and that is the trade. An outbox row is a message you designed: a name, a version, a payload you chose. A capture feed gives you the before and after image of a table row, which means consumers see your schema. Column renames, a new nullable field, a table split into two, all of it reaches whoever is downstream. The usual fix is to keep an outbox table anyway and capture only that: the transaction writes the message you meant, and the log reader ships it. Debezium's outbox event router is exactly this arrangement, and it is worth understanding as the default rather than the exotic case.

The guarantee is the same one the fourth step of the scene ends on. A capture process records how far through the log it has read, and after a crash it resumes from the last position it managed to record, so the changes between that position and the crash are read a second time. Delivery is at least once, and consumers still need a message id and a memory of what they have handled. Ordering is better than an outbox usually manages, though: the log is a single sequence, so changes come out in commit order for free, and per-table or per-key partitioning keeps that order where it matters while letting the rest run in parallel.

Operationally it moves work out of your service and into the database and the pipeline. SQL Server's change data capture writes into change tables that need a cleanup job and disk of their own; PostgreSQL logical decoding holds write-ahead log segments until every replication slot has consumed them, so a stopped consumer becomes a disk-full incident on the primary rather than a lag graph. Both need to be monitored where they live, not from inside the application. That is the real shape of the choice: an outbox relay is code you own and can debug, and change data capture is infrastructure you configure and have to watch.
