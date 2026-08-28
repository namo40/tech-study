---
title: "Termination Grace Period"
summary: "파드가 멈추라는 통보를 받은 뒤 그대로 죽기까지 주어지는 시간입니다. 넉넉한 배려가 아니라 기한입니다. 시간이 다했을 때 끝나지 않은 것은 끝낼 기회를 얻지 못합니다."
category: "컨테이너와 오케스트레이션"
scene: pod-disruption-budget
sceneStep: 3
related:
  - label: Pod Disruption Budget
    slug: pod-disruption-budget
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: SIGTERM
    slug: sigterm
  - label: Pre-Stop Hook
    slug: pre-stop-hook
  - label: Connection Draining
    slug: connection-draining
  - label: Readiness Probe
    slug: readiness-probe
  - label: Rolling Update
    slug: rolling-update
  - label: Blue-Green Deployment
    slug: blue-green-deployment
references:
  - title: "Pod Lifecycle"
    url: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/
  - title: ".NET Generic Host: host shutdown"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/generic-host
  - title: "HostOptions.ShutdownTimeout"
    url: https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.hosting.hostoptions.shutdowntimeout
---

장면의 세 번째 단계에 나오는 링이 이 숫자이고, 이 값에 대해 가장 먼저 알아야 할 것은 시계가 언제 시작하는가입니다. SIGTERM이 도착할 때가 아니라 파드가 삭제 대상이 될 때 시작합니다. preStop 훅도 그 안에서 돌고, 신호도 그 안에서 보내지고, 애플리케이션 자신의 종료는 남은 시간 안에서 일어납니다. 그래서 "내 앱이 멈추는 데 얼마나 걸리는가"만으로 잡은 유예는 언제나 훅의 길이만큼 모자라고, 그것이 바로 배포할 때마다 요청 하나씩 잃는 서비스를 만드는 실수입니다.

두 번째로 알아야 할 것은 이 값이 기한이며 그보다 부드러운 무엇도 아니라는 점입니다. 시간이 다하면 컨테이너는 SIGKILL을 받고, 그것은 잡을 수 없으며, 프로세스는 명령어와 명령어 사이에서 멈춥니다. 플러시도, 마지막 로그 한 줄도, `finally` 블록도, 반쯤 처리하던 메시지를 확인 응답할 기회도 없습니다. 기한을 넘긴 종료는 느린 종료가 아니라 예정되어 있던 크래시입니다. 장면에서는 파드가 시간을 남기고 끝내며, `SIGKILL` 표시는 그 뒤에 잠깐 나타나 가지 않은 길을 보여 줄 뿐입니다.

값을 정하는 일은 추측이 아니라 측정이고, 재야 할 것은 평균이 아니라 가장 긴 정직한 종료 시간입니다. preStop의 멈춤, 진행 중인 일이 끝나는 데 필요한 시간, 쥐고 있는 것을 놓는 시간을 더한 다음, 중앙값이 아니라 꼬리를 택합니다. 이것이 되는지 안 되는지를 결정하는 요청은 느린 쪽이기 때문입니다. p99가 200밀리초이고 p999가 8초인 워크로드는 8초에서 만든 유예가 필요합니다. 기본값은 30초인데, 상태 없는 API에는 넉넉하고 오래 도는 배치를 쥔 컨슈머에게는 어림도 없습니다.

컨테이너 안쪽에서는 .NET의 `HostOptions.ShutdownTimeout`이 한 단계 아래의 같은 개념이고, 둘 사이에는 순서가 있어야 합니다. 호스트의 타임아웃은 플랫폼의 유예 시간보다 확실히 작아야 하고 여유도 실제로 있어야 합니다. 애플리케이션은 몇 초를 남기고 자기 방식대로 정리를 끝내야지, 정리하는 도중에 플랫폼에게 끊겨서는 안 됩니다. 5초 정도의 여유가 시작점으로 무난하며, 순서를 거꾸로 잡았을 때의 증상은 "stopping"을 남기고 그 뒤로는 아무것도 남기지 않는 종료 경로입니다.

걸려 넘어지기 쉬운 작은 것이 둘 더 있습니다. 이 값은 파드의 속성이므로 바꾸는 것은 즉시 수정이 아니라 새 롤아웃입니다. 그리고 삭제 쪽에서 이 값을 무시할 수 있습니다. `kubectl delete --grace-period=0 --force`는 의식 전체를 건너뛰고 프로세스가 멈췄든 아니든 API 서버에서 객체를 지웁니다. 그것은 멈춰 버린 노드를 위한 도구이지 배포를 빠르게 만드는 방법이 아닙니다.
