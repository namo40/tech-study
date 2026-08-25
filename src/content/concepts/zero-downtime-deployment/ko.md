---
title: "Zero-Downtime Deployment"
summary: "무중단 배포는 배포 때문에 실패하는 요청이 하나도 없는 배포입니다. 그 자체가 전략은 아니고, 세 가지 조건이 동시에 성립하는 상태입니다. 새 인스턴스는 일할 수 있게 된 뒤에만 트래픽을 받고, 옛 인스턴스는 이미 받은 것을 끝낸 뒤에 나가며, 두 버전이 함께 도는 동안 서로 호환됩니다."
category: "컨테이너와 오케스트레이션"
scene: rolling-update
related:
  - label: Rolling Update
    slug: rolling-update
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: Connection Draining
    slug: connection-draining
  - label: Readiness Probe
    slug: readiness-probe
  - label: Expand-Contract Migration
    slug: expand-contract-migration
  - label: Blue-Green Deployment
    slug: blue-green-deployment
  - label: Canary Release
    slug: canary-release
  - label: Pod Disruption Budget
    slug: pod-disruption-budget
references:
  - title: "Kubernetes: Deployments"
    url: https://kubernetes.io/docs/concepts/workloads/controllers/deployment/
  - title: "Kubernetes: pod lifecycle"
    url: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/
  - title: ".NET Generic Host: host shutdown"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/generic-host
---

장면 전체가 하나의 질문에 대한 답입니다. 배포가 보이지 않으려면 무엇이 참이어야 하는가? pod 대신 위쪽 요청 흐름을 보면 답이 더 잘 보입니다. 흐름은 한 번도 끊기지 않고, 네 단계를 통틀어 ✕를 달고 돌아오는 점은 둘뿐입니다. 둘 다 마지막 단계에 있고, 둘 다 배포 절차 자체가 만든 실패가 아닙니다.

첫째 조건은 용량이 한 번도 내려가지 않는 것입니다. `maxSurge 1`과 `maxUnavailable 0`은 잠깐 다섯이 될 수는 있어도 셋이 되지는 않는다는 뜻이므로, 옛 pod를 치우기 전에 새 pod 값을 항상 먼저 치릅니다. 숫자보다 순서가 중요합니다. 띄우고, 기다리고, 그 다음에 멈춥니다. 순서를 뒤집으면 replica 넷 몫의 트래픽이 셋에게 도착하는 구간이 생기고, 그것을 누가 알아채느냐는 배포가 아니라 여유 용량에 달린 문제가 됩니다.

둘째 조건은 readiness가 들어올 때와 나갈 때 모두 정직한 것입니다. 2단계가 들어오는 쪽을 보여 줍니다. probe에 실패한 pod는 endpoints에 들어가지 못하므로, 망가진 빌드가 치르는 값은 멈춰 선 롤아웃뿐입니다. 3단계가 나가는 쪽을 보여 주는데, 사람들이 잊는 쪽이 이쪽입니다. 사라질 pod는 듣기를 멈추기 전에 먼저 그렇다고 말해야 합니다. 자기에게 일을 보내는 라우팅 표는 사본이고, 사본이 갱신되는 데는 시간이 걸리기 때문입니다.

셋째 조건은 호환성이고, 배포 플랫폼이 강제할 수 없는 것이 이것입니다. 롤아웃 동안 두 버전이 같은 데이터베이스와 같은 API를 상대로 동시에 살아 있으므로, 어느 한쪽이 이해하지 못하는 것은 매니페스트가 볼 수 없는 실패가 됩니다. 4단계의 ✕ 두 개가 그것이고, 해결책은 배포 설정이 아니라 규율입니다. 확장하고, 옮기고, 축소하되 여러 릴리스에 걸쳐 나눕니다.

여기 있는 것 중에 쿠버네티스에만 해당하는 것은 없습니다. 대상 그룹을 비우는 로드 밸런서, 리버스 프록시 뒤의 윈도우 서비스, 메시지 받기를 멈추고 손에 든 것을 끝내는 큐 소비자 모두 같은 세 가지가 필요합니다. 쿠버네티스는 그 셋에 이름이 붙어 있는 곳일 뿐입니다.

정말로 통했는지를 재 보는 일은 해 볼 값어치가 있습니다. 배포는 일정을 잡을 수 있는 유일한 종류의 장애이므로, 롤아웃마다 대시보드에 표시를 남기고 그 구간의 오류율과 p99를 보세요. 매니페스트에서는 무중단인데 꼬리 지연에서는 보이는 배포라면, 세 조건 중 하나가 빠진 배포이고, 그것이 가장 먼저 드러나는 곳이 보통 꼬리입니다.
