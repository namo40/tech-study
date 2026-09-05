---
title: "Pre-Stop Hook"
summary: "SIGTERM 직전에 플랫폼이 컨테이너 안에서 실행하는 명령입니다. 이 파드를 아직 지목하는 라우팅 테이블이 따라잡을 동안 파드를 가만히 붙잡아 두려고 있으며, 그것은 애플리케이션이 스스로 할 수 없는 유일한 일입니다."
category: "컨테이너와 오케스트레이션"
scene: pod-disruption-budget
sceneStep: 2
related:
  - label: Pod Disruption Budget
    slug: pod-disruption-budget
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: SIGTERM
    slug: sigterm
  - label: Termination Grace Period
    slug: termination-grace-period
  - label: Readiness Probe
    slug: readiness-probe
  - label: Connection Draining
    slug: connection-draining
  - label: Rolling Update
    slug: rolling-update
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
references:
  - title: "Container Lifecycle Hooks"
    url: https://kubernetes.io/docs/concepts/containers/container-lifecycle-hooks/
  - title: "Attach Handlers to Container Lifecycle Events"
    url: https://kubernetes.io/docs/tasks/configure-pod-container/attach-handler-lifecycle-event/
  - title: "Pod Lifecycle"
    url: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/
---

훅은 신호보다 먼저 돌고, 종료 절차에서 애플리케이션이 스스로 수행하지 않는 유일한 부분입니다. 파드가 삭제 대상이 되면 두 가지가 동시에 시작되는데, 끝나는 속도는 같지 않습니다. 이 노드의 kubelet이 컨테이너 종료를 시작하고, 엔드포인트 컨트롤러가 이 파드를 지목하는 모든 Service에서 파드를 빼기 시작합니다. 두 번째는 클러스터의 모든 노드로 나가는 방송이고, 그것이 도착하기 전까지는 어딘가의 kube-proxy나 인그레스가 이 파드를 아직 요청을 보내기 좋은 곳이라고 믿고 있습니다.

훅은 그 방송이 경주에서 이기게 해 주는 멈춤입니다. 장면에서는 파드의 배지가 `preStop`을 가리키고 `req` 수가 줄어드는 구간입니다. 삭제 시점에 이 파드의 엔드포인트가 이미 terminating으로 표시되었고 라우팅 테이블이 하나씩 파드를 빼고 있으므로 새 일은 도착하지 않고, 이미 받아 둔 요청은 빠져나갑니다. 그 안에서 영리한 일은 아무것도 일어나지 않습니다. 압도적으로 흔한 구현은 sleep인데, 그것은 없는 기능을 우회하는 꼼수가 아니라 그 자체가 기능입니다. "이제 모든 라우팅 테이블이 나에 대해 들었다"고 알려 주는 이벤트를 파드가 구독할 방법은 없으므로, 전파를 덮을 만큼 긴 멈춤이 정직한 답입니다.

시간에 관해 적어 둘 것이 둘 있습니다. 훅은 동기적입니다. 훅이 돌아오기 전에는 SIGTERM이 오지 않으므로, 훅이 쓰는 시간은 그 뒤의 모든 것과 같은 예산에서 나갑니다. `terminationGracePeriodSeconds`는 훅과 종료를 함께 덮어야 하고, 유예 시간 전체를 자는 훅은 애플리케이션에게 시간을 조금도 남기지 않아서 정상 종료를 SIGKILL로 바꿔 놓습니다. 그리고 훅의 시계는 SIGTERM이 아니라 삭제 시점에 시작하므로, 앱이 마무리하는 데 걸리는 시간만으로 계산한 유예는 언제나 조금씩 모자랍니다.

훅은 SIGTERM 처리를 대신하지도 않고, 일을 하는 자리도 아닙니다. 컨테이너 안에서 돌기 때문에 `sleep`을 쓰려면 셸이나 그것을 제공하는 바이너리가 필요한데, distroless 이미지에는 그것이 없기로 유명합니다. `sleep`은 독립된 훅 타입으로, Kubernetes 1.30부터 베타로 기본 활성화되었고 1.32부터 안정 기능이 되었으며, 셸도 바이너리도 필요하지 않습니다. 실패는 이벤트로 기록된 뒤 무시되므로, 0이 아닌 코드로 끝나는 훅은 조용히 훅이 아예 없는 상태로 주저앉습니다. 훅 안에서 버퍼를 비우거나 서비스 레지스트리에서 등록을 해제하고 있다면, 오류를 볼 수 있는 `ApplicationStopping`으로 옮깁니다. 훅에는 플랫폼의 순서만이 가능하게 해 주는 그 한 가지 일만 남깁니다. 가만히 서 있기입니다.
