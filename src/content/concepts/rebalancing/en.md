---
title: "Rebalancing"
summary: "Rebalancing is what happens to partitioned data when the node set changes: whole partitions move — not rows one by one — a good scheme moves the minimum and nothing else, and the system keeps answering while ownership shifts, because the map, not the node, is the truth."
category: "Data distribution and consistency"
tags: ["database", "consistency"]
scene: rebalancing
steps:
  - title: "Adding a node does nothing until data follows it"
    text: "The ghost shows two full nodes and rising load; then a third joins — empty, and it stays empty: the partitions, and the load with them, are still on the old two. Capacity is not the node count; it is how the partitions sit across the nodes."
  - title: "What moves is a partition, and the count is the minimum"
    text: "The naive scheme reshuffles everything — six moves to gain one node. A good scheme moves just the share the new node should own and touches nothing else: two partitions travel, four stay exactly where they were. Data motion is the entire cost of rebalancing, so the scheme's whole job is to move less."
  - title: "The answers do not stop while the data moves"
    text: "A moving partition still serves: the map says who owns it right now, and a client still holding an old map asks N2 for P6 and is sent on to N3 instead of getting an error. The node is just a shelf; the map is the truth."
  - title: "A shard heavy with state moves in three beats"
    text: "Copy — the original keeps serving while a replica fills. Catch up — the changes that happened during the copy replay onto the replica. Switch — ownership flips on the map, and the next P5 goes to N1. The pause is the switch, not the copy."
related:
  - label: Sharding
    slug: sharding
  - label: Partitioning
    slug: partitioning
  - label: Stateful Shard
    slug: stateful-shard
  - label: Cross-Shard Query
    slug: cross-shard-query
  - label: Replication
    slug: replication
  - label: Failover
    slug: failover
  - label: Elasticity
    slug: elasticity
  - label: Horizontal Pod Autoscaler
    slug: horizontal-pod-autoscaler
  - label: Competing Consumers
    slug: competing-consumers
references:
  - title: Partitioning and horizontal scaling in Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/partitioning
  - title: Sharding pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/sharding
  - title: Partition Service Fabric reliable services
    url: https://learn.microsoft.com/en-us/azure/service-fabric/service-fabric-concepts-partitioning
---

## When to use

- Whenever the node set changes under partitioned data. That is the whole trigger, and it has four shapes: a node joins and must be given its share, a node leaves and its partitions need homes, a node dies and its share has to be reconstructed somewhere, and a partition gets loud enough that moving it away from its neighbours is cheaper than tolerating it.
- **Scale-out that did not help.** Adding a machine to a partitioned store buys nothing on its own, because requests go where the partitions are and the partitions are still where they were. The new node idles at zero while the old ones stay at their limit, and the capacity graph does not move until data does. If a scale-out looked free, it probably had not finished.
- **Scale-in, which is the same operation run backwards.** A node cannot be switched off while it still owns partitions, so a planned removal is a rebalance with a deadline: drain the partitions to their new owners first, verify the map no longer names the departing node, and only then take it away.
- **Hot-spot relief.** Two partitions can be perfectly balanced by count and badly balanced by traffic. Moving the loud one to a quieter node fixes the symptom without touching the partition key, which is the cheapest correction available once the key is already in production.
- **After a failure replacement.** A replacement node arrives empty, and the system is one node short of its intended spread until the replacement has been given a share. Failover decides who answers next; rebalancing is what puts the picture back the way it was meant to be.
- **Not** as a routine background hobby. Every move is real bytes across real links, competing with production traffic for the same disks. Rebalance when the imbalance costs more than the movement will, and not on a schedule.

## Cautions

