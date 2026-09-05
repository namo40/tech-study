---
title: "Negative Cache"
summary: "네거티브 캐시는 무언가가 들어 있는 답만이 아니라 여기에는 아무것도 없다는 답도 저장합니다. 그래서 존재하지 않는 키를 향한 조회가 쏟아져도 매번 데이터베이스까지 가는 대신 메모리에서 답해집니다."
category: "캐시"
scene: cache-stampede
sceneStep: 4
related:
  - label: Cache Stampede
    slug: cache-stampede
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
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Spike Test
    slug: spike-test
  - label: Rate Limiter
    slug: rate-limiter
  - label: Distributed Lock
    slug: distributed-lock
references:
  - title: Cache in-memory in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/caching/memory?view=aspnetcore-10.0
  - title: HybridCache in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/caching/hybrid?view=aspnetcore-10.0
  - title: MemoryCacheEntryOptions Class
    url: https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.caching.memory.memorycacheentryoptions
---

장면의 마지막 단계는 애초에 있지도 않던 키를 향해 요청 한 무더기를 보냅니다. 이것을 보여 줄 값어치가 있는 이유는, 평범한 캐시에는 여기에 대한 방어가 아예 없기 때문입니다. 캐시는 찾아낸 것을 저장합니다. 아무것도 찾지 못한 조회는 아무것도 저장하지 않으므로, 같은 없는 키에 대한 다음 조회도 캐시에서 아무것도 찾지 못하고, 역시 데이터베이스로 가고, 역시 빈손으로 돌아옵니다. 존재하지 않는 키를 향한 모든 요청은 호출하는 쪽이 보내고 싶은 만큼의 속도로, 영원히 확정된 미스입니다. 없음이라는 답을 캐시하는 것이 이것을 닫는 유일한 방법이고, 장면에서는 히트가 받는 것과 같은 반사로 나타납니다.

이것은 들리는 것만큼 특이한 일이 아닙니다. 없는 키는 짐작보다 훨씬 자주 무더기로 도착하기 때문입니다. URL 안의 식별자는 순서대로 세어 볼 수 있으므로, `/products/1`부터 위로 훑는 스캐너는 빈 자리 수천 개를 연달아 때립니다. 404를 최종 답으로 취급하지 않는 재시도 루프를 가진 클라이언트는 누가 멈춰 줄 때까지 같은 없는 것을 계속 요청합니다. 한쪽 시스템에서는 null인 조인 키를 다른 쪽에서 조회하면 아무것도 아닌 것에 대한 조회가 꾸준히 흘러나옵니다. 그리고 삭제된 항목은 아직 그것을 링크하고 있는 모든 페이지에서 몇 달 동안 계속 요청되기도 합니다. 네 경우 모두 데이터베이스는 가능한 한 가장 값싼 질문에 수천 번 답하고 있고, 그 답은 결코 바뀌지 않습니다.

네거티브 캐시를 안전하게 만드는 규칙은 하나입니다. 옆에 있는 긍정 항목보다 훨씬 짧은 수명을 줍니다. 낡은 네거티브의 대가는 틀린 숫자가 아니라 보이지 않음입니다. 방금 만들어진 항목이 네거티브 항목이 만료될 때까지 모두에게 없는 것으로 남습니다. 상품은 10분, 없음은 30초로 캐시하면 보호는 대부분 얻으면서 생성과 노출 사이의 창은 아무도 버그로 접수하지 않을 만큼 짧게 유지됩니다. 쓰기 경로에서 생성 시점에 무효화할 수 있다면 그것도 함께 하면 창이 완전히 닫히지만, 짧은 TTL은 그래도 남겨 둡니다. 놓친 무효화를 받아 주는 안전망이기 때문입니다.

표현에 관한 함정이 하나 있는데, 순진하게 구현하면 조용히 아무 일도 하지 않게 되는 이유가 이것입니다. 없는 키에 `null`을 저장하면 캐시는 아직 조회해 보지 않았음과 조회했더니 아무것도 없었음을 구분하지 못합니다. 둘 다 `null`로 읽히기 때문입니다. `IMemoryCache`와 `HybridCache`는 그 `null`을 아무렇지 않게 저장하므로 이 모호함은 이론이 아닙니다. `Get<T>`나 `GetOrCreateAsync` 읽기는 어느 쪽이든 `null`을 돌려주고, `TryGetValue` 모양의 읽기만이 그 차이를 볼 수 있습니다. `IDistributedCache`는 반대 방향으로 실패해 null 페이로드를 아예 거부하므로, 네거티브 항목이 쓰이지도 않습니다. 대신 표식을 저장합니다. `record Cached<T>(T? Value, bool Found)` 같은 래퍼나, 널리 알려진 빈 인스턴스면 됩니다. 무엇을 쓰든 읽기 경로가 부재가 아니라 확정된 답으로 알아볼 수 있는 것이어야 합니다.

마지막으로 한계를 지어야 할 것은 메모리입니다. 네거티브 캐시는 호출하는 쪽이 키를 고르는 캐시이고, 그것이 바로 공격자가 원하는 모양입니다. 존재하지 않는 서로 다른 식별자 백만 개를 보내 놓고, 결코 존재하지 않을 것들의 항목으로 캐시가 차오르는 것을 지켜보면 됩니다. 네거티브 항목에 자기만의 크기 제한을 주거나 `SizeLimit`을 설정한 별도의 캐시 인스턴스에 담아, 그것들이 축출될 때 원래 지키려던 진짜 값을 함께 밀어내지 못하게 합니다. 키 공간이 거대하고 미스가 우연이 아니라 악의적인 곳에서는, 보통 다음 수순이 캐시 앞에 두는 소속 판정 필터입니다. 상수 메모리로 확실히 없음을 답해 주고 나머지는 전부 평소 경로로 흘려보냅니다.
