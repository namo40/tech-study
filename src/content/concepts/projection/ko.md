---
title: "Projection"
summary: "Projection은 쓰기 쪽의 변경을 하나씩 받아 read model을 최신 상태로 유지하는 코드입니다. 쓰기보다 뒤에서 돌기 때문에 지연이 생기고, 아무것도 없는 상태에서 다시 재생할 수 있어야 합니다."
category: "애플리케이션 아키텍처"
scene: command-query-responsibility-segregation
sceneStep: 3
related:
  - label: CQRS
    slug: command-query-responsibility-segregation
  - label: Read Model
    slug: read-model
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Transactional Outbox
    slug: transactional-outbox
  - label: Change Data Capture
    slug: change-data-capture
  - label: Event Sourcing
    slug: event-sourcing
  - label: Replication Lag
    slug: replication-lag
  - label: BackgroundService
    slug: background-service
references:
  - title: CQRS pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs
  - title: Transactional Outbox pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/transactional-outbox
  - title: Worker services in .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/workers
---

Projection은 쓰기 쪽이 한 일을 읽어서, 그에 관한 질문에 답할 read model을 씁니다. 입력은 순서가 있는 변경의 흐름입니다. 업무 데이터와 같은 트랜잭션에서 기록된 outbox 테이블의 행일 수도 있고, 데이터베이스 자체가 내보내는 변경 피드일 수도 있으며, 쓰기 쪽이 Event Sourcing이라면 이벤트 스트림일 수도 있습니다. 출력은 read model 한 곳의 한 행을 갱신하는 일입니다. 그 read model에 쓰는 것은 이것 말고는 없고, 그래서 언제든 지워도 안전합니다.

쓰기가 끝난 시점과 projection이 따라잡은 시점 사이의 간격이 지연(lag)이고, 계측해야 할 숫자가 바로 이것입니다. 방금 적용한 변경이 얼마나 오래된 것인지를 내보내고 거기에 경보를 걸어 두십시오. 그리고 화면을 그 간격에 맞춰 설계하십시오. 쓰기 직후에는 조회 쪽에 다시 물으러 가지 말고 Command가 이미 돌려준 결과를 보여 주거나, 방금 쓴 버전이 나타날 때까지 폴링하면 됩니다. Projection이 조금 뒤에서 도는 것은 정상입니다. 지연이 계속 올라가기만 하고 내려오지 않는다면 프로젝터가 멈췄거나 쓰기 속도를 따라가지 못하는 것이고, 둘 중 어느 쪽인지는 지표만이 알려 줍니다.

Projection을 오래 끌고 가려면 두 가지 성질이 필요합니다. 하나는 같은 변경을 두 번 적용해도 안전해야 한다는 것(`idempotent`)입니다. 전달은 최소 한 번이고 재생은 모든 것을 다시 훑기 때문입니다. 갱신 대상 행과 옮겨 갈 버전을 함께 키로 잡아 두면, 두 번째 적용은 합계를 두 번 더하는 호출이 아니라 반복해도 결과가 같은 호출이 됩니다. 다른 하나는 빈 상태에서 재생할 수 있어야 한다는 것입니다. read model의 모양을 바꿀 수 있게 해 주는 것이 바로 이 성질이기 때문입니다. 테이블을 비우고 첫 변경부터 프로젝터를 돌리면 새 모양이 채워집니다. 그 일을 그대로 해 주는 명령을 프로젝터에 만들어 두고 시험도 해 두십시오. 그것이 필요해지는 날은 이미 운영에서 모양이 틀어져 있는 날입니다.
