---
title: "Cross-Shard Query"
summary: "A query that does not carry the partition key must ask every shard: scatter the question, wait for the slowest answer, gather and merge. So you route by key when you can, budget the fan-out when you must, and reshape the data so the question you ask most becomes a one-shard question."
category: "Data distribution and consistency"
tags: ["database", "latency"]
scene: cross-shard-query
steps:
  - title: "A question without the key must be asked of everyone"
    text: "The ghost shows every query fanning out to every shard: three machines work, one answer comes back, and the meter reads triple for each ask. Nothing is misconfigured — this is simply the price sheet of partitioned data. Whether the question carries the partition key decides which line of the sheet you pay."
  - title: "A question that carries the key is a one-shard job"
    text: "The router reads the key, points at the one shard that owns it, and the answer costs the same whether there are three shards or three hundred. This is the whole bargain of sharding: design the hot questions to carry the key, and the fleet scales while each answer stays a single conversation."
  - title: "A legitimate scatter is priced by the slowest shard"
    text: "Some questions really belong to everyone — a total, a search. The router scatters, two shards answer fast, and the gather bar waits for the third: fan-out turns one query into a race against your own tail latency. And when a shard does not answer at all, you choose in advance — return a marked partial, or fail whole. Silence is not an option you can leave undesigned."
  - title: "Turn your most-asked question into a one-shard question"
    text: "The summary the dashboard wants every second gets precomputed into a view, updated a little on every write, and read back with a key — the scatter happens once per write, not once per read. You did not change the question; you changed the data's shape so it lands on one shard. That trade is the honest way out of fan-out."
related:
  - label: Sharding
    slug: sharding
  - label: Partitioning
    slug: partitioning
  - label: Rebalancing
    slug: rebalancing
  - label: Denormalization
    slug: denormalization
  - label: Tail Latency
    slug: tail-latency
  - label: Materialized View
    slug: materialized-view
  - label: Two-Phase Commit
    slug: two-phase-commit
  - label: Keyset Pagination
    slug: keyset-pagination
  - label: CQRS
    slug: command-query-responsibility-segregation
  - label: CAP Theorem
    slug: cap-theorem
references:
  - title: Sharding pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/sharding
  - title: Query an Azure Cosmos DB container
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/nosql/how-to-query-container
  - title: Materialized View pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/materialized-view
---

## When to use

- **Route by key whenever the question has one, and design the hot paths so they do.** A cross-shard query is not a feature you turn on; it is what happens when a question arrives without the one piece of information that would have told the router where to look. The first thing to check when a query is slow on a partitioned store is not the index — it is whether the key was in the predicate at all.
- **Budget the legitimate fan-outs as expensive endpoints.** Search, totals, admin sweeps and reports genuinely belong to every shard, and pretending otherwise just moves the cost somewhere less visible. Give them their own path: parallel calls with a timeout, bounded concurrency so one report cannot occupy every connection in the pool, and a partial-result policy decided before the first shard goes quiet.
- **Reshape the data for the rest.** When the same keyless question is asked thousands of times a second, the answer is not a faster fan-out; it is a different shape. A precomputed summary updated on write, or a second copy of the lookup table keyed the other way, turns the question into a keyed read. The scatter still happens, but once per write and small, instead of once per read and large.
- **Accept the fan-out when the question is genuinely rare.** A nightly reconciliation that sweeps every shard is fine. The thing that hurts is a fan-out on the request path, at request rate, where every user's page view multiplies into a shard's worth of work.
- **Not** as a way to postpone choosing a partition key. If most of the traffic needs a fan-out, the key is wrong for the workload, and no amount of parallelism will fix a design that asks everybody everything.

## Cautions

- Fan-out multiplies tail latency. A scatter finishes when its slowest participant finishes, so the answer is drawn from the tail of the shard latency distribution rather than from its middle. Ten shards at a 99th percentile of 200 ms give roughly a one-in-ten chance that any given query pays 200 ms, and the more shards you add the more certain that becomes. Adding shards makes keyed reads cheaper and keyless ones worse.
- Fan-out multiplies the failure surface too. Every shard in the fan is another thing that can be down, slow or rebalancing, and the probability that all of them answer falls as the fan widens. Decide per endpoint whether a missing shard means a marked partial result or a whole failure, and make the marked case visible in the response rather than silently short. An answer that is quietly missing a shard is worse than an error, because nobody investigates it.
- Merge steps can pull whole result sets back to the router. `ORDER BY` with a limit, `DISTINCT`, and top-N all look cheap until you notice the router is holding every shard's rows in memory to compute them. Push the limit and the ordering down to each shard, ask for `limit` rows from each, and merge the streams — that turns an unbounded gather into a bounded one.
- Cross-shard pagination needs per-shard cursors, not a global `OFFSET`. Offsetting into a merged result means every page re-reads and re-merges everything before it, on every shard. Keep a cursor per shard, advance the ones you consumed from, and hand the caller an opaque token that carries all of them.
- Cross-shard transactions are a different pattern. Keep the fan-out read-only. The moment a scatter also writes, you are in two-phase commit or saga territory, with locks held across machines and a coordinator that can die between the prepare and the commit.
- Count your scatters. The ratio of keyless to keyed queries is the health metric for the partition key, and it drifts: someone adds a filter, someone adds a screen, and a year later half the traffic is a fan-out. Instrument it, alert on it, and treat a rising scatter ratio as a signal that the questions the product asks and the key the data is cut on have moved apart.

