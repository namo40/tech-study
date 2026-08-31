---
title: "Adapter"
summary: "어댑터는 포트와 세상 사이에 앉은 번역기입니다. 한쪽 면은 HTTP나 SQL이나 벤더 SDK를 말하고 다른 면은 도메인이 소유한 계약만 말합니다. 하나를 빼고 다른 하나를 꽂을 수 있다는 사실이 그 뒤의 모든 것을 세부 사항으로 만듭니다."
category: "애플리케이션 아키텍처"
scene: hexagonal-architecture
sceneStep: 3
related:
  - label: Hexagonal Architecture
    slug: hexagonal-architecture
  - label: Repository
    slug: repository
  - label: Anti-Corruption Layer
    slug: anti-corruption-layer
  - label: Facade
    slug: facade
  - label: Clean Architecture
    slug: clean-architecture
  - label: Dependency Injection
    slug: dependency-injection
  - label: Domain-Driven Design
    slug: domain-driven-design
references:
  - title: "Hexagonal architecture"
    url: https://alistair.cockburn.us/hexagonal-architecture/
  - title: "Common web application architectures"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures
  - title: "Architectural principles"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/architectural-principles
---

어댑터에는 면이 정확히 둘 있고 셋째 면은 없습니다. 바깥쪽 면으로는 올해의 세상이 말하는 것을 그대로 말합니다. HTTP 요청 본문, SQL 문장, 브로커에서 온 메시지, 오류가 무엇인지에 대해 자기만의 생각을 가진 벤더 SDK 같은 것들입니다. 안쪽 면으로는 포트를 말합니다. 포트는 도메인이 자기 언어로 적어 둔 인터페이스입니다. 이 클래스의 일 전부는 한쪽을 다른 쪽으로 바꾸는 것이고, 여기에 이름을 붙일 값어치가 있는 이유는 그 변환이 어딘가에서는 반드시 일어나야 하는데 놓을 만한 다른 자리가 전부 더 나쁘기 때문입니다.

방향이 둘 있고 헷갈리기 쉽습니다. 구동하는 어댑터는 바깥에서 애플리케이션에게 무언가를 해 달라고 요청합니다. POST를 커맨드로 바꾸는 컨트롤러, 같은 커맨드로 바꾸는 큐 컨슈머, 타이머로 그것을 일으키는 스케줄러가 그렇습니다. 구동되는 어댑터는 안쪽에서 요청을 받습니다. 도메인이 선언한 저장소를 구현하는 클래스, 도메인이 보내 달라고 한 메일을 실제로 보내는 클라이언트가 그렇습니다. 구동하는 어댑터는 포트를 호출하고, 구동되는 어댑터는 포트를 구현합니다. 장면에서 위쪽 플레이트가 구동하는 쪽이고 아래쪽 플레이트가 구동되는 쪽이며, 교체가 아래쪽에서 일어나는 이유는 그쪽이 도메인이 들여다보지 않는 면이기 때문입니다.

교체 가능하다는 것은 어댑터의 좋은 성질이 아니라 어댑터의 정의입니다. 포트 뒤의 클래스를 다른 클래스로 바꿔도 도메인이 관찰할 수 있는 것이 하나도 달라지지 않는다면, 그 클래스가 알던 것은 전부 세부 사항이었습니다. 스토리지 엔진도, 와이어 포맷도, 재시도 정책도, 접속 문자열도 그렇습니다. 바꿨더니 도메인의 테스트가 깨진다면 무언가가 샌 것이고, 새는 곳은 거의 언제나 어댑터가 아니라 포트입니다. `IQueryable`을 돌려주거나 프로바이더 예외를 그대로 넘기거나 지연 로딩되는 객체 그래프를 노출하는 포트는 어댑터의 내부를 인터페이스 이름으로 공개한 것이고, 구현 안에서 아무리 조심해도 그것을 되돌리지는 못합니다.

얇게 유지하고, 지루함을 의도적으로 지킵니다. 기준은 그 어댑터를 단위 테스트하고 싶어지는지입니다. 그렇다면 판단이 자란 것이고, 그 판단은 이제 스위트 안의 모든 빠른 테스트에게 보이지 않습니다. 빠른 테스트는 가짜를 상대로 돌기 때문입니다. 매핑과 번역, 전송 관련 처리, 오류 변환은 여기에 속합니다. 주문을 언제 취소할 수 있는지에 대한 규칙은 아닙니다. 마침 데이터를 눈앞에 두고 있는 클래스가 이것이라서 여기에 넣는 편이 몹시 편할 때조차 그렇습니다.

비용은 실재하고 소리 내어 말할 값어치가 있습니다. 어댑터 하나하나가 데이터를 선 너머로 옮기려고만 존재하는 클래스이고, 거기에 방향마다 매핑이 붙고, 테스트용 가짜가 하나 더 붙습니다. 지켜 낼 규칙이 있는 시스템에서 이것은 안쪽을 건드리지 않고 바깥을 바꿀 수 있는 능력의 대가로는 싼 편입니다. 행을 읽고 쓰기만 하는 시스템에서 이것은 다이어그램이 딸린 순수한 부담이고, 정직한 선택은 건너뛰고 프레임워크를 직접 호출하는 것입니다. 가치는 어댑터를 가지는 데 있지 않고, 어댑터가 안쪽으로 향하게 해 주는 그 화살표에 있습니다.
