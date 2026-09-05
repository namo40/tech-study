---
title: "Cursor Pagination"
summary: "cursor는 독자가 실제로 마지막으로 본 행을 가리키므로, 다음 페이지는 그 행 다음으로의 시크입니다. 깊이가 얼마든 비용이 같고 위쪽에 행이 생겨도 흔들리지 않습니다. 대신 다음으로만 갈 수 있고 57페이지로는 못 갑니다."
category: ".NET 데이터 접근"
scene: pagination
sceneStep: 3
related:
  - label: Pagination
    slug: pagination
  - label: Offset Pagination
    slug: offset-pagination
  - label: Keyset Pagination
    slug: keyset-pagination
  - label: Database Index
    slug: database-index
  - label: Query Plan
    slug: query-plan
  - label: Prepared Statement
    slug: prepared-statement
  - label: N+1 Query
    slug: n-plus-1-query
  - label: Materialized View
    slug: materialized-view
  - label: Batching
    slug: batching
  - label: Backpressure
    slug: backpressure
references:
  - title: Pagination (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/querying/pagination
  - title: RESTful web API design
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/api-design
  - title: Pagination in Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/cosmos-db/query/pagination
---

cursor는 개수가 아니라 행으로 만든 책갈피입니다. "4페이지를 달라"가 아니라 "내가 마지막으로 본 행 다음을 달라"고 말하면, 데이터베이스는 그것을 `WHERE key > @after ORDER BY key LIMIT 20`으로 옮깁니다. 정렬 컬럼에 인덱스가 있고 비교가 범위이므로 엔진은 그 위치로 곧장 시크해서 스무 행을 읽습니다. 페이지 앞의 행들을 만들어 내지 않으니 그만큼을 내지도 않습니다. 2페이지든 2000페이지든 비용이 같고, 실행 계획의 모양도 같습니다. 이 평평함이 cursor를 고르는 첫 번째 이유이고, 깊이에 한계가 없는 엔드포인트에서는 이것 하나로 결론이 납니다.

두 번째 이유는 책갈피가 움직이지 않는다는 점입니다. 결과 안의 위치는 그 위에 무언가 쓰이는 순간 밀립니다. 그래서 번호로 매긴 페이지는 독자가 이미 본 행을 다시 돌려주거나, 아무도 못 본 행을 조용히 건너뜁니다. 키는 밀리지 않습니다. 독자가 페이지 사이에 있는 동안 맨 위에 열 행이 삽입돼도 마지막으로 본 행의 키는 그대로라서 다음 페이지는 여전히 그 바로 뒤에서 시작하고, 새 열 행은 그저 창 위쪽 제자리에 놓입니다. 내보내기, 동기화 엔드포인트, 살아 있는 테이블을 훑는 작업을 offset이 아니라 cursor로 써야 하는 까닭이 여기 있습니다. 그런 독자들이야말로 읽는 동안 테이블이 바뀔 만큼 느린 독자들입니다.

두 이점의 청구서는 cursor가 주소가 아니라 자리라는 것입니다. 다음으로 갈 수 있고 비교를 뒤집으면 이전으로도 갈 수 있지만, "57페이지"를 뜻하는 식은 없습니다. cursor는 바로 앞 페이지가 손에 쥐여 주어야만 생기기 때문입니다. 끝없는 피드는 이것을 아쉬워하지 않고, 임의의 페이지 번호가 정말로 필요한 사용자는 offset을 원한다고 말하고 있는 셈입니다. 조용한 조건이 하나 더 있습니다. 정렬은 전순서여야 합니다. 유일하지 않은 컬럼 위의 cursor는 동점인 행들 중 어디에서 멈췄는지 말할 수 없어서 경계에서 행을 반복하거나 잃습니다. 그 컬럼을 기본 키와 묶고, 둘을 튜플로 비교하고, 같은 순서로 인덱스를 만듭니다.

cursor는 키 자체가 아니라 불투명한 토큰으로 돌려줍니다. 작은 JSON이나 이진 값을 base64url로 감싸는 정도의 인코딩만으로 세 가지를 얻습니다. 호출자가 언젠가 바꾸고 싶어질 형식에 기대지 않게 되고, 보면 안 되는 행으로 위치를 위조할 수 없게 되며, 내부 식별자가 URL과 로그와 리퍼러 헤더로 새 나가지 않습니다. 토큰은 들어올 때 검증할 수 있을 만큼은 자기 설명적으로 두고, 지금의 정렬 순서와 맞지 않는 토큰은 다른 기준으로 조용히 페이지를 넘기지 말고 거절합니다. 그리고 페이지보다 한 행 더 가져오면 "다음 페이지가 있는가"를 두 번째 쿼리 없이 같은 쿼리로 답할 수 있습니다.
