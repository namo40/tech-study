---
title: "Aggregate Root"
summary: "일관성 경계로 들어가는 단 하나의 문입니다. 모든 변경이 이 문을 지나고, 지나가는 길에 불변식이 검사되며, 바깥의 모든 것은 안쪽을 가리키는 참조가 아니라 루트의 id만 쥡니다."
category: "애플리케이션 아키텍처"
scene: domain-driven-design
sceneStep: 3
related:
  - label: Domain-Driven Design
    slug: domain-driven-design
  - label: Bounded Context
    slug: bounded-context
  - label: Aggregate
    slug: aggregate
  - label: Repository
    slug: repository
  - label: Entity
    slug: entity
  - label: Value Object
    slug: value-object
  - label: Unit of Work
    slug: unit-of-work
  - label: Optimistic Concurrency
    slug: optimistic-concurrency
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Saga
    slug: saga
  - label: Event Sourcing
    slug: event-sourcing
references:
  - title: "Designing a microservice domain model"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/microservice-domain-model
  - title: "Design a DDD-oriented microservice"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/ddd-oriented-microservice
  - title: "Creating and configuring a model in EF Core"
    url: https://learn.microsoft.com/en-us/ef/core/modeling/
---

장면의 3단계는 문 앞에 경비를 세우고 두 종류의 쓰기를 보냅니다. 하나는 Order를 통해 와서 불변식, 곧 합계와 라인의 합이 같은지 검사받고 통과합니다. 다른 하나는 라인에 곧장 닿으려 하다가 아무것도 건드리기 전에 거절당합니다. 그 거절이 aggregate root의 직무 기술서 전부입니다. 들어가는 길이 하나뿐이므로 루트가 지키는 규칙은 두 곳에서 강제될 수 없고, 따라서 둘 중 한 곳에서만 강제되는 일도 생기지 않습니다.

여기서 "루트"라는 말이 실제로 일을 합니다. 애그리게이트는 한 덩어리로 일관되어야 하는 객체들의 작은 묶음이고, 루트는 그 묶음에서 바깥이 이름을 부를 수 있는 유일한 구성원입니다. 나머지는 전부 루트를 거쳐야만 닿습니다. 불변식을 검사할 수 있게 만드는 것이 바로 이 구조입니다. 호출자가 라인을 불러와 저장할 수 있다면 "합계는 라인의 합과 같아야 한다"는 문장은 머물 곳이 없어집니다. 그것을 깨뜨릴 수 있는 코드가 그것을 아는 코드가 아니기 때문입니다. 문이 하나라는 것은 취향이 아니라 규칙을 가지기 위한 전제입니다.

루트가 소유한 규칙은 애그리게이트가 얼마나 커야 하는지도 알려 줍니다. 불변식 하나가 예 또는 아니오를 답하기 위해 읽어야 하는 데이터만 정확히 감싸고 거기서 멈춥니다. 규칙이 주문의 합계에 관한 것이라면 주문과 그 라인이 하나의 애그리게이트입니다. 누군가 고객을 넣자고 하면, 같은 트랜잭션 안에서 고객이 필요한 불변식이 무엇인지 물어보세요. 대개는 없고, 넣는다는 것은 누가 무엇을 사든 고객에 잠금을 건다는 뜻입니다. 불변식이 아예 없다면 애그리게이트도 없고, 서로 무관한 엔티티 묶음 위의 루트는 경합만 늘리고 아무것도 돌려주지 않는 의식입니다.

경계 바깥에서는 참조가 id로 이루어집니다. Sales의 Order는 `Customer`가 아니라 `CustomerId`를 쥐고, 주문 바깥의 무엇도 `OrderLine`을 쥐지 않습니다. 일주일쯤은 불편해 보이다가 그 뒤로는 값을 합니다. id는 예상 못 한 쿼리로 지연 로딩될 수 없고, 두 번째 애그리게이트를 우리 트랜잭션 안으로 끌고 들어올 수 없고, 다른 루트에 속한 것을 호출자가 바꾸게 둘 수도 없습니다. 정말로 둘 다 필요할 때는 둘 다 명시적으로 불러오게 되고, 그 비용이 코드에 그대로 보입니다.

이 규칙의 나머지 절반은 그것이 금지하는 것입니다. 트랜잭션 하나는 애그리게이트 하나를 덮습니다. 어떤 변경이 정말로 두 애그리게이트의 합의를 필요로 한다면 둘을 가로지르는 트랜잭션을 열 수 없고, 설계가 대신 무슨 일이 일어나는지 말해야 합니다. 보상이 딸린 saga이거나, 잠깐 뒤처지는 것을 견디는 최종적 일관성 읽기이거나, 사실은 둘이 하나였다는 뜻이므로 경계를 다시 긋는 것입니다. 그 거절이 이 패턴이 하는 가장 쓸모 있는 일입니다. 아직 상자를 그리는 동안에 분산 문제를 눈에 보이게 만들어 주기 때문입니다.

이웃한 aggregate 페이지는 같은 객체를 이벤트 소싱의 시선으로 봅니다. 거기서 흥미로운 질문은 command가 어떻게 이벤트가 되고 로그가 어떻게 상태가 되는가입니다. 여기서의 질문은 더 좁고 더 오래된 것입니다. 경계는 어디에 두는가, 누가 문을 두드릴 수 있는가, 문이 닫힐 때 언제나 참인 것은 무엇인가입니다. 동시성도 나중에 덧붙이는 것이 아니라 같은 경계에서 따라 나옵니다. 애그리게이트가 버전 번호가 속하는 단위이기 때문입니다. 쓰기는 자신이 판단의 근거로 삼은 버전을 함께 들고 가고, 다른 누군가가 먼저 움직였다면 저장소가 그것을 거절하며, 정직한 대응은 다시 읽고 다시 판단해서 다시 시도하는 것입니다.
