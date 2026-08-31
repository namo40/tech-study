---
title: "Horizontal Partitioning"
summary: "Horizontal partitioning splits a table by rows: every part keeps the same schema and holds a different subset, chosen by a key. It is the cut that buys capacity, and the key that chooses is the whole of the decision."
category: "Data distribution and consistency"
tags: ["database"]
scene: partitioning
sceneStep: 2
related:
  - label: Partitioning
    slug: partitioning
  - label: Sharding
    slug: sharding
  - label: Vertical Partitioning
    slug: vertical-partitioning
  - label: Hot Partition
    slug: hot-partition
  - label: Cross-Shard Query
    slug: cross-shard-query
  - label: Rebalancing
    slug: rebalancing
  - label: Replication
    slug: replication
  - label: Database Index
    slug: database-index
  - label: Keyset Pagination
    slug: keyset-pagination
  - label: CAP Theorem
    slug: cap-theorem
references:
  - title: Data partitioning guidance
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/data-partitioning
  - title: Data partitioning strategies
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/data-partitioning-strategies
  - title: Sharding pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/sharding
---

The second step of the scene is the cut most people picture when they hear the word. The schema does not change: every part has the same columns, the same indexes, the same shape, and the only difference between them is which rows they hold. That is why both cards in the scene draw the same three bands. Nothing about a part tells you it is a part, except that the rows it does not have are somewhere else.

What that buys is capacity, and it buys it on every axis that scales with row count at once. Writes split, so no single machine takes them all. Locks contend inside a part rather than across a whole table, so a long transaction on one part is invisible to the others. A cache holds a meaningful fraction of one part instead of a rounding error of everything. A backup covers a slice you can finish, a restore brings back one part while the rest keep serving, and an index rebuild stops being a thing that has to be scheduled a month in advance. None of these is the headline reason anyone reaches for it, and together they are usually the real one.

The key is the whole decision. It has to appear in every query that must stay fast, because a query without the key cannot be routed to one part and has to visit all of them. It has to spread the rows evenly, because a key that concentrates them makes one part hold the system while the others idle. And it has to be immutable, because changing a value that decides where a row lives means moving the row between stores, with something having to be true for readers while it is in two places or in neither. A tenant id, a user id, an account id: things that are assigned once and referenced forever.

Range keys and hash keys fail differently, and the difference is worth knowing before choosing. A range on the key keeps neighbours together, which makes "everything for this customer between March and June" a scan inside one part instead of a fan-out. But a range on time puts every new row in the newest part, which is the fourth step of the scene: a design that looks perfectly balanced until it is running, at which point one part takes all the writes. A hash spreads evenly by construction and gives up the range scan entirely, because neighbouring keys land nowhere near each other. Composite keys buy some of both, at the price of a rule that is harder to hold in your head.

What is given up is the guarantees that used to be free. A transaction cannot span parts, so an operation that touches two of them needs a saga, an outbox, or an acceptance that the two halves settle separately. A unique index cannot span parts, so uniqueness on anything other than the key becomes the application's problem or a separate store's. Foreign keys across parts are not enforceable at all. Joins between tables that are partitioned by different keys stop being joins and become two queries and some code. Every one of these has a workable answer; the point is that they were free before and are not free now.

The number of parts is a decision that is easy to make once and hard to change afterwards, so it is worth making it deliberately. A key hashed modulo the part count is the simplest rule anyone writes down, and it is also the rule that moves almost every row when the count changes, which is why consistent hashing exists. A shard map that stores key ranges against databases costs a lookup and buys the ability to split one part in two without touching the others. Neither removes the cost of moving data; they change how much data has to move.

The operational size of the system grows with the number of parts, and that growth is linear in things people forget to count. Every part is a connection pool, a monitoring target, a backup schedule, a patch window, a failover plan, and a place a migration can fail halfway. Two parts are barely more work than one. Sixteen parts are a different job. Pick the number you can run on your worst week, not the number that makes the arithmetic come out nicely.

In .NET there is no framework feature for this, because the framework cannot know your key. What there is instead is a small map from key to connection string, a `DbContext` created against whichever connection that map returned, and a discipline about never letting a query that lacks the key reach the database by accident. Azure SQL Database packages the same idea as elastic database tools with a shard map manager, and Cosmos DB makes the partition key part of the container definition so that the choice is declared once and cannot quietly drift.
