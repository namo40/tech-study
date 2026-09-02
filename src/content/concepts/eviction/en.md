---
title: "Eviction"
summary: "Eviction is what a full cache does to stay useful: when space runs out a policy picks a victim, the victim's next reader pays a miss, and both the policy and the keys that fill the space are design decisions rather than defaults."
category: "Caching"
tags: ["memory"]
scene: eviction
steps:
  - title: "A cache remembers what you touched, and when"
    text: "Entries fill the six slots, and every hit refreshes its entry's recency while the untouched ones quietly fade. Nothing has been evicted yet — but the order of the fading is already the eviction list."
  - title: "When space runs out, a policy chooses the victim"
    text: "LRU picks the entry least recently touched, and the newcomer takes its slot. The cost arrives later: the evicted key's next reader misses, pays the origin round trip, and moves back in — pushing someone else out. A full cache is musical chairs."
  - title: "What fills the space is the key, not the data"
    text: "Trivially different keys for the same answer each claim a slot, and honest entries get pushed out to make room for duplicates. Normalize the key and the variants collapse into one slot. Cardinality is eviction pressure — you design it when you design the key."
  - title: "Being evicted should be a decision, not an accident"
    text: "Keep the size limit, but rank the entries: pin what must survive, let LRU spend the rest. The same pressure replays and the hot key never leaves. A cache without priorities treats your checkout page and a stale thumbnail as equals."
related:
  - label: Cache-Aside
    slug: cache-aside
  - label: LRU
    slug: lru
  - label: Cache Key
    slug: cache-key
  - label: TTL
    slug: ttl
  - label: Cache Invalidation
    slug: cache-invalidation
  - label: Cache Stampede
    slug: cache-stampede
  - label: Cache Version
    slug: cache-version
  - label: Memory Pressure
    slug: memory-pressure
  - label: Object Pool
    slug: object-pool
  - label: Output Cache
    slug: output-cache
  - label: HybridCache
    slug: hybridcache
references:
  - title: "Caching in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/caching
  - title: "Cache in-memory in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/caching/memory?view=aspnetcore-10.0
  - title: "MemoryCacheEntryOptions Class"
    url: https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.caching.memory.memorycacheentryoptions
---

## When to use

Eviction is not a feature you turn on. Every bounded cache evicts, and every unbounded one is a memory leak with better manners, so the question is never whether it happens but whether you chose the policy, chose the size, and know what leaving costs.

- Read this as a lens on any cache with a limit. The scene's six cells are the limit; the ladder under them is the policy. If you can say what your limit is and which entry would go first, you have made both decisions. If you cannot, the runtime has made them for you.
- Reach for it when the hit ratio is falling and nobody changed the traffic. A cache that used to answer 90% of reads and now answers 60% is usually not being asked different questions; it is holding fewer of the answers, because either the entries got bigger or the key space got wider. Both show up as evictions before they show up as latency.
- Watch hit ratio and eviction count together, never separately. Hit ratio alone cannot tell a cold cache from a thrashing one, and eviction count alone cannot tell healthy turnover from a working set that no longer fits. The pair can: high evictions with a stable hit ratio is churn you can live with, and high evictions with a falling hit ratio is the cache spending its whole budget on entries nobody reads twice.
- Take it seriously the moment one cache serves several kinds of entry. A session blob, a rendered fragment and a lookup table have nothing in common except the dictionary they are sharing, and under one policy the biggest and least valuable of them will happily displace the smallest and most valuable. That is the case priorities and per-entry sizes exist for.
- Look at it before you raise the limit. Doubling the size buys time in proportion to how much of the working set was missing, which is often much less than doubling. If the pressure comes from key cardinality rather than from the number of distinct answers, a bigger cache holds more duplicates and the hit ratio barely moves.
- Do not reach for it to fix staleness. An entry that is wrong needs invalidation or a TTL. Eviction removes entries that are perfectly correct, and it removes them for a reason that has nothing to do with whether anyone would have wanted them.

## Cautions

