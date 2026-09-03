---
title: "DataLoader"
summary: "A DataLoader collects the individual lookups that scatter across one request, fetches them as a single batch, and remembers each answer for the lifetime of that request. It is the standard prescription for the N+1 that a GraphQL resolver graph produces by construction."
category: "APIs and real-time communication"
tags: ["latency"]
related:
  - label: N+1 Query
    slug: n-plus-1-query
  - label: Batching
    slug: batching
  - label: Entity Framework Core
    slug: entity-framework-core
  - label: Cache-Aside
    slug: cache-aside
  - label: REST
    slug: rest
  - label: gRPC
    slug: grpc
references:
  - title: DataLoader
    url: https://chillicream.com/docs/hotchocolate/fetching-data/batching/dataloader
  - title: graphql/dataloader
    url: https://github.com/graphql/dataloader
---

## When to use

- The execution model scatters fetching across fields, which is exactly what GraphQL does. A resolver is written for one node and knows nothing about its siblings, so a query returning fifty order lines runs the product resolver fifty times and each run is a correct, isolated, one-row lookup. Nothing in that code is wrong, and the total is still fifty round trips. A DataLoader is the piece that lets each resolver keep asking for one thing while the transport sees one request for fifty.
- A read layer fans out over a list where every item needs the same kind of parent or child. The pattern is not exclusive to GraphQL: an endpoint that composes a page from several services, a projection that decorates rows with a lookup table, or any code that maps over a collection and calls a repository inside the map has the same shape and the same fix.
- The same key is asked for repeatedly inside a request. Ten order lines pointing at the same product produce ten identical lookups, and the loader's per-request memory turns them into one fetch and nine memory reads, without anyone having to notice the duplication or hand-roll a dictionary at the top of the request.

## Cautions

- The cache is scoped to the request and it is not a shared cache. It exists so that one execution does not ask twice, and it disappears when the response is written, which is precisely what makes it safe: there is no invalidation problem because nothing outlives the transaction it was read in. Do not reach for it to relieve database load across requests. That is cache-aside's job, with the expiry and invalidation questions that come attached, and registering a loader as a singleton to get "more" caching turns a safe helper into a stale, cross-tenant one.
- Batching happens on the execution tick, which is a real boundary and not a duration. Keys collected while the engine is resolving the current level are dispatched together; a lookup issued after that dispatch, or one hidden behind an `await` on something else, lands in the next batch or in a batch of its own. This is why two calls that look adjacent in the source sometimes produce two queries, and knowing where the collection window closes is the difference between debugging it and guessing at it.
- A large key list runs into the limits of whatever you translate it into. An `IN` clause has a parameter ceiling, a plan cache fills with one entry per distinct list length, and a batch of ten thousand keys returns a result set nobody wanted to materialise. Cap the batch size and let the loader issue several requests, the same discipline the batching page describes, and remember that the failure of one oversized batch fails every caller waiting on it.
- It is a read-side tool only. Writes have ordering, transactional and idempotency concerns that a coalescing fetcher does not address, and a per-request memo of results is actively wrong in front of a mutation that changes them. Where a mutation runs in the same request, make sure the loader for the affected entity is not still holding the value from before the write.

## In .NET

- Hot Chocolate generates the loader from a batch method: you receive the collected keys, you return a dictionary, and the resolver still asks for exactly one item.

```csharp
internal static class ProductDataLoaders
{
    // One call per tick, with every key the resolvers asked for in that tick.
    [DataLoader]
    internal static async Task<Dictionary<int, Product>> GetProductByIdAsync(
        IReadOnlyList<int> ids,
        ShopDbContext db,
        CancellationToken ct) =>
        await db.Products
            .AsNoTracking()
            .Where(p => ids.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, ct);
}

// The resolver knows about one line and one product. The batching is not its problem.
public async Task<Product?> GetProductAsync(
    [Parent] OrderLine line,
    IProductByIdDataLoader productById,
    CancellationToken ct) =>
    await productById.LoadAsync(line.ProductId, ct);
```

- `Where(p => ids.Contains(p.Id))` is the EF Core shape that turns the key list into one `IN` query, and returning a dictionary keyed by the same type as the request is what lets the loader hand each waiting caller its own row. Keys with no row simply have no entry, which the loader reports as `null` rather than as an error.
- A grouped loader is the one-to-many twin. Where a key maps to a list rather than a single row, the batch method returns a lookup instead of a dictionary, which covers "the lines of each of these orders" without changing anything at the call site.
- Register the loader per request, which is what the Hot Chocolate integration does for you. If you write the same pattern by hand for a REST or gRPC composition layer, keep the same lifetime: a scoped service holding a dictionary and a batching channel, disposed with the request, is the whole of the pattern.
