---
title: "Eviction"
summary: "Eviction은 가득 찬 캐시가 쓸모를 유지하려고 하는 일입니다. 자리가 없으면 정책이 희생자를 고르고, 그 키의 다음 읽기가 미스를 치르며, 정책도 공간을 채우는 키도 기본값이 아니라 설계 결정입니다."
category: "캐시"
scene: eviction
steps:
  - title: "캐시는 무엇을 언제 만졌는지 기억합니다"
    text: "항목이 여섯 칸을 채우고, 히트가 날 때마다 그 항목의 최근성이 되살아나며 손대지 않은 것들은 조용히 바래 갑니다. 아직 아무것도 축출되지 않았지만, 바래 가는 순서가 이미 축출 목록입니다."
  - title: "자리가 없으면 정책이 희생자를 고릅니다"
    text: "LRU는 가장 오래 손대지 않은 항목을 고르고, 새 항목이 그 자리를 차지합니다. 대가는 나중에 옵니다. 축출된 키의 다음 읽기가 미스를 내고, 원본 왕복을 치르고, 다시 들어오면서 또 다른 누군가를 축출합니다. 가득 찬 캐시는 의자 앉기 놀이입니다."
  - title: "공간을 채우는 것은 데이터가 아니라 키입니다"
    text: "같은 답의 사소하게 다른 키들이 저마다 칸을 차지하고, 정직한 항목들이 중복에게 자리를 내주며 축출됩니다. 키를 정규화하면 변형들이 한 칸으로 접힙니다. 카디널리티가 곧 축출 압력이고, 그것은 키를 설계할 때 함께 설계됩니다."
  - title: "축출은 사고가 아니라 결정이어야 합니다"
    text: "크기 한도는 그대로 두되 항목에 서열을 줍니다. 살아남아야 할 것은 고정하고, 나머지 자리를 LRU가 쓰게 합니다. 고정된 항목은 압력이 어떻든 후보에 오르지 않습니다. 우선순위 없는 캐시는 결제 페이지와 낡은 썸네일을 동급으로 대합니다."
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

## 언제 쓰나

Eviction은 켜고 끄는 기능이 아닙니다. 한도가 있는 캐시는 모두 축출을 하고, 한도가 없는 캐시는 그저 예의 바른 메모리 누수입니다. 그래서 질문은 축출이 일어나느냐가 아니라, 정책을 골랐는가, 크기를 골랐는가, 그리고 항목이 떠날 때 무엇을 치르는지 아는가입니다.

- 한도가 있는 캐시를 볼 때의 렌즈로 읽습니다. 장면의 여섯 칸이 한도이고, 그 아래 밝기 사다리가 정책입니다. 한도가 얼마인지, 어떤 항목이 가장 먼저 나갈지 말할 수 있다면 두 결정을 모두 내린 것입니다. 말할 수 없다면 런타임이 대신 내린 것입니다.
- 트래픽은 그대로인데 히트율이 떨어질 때 꺼내 봅니다. 읽기의 90%를 답하던 캐시가 60%만 답하게 됐다면 대개 질문이 달라진 것이 아니라 답을 덜 들고 있는 것이고, 원인은 항목이 커졌거나 키 공간이 넓어졌거나 둘 중 하나입니다. 둘 다 지연 시간보다 먼저 축출 수치에 나타납니다.
- 히트율과 축출 수는 따로 보지 말고 늘 함께 봅니다. 히트율만으로는 차가운 캐시와 스래싱 중인 캐시를 구별할 수 없고, 축출 수만으로는 건강한 회전과 더는 담기지 않는 작업 집합을 구별할 수 없습니다. 둘을 나란히 놓으면 구별됩니다. 히트율이 안정적인데 축출이 많으면 감당할 만한 회전이고, 히트율이 떨어지면서 축출이 많으면 아무도 두 번 읽지 않을 항목에 예산을 다 쓰고 있는 것입니다.
- 한 캐시가 여러 종류의 항목을 담는 순간부터 진지하게 봅니다. 세션 덩어리, 렌더링된 조각, 조회용 테이블은 같은 사전을 쓴다는 것 말고는 공통점이 없고, 정책 하나만 두면 가장 크고 덜 중요한 것이 가장 작고 중요한 것을 기꺼이 축출합니다. 우선순위와 항목별 크기가 있는 이유가 바로 이 경우입니다.
- 한도를 올리기 전에 먼저 봅니다. 크기를 두 배로 늘려서 버는 시간은 작업 집합 중 빠져 있던 몫에 비례하고, 그 몫은 두 배에 한참 못 미치는 경우가 많습니다. 압력이 서로 다른 답의 개수가 아니라 키 카디널리티에서 온다면, 캐시가 커져도 중복만 더 담기고 히트율은 거의 움직이지 않습니다.
- 오래된 값 문제를 고치려고 쓰지는 않습니다. 틀린 항목에는 무효화나 TTL이 필요합니다. 축출은 아무 문제 없이 올바른 항목을 지우고, 지우는 이유는 누가 그것을 원했는지와 아무 상관이 없습니다.

