---
title: "SQL Injection"
summary: "SQL 인젝션은 사용자 입력이 코드로 실행될 때 벌어지는 일입니다. 문자열을 접합해 만든 쿼리는 키보드를 호출자에게 넘겨줍니다. 해법은 code와 data를 서로 다른 채널에 두고, 검증은 두 번째 겹으로 다루고, 쿼리를 도둑맞아도 닿는 범위를 계정 크기로 묶는 것입니다."
category: "애플리케이션 보안"
scene: sql-injection
steps:
  - title: "문자열을 접합해 만든 쿼리는 키보드를 호출자에게 넘겨줍니다"
    text: "고스트는 code 트랙에 녹아든 입력을 보여 줍니다. 쿼리 모양이 바뀌고, 데이터베이스는 우리가 쓴 적 없는 질문에 성실하게 답합니다. 가진 행 전부입니다. 쿼리를 친 것은 호출자이고 우리는 자리만 내줬습니다. 해법은 영리함이 아니라 code와 data를 다른 채널에 두는 것입니다."
  - title: "파라미터는 입력을 영원히 데이터로 남깁니다"
    text: "같은 뾰족한 입력이 도착해 data 슬롯에 내려앉고, code 트랙은 움직이지 않습니다. 데이터베이스는 그 터무니없는 이름의 고객을 찾아보고, 없으니 0행을 돌려줍니다. 공격이 침해가 아니라 틀린 답이 됩니다. 이것이 주 방어입니다. 이 장면의 나머지는 전부 두 번째 겹입니다."
  - title: "검증은 문 앞의 필터이지 방탄복이 아닙니다"
    text: "형식, 길이, 범위. 뻔한 쓰레기는 비용이 들기 전에 거절되고, 정직한 입력은 통과합니다. 그러나 교묘한 공격은 형식상 완벽할 수 있습니다. 하나가 검사를 지나치고도 data 슬롯에 무해하게 내려앉는 것을 지켜봅니다. 소음을 걸러 내려고 검증하고, 검증이 놓칠 것이기에 파라미터화합니다."
  - title: "쿼리를 도둑맞아도 닿는 범위는 정확히 계정만큼입니다"
    text: "앱의 데이터베이스 role은 자기 테이블을 읽고 쓸 뿐 그 외에는 아무것도 못 합니다. 위험한 명령은 운이 아니라 role에 튕겨 나갑니다. 최소 권한은 인젝션을 막지 않고, 인젝션이 얼마짜리인지를 정합니다. 심층 방어는 이 장면을 쌓은 것입니다. 채널 분리, 문 앞 필터, 작은 계정."
related:
  - label: Prepared Statement
    slug: prepared-statement
  - label: Input Validation
    slug: input-validation
  - label: Least Privilege
    slug: least-privilege
  - label: Authorization
    slug: authorization
  - label: Cross-Site Scripting
    slug: cross-site-scripting
  - label: Output Encoding
    slug: output-encoding
  - label: Web Application Firewall
    slug: web-application-firewall
  - label: Deserialization Security
    slug: deserialization-security
  - label: Database Index
    slug: database-index
  - label: Repository
    slug: repository
references:
  - title: "SQL Injection"
    url: https://owasp.org/www-community/attacks/SQL_Injection
  - title: "SQL Injection Prevention Cheat Sheet"
    url: https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html
  - title: "SQL Queries - EF Core"
    url: https://learn.microsoft.com/en-us/ef/core/querying/sql-queries
---

## 언제 쓰나

여기서 제목은 형식일 뿐입니다. 이 방어들을 쓰지 않기로 결정할 상황은 없습니다. 달라지는 것은 도구가 이미 얼마나 해 주었느냐뿐입니다.