## In .NET

The mechanics are ordinary `Task.WhenAll`, and the discipline is in the cancellation token and the shape of the result.

```csharp
// One timeout for the whole gather, not one per shard: the caller is waiting
// on the slowest answer, so that is the deadline that matters.
public async Task<Totals> TotalAsync(IReadOnlyList<Shard> shards, CancellationToken ct)
{
    using var budget = CancellationTokenSource.CreateLinkedTokenSource(ct);
    budget.CancelAfter(TimeSpan.FromMilliseconds(250));

    var calls = shards.Select(async shard =>
    {
        try
        {
            return (shard.Id, Value: await shard.SumAsync(budget.Token), Ok: true);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            // This shard missed the budget. It is not an error yet; it is a
            // hole the caller has to be told about.
            return (shard.Id, Value: 0m, Ok: false);
        }
    });

    var results = await Task.WhenAll(calls);
    var missing = results.Where(r => !r.Ok).Select(r => r.Id).ToArray();
    return new Totals(results.Sum(r => r.Value), missing);
}
```

The return type is the point. `Totals` carries which shards are missing, so the caller — and the response body — can say *partial* rather than presenting an undercount as a fact. A method that returns a bare `decimal` here has thrown away the only information that made the answer honest.

Bound the concurrency once the fan is wide. `Parallel.ForEachAsync` with `MaxDegreeOfParallelism` keeps a sixty-four shard sweep from opening sixty-four connections at once, and `System.Threading.Channels` lets each shard stream its rows into one merge rather than materialising every result set on the router.

```csharp
// Each shard is asked for `take` rows, already ordered. The merge then needs
// at most `take * shards` rows in memory instead of everything.
await Parallel.ForEachAsync(shards, new ParallelOptions
{
    MaxDegreeOfParallelism = 8,
    CancellationToken = ct,
}, async (shard, token) =>
{
    await foreach (var row in shard.TopAsync(take, token))
        await writer.WriteAsync(row, token);
});
```

On Cosmos DB the same distinction is a flag. A query whose predicate includes the partition key is served by one physical partition; one without it becomes a cross-partition query, and the SDK will only run it if you allow it.

```csharp
// Keyed: one partition, one charge.
var keyed = container.GetItemQueryIterator<Order>(
    new QueryDefinition("SELECT * FROM c WHERE c.customerId = @id").WithParameter("@id", id),
    requestOptions: new QueryRequestOptions { PartitionKey = new PartitionKey(id) });
```

Leaving `PartitionKey` unset makes it a fan-out across every physical partition, and the request charge grows with the number of partitions rather than with the number of rows returned. `QueryRequestOptions.MaxConcurrency` and `MaxItemCount` bound it, but enabling cross-partition queries quietly, everywhere, is the smell: it makes an expensive query look like a cheap one in code review.

For the fourth step, the mechanism is a change feed or an outbox driving a summary document that is keyed the way the question is asked.

```csharp
// Every write to an order updates the customer's rolling summary. The read
// that used to scatter is now a point read of one document.
processor = container
    .GetChangeFeedProcessorBuilder<Order>("summaries", async (changes, token) =>
    {
        foreach (var order in changes)
            await summaries.PatchItemAsync<Summary>(
                id: order.CustomerId,
                partitionKey: new PartitionKey(order.CustomerId),
                patchOperations: new[] { PatchOperation.Increment("/total", order.Amount) },
                cancellationToken: token);
    })
    .WithInstanceName(instance)
    .WithLeaseContainer(leases)
    .Build();
```

The summary is a copy, so it is stale between the write and the update, and it is wrong if the update is ever missed. Both are manageable — the change feed gives you at-least-once delivery, and an increment applied twice is a bug you fix with a version or an idempotency marker on the summary. What you get back is the ability to answer the most common question in the product with a single keyed read, on a store that would otherwise have had to ask every machine you own.
