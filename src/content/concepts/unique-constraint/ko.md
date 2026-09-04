---
title: "Unique Constraint"
summary: "정렬된 인덱스에 걸어 두는 규칙입니다. 끼워 넣을 때 이 값이 들어갈 자리가 이미 차 있으면 거절합니다. 검사와 선점이 하나의 구조 안 한 지점에서 일어나므로, 경쟁하는 두 삽입이 둘 다 이길 수는 없습니다."
category: ".NET 데이터 접근"
scene: database-index
sceneStep: 3
related:
  - label: Database Index
    slug: database-index
  - label: Idempotency Key
    slug: idempotency-key
  - label: N+1 Query
    slug: n-plus-1-query
  - label: Prepared Statement
    slug: prepared-statement
  - label: Database Migration
    slug: database-migration
  - label: Materialized View
    slug: materialized-view
  - label: No-Tracking Query
    slug: no-tracking-query
  - label: Offset Pagination
    slug: offset-pagination
  - label: Keyset Pagination
    slug: keyset-pagination
  - label: Cursor Pagination
    slug: cursor-pagination
references:
  - title: Unique constraints and check constraints
    url: https://learn.microsoft.com/en-us/sql/relational-databases/tables/unique-constraints-and-check-constraints
  - title: Indexes (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/modeling/indexes
  - title: CREATE INDEX (Transact-SQL)
    url: https://learn.microsoft.com/en-us/sql/t-sql/statements/create-index-transact-sql
---

고유 제약은 거의 공짜인데, 그 이유가 장면의 3단계입니다. 인덱스는 이미 정렬되어 있으므로, 삽입은 값을 넣기 전에 그 값이 들어갈 자리를 어차피 찾아야 합니다. 여기에 "그 자리에 이미 무언가 앉아 있으면 거절하라"를 더하는 데는 추가 탐색도, 추가 읽기도, 별도의 구조도 들지 않습니다. 데이터베이스가 이 제약을 별도의 규칙집이 아니라 인덱스로 구현하는 까닭이 그것입니다. 제약을 지키는 일이 쓰기가 이미 하고 있던 일입니다.

그 대가로 얻는 것은 애플리케이션 코드가 스스로 만들 수 없는 단 한 가지입니다. "중복을 허용하지 않는다"의 뻔한 구현은 먼저 조회해 보고 아무것도 없으면 삽입하는 것인데, 이것은 세상의 모든 데이터베이스에서 틀립니다. 두 요청이 둘 다 조회해서 둘 다 아무것도 못 찾고 둘 다 삽입할 수 있기 때문입니다. 검사와 쓰기 사이의 그 틈에서 중복이 만들어집니다. 고유 인덱스는 그 틈을 아예 갖지 않는 방식으로 닫습니다. 자리를 찾는 탐색과 그 자리를 차지하는 쓰기가 한 지점의 한 걸음이라서, 같은 값으로 도착한 둘 가운데 정확히 하나만 그 값을 가지고 나갑니다. 장면에서는 테이블을 건드리지도 않습니다. 행이 하나라도 쓰이기 전에 인덱스가 혼자 답합니다.

그래서 코드의 올바른 모양은 뛰기 전에 살펴보는 것이 아닙니다. 일단 삽입하고, 실패를 답으로 받는 것입니다. `SaveChangesAsync`는 `DbUpdateException`을 던지고, 그 아래에는 "고유 위반"을 콕 집어 말하는 공급자 오류 번호가 있습니다. SQL Server라면 2601이나 2627, PostgreSQL이라면 `23505`입니다. 그것이 `409 Conflict`를 돌려주거나, 이미 있는 행을 읽어 그대로 이어 가라는 신호입니다. 흔한 실수는 모든 `DbUpdateException`을 똑같이 잡는 것입니다. 외래 키 위반과 타임아웃도 같은 외투를 입고 오는데, 그것들까지 "이미 있음"으로 삼켜 버리면 진짜 버그가 가려집니다. 바깥 예외가 아니라 안쪽 예외를 보고 가르세요.

선언하기 전에 알아 둘 것이 셋 있습니다. `NULL`은 자기 자신과 같지 않아서, 대부분의 데이터베이스에서는 고유 칼럼에 `NULL`을 담은 행이 여럿 있을 수 있습니다. 그것이 원하는 바가 아니라면 그 칼럼은 널을 허용하지 않아야 합니다. 여러 칼럼을 묶은 고유성은 각각의 고유성과 다른 규칙입니다. `HasIndex(x => new { x.TenantId, x.Email }).IsUnique()`는 테넌트마다 이메일 하나라는 뜻이고, 전역 이메일에 대해서는 아무 말도 하지 않습니다. 그리고 비교 규칙은 여러분의 것이 아니라 칼럼의 것입니다. `Ann@example.com`이 `ann@example.com`과 부딪히는지는 콜레이션이 정하므로, 바라지 말고 들어올 때 값을 정규화하세요. 행을 소프트 삭제한다면 필터(`HasFilter("[DeletedAt] IS NULL")`)를 붙여, 삭제된 행이 그 값을 영원히 잡아 두지 않게 하세요.