- 직접 쓰지 않은 값이 닿는 모든 구문을 파라미터화합니다. 사내 관리자 페이지, 마이그레이션 스크립트, 외부에서 접근할 수 없는 리포트, UI가 이미 숫자만 받도록 막아 둔 필드. 어느 것도 예외가 아닙니다. 사고는 늘 그 예외들에서 나옵니다. 아무도 이 관점으로 검토하지 않는 코드이기 때문입니다.
- ORM에게 맡깁니다. EF Core의 LINQ 번역은 구조적으로 파라미터화합니다. `Where(c => c.Name == name)`은 자리 표시자와 파라미터를 만들고, 접합된 텍스트가 나오게 쓸 방법이 없습니다. 코드베이스의 대부분이 이 방어를 공짜로 얻습니다. 그래서 남은 소수가 더 중요합니다.
- 원시 SQL이 정말 맞는 도구인 자리에서는 보간 오버로드를 씁니다. `FromSql`과 `ExecuteSql`은 보간 문자열을 받아 `{value}` 구멍을 전부 파라미터로 바꿉니다. `FromSqlRaw`와 `ExecuteSqlRaw`는 평범한 문자열을 받아 그대로 믿습니다. 이름 자체가 경고이고, 그 몇 글자 차이가 안전성의 전부입니다.
- 경계에서 형식, 길이, 범위를 검증합니다. 주문 id는 `Guid`이고, 페이지 크기는 1에서 100 사이이고, 국가 코드는 두 글자입니다. 이것은 쿼리가 아니라 요청 모델의 일입니다. 하는 일은 파라미터에서 SQL을 몰아내는 것이 아니라 시스템에서 말이 안 되는 값을 몰아내는 것입니다.
- 서비스마다 자기 데이터베이스 계정을 주고, 실제로 쓰는 권한만 담습니다. 테이블 네 개를 읽고 쓰는 앱에 테이블을 만들 권한이나 다른 스키마를 읽을 권한, 데이터베이스 밖으로 나가는 명령을 실행할 권한은 필요 없습니다. 이 결정은 하루 오후면 되고, 앞으로의 어떤 실수든 그 값어치를 영구히 묶어 둡니다.
- 원시 SQL 표면을 작게, 한곳에 모읍니다. 리포지토리나 소수의 쿼리 클래스가 있으면 이 규율을 지켜야 할 파일이 짧은 목록이 됩니다. 모든 개발자가 모든 호출 지점에서 영원히 기억해야 하는 성질로 남겨 두지 않습니다.

## 주의점

- 문자열 접합은 파라미터가 닿지 않는 곳에 숨습니다. 컬럼 이름, 테이블 이름, `ORDER BY` 방향은 값이 아니라서 어떤 드라이버도 파라미터로 만들어 주지 않습니다. 답은 허용 목록입니다. 호출자의 `sort=name`을 우리가 직접 쓴 상수 문자열로 매핑하고, 목록에 없으면 거절합니다. 이스케이프했든 아니든 호출자의 텍스트를 그대로 통과시키지 않습니다.
- 동적 `IN` 목록에는 원소마다 파라미터 하나가 필요합니다. 이어 붙인 문자열 하나가 아닙니다. 배열 길이로 `IN (@p0, @p1, @p2)`를 만들고 원소를 각각 바인딩하는 것이 안전한 모양입니다. 값을 쉼표로 이어 붙이면 호출자가 다시 문장 안으로 들어옵니다. 테이블 값 파라미터나 `WHERE id = ANY(@ids)`도 파라미터 하나로 같은 일을 합니다.
- 저장 프로시저는 자동으로 안전하지 않습니다. 내부에서 구문을 조립해 동적으로 실행하는 프로시저는 한 겹 아래에서 똑같은 문제를 그대로 안고 있고, 그쪽이 더 보이지 않습니다. 프로시저 안에서도 파라미터화하거나, 조립한 문자열 대신 파라미터를 받는 `sp_executesql`을 씁니다.
- 손으로 하는 이스케이프는 전략이 아닙니다. 치트 시트가 이것을 레거시 코드의 마지막 수단으로만 두는 이유는 분명합니다. 문자 집합과 따옴표 모드와 모든 경계 사례를 모든 분기에서 영원히 정확히 맞혀야 하기 때문입니다. 파라미터에는 그런 실패 지점이 하나도 없습니다. 값이 파서에 들어가지 않기 때문입니다.
- 오류 페이지가 지도를 건네주게 두지 않습니다. 실패한 구문이 담긴 스택 트레이스는 처음 보는 사람에게 테이블 이름과 컬럼 타입, 어떤 입력이 데이터베이스까지 닿는지를 알려 줍니다. 자세한 내용은 읽을 수 있는 곳에 기록하고 밖으로는 밋밋한 메시지를 돌려줍니다. 호출자가 물어볼 수 없어야 할 질문에 답해 버리는 응답 시간 차이나 행 수 차이에도 같은 규칙이 적용됩니다.
- 검증은 방어가 아니고, 방어로 취급하는 순간 장면의 3단계가 나쁘게 끝납니다. 형식 규칙은 우리가 상상한 입력을 기준으로 쓰였습니다. 파라미터화는 값이 무엇을 담고 있든 상관하지 않는 구조적 성질입니다. 그래서 파라미터화가 먼저이고 검증이 두 번째입니다.
- 클라이언트 측 검증은 사용자 경험 기능입니다. 왕복을 줄여 주지만 아무것도 막지 못합니다. 정작 문제가 되는 요청은 우리 폼을 거치지 않기 때문입니다.

