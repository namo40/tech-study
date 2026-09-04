---
title: "Shard Key"
summary: "The shard key is the column the router hashes to decide which shard a row lives in. It fixes two things at once — whether a query can be answered by one box, and whether the data spreads evenly — and it is close to unchangeable once data exists."
category: "Data distribution and consistency"
tags: ["database"]
scene: sharding
sceneStep: 2
related:
  - label: Sharding
    slug: sharding
  - label: Consistent Hashing
    slug: consistent-hashing
  - label: Hot Partition
    slug: hot-partition
  - label: Partitioning
    slug: partitioning
  - label: Cross-Shard Query
    slug: cross-shard-query
  - label: Rebalancing
    slug: rebalancing
  - label: Database Index
    slug: database-index
  - label: Replication
    slug: replication
  - label: Replication Lag
    slug: replication-lag
  - label: Load Balancer
    slug: load-balancer
references:
  - title: "Data partitioning guidance"
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/data-partitioning
  - title: "Partitioning and horizontal scaling in Azure Cosmos DB"
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/partitioning
  - title: "Sharding pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/sharding
---

The second step of the scene turns on one rule, and everything visible follows from it: the shard a key belongs to is computed from the key, every time it is asked. The same key is asked for three times in a row and arrives at the same box three times, not because anything remembered where it went, but because the same input through the same function comes out the same. That is the whole promise, and it is worth stating plainly, because it is the property every good thing about sharding is built on and the property every bad thing about it comes from.

The good thing is that a lookup which carries the key touches exactly one box. The router does not search; it computes an address and opens one connection. That is why a sharded system can hold ten times the data and answer a keyed read in the same time as before — it never touched the other nine tenths.

The bad thing is the same sentence read backwards. A query that does not carry the key cannot be routed, so it has to be asked of every shard and the answers merged. The scene draws that as `fan-out`: one request leaving the router down every lane at once. It is not merely N times the work; it is N times the work with the slowest shard setting the latency, N connections held for the duration, and a merge step your database used to do for you. A report that runs once a night can afford it. A page in the request path usually cannot.

So the key is chosen by looking at the queries rather than at the data. Write down the reads that matter — the ones on the critical path, the ones that run most often — and see which value they all already hold. In a business application that value is almost always the tenant, the customer or the account, because the product is already organised around it. If most of your important reads name a customer, `customer_id` is the shard key, and the fact that some analytics job will have to fan out is a price you have decided to pay rather than a surprise.

The second criterion is distribution, and it is the one people check second and regret first. A key that routes well but spreads badly gives you all of the complexity and none of the scale. Low cardinality is the obvious failure: sharding on `country` when 70% of your users are in one country means one shard holds 70% of the data no matter how many you add. Monotonic keys are the subtle one: sharding on a timestamp or an auto-increment id sends every new write to whichever shard owns the current range, so all the write load lands on one box while the others hold history. That pattern is what the Cosmos DB and DynamoDB documentation call a hot partition.

When one column cannot do both jobs, a composite key often can. `tenant_id` alone may be too coarse if one tenant is a hundred times the size of the rest; `tenant_id + region`, or `tenant_id` hashed together with a bucket number, splits the giant while keeping every ordinary tenant in one place. The cost is that queries now need both parts to stay single-shard, so the composite has to be something the query already knows too.

Two more things are worth deciding before the first row is written. Uniqueness is now local: a unique index on a shard is unique on that shard, so anything that has to be unique system-wide either includes the shard key or gets an identifier generated to be unique on its own, such as a GUID or a ULID. And joins only work inside a shard, which means the tables that are read together should be sharded on the same key, so that a customer's orders, addresses and invoices all live in the same box as the customer.

Changing the key later is a data migration, not a configuration change. Every row has to be re-hashed and moved, usually with a dual-write period and a backfill, and every query written against the old key has to be revisited. That is why the choice deserves more design time than it usually gets: you are choosing what your system will be able to ask cheaply for the rest of its life.
