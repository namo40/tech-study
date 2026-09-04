---
title: "Parameterized Query"
summary: "파라미터화된 쿼리는 문장과 값을 서로 다른 두 가지로 보내므로, 값은 텍스트가 이미 파싱된 뒤에 묶입니다. 경계는 조심해야 할 문자의 목록이 아니라 구조입니다."
category: ".NET 데이터 접근"
scene: prepared-statement
sceneStep: 2
related:
  - label: Prepared Statement
    slug: prepared-statement
  - label: Query Plan
    slug: query-plan
  - label: SQL Injection
    slug: sql-injection
  - label: Input Validation
    slug: input-validation
  - label: Database Index
    slug: database-index
  - label: N+1 Query
    slug: n-plus-1-query
  - label: Database Connection Pool
    slug: database-connection-pool
  - label: Cursor Pagination
    slug: cursor-pagination
  - label: Keyset Pagination
    slug: keyset-pagination
  - label: Materialized View
    slug: materialized-view
references:
  - title: "Configuring parameters and parameter data types"
    url: https://learn.microsoft.com/en-us/dotnet/framework/data/adonet/configuring-parameters-and-parameter-data-types
  - title: "SqlCommand.Prepare Method"
    url: https://learn.microsoft.com/en-us/dotnet/api/microsoft.data.sqlclient.sqlcommand.prepare
  - title: "SQL Queries (EF Core)"
    url: https://learn.microsoft.com/en-us/ef/core/querying/sql-queries
---

장면의 두 번째 단계를 보면서 실제로 바뀐 것이 얼마나 적은지 확인해 보면 좋습니다. 같은 입력이고 여전히 빨간색이며 같은 데이터베이스에 도착합니다. 걸러낸 것도 없고 지워낸 것도 없습니다. 바뀐 것은 App에서 나간 것의 모양입니다. 첫 번째 단계에서는 입력이 문장 끝에 용접되어 전체가 한 덩어리로 이동했고, 두 번째 단계에서는 값이 있던 자리에 자리 표시자가 있고 값은 문장 옆에서 자기만의 판으로 이동합니다. 둘 사이의 틈을 틈으로 그린 이유는 그 틈이 곧 구조이기 때문입니다.

이 틈이 사 오는 것은 순서입니다. 서버는 문장 텍스트를 받아 트리로 파싱하고 그 뜻을 확정한 다음, 트리가 이미 갖고 있는 구멍에 값을 묶습니다. 파서가 보기에 입력이 존재하기 시작할 무렵에는 파싱이 이미 끝나 있습니다. 값 안의 따옴표는 문자열 리터럴을 끝낼 수 없습니다. 그 값은 문자열 리터럴 안에 있지 않고, 문법이 이미 닫아 놓은 자리에 놓인 인자이기 때문입니다. 두 번째 단계의 같은 공격 문자열이 위험하지도 않고 소독된 것도 아닌 이유가 이것입니다. 그것은 그저 아무도 그렇게 불리지 않는 이름일 뿐입니다.

이 방식은 이스케이프보다 강하고, 그 차이는 정확히 짚어 둘 값어치가 있습니다. 이스케이프는 방언에 대한 주장입니다. 모든 인용 규칙과 모든 이스케이프 시퀀스, 검사를 마친 뒤에 바이트가 따옴표로 변할 수 있는 모든 인코딩, 그리고 값이 놓일 모든 문맥을 안다는 주장입니다. 숫자는 대개 따옴표로 감싸지 않으므로, 따옴표만 다루는 이스케이프 루틴은 문자열 칼럼을 지키면서 정수 칼럼은 활짝 열어 둡니다. 파라미터화는 그런 주장을 하지 않습니다. 값을 문법 바깥으로 완전히 옮기고 나면 영리해질 여지 자체가 남지 않습니다.

파라미터가 갈 수 없는 자리가 있고, 바로 그 자리가 지켜봐야 할 곳입니다. 파라미터는 값이므로 값이 설 수 있는 자리에 섭니다. 비교식, `IN` 목록, `VALUES` 절이 그런 자리입니다. 테이블 이름이나 칼럼 이름, `ORDER BY`의 `ASC`는 될 수 없습니다. 그것들은 문장 안의 데이터가 아니라 문장의 일부이기 때문입니다. 정렬 칼럼이나 테이블이 바깥에서 와야 한다면, 들어온 문자열을 우리가 제공할 의사가 있는 목록에 매핑하고 나머지는 전부 거절하세요. 이 매핑은 작고 시험하기 쉬우며, 이 일을 제대로 한 코드베이스에 남는 유일한 문자열 연결입니다.

틈을 건너 함께 오는 또 하나는 타입입니다. 파라미터로 보낸 날짜는 날짜이지, 문화권에 좌우되지 않는 방식으로 서식을 만들었다가 다시 파싱해야 하는 문자열이 아닙니다. `decimal`은 소수 자릿수를 유지하고, 널은 그것을 적은 네 글자가 아니라 `DBNull.Value`입니다. 하나하나가 아예 생기지 않는 버그의 부류인데, 일어나지 않은 버그는 흔적을 남기지 않기 때문에 놓치기 쉽습니다.

실무에서 이 모든 것은 결국 습관 하나로 정리됩니다. `FromSqlInterpolated`와 `FromSqlRaw`는 같아 보이는 문자열을 받아 정반대로 처리하고, `+`로 만든 `SqlCommand`는 파라미터로 만든 것과 거의 똑같이 생겼습니다. 안전한 형태를 손가락이 먼저 치는 형태로 만들고, 코드 리뷰에는 diff에 등장하는 SQL마다 질문 하나만 던지게 하세요. 값은 어디로 들어왔는가.
