---
title: "Redis"
summary: "Redis는 인스턴스들이 함께 쓰는 인메모리 데이터 구조 서버입니다. 문자열과 해시, 정렬 집합, 스트림을 들고 있는 빠른 프로세스 하나가 분산 캐시와 세션 저장소, 속도 제한 카운터, 분산 잠금, 가벼운 큐의 답이 되는 이유가 여기 있습니다."
category: "캐시"
related:
  - label: Cache-Aside
    slug: cache-aside
  - label: Cache Invalidation
    slug: cache-invalidation
  - label: Distributed Session
    slug: distributed-session
  - label: Sticky Session
    slug: sticky-session
  - label: Distributed Lock
    slug: distributed-lock
  - label: Eviction
    slug: eviction
  - label: HybridCache
    slug: hybridcache
  - label: Session State
    slug: session-state
  - label: IDistributedCache
    slug: idistributedcache
references:
  - title: Redis Docs
    url: https://redis.io/docs/latest/
  - title: Distributed caching in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/caching/distributed?view=aspnetcore-10.0
  - title: StackExchange.Redis
    url: https://seredis.dev/
---

## 언제 쓰나

- 캐시가 프로세스마다가 아니라 공유되어야 할 때 꺼냅니다. 인메모리 캐시는 인스턴스 수만큼 곱해집니다. 레플리카 열 대는 사본 열 개를 들고, 열 번 예열하고, 각자 따로 만료됩니다. `IDistributedCache` 뒤의 Redis 하나면 모든 레플리카가 같은 항목을 보고, HybridCache를 등록했을 때 승격되는 L2도 이것입니다.
- 세션 상태를 애플리케이션 프로세스 밖으로 빼려 할 때 씁니다. 세션이 Redis에 있으면 어느 인스턴스든 어느 요청이든 처리할 수 있습니다. 그래서 sticky 세션을 걷어내고, 장바구니를 버리지 않고 축소하고, 아무도 로그아웃시키지 않고 파드를 재시작할 수 있습니다.
- 더 나은 자리가 없을 때 조정 기본 요소(coordination primitive)를 여기에 둡니다. 분산 잠금과 속도 제한 카운터, 중복 방지 기록은 모두 모든 인스턴스가 동의하는 한 곳을 필요로 합니다. 명령이 단일 스레드로 원자적으로 처리되므로 증가시키고 비교하는 모양을 정확히 만들기가 쉽습니다.
- 브로커까지는 과할 때 가벼운 메시징으로 씁니다. pub/sub은 던지고 잊는 팬아웃이고 스트림은 컨슈머 그룹과 확인 응답을 더해 줍니다. 둘 다 쓸모 있지만, 내구성이 요구 사항이라면 어느 쪽도 브로커의 대체재는 아닙니다.

## 주의점

- 메모리가 예산이고, 축출 정책은 우리가 내리는 결정입니다. `maxmemory`와 정책이 없으면 인스턴스는 호스트가 항의할 때까지 커지고, 있으면 어떤 항목이 먼저 나갈지 우리가 고른 것입니다. `allkeys-lru`는 캐시처럼 동작하고 `noeviction`은 가득 찬 인스턴스를 쓰기 오류로 바꿉니다. 이 차이는 작업 집합이 장비를 넘어서는 날 가장 크게 드러납니다.
- 기본 자세는 캐시이지 기록 원본이 아닙니다. 영속화는 RDB 스냅샷과 AOF로 존재하고 둘의 내구성 답이 다릅니다. 스냅샷은 마지막 쓰기 이후 몇 분을 잃을 수 있고, 추가 전용 로깅은 처리량을 깎습니다. 장애를 넘겨야 하는 데이터는 데이터베이스에 있어야 하고 Redis는 사본을 드는 쪽입니다.
- 핫 키와 큰 키는 부하를 한 곳에 몰아넣습니다. 모든 요청이 읽는 키 하나는 샤드를 아무리 늘려도 트래픽을 한 샤드에 고정시키고, 수 메가바이트짜리 값은 전송되는 동안 연결을 막습니다. 값을 쪼개거나, 키 공간을 좁히거나, 뜨거운 항목을 Redis 앞에서 로컬로 캐시합니다.
- 명령 실행이 단일 스레드라서 O(N) 명령 하나가 전부를 세웁니다. `KEYS`나 큰 `SMEMBERS`, 넓은 범위 스캔은 끝날 때까지 도는 동안 다른 모든 클라이언트를 기다리게 만듭니다. 디버깅 습관 하나가 운영 장애가 되는 지점입니다. 순회에는 `SCAN`을 쓰고 컬렉션 크기는 제한해 둡니다.

## .NET에서는

- `ConnectionMultiplexer`는 만드는 비용이 크고 공유하도록 설계되어 있습니다. 애플리케이션마다 하나를 싱글턴으로 등록해 프로세스 수명 동안 재사용합니다. 적은 수의 연결 위로 모든 명령을 다중화하기 때문에, 작업마다 하나씩 만드는 것이 소켓을 고갈시키는 전형적인 방법입니다.
- 캐시 용도라면 분산 캐시 구현을 등록하고 나머지는 추상에 맡깁니다.

```csharp
builder.Services.AddStackExchangeRedisCache(options =>
{
    options.Configuration = builder.Configuration.GetConnectionString("redis");
    options.InstanceName = "checkout:";
});

// IDistributedCache가 등록되어 있으면 순서와 무관하게 HybridCache가 그것을 L2로 씁니다.
builder.Services.AddHybridCache();
```

- 세션과 데이터 보호 저장소도 같은 방식으로 붙습니다. `AddStackExchangeRedisCache`에 `AddSession`을 더하면 세션 상태가 인스턴스 밖으로 나가고, 같은 Redis가 Data Protection 키 링도 들 수 있습니다. 스케일 아웃한 애플리케이션이 두 번째로 공유해야 하는 것이 보통 이것입니다. 다만 멀티플렉서는 직접 맞춰 주어야만 공유됩니다. `AddStackExchangeRedisCache`는 `ConnectionMultiplexerFactory`로 싱글턴을 넘겨주지 않는 한 자기 것을 따로 만들고, `PersistKeysToStackExchangeRedis`는 별도의 `IConnectionMultiplexer`를 받습니다.
- 관리형 서비스는 운영 이야기를 바꾸지 API를 바꾸지 않습니다. Azure Managed Redis는 패치와 페일오버와 TLS를 맡아 주므로 애플리케이션은 같은 클라이언트로 같은 프로토콜을 그대로 씁니다. 일이 옮겨 가는 곳은 크기 산정과 축출 정책, 그리고 영속화가 정말 필요한지 정하는 쪽입니다.