## 주의점

- `SizeLimit` 없는 `MemoryCache`는 머신이 비명을 지를 때까지 무한합니다. 기본 상한이 없고, 런타임이 대신 덜어 주는 일도 없습니다. 시스템 메모리가 부족해도 마찬가지입니다. 항목은 계속 쌓이고, 만료 말고는 어떤 것도 항목을 지우지 않습니다. 한도를 정하면 그것을 넘길 때 `CompactionPercentage`(기본 5%)만큼의 백그라운드 압축이 일어나고, 그것이 축출을 사고에서 정책으로 바꿉니다.
- 크기에는 단위가 없고, 크기를 안 붙인 항목 하나가 모두를 위한 한도를 망가뜨립니다. `SizeLimit`은 애플리케이션에서 `Size`가 뜻하기로 한 것을 셉니다. 바이트든 행 수든 항목당 1이든 상관없고 일관되기만 하면 됩니다. 다만 한도가 켜진 상태에서 크기 없이 추가하면 예외가 나고, 그 사실은 보통 헬퍼를 우회한 코드 경로에서 발견됩니다. 단위를 한 번 정해 옵션 팩토리에 넣고, 호출 지점에서는 크기를 지정하지 않습니다.
- LRU는 훑기에 약합니다. 큰 컬렉션을 한 번 도는 작업은 모든 키를 정확히 한 번씩 만지고, 그 한 번이 하루 종일 쌓아 온 작업 집합보다 최근이 되므로, 훑기가 값진 것을 다 축출한 다음 자기 자신도 축출됩니다. 백그라운드 작업이나 리포트, 관리 화면이 핫 패스가 캐싱하는 데이터를 쓸어 간다면 그 작업에는 별도 캐시를 주거나, 먼저 지는 낮은 우선순위를 주거나, 아예 캐시를 주지 않아야 합니다.
- 축출은 만료가 아니고, 둘을 섞으면 양쪽 방향으로 버그가 생깁니다. TTL은 "아직 참인가"에 답하고 축출은 "자리가 있는가"에 답합니다. 방금 쓴 항목이 1초 뒤에 축출될 수 있고, 오래된 항목이 TTL이 허락하는 동안 손도 안 닿은 채 앉아 있을 수 있습니다. 크기 한도를 신선도 장치로 쓰지 않고, TTL이 메모리를 묶어 준다고 가정하지 않습니다.
- 키 카디널리티는 아무도 예산에 넣지 않는 곱셈입니다. 캐시는 서로 다른 답마다가 아니라 서로 다른 키마다 항목 하나를 담습니다. 그래서 요청 식별자나 정렬되지 않은 쿼리 문자열, 정밀도 그대로의 타임스탬프를 포함한 vary-by 선택은 답 하나를 각자 한 번씩만 읽히는 수천 개의 항목으로 바꿉니다. 장면의 3단계가 바로 이것이고, 해법은 언제나 크기가 아니라 키에 있습니다.
- 축출 콜백은 사후에 돌고 거부권이 없습니다. 사후 축출 콜백은 훅이 아니라 알림입니다. 항목이 사라진 뒤 얼마 지나서 스레드 풀 스레드에서 돌고, 용량만이 아니라 만료로도 똑같이 불리며, 그 안에서 무거운 일을 하면 축출을 유발한 바로 그 트래픽과 경쟁합니다. 이유를 읽고, 세고, 그 밖의 일은 하지 않습니다.

## .NET에서는

