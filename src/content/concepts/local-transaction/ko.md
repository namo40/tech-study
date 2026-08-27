---
title: "Local Transaction"
summary: "로컬 트랜잭션은 하나의 리소스, 보통은 하나의 연결 위에 있는 하나의 데이터베이스 안에서 시작하고 끝나는 작업 단위여서, 커밋 한 번이 그 안의 모든 것의 운명을 정합니다. 결정 지점이 하나뿐이라는 점이 원자성을 싸게 만들고, 그 위가 모든 격리 수준이 펼쳐지는 무대입니다."
category: "트랜잭션과 동시성"
scene: isolation-level
sceneStep: 1
related:
  - label: Isolation Level
    slug: isolation-level
  - label: Lock
    slug: lock
  - label: Deadlock
    slug: deadlock
  - label: Unit of Work
    slug: unit-of-work
  - label: Change Tracking
    slug: change-tracking
  - label: Saga
    slug: saga
  - label: Transactional Outbox
    slug: transactional-outbox
  - label: Optimistic Concurrency
    slug: optimistic-concurrency
references:
  - title: Using transactions (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/saving/transactions
  - title: DbTransaction Class
    url: https://learn.microsoft.com/en-us/dotnet/api/system.data.common.dbtransaction
  - title: TransactionScope Class
    url: https://learn.microsoft.com/en-us/dotnet/api/system.transactions.transactionscope
---

장면의 첫 번째 단계는 두 트랜잭션과 한 행을 보여 줍니다. 그런데 애초에 저 그림이 성립하게 만드는 것이 무엇인지는 짚어 둘 값어치가 있습니다. 두 트랜잭션 모두 같은 데이터베이스 안에, 각자의 연결 위에 살고 있고, 각각은 자기가 한 일을 전부 공개하거나 전부 버리는 명령 하나로 끝납니다. 그것이 로컬 트랜잭션이고, 이것을 규정하는 성질은 작다는 것이 아니라 동의해야 하는 참여자가 정확히 하나라는 것입니다. 조율할 대상이 없고, 첫 번째가 아니라고 한 뒤에 예라고 말할 수 있는 두 번째 시스템도 없으므로, 작업의 절반만 보이는 창도 없습니다.

결정 지점이 하나라는 점이 원자성과 일관성과 지속성이 비싸기를 그만두는 자리입니다. 데이터베이스에는 롤백을 되돌리고 크래시를 되살리는 데 필요한 미리 쓰기 로그가 이미 있고, 커밋은 거기에 남기는 레코드 하나입니다. 네 가지 중에서 격리만 성격이 다른데, 나에게 비용을 물리는 대신 다른 트랜잭션에게 비용을 물리는 유일한 성질이기 때문입니다. 고른 수준은 아직 끝나지 않은 내 작업을 이웃이 얼마나 볼 수 있는지, 그리고 보지 않기 위해 얼마나 기다리는지를 정합니다. 장면에 나오는 모든 격리 수준은 로컬 트랜잭션 하나의 내부에 관한 규칙입니다.

대부분의 애플리케이션이 실제로 돌리는 모양은 스스로 생각하는 모양보다 작습니다. EF Core의 `SaveChanges` 한 번은 이미 트랜잭션입니다. 프레임워크가 하나를 열고, 추적 중인 삽입과 수정과 삭제를 전부 보내고, 커밋하므로, 엔터티 백 개에 대한 변경 백 개가 함께 반영되거나 함께 반영되지 않습니다. 명시적인 `BeginTransaction`은 작업 단위가 `SaveChanges` 여러 번에 걸칠 때, 수준이 기본값이 아니어야 할 때, 또는 어떤 읽기가 나중의 쓰기와 같은 스냅샷에 고정되어야 할 때에만 필요합니다. `SaveChanges` 한 번을 명시적 트랜잭션으로 감싸면 왕복 한 번이 늘 뿐 얻는 것은 없습니다.

내용물보다 경계가 더 중요합니다. 트랜잭션은 `BEGIN`부터 `COMMIT`까지 열려 있고, 그 사이에 잡은 잠금은 언제 잡았든 그 구간 전체 동안 유지되므로, HTTP 호출을 기다리며 400밀리초를 보내는 트랜잭션은 다른 모두를 400밀리초 기다리게 만든 트랜잭션이기도 합니다. 여기서 따라 나오는 규칙은 단순하고 자주 깨집니다. 다른 시스템과의 대화는 시작하기 전이나 커밋한 뒤에 하고, 그 사이에는 하지 마세요. 같은 규칙이 사용자가 고민하는 시간도, 블로킹되는 메시지 발송도, 소비자가 딴 데로 가 버리는 지연 평가 쿼리도 함께 걷어냅니다.

두 번째 리소스가 합류하는 순간 로컬 트랜잭션은 사라지고 보장의 모양이 바뀝니다. 같은 작업 안에서 데이터베이스에 쓰고 메시지 브로커에 발행하는 일은 로컬 트랜잭션으로는 원자적일 수 없습니다. 이제 두 시스템이 합의해야 하기 때문입니다. 분산 트랜잭션은 대부분의 시스템이 치기를 거부하는 값을 치르고 그 합의를 강제할 수 있고, 그래서 흔한 답들은 질문 자체를 피해 갑니다. 메시지를 같은 데이터베이스에 행으로 써 두고 별도의 프로세스가 배달하게 하거나, 두 단계가 별개임을 받아들이고 두 번째 단계를 반복해도 안전하게 만듭니다. 두 답 모두 원자적인 부분을 로컬로 유지하는 방식으로 동작합니다.

훤히 보이는 곳에 숨어 있는 경계가 하나 더 있는데, 그것은 연결입니다. 트랜잭션은 연결에 속하지 요청이나 주변 컨텍스트나 리포지터리 객체에 속하지 않습니다. 트랜잭션 안에서 두 번째 연결을 여는 코드는 그 작업을 트랜잭션 바깥에서, 기본 수준으로, 커밋되지 않은 변경은 보지 못한 채, 롤백의 보호도 받지 못한 채 돌리고 있습니다. EF Core에서는 첫 번째 컨텍스트의 트랜잭션 안에서 두 번째 `DbContext`를 만드는 모양으로 나타나고, 증상은 호출한 쪽이 방금 쓴 행을 쿼리가 보지 못하는 것입니다. `DbContext.Database.UseTransaction`이 정확히 이 경우를 위해 있습니다. 두 번째 컨텍스트가 옆에서 새 트랜잭션을 시작하는 대신 이미 돌고 있는 트랜잭션에 합류하게 해 줍니다.
