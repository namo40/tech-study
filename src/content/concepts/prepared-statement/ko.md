---
title: "Prepared Statement"
summary: "prepared statement(준비된 문장)는 쿼리를 고정된 골격으로, 값을 순수한 데이터로 보냅니다. 입력이 더 이상 코드가 될 수 없으니 인젝션이 사라지고, 텍스트 하나가 계획 하나를 뜻하니 플랜 캐시가 식지 않습니다. 보안과 속도가 같은 결정에서 나옵니다."
category: ".NET 데이터 접근"
scene: prepared-statement
steps:
  - title: "문자열 연결은 값을 코드로 바꿉니다"
    text: "쿼리는 사용자 입력을 SQL 텍스트에 붙여서 조립되고, 입력은 따옴표를 입고 도착합니다. 이름이어야 했던 것이 조건으로 실행되고, 모든 행이 걸어 나갑니다. 데이터베이스는 잘못한 것이 없습니다. 건네받은 문장을 정확히 실행했을 뿐입니다."
  - title: "파라미터는 문장과 값을 분리합니다"
    text: "쿼리는 자리 표시자가 있는 골격으로 나가고, 입력은 그 옆에서 순수한 데이터로 이동합니다. 같은 공격 문자열이 도착하지만 아무와도 일치하지 않습니다. 이제 그것은 실행되는 SQL이 아니라 비교되는 이름이기 때문입니다. 이스케이프할 것도 소독할 것도 없습니다. 경계가 구조적입니다."
  - title: "같은 골격은 같은 실행 계획이기도 합니다"
    text: "파라미터화된 쿼리는 값만 바뀌는 하나의 텍스트입니다. 계획 하나를 한 번 컴파일해서 재사용하다가, 이어 붙인 버전의 점선 재생(텍스트 셋, 미스 셋)이 그것을 세 칸짜리 캐시에서 밀어내면 다시 컴파일됩니다."
  - title: "실무에서 Prepare를 직접 부를 일은 드뭅니다. 그저 이어 붙이지 않을 뿐입니다"
    text: "요즘 드라이버와 EF Core는 알아서 파라미터화하고 서버는 텍스트 기준으로 계획을 캐시합니다. 남는 규율은 텍스트를 안정되게 유지하고 값은 파라미터에 담는 것입니다. 골격 하나, 계획 하나, 식지 않는 캐시. 그리고 공격 표면은 부수 효과로 닫혔습니다."
related:
  - label: Parameterized Query
    slug: parameterized-query
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
  - title: "SqlCommand.Prepare Method"
    url: https://learn.microsoft.com/en-us/dotnet/api/microsoft.data.sqlclient.sqlcommand.prepare
  - title: "Configuring parameters and parameter data types"
    url: https://learn.microsoft.com/en-us/dotnet/framework/data/adonet/configuring-parameters-and-parameter-data-types
  - title: "SQL Queries (EF Core)"
    url: https://learn.microsoft.com/en-us/ef/core/querying/sql-queries
---

## 언제 쓰나

