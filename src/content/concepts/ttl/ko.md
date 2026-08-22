---
title: "TTL"
summary: "TTL은 캐시된 엔트리가 사실과 어긋날 수 있는 가장 긴 시간이며, 놓친 무효화를 모두 되돌려 주는 최후의 보루입니다."
category: "캐시"
scene: cache-invalidation
sceneStep: 1
related:
  - label: Cache Invalidation
    slug: cache-invalidation
  - label: Cache-Aside
    slug: cache-aside
  - label: Cache Stampede
    slug: cache-stampede
references:
  - title: Caching guidance
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/caching
---

TTL은 실패할 수 없는 유일한 무효화입니다. 메시지는 유실되고, 발행 도중에 프로세스가 재시작되기도 하며, 쓰기 경로가 삭제 호출을 잊기도 합니다. 그 어느 것도 TTL보다 오래 문제가 되지 않습니다. 엔트리가 스스로 만료되고 다음 읽기가 사실을 가져오기 때문입니다.

길이는 읽는 쪽이 얼마나 오래된 값까지 견딜 수 있는지에서 정합니다. 원본을 읽는 비용에서 정하지 않습니다. 가격이 5분까지 오래되어도 된다면 TTL은 5분입니다. 데이터베이스 호출을 아끼려고 한 시간으로 늘리는 것은, 말하지 않은 채 정확성을 비용과 맞바꾸는 일입니다.

TTL에는 무작위 편차를 줍니다. 같이 쓰인 엔트리는 같이 만료되고, 한 무리가 한꺼번에 만료되면 원본으로 miss의 파도가 몰려갑니다. 만료마다 몇 퍼센트의 jitter를 주면 그 동시성이 공짜로 깨집니다.
