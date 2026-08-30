---
title: "Bounded Context"
summary: "언어가 달라지는 곳에 그은 모델의 국경입니다. 안에서는 한 단어가 정확히 한 가지를 뜻하고, 밖에서는 같은 단어가 다른 사람의 모델에 속합니다."
category: "애플리케이션 아키텍처"
scene: domain-driven-design
sceneStep: 2
related:
  - label: Domain-Driven Design
    slug: domain-driven-design
  - label: Aggregate Root
    slug: aggregate-root
  - label: Anti-Corruption Layer
    slug: anti-corruption-layer
  - label: Aggregate
    slug: aggregate
  - label: Event Sourcing
    slug: event-sourcing
  - label: CQRS
    slug: command-query-responsibility-segregation
  - label: Repository
    slug: repository
  - label: Entity
    slug: entity
  - label: Value Object
    slug: value-object
  - label: Hexagonal Architecture
    slug: hexagonal-architecture
  - label: Transactional Outbox
    slug: transactional-outbox
references:
  - title: "Using domain analysis to model microservices"
    url: https://learn.microsoft.com/en-us/azure/architecture/microservices/model/domain-analysis
  - title: "Design a DDD-oriented microservice"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/ddd-oriented-microservice
  - title: "Anti-corruption Layer pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/anti-corruption-layer
---

장면의 2단계는 같은 단어를 두 번 그립니다. Sales에는 가격과 합계를 가진 Order가 있고, Shipping에는 주소와 상자 개수를 가진 Order가 있습니다. 어느 쪽도 다른 쪽의 부분집합이 아니고, 어느 쪽도 다른 쪽에 합쳐지기를 기다리고 있지 않으며, 어느 쪽도 틀리지 않았습니다. 그것이 bounded context입니다. 한 단어가 정확히 한 가지를 뜻하는 영역이고, 그 밖에서는 같은 단어가 다른 사람의 것이라는 약속이 함께 붙습니다.

국경은 언어가 달라지는 곳에 긋고, 근거가 되는 것도 언어입니다. 영업팀이 "주문"이라고 말할 때는 가격과 할인이 있고 아직 취소할 수도 있는 고객이 붙은 무언가를 뜻합니다. 창고가 "주문"이라고 말할 때는 무게와 목적지와 피킹 순서가 있는 무언가를 뜻합니다. 어느 쪽도 아직 아무도 적어 두지 않은 더 참된 Order의 부분적인 시야가 아닙니다. 둘은 같은 현실의 사건에 대한 두 모델이고, 각자 자기 주인이 답해야 하는 질문의 모양을 하고 있습니다. 그 둘을 합치려 하면 어느 쪽 질문에도 잘 답하지 못하는 객체가 나옵니다. 장면의 1단계가 바로 그 합쳐진 객체이고, 필드가 하나씩 붙어 자라다가 결국 모든 변경을 네 부서와 협상해야 하는 상태에 이릅니다.

국경이 실제로 사 주는 것은 작아질 권리입니다. 컨텍스트 안에서는 `Order.Total`이라고 쓰면서 한 가지를 뜻할 수 있고, 검증 규칙을 쓰면서 그것이 어디에 적용되는지 알 수 있고, 누구에게도 묻지 않고 필드를 지울 수 있습니다. 그 필드에 기대는 것이 전부 국경 안쪽에 함께 있기 때문입니다. 국경 밖에서는 아무도 우리 클래스를 쥐고 있지 않으니, 그들의 릴리스 일정이 우리 릴리스 일정이 되지 않습니다. 그 독립성이 모델링에 들인 수고가 돌려주는 전부이고, 국경이 기술적인 무엇이기 이전에 소유에 관한 것인 이유입니다.

국경이 무엇이 아닌지도 정확히 짚어 둘 만합니다. 배포 경계가 아닙니다. 서로의 테이블을 읽지 않는 두 컨텍스트를 가진 모듈형 모놀리스는 국경을 온전히 지키고, `Entities` 어셈블리 하나를 함께 쓰는 서비스 무리는 현대적으로 보이면서 국경을 어깁니다. 네임스페이스도 아닙니다. 아무도 강제하지 않는 네임스페이스는 선의를 가진 작명 규칙일 뿐입니다. 그리고 사람을 막는 벽도 아닌데, 팀이 이 개념에 반발하는 이유가 대개 그 오독입니다. 두 컨텍스트는 끊임없이 대화합니다. 하지 않는 것은 클래스를 공유하는 일뿐입니다.

두 컨텍스트가 만나는 곳에서는 관계를 습관에 맡기지 않고 적어 둡니다. 편안한 경우는 공개된 계약입니다. 상류 컨텍스트가 자기 언어로 이벤트를 발행하고 하류가 그것을 자기 모델로 번역하는데, 장면의 4단계가 보여 주는 것이 이 모양입니다. 불편한 경우는 우리가 통제하지 못하는 모델이 새어 들어오는 것이고, 답은 anti-corruption layer입니다. 상대의 모양을 우리 모양으로 바꾸는 것이 전부인 작은 클래스 하나를 두면, 그쪽 코드의 이름 변경이 우리 도메인의 변경이 아니라 파일 하나의 컴파일 오류가 됩니다. 둘 다 같은 지도 위에 그려지고, 컨텍스트와 그 사이의 번역으로 된 지도가 곧 아키텍처입니다. 코드는 그 아래에 있습니다.

진짜 국경을 찾았는지 확인하는 실용적인 방법은 용어집입니다. 중요한 단어 하나를 골라 비즈니스의 서로 다른 부분에 있는 두 사람에게 정의를 물어봅니다. 정의가 중요한 방식으로 다르다면 국경은 그 둘 사이를 지나고, 정직한 선택은 공유 테이블과 긴 논쟁이 아니라 각자에게 자기 모델과 번역을 주는 것입니다. 정의가 일치한다면 거기에는 컨텍스트가 하나 있는 것이고, 그 사이에 국경을 그으면 아무것도 사 주지 않는 번역 계층만 떠안게 됩니다.
