---
title: "Offset Pagination"
summary: "500번째 페이지를 달라고 하면 데이터베이스는 버리려고 앞의 5천 행을 세며 지나갑니다. 받아 오는 페이지는 맞습니다. 다만 비용이 깊이에 비례해 커지고, 페이지 사이에서 행이 발밑에서 밀릴 수 있습니다."
category: ".NET 데이터 접근"
scene: database-index
sceneStep: 4
related:
  - label: Database Index
    slug: database-index
  - label: Keyset Pagination
    slug: keyset-pagination
  - label: Cursor Pagination
    slug: cursor-pagination
  - label: N+1 Query
    slug: n-plus-1-query
  - label: Materialized View
    slug: materialized-view
  - label: No-Tracking Query
    slug: no-tracking-query
  - label: Unique Constraint
    slug: unique-constraint
  - label: Prepared Statement
    slug: prepared-statement
  - label: Database Migration
    slug: database-migration
  - label: Idempotency-Key
    slug: idempotency-key
references:
  - title: Pagination (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/querying/pagination
  - title: SELECT - ORDER BY clause (Transact-SQL)
    url: https://learn.microsoft.com/en-us/sql/t-sql/queries/select-order-by-clause-transact-sql
  - title: Efficient querying (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/performance/efficient-querying
---

`OFFSET 5000 FETCH NEXT 20`은 "5천 개를 건너뛰고 20개를 달라"로 읽히는데, 이 "건너뛴다"라는 말이 많은 것을 감추고 있습니다. 데이터베이스는 아직 만들어 내지 않은 행을 건너뛸 수 없습니다. 주어진 순서에서 5001번째 행이 어느 것인지 알려면, 순서를 처음부터 걸어가며 5천 행을 세고, 그 전부를 버리고, 그제야 모으기 시작해야 합니다. 요청한 20행은 쌉니다. 요청하지도 않은 5천 행이 청구서의 전부이고, 그것이 독자가 "다음"을 누를 때마다 커지는 유일한 부분입니다.

그래서 offset 페이지네이션은 괜찮다가 갑자기 안 괜찮아집니다. 1페이지는 공짜이고, 10페이지는 눈에 띄지도 않으며, 500페이지는 20행을 돌려주려고 5020행을 건드리는 쿼리입니다. 그 사이에 코드는 아무것도 바뀌지 않았고 실행 계획도 그대로입니다. 개발 단계에서 이 문제를 놓치기가 그토록 쉬운 까닭이 여기 있습니다. 400행짜리 테스트 테이블은 비용이 사는 깊이까지 갈 수가 없습니다. 운영에서의 증상은 p99는 멀쩡한데 p999가 끔찍한 엔드포인트이고, 느린 요청들은 하나같이 `page` 값이 큽니다.

두 번째 문제는 속도와 아무 상관이 없습니다. offset은 결과 안의 위치로 행을 가리키는데, 위치는 움직입니다. 독자가 3페이지와 4페이지 사이에 있는 동안 앞쪽에 행이 하나 삽입되면 모든 행이 한 칸씩 밀려서, 3페이지의 마지막이던 행이 이제 4페이지의 첫 행이 됩니다. 독자는 같은 행을 두 번 봅니다. 반대로 행을 지우면 한 행이 통째로 건너뛰어집니다. 이것은 더 빨리 페이지를 넘겨서 고칠 수 있는 버그가 아닙니다. "이 앞에 행이 몇 개 있느냐"에 기대는 주소 체계는 쓰기가 일어나는 순간부터 불안정하고, 살아 있는 테이블을 훑는 내보내기 작업에서 가장 세게 물립니다.

그래도 offset이 정답인 자리가 둘 있고, 이건 분명히 해 둘 만합니다. 독자가 정말로 임의의 페이지 번호로 뛰어야 한다면 그것을 할 수 있는 것은 offset뿐입니다. keyset은 이전 페이지의 키가 필요한데 500페이지에는 손에 쥔 이전 페이지가 없기 때문입니다. 그리고 전체 집합이 작고 한계가 뚜렷하다면, 이를테면 설정 목록이나 몇천 행짜리 관리 테이블이라면, 깊이가 문제가 될 만큼 깊어지지 않으므로 `Skip`/`Take`가 가장 단순하게 잘 듣습니다. 읽기 엔드포인트에는 `AsNoTracking()`을 붙이고, 총 개수 쿼리는 습관으로 계산하지 말고 정말 필요할 때만 함께 보내세요. 그리고 `ORDER BY`가 전순서인지 확인하세요. 동점이 있으면 같은 페이지를 두 번 요청해도 다른 행이 나올 수 있고, 그것은 오류가 아닙니다.