- `MemoryCache` without a `SizeLimit` is unbounded until the machine complains. It has no default cap: entries accumulate, and the only thing that removes them is expiration or a compaction triggered by GC memory pressure, which arrives late and takes 5% to 10% of the cache with it rather than the entries you would have chosen. Setting a limit is what turns eviction from an accident into a policy.
- Sizes are unitless, and one entry without a size disables the limit for everybody. `SizeLimit` counts whatever `Size` means in your application — bytes, rows, a flat 1 per entry — and the number only has to be consistent. But an entry added without a size while a limit is set throws, and code paths that bypass your helper are exactly where that is discovered. Pick the unit once, put it in the options factory, and never set sizes at the call site.
- LRU is vulnerable to a scan. One pass over a large collection touches every key exactly once, and each of those touches looks more recent than the working set you spent the day building, so the pass evicts everything valuable and then evicts itself. If a background job, a report or an admin screen sweeps the same data your hot path caches, that job needs either its own cache, a priority low enough to lose, or no cache at all.
- Eviction is not expiration, and confusing them produces bugs in both directions. TTL answers "is this still true"; eviction answers "do we have room". A perfectly fresh entry can be evicted a second after it was written, and a stale entry can sit untouched for as long as its TTL allows. Never use a size limit as a freshness mechanism, and never assume a TTL bounds memory.
- Key cardinality is the multiplier nobody budgets for. The cache holds one entry per distinct key, not per distinct answer, so a vary-by choice that includes a request id, an unsorted query string or a full-precision timestamp turns one answer into thousands of entries that are each read once. The scene's third step is this, and the fix is always in the key rather than in the size.
- Eviction callbacks run after the fact and cannot veto. A post-eviction callback is a notification, not a hook: it runs on a thread pool thread some time after the entry is gone, it can fire for expiry as easily as for capacity, and anything expensive in it competes with the traffic that caused the eviction. Read the reason, count it, and do nothing else there.

## In .NET

- Set a limit and give every entry a size. This is the whole of the bounded-cache setup, and the two halves have to agree on what the number means.

```csharp
builder.Services.AddSingleton<IMemoryCache>(_ => new MemoryCache(new MemoryCacheOptions
{
    SizeLimit = 1024,
    CompactionPercentage = 0.2,
}));

// Size is in the same made-up unit as SizeLimit: here, one entry costs one.
cache.Set(key, value, new MemoryCacheEntryOptions
{
    Size = 1,
    SlidingExpiration = TimeSpan.FromMinutes(10),
});
```

- `CacheItemPriority` is the pin in the scene. `Low`, `Normal` and `High` order who goes first when the cache compacts, and `NeverRemove` takes an entry out of the policy's reach entirely. It is not a promise of immortality — an explicit `Remove` or an expiration still applies — but it does mean capacity pressure will empty everything else first, so use it for the handful of entries whose absence would be an incident.

```csharp
var options = new MemoryCacheEntryOptions
{
    Size = 1,
    Priority = CacheItemPriority.NeverRemove,
};
```

- Register a post-eviction callback and count the reason. `EvictionReason.Capacity` means the size limit chose this entry, `Expired` and `TokenExpired` mean it aged out, and `Removed` and `Replaced` mean you did it. Those are four different stories and one counter cannot tell them apart.

```csharp
options.RegisterPostEvictionCallback((key, value, reason, state) =>
{
    evictions.Add(1, new KeyValuePair<string, object?>("reason", reason.ToString()));
});
```

- Output caching makes the vary-by the key, so the policy question moves there. `SizeLimit` and `MaximumBodySize` bound the store, and every `SetVaryByQuery`, `SetVaryByHeader` or `VaryByRouteValue` you add multiplies the entries competing inside it. A policy that varies by a header the client controls freely is a cache with an unbounded key space and a bounded size, which is the worst of both.

```csharp
builder.Services.AddOutputCache(options =>
{
    options.SizeLimit = 100 * 1024 * 1024;
    options.AddPolicy("catalogue", policy => policy
        .Expire(TimeSpan.FromMinutes(5))
        .SetVaryByQuery("page", "sort"));
});
```

- `HybridCache` puts a small in-process cache in front of a distributed one, and only the local half evicts under memory pressure. That is usually what you want — the near cache is a working set and the far cache is the store — but it means a local eviction is invisible in the distributed hit ratio, and the two need separate counters before you can say which one is thrashing.
- On the distributed side the policy is the server's, not yours. Redis evicts according to its own `maxmemory-policy`, and `allkeys-lru` and `volatile-lru` behave very differently when most of your keys have no TTL: the second one will refuse to evict and start failing writes instead. Whatever your application believes about its cache, the server holds the actual limit.
