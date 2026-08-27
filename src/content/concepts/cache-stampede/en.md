---
title: "Cache Stampede"
summary: "A cache stampede is what happens when a popular key expires: every request misses at once, and they all charge the origin together for the same value. The fixes all share one idea, which is to make sure only one of them goes."
category: "Caching"
tags: ["overload"]
scene: cache-stampede
steps:
  - title: "One hot key, thousands of hits"
    text: "The popular value sits in the cache and every request takes the short path, so the origin barely notices. The TTL ring is quietly counting down the whole time."
  - title: "Expiry is a starting gun"
    text: "The key dies and every in-flight request misses at once, and they all charge the origin for the same value together. The origin that served one recomputation per hour now serves hundreds per second, and slows for everyone."
  - title: "Send one, serve the rest stale"
    text: "On a miss, one request goes to the origin; everyone else gets the old value now and the fresh one next time. Stale-while-revalidate makes the trade explicit: a moment of staleness for an origin that never sees the crowd."
  - title: "Design the expiry, not just the value"
    text: "Jitter the TTLs so keys do not die together, refresh hot keys early before they expire, and cache the answer not found too, so missing keys cannot stampede either. The same spike arrives, and the origin's needle barely moves."
related:
  - label: Cache-Aside
    slug: cache-aside
  - label: TTL
    slug: ttl
  - label: Cache Invalidation
    slug: cache-invalidation
  - label: Cache Version
    slug: cache-version
  - label: Stale-While-Revalidate
    slug: stale-while-revalidate
  - label: Negative Cache
    slug: negative-cache
  - label: Spike Test
    slug: spike-test
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Rate Limiter
    slug: rate-limiter
  - label: Distributed Lock
    slug: distributed-lock
references:
  - title: HybridCache in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/caching/hybrid?view=aspnetcore-10.0
  - title: Cache in-memory in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/caching/memory?view=aspnetcore-10.0
  - title: "RFC 5861: HTTP Cache-Control Extensions for Stale Content"
    url: https://www.rfc-editor.org/rfc/rfc5861
---

## When to use

- Any cache sitting in front of an expensive computation where a few keys are far hotter than the rest: product pages, dashboards, rendered fragments, permission sets.
- Whenever the cost of recomputing one value is high enough that computing it a hundred times at once would hurt.
- Watch origin load at cache-expiry moments rather than in averages. A stampede is a spike a few hundred milliseconds wide, and a one-minute average hides it completely.

## Cautions

- The stampede is invisible in a load test with uniform keys. Every virtual user asks for a different key, every key expires at a different time, and nothing ever piles up. Test with a hot-key distribution, or you will only meet this in production.
- Single flight needs a lock with a timeout. If the one request that went to the origin crashes or hangs, everybody waiting behind it is blocked for as long as the lock lives, and you have turned a load spike into an outage.
- Stale-while-revalidate is an eventual-consistency decision, not a performance trick. Budget the staleness in the same sentence you set the TTL: a value may be served up to the refresh window past its expiry.
- Negative caching needs its own, much shorter TTL. Cache "not found" for five minutes and a newly created item stays invisible for five minutes.
- Coalescing is per process. Ten instances each collapse their own callers, so a stampede across a fleet still sends ten requests rather than one, which is usually fine and worth knowing before you measure.

## In .NET

`HybridCache` collapses concurrent callers for the same key into one underlying call, which is the single flight you would otherwise write by hand around `IMemoryCache`.

```csharp
builder.Services.AddHybridCache(options =>
{
    options.DefaultEntryOptions = new HybridCacheEntryOptions
    {
        Expiration = TimeSpan.FromMinutes(10),
        LocalCacheExpiration = TimeSpan.FromMinutes(2),
    };
});

public sealed class ProductReader(HybridCache cache, ProductRepository repository)
{
    private static readonly Random Jitter = Random.Shared;

    public ValueTask<Product?> GetAsync(int id, CancellationToken ct) =>
        cache.GetOrCreateAsync(
            $"product:{id}",
            id,
            async (key, token) => await repository.FindAsync(key, token),
            new HybridCacheEntryOptions
            {
                // Spread the expiry so a batch filled together does not die together.
                Expiration = TimeSpan.FromMinutes(10) + TimeSpan.FromSeconds(Jitter.Next(0, 120)),
            },
            cancellationToken: ct);
}
```

Three details matter more than the API. Give every entry a jittered expiry, because entries filled in the same loop otherwise expire in the same millisecond. Store the miss as well as the hit, so a lookup for a key that does not exist is answered from memory with a short TTL of its own rather than going to the database every time. And if you need the old value served while the new one is computed, keep the entry alive past its logical expiry and refresh it in the background, because `GetOrCreateAsync` on an entry that has already been evicted makes callers wait for the recomputation, which is exactly the wait you were trying to avoid.

```csharp
// Cache the answer "no such product" too, with a much shorter life.
var found = await cache.GetOrCreateAsync(
    $"product:{id}",
    id,
    async (key, token) => await repository.FindAsync(key, token),
    new HybridCacheEntryOptions { Expiration = TimeSpan.FromSeconds(30) },
    cancellationToken: ct);
```

On the HTTP side the same idea is spelled out by `stale-while-revalidate` in `Cache-Control`, which tells a shared cache it may answer from a stale copy while it refreshes underneath.
