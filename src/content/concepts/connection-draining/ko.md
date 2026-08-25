---
title: "Connection Draining"
summary: "커넥션 드레이닝은 인스턴스가 라우팅 표에서 빠지는 시점과 실제로 닫히는 시점 사이의 구간입니다. 새 일감은 더 이상 받지 않지만 이미 받은 것은 계속 처리하고, 그것이 끝난 뒤에야 사라집니다. 이 구간이 있는 이유는 라우팅 표가 사본이고, 사본이 따라잡는 데는 시간이 걸리기 때문입니다."
category: "컨테이너와 오케스트레이션"
scene: rolling-update
sceneStep: 3
related:
  - label: Rolling Update
    slug: rolling-update
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: Pre-Stop Hook
    slug: pre-stop-hook
  - label: Termination Grace Period
    slug: termination-grace-period
  - label: Load Balancer
    slug: load-balancer
  - label: Health-Based Routing
    slug: health-based-routing
  - label: Sticky Session
    slug: sticky-session
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
references:
  - title: "Kubernetes: pod lifecycle"
    url: https://kubernetes.io/docs/concepts/services-networking/service/
  - title: "Kubernetes: pod termination"
    url: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/
  - title: "ASP.NET Core: host shutdown"
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/host/generic-host
---

세 번째 단계의 틈을 보세요. pod가 멈추라는 말을 들었는데도 그 pod의 칩은 endpoints 목록에서 잠깐 더 켜져 있다가 흐려집니다. 그 잠깐 동안 고장 난 것은 없습니다. 그저 결정이 라우팅하는 쪽에 닿는 데 걸리는 시간일 뿐이고, 그 사이에 도착한 요청은 이미 나가라는 말을 들은 pod로 여전히 보내집니다.

드레이닝이 존재하는 이유가 통째로 이것입니다. Service도, 로드 밸런서도, 사이드카 프록시도, 해석된 주소를 캐시하는 모든 클라이언트도 같은 목록의 사본을 들고 있고, 그 목록은 전파되는 알림으로 갱신됩니다. SIGTERM을 받자마자 리스너를 닫는 pod는 아직 여러 사본이 자기 이름을 담고 있는 동안 닫는 것이고, 그 사본들에서 배정된 요청은 전부 연결 거부를 받습니다. 이 실패는 배포 버그처럼 보이고 실제로 버그이지만, 배포 쪽에 있는 것이 아닙니다. 제거가 즉시 끝난다는 가정 쪽에 있습니다.

해결책은 필요하다고 느끼는 것보다 조금 더 오래 계속 응답하는 것입니다. 몇 초 동안 자는 `preStop` 훅이 정확히 그 일을 합니다. 쿠버네티스는 SIGTERM을 보내기 전에 이 훅을 실행하므로, endpoints 제거가 전파되는 동안 컨테이너는 여전히 듣고 있습니다. 5초가 보통 출발점이지만 마법의 숫자는 아닙니다. 실제로 관측한 전파 시간보다는 길어야 하고, API 서버가 바쁜 큰 클러스터에서는 작은 클러스터보다 그 시간이 깁니다.

리스너가 실제로 닫히고 나면, 드레이닝은 이미 처리 중인 것에 관한 이야기가 됩니다. HTTP는 쉽습니다. 요청은 도착했거나 도착하지 않았거나 둘 중 하나이고, 도착한 것을 끝내는 데는 그중 가장 느린 것만큼이 걸립니다. keep-alive 연결은 덜 쉽습니다. 연결은 요청과 요청 사이에 놀고 있는데, 그것을 예의 있게 닫는다는 것은 도중에 끊는 대신 다음 응답에 `Connection: close`를 실어 보낸다는 뜻입니다. 호스트가 멈추는 중이면 ASP.NET Core가 이 일을 대신해 줍니다. 그러고 남는 것이 요청과 응답의 모양에 아예 들어맞지 않는 트래픽입니다.

오래 붙어 있는 연결은 비워지지 않고 만료됩니다. WebSocket도, SignalR 허브 연결도, 서버 스트리밍 gRPC 호출도 모두 열린 채로 있으라고 만든 것이므로, 끝나기를 기다린다는 것은 유예 시간을 넘겨 기다리다가 결국 죽는다는 뜻입니다. 답은 의도적으로 닫는 것입니다. `ApplicationStopping`에서 그 프로토콜의 작별 인사를 보내고 클라이언트가 다시 연결하게 두면, 클라이언트는 아직 살아 있는 pod로 연결합니다. 스스로 다시 연결하는 클라이언트가, 사용자가 눈치채지 못하는 배포와 열려 있던 모든 페이지가 조용해지는 배포를 가릅니다.

같은 모양이 HTTP 바깥에도 있습니다. 큐 소비자는 미리 가져오기를 멈추고 손에 든 것을 확인 응답하면서 비웁니다. 로드 밸런서 대상 그룹은 draining 상태로 옮겨 가 등록 해제 지연을 기다리며 비웁니다. 세 경우 모두 인스턴스는 사라지기 전에 먼저 새 일감에 대해 닿을 수 없는 상태가 되고, 그 두 사실 사이의 구간이 손볼 값어치가 있는 부분입니다.
