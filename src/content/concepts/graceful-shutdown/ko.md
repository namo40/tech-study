---
title: "Graceful Shutdown"
summary: "우아한 종료는 프로세스가 멈추라는 말을 들은 뒤 실제로 멈추기까지 하는 일입니다. 자신을 쓸 수 없다고 보고하고, 새 일감 받기를 멈추고, 이미 받은 것을 끝내고, 빌린 것을 돌려주고, 기한 전에 나갑니다. SIGTERM이 그 요청이고, 종료 유예 시간이 그 기한입니다."
category: "컨테이너와 오케스트레이션"
scene: rolling-update
sceneStep: 3
related:
  - label: Rolling Update
    slug: rolling-update
  - label: Connection Draining
    slug: connection-draining
  - label: SIGTERM
    slug: sigterm
  - label: Termination Grace Period
    slug: termination-grace-period
  - label: Pre-Stop Hook
    slug: pre-stop-hook
  - label: Readiness Probe
    slug: readiness-probe
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
  - label: Consumer Acknowledgement
    slug: consumer-acknowledgement
  - label: Cancellation Token
    slug: cancellation-token
references:
  - title: "Kubernetes: pod lifecycle"
    url: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/
  - title: ".NET Generic Host: host shutdown"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/generic-host
  - title: "IHostApplicationLifetime"
    url: https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.hosting.ihostapplicationlifetime
---

장면의 세 번째 단계가 이 이야기의 전부입니다. pod가 도중에 멈추라는 말을 듣고, 잠시 더 답하고, 이미 자기 위에 서 있던 요청을 끝낸 다음에야 불이 꺼집니다. `SIGTERM`과 `30 s`가 그 아래에 함께 나타나는 이유는 둘이 한 문장의 두 조각이기 때문입니다. 멈춰라, 그리고 그럴 시간은 30초다.

그 30초 안의 순서가 우아한 종료와 그냥 느린 종료를 가릅니다. 먼저 쓸 수 없다고 보고합니다. 종료가 시작되는 순간부터 readiness 엔드포인트는 실패하기 시작해야 합니다. 아직 이 인스턴스를 목록에 담고 있는 라우팅 표는 다른 어딘가에 있는 사본이고, 빨리 알릴수록 새 일감이 도착하는 구간이 짧아지기 때문입니다. 그 다음에 받기를 멈춥니다. 리스너를 닫거나 큐에서 꺼내기를 그만두되, 첫 단계가 효과를 낼 잠깐의 시간을 준 뒤에 합니다. 그 다음 처리 중인 것을 끝냅니다. HTTP 서버라면 지금 있는 요청을 끝내게 두는 것이고, 소비자라면 이미 가져온 메시지를 확인 응답하는 것입니다. 그 다음 돌려줍니다. 연결은 풀로, 임차권과 잠금은 내준 쪽으로, 모아 둔 텔레메트리는 내보냅니다. 그 다음 기한 전에 0 상태로 나갑니다.

기한은 권고가 아닙니다. 유예 시간이 끝나면 프로세스는 그대로 죽으므로, 끝내지 못한 종료는 절반만 쓰인 상태를 남긴 채 크래시가 됩니다. 애플리케이션 자신의 종료 제한 시간을 플랫폼의 유예 시간보다 위가 아니라 확실히 아래에 두어야 하는 이유가 이것입니다. 코드가 몇 초를 남기고 스스로 정리를 마치고 나가기를 바라는 것이지, 아직 정리하는 중에 플랫폼이 끊어 주기를 바라는 것이 아닙니다.

.NET에서는 배관이 대체로 이미 깔려 있습니다. Generic Host가 SIGTERM을 처리하고, `ApplicationStopping`을 실행하고, hosted service가 `StopAsync`에서 돌아오기를 기다린 뒤 `ApplicationStopped`를 냅니다. 설정할 것은 `HostOptions.ShutdownTimeout`인데, 기본값이 5초라서 실제 서비스에는 거의 언제나 너무 짧습니다. 유예 시간보다 짧은 값으로 잡고, readiness 검사가 `ApplicationStopping`을 반영하게 만들어 양쪽 끝을 맞추세요. ASP.NET Core는 이미 새 연결을 받지 않고 있던 연결을 비워 주므로, 남는 일은 프레임워크가 알 수 없는 부분입니다.

그 부분은 대개 백그라운드 작업입니다. `BackgroundService`는 중지 토큰을 받는데, 그것을 무시하는 루프가 종료를 기한까지 끌고 가는 가장 흔한 이유 하나입니다. 메시지 소비자는 처리를 멈추기 전에 미리 가져오기를 먼저 멈춰야 합니다. 그러지 않으면 끝낼 시간이 없는 메시지를 손에 쥔 채로 있게 되고, 그것들은 다시 배달됩니다. 30초 안에 끝날 수 없는 긴 작업은 애초에 끝내려 들면 안 됩니다. 한 것까지를 기록해 두고 다음 인스턴스가 이어받게 해야 하며, 이는 배포보다 한참 앞서 내리는 설계 결정입니다.

마지막으로 볼 것은 끝내지 못한 일을 프로세스가 어떻게 두고 가느냐입니다. 메시지를 확인 응답하지 않고 두는 것은 옳습니다. 브로커가 다시 배달할 테니까요. 임차권을 쥔 채로 두는 것은 잘못입니다. 만료될 때까지 아무도 넘겨받지 못하니까요. 이 둘 사이에서, 빌린 것을 전부 돌려주고 나가는 종료가 재시작을 보이지 않게 만들어 줍니다.
