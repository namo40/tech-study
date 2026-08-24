---
title: "Lost Update"
summary: "Lost Update는 두 트랜잭션이 같은 행을 읽고 각자 읽은 값으로 새 값을 계산한 뒤, 두 번째 쓰기가 첫 번째 쓰기를 조용히 덮어쓰는 일입니다. 오류도 로그도 남지 않고, 첫 번째 변경만 사라집니다."
category: "트랜잭션과 동시성"
scene: deadlock
sceneStep: 4
related:
  - label: Optimistic Concurrency
    slug: optimistic-concurrency
  - label: Row Version
    slug: row-version
  - label: Concurrency Token
    slug: concurrency-token
  - label: Deadlock
    slug: deadlock
  - label: Lock
    slug: lock
  - label: Isolation Level
    slug: isolation-level
references:
  - title: Handling concurrency conflicts (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/saving/concurrency
  - title: Transaction locking and row versioning guide (SQL Server)
    url: https://learn.microsoft.com/en-us/sql/relational-databases/sql-server-transaction-locking-and-row-versioning-guide
---

모양은 언제나 같습니다. 값을 읽고, 애플리케이션 코드에서 그 값으로 새 값을 계산하고, 새 값을 다시 씁니다. 두 요청이 이 일을 동시에 하면 둘 다 10을 읽고 하나는 11을, 다른 하나는 12를 쓰며, 행은 12로 끝납니다. 두 번의 증가 중 하나가 사라진 것입니다. 아무도 오류를 받지 않으므로, 남는 흔적이라고는 그동안 일어난 일과 맞지 않는 합계뿐입니다.

이 문제가 잘 숨는 이유는 쓰기의 기본 동작이 마지막에 쓴 쪽이 이기는 방식이고, 다른 거의 모든 곳에서는 그 동작이 우리가 원하는 것이기 때문입니다. read committed도 막아 주지 않습니다. 두 읽기 모두 커밋된 데이터를 읽었고, 두 쓰기 모두 정당했습니다. 문제가 되는 구간은 읽기와 쓰기 사이의 틈뿐이라서, 테스트에서는 좀처럼 재현되지 않다가 부하가 걸리면 흔해집니다. 사용자가 편집 화면에 오래 머무를수록 더 심해지는 이유도 같습니다.

해결책은 셋이고, 각각 맞는 일이 다릅니다. 새 값이 옛 값의 함수라면 계산을 데이터베이스에서 하고 읽기를 아예 건너뜁니다. `UPDATE Accounts SET Balance = Balance + @delta WHERE Id = @id`는 문장 하나이므로 잃어버릴 것이 없습니다. 값이 애플리케이션의 판단에 달려 있다면, 그동안 락을 잡고 있거나 행에 버전을 붙여 갱신을 그 버전에 조건부로 만듭니다. 화면을 거치는 일이라면 대개 버전 검사가 기본값으로 알맞습니다. 사용자가 생각하는 동안 쥐고 있는 것이 없고, 소리 없는 덮어쓰기를 우리가 처리할 수 있는 충돌로 바꿔 주기 때문입니다.

무엇을 고르든 어떤 행이 보호되고 있는지는 적어 둡니다. 버전 컬럼이 고쳐 주는 숫자 문제는 눈에 띄는 쪽일 뿐이고, 재고가 음수로 내려가거나, 상태가 거꾸로 돌아가거나, 감사 기록에 한 단계가 빠지는 일도 모두 같은 모양에서 나옵니다.
