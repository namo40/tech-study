---
title: "LRU"
summary: "LRU는 가장 오래 독자가 없었던 항목을 밀어냅니다. 접근 이력을 정책으로 바꾸는 규칙입니다. 최근에 만진 것을 다음에도 원할 것이라고 가정하고, 나머지는 빗나간 추측에 공간을 쓰고 있는 셈으로 봅니다."
category: "캐시"
scene: eviction
sceneStep: 2
related:
  - label: Eviction
    slug: eviction
  - label: Cache Key
    slug: cache-key
  - label: Cache-Aside
    slug: cache-aside
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
  - title: "Cache in-memory in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/caching/memory?view=aspnetcore-10.0
  - title: "MemoryCacheEntryOptions Class"
    url: https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.caching.memory.memorycacheentryoptions
  - title: "Caching in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/caching
---

Least Recently Used는 과거로 만든 미래에 대한 내기입니다. 캐시는 다음에 무엇을 물어올지 알 수 없으므로 가진 유일한 증거, 즉 최근에 어떤 항목이 요청됐는지를 쓰고, 마지막 독자가 가장 멀리 있는 항목을 밀어냅니다. 이 내기는 대체로 맞습니다. 접근 패턴은 대개 몰려서 오기 때문입니다. 편집 중인 문서는 1분 뒤에 다시 읽히고, 첫 화면에 걸린 상품은 1초 뒤에 다시 읽히며, 오늘 아침 이후로 아무도 보지 않은 행이 이제 와서 흥미로워질 일은 별로 없습니다. 장면에서 밀어낼 목록이 첫 번째 밀어내기보다 먼저 보이는 이유가 이것입니다. 각 키 아래의 밝기가 그 키의 마지막 읽기이므로, 줄의 어두운 끝은 아직 아무도 던지지 않은 질문의 답입니다.

LRU가 여러 선택지 중 하나가 아니라 기본값이 된 이유는 설정도 도메인 지식도 필요하지 않기 때문입니다. 경쟁자들은 모두 무언가를 요구합니다. Least Frequently Used는 항목마다 카운터를 요구하고, 그다음에는 오래된 인기를 어떻게 잊을지 정해야 합니다. 그러지 않으면 지난주에 뜨거웠던 항목을 영원히 지켜 줍니다. FIFO는 아무것도 요구하지 않는 대신 읽기를 아예 무시해서, 독자가 아무리 많아도 뜨거운 항목이 일정대로 나갑니다. 무작위 밀어내기는 평판보다 정말로 낫고 비용도 거의 없지만, 장애 상황에서 누구에게도 설명할 수 없습니다. LRU는 좋은 동작과 한 문장짜리 설명이 겹치는 자리에 있고, 그것은 타협이 아니라 실제 엔지니어링 속성입니다.

널리 알려진 약점은 훑기입니다. LRU는 읽기 한 번을 관심의 증거로 취급하는데, 큰 테이블을 도는 작업은 모든 행을 정확히 한 번씩 읽으므로 그 행들이 하루 종일 트래픽이 쌓아 온 작업 집합보다 더 최근에 쓰인 것처럼 보이게 됩니다. 훑기는 값진 것을 전부 밀어내고, 다시는 읽히지 않을 항목으로 캐시를 채우고, 그다음 자기 자신도 밀어냅니다. 결과는 방금 큰 일을 치렀지만 아무도 원하지 않는 것만 들고 있는 캐시입니다. 실제 구현이 순수한 LRU로 남는 경우가 드문 이유가 여기 있습니다. 한 번만 보인 항목을 위한 관찰 구간을 두거나, 최근성과 함께 빈도를 세거나, 애플리케이션이 일부 항목을 대상에서 빼도록 허용합니다. 야간 리포트와 뜨거운 경로가 캐시 하나를 나눠 쓰고 있다면 이미 이 문제를 안고 있는 것이고, 해법은 더 큰 한도가 아니라 분리나 우선순위입니다.

정확한 LRU는 보기보다 비싸기도 해서, 우리가 쓰는 캐시 대부분은 근사 LRU일 뿐입니다. 엄밀한 순서를 유지하려면 읽기마다 공유 자료 구조를 갱신해야 하고, 그러면 캐시에서 가장 싼 연산인 히트가 모든 스레드가 다투는 자료 구조에 대한 쓰기가 됩니다. 운영용 캐시는 표본 추출로, 또는 위치 대신 항목당 비트 하나만 두는 clock이나 second-chance 방식으로, 또는 구간을 나눈 근사로 그것을 피합니다. .NET의 `MemoryCache`도 이 계열입니다. 압축할 때 항목 스냅숏을 우선순위로, 그다음 마지막 접근으로 정렬하고, 한 번에 하나가 아니라 캐시의 일정 비율을 한꺼번에 지웁니다. 그러니 얻는 것은 LRU의 정신을 묶음 단위로 적용한 결과입니다. Redis는 키 몇 개를 표본으로 뽑아 그중 가장 오래된 것을 밀어냅니다. 둘 다 LRU의 언어로 추론해도 어긋나지 않을 만큼 가깝고, 둘 다 교과서가 고를 바로 그 항목을 주지는 않습니다. 그 차이는 그 항목을 믿고 무언가를 세웠을 때만 문제가 됩니다.
