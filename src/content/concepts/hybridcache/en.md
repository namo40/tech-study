---
title: "HybridCache"
summary: "HybridCache is one .NET caching API laid over two layers: a fast in-process L1 and an optional shared L2, with stampede protection built into the single call you make, so concurrent misses for the same key collapse into one factory run instead of a thundering herd."
category: "Caching"
tags: ["memory"]
related:
  - label: Cache-Aside
    slug: cache-aside
  - label: Cache Stampede
    slug: cache-stampede
  - label: Cache Invalidation
    slug: cache-invalidation
  - label: Eviction
    slug: eviction
  - label: LRU
    slug: lru
  - label: Cache Key
    slug: cache-key
  - label: Redis
    slug: redis
  - label: IDistributedCache
    slug: idistributedcache
  - label: Output Cache
    slug: output-cache
references:
  - title: HybridCache in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/caching/hybrid?view=aspnetcore-10.0
  - title: Caching overview in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/caching/overview?view=aspnetcore-10.0
---

## When to use

- Reach for it wherever you were about to hand-write the `IMemoryCache` plus `IDistributedCache` pair. That combination is always the same four moving parts: look locally, look remotely, call the source, write both layers back, and every codebase gets one of the four slightly wrong. HybridCache is that pairing as a supported abstraction, so the fill strategy stops being something you maintain.
- Take it when you want stampede protection you did not have to build. Concurrent callers asking for the same missing key are joined onto one in-flight factory call rather than each running the expensive load, which is the whole of the stampede problem solved inside `GetOrCreateAsync` rather than by a lock you own and have to get right.
- Use it when several instances need local speed and shared answers at the same time. L1 keeps the hot path at memory latency, L2 keeps a freshly started or freshly scaled instance from arriving completely cold, and the call site sees one API rather than two lifetimes and two failure modes.
- Prefer it over a house helper class once more than one team is caching. A single registration point means one place to change serializer, expiry defaults and tag conventions, instead of a static utility that three services copied and then edited.

## Cautions

- An L1 entry does not learn that another instance changed the value. A write or a removal reaches the local cache of the process that ran it and the distributed layer behind it, while the other instances keep serving what they already hold until their own local copy expires. Keep the local expiration short enough that you can state the divergence window out loud, and read the invalidation page before assuming a removal is a broadcast.
- Tag-based invalidation is logical, and it is a coarse instrument rather than a subscription. `RemoveByTagAsync` records a cut-off time for the tag and later reads treat anything older as a miss; nothing is deleted from L1 or L2, so the memory is not reclaimed until those entries expire on their own. It is the right tool for "everything about this tenant" and misleading if you expect it to behave like an event that every node received at the same moment.
- Everything that crosses into L2 is serialized, and that cost is part of the cache. A large object graph paid for on every miss can be slower than the query it was meant to replace, and a big entry crowds out many small ones in a shared store. Cache the projection you actually render rather than the aggregate you happened to load. Size has a hard edge as well: a value over `MaximumPayloadBytes`, 1 MB by default, is logged and skipped rather than cached, which is the usual answer to "why is this key never a hit".
- Only cache values whose per-instance drift is acceptable. If two requests hitting two instances in the same second must agree exactly, the value is not a cache candidate at all, and the answer is a read of the record of truth rather than a shorter TTL.

## In .NET

- The package is `Microsoft.Extensions.Caching.Hybrid`. It shipped alongside .NET 9 and runs on .NET 8 and .NET Framework 4.7.2 as well, so an LTS service is not shut out of it. `AddHybridCache` registers the service with sensible defaults, and one `GetOrCreateAsync` call replaces the get, the miss branch and the two writes.

```csharp
builder.Services.AddHybridCache(options =>
{
    options.DefaultEntryOptions = new HybridCacheEntryOptions
    {
        // How long the shared L2 copy lives.
        Expiration = TimeSpan.FromMinutes(10),
        // The in-process L1 copy should be the shorter of the two.
        LocalCacheExpiration = TimeSpan.FromMinutes(1),
    };
});

// Concurrent callers for the same key share one factory execution.
var product = await cache.GetOrCreateAsync(
    $"product:{id}",
    id,
    async (id, token) => await repository.GetProductAsync(id, token),
    cancellationToken: ct);
```

- Registering an `IDistributedCache` is what promotes the second layer. With nothing else registered, HybridCache is an in-process cache with stampede protection; register any `IDistributedCache` implementation, `AddStackExchangeRedisCache` for instance, in either order, and the same call sites gain a shared L2 without changing a line.
- The two expirations are separate knobs and should be set separately. `Expiration` bounds the distributed copy, `LocalCacheExpiration` bounds the in-process one, and the local value is the one that decides how long two instances may disagree.
- Serialization is pluggable per type. The default handles strings and byte arrays directly and JSON for the rest, and `AddSerializer` lets a hot type carry a cheaper format without changing how it is cached.
