---
title: "Partitioning"
summary: "Partitioning decides along which axis data splits: rows apart so each part carries a share of the load, or columns apart so the hot narrow fields stop hauling the cold wide ones. The partition key then decides whether the load actually spreads or piles onto one hot part."
category: "Data distribution and consistency"
tags: ["database"]
level: 4
scene: partitioning
steps:
  - title: "One blob that holds everything grows every cost together"
    text: "The ghost shows the single table: every query sweeps all of it, the locks queue behind the sweeps, and the backup window stretches with the row count. Nothing is broken — it is just one thing where there should be parts. Partitioning starts with one decision: which axis to cut along."
  - title: "Cut across the rows and each part carries a share"
    text: "Same schema on every part, different rows in each: the key says which rows live where, writes split between the parts, and a part's locks, cache, and backup now cover half the world instead of all of it. This is the cut that buys capacity — the one people mean when they say sharding."
  - title: "Cut along the columns and the hot fields stop hauling the cold ones"
    text: "The narrow columns every request reads go one way; the wide blobs read once a month go the other. The frequent read now touches a lean part that fits in cache, and the two halves of a row rejoin by id on the rare day both are needed. This cut buys speed for the hot path, not capacity."
  - title: "The key decides whether partitioning works at all"
    text: "Partition by date and today's writes all land on today's part — a perfect design collapsing back into one hot blob. Partition by something requests spread across, like user, and the load spreads with it. The key must be in every hot query, spread evenly, and never need changing; pick it like it is permanent, because moving data later is the expensive story."
related:
  - label: Sharding
    slug: sharding
  - label: Horizontal Partitioning
    slug: horizontal-partitioning
  - label: Vertical Partitioning
    slug: vertical-partitioning
  - label: Hot Partition
    slug: hot-partition
  - label: Cross-Shard Query
    slug: cross-shard-query
  - label: Rebalancing
    slug: rebalancing
  - label: Database Index
    slug: database-index
  - label: Replication
    slug: replication
  - label: Denormalization
    slug: denormalization
  - label: Cache-Aside
    slug: cache-aside
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

## When to use

- When one store's load, size, or blast radius has to shrink and no cheaper move is left. Partitioning is the answer to a table that has outgrown a machine rather than to a query that has outgrown an index, and the difference matters because only one of those two problems is worth a second connection string.
- **Horizontally, for capacity.** Same schema on every part, different rows in each: each part takes a share of the rows, a share of the writes, and a share of everything that scales with row count. Locks contend within a part instead of across the whole table, a cache holds a meaningful fraction of one part, and a backup or an index rebuild covers a slice you can finish inside its window. This is the cut people mean when they say sharding.
- **Vertically, for hot-path speed.** The narrow columns every request reads split from the wide ones almost nothing reads: a description blob, a serialised payload, an audit trail, an image. The frequent read then touches a lean row that fits more of itself into every page of cache, and the wide half is fetched only on the rare occasion something actually wants it.
- **Functionally, for independence.** Different tables to different stores, drawn along a service boundary rather than along a key. It is the third axis and the one least often named as partitioning, but splitting orders from analytics into separate databases is the same decision made about tables instead of about rows.
- When backup, restore, or index maintenance has outgrown its slot. A four-hour restore on one table is a four-hour outage; four parts restored in parallel is a different conversation with the same hardware, and the parts that were not damaged never went down at all.
- When one tenant, region, or customer must be isolated for reasons that are not about performance. A part per tenant makes "delete everything belonging to this customer" a drop rather than a delete, and makes a residency requirement a deployment decision instead of a query predicate.
- **Not** as a first resort. An index, a cache, a read replica, a bigger machine, or deleting data you no longer need is cheaper than a second part every time, and all of them can be undone on a Tuesday. Partitioning is the one architectural decision here that gets harder to reverse the longer it works.

## Cautions

