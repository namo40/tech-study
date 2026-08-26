---
title: "Replication"
summary: "Replication is keeping a second copy of the data on another machine, kept up to date by shipping every change to it. It buys read capacity and a machine to fail over to, and it costs you a window in which the two copies disagree."
category: "Data distribution and consistency"
tags: ["database", "consistency"]
scene: replication-lag
related:
  - label: Replication Lag
    slug: replication-lag
  - label: Read Replica
    slug: read-replica
  - label: Primary-Replica
    slug: primary-replica
  - label: Failover
    slug: failover
  - label: RPO
    slug: rpo
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Materialized View
    slug: materialized-view
references:
  - title: Distributed data in cloud-native applications
    url: https://learn.microsoft.com/en-us/dotnet/architecture/cloud-native/distributed-data
  - title: Data store selection (Azure Architecture Center)
    url: https://learn.microsoft.com/en-us/azure/architecture/guide/technology-choices/data-stores-getting-started
---

One machine holds the data and answers the writes. Replication is the arrangement where every change it commits is also sent to another machine, which applies the same changes in the same order and ends up holding the same rows. The copy is useful for three different reasons, and they are worth keeping apart: it can answer reads, it can be promoted when the first machine is gone, and it can sit in another region so that a regional failure is survivable. A design that wants all three usually wants different replicas for them.

The shape almost everyone starts with is primary-replica: one machine takes every write, and one or more copies follow it. The alternative, several machines accepting writes at once, removes the single write bottleneck and hands you conflict resolution in return, because two machines can now change the same row before either has heard of the other. That trade is worth making for data that is naturally partitioned by owner or by region, and it is a poor trade for anything a user expects to see a single value of.

The other choice is when the primary considers a write finished. Asynchronous replication commits as soon as the primary has the change, and sends it on afterwards: writes stay fast, and a failure of the primary loses whatever had not been sent yet. Synchronous replication waits for a second machine to acknowledge before the commit returns: nothing is lost on promotion, and every write now pays for the round trip, so a slow or unreachable replica becomes a slow or failing write. Most databases offer something in between, such as waiting for one of several replicas, which keeps the common case fast without accepting an unbounded loss.

Whatever you pick, the copy is behind by some amount of time, and that amount is a number you should be able to see. It is small when the write rate is low, it stretches under bursts and long transactions, and it decides both how stale a read can be and how much a failover can lose.
