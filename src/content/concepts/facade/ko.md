---
title: "Facade"
summary: "facade는 마이그레이션이 옛 시스템 앞에 세우는 하나뿐인 정문입니다. 요청을 실제로 누가 처리하느냐가 호출자에게 보이는 변경이 아니라 라우팅 결정이 됩니다."
category: "애플리케이션 아키텍처"
scene: strangler-fig
sceneStep: 1
related:
  - label: Strangler Fig
    slug: strangler-fig
  - label: Anti-Corruption Layer
    slug: anti-corruption-layer
  - label: Reverse Proxy
    slug: reverse-proxy
  - label: YARP
    slug: yarp
  - label: API Gateway
    slug: api-gateway
  - label: Adapter
    slug: adapter
  - label: Endpoint Routing
    slug: endpoint-routing
references:
  - title: Strangler Fig pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/strangler-fig
  - title: Gateway Routing pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/gateway-routing
  - title: YARP configuration files
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/yarp/config-files
---

여기서 말하는 facade는 Gang of Four의 것이 아니라 마이그레이션에서 쓰는 말입니다. 하위 시스템을 더 단순한 인터페이스 뒤에 감싸는 객체가 아니라, 시스템 전체 앞에 놓인 라우팅 계층입니다. 들어가는 날 facade는 아무 일도 하지 않습니다. 모든 경로가 여전히 옛 시스템을 가리키고, 응답은 바이트 단위로 이전과 같으며, 호출자에게 알릴 것도 없습니다. 그것이 핵심입니다. 마이그레이션의 첫걸음은 화요일 오후에 배포하고 1분 만에 되돌릴 수 있는 종류여야 합니다. 그 뒤의 모든 것이 facade가 지루하다는 사실 위에 서 있기 때문입니다. 대신 얻는 것은 이음매입니다. 모든 요청이 한 곳으로 들어오면 "이건 어느 시스템이 답하지?"라는 질문의 답이 설정에 적히고, 설정은 무엇보다 바꾸기 싼 것입니다.

지켜야 할 규율은 facade가 경로만 정하고 그 밖의 일은 하지 않는다는 것입니다. 새 시스템에 아직 없는 필드 하나, 옛 시스템에 필요한 재시도, 끝내 갱신되지 않은 클라이언트 하나를 위한 헤더 치환을 facade에 두고 싶은 마음이 아주 큽니다. 하나하나는 작지만, 그것들이 모이면 라우팅 계층은 자기 배포 위험과 자기 버그를 가진, 그러나 주인은 없는 두 번째 시스템이 됩니다. 비즈니스 로직처럼 생긴 것은 모두 facade 뒤, 그 기능을 소유한 시스템에 있어야 합니다. 두 시스템이 정말로 모델에 대해 다른 말을 한다면 그것은 번역이고, 번역은 정문이 아니라 새 시스템 쪽의 anti-corruption layer가 맡습니다.

facade는 요청이 어디로 가는지 정하므로, 마이그레이션이 진행되는 모습을 볼 수 있는 유일한 자리이기도 합니다. 옮긴 경로는 옛 경로를 끌 때까지 양쪽 모두를 계측해야 합니다. 경로별, 대상별 요청 수와 오류율과 지연을 보면 "새 customers 코드가 더 느리다"를 사용자에게 듣는 대신 그래프에서 읽게 됩니다. 그리고 라우팅 표는 읽을 수 있을 만큼 작게 유지합니다. 기능마다 한 줄인 표는 마이그레이션이 어디까지 왔는지 한눈에 알려 주지만, 규칙이 400개인 표는 아무것도 알려 주지 않습니다. 그리고 그것은 facade가 자기가 대체하려던 바로 그것이 되어 가고 있다는 첫 신호입니다.
