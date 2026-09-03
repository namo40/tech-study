---
title: "HybridCache"
summary: "HybridCache는 두 층을 하나의 .NET 캐시 API로 덮은 것입니다. 프로세스 안의 빠른 L1과 선택적인 공유 L2를 함께 다루고, 스탬피드 보호가 호출 하나에 들어 있어서 같은 키에 대한 동시 미스가 팩토리 실행 하나로 합쳐집니다."
category: "캐시"
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

## 언제 쓰나

- `IMemoryCache`와 `IDistributedCache`를 직접 엮어 쓰려던 자리에 꺼냅니다. 그 조합은 언제나 같은 네 조각입니다. 로컬을 보고, 원격을 보고, 원본을 부르고, 두 층에 다시 씁니다. 그리고 어느 코드베이스든 이 넷 중 하나는 미묘하게 틀립니다. HybridCache는 그 짝을 지원되는 추상으로 만들어 주기 때문에, 적재 전략이 우리가 관리할 대상에서 빠집니다.
- 스탬피드 보호를 직접 만들지 않고 얻고 싶을 때 씁니다. 같은 키가 비어 있을 때 몰려온 호출자들은 각자 비싼 적재를 돌리지 않고 진행 중인 팩토리 호출 하나에 합류합니다. 우리가 직접 걸고 정확히 맞춰야 했던 잠금 대신 `GetOrCreateAsync` 안에서 처리됩니다.
- 인스턴스 여러 대가 로컬 속도와 공유된 답을 동시에 필요로 할 때 씁니다. L1은 핫 패스를 메모리 지연에 붙여 두고, L2는 갓 뜬 인스턴스나 갓 늘어난 인스턴스가 완전히 차가운 상태로 도착하는 것을 막아 줍니다. 호출부는 수명이 둘이고 실패 방식도 둘인 두 API 대신 하나만 봅니다.
- 팀이 여럿 캐시를 쓰기 시작하면 사내 헬퍼 클래스보다 낫습니다. 등록 지점이 하나면 직렬화기, 기본 만료, 태그 규칙을 바꿀 자리도 하나입니다. 세 서비스가 복사한 뒤 각자 고쳐 놓은 정적 유틸리티와는 다릅니다.

## 주의점

- L1 항목은 다른 인스턴스가 값을 바꿨다는 사실을 알지 못합니다. 쓰기와 제거는 그 작업을 실행한 프로세스의 로컬 캐시와 그 뒤의 분산 층에 닿고, 나머지 인스턴스는 자기 로컬 사본이 만료될 때까지 이미 들고 있던 값을 계속 내보냅니다. 로컬 만료는 두 인스턴스가 어긋날 수 있는 시간을 말로 설명할 수 있을 만큼 짧게 잡고, 제거가 곧 브로드캐스트라고 가정하기 전에 무효화 페이지를 읽어 봅니다.
- 태그 기반 무효화는 거친 도구이지 구독이 아닙니다. 항목 묶음을 한 번에 떨어뜨리는 방법이라서 "이 테넌트에 관한 전부" 같은 요구에는 잘 맞지만, 모든 노드가 같은 순간에 받는 이벤트처럼 기대하면 어긋납니다.
- L2로 넘어가는 것은 전부 직렬화되고, 그 비용도 캐시의 일부입니다. 미스마다 큰 객체 그래프를 직렬화하면 대체하려던 쿼리보다 느려질 수 있고, 큰 항목 하나가 공유 저장소에서 작은 항목 여럿을 밀어냅니다. 어쩌다 불러온 애그리게이트가 아니라 실제로 화면에 그리는 투영을 캐시합니다.
- 인스턴스마다 값이 조금 달라도 되는 것만 캐시합니다. 같은 초에 두 인스턴스로 들어온 두 요청이 정확히 같은 값을 봐야 한다면 그 값은 애초에 캐시 후보가 아닙니다. 답은 TTL을 줄이는 것이 아니라 기록 원본을 읽는 것입니다.

## .NET에서는

- 패키지는 `Microsoft.Extensions.Caching.Hybrid`이고 API는 .NET 9에서 들어왔습니다. `AddHybridCache`가 적당한 기본값으로 서비스를 등록하고, `GetOrCreateAsync` 호출 하나가 조회와 미스 분기와 두 번의 쓰기를 대신합니다.

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
    async (key, ct) => await repository.GetProductAsync(key, ct),
    cancellationToken: ct);
```

- 두 번째 층을 켜는 것은 `IDistributedCache` 등록입니다. 다른 것을 등록하지 않으면 HybridCache는 스탬피드 보호가 붙은 인프로세스 캐시입니다. `AddHybridCache` 앞에 `AddStackExchangeRedisCache`를 두면 같은 호출부가 코드 한 줄 바꾸지 않고 공유 L2를 얻습니다.
- 두 만료 값은 별개의 손잡이이고 따로 정해야 합니다. `Expiration`은 분산 사본의 수명이고 `LocalCacheExpiration`은 인프로세스 사본의 수명입니다. 두 인스턴스가 얼마나 오래 다른 값을 볼 수 있는지 정하는 쪽은 로컬 값입니다.
- 직렬화는 타입별로 갈아 끼울 수 있습니다. 기본 구현은 문자열과 바이트 배열을 그대로 다루고 나머지는 JSON으로 처리하는데, `AddSerializer`를 쓰면 자주 오가는 타입만 더 싼 형식으로 바꿀 수 있고 캐시하는 방식은 그대로입니다.