- Move partitions, never individual rows. The unit of rebalancing is the unit of partitioning: a partition is the thing the map names, the thing a lock covers, and the thing a node can be said to own. Moving rows one at a time means the map cannot describe where anything is until the last one lands, which is exactly the window in which the system cannot answer.
- Count the moves, because the count is the design. A scheme that hashes the key modulo the node count reshuffles most of the data on every node change: going from four nodes to five moves roughly four fifths of everything, so a routine scale event becomes a migration. Stable schemes exist to avoid that. Many small fixed partitions assigned to nodes lets a join move a handful of assignments and nothing else, and a hash ring moves only the keys between two adjacent points. Both make the cost proportional to what actually changed.
- Keep serving while the data moves. The map is what makes this possible: it names the current owner, it is versioned, and a client holding an old copy is redirected rather than failed. Without that, every move is an outage the length of the copy, and the only remaining option is a maintenance window.
- Throttle the copy. Rebalancing traffic and production traffic want the same disks, the same links and the same page cache, and an unthrottled rebalance is a self-inflicted incident that looks exactly like a traffic spike. One move at a time, with a rate limit, beats a storm that finishes sooner and takes the service with it.
- Watch for oscillation. An automatic rebalancer that reacts to a short spike will move a partition away and then move it back when the spike passes, paying twice for nothing. Debounce the signal, require the imbalance to persist, and put a floor under how often a given partition may be moved.
- Have an answer for a move that fails halfway. The copy can die, the target can go away, the switch can time out. Every move needs a definite owner at every instant, which in practice means the old owner keeps serving until the new one is provably complete, and an abandoned copy is garbage rather than a second truth.
- Do not let a rebalance change more than one thing. Moving partitions and changing the partition key are different operations with different failure modes; doing both at once means neither can be rolled back cleanly.

## In .NET

This is mostly platform behaviour worth understanding rather than code you write. Azure Cosmos DB splits a physical partition when it outgrows its storage or throughput limit, and moves the resulting halves itself; Service Fabric moves replicas between nodes to balance the cluster; Kafka reassigns partitions across a consumer group whenever a member joins or leaves, which is the message-side sibling of the same idea. In all three, application code sees the same thing: a brief window of redirects, timeouts or retries while ownership settles.

So the .NET surface is the client, and the shape to aim for is a client that re-resolves rather than one that retries blindly.

```csharp
// The map is the truth, so a stale answer is a reason to look again rather
// than a reason to fail. Retrying the same connection would just find the
// same empty node.
public async Task<T> ReadAsync<T>(Guid key, Func<string, Task<T>> read, CancellationToken ct)
{
    for (var attempt = 0; ; attempt++)
    {
        var owner = _map.OwnerOf(key);
        try
        {
            return await read(owner);
        }
        catch (PartitionMovedException) when (attempt < 3)
        {
            await _map.RefreshAsync(ct);
        }
    }
}
```

The Cosmos DB SDK already does that for you, which is why the practical advice there is to keep one long-lived client and let it hold the partition map.

```csharp
// One client for the lifetime of the app: it caches the partition map and
// refreshes it when a physical partition splits, so a split is invisible.
services.AddSingleton(_ => new CosmosClient(connectionString, new CosmosClientOptions
{
    // Nothing here handles the split itself; this is the retry budget for the
    // 429s a busy partition returns on its way to one (9 is also the default).
    MaxRetryAttemptsOnRateLimitedRequests = 9,
}));
```

For the message-side case, a consumer group rebalance is the same event with a different name, and the thing that hurts is work in flight when the assignment changes. Handle the revocation rather than ignoring it.

```csharp
var consumer = new ConsumerBuilder<string, byte[]>(config)
    // Commit what has actually been processed before the partition is taken
    // away, or the next owner replays it.
    .SetPartitionsRevokedHandler((c, partitions) => c.Commit())
    .Build();
```

If you are building the map yourself, keep it small, versioned, and owned by one component.

```csharp
public sealed record PartitionMap(int Version, IReadOnlyDictionary<int, string> Owners)
{
    public string OwnerOf(Guid key) => Owners[Partition(key)];

    // Many more partitions than nodes, fixed for the life of the store. A node
    // change then moves assignments, never data boundaries.
    private static int Partition(Guid key) => (int)((uint)Hash(key) % 4096);
}
```

Four thousand partitions across eight nodes means adding a ninth moves about a ninth of the assignments and leaves the rest untouched, which is the entire point. The number of partitions is chosen once and is hard to change; the number of nodes is changed often and should be cheap. Getting that ratio right at the start is what makes every later rebalance a routine operation instead of a project.
