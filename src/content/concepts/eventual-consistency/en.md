---
title: "Eventual Consistency"
summary: "Eventual consistency is the promise that once updates stop, every replica converges to the same value, with no bound on when. What you design for is the window in between: what readers may see, what they must never see, and which reads need something stronger."
category: "Data distribution and consistency"
tags: ["consistency"]
scene: eventual-consistency
steps:
  - title: "Convergence"
    text: "A write lands on the primary and fans out to the replicas a moment later. Stop writing, and every copy ends up identical. Eventually says nothing about when, only that the gap closes."
  - title: "Where you read decides what you see"
    text: "Two readers ask the same question at the same moment and get different answers, because each replica trails the primary by its own lag. Under a write burst, that lag has no ceiling."
  - title: "Your own write is the promise that breaks first"
    text: "Save, refresh, and the change is gone: the read landed on a replica the write had not reached. Session consistency makes that user's reads wait for, or go to, a copy that has their writes, and the promise holds again."
  - title: "Choose per read, not per system"
    text: "A balance check reads the primary and pays the latency; a product page reads any replica and pays nothing. A staleness bound in the middle keeps a lagging replica out of rotation until it catches up."
related:
  - label: Replication
    slug: replication
  - label: Replication Lag
    slug: replication-lag
  - label: Read Replica
    slug: read-replica
  - label: Read-Your-Writes
    slug: read-your-writes
  - label: Session Consistency
    slug: session-consistency
  - label: Bounded Staleness
    slug: bounded-staleness
  - label: Materialized View
    slug: materialized-view
  - label: Projection
    slug: projection
  - label: CQRS
    slug: command-query-responsibility-segregation
  - label: Cache Invalidation
    slug: cache-invalidation
  - label: Saga
    slug: saga
references:
  - title: Consistency levels in Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/consistency-levels
  - title: Manage consistency levels in Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/how-to-manage-consistency
  - title: Distributed data in cloud-native applications
    url: https://learn.microsoft.com/en-us/dotnet/architecture/cloud-native/distributed-data
  - title: Caching guidance (Azure Architecture Center)
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/caching
---

## When to use

- Any read that has left the primary is an eventual read: replicas, caches, search indexes, projections, materialized views. There is usually more than one such layer between a write and a screen, and each adds its own delay.
- The guarantee is convergence, not currency. It says the copies stop disagreeing once the writes stop; it says nothing about the value a reader gets while they are still arriving.
- Reach for it when reads outnumber writes, when the data was already a little old when the page asked for it, and when two readers seeing different answers for a second is a non-event: catalogues, feeds, dashboards, search.
- Watch replication lag next to your error rates, because it is the width of the window everything else in this page is about. A system with no lag readout has no idea how stale its reads may be.
- Decide per endpoint rather than per system. Most reads are happy with a replica, a few must see the caller's own writes, and a very few must be current for everyone; only the first is free.

## Cautions

- Eventual is a statement about convergence, not a latency bound. Under a write burst, a long transaction, or a replica that applies changes on one thread, the window stretches with nothing to stop it.
- The first break users report is read-your-writes: they save, the page reloads from a replica the change has not reached, and their own edit is missing. Fix that one case with session pinning or a session token, not by making every read strong.
- Do not mix consistency by accident. A strong read whose result is cached, or fed into a projection, is an eventual read wearing the wrong label, and it will be trusted as if it were current.
- Monotonic reads matter too. A user bouncing between replicas can see a value, then an older one, then the newer one again, which reads as the system undoing their work.
- Never let an eventual read feed a write. Read-modify-write on a stale value silently replaces a change nobody has seen yet, and nothing raises an error.

## In .NET

Azure Cosmos DB makes the choice explicit, one account-wide default plus a per-request override that can only relax it. Session is the practical level, it only holds if the session token travels with the user, and an account that needs one `Strong` read has to be configured `Strong` and relaxed to `Session` everywhere else.

```csharp
// Session for everything ordinary: a client always sees its own writes. The
// account behind this is configured Strong, which is what lets one read below
// ask for Strong at all.
builder.Services.AddSingleton(_ => new CosmosClient(connection, new CosmosClientOptions
{
    ConsistencyLevel = ConsistencyLevel.Session,
}));

// The token is what carries the guarantee. The SDK keeps it inside one client
// instance, so carry it with the user (cookie, header) or a request that lands
// on another instance arrives without it.
var read = await container.ReadItemAsync<Cart>(
    id,
    new PartitionKey(userId),
    new ItemRequestOptions { SessionToken = tokens.Get(userId) });
tokens.Set(userId, read.Headers.Session);

// The one read that cannot be eventual: it keeps the account's Strong level
// instead of relaxing, asked for explicitly and paid for.
var balance = await container.ReadItemAsync<Account>(
    accountId,
    new PartitionKey(userId),
    new ItemRequestOptions { ConsistencyLevel = ConsistencyLevel.Strong });
```

The same shape appears without Cosmos DB. A read replica behind SQL Server or PostgreSQL is routed to by connection string, and the decision of which reads may use it belongs in one place rather than scattered across handlers. `HybridCache` and output caching are one more eventual layer on top of whatever the store already gives you, so a cached copy of a strong read is only as fresh as its entry, and the expiry you choose is the staleness you have agreed to.