- The partition key is the decision; everything else is mechanism. It must appear in every hot query, or those queries have to visit every part. It must spread load evenly, or one part carries the system. It must never change, or a value edit becomes a row move across stores. Pick it as if it were permanent, because in practice it is.
- Date and time keys make today the hot part. Every new row carries today, so every write lands on the same part while the others sit idle, and the design that looked balanced on paper collapses back into one busy table. Time-based partitioning is right when the access pattern is also time-based — retention, archival, append-only telemetry read by range — and wrong the moment the workload is "recent things, constantly".
- Low cardinality caps the number of parts. A key with six distinct values can never make more than six parts, however many machines you buy, and a key whose distribution is skewed at the source makes parts whose sizes are skewed the same way. Count the distinct values before counting the machines.
- A query that does not carry the key must visit every part and merge the answers. That is a real operation with a real cost, and it turns a cheap lookup into a fan-out whose latency is the slowest part's. Design the key around the queries that must stay fast and accept the fan-out for the ones that can be slow — or keep a second, differently keyed copy for them.
- Transactions and unique constraints stop at the part boundary once the parts are separate databases. Two rows in two of them cannot be updated atomically by the database, and a unique index cannot span them, so uniqueness becomes something the application or a separate store has to enforce, and foreign keys across parts stop being enforceable at all. A partitioned table inside one database is the exception: it is still one logical table, so transactions and unique indexes that include the partitioning column work as they always did.
- A vertical split pays a join, or a second fetch, on any read that wants the whole row. That is the trade being made deliberately — the rare read pays so the common one does not — but it stops being a good trade the moment something starts reading both halves on the hot path.
- Count the parts you can operate, not the parts you can imagine. Every part is a thing to monitor, back up, patch, fail over, and reason about at three in the morning. Four parts a team can actually run beat sixty-four that exist mostly in a diagram.
- Moving data later is the expensive story. Changing the key or the part count means rewriting rows across stores while the system is serving traffic, with a plan for what a reader sees mid-move. This is why the key is chosen as though permanent, and why consistent hashing and rebalancing exist as their own subjects.

## In .NET

Vertical partitioning has direct support in EF Core, because two entities can share one table and one row without either of them knowing the other exists. Table splitting is the model-level version of the third step of the scene.

```csharp
// The wide half is a separate entity sharing the same table and key, so a
// query for Product never loads the blob unless it asks for it.
modelBuilder.Entity<Product>(b =>
{
    b.ToTable("Products");
    b.HasOne(p => p.Details).WithOne()
        .HasForeignKey<ProductDetails>(d => d.Id);
});

modelBuilder.Entity<ProductDetails>().ToTable("Products");
```

Reading the narrow half is then the default, and the wide half is an explicit ask.

```csharp
// The hot path: no blob, no description, no audit payload.
var summary = await db.Products
    .Where(p => p.CategoryId == categoryId)
    .Select(p => new ProductSummary(p.Id, p.Name, p.Price))
    .ToListAsync(ct);

// The rare path, once somebody actually opens the thing.
var full = await db.Products
    .Include(p => p.Details)
    .SingleAsync(p => p.Id == id, ct);
```

Horizontal partitioning has no framework feature, because the framework cannot know your key. What it needs is a map from key to connection string and a context per part.

```csharp
public sealed class ShardMap(IReadOnlyList<string> connections)
{
    // The key rule lives in one place, and nothing else decides it. The mod-N
    // body is the naive version: see consistent hashing and rebalancing for a
    // rule that survives a change in the number of parts.
    public string ConnectionFor(Guid tenantId) =>
        connections[(int)((uint)tenantId.GetHashCode() % connections.Count)];
}

public sealed class OrdersContextFactory(ShardMap map)
{
    public OrdersContext For(Guid tenantId)
    {
        var options = new DbContextOptionsBuilder<OrdersContext>()
            .UseSqlServer(map.ConnectionFor(tenantId))
            .Options;
        return new OrdersContext(options);
    }
}
```

The rule above hashes rather than ranging on the key, which is the difference between spreading and piling: a range on a date puts every new row in the last part, while a hash on a tenant scatters them. Note also that `GetHashCode` is the wrong hash to place data with. `Guid.GetHashCode` happens to be deterministic today, but nothing promises it across runtime versions, and `string.GetHashCode` is randomised per process, so a key hashed that way lands somewhere else after a restart. A real shard map owns its hash — `XxHash64`, as on the sharding page — so the same key resolves to the same part next year.

Managed platforms provide the shape rather than the plumbing. Azure SQL Database offers elastic database tools with a shard map manager that keeps key ranges and their databases; Azure Cosmos DB makes the partition key part of the container definition, so the choice is declared at creation and cannot be edited afterwards.

```csharp
await database.CreateContainerIfNotExistsAsync(new ContainerProperties(
    id: "orders",
    // Chosen for spread and for being in every hot query. It is also
    // permanent: changing it means a new container and a migration.
    partitionKeyPath: "/tenantId"));

// Single-partition read: the key is supplied, so one partition answers.
var order = await container.ReadItemAsync<Order>(
    id, new PartitionKey(tenantId), cancellationToken: ct);
```

For time-shaped data where the access pattern really is time-shaped, SQL Server's own partitioned tables keep one logical table split across partitions by a range function, which makes archiving a metadata operation rather than a delete.

```sql
-- Retention as a switch, not as a DELETE that fills the log.
ALTER TABLE Telemetry SWITCH PARTITION 1 TO TelemetryArchive PARTITION 1;
```

The shape to aim for is the one the scene ends on. One rule decides where a row lives, that rule is readable in one place, and it names something every hot query already carries. The parts hold the same schema and different rows, or different columns and the same identity, and which of those two it is was a decision rather than a drift. And nothing in the running system depends on the number of parts staying what it is today, because the one thing that is certain about a partitioned store is that it will need more parts than it has.
