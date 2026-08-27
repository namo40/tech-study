---
title: "Aggregate"
summary: "트랜잭션 하나가 덮어도 되는 단위입니다. 명령을 받아 자기만 책임지는 규칙을 확인하고 그에 따르는 이벤트를 내놓습니다. 그래서 일관성은 그 안에서는 보장되고 밖에서는 협상됩니다."
category: "애플리케이션 아키텍처"
scene: event-sourcing
sceneStep: 1
related:
  - label: Event Sourcing
    slug: event-sourcing
  - label: Event Replay
    slug: event-replay
  - label: Snapshot
    slug: snapshot
  - label: Domain-Driven Design
    slug: domain-driven-design
  - label: CQRS
    slug: command-query-responsibility-segregation
  - label: Saga
    slug: saga
  - label: Unit of Work
    slug: unit-of-work
  - label: Optimistic Concurrency
    slug: optimistic-concurrency
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Local Transaction
    slug: local-transaction
references:
  - title: "Event Sourcing pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing
  - title: "Apply simplified CQRS and DDD patterns in a microservice"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/apply-simplified-microservice-cqrs-ddd-patterns
  - title: "Creating and configuring a model in EF Core"
    url: https://learn.microsoft.com/en-us/ef/core/modeling/
---

장면의 1단계에는 움직이는 부분이 셋 있고, 그중 무언가를 결정하는 것은 하나뿐입니다. 명령이 App에서 내려오고, Order가 그것을 살펴보고, 이벤트가 로그로 나갑니다. Order가 애그리게이트이고, 이것이 둘 사이에 앉아 있는 이유는 규칙을 책임질 누군가가 필요하기 때문입니다. "이미 결제된 주문에는 품목을 추가할 수 없다"는 주어가 있는 문장이고, 그 주어가 애그리게이트입니다.

외워 둘 만한 정의는 좁습니다. 애그리게이트는 트랜잭션 하나가 덮어도 되는 경계입니다. 그 안쪽은 명령이 돌아오는 순간 일관됩니다. 잠금 하나, 버전 확인 하나, 커밋 하나가 전체를 지키기 때문입니다. 바깥쪽은 나중에 일관되어집니다. 이벤트와 사가와 재시도와 사과를 거쳐서 그렇게 됩니다. 이 한 문장이 이런 방식으로 지은 시스템의 설계 대부분을 해내고 있습니다. "어떤 엔티티가 함께 묶이나"를 취향의 문제에서 산수의 문제로 바꿔 주기 때문입니다. 규칙 하나가 예 또는 아니오를 말하기 위해 읽어야 하는 데이터에 딱 맞춰 경계를 그으면 됩니다.

그래서 애그리게이트는 작아야 하고, 크게 만들고 싶은 본능은 대개 틀렸습니다. 큰 애그리게이트는 더 많은 불변 조건이 트랜잭션 안에 들어오니 안전해 보입니다. 그러나 그만큼 더 많은 명령이 같은 버전 번호를 두고 다투고, 가장 느린 하나 뒤로 줄이 생깁니다. 규칙이 주문 총액에 관한 것이라면 라인을 소유한 `Order`는 옳습니다. 고객과 그 주소록과 적립금까지 소유한 `Order`는 누군가 무언가를 살 때마다 그 고객을 잠그는 일입니다. 두 데이터가 같은 규칙에 함께 등장하는 일이 없다면, 명사가 아무리 자연스럽게 들려도 같은 경계에 속하지 않습니다.

애그리게이트는 이벤트를 내놓도록 허락된 유일한 존재이고, 그것이 로그를 믿을 수 있게 만듭니다. 장면에서 Order를 거치지 않고 Log에 쓰는 것은 없습니다. 다른 코드가 `ItemAdded`를 곧바로 덧붙일 수 있다면 불변 조건은 두 곳에 살게 되고 결국 한 곳에서만 지켜집니다. 그래서 모양은 늘 같습니다. 명령이 묻고, 애그리게이트가 자기 이벤트로 다시 세운 상태에 비추어 확인하고, 답이 예라면 이벤트를 일으켜 자신에게 적용한 뒤 저장소에 건넵니다. 카드 위의 상태는 그 이벤트의 결과이지 따로 대입한 값이 아닙니다.

동시성은 덧붙인 장치가 아니라 경계에서 저절로 나옵니다. 애그리게이트마다 버전이 있고, 그것은 마지막 이벤트의 순번입니다. 덧붙이기는 명령이 판단의 근거로 삼은 버전을 함께 들고 가고, 다른 누군가가 먼저 나아갔다면 저장소가 거절합니다. 추가 열 없는 낙관적 동시성이고, 확인해 주는 것이 기본 키입니다. 실패했을 때의 정직한 대응은 대개 다시 읽고 다시 판단하고 다시 시도하는 것입니다. 명령이 결과(`items를 3으로`)가 아니라 의도(`이 품목을 추가`)로 표현되어 있어서, 사람에게 묻지 않고도 더 새로운 상태에 다시 적용할 수 있기 때문입니다.

애그리게이트의 마지막 쓸모는 트랜잭션이 덮으면 안 되는 범위를 정해 주는 것입니다. 명령 하나가 두 애그리게이트의 합의를 필요로 하는 순간, 둘 위에 트랜잭션 하나를 열 수는 없고 설계가 대신 무엇을 할지 말해야 합니다. 보상으로 둘을 조율하는 사가, 잠시 뒤처져도 견디는 결과적 일관성 조회, 또는 규칙이 사실은 둘이 하나라고 알려 준 것이니 경계를 다시 긋기입니다. 그 거절이 애그리게이트의 가장 유용한 성질입니다. 잠금이 두 서비스에 걸쳐 있는 새벽 세 시가 아니라, 아직 아무것도 만들지 않은 설계 시점에 분산이라는 문제를 드러내 주기 때문입니다.
