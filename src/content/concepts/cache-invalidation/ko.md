---
title: "Cache Invalidation"
summary: "Cache Invalidation은 캐시가 자기 사본이 더 이상 사실이 아니라는 것을 알게 되는 방법입니다. 시간으로 알리거나, 데이터가 바뀔 때 삭제나 메시지로 알리거나, 키를 바꿔서 옛 엔트리를 다시는 읽지 않게 합니다."
category: "캐시"
scene: cache-invalidation
steps:
  - title: "시간만으로는"
    text: "TTL만 있으면 모든 인스턴스가 만료될 때까지 옛 값을 계속 돌려줍니다. 최대 TTL 한 주기만큼 오래된 상태가 이어집니다."
  - title: "쓸 때 무효화"
    text: "쓰는 쪽이 그 키의 삭제를 발행하고 모든 인스턴스가 사본을 버립니다. 남는 틈은 메시지가 도달하는 시간뿐입니다."
  - title: "경쟁"
    text: "읽기가 miss 나고, 그 사이 쓰기가 이미 비어 있는 자리를 무효화하고, 느린 읽기가 옛 값을 저장합니다. TTL을 짧게 두어 스스로 회복되게 합니다."
  - title: "키를 바꿉니다"
    text: "키에 버전을 넣고 쓸 때 올립니다. 옛 엔트리는 다시 읽히지 않고 알아서 사라집니다. 삭제 메시지도, 경쟁도 없습니다."
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

## 언제 쓰나

- 데이터가 바뀌고, 읽는 쪽이 옛 값을 오래 보면 안 될 때
- 캐시가 여러 인스턴스의 프로세스 안에 있어서 한 곳에서만 지워서는 부족할 때
- 데이터가 바뀌는 순간을 짚을 수 있을 때. 쓰기 경로, 도메인 이벤트, CDC 스트림이 그런 지점입니다.

## 주의점

- 갱신하지 말고 삭제합니다. 쓰는 쪽에서 새 값을 캐시에 넣으면 동시에 읽는 쪽과 경쟁합니다.
- TTL은 언제나 최후의 보루로 남겨 둡니다. 무효화 메시지는 유실되고, 읽고 나서 쓰는 경쟁은 모든 Cache-Aside 시스템에 있습니다.
- 가능하면 버전이나 태그가 들어간 키를 씁니다. 무효화가 키 변경으로 바뀌면 경쟁도, 여러 곳으로 퍼뜨릴 일도 없습니다.
- Stale read를 측정합니다. 읽는 쪽이 옛 데이터를 얼마나 자주 보는지 모르면 TTL을 조정할 수 없습니다.

## .NET에서는

`HybridCache`가 두 방식을 모두 지원합니다. 삭제 쪽은 태그 무효화이고, 키를 바꾸는 쪽은 버전 키입니다.

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

인스턴스 사이 전파에는 Redis Pub/Sub 같은 백플레인이나 2차 캐시 역할을 하는 `IDistributedCache`가 필요합니다. `LocalCacheExpiration`을 짧게 두어 프로세스 안의 사본이 그 틈보다 오래 살아남지 않게 합니다.
