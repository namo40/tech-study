---
title: "Cache Tag"
summary: "A cache tag is a group label you attach to cache entries so that invalidation can name a subject instead of a key. One call drops everything tagged \"product 42\", including the entries whose keys you could never have listed."
category: "Caching"
tags: ["consistency"]
level: 5
related:
  - label: Cache Invalidation
    slug: cache-invalidation
  - label: Cache Version
    slug: cache-version
  - label: Cache Key
    slug: cache-key
  - label: HybridCache
    slug: hybridcache
  - label: Output Cache
    slug: output-cache
  - label: Cache-Aside
    slug: cache-aside
  - label: Eviction
    slug: eviction
references:
  - title: HybridCache in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/caching/hybrid?view=aspnetcore-10.0
  - title: Output caching middleware in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/caching/output?view=aspnetcore-10.0
---

## When to use

- One entity has scattered itself across many entries. A product ends up cached as a detail payload, as a row inside three list pages, as a price fragment and as a search result, and an edit to it should retire all of them. Removing by key means knowing all five keys at the moment of the write, which the write path almost never does; tagging every one of them `product:42` turns that knowledge into a label applied at fill time, when the shape of the entry is still in front of you.
- Page and fragment caches need coarse invalidation, and coarse is the correct granularity there. A cached response is keyed by route plus query string plus varying headers, so the key space is combinatorial and nobody can enumerate it. Tagging the responses of the catalogue area `catalog` gives the publishing action one lever that reaches every variant it produced.
- The entries are derived, so their keys are not derivable. Lists, counts, top-N boards and rollups are produced by queries whose parameters came from the caller, and a write that changes an input has no way to reconstruct which aggregates absorbed it. A tag applied when the aggregate was cached is the only record that the relationship existed.
- You want cache-version's effect without minting a new key space. Versioning solves the same problem by putting a generation number inside the key and letting the old entries age out, which is cheap and leaves garbage behind for a while. In HybridCache a tag removal is a logical cut-off rather than a delete: readers can no longer reach the old entries, but the bytes stay until they expire, so it frees memory no faster than versioning does. Choose tags for reachability, not for space.

## Cautions

- A tag is not a subscription. It gives you a way to drop a family of entries at once, and it is misleading if you expect it to behave like an event that every node received at the same moment. The removal is coordinated by the cache implementation on its own terms, and a second-level store propagates it on its own schedule, so write down the window in which two instances may still disagree rather than assuming the tag closed it.
- The wider the tag, the larger the crater. A tag like `catalog` on every catalogue entry makes invalidation trivially correct and turns a single price edit into a cold cache for the whole section, which arrives at the database as a stampede at exactly the moment someone is watching. Size each tag by what a single write should legitimately be allowed to destroy, and keep a narrow `product:42` next to the broad one so the common case uses the small hammer.
- What tags cost depends on the store. HybridCache keeps one timestamp per tag and pays at read time, comparing the entry it found against the tag's last invalidation, so the cost scales with tags per read. A tag-set store such as the Redis output cache keeps the reverse mapping from tag to entries instead, which is an extra write per tag on every fill and extra work on every eviction; on a shared store that index is also shared, so a chatty tagging scheme shows up as latency for everyone using the instance. Either way the bookkeeping is affordable at a few tags per entry and stops being affordable when tagging becomes free-form.
- Unrestrained tagging makes invalidation unpredictable again, which is the problem you started with. When each team invents its own labels, an entry ends up carrying six of them, no one can say what a given removal will reach, and a well-meant cleanup empties an unrelated feature. Keep the tag vocabulary a closed list defined next to the cache keys, derive tags from identifiers rather than free text, and treat adding one as a design change rather than a detail.

## In .NET

- `HybridCache` takes tags on the entry and removes by them, so the tagging happens where the entry is created and the invalidation happens where the write is.

```csharp
// Tags are declared with the entry, at the moment its shape is known.
var product = await cache.GetOrCreateAsync(
    $"product:{id}",
    id,
    async (id, token) => await repository.GetProductAsync(id, token),
    tags: [$"product:{id}", $"catalog:{categoryId}", "catalog"],
    cancellationToken: ct);

// The write path names the subject, not the keys.
await cache.RemoveByTagAsync($"product:{id}", ct);

// The broad tag exists for republishing the whole section. Use it deliberately.
await cache.RemoveByTagAsync("catalog", ct);
```

- Output caching has the same mechanism for responses. `[OutputCache(Tags = ["catalog"])]` on an endpoint labels every cached variant it produces, and `IOutputCacheStore.EvictByTagAsync("catalog", ct)` from an admin action or a message handler retires them all without the eviction code knowing anything about routes or query strings.
- Derive tags from the same place you derive keys. If a helper builds `product:{id}` as a key, let it build the tag too, so a renamed convention cannot leave the two spellings disagreeing and quietly turning every removal into a no-op.
- Tag removal is a good candidate for the message handler rather than the request. Doing it after the transaction commits, from the consumer of the domain event, keeps a rolled-back write from clearing a cache for nothing and gives every instance the same trigger.
