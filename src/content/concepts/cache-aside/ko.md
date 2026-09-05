---
title: "Cache-Aside"
summary: "Cache-Aside는 캐시를 애플리케이션이 직접 관리하는 방식입니다. 먼저 캐시를 읽고, 미스면 데이터베이스로 내려가 그 결과를 캐시에 저장하며, 데이터가 바뀌면 항목을 무효화합니다."
category: "캐시"
scene: cache-aside
steps:
  - title: "Miss"
    text: "캐시가 비어 있으므로 애플리케이션이 데이터베이스를 읽고, 돌아오는 길에 그 결과를 캐시에 저장합니다."
  - title: "Hit"
    text: "그다음 읽기는 캐시에서 바로 응답합니다. 데이터베이스는 다섯 번이 아니라 한 번만 읽혔습니다."
  - title: "TTL"
    text: "항목은 만료됩니다. 그다음 읽기가 미스가 되어 캐시를 다시 채우므로, 오래된 값이 TTL보다 오래 살아남을 수 없습니다."
  - title: "쓰기"
    text: "데이터베이스만 갱신하는 쓰기는 캐시를 오래된 상태로 남깁니다. 쓸 때 항목을 무효화하면 그다음 읽기가 새 값으로 다시 채웁니다."
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

## 언제 쓰나

- 읽기가 쓰기보다 훨씬 많고, 같은 키를 계속 다시 읽을 때
- TTL만큼의 시간 동안은 조금 오래된 값이어도 괜찮을 때
- 원본 데이터 저장소가 캐시보다 훨씬 느리거나 비쌀 때

## 주의점

- 쓸 때는 무효화합니다. 쓰는 쪽에서 새 값을 캐시에 직접 넣지 않습니다. 두 쓰기가 경쟁하면 더 오래된 값이 새 TTL을 달고 캐시에 남을 수 있습니다.
- 무효화를 하더라도 모든 항목에 TTL을 둡니다. 놓친 무효화를 받아 주는 안전망입니다.
- Cache-Aside 자체는 스탬피드를 막지 않습니다. 인기 있는 키가 만료되면 많은 읽기가 한꺼번에 미스가 되므로, 요청 병합이나 Stale-While-Revalidate와 함께 씁니다.
- 없는 값도 짧게 캐시합니다. 그러지 않으면 없는 키를 찾는 요청이 그대로 데이터베이스까지 몰립니다.

## .NET에서는

`HybridCache`를 사용합니다. 읽기는 `GetOrCreateAsync`로 하고, 쓰기 뒤에는 `RemoveAsync`를 호출합니다.

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

`HybridCache`는 같은 키에 동시에 발생한 미스를 호출 하나로 합쳐 줍니다. 직접 만들어야 했을 스탬피드 보호를 대신 해 주는 셈입니다. `IDistributedCache`가 등록되어 있으면 그것이 2차 캐시가 되어, Redis 같은 공유 캐시가 프로세스 안의 캐시 뒤에 자리 잡습니다.

위 모양이 감추는 세부가 하나 있습니다. `FindAsync`가 돌려준 `null`도 다른 값과 똑같이 같은 5분 만료로 캐시됩니다. 항목 옵션이 팩토리가 실행되기 전에 고정되기 때문입니다. 없는 키가 무더기로 들어온다면 이것은 네 번째 주의점이 요구하는 짧은 negative cache가 아니며, 그에 맞는 모양(sentinel과 짧은 TTL)은 Negative Cache 페이지에 있습니다.
