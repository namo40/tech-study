---
title: "Keyset Pagination"
summary: "5001번째 행을 달라고 하는 대신, 마지막으로 본 키 다음의 행들을 달라고 합니다. 인덱스는 그 키로 곧장 시크해서 앞으로 읽어 나가므로 모든 페이지의 값이 같고, 독자의 발밑에서 아무것도 밀리지 않습니다."
category: ".NET 데이터 접근"
scene: database-index
sceneStep: 4
related:
  - label: Database Index
    slug: database-index
  - label: Offset Pagination
    slug: offset-pagination
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
  - title: SQL Server index architecture and design guide
    url: https://learn.microsoft.com/en-us/sql/relational-databases/sql-server-index-design-guide
  - title: Efficient querying (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/performance/efficient-querying
---

keyset 페이지네이션은 질문을 바꾸고, 그것이 요령의 전부입니다. offset은 "5001번부터 5020번 위치에 있는 행이 무엇이냐"를 묻는데, 이 질문에는 어떤 인덱스도 세지 않고는 답할 수 없습니다. keyset은 "이 키 다음에 오는 행이 무엇이냐"를 묻고, 이것은 정렬된 구조가 공짜로 답해 주는 바로 그 질문입니다. 키까지 내려가서, 앞으로 읽습니다. 읽은 행 20개, 버린 행 0개이고, 독자가 2페이지에 있든 500페이지에 있든 똑같이 20개입니다. 장면에서는 인덱스의 모든 블록에 불이 켜지느냐, 하나에만 켜지느냐의 차이입니다.

구현은 기능이 아니라 `WHERE` 절입니다. `.Where(o => o.Id > lastSeenId).OrderBy(o => o.Id).Take(20)`이 전부이고, 각 페이지의 마지막 행이 다음 페이지가 출발할 키를 들고 있습니다. 그것이 곧 제약이기도 합니다. 이미 본 페이지의 다음 페이지로만 갈 수 있습니다. 500페이지로 뛰는 일은 없습니다. "500페이지"는 위치인데 keyset은 위치를 다루지 않기 때문입니다. 무한 스크롤, "더 보기", 백그라운드 내보내기 작업, 그리고 클라이언트가 앞으로만 걸어가는 모든 API에서 이 제약은 아무 값도 치르지 않습니다. 페이지 번호와 점프 상자가 달린 화면에서는 치명적이고, 그때는 offset이 정직한 답입니다.

정렬 키는 고유해야 합니다. 그렇지 않으면 시크가 동점 행 무리 한가운데를 가르고 지나가면서 행이 사라집니다. `CreatedAt` 하나로만 정렬하면 페이지 경계와 같은 시각을 가진 행이 전부 위험해집니다. 해결은 기본 키를 뒤에 붙여 전순서로 만드는 것이고, 그러면 비교도 조건 두 개가 아니라 튜플 비교가 되어야 합니다. `WHERE (CreatedAt, Id) > (@lastCreated, @lastId)`입니다. LINQ에서는 `.Where(o => o.CreatedAt > last.CreatedAt || (o.CreatedAt == last.CreatedAt && o.Id > last.Id))`가 되는데, 길기는 해도 경계의 양쪽에서 모두 맞는 유일한 형태입니다. 내림차순은 모든 비교를 뒤집으므로, 영리한 쿼리 하나로 합치지 말고 두 방향을 각각 쓰고 각각 시험하세요.

인덱스는 정렬과 정확히 같아야 하고 방향까지 같아야 합니다. 그러지 않으면 시크가 조용히 테이블 전체 정렬로 바뀌어 아무것도 얻지 못합니다. `(CreatedAt, Id)`로 정렬하면 인덱스도 `(CreatedAt, Id)`입니다. 덧붙일 것이 둘 있습니다. keyset은 삽입과 삭제에 흔들리지 않으므로, 살아 있는 테이블을 넘기는 독자는 각 행을 많아야 한 번 봅니다. 느리지 않더라도 내보내기와 동기화 작업이 keyset을 써야 하는 이유가 그것입니다. 그리고 키가 무언가를 흘린다면 날것 그대로 클라이언트에게 주지 마세요. 같은 값을 담은 불투명한 서명 커서는 겉모습만 나은 같은 구조이고, 그것이 바로 커서 페이지네이션입니다.