- 코드 바깥에서 온 값을 담는 모든 쿼리에 씁니다. 사용자 입력이 가장 뻔한 경우지만 메시지 페이로드, 설정, 파일 내용, 우리가 만든 다른 서비스에서 넘어온 문자열도 전부 코드 바깥입니다. "믿을 만한 내부 문자열"이라는 분류는 리팩터링 한 번을 견딘 적이 없습니다. 파라미터화는 위험해 보이는 쿼리에 덧붙이는 방어가 아니라 쿼리를 쓰는 방식 그 자체로 다룹니다. 어느 쪽이 위험했는지는 늘 나중에야 분명해집니다.
- 플랜 캐시가 실제로 일하는 핫 패스에 씁니다. 골격 하나로 분당 수천 번 도는 문장은 한 번 컴파일되고 계속 재사용됩니다. 같은 문장을 문자열 연결로 만들면 수천 번 컴파일되고, 그 컴파일 비용은 우리 코드의 지연 시간이 아니라 데이터베이스의 CPU로 나타납니다.
- 같은 문장을 값만 바꿔 반복하는 배치 루프에 씁니다. 한 번 준비하고 여러 번 실행하는 모양은 API가 원래 겨냥한 형태입니다. 명령과 파라미터 컬렉션, 타입은 루프 밖에서 만들어 두고 각 반복은 값만 넣고 실행합니다.
- 값이 선택적이거나 널이 될 수 있거나 날짜일 때 씁니다. 그런 값을 텍스트로 조립한다는 것은 따옴표 처리와 이스케이프, 문화권에 좌우되지 않는 서식을 직접 짠다는 뜻이고, 그 하나하나가 아포스트로피가 든 이름이나 다른 시간대의 장비에 걸려 드러날 버그입니다. 파라미터는 타입을 그대로 실어 나르므로 이 질문 자체가 생기지 않습니다.

## 주의점

- 파라미터화가 경계이고, 검증과 이스케이프는 그 뒤를 받치는 깊이입니다. 입력을 검증하는 이유는 그것이 그럴듯한 이메일 주소여야 하기 때문이지 따옴표 문자를 잡아내기를 바라서가 아닙니다. 허용 목록은 좋은 생각이지만 위험한 문자의 차단 목록은 그렇지 않습니다. 무엇이 위험한 문자인지는 우리가 통제하지 못하는 방언의 성질이기 때문입니다.
- 식별자는 파라미터가 될 수 없습니다. 테이블 이름, 컬럼 이름, `ORDER BY`의 방향은 문장의 일부이고 자리 표시자가 없습니다. 쿼리 문자열에서 온 정렬 컬럼은 우리가 정렬을 허용한 컬럼 목록을 거쳐 매핑해야 합니다. 그 밖의 방법은 이름만 다른 문자열 연결입니다.
- `IN` 목록의 길이가 제멋대로면 캐시가 조각납니다. 파라미터가 세 개인 쿼리와 네 개인 쿼리는 다른 텍스트라서, 길이가 1에서 1000까지 오가면 계획도 1000개가 생깁니다. 길이를 몇 개의 구간으로 올림하거나 집합을 테이블 반환 파라미터로 넘겨 텍스트 하나를 유지합니다.
- 어떤 서버에서는 파라미터의 타입과 길이도 텍스트의 일부입니다. SQL Server에서는 같은 값을 담은 `varchar(10)`과 `varchar(4000)`이 서로 다른 계획을 만듭니다. 크기를 값이 정하게 두면 길이마다 새 계획이 생깁니다. `DbType`과 `Size`를 명시하면 문장 하나가 계속 문장 하나로 남습니다.
- 데이터가 한쪽으로 쏠려 있으면 계획 재사용이 손해가 되기도 합니다. 첫 값으로 컴파일된 계획이 다음 값에도 쓰이는데, 첫 고객의 주문이 10건이고 다음 고객의 주문이 200만 건이면 10건짜리로 고른 계획을 200만 건에 쓰게 됩니다. 이것이 파라미터 스니핑이고, `OPTIMIZE FOR`나 `RECOMPILE`, 필터링된 인덱스 같은 튜닝의 답이 있는 튜닝 문제입니다. 문자열 연결로 돌아갈 이유는 되지 않습니다.
- 보간은 파라미터화가 아닙니다. 다만 예외가 하나 있습니다. `FromSql`(EF Core 7 전에는 `FromSqlInterpolated`였고 지금도 그 이름으로 쓸 수 있습니다)이 안전한 이유는 EF Core가 보간 문자열의 구멍 하나하나를 파라미터로 바꾸기 때문입니다. 똑같아 보이는 문자열을 `FromSqlRaw`에 넘기면 그것이 인젝션입니다. EF가 보기 전에 문자열이 이미 조립을 마쳤기 때문입니다. 두 호출은 단어 하나 차이이므로 안전한 쪽을 습관으로 만듭니다.

