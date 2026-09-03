---
title: "IDistributedCache"
summary: "IDistributedCache is the ASP.NET Core abstraction over a cache shared between processes: four operations on a string key, with byte[] as the value. Serialization is the caller's job, and the implementation behind it is chosen at startup rather than at the call site."
category: "Caching"
scene: cache-aside
sceneStep: 1
related:
  - label: Cache-Aside
    slug: cache-aside
  - label: HybridCache
    slug: hybridcache
  - label: Redis
    slug: redis
  - label: Cache Key
    slug: cache-key
  - label: TTL
    slug: ttl
  - label: Distributed Session
    slug: distributed-session
references:
  - title: "Distributed caching in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/caching/distributed?view=aspnetcore-10.0
---

In the scene's first step the application misses, reads the database, and stores the result in the cache on the way back. `IDistributedCache` is the interface that "the cache" points at in ASP.NET Core, and it is deliberately small: get, set, refresh and remove, on a string key, each with an asynchronous twin, and nothing else. You take it from dependency injection and never name the implementation at the call site.

```csharp
byte[]? cached = await cache.GetAsync(key, ct);
if (cached is not null) return JsonSerializer.Deserialize<Order>(cached);

Order order = await db.LoadOrderAsync(id, ct);
var options = new DistributedCacheEntryOptions
{
    AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(5),
};
await cache.SetAsync(key, JsonSerializer.SerializeToUtf8Bytes(order), options, ct);
```

The value type is `byte[]`, and that is the contract rather than an oversight. Serialization belongs to the caller because the bytes are shared: another process reads them, and after a rolling deployment another version of your own code reads them too. That makes the format a compatibility decision with the same rules as a wire protocol. Adding an optional field is usually safe, changing the type of one is not, and a release that changes the shape needs either a new key prefix or a flush, because there is nobody in the middle to migrate anything. The `GetString` and `SetString` extension methods are a UTF-8 convenience over the same contract, not a different one.

Implementations swap underneath without touching a line of calling code: `AddDistributedMemoryCache`, `AddStackExchangeRedisCache`, the SQL Server implementation, and vendor packages that expose the same four operations. The memory one carries a warning worth repeating: it satisfies the interface inside a single process and is not distributed at all, so every instance keeps its own copy and an entry one instance invalidated stays live on the other four. It is the right choice for tests and a bug in production. Expiration is set per entry through `DistributedCacheEntryOptions`, either as an absolute moment, a span from now, or a sliding window that only extends when someone reads the entry or calls `Refresh`.

What the interface does not offer is as important as what it does. There is no bulk get, no tagging or regions to invalidate a group, no atomic increment, and no protection against a stampede, so two simultaneous misses both read the database and both write the same value. There is also no in-process layer, which means every hit costs a network round trip and a deserialization even when the same instance asked for the same key a millisecond ago. `HybridCache` in .NET 9 was added for exactly those gaps: it puts an in-process L1 in front of an `IDistributedCache` L2, handles serialization, and collapses concurrent misses for the same key into one. Use this interface directly when you want the raw semantics or when you are implementing something underneath, and reach for HybridCache when what you actually wanted was cache-aside done carefully.
