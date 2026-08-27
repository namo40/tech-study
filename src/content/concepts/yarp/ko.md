---
title: "YARP"
summary: "YARP는 ASP.NET Core 애플리케이션 안에서 호스팅하는 리버스 프록시입니다. 장면의 현관이 라우트와 클러스터를 적은 설정 파일 하나와 시작 코드 두 줄이 되고, 나머지는 평소에 쓰던 미들웨어 파이프라인 그대로 남습니다."
category: "엣지, 라우팅과 서비스 네트워크"
scene: reverse-proxy
sceneStep: 1
related:
  - label: Reverse Proxy
    slug: reverse-proxy
  - label: API Gateway
    slug: api-gateway
  - label: Load Balancer
    slug: load-balancer
  - label: Health-Based Routing
    slug: health-based-routing
  - label: Least Connections
    slug: least-connections
  - label: Round Robin
    slug: round-robin
  - label: Sticky Session
    slug: sticky-session
  - label: Strangler Fig
    slug: strangler-fig
  - label: Facade
    slug: facade
  - label: CORS
    slug: cors
references:
  - title: "YARP: Getting started"
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/yarp/getting-started?view=aspnetcore-10.0
  - title: Configure ASP.NET Core to work with proxy servers and load balancers
    url: https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/proxy-load-balancer?view=aspnetcore-10.0
  - title: "X-Forwarded-For"
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Forwarded-For
---

장면의 첫 단계는 두 줄이 적힌 카드 한 장이고, YARP는 그 카드를 실제로 만든 것입니다. 서비스 컬렉션에 `AddReverseProxy().LoadFromConfig(...)`를 넣고, 파이프라인에 `MapReverseProxy()`를 넣고, 사전 둘이 담긴 설정 구역을 넘겨 주면 됩니다. 라우트는 들어온 요청이 어떤 모양이어야 하는지와 어느 클러스터가 답할지를 적고, 클러스터는 그 이름 뒤에 어떤 주소들이 있으며 그중에서 어떻게 고를지를 적습니다. 세 번째 개념은 없고, 이 한 쌍만 보고 나면 장면 전체가 설정 파일 하나로 읽힙니다.

이것이 앞선 프록시들과 다른 점은 어디에서 도느냐에 있습니다. Nginx와 HAProxy는 자기만의 설정 언어와 리로드 방식과 요청 개념을 가진 별도 프로세스입니다. YARP는 이미 여러분 것인 애플리케이션 안의 NuGet 패키지이고, 그래서 현관을 뒤편과 같은 도구로 짓게 됩니다. 인증은 ASP.NET Core 인증 그대로 돌고, 라우트에 붙인 `RequireAuthorization`은 다른 데서와 같은 뜻이며, 로깅 공급자와 원격 측정은 이미 연결되어 있고, 설정으로 적기에는 너무 특수한 규칙은 그냥 여러분이 C#으로 쓰는 `RequestTransform`이 됩니다. 프록시는 누군가 따로 설정해 주는 인프라이기를 그만두고 코드베이스의 일부가 됩니다.

그 대가는 인프로세스 프록시가 늘 치르는 대가와 같습니다. .NET 애플리케이션이므로 기동 시간과 가비지 컬렉터와 메모리 사용량이 있고, 시스템의 모든 요청이 지나는 뜨거운 경로에서 일을 합니다. 라우팅이 흥미롭고 트래픽이 평범할 때는 괜찮은 맞바꿈이지만, 라우팅이 시시하고 트래픽이 어마어마할 때는 나쁜 맞바꿈입니다. 필요한 것이 "TLS를 끝내고 전부 한곳으로 보내기"뿐이라면 C로 쓰인 무언가가 훨씬 적은 장치로 해냅니다. YARP는 문 앞의 결정이 어차피 코드로 써야 했을 종류일 때 값을 합니다.

설정은 `IConfiguration`이 오는 어느 곳에서든 올 수 있고, 이 점은 들리는 것보다 중요합니다. `LoadFromConfig`는 구역에 바인딩하므로 `appsettings.json`이나 그 뒤의 공급자가 바뀌면 재시작 없이 반영됩니다. 이미 열린 연결은 빠져나가고 새 요청부터 새 표를 씁니다. 덕분에 네 번째 단계의 스트랭글러식 이전이 이론이 아니라 실무가 됩니다. 경로 하나를 옛 클러스터에서 새 클러스터로 옮기는 일이 배포가 아니라 설정 변경이기 때문입니다. 표가 데이터베이스나 제어 평면에서 와야 한다면 `LoadFromMemory`와 `IProxyConfigProvider` 인터페이스로 직접 공급할 수 있고, 리로드 계약은 그대로입니다.

장면의 세 번째 단계에 나오는 목적지 헬스는 여러분이 쓰는 코드가 아니라 클러스터 설정입니다. 능동 헬스 체크는 부를 경로와 부르는 간격을 YARP에게 주고, 실패한 목적지는 다시 통과할 때까지 집합에서 빠집니다. 수동 체크는 대신 실제 트래픽을 지켜보다가 응답 실패가 충분히 쌓이면 목적지를 빼냅니다. 능동 체크는 목적지마다 간격마다 요청 하나를 쓰는 대신 사용자가 발견하기 전에 장애를 알려 줍니다. 수동 체크는 비용이 들지 않는 대신 누군가 이미 나쁜 경험을 한 뒤에야 알아챕니다. 대부분의 시스템은 장면 속 그 구간이 짧게 유지될 만큼 촘촘한 간격의 능동 체크를 원하고, 이것은 다른 데서와 같은 이야기입니다. 간격도 공짜가 아니고 지연도 공짜가 아닙니다.

일찍 들여 둘 만한 습관이 하나 있는데, 장면이 보여 줄 수 없는 유일한 것이기도 합니다. 프록시는 백엔드에 자기 요청을 새로 만들어 보내므로, 백엔드가 연결에서 알아내던 것은 이제 전부 프록시에 대한 정보입니다. 원격 주소도, 스킴도, 포트도 그렇습니다. YARP는 원래 값을 `X-Forwarded-*` 헤더로 전달하지만, 백엔드에게 그것을 믿으라고, 그리고 어느 프록시가 그렇게 말할 자격이 있는지를 알려 주어야 합니다. `KnownNetworks`나 `KnownProxies`를 설정한 `UseForwardedHeaders`를 인증보다, 그리고 리다이렉트하는 어떤 것보다 앞에 두면 됩니다. 빠뜨리면 증상은 뻔하지 않고 기묘합니다. 모든 클라이언트가 한 주소에서 온 것처럼 보이고, 속도 제한은 호출자 대신 프록시를 상대로 걸리며, 서비스는 요청이 평문 HTTP로 왔다고 확신하기 때문에 HTTPS 리다이렉트가 끝없이 돕니다.
