---
title: "Sharding"
summary: "Sharding splits one database into many by key: the shard key decides where every row lives, adding a shard forces data to move, and consistent hashing keeps that move small — so growth becomes a bounded, predictable event instead of an emergency."
category: "Data distribution and consistency"
tags: ["database"]
scene: sharding
steps:
  - title: "One database, until it isn't"
    text: "Every key in one box works right up to the day the box is full — of data, of writes, of blast radius. Sharding splits the box by key: same data model, many smaller homes, and a router that knows which home every key lives in."
  - title: "The shard key is the address of every row"
    text: "Same key, same shard, every time — that promise is what lets a one-key lookup touch one box. A query that ignores the key fans out to every shard and pays for all of them. Choose the key most queries already hold, and one that spreads evenly."
  - title: "Growth should not mean moving almost everything"
    text: "Add a third shard under hash mod n, and the answer changes for most keys: eight of twelve must move. On a hash ring, a new shard takes over only its neighborhood: four keys move, eight stay home. The promise survives scaling because the map barely changes."
  - title: "Three shards, one map, no drama"
    text: "Keys sit where the ring says, the router sends each request straight home, and load spreads across every box. Growth became a bounded, predictable move, and the next shard will cost the same. What remains is watching the keys themselves: a popular key is a different problem, with its own page."
related:
  - label: Shard Key
    slug: shard-key
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
  - label: Replication
    slug: replication
  - label: Replication Lag
    slug: replication-lag
  - label: Database Index
    slug: database-index
  - label: Load Balancer
    slug: load-balancer
  - label: Ordering
    slug: ordering
  - label: Event Stream
    slug: event-stream
references:
  - title: "Sharding pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/sharding
  - title: "Data partitioning guidance"
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/data-partitioning
  - title: "Partitioning and horizontal scaling in Azure Cosmos DB"
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/partitioning-overview
---

## When to use

- When one database can no longer hold the data, absorb the writes, or bound the blast radius, and vertical scaling has run out of machine to buy. Sharding is what you reach for after the single box stops being a single box you can grow.
- Multi-tenant systems where a tenant is a natural boundary. One tenant per shard, or many small tenants per shard, gives you isolation for free: a runaway tenant fills its own box rather than everyone's.
- Write-heavy workloads a single primary cannot take. Read replicas multiply reads and do nothing for writes, so once the write path is the ceiling, splitting the write path is the only move left.
- Datasets with a key that queries already carry. If almost every request knows the customer, the tenant or the region it is about, the key that shards the data is already in your hands.
- Not first. Try the cheaper things in order — an index, a cache, a read replica, archiving cold rows — because every one of them is reversible and sharding is not. Sharding taxes every query written after it, forever.

## Cautions

- The shard key is close to unchangeable. Changing it means rewriting where every row lives, so choose it for the queries you actually run rather than for the one you happen to be writing today.
- Cross-shard queries and transactions are the bill. A query without the key becomes a fan-out to every shard, and a transaction across shards becomes either a distributed commit or a saga. Design so the common path stays inside one shard and the rare path is allowed to be slow.
- Rebalancing without consistent hashing turns growth into a migration. Under `hash mod n`, adding one shard changes the answer for most keys, which means most of your data moves at once. A hash ring, or a fixed set of virtual partitions you reassign, keeps the move proportional to what you added.
- An even key space is not an even load. Keys can be spread perfectly and still leave one shard on fire, because one key is read a thousand times more often than the rest. That is a hot partition, and no number of shards fixes it.
- Operational cost multiplies. Backups, schema migrations, monitoring, failover drills and on-call runbooks all become N of each, and the slowest shard sets the pace for anything that has to touch all of them.
- Auto-increment identifiers stop being unique. Sequences are per-shard, so give rows an identifier that is unique before it is stored: a GUID, a ULID, or a key that carries the shard in it.

## In .NET

Nothing in the framework shards for you, and that is the right shape: routing belongs in your data layer, as a shard map from key to connection string.

```csharp
// A shard map: the key decides the connection, and nothing else does.
public sealed class ShardMap(IReadOnlyList<string> connections)
{
    public int ShardOf(string shardKey)
    {
        // A stable hash, not string.GetHashCode(): that one is randomised per
        // process, so the same tenant would land in a different shard after a
        // restart. XxHash64 comes from the System.IO.Hashing package.
        var hash = XxHash64.HashToUInt64(Encoding.UTF8.GetBytes(shardKey));
        return (int)(hash % (ulong)connections.Count);
    }

    public string ConnectionFor(string shardKey) => connections[ShardOf(shardKey)];

    public IReadOnlyList<string> Connections => connections;
}

// A query that has the key touches one shard. A query that does not touches all
// of them, and the cost of that is written into the method that does it, so
// nobody adds a fan-out by accident.
public sealed class OrderQueries(ShardMap map, IDbContextFactory<OrderDbContext> inner)
{
    public async Task<List<Order>> ForTenantAsync(string tenantId, CancellationToken token)
    {
        await using var context = Open(map.ConnectionFor(tenantId));
        return await context.Orders
            .Where(o => o.TenantId == tenantId)
            .ToListAsync(token);
    }

    public async Task<List<Order>> PlacedSinceAsync(DateTimeOffset cutoff, CancellationToken token)
    {
        var pages = await Task.WhenAll(map.Connections.Select(async connection =>
        {
            await using var context = Open(connection);
            return await context.Orders.Where(o => o.PlacedAt > cutoff).ToListAsync(token);
        }));

        return pages.SelectMany(page => page).OrderByDescending(o => o.PlacedAt).ToList();
    }

    // Pooling is per connection string, so N shards means N pools rather than
    // one shared one. Size them for the shard, not for the whole system.
    private OrderDbContext Open(string connection)
    {
        var context = inner.CreateDbContext();
        context.Database.SetConnectionString(connection);
        return context;
    }
}
```

Managed options move the routing out of your code without changing the thinking. Azure Cosmos DB asks for a partition key on every container and shards on it for you, so the design work is choosing that key and keeping queries inside one logical partition. Azure SQL Database offers elastic pools plus a shard map manager, which keeps the key-to-database map in a catalogue database and hands you a connection for a given key. For cache tiers the same idea appears one layer up: a client-side consistent hash over the cache nodes, so adding a node invalidates a slice of the cache instead of all of it.
