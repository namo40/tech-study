---
title: "Long-Running Process"
summary: "장기 실행 프로세스는 자신을 시작한 요청보다, 대개는 자신을 시작한 프로세스보다도 오래 사는 작업입니다. 상태는 메모리 바깥에 있어야 하고, 대기는 멈춰 선 스레드가 아니라 기한이어야 하며, 모든 단계는 다시 실행해도 안전해야 합니다."
category: "예약 작업과 워크플로"
scene: state-machine
sceneStep: 4
related:
  - label: State Machine
    slug: state-machine
  - label: Durable Workflow
    slug: durable-workflow
  - label: Human Approval
    slug: human-approval
  - label: Workflow Engine
    slug: workflow-engine
  - label: Retryable Step
    slug: retryable-step
  - label: Scheduled Job
    slug: scheduled-job
  - label: Background Job
    slug: background-job
  - label: Idempotency
    slug: idempotency
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: Saga
    slug: saga
references:
  - title: "Web-Queue-Worker architecture style"
    url: https://learn.microsoft.com/en-us/azure/architecture/guide/architecture-styles/web-queue-worker
  - title: "Implement background tasks in microservices with IHostedService"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/microservices/multi-container-microservice-net-applications/background-tasks-with-ihostedservice
  - title: "Durable Functions overview"
    url: https://learn.microsoft.com/en-us/azure/durable-task/durable-functions/durable-functions-overview
---

그냥 오래 걸리는 작업과 장기 실행 프로세스를 가르는 것은 세 가지입니다. 자기 바깥의 무언가를 기다리므로 걸리는 시간이 코드의 속도로 정해지지 않습니다. 배포를 가로질러 살아 있으므로 코드의 어느 한 버전도 처음부터 끝까지 그것을 소유하지 못합니다. 그리고 어떤 합리적인 타임아웃보다도 길므로, 상류의 누구도 답을 기다리며 연결을 붙들고 있을 수 없습니다.

셋은 각각 무언가를 강제합니다. 바깥 세계를 기다리므로 대기는 멈춰 선 스레드가 아니라 저장된 기한이어야 합니다. 요청 핸들러 안의 `Task.Delay`가 아니라 스케줄러가 알아볼 만기 시각이 적힌 행입니다. 이틀 동안 세워 둔 스레드는 첫 재시작에 사라지는 스레드이고, 재시작은 반드시 옵니다. 배포를 가로지르므로 상태는 배포보다 오래 남는 곳에 기록되어야 하고, 현재 단계는 프로그램 카운터가 아니라 저장소의 값이어야 합니다. 아무도 회선에서 기다리지 않으므로 호출자에게는 작업이 시작될 때 접수증을, 나중에 결과를 확인할 방법을 주어야 합니다. 그래서 프로세스는 첫 순간부터 자기 식별자를 가져야 합니다.

장면 속 상태 머신이 이것을 실제로 옮긴 모습입니다. 프로세스가 멈춰 설 수 있는 모든 지점이 이름 붙은 상태이고, 그것을 다음으로 옮기는 모든 것이 이벤트이며, 현재 상태는 행 하나입니다. 이벤트가 다른 서비스에서 온 메시지든, 사람이 승인을 누른 것이든, 타이머가 만기가 된 것이든 상관없습니다. 모두 같은 방식으로 도착해 같은 표에서 조회됩니다. 프로세스가 어느 단계에 있는지는 코드가 지금 어디에 와 있는지에 암묵적으로 담기지 않습니다. 대부분의 시간에는 실행 중인 코드가 아예 없기 때문입니다.

사람들이 과소평가하는 부분은 모든 단계가 두 번 실행되어도 안전해야 한다는 점입니다. 워커는 작업을 커밋하고 그 사실을 기록하기 전에 죽을 수 있고, 그러면 다음 워커가 같은 단계를 다시 집어 갑니다. 해법은 장애 구간을 좁히는 것이 아닙니다. 그 구간은 닫을 수 없습니다. 반복이 해롭지 않게 만드는 것입니다. 인스턴스와 단계에서 끌어낸 키를 단계마다 부여하고, 단계가 가장 먼저 하는 일을 그 효과가 이미 있는지 확인하는 일로 삼으십시오.

도구 선택은 대기의 모양을 따라갑니다. 큐에 실린 메시지가 큰 공백 없이 이어지는 사슬이라면 큐를 읽는 백그라운드 서비스로 충분합니다. 대기가 며칠 단위이고, 단계마다 재시도가 있고, 수천 개의 인스턴스에 대해 "지금 어디까지 갔나"를 동시에 답해야 한다면 그것이 워크플로 엔진이 존재하는 이유입니다. 그 기계를 직접 만든다는 것은 history와 재생, 타이머, 버전 관리까지 모두 직접 만든다는 뜻입니다.
