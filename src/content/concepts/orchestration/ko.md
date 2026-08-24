---
title: "Orchestration"
summary: "Orchestration은 조정자가 있는 saga입니다. 한 부품이 모든 명령을 보내고, 답이 올 때마다 saga가 어느 상태로 옮겨 갔는지 기록하고, 단계가 실패하면 보상까지 직접 지시합니다."
category: "분산 트랜잭션과 메시지 일관성"
scene: saga
sceneStep: 3
related:
  - label: Saga
    slug: saga
  - label: Choreography
    slug: choreography
  - label: State Machine
    slug: state-machine
  - label: Compensating Transaction
    slug: compensating-transaction
  - label: Correlation ID
    slug: correlation-id
  - label: Transactional Outbox
    slug: transactional-outbox
  - label: MassTransit
    slug: masstransit
references:
  - title: Saga distributed transactions pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/saga
  - title: MassTransit sagas
    url: https://masstransit.io/documentation/patterns/saga
  - title: Durable Functions overview
    url: https://learn.microsoft.com/en-us/azure/azure-functions/durable/durable-functions-overview
---

순서는 조정자가 쥡니다. Payment에 `Charge`를 보내고, 답을 기다리고, 이제 saga가 `Paid`라고 적고, Inventory에 `Reserve`를 보내는 식입니다. 서비스끼리 서로를 구독하지 않고 명령을 받아 답만 하므로, Choreography일 때보다 서비스가 단순해집니다. 다음에 무엇이 오는지도, 잘못됐을 때 누구에게 알려야 하는지도 알 필요가 없기 때문입니다.

핵심은 상태입니다. 행 하나가 모든 주문이 어디까지 갔는지 말해 주므로, "12번 주문은 왜 아직 배송되지 않았나"가 조사가 아니라 조회가 됩니다. 순서가 한곳에 있으니 순서를 바꾸는 일도 한 번의 수정이고, 실패 처리도 같은 곳에 있으니 어떤 단계가 끝났는지 실제로 아는 부품이 보상을 지시합니다. 타임아웃도 조정자의 몫입니다. 40초 전에 보낸 단계가 아직 답하지 않았다는 사실을 알아챌 수 있는 것은 조정자뿐입니다.

대가는 의존과 유혹입니다. 조정자가 멈추면 아무것도 움직이지 않으므로 저장소는 견고해야 하고, 재시작할 때는 처음이 아니라 기록된 상태에서 이어가야 합니다. 유혹은 조정자를 키우는 쪽으로 옵니다. 조정자는 단계를 순서대로 잇는 일만 하고 도메인 규칙은 서비스에 두어야 합니다. 그러지 않으면 기능을 추가할 때마다 반드시 손대야 하는 단 하나의 부품으로 서서히 변합니다.

.NET에서는 대개 절차가 아니라 상태 머신으로 씁니다. MassTransit, Dapr Workflow, Durable Functions, Temporal은 모두 같은 세 가지를 합니다. 인스턴스를 저장하고, 장애 뒤에 이어서 재개하고, 답 하나하나를 전이로 바꿉니다. 상태 저장과 다음 명령 발행을 outbox를 통해 한 트랜잭션 안에서 처리하고, 모든 핸들러가 correlation id로 중복을 걸러 내게 하고, 상태마다 타임아웃을 걸어 둡니다. 그래야 답하지 않는 단계가 일주일 동안 `Paid`에 머무는 행이 아니라 경보로 나타납니다.
