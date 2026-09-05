---
title: "Compensating Transaction"
summary: "Compensating Transaction은 이미 commit된 단계를 되돌리는 업무 동작입니다. rollback이 아닙니다. 첫 번째 효과는 실제로 일어나 남들에게 보였고, 보상은 그 위에 기록되는 두 번째 사실입니다."
category: "분산 트랜잭션과 메시지 일관성"
scene: saga
sceneStep: 2
related:
  - label: Saga
    slug: saga
  - label: Pivot Transaction
    slug: pivot-transaction
  - label: Orchestration
    slug: orchestration
  - label: Two-Phase Commit
    slug: two-phase-commit
  - label: Idempotency
    slug: idempotency
  - label: Optimistic Concurrency
    slug: optimistic-concurrency
references:
  - title: Compensating Transaction pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/compensating-transaction
  - title: Saga distributed transactions pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/saga
---

로컬 트랜잭션이 commit되고 나면 그 효과는 이미 공개된 것입니다. 카드에서 돈이 빠져나갔고, 행에는 재고가 확보되었다고 적혔고, 고객은 메일을 받았습니다. 어떤 데이터베이스도 그것을 되가져올 수 없습니다. 애초에 다른 두 서비스를 같은 트랜잭션 안에 붙잡고 있지 않았기 때문입니다. 그래서 되돌리기는 기술적인 조작이 아니라 업무 동작이 됩니다. 환불, 취소, 재고 반납은 각각 자기 행을 남기는 새로운 로컬 트랜잭션입니다.

순서가 중요합니다. 보상은 역순으로, 가장 최근 단계부터 실행되고, 각 보상은 자기 단계만 되돌리면 됩니다. 덕분에 보상은 작고 테스트하기 쉬운 상태로 남습니다. 환불 핸들러는 결제만 알면 됩니다. 동시에 saga는 실제로 끝난 단계가 무엇인지 기억하고 있어야 합니다. 실행된 적 없는 단계를 보상하는 순간, 받은 적 없는 돈을 돌려주는 시스템이 되기 때문입니다.

보상은 의미의 되돌리기이지 물리적인 되돌리기가 아닙니다. 환불이 끝나면 계좌에는 결제와 환불 두 줄이 남지, 아무 줄도 없는 상태가 되지 않습니다. 대개 업무가 원하는 것도 그쪽입니다. 흔적이 지워진 자리가 아니라 무슨 일이 있었는지 말해 주는 기록 말입니다. 중간 상태가 그 자체로 정당하도록 도메인을 설계합니다. `reserved`였다가 나중에 `released`가 될 수 있는 행은 깔끔하게 보상되지만, 곧바로 `shipped`로 건너뛴 행은 그렇지 않습니다.

보상을 무너뜨리는 것이 둘 있으니 미리 대비합니다. 아예 보상이 없는 단계가 있고, 그런 단계가 pivot입니다. 그 뒤로는 앞으로 가는 길밖에 없습니다. 그리고 보상도 다른 것과 마찬가지로 실패할 수 있는데, 보상에 대한 보상은 없으므로 성공할 때까지 재시도해야 합니다. 그래서 반복해도 결과가 같게(idempotent) 만드는 일이 선택 사항이 아닙니다. 모든 보상을 saga id로 키를 잡고, 두 번 실행한 결과가 한 번 실행한 결과와 같게 만들고, 재시도 횟수가 바닥나면 saga를 반쯤 되돌린 채 방치하는 대신 경보를 울립니다.
