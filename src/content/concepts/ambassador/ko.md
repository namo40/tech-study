---
title: "Ambassador"
summary: "ambassador는 바깥을 향한 사이드카입니다. 앱은 localhost의 포트 하나를 부르며 그 서비스와 이야기한다고 믿고, 옆의 컨테이너가 탐색과 재시도, 타임아웃과 페일오버를 대신 처리한 뒤 깨끗한 답 하나를 돌려줍니다."
category: "애플리케이션 아키텍처"
scene: sidecar
sceneStep: 4
related:
  - label: Sidecar
    slug: sidecar
  - label: Retry
    slug: retry
  - label: Request Timeout
    slug: request-timeout
  - label: Circuit Breaker
    slug: circuit-breaker
  - label: Failover
    slug: failover
  - label: Load Balancer
    slug: load-balancer
  - label: API Gateway
    slug: api-gateway
  - label: Reverse Proxy
    slug: reverse-proxy
  - label: Anti-Corruption Layer
    slug: anti-corruption-layer
  - label: Adapter
    slug: adapter
references:
  - title: "Ambassador pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/ambassador
  - title: "Sidecar pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/sidecar
  - title: "Sidecar Containers"
    url: https://kubernetes.io/docs/concepts/workloads/pods/sidecar-containers/
---

ambassador는 사이드카라는 발상의 나가는 쪽 절반입니다. 들어올 때 사이드카는 트래픽이 앱보다 먼저 닿는 것이고, 나갈 때 사이드카는 앱이 네트워크보다 먼저 닿는 것입니다. 앱에는 `http://localhost:3500` 같은 기준 주소가 설정되고, 앱은 거기로 평범한 호출을 합니다. 그 루프백 건너편에는 진짜 서비스가 오늘 어디에 있는지, 그 인스턴스 중 무엇이 건강한지, 어떤 타임아웃이 적용되는지, 몇 번까지 시도하는 것이 합리적인지, 그리고 답이 끝내 오지 않으면 무엇을 할지 아는 컨테이너가 앉아 있습니다. 애플리케이션 코드에는 그중 아무것도 들어 있지 않고, 그것이 요점입니다. 앱 안에서 호출은 그냥 호출이고, 분산 시스템에서 호출을 어렵게 만드는 것들은 프로세스 하나만큼 왼쪽으로 옮겨졌습니다.

장면의 4단계가 보여 주는 것은 그중 가장 작은 흥미로운 형태입니다. 앱이 호출을 한 번 합니다. 먼 쪽 서비스에 일시 장애가 있어 첫 시도를 거절합니다. ambassador가 다시 시도해서 답을 받고, 앱은 아무 일도 없었다는 듯이 그 답을 건네받습니다. 앱 자신의 기록에는 호출을 한 번 했다고 적히고, 네트워크의 기록에는 요청이 두 번 나갔다고 적힙니다. 둘 다 사실이며, 그 둘의 차이가 정확히 이 패턴이 주는 것입니다. 그 결과를 얻기 위해 앱이 무엇을 담지 않아도 되었는지 보아야 합니다. 시도 횟수를 세는 코드도, 백오프 일정도, 어떤 상태 코드가 재시도할 만한지에 대한 분류도 없습니다. 그 정책은 retry 패턴의 주제이고, ambassador는 그 정책이 애플리케이션을 떠난 뒤에 머무는 자리입니다.

클라이언트 라이브러리 대신 이쪽을 집는 이유는 다른 모든 사이드카와 같습니다. 그리고 이것이 서비스 하나의 논거가 아니라 서비스 전체 차원의 논거라는 점은 솔직하게 말해 두어야 합니다. 한 가지 언어로 된 서비스 하나라면 복원력 라이브러리를 쓰고 끝내는 편이 낫습니다. 핸들러를 붙인 `IHttpClientFactory`나 그에 준하는 것이 장치도 적고 홉도 하나 적습니다. ambassador가 제값을 하는 때는 같은 정책이 서로 다른 언어로 쓰인 서비스들에서 똑같아야 할 때, 레거시 바이너리를 다시 컴파일할 수 없어서 재시도 정책을 넣을 수 없을 때, 그리고 플랫폼 팀이 애플리케이션 저장소를 하나도 열지 않고 전체 자산의 타임아웃을 바꿔야 할 때입니다. 커넥션 풀링이나 서킷 브레이킹, 프로토콜 변환을 애초에 그런 것을 가질 생각이 없던 클라이언트에 나중에 얹는 방법이기도 합니다.

대가는 이 모양이 예고하는 그대로입니다. 이제 나가는 호출마다 루프백을 건너므로 재야 할 홉이 하나 생기고, ambassador는 앱이 멀쩡한데도 아플 수 있는 프로세스입니다. 디버깅은 한 걸음 길어집니다. 실패한 호출을 볼 곳이 두 군데가 되고, 앱의 로그는 자기 절반만 설명하기 때문입니다. 설정은 앱을 떠나 플랫폼으로 옮겨 가는데, 이는 일관성에는 이득이고 지역성에는 손해입니다. 코드를 읽는 사람이 타임아웃이 얼마인지 더는 볼 수 없습니다. 실용적인 답은 셋입니다. "바깥에서 실제로 무슨 일이 있었나"에 답할 만큼 ambassador 자신의 텔레메트리를 좋게 유지하고, 상관관계 식별자를 이쪽으로도 전파해 호출의 두 절반을 이어 붙일 수 있게 하며, 호출하는 쪽의 마감 시간이 이 홉을 넘어서도 살아남아 ambassador의 기본값으로 조용히 대체되지 않게 하는 것입니다.
