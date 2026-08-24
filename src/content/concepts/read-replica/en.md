---
title: "Read Replica"
summary: "A read replica is a copy of the database that answers queries and takes no writes. It moves read load off the primary, and every row it serves is as old as the replication lag."
category: "Data distribution and consistency"
scene: replication-lag
sceneStep: 1
related:
  - label: Replication Lag
    slug: replication-lag
  - label: Replication
    slug: replication
  - label: Read-Your-Writes
    slug: read-your-writes
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Load Balancer
    slug: load-balancer
  - label: Read Model
    slug: read-model
  - label: CQRS
    slug: command-query-responsibility-segregation
references:
  - title: Distributed data in cloud-native applications
    url: https://learn.microsoft.com/en-us/dotnet/architecture/cloud-native/distributed-data
  - title: Data store selection (Azure Architecture Center)
    url: https://learn.microsoft.com/en-us/azure/architecture/guide/technology-choices/data-stores-getting-started
---

Most applications read far more than they write, and every one of those reads competes with the writes for the same machine. A read replica takes that competition away: the copy answers the queries, and the primary is left to commit changes and ship them on. It is the cheapest scaling move a relational database offers, because nothing about the schema or the queries has to change, and it is the one most likely to be misapplied, because nothing about them changes either way.

Sending a query to the replica is usually a connection string rather than code. On SQL Server, an availability group listener reads `ApplicationIntent=ReadOnly` and routes that connection to a readable secondary; on PostgreSQL and MySQL you point a second connection at the replica's host and open it read-only. In an application that is a second context or a second session factory over the same model, resolved per operation, and the useful discipline is to make the read-only one genuinely read-only, so that a stray `SaveChanges` fails loudly instead of failing at the database.

What you have bought is capacity, not a second source of truth. The replica is behind by the replication lag, so it answers with rows that were correct a moment ago. That is fine for listings, dashboards, reports, exports and search results, and it is not fine for a read whose result decides a write, because the decision would be made against data that has already been replaced. Uniqueness checks, balance checks and stock levels stay on the primary.

Two things are worth watching once traffic is on it. The first is the lag itself, because a replica under heavy query load applies changes more slowly, which makes it staler exactly when it is busiest. The second is what happens when it is unavailable: reads should fall back to the primary rather than fail, and that fallback should be visible in a metric, because a replica that has quietly dropped out looks like a primary that has quietly doubled its load.
