---
title: "Human Approval"
summary: "사람 승인은 사람이 결정을 내릴 때까지 기다리는 단계입니다. 서비스 수준 약속이 없는 외부 이벤트이므로, 기다릴 상태와 기한, 그리고 기한이 지났을 때 할 일이 필요합니다."
category: "예약 작업과 워크플로"
scene: state-machine
sceneStep: 4
related:
  - label: State Machine
    slug: state-machine
  - label: Durable Workflow
    slug: durable-workflow
  - label: Long-Running Process
    slug: long-running-process
  - label: Workflow Engine
    slug: workflow-engine
  - label: Scheduled Job
    slug: scheduled-job
  - label: Timeout
    slug: timeout
  - label: Idempotency
    slug: idempotency
  - label: Saga
    slug: saga
  - label: Azure Durable Functions
    slug: azure-durable-functions
  - label: Temporal
    slug: temporal
references:
  - title: "Human interaction in durable functions"
    url: https://learn.microsoft.com/en-us/azure/azure-functions/durable/durable-functions-overview#human
  - title: "Wait for external events in durable orchestrations"
    url: https://learn.microsoft.com/en-us/azure/azure-functions/durable/durable-functions-external-events
  - title: "Temporal signals"
    url: https://docs.temporal.io/encyclopedia/application-message-passing
---

승인은 언뜻 다른 서비스를 호출하는 일처럼 보입니다. 이름값을 하는 타임아웃이 없다는 점을 알아채기 전까지는 그렇습니다. 서비스는 1초 안에 답하거나 실패한 것이지만, 사람은 한 시간 뒤에 답하기도 하고 월요일에 답하기도 하며 두 번 재촉을 받은 뒤에 답하기도 합니다. 그중 어느 것도 실패가 아닙니다. 승인을 호출이 아니라 상태로 만드는 것이 바로 이 차이 하나입니다.

그래서 프로세스는 멈춰 섭니다. 무엇을 기다리는지 말하는 상태로 옮겨 가 그 상태를 기록하고 실행을 멈춥니다. 장면의 네 번째 단계가 보여 주는 그대로입니다. 주문은 `Paid`에 서 있고 엔진의 단계 표시는 `wait for approval`입니다. 스레드도 연결도 붙들려 있지 않으므로, 클러스터의 모든 머신이 재시작해도 살아남아야 할 것은 그 행 하나뿐입니다. 사람이 결국 무엇을 했는지는 평범한 이벤트로 도착해, 다른 모든 이벤트와 같은 표에서 조회되고, 기계를 다음으로 옮깁니다.

끝이 없는 대기는 누수이므로, 승인에는 대기가 시작되는 그 순간에 함께 걸리는 기한이 늘 따라붙습니다. 흥미로운 설계 질문은 그 기한이 무엇을 하느냐입니다. 흔한 답은 에스컬레이션입니다. 두 번째 승인자나 첫 승인자의 상급자에게 다시 배정하고 새 기한을 겁니다. 자동 승인은 값이 작은 결정에는 타당하지만 그 밖에는 부담입니다. 무언가를 허용할지 정하는 결정이라면 자동 거절이 가장 안전합니다. 무엇을 고르든 그것은 대기 상태에서 `timeout` 이벤트로 나가는 전이로 표 안에 있어야 합니다. 그래야 표를 훑는 배치 작업이 어쩌다 그렇게 만든 결과가 되지 않습니다.

실무에서 문제를 일으키는 것은 대개 두 가지입니다. 첫째, 승인은 두 번 도착합니다. 누군가 메일의 링크를 누르고 휴대폰에서 한 번 더 누르거나, 이미 결정이 난 뒤에 재촉 메일에 답하기도 합니다. 핸들러는 떠나려는 상태를 가정하지 말고 확인해야 합니다. 그러지 않으면 같은 승인이 이미 움직인 기계를 한 번 더 움직입니다. 둘째, 사람은 떠납니다. 개인에게 보낸 승인은 계획보다 훨씬 자주 그 사람의 계정보다 오래 살아남으므로, 승인은 역할 앞으로 보내고 알림을 내보낼 때 역할을 사람으로 풀어 주십시오.

마지막으로, 기록을 로깅이 아니라 기능의 일부로 다루십시오. 누가, 언제, 요청의 어느 버전에 대해 승인했고 그때 무엇을 보고 있었는지는 사후에 반드시 나오는 질문이고, 내구성 워크플로는 이미 그 답이 되는 history를 갖고 있습니다. 다만 승인자가 무엇을 보고 있었는지는 그것만으로 답해 주지 않으므로, 지금 화면이 보여 주는 것에 대한 링크가 아니라 결정의 입력값 자체를 이벤트에 담으십시오.
