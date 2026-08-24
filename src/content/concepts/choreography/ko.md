---
title: "Choreography"
summary: "Choreography는 조정자가 없는 saga입니다. 각 서비스가 자기 로컬 트랜잭션을 commit하고 이벤트를 발행하면, 그 이벤트를 구독한 쪽이 다음 단계를 실행합니다. 흐름은 어디에도 적혀 있지 않고 구독들의 합으로만 존재합니다."
category: "분산 트랜잭션과 메시지 일관성"
scene: saga
sceneStep: 1
related:
  - label: Saga
    slug: saga
  - label: Orchestration
    slug: orchestration
  - label: Competing Consumers
    slug: competing-consumers
  - label: Idempotent Consumer
    slug: idempotent-consumer
  - label: Transactional Outbox
    slug: transactional-outbox
  - label: Correlation ID
    slug: correlation-id
references:
  - title: Saga distributed transactions pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/saga
  - title: Event-driven architecture style
    url: https://learn.microsoft.com/en-us/azure/architecture/guide/architecture-styles/event-driven
  - title: MassTransit sagas
    url: https://masstransit.io/documentation/patterns/saga
---

Order가 자기 행을 commit하고 `OrderPlaced`를 발행합니다. Payment는 그 이벤트를 구독해 결제를 처리하고 `PaymentCompleted`를 발행합니다. Inventory는 그것을 구독해 재고를 확보합니다. 전체 순서를 아는 서비스는 하나도 없고, 서로를 직접 호출하지도 않습니다. 각자 어떤 이벤트에 반응하고 어떤 이벤트를 내보내는지만 압니다. 단계를 늘리는 일이 구독자를 하나 더 붙이는 일로 끝나기 때문에, 시작할 때는 무척 싸게 느껴집니다.

얻는 것은 독립성입니다. 흐름이 움직이기 위해 반드시 살아 있어야 하는 부품이 없고, 배포를 함께 묶을 일도 없으며, 한 서비스를 고쳤다고 다른 서비스를 따라 고쳐야 하는 자리도 없습니다. 같은 이벤트에 사기 탐지 단계를 붙이는 일도 누구에게 묻지 않고 할 수 있고, 서비스는 핸들러 하나와 발행 하나로 작게 남습니다.

잃는 것은 흐름 자체입니다. 순서가 코드 어디에도 나타나지 않으므로 "12번 주문은 어디까지 갔고 왜 멈췄나"에 답하려면 서비스 세 곳의 로그를 읽어 사슬을 손으로 다시 이어 붙여야 합니다. 실패 처리도 흩어집니다. Inventory가 재고를 확보하지 못하면 Payment에게 알려야 한다는 사실을 스스로 알고 있어야 하므로, saga의 지식 한 조각이 그것을 몰라도 될 서비스 안으로 들어갑니다. 순환이 생기기도 쉽고, 단계 순서를 바꾸는 일은 구독 여러 개를 한꺼번에 고치는 일이 됩니다.

버틸 수 있게 만드는 습관이 셋 있습니다. 행을 commit하는 트랜잭션 안에서 outbox를 거쳐 발행해, 이벤트 없이 commit만 되는 단계가 없게 합니다. 모든 메시지에 correlation id를 넣고 어디서나 함께 남겨, 나중에 사슬을 다시 맞출 수 있게 합니다. 브로커는 최소 한 번 전달하므로 모든 소비자를 반복해도 결과가 같게(idempotent) 만듭니다. 흐름이 몇 단계를 넘어가거나 분기가 생기기 시작하면, 구독을 하나 더 붙이는 대신 조정자에게 흐름을 옮길 때입니다.
