---
title: "Cache-Aside"
summary: "Cache-aside keeps the application in charge of the cache: read the cache first, fall back to the database on a miss and store the result, and invalidate the entry when the data changes."
category: "Caching"
level: 3
scene: cache-aside
steps:
  - title: "Miss"
    text: "The cache is empty, so the app reads the database and stores the result in the cache on the way back."
  - title: "Hit"
    text: "Later reads are served from the cache. The database saw one read, not five."
  - title: "TTL"
    text: "Entries expire. The next read misses and refills the cache, so a stale value can never outlive its TTL."
  - title: "Writes"
    text: "A write that only updates the database leaves the cache stale. Invalidate the entry on write, and the next read refills it with the fresh value."
related:
  - label: Cache Invalidation
    slug: cache-invalidation
  - label: TTL
    slug: ttl
  - label: Read-Through
    slug: read-through
  - label: Write-Through
    slug: write-through
  - label: Write-Behind
    slug: write-behind
  - label: Cache Stampede
    slug: cache-stampede
  - label: Stale-While-Revalidate
    slug: stale-while-revalidate
  - label: Negative Cache
    slug: negative-cache
  - label: HybridCache
    slug: hybridcache
  - label: IDistributedCache
    slug: idistributedcache
  - label: Redis
    slug: redis
references:
  - title: Cache-Aside pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside
  - title: HybridCache in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/caching/hybrid?view=aspnetcore-10.0
  - title: Caching overview in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/caching/overview?view=aspnetcore-10.0
---

## When to use

- Reads vastly outnumber writes, and the same keys are read again and again.
- A slightly stale value is acceptable for the length of the TTL.
- The data source is slower or more expensive than the cache by a wide margin.

## Cautions

- Invalidate on write. Do not write the new value into the cache from the writer: two writers racing can leave the cache holding the older value with a fresh TTL.
- Set a TTL on every entry, even when you invalidate. It is the safety net for the invalidation you miss.
- Cache-aside does nothing about stampedes. When a hot key expires many readers miss at once, so pair it with request coalescing or stale-while-revalidate.
- Cache negative results too, briefly, or a flood of lookups for missing keys goes straight to the database.

## In .NET

Use `HybridCache`. Reads go through `GetOrCreateAsync`, and a write is followed by `RemoveAsync`.

```csharp
builder.Services.AddHybridCache(options =>
{
    options.DefaultEntryOptions = new HybridCacheEntryOptions
    {
        Expiration = TimeSpan.FromMinutes(5),
        LocalCacheExpiration = TimeSpan.FromMinutes(1),
    };
});

public sealed class UserReader(HybridCache cache, UserRepository repository)
{
    public ValueTask<User?> GetAsync(int id, CancellationToken ct) =>
        cache.GetOrCreateAsync(
            $"user:{id}",
            async token => await repository.FindAsync(id, token),
            cancellationToken: ct);

    public async Task UpdateAsync(User user, CancellationToken ct)
    {
        await repository.SaveAsync(user, ct);
        await cache.RemoveAsync($"user:{user.Id}", ct);
    }
}
```

`HybridCache` collapses concurrent misses for the same key into a single call, which is the stampede protection you would otherwise have to write yourself. When an `IDistributedCache` is registered it becomes the second level, so a shared cache such as Redis sits behind the in-process one.

One detail the shape above hides: a `null` from `FindAsync` is cached like any other value, on the same five-minute expiry, because the entry options are fixed before the factory runs. If missing keys arrive in bulk, that is not the brief negative cache the fourth caution asks for, and the negative cache page has the sentinel-and-short-TTL shape that is.
