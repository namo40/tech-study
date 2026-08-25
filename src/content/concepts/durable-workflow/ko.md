---
title: "Durable Workflow"
summary: "내구성 워크플로는 진행 상황을 일어나는 대로 기록해 두는 프로세스입니다. 그래서 장애가 나도 다시 세울 수 있고 멈춘 자리에서 이어집니다. 코드는 순차적으로 읽히지만, 엔진은 그것을 기록으로 바꿉니다."
category: "예약 작업과 워크플로"
scene: state-machine
sceneStep: 4
related:
  - label: State Machine
    slug: state-machine
  - label: Long-Running Process
    slug: long-running-process
  - label: Human Approval
    slug: human-approval
  - label: Workflow Engine
    slug: workflow-engine
  - label: Retryable Step
    slug: retryable-step
  - label: Idempotency
    slug: idempotency
  - label: Saga
    slug: saga
  - label: Azure Durable Functions
    slug: azure-durable-functions
  - label: Temporal
    slug: temporal
  - label: Dapr Workflow
    slug: dapr-workflow
references:
  - title: "Durable Functions overview"
    url: https://learn.microsoft.com/en-us/azure/azure-functions/durable/durable-functions-overview
  - title: "Durable orchestrations: code constraints"
    url: https://learn.microsoft.com/en-us/azure/azure-functions/durable/durable-functions-code-constraints
  - title: "Temporal .NET SDK"
    url: https://docs.temporal.io/develop/dotnet
---

장면의 네 번째 단계는 기계 아래에 history 줄을 놓고, 그 위를 훑는 막대를 보여 줍니다. 그 줄이 이 개념의 전부입니다. 내구성 워크플로는 진행 상황을 호출 스택에 담아 두지 않습니다. 호출 스택은 그것을 담고 있는 프로세스보다 오래 살지 못하기 때문입니다. 대신 이미 일어난 일을 덧붙이기만 하는 목록으로 보관합니다. 이 단계가 예약되었다, 이 단계가 이 값을 돌려주었다, 이 타이머가 걸렸다, 이 외부 이벤트가 도착했다.

그 목록을 다시 실행 중인 프로세스로 되돌리는 것이 재생입니다. 인스턴스를 이어받아야 할 때 엔진은 오케스트레이션 코드를 처음부터 다시 실행하는데, 코드가 하는 모든 호출은 실제로 수행되는 대신 history에서 답을 받습니다. 이미 값을 돌려준 단계는 기록된 결과를 즉시 내놓고, 이미 울린 타이머는 곧바로 완료되며, 이미 도착한 이벤트를 기다리는 지점은 그 이벤트를 바로 받습니다. 코드는 이미 해 놓은 일을 빠르게 지나쳐 아직 일어나지 않은 첫 번째 지점에 이르러 거기서 멈춥니다. 밖에서 보면 이어받은 것이고, 안에서 보면 과거를 손에 쥔 채 다시 실행된 것입니다.

이 방식은 그대로 제약이 됩니다. 재생이 같은 순서를 만들어 내려면 코드가 결정적이어야 하므로, 오케스트레이션은 시계를 읽거나 난수와 새 식별자를 만들거나 바깥을 직접 호출할 수 없습니다. 결정적이지 않은 것은 모두 엔진을 거쳐야 하고, 엔진이 한 번 수행한 뒤 그 답을 기록합니다. `Task.Delay` 대신 내구성 타이머, `HttpClient` 호출 대신 액티비티, `Guid.NewGuid()` 대신 엔진이 주는 식별자입니다. 다른 곳에서라면 아무 문제 없을 평범한 코드가 여기서는 틀린 코드가 되고, 그 잘못은 며칠 뒤 인스턴스가 재생될 때까지 드러나지 않습니다.

두 번째 결과는 버전 관리입니다. 지난주에 시작된 인스턴스는 지난주 코드에 맞춰 쓰인 history이고, 새 코드가 다른 단계를 다른 순서로 예약한다면 그 history를 새 코드로 재생했을 때 어긋납니다. 엔진은 이를 감지하고 인스턴스를 망가뜨리는 대신 멈춥니다. 빠져나가는 길은 모두 의도적으로 골라야 합니다. 새 버전을 배포하기 전에 기존 인스턴스가 다 끝나기를 기다리거나, 엔진이 주는 버전 표시에 따라 오케스트레이션 안에서 갈라지거나, 새 워크플로 형식을 만들고 아무도 쓰지 않을 때까지 옛것을 그대로 돌리는 것입니다.

그 대가로 얻는 것은 history 자체를 잃지 않는 한 무엇이든 견디는 프로세스입니다. 이틀짜리 대기 한가운데의 배포는 사고가 아닙니다. 죽은 워커의 일은 다른 워커가 집어 갑니다. 그리고 history는 무슨 일이 있었는지에 대한 로그 문장이 아니라 일어난 일 그 자체의 기록이므로, 진행 중인 모든 인스턴스의 상태를 조회할 수 있습니다. 어떤 주문이 승인을 기다리고 있고 얼마나 오래 기다렸는지를, 따로 추적 코드를 붙이지 않고도 물어볼 수 있습니다.
