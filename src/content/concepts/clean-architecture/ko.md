---
title: "Clean Architecture"
summary: "클린 아키텍처는 같은 규칙을 동심원으로 그립니다. 가운데에 엔티티가 있고 그 둘레에 유스 케이스가 있으며 바깥에 어댑터와 프레임워크가 있고, 소스 코드의 의존은 언제나 중심을 향합니다. 헥사고날과 어니언은 그림만 다른 같은 규칙입니다."
category: "애플리케이션 아키텍처"
scene: hexagonal-architecture
sceneStep: 4
related:
  - label: Hexagonal Architecture
    slug: hexagonal-architecture
  - label: Onion Architecture
    slug: onion-architecture
  - label: Domain-Driven Design
    slug: domain-driven-design
  - label: Adapter
    slug: adapter
  - label: Dependency Injection
    slug: dependency-injection
  - label: Entity
    slug: entity
  - label: Value Object
    slug: value-object
  - label: Repository
    slug: repository
references:
  - title: "The Clean Architecture"
    url: https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html
  - title: "Common web application architectures"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures
  - title: "Architectural principles"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/architectural-principles
  - title: "Hexagonal architecture"
    url: https://alistair.cockburn.us/hexagonal-architecture/
---

클린 아키텍처는 계층을 고리로 그린 그림입니다. 가운데에 엔티티가 앉아, 소프트웨어가 없었더라도 비즈니스에서 참이었을 규칙을 쥡니다. 그 둘레에 유스 케이스가 앉아, 애플리케이션이 하는 특정한 일 하나를 위해 그 규칙들을 조율합니다. 그 둘레에는 바깥 세상을 유스 케이스가 받아들이는 모양으로 바꾸는 인터페이스 어댑터가 있고, 모든 것의 바깥에는 프레임워크와 드라이버와 전달 수단의 고리가 있습니다. 이 그림에 붙은 규칙 하나는 소스 코드의 의존이 어느 쪽을 가리켜도 되는가에 관한 것입니다. 언제나 안쪽이고 결코 바깥쪽이 아니며, 실행 시점의 제어 흐름이 반대로 간다는 사실은 상관이 없습니다.

바로 그 마지막 부분이 고리가 존재하는 진짜 이유입니다. 유스 케이스는 데이터베이스가 무언가를 쓰게 만들어야 하므로 제어는 분명히 가운데에서 바깥으로 흐릅니다. 하지만 참조는 그렇지 않습니다. 유스 케이스는 자신이 소유한 인터페이스를 호출하고, 바깥 고리의 무언가가 그것을 구현하기 때문입니다. 그 의존 하나를 뒤집는 것이 요령의 전부이고, 실제로 일을 하는 것이 구체적인 물건들인데도 그림이 그것들을 바깥에 그리는 이유입니다. 가운데에서 바깥 고리의 무언가를 이름으로 부르는 `using` 문을 하나라도 짚을 수 있다면, 그 그림은 장식입니다.

이것은 방금 본 장면과 같은 규칙을 다른 다이어그램 문법으로 적은 것입니다. 육각형이 모서리에 소켓을 그려 포트라고 부르는 자리에서, 동심원은 두 원 사이에 경계를 그려 인터페이스라고 부릅니다. 어니언은 핵심 둘레에 층을 그려 놓고 그것을 또 같은 이름으로 부릅니다. 셋 다 가운데가 바깥 이름을 모른다고 못 박고, 셋 다 바깥이 가운데가 선언한 계약을 구현하게 하며, 셋 다 같은 방식으로 확인됩니다. 프로젝트 참조를 열어서 반대 방향을 가리키는 것이 있는지 보면 됩니다. 팀들은 어느 그림을 그릴지를 두고 놀랄 만큼 많은 시간을 썼고, 그 논쟁 가운데 규칙에 관한 것은 거의 없었습니다.

그림들이 갈리는 지점은 어휘와 고리를 몇 개로 제안하는가입니다. 클린 아키텍처는 넷을 이름 붙이면서 그 개수가 신성한 것은 아니라고 분명히 말하고, 헥사고날은 아예 이름을 붙이지 않고 경계에만 관심을 둡니다. 어니언은 보통 셋이나 넷으로 그려집니다. 어휘의 차이는 보이는 것보다 중요합니다. "유스 케이스"는 연산 하나를 조율하는 클래스에 붙이기에 정말 쓸모 있는 이름이고, "엔티티"는 불변식이 어디에 사는가에 대한 전통 하나를 통째로 끌고 옵니다. 쓸모 있다고 느끼는 이름은 가져다 쓰고, 고리 개수는 명세로 취급하지 않습니다.

실패하는 방식도 공유되며, 셋 가운데 무엇을 채택하든 그전에 알아 둘 만합니다. 고리가 경계가 아니라 폴더가 되어, 어셈블리 넷과 양방향으로 얽힌 참조 그래프만 남습니다. "편의를 위해" 인터페이스를 바깥 고리에 선언하고, 역전은 조용히 사라집니다. 고리마다 자기 모델을 갖게 되어 코드베이스의 절반이 지켜 낼 규칙도 없는 매핑 코드가 됩니다. 그리고 규칙이 아예 없는 서비스에 이 형태가 적용되어, 보호 대신 형식적인 절차만 얻게 됩니다. 팀이 가장 쉽게 읽는 그림을 고르고, 방향을 지키고, 논쟁은 중요한 곳에 씁니다.
