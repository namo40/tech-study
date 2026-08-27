---
title: "Cache Stampede"
summary: "캐시 스탬피드는 인기 있는 키가 만료되는 순간 벌어지는 일입니다. 모든 요청이 한꺼번에 미스를 내고, 같은 값을 받으려고 다 함께 원본으로 몰려갑니다. 해법들은 결국 같은 생각 하나를 공유합니다. 그중 하나만 보내는 것입니다."
category: "캐시"
scene: cache-stampede
steps:
  - title: "뜨거운 키 하나, 수천 번의 히트"
    text: "인기 있는 값이 캐시에 앉아 있고 모든 요청이 짧은 길로 다녀가므로 원본은 거의 눈치채지 못합니다. 그동안 TTL 링은 조용히 줄어들고 있습니다."
  - title: "만료는 출발 신호입니다"
    text: "키가 죽는 순간 날아오던 요청 전부가 동시에 미스를 내고, 같은 값을 받으러 다 같이 원본으로 몰려갑니다. 한 시간에 한 번 재계산해 주던 원본이 이제 1초에 수백 번을 감당하고, 모두에게 느려집니다."
  - title: "한 명만 보내고, 나머지에겐 낡은 값을 냅니다"
    text: "미스가 나면 요청 하나만 원본으로 가고, 나머지는 지금은 옛 값을, 다음번에는 새 값을 받습니다. stale-while-revalidate는 이 거래를 명시적으로 만듭니다. 잠깐의 낡음을 내주고, 군중을 한 번도 보지 않는 원본을 얻습니다."
  - title: "값만이 아니라 만료를 설계합니다"
    text: "TTL에 편차를 줘 키들이 함께 죽지 않게 하고, 뜨거운 키는 만료 전에 미리 갱신하고, 없음이라는 답도 잠시 캐시해 존재하지 않는 키도 몰려가지 못하게 합니다. 같은 스파이크가 와도 원본의 바늘은 거의 움직이지 않습니다."
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

## 언제 쓰나

- 비싼 계산 앞에 놓인 캐시 가운데, 몇몇 키가 나머지보다 훨씬 뜨거운 경우입니다. 상품 페이지, 대시보드, 렌더링된 조각, 권한 집합 같은 것들입니다.
- 값 하나를 다시 계산하는 비용이 충분히 커서, 그것을 동시에 백 번 계산하면 아파지는 경우입니다.
- 평균이 아니라 캐시가 만료되는 순간의 원본 부하를 봅니다. 스탬피드는 폭이 수백 밀리초짜리 스파이크여서, 1분 평균은 그것을 완전히 가려 버립니다.

## 주의점

- 키가 고르게 분포된 부하 테스트에서는 스탬피드가 보이지 않습니다. 가상 사용자마다 다른 키를 요청하고, 키마다 만료 시점이 달라 아무것도 쌓이지 않습니다. 뜨거운 키 분포로 테스트하지 않으면 이 문제는 운영에서 처음 만나게 됩니다.
- single flight에는 타임아웃이 붙은 잠금이 필요합니다. 원본으로 간 그 하나가 죽거나 멈추면 뒤에서 기다리던 전부가 잠금이 살아 있는 동안 막히고, 부하 스파이크가 장애로 바뀝니다.
- stale-while-revalidate는 성능 요령이 아니라 최종 일관성에 관한 결정입니다. TTL을 정하는 문장에서 낡음의 예산도 함께 정합니다. 값은 만료 시점을 지나 갱신 창만큼 더 오래 제공될 수 있습니다.
- 네거티브 캐시에는 훨씬 짧은 자기 TTL이 필요합니다. 없음을 5분 동안 캐시하면 방금 만든 항목이 5분 동안 보이지 않습니다.
- 병합은 프로세스 단위입니다. 인스턴스 열 개가 각자 자기 호출자만 합치므로, 여러 대에 걸친 스탬피드는 여전히 한 번이 아니라 열 번을 보냅니다. 대개는 괜찮지만, 측정하기 전에 알아 두면 좋습니다.

## .NET에서는

`HybridCache`는 같은 키를 동시에 요청한 호출자들을 아래쪽 호출 하나로 합쳐 줍니다. `IMemoryCache` 주위에 직접 짜야 했을 single flight가 이것입니다.

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

API보다 중요한 것이 세 가지 있습니다. 첫째, 모든 엔트리의 만료에 편차를 줍니다. 같은 반복문에서 채운 엔트리들은 그렇게 하지 않으면 같은 밀리초에 만료됩니다. 둘째, 히트만이 아니라 미스도 저장합니다. 존재하지 않는 키에 대한 조회가 매번 데이터베이스로 가는 대신 자기만의 짧은 TTL로 메모리에서 답해집니다. 셋째, 새 값을 계산하는 동안 옛 값을 계속 내보내야 한다면 논리적 만료를 지나서도 엔트리를 살려 두고 뒤에서 갱신합니다. 이미 제거된 엔트리에 `GetOrCreateAsync`를 부르면 호출자들이 재계산을 기다리게 되는데, 그것이 바로 피하려던 기다림입니다.

```csharp
// Cache the answer "no such product" too, with a much shorter life.
var found = await cache.GetOrCreateAsync(
    $"product:{id}",
    id,
    async (key, token) => await repository.FindAsync(key, token),
    new HybridCacheEntryOptions { Expiration = TimeSpan.FromSeconds(30) },
    cancellationToken: ct);
```

HTTP 쪽에서는 같은 생각이 `Cache-Control`의 `stale-while-revalidate`로 적혀 있습니다. 공유 캐시에게 아래에서 갱신하는 동안 낡은 사본으로 답해도 된다고 알려 주는 지시자입니다.
