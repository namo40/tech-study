---
title: "Cache Version"
summary: "Cache Version은 키에 번호를 넣고 쓸 때 그 번호를 올립니다. 옛 엔트리는 다시 읽히지 않고, 지워지는 대신 스스로 만료됩니다."
category: "캐시"
scene: cache-invalidation
sceneStep: 4
related:
  - label: Cache Invalidation
    slug: cache-invalidation
  - label: Cache Tag
    slug: cache-tag
  - label: Cache Key
    slug: cache-key
references:
  - title: HybridCache in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/caching/hybrid?view=aspnetcore-10.0
---

키가 `catalog`가 아니라 `catalog@7`이 됩니다. 쓰기가 버전을 8로 올리면, 그 뒤에 키를 만드는 모든 읽기는 `catalog@8`을 찾습니다. 아직 아무도 캐시하지 않은 키입니다. 옛 엔트리는 그대로 남아 있지만 닿을 수 없습니다.

이것으로 무효화의 어려운 두 부분이 사라집니다. 모든 인스턴스로 퍼뜨릴 삭제가 없으므로 유실될 메시지도, 메시지가 오가는 동안의 틈도 없습니다. 읽고 나서 쓰는 경쟁도 없습니다. 느린 읽기가 `catalog@7`을 써 넣어도, `catalog@8`을 찾는 누구에게도 제공되지 않기 때문입니다.

대가는 메모리입니다. 주인을 잃은 엔트리가 TTL이 다할 때까지 캐시를 차지합니다. 그 TTL을 지나치게 길게 두지 않고, 버전은 모든 인스턴스가 싸게 읽을 수 있는 곳에 둡니다. 태그는 굵은 단위의 사촌 격으로 한 번의 삭제로 한 무리를 지웁니다. 바뀐 것이 키가 아니라 그 무리일 때 더 잘 맞습니다.
