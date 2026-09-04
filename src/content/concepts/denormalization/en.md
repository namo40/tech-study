---
title: "Denormalization"
summary: "Denormalization is keeping a copy of data in the shape the read wants, updated a little on every write, so the question lands in one place instead of being assembled from several. What you manage afterwards is the number of copies and how stale you will let them get."
category: "Data distribution and consistency"
tags: ["database", "consistency"]
scene: cross-shard-query
sceneStep: 4
related:
  - label: Cross-Shard Query
    slug: cross-shard-query
  - label: Materialized View
    slug: materialized-view
  - label: Sharding
    slug: sharding
  - label: Partitioning
    slug: partitioning
  - label: CQRS
    slug: command-query-responsibility-segregation
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Transactional Outbox
    slug: transactional-outbox
  - label: Database Index
    slug: database-index
  - label: Cache-Aside
    slug: cache-aside
references:
  - title: Modeling data in Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/modeling-data
  - title: Materialized View pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/materialized-view
  - title: Sharding pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/sharding
---

A normalised schema stores every fact exactly once, which makes writing simple and correct: there is one place to change, so nothing can disagree with itself. Reading pays for that. The question the product actually asks almost never matches the shape the facts were stored in, so the answer has to be assembled at read time from several tables, and on a partitioned store from several machines. Denormalization is the decision to pay that assembly cost once, at write time, and keep the result.

The unit is a copy shaped like a question. A customer's order total, a feed of the twenty most recent posts by the people you follow, a product row that carries its category name rather than a foreign key to it. Each of those is derivable from the normalised facts, and each exists because deriving it on every read is more expensive than maintaining it on every write. That ratio is the whole argument, and it is a measurement rather than a matter of taste: if the question is asked ten thousand times for every write that changes its answer, the copy wins by four orders of magnitude, and if it is asked once a day it is pure liability.

What makes it work on sharded data is that a copy can be keyed differently from the original. The facts are partitioned by whatever the writes need, and the copy is partitioned by whatever the reads ask for, so the fan-out that a cross-shard question would have paid on every read becomes a small update on each write instead. This is the same move as a secondary index, done by hand and with the trade-offs visible: you choose what to duplicate, you choose where it lives, and you can see the cost of keeping it current.

The price is that a copy can be wrong. It is wrong for the moment between the write and the update, which is staleness and is usually fine if you say out loud how much of it the feature tolerates. It is wrong permanently if an update is lost, which is not fine, and is the failure mode that matters. So the update path has to be as reliable as the write it follows: inside the same transaction when the copy lives in the same store, and through an outbox or a change feed when it does not, so that a copy is never a message that quietly went missing. Make the update repeatable too, because at-least-once delivery means it will sometimes be applied twice, and an increment applied twice is a wrong number that nothing will ever correct on its own.

Count the copies. Every additional one is another write amplification, another thing to backfill when the shape changes, and another place a bug can leave a lasting inconsistency. Keep a way to rebuild every copy from the normalised source, and run it, because a derivation you have never re-run is a derivation you cannot trust. And keep one source of truth that is still normalised: the moment the copies become the only record, you have lost the ability to answer the question you did not anticipate.
