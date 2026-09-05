---
title: "Liveness Probe"
summary: "liveness probe는 답이 재시작인 검사입니다. 이 프로세스가 애초에 계속 존재해도 되는지를 묻고, 연속으로 충분히 거절당하면 kubelet이 컨테이너를 죽이고 다시 시작합니다. 난폭한 처방이므로 오직 프로세스 자신에 대해서만 물어야 합니다."
category: "컨테이너와 오케스트레이션"
scene: readiness-probe
sceneStep: 3
related:
  - label: Readiness Probe
    slug: readiness-probe
  - label: Health Check
    slug: health-check
  - label: Health-Based Routing
    slug: health-based-routing
  - label: Rolling Update
    slug: rolling-update
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: Horizontal Pod Autoscaler
    slug: horizontal-pod-autoscaler
  - label: Resource Limit
    slug: resource-limit
  - label: Load Balancer
    slug: load-balancer
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
  - label: Connection Draining
    slug: connection-draining
references:
  - title: "Kubernetes: liveness, readiness and startup probes"
    url: https://kubernetes.io/docs/concepts/workloads/pods/probes/
  - title: "Kubernetes: configure liveness, readiness and startup probes"
    url: https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/
  - title: "ASP.NET Core: health checks"
    url: https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/health-checks
---

장면의 3단계가 이 개념의 전부입니다. 프로세스가 답을 멈추고, liveness 줄이 거절로 채워지고, 연속 세 번째에서 kubelet이 컨테이너를 죽이고 다시 시작합니다. 재시작 카운터가 올라가고, 파드는 `restarting`이라고 말했다가 `starting`이라고 말하고, readiness는 새 인스턴스가 한 번 통과할 때까지 트래픽을 막아 둡니다. 이 순서의 모든 부분이 읽을 가치가 있지만 중요한 것은 첫 부분입니다. liveness가 내리는 결론은 언제나 하나뿐입니다. 이 프로세스는 기다린다고 살아나지 않는다는 것입니다.

앞으로 쓸 liveness 검사마다 적용할 시험이 여기서 나옵니다. 이 검사가 보고하려는 상태를 재시작이 고쳐 주는가. 스레드 풀 교착, 잠금에 물려 멈춘 이벤트 루프, 회복 불가능하게 망가진 네이티브 힙, 빠져나올 수 없는 상태에 도달한 상태 머신은 모두 프로세스가 돌고 있고, 계속 돌 것이고, 다시는 진전하지 못하는 조건입니다. 이럴 때 죽이는 것이 정말로 가장 빠른 복귀 경로입니다. 연결을 거절하는 데이터베이스는 그런 조건이 아닙니다. 길어진 큐도, 느려진 하위 서비스도, 만료된 인증서도 아닙니다. 이 경우들에서 프로세스는 멀쩡하고, 재시작은 콜드 스타트 말고 아무것도 이루지 못합니다.

장면의 4단계는 그 선을 넘었을 때 무슨 일이 벌어지는지 보여 주는데, 쓸모없는 정도가 아니라 그보다 나쁩니다. liveness를 공유 의존 대상에 겨누는 순간 모든 레플리카가 같은 방아쇠에 연결됩니다. 의존 대상이 한 번 흔들리면 모든 파드가 동시에 liveness에 실패하고, 인스턴스 전체가 한꺼번에 재시작합니다. 처리 능력이 0이 되고, 모든 캐시가 차가워지고, 모든 커넥션 풀이 이미 힘들어하던 그 의존 대상을 향해 다시 열리고, 의존 대상이 회복되지 않는 한 재시작이 계속됩니다. 플랫폼이 작은 흔들림으로 만들어 낸 장애입니다. 연결선을 readiness로 옮긴 뒤의 같은 흔들림은 파드 몇 개가 조용히 로테이션에서 빠져 있는 것 이상을 만들지 않습니다.

느린 시작은 이 개념을 잘못 쓰는 또 하나의 전형입니다. 부팅에 90초가 걸리는 프로세스는 정상 상태에 맞춘 liveness probe에 죽고, 다음 시도에서도 죽고, 파드는 이미지가 망가진 것처럼 보이는 크래시 루프에 앉아 있게 됩니다. liveness probe를 부팅이 들어갈 때까지 느슨하게 하고 싶어지지만, 90초 부팅을 견딜 만큼 넉넉한 프로브는 정말로 멈춰 버린 프로세스를 90초 동안 그대로 두기에도 넉넉합니다. 답은 startup probe입니다. 자기만의 넉넉한 예산을 갖고, 그것이 통과할 때까지 liveness는 시작하지 않으며, 각 프로브가 자기에게 맞는 설정을 그대로 지킵니다.

엔드포인트는 아주 단순하게 둡니다. `/healthz/live`는 프로세스 말고 아무것도 건드리지 않아야 합니다. 데이터베이스도, 캐시도, 바깥으로 나가는 호출도, 막힐 수 있는 의존성 주입 그래프도 안 됩니다. ASP.NET Core에서는 liveness 태그를 단 검사가 조건 없이 정상을 돌려주거나, 어떤 백그라운드 구성 요소가 스스로 멈췄다고 판단했을 때 세우는 플래그를 읽는 정도입니다. 그런 검사가 보고하는 내용에는 가치가 없습니다. 가치는 요청이 처리되었다는 사실 자체에 있습니다. 호스트가 아직 연결을 받고 있고 아직 코드를 돌리고 있다는 증거이기 때문입니다.

마지막으로 재시작 카운터 자체를 신호로 봅니다. 꾸준히 올라가는 재시작은 듣지 않는 처방을 플랫폼이 계속 시도하고 있다는 뜻이고, 해법이 임계값을 늘리는 것인 경우는 거의 없습니다. 프로세스가 정말로 멈춰 있다면 버그는 프로브보다 위쪽에 있는 것이고, 아니라면 프로브가 애초에 liveness가 아닌 질문에 답하고 있는 것입니다. 장면은 카운터가 멈추고 파드가 살아 있는 상태로 끝납니다. 연결선을 옮긴 뒤에는 예전에 모든 것을 재시작시키던 그 장애가 파드를 로테이션에서 빼기만 하고, 의존 대상이 돌아오는 순간 파드도 돌아옵니다.
