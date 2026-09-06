---
title: "Vertical Partitioning"
summary: "Vertical partitioning splits a table by columns: the narrow fields every request reads go one way, the wide ones almost nothing reads go the other, and the two halves rejoin by id. It buys speed on the hot path rather than capacity, and it is paid for on the rare full-row read."
category: "Data distribution and consistency"
tags: ["database"]
level: 4
scene: partitioning
sceneStep: 3
related:
  - label: Partitioning
    slug: partitioning
  - label: Horizontal Partitioning
    slug: horizontal-partitioning
  - label: Database Index
    slug: database-index
  - label: Denormalization
    slug: denormalization
  - label: Cache-Aside
    slug: cache-aside
  - label: Sharding
    slug: sharding
  - label: Replication
    slug: replication
  - label: Hot Partition
    slug: hot-partition
references:
  - title: Table splitting - EF Core
    url: https://learn.microsoft.com/en-us/ef/core/modeling/table-splitting
  - title: Data partitioning guidance
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/data-partitioning
  - title: Data partitioning strategies
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/data-partitioning-strategies
---

The third step of the scene cuts the same data the other way, and the picture changes shape rather than repeating: the two parts stop being interchangeable. One holds a couple of narrow columns, the other holds the fat ones, and after the cut they are no longer the same kind of thing. That is the difference from the horizontal cut, where both parts hold the same schema and only the rows differ.

The reason to make this cut is almost always the same. A row has grown a field that is large and rarely wanted: a serialised document, a description in six languages, a base64 image somebody added in a hurry, an audit payload nobody has read since it was designed. That field is on every page the database touches when it reads the row, so it is in every scan, every cache page, every backup, and every replication stream, and it is paid for by every request that wanted the price and the name. Splitting it off does not delete anything. It moves the cost onto the reads that actually want it.

What the hot path gets back is density. Fewer bytes per row means more rows per page, which means fewer pages read for the same query and more of the working set resident in memory at once. That effect compounds quietly: a narrow table has smaller indexes, a smaller buffer footprint, faster scans when a scan is unavoidable, and a cheaper replication stream. None of it shows up as a dramatic number on one query, and all of it shows up as a system that stops falling over at the same load it used to.

The two halves stay one row, and the thing holding them together is the identity. The scene draws that as a bracket between the two cards: same primary key on both sides, one-to-one, the wide half optional. That is what makes the split reversible in principle and legible in practice, and it is also the constraint that has to be maintained by something. A wide half without its narrow half is an orphan, and nothing in the schema will stop one from being created if inserts to the two sides are not written together.

What is paid is a join, or a second fetch, on any read that wants the whole row. That is the trade being made on purpose: the rare read pays so the common one does not. It stops being a good trade the moment something on the hot path starts asking for both halves, and that happens more easily than people expect. An export, a search indexer, an admin screen that shows everything, a mapper that was told to load the full aggregate: any of them can quietly turn the split back into a join on every request. The split is only as good as the discipline about which half is loaded by default.

Choosing what goes where is a question about access frequency, not about size alone. A big column read on every request stays with the narrow half, however big it is, because moving it just adds a join to the hot path. A small column read once a year can go with the wide half if it groups naturally with it. The useful test is per column: how often is this read, and by what. Columns that are always read together belong together, and columns whose read rates differ by an order of magnitude probably do not.

Vertical partitioning also has a security shape that has nothing to do with performance. Splitting sensitive columns into their own table lets access be granted on the narrow half without granting it on the other, so a reporting role can read orders without reading the customer's address. It is a coarse control and not a substitute for encryption or row-level security, but it is a real one, and it costs nothing extra when the split was going to happen anyway.

In .NET this is EF Core's table splitting: two entity types mapped to the same table, sharing the primary key, related one-to-one. The narrow entity is the default projection and the wide one is loaded only when something asks with `Include`, which puts the decision in the query rather than in the model. Owned types are not a substitute here: they group columns that have no identity of their own, but they are loaded with their owner every time, even when they are mapped to a separate table. Keeping the wide half off the hot path takes table splitting with a separate entity, or a projection that never names it. And when the wide half is genuinely a different kind of thing — a blob, a document, a file — the honest version of this split is often not a second table at all, but a different store entirely, with the narrow row holding a reference to it.