## .NET에서는

`DbParameter`가 이 구조의 전부입니다. 명령에 파라미터를 더하고 텍스트에서 이름으로 부르면 값은 SQL에 닿지 않습니다. 드라이버가 문장과 값을 전송로 위에서 서로 다른 것으로 보내고, 서버는 값을 파싱하는 대신 컬럼과 비교합니다.

```csharp
using var command = new SqlCommand(
    "SELECT Id, Email FROM Users WHERE Name = @name AND CreatedAt > @since",
    connection);

command.Parameters.Add("@name", SqlDbType.NVarChar, 100).Value = name;
command.Parameters.Add("@since", SqlDbType.DateTime2).Value = since;

using var reader = await command.ExecuteReaderAsync(ct);
```

타입과 길이를 적는 것은 형식적인 절차가 아닙니다. `Parameters.AddWithValue`는 둘 다 값에서 추론하므로 여섯 글자짜리 이름과 스무 글자짜리 이름이 서로 다른 문장과 서로 다른 계획을 만듭니다. `decimal`이 아무도 의도하지 않은 소수 자릿수로 도착하기도 합니다. 타입과 길이를 선언해 두면 문장 하나가 계속 문장 하나입니다.

`DbCommand.Prepare`는 문장을 컴파일해서 붙들고 있으라고 서버에 명시적으로 요청합니다. 같은 명령을 빡빡한 루프에서 돌릴 때는 값어치가 있지만 그 밖의 자리에서는 대개 그렇지 않습니다. 요즘 서버는 이미 텍스트 기준으로 계획을 캐시하므로, 평범한 파라미터 호출도 왕복 한 번을 더 쓰지 않고 같은 재사용을 얻습니다.

```csharp
using var command = new SqlCommand("INSERT INTO Events (Id, Body) VALUES (@id, @body)", connection);
var id = command.Parameters.Add("@id", SqlDbType.UniqueIdentifier);
var body = command.Parameters.Add("@body", SqlDbType.NVarChar, 4000);
await command.PrepareAsync(ct);

foreach (var e in events)
{
    id.Value = e.Id;
    body.Value = e.Body;
    await command.ExecuteNonQueryAsync(ct);
}
```

EF Core는 우리를 대신해 파라미터화합니다. LINQ 쿼리가 캡처한 변수는 파라미터가 되므로 `name`이 무엇이든 생성되는 SQL은 같은 텍스트입니다. 반면 식 안에 직접 쓴 상수는 텍스트에 접혀 들어가므로 결과는 맞지만 상수마다 텍스트가 달라집니다. SQL로 내려갈 때 `FromSql`과 `SqlQuery` 오버로드는 보간의 구멍을 파라미터로 바꾸고, `FromSqlRaw`는 우리가 만든 문자열을 그대로 받습니다.

```csharp
// 파라미터화됩니다. 텍스트 하나, 계획 하나
var users = await db.Users.Where(u => u.Name == name).ToListAsync(ct);

// 이쪽도 파라미터화됩니다. 구멍이 @p0과 @p1이 됩니다
var rows = await db.Users
    .FromSql($"SELECT * FROM Users WHERE Name = {name} AND CreatedAt > {since}")
    .ToListAsync(ct);
```

SQL Server에서 이 모든 것의 결과는 `sp_executesql`입니다. 문장 텍스트와 파라미터 선언, 값이 서로 다른 세 인자로 전달됩니다. 이것을 알아 두면 좋은 이유는 추적에서 보게 될 모습이 그것이기 때문입니다. 그리고 문장 텍스트 안에 값이 그대로 박혀 있는 것을 발견하는 순간이, 코드베이스에서 아직도 이어 붙이고 있는 한 곳을 찾는 가장 빠른 길입니다.
