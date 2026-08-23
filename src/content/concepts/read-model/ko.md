---
title: "Read Model"
summary: "Read Model은 화면이 요구하는 모양 그대로 보관해 둔 데이터입니다. 그래서 조회가 재구성이 아니라 조회로 끝납니다. 파생된 것이지 원본이 아니며, 버리고 다시 만들 수 있습니다."
category: "애플리케이션 아키텍처"
scene: command-query-responsibility-segregation
sceneStep: 2
related:
  - label: CQRS
    slug: command-query-responsibility-segregation
  - label: Projection
    slug: projection
  - label: Materialized View
    slug: materialized-view
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: No-Tracking Query
    slug: no-tracking-query
  - label: Denormalization
    slug: denormalization
  - label: Event Sourcing
    slug: event-sourcing
references:
  - title: CQRS pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs
  - title: Materialized View pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/materialized-view
  - title: Tracking vs. no-tracking queries
    url: https://learn.microsoft.com/en-us/ef/core/querying/tracking
---

쓰기 모델은 불변식을 중심으로 만들어집니다. 주문은 자신이 어떤 상태가 되어도 되는지를 알고 있고, 주문에 달린 것들은 규칙을 강제하기 위해 거기에 있습니다. 화면은 그중 어느 것도 원하지 않습니다. 화면이 원하는 것은 주문 번호, 고객 이름, 합계, 상태가 한 줄에 담긴 행이고, 그것도 한 번에 스무 건입니다. 그 답을 쓰기 모델에서 만들어 내려면 연관을 서너 번 타고 들어갔다가 결과의 대부분을 버려야 하는데, 도메인이 풍부해질수록 같은 질문이 계속 비싸지는 이유가 바로 이것입니다. Read Model은 질문을 뒤집습니다. 질문받을 모양 그대로 답을 저장해 두면 조회는 그냥 찾아오는 일이 됩니다.

실제로 Read Model은 데이터베이스 뷰나 LINQ의 프로젝션으로 시작했다가, 뷰로는 더 이상 빠르지 않을 때 비로소 자기 테이블을 갖습니다. 어느 쪽이든 조회 쪽은 `AsNoTracking()`으로 읽고 `Select`로 곧장 DTO를 만듭니다. 그러면 Entity Framework Core는 엔터티를 만들지도, 변경 추적 스냅숏을 뜨지도, 누군가 손대고 싶어질 만한 객체를 건네주지도 않습니다. 읽기 쪽이 도메인으로 들어가는 두 번째 통로이기를 그만두고 본래의 모습, 즉 화면이 모양을 정한 납작한 행들의 집합이 되는 지점이 바로 여기입니다.

저장 방식보다 중요한 성질이 둘 있습니다. Read Model은 파생된 것이라 규칙을 강제할 자리가 아니고, 대조의 기준이 되는 원본도 아닙니다. 쓰기 쪽과 어긋나면 옳은 쪽은 언제나 쓰기 쪽입니다. 그리고 Read Model은 버려도 되는 것이라, 열을 하나 더하는 일이 백필을 동반한 스키마 마이그레이션이 아니라 모양을 바꾸고 다시 재생하는 일이 됩니다. 두 성질 모두 같은 규율에서 나옵니다. Read Model에 쓰는 것은 그것을 소유한 projection 하나뿐이어야 합니다.
