---
title: "Query Plan"
summary: "실행 계획은 서버가 문장에서 만들어 내는 컴파일된 프로그램이고, 그 문장의 텍스트를 그대로 열쇠로 삼아 캐시됩니다. 속도는 재사용에서 나오고, 텍스트를 안정되게 유지하는 것이 그 입장료입니다."
category: ".NET 데이터 접근"
scene: prepared-statement
sceneStep: 3
related:
  - label: Prepared Statement
    slug: prepared-statement
  - label: Parameterized Query
    slug: parameterized-query
  - label: Database Index
    slug: database-index
  - label: N+1 Query
    slug: n-plus-1-query
  - label: Database Connection Pool
    slug: database-connection-pool
  - label: Keyset Pagination
    slug: keyset-pagination
  - label: Cursor Pagination
    slug: cursor-pagination
  - label: Materialized View
    slug: materialized-view
  - label: SQL Injection
    slug: sql-injection
  - label: Input Validation
    slug: input-validation
references:
  - title: "Query processing architecture guide"
    url: https://learn.microsoft.com/en-us/sql/relational-databases/query-processing-architecture-guide
  - title: "SqlCommand.Prepare Method"
    url: https://learn.microsoft.com/en-us/dotnet/api/microsoft.data.sqlclient.sqlcommand.prepare
  - title: "SQL Queries (EF Core)"
    url: https://learn.microsoft.com/en-us/ef/core/querying/sql-queries
---

장면의 3단계는 같은 결정을 반대편에서 본 것입니다. 가운데 띠의 캐시는 계획 세 개를 담고 문장의 텍스트를 열쇠로 삼습니다. 그래서 이어 붙이던 세계의 재생이 시작되면 값마다 아무도 본 적 없는 텍스트가 생기고, 그때마다 두 램프가 다시 켜집니다. 그 비용을 지켜보면 좋습니다. 새 텍스트 세 개는 컴파일 세 번이고 슬롯 세 개이며, 자리를 만들려고 캐시에서 가장 오래된 것을 매번 내보냅니다. 지킬 값어치가 있던 계획이 다시는 실행되지 않을 쿼리들에 밀려 축출됩니다. 장면이 그렇게 짜 둔 것이 아니라, 크기가 있는 캐시에서 저절로 그렇게 됩니다.

컴파일이 실제로 무엇을 가져다주는지 알아 두면 왜 비싼지가 설명됩니다. 서버는 텍스트를 파싱하고 이름을 카탈로그에 맞춰 해석한 다음, 그 결과를 옵티마이저에 넘깁니다. 옵티마이저는 실행 방법을 찾습니다. 어떤 인덱스를 쓸지, 조인 순서를 어떻게 할지, 정렬할지 흘려보낼지, 메모리를 얼마나 요청할지를 정합니다. 이 탐색은 후보 계획을 아주 많이 살펴보고 통계로 각각의 값을 매기며, 비싼 쪽은 파싱이 아니라 이 탐색입니다. 재사용은 그것을 전부 건너뜁니다. 히트는 더 빠른 컴파일이 아니라 컴파일 없음입니다.

캐시의 열쇠는 텍스트인데, 사람들이 짐작하는 것보다 훨씬 글자 그대로의 텍스트입니다. 공백 하나가 다르거나 키워드의 대소문자가 다르거나 주석이 붙었거나 테이블을 `Users`로 썼는지 `dbo.Users`로 썼는지가 다르면, 그것은 두 개의 텍스트이고 따라서 두 개의 계획입니다. SQL Server에서는 세션의 `SET` 옵션도 열쇠의 일부라서, 연결 설정이 다른 두 클라이언트가 같은 문장을 보내면 두 번 컴파일되기도 합니다. 텍스트가 코드의 한 곳에서만 나온다면 이 중 어느 것도 문제가 되지 않습니다. 파라미터화된 코드베이스의 캐시가 작고 식지 않는 반면 이어 붙이는 코드베이스의 캐시가 크고 차가운 평범한 이유가 이것입니다.

실제 시스템에서 캐시를 조각내는 것들은 이름을 붙여 둘 값어치가 있습니다. 하나같이 무해해 보이기 때문입니다. 길이가 데이터를 따라가는 `IN` 목록은 길이마다 계획 하나를 만드니, 크기를 구간으로 올림하거나 테이블 반환 파라미터로 넘깁니다. `AddWithValue`는 문자열 파라미터의 길이를 값에서 추론하므로 여섯 글자짜리 검색어와 일곱 글자짜리 검색어가 서로 다른 문장이 됩니다. 크기를 선언하면 해결됩니다. 리포트 도구나 즉석 쿼리가 SQL 안에 그대로 써 넣는 리터럴은 하나마다 계획을 하나씩 만들고, 한 번 쓰고 마는 계획으로 가득한 서버는 다시는 묻지 않을 것을 기억하느라 메모리를 쓰고 있습니다.

재사용에는 그 나름의 비용이 있고, 그것이 정직한 균형추입니다. 계획 하나는 먼저 도착한 값으로 컴파일되고, 옵티마이저는 그 값의 통계를 보고 계획을 골랐습니다. 첫 고객의 주문이 10건이고 다음 고객의 주문이 200만 건이면, 시크해서 반복하도록 고른 계획이 이제 200만 번 반복합니다. 이것이 파라미터 스니핑이고 답은 튜닝의 답입니다. 대표값을 골라 `OPTIMIZE FOR`를 쓰거나, 정말로 두 갈래인 문장에만 `RECOMPILE`을 붙이거나, 통계를 개선하거나, 쿼리를 둘로 나눕니다. 문자열 연결로 돌아가면 계획은 고쳐지고 인젝션이 다시 열립니다. 아무도 해서는 안 되는 거래입니다.

`Prepare`는 이 모든 것 위에 있으면서 이름이 풍기는 것보다 적은 일을 합니다. 문장을 컴파일해서 핸들 아래 붙들고 있으라고 서버에 요청하므로 명령 하나를 빡빡한 루프에서 돌릴 때 조회 한 번을 아껴 줍니다. 평범한 파라미터 호출은 그것 없이도 텍스트를 열쇠로 하는 캐시에서 이미 재사용을 얻습니다. 일부 서버는 리터럴을 대신 파라미터로 바꿔 주기도 하는데, 이는 다시 쓰지 않고 오래된 애플리케이션을 구제하는 대비책이지 설계는 아닙니다. 이 모든 것을 지나 남는 규칙은 4단계가 끝맺는 그 문장입니다. 텍스트를 안정되게 유지하고 값은 파라미터에 담으면 캐시는 알아서 굴러갑니다.
