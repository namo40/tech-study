---
title: "Snapshot"
summary: "어느 순번 시점의 상태를 저장해 둔 사본입니다. 재구성이 거기서 출발해 그 뒤의 것만 재생하도록 두는 것이며, 로그 위의 캐시일 뿐 두 번째 진실이 아니고, 언제든 지우고 다시 만들 수 있습니다."
category: "애플리케이션 아키텍처"
scene: event-sourcing
sceneStep: 3
related:
  - label: Event Sourcing
    slug: event-sourcing
  - label: Event Replay
    slug: event-replay
  - label: Aggregate
    slug: aggregate
  - label: Materialized View
    slug: materialized-view
  - label: Projection
    slug: projection
  - label: Cache-Aside
    slug: cache-aside
  - label: Cache Invalidation
    slug: cache-invalidation
  - label: CQRS
    slug: command-query-responsibility-segregation
  - label: Row Version
    slug: row-version
  - label: Eventual Consistency
    slug: eventual-consistency
references:
  - title: "Event Sourcing pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing
  - title: "Creating and configuring a model in EF Core"
    url: https://learn.microsoft.com/en-us/ef/core/modeling/
  - title: "How to serialize and deserialize JSON in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/how-to
---

장면의 3단계는 인정입니다. 재생은 되고, 재생은 느려집니다. 이벤트 5개는 아무것도 아니지만 5천 개는 화면 하나에 1초가 걸리는 일이고, 정직한 해법은 로그를 줄이는 것이 아닙니다. 지금까지의 답을 적어 두는 것입니다. `snap @ 5`는 다섯 번째 이벤트 시점의 주문 상태이고 로그 옆에 저장됩니다. 그 뒤의 재구성은 거기서 출발해 이후에 온 것만 재생합니다. 장면에서는 여섯 행이 아니라 한 행이므로 재구성은 한 박자에 끝나고, 읽지 않아도 되었던 다섯 행이 건너뛴 일감으로 그려집니다.

중요한 낱말은 "파생"입니다. 스냅샷에는 로그에 이미 들어 있지 않은 정보가 하나도 없습니다. 누군가 미리 해 둔 산수일 뿐입니다. 이 하나의 성질이 스냅샷을 어떻게 다뤄야 하는지를 전부 정합니다. 이관할 필요가 없습니다. 버리고 로그에서 다시 만들면 되기 때문입니다. 따로 백업할 필요도 없습니다. 무슨 일이 있었는지를 스냅샷에 물어보는 일도 없습니다. 그리고 이벤트를 접는 코드가 바뀌면 옛 코드가 찍어 둔 스냅샷은 전부 틀린 것이 되고 폐기해야 합니다. 괜찮습니다. 폐기는 삭제와 재생성이지 데이터 유실 사고가 아니기 때문입니다.

스트림과 버전을 키로 저장하고, 두 번째 의미의 버전도 함께 둡니다. 한 행에 직렬화된 상태와 그것이 덮는 순번, 그리고 상태 모양의 스키마 버전을 담습니다. 적재 경로는 원하는 버전 이하의 가장 최신 스냅샷을 가져와 거기서부터 앞으로 재생합니다. Aggregate의 필드를 바꿀 때는 상태 스키마 버전을 올리고, 옛 버전으로 쓰인 스냅샷은 적재기가 무시하게 두면 됩니다. 적재기가 안전하게 읽을 수 없는 스냅샷은 오류가 아니라 캐시 미스입니다.

얼마나 자주 찍을지는 처리량 문제이고 답은 시시합니다. 달력이 아니라 재생 시간을 잽니다. 보통은 이벤트 N개마다이고, 최악의 재구성이 커맨드 경로가 감당할 수 있는 시간 안에 들어오도록 N을 고릅니다. N이 커도 괜찮습니다. 이벤트마다 찍는 것은 손이 더 가는 현재 상태 테이블이고 로그를 둔 이유를 없앱니다. 화면이 느리다는 말이 나올 때만 찍는 것은 예정에 없던 부하 테스트입니다. 임계치를 넘긴 스트림을 훑는 백그라운드 작업자에서 비동기로 찍으면 비용이 쓰기 경로에서 완전히 빠지고, 대개의 시스템이 여기에 자리를 잡습니다.

경계해야 할 고장은 값이 아니라 지위가 표류하는 것입니다. 스냅샷은 누군가 그것을 상태로 취급하는 순간 잘못됩니다. 편하다는 이유로 스냅샷 테이블을 읽는 조회, 더 작다는 이유로 스냅샷으로 만든 보고서, 보정 이벤트를 덧붙이는 대신 스냅샷을 고치는 정비 작업 같은 것입니다. 하나하나가 캐시를 조용히 기록으로 승격시키고, 그때부터 시스템에는 답이 둘이 되며 어느 쪽이 오래되었는지 가릴 방법이 없어집니다. 시험은 장면이 매 단계 되풀이하는 바로 그것입니다. 데이터베이스의 스냅샷을 전부 지워도 모든 것이 여전히 정확히 참이어야 하고, 다만 느려질 뿐이어야 합니다. 그렇지 않다면 그것은 스냅샷이 아닙니다.

스냅샷이 고쳐 주지 않는 것도 함께 봐 두어야 합니다. 재구성 시간은 묶어 주지만, 디스크 위 로그 크기에 대해서는 아무것도 하지 않습니다. 어차피 스트림 전체를 읽어야 하는 projection 재구성 비용도, 이벤트 버전 관리도 마찬가지입니다. 각각에는 보관 이관, 구독자 체크포인트, 업캐스터가 필요합니다. 스냅샷은 딱 한 질문(aggregate를 메모리로 되돌리는 데 얼마나 걸리는가)에 대한 작고 싸고 지워도 되는 답이고, 나머지 질문에 답하라고 요구받지 않을 때 가장 좋습니다.
