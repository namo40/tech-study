---
title: "Cache Invalidation"
summary: "Cache invalidation is how a cache learns that its copy is no longer true: by time, by an explicit delete or message when data changes, or by changing the key so old entries are simply never read again."
category: "Caching"
scene: cache-invalidation
steps:
  - title: "Time alone"
    text: "With only a TTL, every instance keeps serving the old value until it expires. Stale for up to one full TTL."
  - title: "Invalidate on write"
    text: "The writer publishes a delete for the key and every instance drops its copy. Only the time the message spends travelling is left as a window."
  - title: "The race"
    text: "A read misses, a write lands and invalidates an already-empty slot, then the slow read stores the old value. Keep TTLs short so this self-heals."
  - title: "Change the key"
    text: "Put a version in the key and bump it on write. Old entries are never read again and age out on their own. No delete message, no race."
related:
  - label: Cache-Aside
    slug: cache-aside
  - label: TTL
    slug: ttl
  - label: Cache Tag
    slug: cache-tag
  - label: Cache Version
    slug: cache-version
  - label: Cache Key
    slug: cache-key
  - label: Stale-While-Revalidate
    slug: stale-while-revalidate
  - label: Change Data Capture
    slug: change-data-capture
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: HybridCache
    slug: hybridcache
  - label: Redis
    slug: redis
references:
  - title: Caching guidance
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/caching
  - title: HybridCache in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/caching/hybrid?view=aspnetcore-10.0
  - title: Cache-Aside pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside
---

## When to use

- Data changes and readers must not see the old value for long.
- The cache is in-process on several instances, so a local delete is not enough.
- You can name the moment data changes: a write path, a domain event, a CDC stream.

## Cautions

- Delete, do not update. Writing the new value into the cache from the writer races with concurrent readers.
- Always keep a TTL as the backstop. Invalidation messages get lost, and the read-then-write race exists in every cache-aside system.
- Prefer versioned or tagged keys where you can. They turn invalidation into a key change, which has no race and nothing to fan out.
- Measure stale reads. If you cannot tell how often readers see old data, you cannot tune the TTL.

## In .NET

`HybridCache` covers both shapes: tag invalidation for the delete, and a versioned key for the change-the-key approach.

```csharp
// 1. Invalidate on write: remove the key, and everything sharing a tag.
public async Task UpdateAsync(User user, CancellationToken ct)
{
    await repository.SaveAsync(user, ct);
    await cache.RemoveAsync($"user:{user.Id}", ct);
    await cache.RemoveByTagAsync($"tenant:{user.TenantId}", ct);
}

// 2. Versioned key: bump the version, never delete.
public async ValueTask<Catalog> GetCatalogAsync(CancellationToken ct)
{
    var version = await versions.GetAsync("catalog", ct);
    return await cache.GetOrCreateAsync(
        $"catalog@{version}",
        token => catalogRepository.LoadAsync(token),
        new HybridCacheEntryOptions { Expiration = TimeSpan.FromMinutes(10) },
        cancellationToken: ct);
}
```

Propagation between instances needs a backplane such as Redis Pub/Sub, or an `IDistributedCache` acting as the second level. Keep `LocalCacheExpiration` short so the in-process copy cannot outlive the window by much.
