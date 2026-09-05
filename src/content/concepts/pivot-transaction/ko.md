---
title: "Pivot Transaction"
summary: "pivot은 saga에서 그 뒤로는 되돌아갈 수 없는 단계입니다. pivot 앞에서 실패하면 거꾸로 보상하고, pivot 뒤에서 실패하면 나머지 단계가 성공할 때까지 앞으로 재시도합니다."
category: "분산 트랜잭션과 메시지 일관성"
scene: saga
sceneStep: 4
related:
  - label: Saga
    slug: saga
  - label: Compensating Transaction
    slug: compensating-transaction
  - label: Orchestration
    slug: orchestration
  - label: Idempotency Key
    slug: idempotency-key
  - label: Retry
    slug: retry
  - label: Exponential Backoff
    slug: exponential-backoff
  - label: Dead Letter Queue
    slug: dead-letter-queue
references:
  - title: Saga distributed transactions pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/saga
  - title: Compensating Transaction pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/compensating-transaction
  - title: Transient fault handling
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/transient-faults
---

어느 saga에나 되돌릴 수 없는 단계, 또는 되돌리지 않기로 정한 단계가 있습니다. 확정한 결제, 보낸 메일, 이미 출고된 상자가 그렇습니다. 그 단계가 pivot이고, saga를 둘로 자릅니다. 앞쪽은 되돌릴 수 있으므로 실패에 역순 보상으로 답하고, 뒤쪽은 되돌릴 수 없으므로 남은 단계가 끝날 때까지 계속 시도하는 것만이 정직한 답입니다.

그래서 pivot 뒤의 단계는 성격이 다른 코드가 됩니다. 횟수를 제한한 재시도와 그 사이의 백오프가 필요하고, 지나가는 실패와 영구적인 실패를 구분해야 하며, 다시 실행해도 결과가 같게(idempotent) 만들어야 합니다. 두 번 결제하는 재시도는 그것이 고치려던 실패보다 나쁘기 때문입니다. 타임아웃이나 잠긴 행처럼 지나가는 실패가 재시도의 대상입니다. 어느 창고에도 재고가 없는 영구적인 실패는 아닙니다. 재시도를 아무리 해도 재고가 생기지는 않으므로, 이미 약속한 돈을 조용히 환불하는 대신 사람에게 넘기거나 앞으로 나아가는 다른 경로를 택합니다.

pivot을 견디는 가장 좋은 방법은 pivot을 옮기는 것입니다. 되돌릴 수 있는 단계를 앞에, 되돌릴 수 없는 단계를 최대한 뒤에 둡니다. 결제를 확정하기 전에 재고를 확보하면, 확보에 실패해도 반납 한 번이면 끝납니다. 결제를 먼저 하면 결제가 얼떨결에 pivot이 되고, 주문의 삼분의 일을 환불하는 시스템은 그렇게 만들어집니다. 되돌릴 수 없는 단계가 둘이라면, 다시 실행하기 쉬운 쪽을 뒤에 둡니다.

pivot은 주석이 아니라 코드에 표시합니다. 상태 머신이라면 이름이 붙은 전이가 되고, 그 뒤 상태의 실패 분기는 재시도만 보낼 뿐 보상은 보낼 수 없게 됩니다. 시도 횟수는 saga 인스턴스에 세어 두고, 모든 메시지를 saga id로 키를 잡아 `Reserve`의 세 번째 전달이 첫 번째와 같은 결과가 되게 하고, 포기 경로는 사람이 보는 곳으로 보냅니다. pivot을 지난 자리에서 멈춘 saga는 패턴의 결함이 아니라, 이 건에는 판단이 필요하다고 패턴이 알려 주는 신호입니다.
