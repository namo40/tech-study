---
title: "Cache Key"
summary: "캐시 키는 무엇을 같은 질문으로 볼지 정합니다. 서로 다른 키 하나하나가 같은 공간을 두고 경쟁하는 별개의 항목이므로, 카디널리티가 곧 축출 압력이고 그것을 설계하는 자리가 키입니다."
category: "캐시"
scene: eviction
sceneStep: 3
related:
  - label: Eviction
    slug: eviction
  - label: LRU
    slug: lru
  - label: Cache-Aside
    slug: cache-aside
  - label: Cache Version
    slug: cache-version
  - label: Cache Invalidation
    slug: cache-invalidation
  - label: TTL
    slug: ttl
  - label: Cache Stampede
    slug: cache-stampede
  - label: Memory Pressure
    slug: memory-pressure
  - label: Object Pool
    slug: object-pool
  - label: Output Cache
    slug: output-cache
  - label: HybridCache
    slug: hybridcache
references:
  - title: "Cache in-memory in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/caching/memory?view=aspnetcore-10.0
  - title: "Caching in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/caching
  - title: "MemoryCacheEntryOptions Class"
    url: https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.caching.memory.memorycacheentryoptions
---

캐시 키는 적어 놓은 동치류입니다. 키를 고를 때 우리는 어떤 요청들이 같은 답을 받아야 하는지를 선언하고, 나머지는 그 한 가지 주장에서 따라 나옵니다. 키를 너무 성기게 잡으면 서로 다른 두 질문이 충돌해서 누군가가 다른 사람을 위해 계산된 응답을 받습니다. 키에서 빠뜨린 것이 테넌트나 사용자였다면, 이 실패 방식은 캐시를 보안 사고로 바꿉니다. 반대로 너무 촘촘하게 잡으면 아무것도 충돌하지 않습니다. 안전해 보이지만 그것이 장면 속의 실패입니다. 한 질문의 세 가지 표기가 세 개의 항목이 되고, 각각 같은 바이트를 들고, 각각 진짜 읽는 쪽이 있는 항목이 원하던 칸을 차지합니다.

중요한 숫자는 카디널리티이고, 그것은 합이 아니라 곱입니다. 구분 기준으로 삼는 차원 하나하나가 항목 수에 그 차원이 갖는 값의 개수를 곱합니다. 페이지 번호와 정렬 순서라면 스무 가지 조합쯤 됩니다. 여기에 로캘을 더하면 사백 가지입니다. 사용자 식별자까지 더하면 사용자 수만큼이 되고, 이는 작업 집합이 사용자별로 쪼개져 어느 사용자도 다른 사용자를 위해 캐시를 데워 주지 않는다는 뜻입니다. 이 중 어느 것도 코드에서는 보이지 않습니다. 문자열을 이어 붙여 만든 키는 차원이 셋이든 여섯이든 똑같아 보이기 때문입니다. 대신 캐시를 아무리 키워도 오르지 않는 히트율로 드러나는데, 그것이 사려는 공간보다 키 공간이 더 빨리 자라고 있다는 신호입니다.

정규화는 이 일의 값싼 절반이고, 장면의 3단계가 하는 일이 그것입니다. 같은 답에는 정확히 하나의 표기만 있어야 하므로, 키는 호출자가 입력한 그대로가 아니라 파싱된 정규 값으로 만듭니다. 쿼리 파라미터를 정렬하고, 응답을 바꾸지 않는 것은 버리고, 대소문자를 구분하지 않는 값은 소문자로 낮추고, 타임스탬프는 실제로 제공하는 단위로 반올림하고, 로캘은 번역이 있는 작은 집합으로 해석합니다. 호출 지점이 아니라 타입이 있는 인자를 받아 문자열을 돌려주는 함수 하나에서 만들고, 구성 요소 안에 나올 수 없는 구분자를 써서 `user:1`과 `2`가 `user`와 `1:2`와 같은 키로 적히지 않게 합니다. 모양을 가리키는 짧은 접두사와 버전 조각을 넣으면 좋습니다. 버전이 들어간 키는 TTL을 기다리지 않고 폐기할 수 있는 키이기 때문입니다.

나머지 절반은 애초에 키에 들어가면 안 되는 것을 가려내는 일입니다. 요청 식별자, 추적 식별자, 분석 태그가 붙이는 캐시 무력화 파라미터, 정밀도 그대로의 `DateTime`. 이들은 하나같이 미스를 보장하고, 그다음 다시는 읽히지 않을 항목을 남깁니다. 칸을 쓰는 방법 중 가장 나쁜 쪽입니다. 출력 캐싱의 vary-by 선택도 같은 눈으로 봐야 합니다. 클라이언트가 마음대로 정하는 헤더에 따라 달라지는 정책은 키 공간을 호출자에게 넘겨주는 것이기 때문입니다. 그리고 답이 의존하는데 키에는 없는 것이 반대 방향의 버그입니다. 응답이 테넌트에 따라 달라진다면 테넌트는 반드시 키에 있어야 하고, 그것을 빠뜨린 상황은 캐시 크기로는 결코 구제되지 않습니다.
