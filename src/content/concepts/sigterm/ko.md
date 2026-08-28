---
title: "SIGTERM"
summary: "프로세스에게 멈춰 달라고 요청하는 신호입니다. 처형이 아니라 요청이라서, 프로세스는 통보를 받고 무엇을 마무리할지 스스로 정합니다. 너무 오래 걸릴 때만 덜 정중한 것이 뒤따라옵니다."
category: "컨테이너와 오케스트레이션"
scene: pod-disruption-budget
sceneStep: 2
related:
  - label: Pod Disruption Budget
    slug: pod-disruption-budget
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: Pre-Stop Hook
    slug: pre-stop-hook
  - label: Termination Grace Period
    slug: termination-grace-period
  - label: Connection Draining
    slug: connection-draining
  - label: Readiness Probe
    slug: readiness-probe
  - label: Rolling Update
    slug: rolling-update
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
references:
  - title: "Pod Lifecycle"
    url: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/
  - title: ".NET Generic Host: host shutdown"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/generic-host
  - title: "IHostApplicationLifetime"
    url: https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.hosting.ihostapplicationlifetime
---

장면의 두 번째 단계는 놓치기 쉬운 구분 하나에 걸려 있습니다. 두 신호가 결국 같은 곳에 도착하기 때문입니다. SIGTERM은 요청입니다. SIGKILL은 아닙니다. SIGTERM은 잡을 수 있고, 쓸 만한 런타임은 모두 이 신호를 잡습니다. 누군가 멈춰 주기를 바란다고 프로세스에게 알려 주는 것이고, 그다음에 무엇을 할지는 온전히 프로세스가 정합니다. SIGKILL은 잡을 수도, 막을 수도, 무시할 수도 없고, 프로세스는 그 신호가 도착한 뒤 명령어를 하나도 더 실행하지 못합니다.

파드가 삭제될 때 플랫폼이 실제로 하는 일은 각 컨테이너의 PID 1에게 SIGTERM을 보내는 것입니다. 사소해 보이지만 이빨이 있는 세부 사항입니다. 컨테이너의 entrypoint가 애플리케이션을 실행하는 셸 스크립트라면 PID 1은 셸이고, 셸은 기본적으로 신호를 전달하지 않으므로, 애플리케이션은 아무것도 듣지 못합니다. 유예 시간이 다하면 그냥 사라질 뿐입니다. entrypoint에서 `exec`를 쓰거나 진짜 init을 PID 1로 두어야 이 문서의 나머지가 여러분에게 적용됩니다.

신호를 잡았다면 속도보다 순서가 중요합니다. 먼저 자신을 준비 상태로 알리는 것을 멈춰서 라우팅 테이블이 나를 빼기 시작하게 합니다. 그다음 새 일을 받지 않습니다. 리스너를 닫고, 큐에서 당겨 오기를 멈춥니다. 이미 손에 있는 것을 마무리합니다. HTTP 서버라면 현재 요청을 끝까지 처리하는 것이고, 컨슈머라면 이미 가져온 메시지를 확인 응답하는 것입니다. 쥐고 있는 것을 놓아 줍니다. 연결은 풀로, 리스와 락은 발급자에게, 버퍼에 쌓인 텔레메트리는 밖으로 내보냅니다. 그리고 0 상태로 종료합니다. 이 목록의 첫 줄에서 바로 종료하는 프로세스는 정상 종료하는 것이 아니라 정중하게 크래시하는 것입니다.

.NET에서는 이것이 호스트의 일이고 이미 연결되어 있습니다. `IHost.RunAsync`가 핸들러를 설치하고, 신호가 오면 `ApplicationStopping` 토큰이 취소되고, 서버가 수신을 멈추고, 진행 중인 요청을 기다리고, 모든 `IHostedService.StopAsync`가 `HostOptions.ShutdownTimeout`으로 제한된 토큰과 함께 돕니다. 실수는 거의 항상 같은 둘입니다. 루프가 취소 토큰을 한 번도 확인하지 않는 `BackgroundService`는 기한이 왔을 때도 여전히 일하고 있습니다. 그리고 종료 타임아웃을 플랫폼의 유예 시간보다 크게 잡으면, 깨끗하게 끝내라고 쓴 코드가 깨끗하게 끝내는 도중에 죽습니다.

재시작을 둘러싼 혼란의 상당 부분도 이 신호에서 나옵니다. 종료 코드 143은 128 더하기 15이고, SIGTERM 때문에 멈춘 프로세스입니다. 종료 코드 137은 128 더하기 9이고, SIGKILL입니다. 앞의 것은 정상 종료이며 보통은 플랫폼이 요청했다는 뜻입니다. 뒤의 것은 유예 시간이 다했거나 커널의 OOM 킬러가 먼저 도착했다는 뜻이고, 둘 중 무엇인지는 로그가 아니라 파드의 이벤트에 적혀 있습니다. SIGKILL로 죽은 프로세스는 그에 관한 로그 한 줄도 남기지 못하기 때문입니다.
