---
title: "IDistributedCache"
summary: "IDistributedCache는 프로세스 사이에서 공유하는 캐시에 대한 ASP.NET Core의 추상입니다. 문자열 키 위의 연산 네 가지이고 값은 byte[]입니다. 직렬화는 부르는 쪽의 몫이며, 그 뒤에 어떤 구현이 놓이는지는 호출 지점이 아니라 시작 시점에 정해집니다."
category: "캐시"
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

장면의 첫 단계에서 애플리케이션은 miss를 만나 데이터베이스를 읽고, 돌아오는 길에 그 결과를 캐시에 저장합니다. ASP.NET Core에서 그 "캐시"가 가리키는 인터페이스가 `IDistributedCache`이고, 일부러 작게 만들어져 있습니다. 문자열 키 위의 get, set, refresh, remove와 각각의 비동기 짝이 전부입니다. 의존성 주입에서 받아 쓰고, 호출 지점에서는 구현 이름을 부르지 않습니다.

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

값의 타입이 `byte[]`인 것은 빠뜨린 것이 아니라 그 자체가 계약입니다. 직렬화가 부르는 쪽 몫인 이유는 그 바이트가 공유되기 때문입니다. 다른 프로세스가 읽고, 무중단 배포 뒤에는 내 코드의 다른 버전도 읽습니다. 그래서 형식을 정하는 일은 통신 규약을 정하는 일과 같은 규칙을 따르는 호환성 결정이 됩니다. 선택적 필드를 더하는 것은 대개 안전하고, 필드의 타입을 바꾸는 것은 안전하지 않으며, 모양을 바꾸는 배포에는 새 키 접두사나 비우기 중 하나가 필요합니다. 중간에서 형식을 옮겨 줄 사람이 없기 때문입니다. `GetString`과 `SetString` 확장 메서드는 같은 계약 위에 얹은 UTF-8 편의 기능이지 다른 계약이 아닙니다.

구현은 호출하는 코드를 한 줄도 건드리지 않고 아래에서 바뀝니다. `AddDistributedMemoryCache`, `AddStackExchangeRedisCache`, SQL Server 구현, 그리고 같은 네 가지 연산을 노출하는 벤더 패키지들이 있습니다. 메모리 구현에는 되풀이할 만한 경고가 붙습니다. 프로세스 하나 안에서 인터페이스를 만족시킬 뿐 전혀 분산되어 있지 않습니다. 인스턴스마다 자기 사본을 들고 있어서, 한 인스턴스가 무효화한 엔트리가 나머지 네 대에서는 그대로 살아 있습니다. 테스트에는 맞는 선택이고 운영에서는 버그입니다. 만료는 `DistributedCacheEntryOptions`로 엔트리마다 정하는데, 절대 시각으로 주거나 지금부터의 길이로 주거나, 누군가 엔트리를 읽거나 `Refresh`를 부를 때만 연장되는 슬라이딩 구간으로 줍니다.

이 인터페이스가 주지 않는 것도 주는 것만큼 중요합니다. 여러 키를 한 번에 가져오는 연산이 없고, 묶어서 무효화할 태그나 영역이 없고, 원자적 증가가 없고, 몰림을 막아 주는 장치도 없습니다. 그래서 동시에 발생한 miss 둘은 둘 다 데이터베이스를 읽고 둘 다 같은 값을 씁니다. 프로세스 안쪽 계층도 없어서, 같은 인스턴스가 1밀리초 전에 물어본 키라도 hit마다 네트워크 왕복과 역직렬화가 듭니다. .NET 9의 `HybridCache`는 정확히 이 빈틈들을 메우려고 들어왔습니다. `IDistributedCache`를 L2로 두고 그 앞에 프로세스 안의 L1을 세우며, 직렬화를 대신 처리하고, 같은 키에 대한 동시 miss를 하나로 접습니다. 날것 그대로의 의미가 필요하거나 그 아래에 무언가를 구현하는 자리라면 이 인터페이스를 직접 쓰고, 원하던 것이 제대로 된 cache-aside였다면 HybridCache를 집으세요.
