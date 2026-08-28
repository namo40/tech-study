---
title: "Distributed Transaction"
summary: "여러 저장소에 걸쳐 커밋되거나 롤백되어야 하는 하나의 작업 단위입니다. 바람 자체는 평범한데, 어려운 것은 어느 저장소도 혼자서는 결과를 정할 수 없다는 점입니다."
category: "트랜잭션과 동시성"
scene: two-phase-commit
sceneStep: 1
related:
  - label: Two-Phase Commit
    slug: two-phase-commit
  - label: Local Transaction
    slug: local-transaction
  - label: Saga
    slug: saga
  - label: Compensating Transaction
    slug: compensating-transaction
  - label: Transactional Outbox
    slug: transactional-outbox
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Isolation Level
    slug: isolation-level
  - label: Idempotency Key
    slug: idempotency-key
  - label: Distributed Lock
    slug: distributed-lock
  - label: Deadlock
    slug: deadlock
references:
  - title: "Transaction Fundamentals"
    url: https://learn.microsoft.com/en-us/dotnet/framework/data/transactions/transaction-fundamentals
  - title: "Enlisting Resources as Participants in a Transaction"
    url: https://learn.microsoft.com/en-us/dotnet/framework/data/transactions/enlisting-resources-as-participants-in-a-transaction
  - title: "Distributed data in cloud-native applications"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/cloud-native/distributed-data
---

장면의 첫 단계는 모두가 원하는 것과 그것을 어렵게 만드는 것을 한 그림에 담습니다. Orders와 Payments는 저장소 둘입니다. 주문과 청구는 하나의 업무적 사실입니다. 잠깐 동안 다이어그램은 그 둘을 따로 커밋했을 때 벌어지는 일을 보여 줍니다. Orders는 `committed`라고 말하고 Payments는 `aborted`라고 말하며, 고객은 아무도 대금을 받지 못한 주문을 들고 있게 됩니다. 그 고스트가 문제 정의의 전부입니다.

로컬 트랜잭션은 저장소 하나 안에서 이 문제를 완전히 해결합니다. 데이터베이스에는 로그 하나, 잠금 관리자 하나, 커밋 레코드가 기록되는 순간 하나가 있으므로, 원자성은 프로토콜이 아니라 기계의 성질입니다. 같은 보장을 기계 두 대에 요구하면, 그것을 기록할 공유된 순간이 없습니다. 각자는 자기 몫을 커밋할 수 있습니다. 어느 쪽도 상대에 대해서는 아무것도 약속할 수 없습니다. 서로의 소식을 네트워크를 통해 알게 되는데, 그 네트워크는 느려도 되고, 끊겨도 되고, 결정이 이미 내려진 뒤에 메시지를 배달해도 되기 때문입니다.

그래서 남는 것은 순수하게 국소적인 답이 없는 조율 문제입니다. 누군가는 저장소 전체를 위해 결과를 쥐고 있어야 하고, 모든 저장소는 그 누군가가 하는 말에 구속되기로 동의해야 합니다. 스스로 결정할 권리를 내려놓고, 준비해 둔 것을 지시가 올 때까지 붙들고 있겠다는 동의입니다. 2단계 커밋이 문서로 적어 둔 계약이 그것이고, 프로토콜에서 비싼 것은 모두 여기서 나옵니다. 약속을 모으는 추가 왕복, 약속하는 동안 각 저장소가 유지하는 잠금, 그리고 약속은 했는데 그 약속이 무엇을 위한 것이었는지 아직 들을 수 없는 구간입니다.

여기서 "분산"이 무엇을 뜻하는지는 정확히 짚어 둘 만합니다. 기계가 몇 대인가의 문제가 아니기 때문입니다. 같은 물리 서버 위의 데이터베이스 두 개도 여전히 리소스 관리자 둘이고 여전히 프로토콜이 필요합니다. 한 데이터베이스 안의 테이블 열 개는 하나의 트랜잭션이고 아무것도 필요하지 않습니다. 트랜잭션을 쪼개는 것은 호스트의 수가 아니라 커밋을 소유한 주체의 수이며, 우연히 만들어지는 분산 트랜잭션이 바로 여기서 나옵니다. 커넥션 두 개를 감싼 `TransactionScope`는 코드에서는 트랜잭션 하나로 보이고 데모에서도 트랜잭션 하나입니다. 두 번째 커넥션이 참여하면 런타임이 그것을 승격시키고, 아무도 결정하지 않은 채 그 물건의 모양이 바뀝니다.

그래서 설계의 대부분은 프로토콜을 고르기 전에 끝납니다. 분산 트랜잭션처럼 보이는 것 중 일부는 잘못된 이유로 쪼개진 저장소이고, 다시 합치는 것이 답입니다. 일부는 변경을 알리는 메시지와만 원자적이면 되는 쓰기인데, 트랜잭셔널 아웃박스가 로컬 트랜잭션 하나로 코디네이터 없이 해결합니다. 일부는 정말로 소유자를 넘나들고, 그때의 선택지는 두 가지입니다. 결정이 나는 동안 네트워크 너머로 잠금을 붙들거나, 각 부분을 진행하면서 커밋하고 나중 단계가 실패하면 끝난 것들을 되돌리거나. 앞이 2단계 커밋이고, 아무도 반쪽 상태를 관찰하지 않는다는 보장을 삽니다. 뒤가 사가이고, 누군가는 그것을 본다는 사실을 받아들입니다.

절대로 선택지가 아닌 답 하나는, 장면 속 고스트가 보여 주는 그것입니다. 독립된 커밋 두 번과 두 번째도 성공하리라는 기대. 모든 시험에서 잘 돕니다. 시험에서는 둘 다 성공하기 때문입니다. 그 방식에 없는 것은 두 커밋 사이의 구간에 대한 이야기이고, 실제 시스템은 바로 그 구간에서 살아갑니다.