## .NET에서는

ADO.NET 파라미터가 나머지 전부의 바탕입니다. 값이 구문 안이 아니라 옆에서 이동하고, 파라미터에 타입을 주면 데이터베이스가 인덱스를 조용히 망치는 암묵적 변환을 하는 것도 막힙니다.

```csharp
const string sql = "SELECT Id, Name FROM Customers WHERE Name = @name AND Region = @region";

await using var command = new SqlCommand(sql, connection);
command.Parameters.Add("@name", SqlDbType.NVarChar, 128).Value = name;
command.Parameters.Add("@region", SqlDbType.Char, 2).Value = region;

await using var reader = await command.ExecuteReaderAsync(ct);
```

Dapper는 익명 객체를 받아 같은 일을 합니다. 안전한 쪽이 더 짧기도 한 이유입니다.

```csharp
var customers = await connection.QueryAsync<Customer>(
    "SELECT Id, Name FROM Customers WHERE Region = @Region",
    new { Region = region });
```

EF Core에서는 LINQ가 이미 답입니다. 아래 비교는 자리 표시자와 파라미터로 컴파일되고, 접합된 SQL이 나오도록 쓸 방법이 없습니다.

```csharp
var customers = await db.Customers
    .Where(c => c.Name == name && c.Region == region)
    .ToListAsync(ct);
```

원시 SQL이 정말 필요할 때 손을 뻗을 곳은 보간 오버로드입니다. `FromSql`은 문자열 보간처럼 읽히고 파라미터 바인딩처럼 동작합니다. 구멍 하나가 텍스트가 아니라 `DbParameter` 하나가 됩니다.

```csharp
var customers = await db.Customers
    .FromSql($"SELECT * FROM Customers WHERE Region = {region}")
    .ToListAsync(ct);

await db.Database.ExecuteSqlAsync(
    $"UPDATE Customers SET Region = {region} WHERE Id = {id}");
```

구문을 텍스트로 먼저 만들지 않습니다. 이 한 줄이 버그의 전부이고, 코드 리뷰에서 알아봐야 할 모양입니다.

```csharp
// 금지. 값이 문장의 일부가 되고, 그 문장은 이제 호출자의 것입니다.
var sql = "SELECT * FROM Customers WHERE Name = '" + name + "'";
```

`Raw` 변형은 그것이 필요한 경우를 위해 있고, 형식 문자열과 인자를 받으니 거기서도 값은 여전히 파라미터로 갈 수 있습니다.

```csharp
// 이름과 달리 파라미터화됩니다. {0}은 붙여 넣어지지 않고 바인딩됩니다.
var customers = await db.Customers
    .FromSqlRaw("SELECT * FROM Customers WHERE Region = {0}", region)
    .ToListAsync(ct);
```

식별자는 여전히 파라미터가 될 수 없어서, 정렬은 문자열이 아니라 허용 목록입니다. 호출자는 키를 고르고, SQL은 우리가 고릅니다.

```csharp
static readonly Dictionary<string, string> SortColumns = new(StringComparer.OrdinalIgnoreCase)
{
    ["name"] = "Name",
    ["created"] = "CreatedUtc",
};

if (!SortColumns.TryGetValue(request.Sort ?? "name", out var column))
    return Results.BadRequest("unknown sort key");

var sql = $"SELECT * FROM Customers ORDER BY {column}";   // 호출자가 아니라 맵에서 온 컬럼
```

검증은 API 경계의 요청 모델에 자리 잡습니다. 위의 어떤 것도 실행되기 전에 말이 안 되는 값을 거절할 수 있는 곳입니다.

```csharp
public sealed record CustomerQuery(
    [property: StringLength(128, MinimumLength = 1)] string Name,
    [property: RegularExpression("^[A-Z]{2}$")] string Region,
    [property: Range(1, 100)] int PageSize);
```

마지막 조각은 계정입니다. 앱은 자기 자신으로 로그인하고, 실제로 쓰는 권한만 가집니다. 위쪽 어디에서 실수가 나더라도 이 로그인이 할 수 있는 범위 안으로 묶이도록 합니다.

```sql
CREATE USER app_orders WITH PASSWORD = '...';
GRANT SELECT, INSERT, UPDATE ON SCHEMA::orders TO app_orders;
-- DDL 없음, 다른 스키마 없음, 서버 수준 권한 없음
```

이 목록을 순서대로 다시 읽으면 그대로 장면입니다. 값은 절대 문장의 일부가 되지 않고, 뻔한 헛소리는 애초에 들어오지 못하고, 그래도 들어온 것은 로그인 하나에 허락된 만큼만 닿습니다.
