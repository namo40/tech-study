---
title: "API Gateway"
summary: "API 게이트웨이는 제품의 관심사까지 맡게 된 리버스 프록시입니다. 단일 진입점이라는 자리는 그대로인 채, 토큰 없는 요청을 거절하고 한도를 넘는 트래픽을 잘라 내고 여러 서비스를 하나의 API 표면으로 조합하는 일까지 함께 합니다."
category: "엣지, 라우팅과 서비스 네트워크"
scene: reverse-proxy
sceneStep: 4
related:
  - label: Reverse Proxy
    slug: reverse-proxy
  - label: YARP
    slug: yarp
  - label: Load Balancer
    slug: load-balancer
  - label: Facade
    slug: facade
  - label: Strangler Fig
    slug: strangler-fig
  - label: CORS
    slug: cors
  - label: Sticky Session
    slug: sticky-session
  - label: Health-Based Routing
    slug: health-based-routing
  - label: Round Robin
    slug: round-robin
  - label: Least Connections
    slug: least-connections
references:
  - title: "YARP: Getting started"
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/yarp/getting-started?view=aspnetcore-10.0
  - title: Configure ASP.NET Core to work with proxy servers and load balancers
    url: https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/proxy-load-balancer?view=aspnetcore-10.0
  - title: "X-Forwarded-For"
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Forwarded-For
---

장면의 마지막 단계를 보면서 무엇이 움직이지 않는지를 눈여겨봅니다. 자리는 같은 곳에 있고, 레인은 같은 서비스로 이어지고, 왕복은 첫 단계의 그 왕복입니다. 달라진 것은 문 앞에서 던지는 질문의 개수입니다. 이 호출자에게 토큰이 있는가, 지금 요청 하나를 더 받을 자리가 있는가, 이 경로는 존재하기는 하는가. 차이는 이것이 전부입니다. API 게이트웨이는 리버스 프록시와 다른 부품이 아니라, 네트워크가 아니라 제품에 속하는 일을 떠맡은 리버스 프록시입니다.

이 구분을 지킬 가치가 있는 이유는 두 종류의 일이 서로 다르게 실패하기 때문입니다. TLS를 종료하고, 건강한 목적지를 고르고, 경로를 고쳐 쓰고, 헤더를 전달하는 결정은 우리 업무를 하나도 몰라도 프록시가 올바르게 내릴 수 있습니다. 이 토큰이 이 리소스에 대한 접근을 허락하는지, 이 고객의 요금제가 분당 60건을 허용하는지, 모바일 클라이언트에게는 응답을 줄여서 줘야 하는지는 모두 우리 도메인만 아는 답입니다. 이런 일을 엣지로 옮기면 제품이 바뀔 때마다 엣지를 배포해야 하고, 그것이야말로 단일 진입점이 피하려던 결합입니다.

그렇다고 하지 말라는 이야기는 아닙니다. 어떤 관심사는 진짜로 문 앞에 속하고, 인증이 가장 분명한 경우입니다. 토큰의 서명과 만료와 발급자를 엣지에서 한 번 검증해 두면 뒤의 모든 서비스는 건네받은 신원을 믿어도 되고, 자격 증명 없는 요청은 그것에 속을 수 있는 어떤 것에도 닿지 않습니다. 두 번째로 분명한 경우는 속도 제한입니다. 한도는 모든 트래픽이 모이는 자리에 걸어야만 의미가 있기 때문입니다. 서비스마다 따로 건 한도는 폭주를 세 배로 통과시킵니다. 둘 다 서비스마다 최신으로 유지해야 하는 라이브러리보다 앞단의 규칙 하나로 두는 편이 싸고 안전합니다.

야심을 부리는 대목이자 어긋나기 쉬운 대목은 조합입니다. 매력은 분명합니다. 클라이언트가 부르는 엔드포인트는 하나, 게이트웨이가 부르는 서비스는 여럿, 조각을 모아 만든 응답은 하나, 그래서 모바일 클라이언트는 다섯 번이 아니라 한 번만 왕복합니다. 문제는 그 조립 코드가 이제 자기가 건드리는 모든 서비스의 모양을 안다는 데 있습니다. 어느 한쪽에서 필드 이름을 바꾸면 아무도 예상하지 못한 배포가 깨지고, 게이트웨이는 서비스를 쪼개서 피하려던 분산 모놀리스로 서서히 자랍니다. 흔한 규율은 조합을 얕게, 읽기 전용으로 유지하고, 정말로 다른 요구를 가진 클라이언트에게는 공용 게이트웨이에 가지를 하나 더 다는 대신 작은 게이트웨이를 따로 주는 것입니다.

실패하는 방식은 기능이 아니라 자리에서 나옵니다. 모든 것이 이곳을 지나므로 이곳의 지연은 모든 요청의 지연이고 이곳의 장애는 모두의 장애입니다. 하나보다 많이 돌리고, 설정 리로드를 요행이 아니라 연습된 작업으로 만들어 둡니다. 인가 규칙은 그것이 지키는 서비스 바깥에 살기 때문에, 내부 주소로도 닿을 수 있는 서비스는 아무것에도 지켜지지 않습니다. 장면에서 백엔드에 `private` 배지가 붙어 있는 이유이자 그 배지가 다른 어느 단계보다 이 단계에서 더 중요한 이유입니다. 그리고 게이트웨이는 본디 책임이 쌓이는 곳이므로, 어느 서비스도 테스트할 수 없는 자리에 규칙이 계속 쌓이고, 결국 요청이 받아들여질지 알아보는 방법은 하나를 보내 보는 것뿐이게 됩니다.

그러니 이 이름은 내려야 할 결정이 아니라 짊어진 짐에 대한 설명으로 다루면 됩니다. 프로젝트를 시작하면서 리버스 프록시와 API 게이트웨이 중에 고르는 것이 아닙니다. 주소가 하나 필요해서 앞자리를 두고, 그다음에 하나씩, 다음 질문이 정말 문 앞에 속하는지 아니면 제대로 답할 수 있는 서비스에 속하는지를 정해 갑니다. 정직하게 따져서 답이 문 앞이면 거기에 두고 그 이유를 적어 둡니다. 답이 그렇지 않다면 이 자리는 원래의 그 자리로 남고, 그것은 놓친 기회가 아니라 좋은 결과입니다.
