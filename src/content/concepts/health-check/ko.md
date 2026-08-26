---
title: "Health Check"
summary: "health check는 감독자가 일정한 간격으로 호출해 그 뒤에 있는 인스턴스에 대해 무언가를 결정하는 작은 엔드포인트입니다. 구조는 언제나 같습니다. 묻고, 기다리고, 답을 셉니다. 달라지는 것은, 그리고 중요한 것은 무엇을 물었고 호출한 쪽이 그 답으로 무엇을 하느냐입니다."
category: "컨테이너와 오케스트레이션"
scene: readiness-probe
sceneStep: 1
related:
  - label: Readiness Probe
    slug: readiness-probe
  - label: Liveness Probe
    slug: liveness-probe
  - label: Health-Based Routing
    slug: health-based-routing
  - label: Load Balancer
    slug: load-balancer
  - label: Rolling Update
    slug: rolling-update
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: Horizontal Pod Autoscaler
    slug: horizontal-pod-autoscaler
  - label: Connection Draining
    slug: connection-draining
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
  - label: Resource Limit
    slug: resource-limit
references:
  - title: "Kubernetes: liveness, readiness and startup probes"
    url: https://kubernetes.io/docs/concepts/workloads/pods/probes/
  - title: "ASP.NET Core: health checks"
    url: https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/health-checks
---

장면의 1단계는 모든 health check가 올라앉는 뼈대를 보여 주는데, 부품은 넷뿐입니다. 주기, 타임아웃, 임계값, 그리고 판정에 따라 움직이는 무언가입니다. 감독자가 몇 초마다 묻고, 답이 올 시간을 잠시 주고, 연속으로 거절된 횟수를 세고, 그 수가 임계값에 닿으면 설정된 일을 합니다. 이 뼈대에는 Kubernetes만의 것이 하나도 없습니다. 백엔드 풀을 폴링하는 로드 밸런서, 오래된 항목을 만료시키는 서비스 레지스트리, 리더를 지켜보는 클러스터 매니저가 모두 마지막 동사만 다른 같은 루프입니다.

그래서 흥미로운 질문은 엔드포인트를 어떻게 쓰느냐가 아닙니다. 그 엔드포인트가 무엇에 답해야 하는가이고, 구분할 가치가 있는 답은 사실 둘뿐입니다. 하나는 프로세스에 관한 것입니다. 아직 거기 있는가, 아직 코드를 돌릴 수는 있는가. 다른 하나는 서비스에 관한 것입니다. 지금 이 순간 요청을 쓸모 있게 처리할 수 있는가. 이 둘은 끊임없이 갈라지고, 심각한 프로브 버그는 예외 없이 한쪽을 물어야 할 자리에서 다른 쪽을 물은 경우입니다. 캐시를 채우는 중인 pod는 살아 있지만 서비스할 수 없습니다. 데이터베이스에 닿지 못하는 pod는 어떤 일은 하고 어떤 일은 못 하는 경우가 많습니다. 락에서 교착에 빠진 pod는 둘 다 아닙니다.

임계값은 사람들이 기본값 그대로 두었다가 나중에 놀라는 부분입니다. 표본 하나가 실패했다고 움직일 가치는 거의 없습니다. 패킷 하나가 버려진 것, 가비지 컬렉션이 멈춘 것, 재배포 중에 도착한 프로브는 표본 하나만 놓고 보면 진짜 고장과 똑같이 생겼기 때문입니다. 그래서 감독자는 셉니다. 연속 세 번, 다섯 번, 설정한 만큼입니다. 대가는 반응이 임계값 곱하기 주기만큼 늦어진다는 것이고, 그동안 감독자는 낡은 정보를 그대로 믿고 움직입니다. 장면에서도 그 구간 내내 트래픽이 계속 그 pod로 갑니다. 실제 운영에서 일어나는 일이 그렇고, 그래서 이 숫자들은 물려받는 대신 골라야 합니다.

타임아웃도 같은 정도의 주의를 받을 만합니다. 타임아웃이 없거나 주기보다 긴 검사는 느린 의존성 하나를 겹겹이 쌓인 프로브의 줄로 바꾸고, 그저 느렸을 뿐인 인스턴스가 자기 감독자에게 두들겨 맞는 인스턴스가 됩니다. 검사에는 간격보다 짧은 기한을 주고, 호출한 쪽이 끊어 주기를 기다리지 말고 검사 자신이 그 기한을 지키게 만듭니다.

검사는 가볍게, 그리고 무엇을 건드렸는지에 대해 정직하게 유지합니다. 가볍게 해야 하는 이유는 모든 인스턴스에서 초당 몇 번씩 영원히 돌기 때문입니다. 연결을 열고 쿼리를 돌리고 보고서를 직렬화하는 검사는 함대와 함께 커지는 배경 부하 생성기입니다. 정직해야 하는 이유는 아무것도 보지 않고 정상을 돌려주는 검사가 검사가 없는 것보다 나쁘기 때문입니다. 그런 검사는 감독자에게 얻지 않은 확신을 주고, 감춰진 고장은 인스턴스가 조용히 풀에서 빠지는 대신 사용자에게 오류로 드러납니다.

마지막으로 검사를 디버깅 페이지가 아니라 계약이 있는 인터페이스로 다룹니다. 소비자는 하나뿐이고, 기계가 호출하며, 어휘 전체가 상태 코드 하나입니다. 자세한 내용은 사람이 읽을 수 있는 로그와 지표에 두고, 감독자가 폴링하는 엔드포인트는 따져 보기 쉬울 만큼 작고, 무시해도 될 만큼 싸고, 아니라고 답했을 때 두 질문 중 어느 쪽에 답한 것인지 알 수 있을 만큼 분명하게 남겨 둡니다.