- 한도를 정하고 모든 항목에 크기를 붙입니다. 한도가 있는 캐시를 세우는 일은 이게 전부이고, 두 쪽이 숫자의 뜻에 합의해야 합니다. 한 가지 짚어 둘 점은 `MemoryCache`가 장면이 그리는 것처럼 새 항목의 자리를 만들려고 희생자 하나를 동기적으로 축출하지는 않는다는 것입니다. 합계를 한도 너머로 밀어낼 항목은 저장되는 대신 버려지고, 압축은 그 뒤에 백그라운드에서 돌아갑니다. 그래서 가득 찬 캐시는 항목 하나를 다른 것과 맞바꾸는 것이 아니라 잠시 쓰기를 거부합니다.

```csharp
builder.Services.AddSingleton<IMemoryCache>(_ => new MemoryCache(new MemoryCacheOptions
{
    SizeLimit = 1024,
    CompactionPercentage = 0.2,
}));

// Size는 SizeLimit과 같은, 우리가 정한 단위입니다. 여기서는 항목 하나가 1입니다.
cache.Set(key, value, new MemoryCacheEntryOptions
{
    Size = 1,
    SlidingExpiration = TimeSpan.FromMinutes(10),
});
```

- `CacheItemPriority`가 장면의 pin입니다. `Low`, `Normal`, `High`는 캐시가 압축할 때 누가 먼저 나갈지 순서를 매기고, `NeverRemove`는 항목을 정책의 손이 닿지 않는 곳에 둡니다. 불멸을 약속하지는 않아서 명시적인 `Remove`나 만료는 그대로 적용되지만, 용량 압력은 다른 모든 것을 먼저 비웁니다. 없으면 장애가 되는 소수의 항목에 쓰면 됩니다.

```csharp
var options = new MemoryCacheEntryOptions
{
    Size = 1,
    Priority = CacheItemPriority.NeverRemove,
};
```

- 사후 축출 콜백을 등록하고 이유를 셉니다. `EvictionReason.Capacity`는 크기 한도가 이 항목을 골랐다는 뜻이고, `Expired`와 `TokenExpired`는 시간이 다했다는 뜻이며, `Removed`와 `Replaced`는 우리가 한 일입니다. 서로 다른 네 가지 이야기이고, 카운터 하나로는 구별되지 않습니다.

```csharp
options.RegisterPostEvictionCallback((key, value, reason, state) =>
{
    evictions.Add(1, new KeyValuePair<string, object?>("reason", reason.ToString()));
});
```

- 출력 캐싱에서는 vary-by가 곧 키이므로 정책 문제도 그쪽으로 옮겨 갑니다. `SizeLimit`과 `MaximumBodySize`가 저장소를 묶고, `SetVaryByQuery`나 `SetVaryByHeader`, `SetVaryByRouteValue`를 하나 더할 때마다 그 안에서 경쟁하는 항목이 곱해집니다. 클라이언트가 마음대로 정하는 헤더에 따라 달라지는 정책은 키 공간은 무한하고 크기는 유한한 캐시이고, 이는 양쪽의 나쁜 점만 모은 것입니다.

```csharp
builder.Services.AddOutputCache(options =>
{
    options.SizeLimit = 100 * 1024 * 1024;
    options.AddPolicy("catalogue", policy => policy
        .Expire(TimeSpan.FromMinutes(5))
        .SetVaryByQuery("page", "sort"));
});
```

- `HybridCache`는 분산 캐시 앞에 작은 프로세스 내 캐시를 두는데, 그 로컬 절반은 곧 `IMemoryCache`라서 그 캐시에 `SizeLimit`을 주었을 때만 한도가 있습니다. 그렇지 않으면 그것을 줄이는 것은 `LocalCacheExpiration`뿐입니다. 별개로, `MaximumPayloadBytes`(기본 1 MB)보다 큰 항목은 로그만 남기고 어느 계층에도 저장되지 않습니다. 가까운 캐시는 작업 집합이고 먼 캐시는 저장소이니 보통은 그것이 바라는 모습이지만, 로컬 축출은 분산 히트율에 보이지 않으므로 어느 쪽이 스래싱 중인지 말하려면 두 계층에 각각 카운터가 필요합니다.
- 분산 계층에서 정책은 우리 것이 아니라 서버의 것입니다. Redis는 자기 `maxmemory-policy`에 따라 축출하고, 키 대부분에 TTL이 없을 때 `allkeys-lru`와 `volatile-lru`는 아주 다르게 굽니다. 뒤쪽은 축출을 거부하고 대신 쓰기를 실패시키기 시작합니다. 애플리케이션이 자기 캐시에 대해 무엇을 믿든, 실제 한도를 쥔 쪽은 서버입니다.
