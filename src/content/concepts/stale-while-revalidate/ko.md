---
title: "Stale-While-Revalidate"
summary: "stale-while-revalidate는 엔트리가 막 만료된 직후에 도착한 요청에게 옛 값을 답해 주고, 아무도 기다리게 하지 않은 채 뒤에서 엔트리를 갱신합니다. 지연 스파이크를 한정된 낡음의 창으로 바꾸는 방식이며, 그 창의 길이가 결정의 전부입니다."
category: "캐시"
scene: cache-stampede
sceneStep: 3
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
  - label: Negative Cache
    slug: negative-cache
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Spike Test
    slug: spike-test
  - label: Rate Limiter
    slug: rate-limiter
  - label: Distributed Lock
    slug: distributed-lock
references:
  - title: "RFC 5861: HTTP Cache-Control Extensions for Stale Content"
    url: https://www.rfc-editor.org/rfc/rfc5861
  - title: HybridCache in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/caching/hybrid?view=aspnetcore-10.0
  - title: Output caching middleware in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/caching/output?view=aspnetcore-10.0
---

장면의 세 번째 단계는 요청 하나만 원본으로 내려보내고 나머지에게는 방금 만료된 값을 건네줍니다. 무엇이 달라졌는지는 정확히 짚어 둘 값어치가 있습니다. 이것이 없으면 만료된 엔트리는 곧 미스이고, 미스는 곧 기다림입니다. 하필 그 밀리초에 도착한 독자가 재계산 비용을 전부 치르고, 그것이 도는 동안 도착한 모두도 함께 치릅니다. 이것이 있으면 만료는 독자가 느낄 수 있는 사건이기를 그만둡니다. 옛 값이 즉시 나가고, 뒤에서 도는 갱신 하나가 그것을 대체하고, 다음 독자가 새 값을 받습니다. 아무도 기다리지 않았고, 원본은 군중 대신 호출 하나를 보았습니다.

이름은 HTTP에서 왔고, 거기서는 숫자 하나가 아니라 둘로 적혀 있습니다. `Cache-Control: max-age=60, stale-while-revalidate=30`은 이 값이 60초 동안 신선하고, 아래에서 갱신이 도는 동안 30초를 더 제공해도 된다는 뜻입니다. RFC 5861에는 알아 둘 만한 형제가 하나 더 있습니다. `stale-if-error`는 실패에 대해 같은 말을 합니다. 원본이 답하지 않으면 이만큼 동안은 옛 사본을 계속 내보내라는 것입니다. 둘 다 데이터의 주인이 얼마만큼의 낡음을 팔 준비가 되어 있는지를 응답 자체에 적어 캐시에게 알려 주는 장치입니다.

사람들이 건너뛰는 대목이 여기입니다. stale-while-revalidate는 대가 없는 성능 요령이 아니라, 기간으로 적힌 최종 일관성 결정입니다. 60초 캐시에 30초 갱신 창을 둔 가격은 데이터베이스보다 최대 90초까지 뒤처질 수 있고, 그 창 안에서 일어난 변경은 창이 끝날 때까지 보이지 않습니다. 값을 정할 때 그 숫자를 소리 내어 말해 보고, 업무가 그것을 감당할 수 있는지 확인합니다. 상품 설명이라면 90초는 아무것도 아닙니다. 이체 버튼 옆에 뜨는 잔액이라면 문의 티켓입니다.

코드에서 이 패턴은 만료가 하나가 아니라 둘입니다. 엔트리는 신선하기를 그만두는 시점인 소프트 만료와, 존재하기를 그만두는 시점인 하드 만료를 함께 갖습니다. 소프트 만료를 지난 읽기는 값을 돌려주고 갱신을 예약하며, 하드 만료를 지난 읽기는 예전처럼 기다려야 합니다. `HybridCache`는 `Expiration`으로 하드 쪽을 주므로, 소프트 쪽은 보통 캐시된 객체 안에 넣어 둔 타임스탬프이고 읽는 쪽이 그것을 `TimeProvider.GetUtcNow()`와 비교합니다. 갱신을 무엇으로 돌리든 요청의 `CancellationToken` 위에서 돌리지 마세요. 독자의 응답은 이미 나가는 중이고, 토큰은 곧 취소되며, 띄웠다고 생각한 갱신이 그것과 함께 죽습니다.

마지막 경고 하나가 스탬피드로 되돌아갑니다. 백그라운드 갱신도 single flight로 묶여야 합니다. 소프트 만료를 지난 독자마다 자기 갱신을 시작하면 군중을 없앤 것이 아니라 상설로 만든 셈입니다. 갱신 창 내내 엔트리가 낡은 상태이고, 그 안의 모든 요청이 호출을 하나씩 띄우기 때문입니다. 키 단위로 갱신을 합치거나 그 주위에 짧은 잠금을 걸어, 장면이 보여 주는 그림을 그대로 유지합니다. 보는 독자가 몇이든 원본으로 가는 요청은 하나입니다.
