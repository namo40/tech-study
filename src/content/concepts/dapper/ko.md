---
title: "Dapper"
summary: "Dapper는 마이크로 ORM입니다. SQL은 우리가 쓰고, 결과 행을 객체에 매핑해 주는 것이 하는 일의 전부입니다. 번역도 변경 추적도 없어서 빠르고, 그래서 규율은 우리에게 남습니다."
category: ".NET 데이터 접근"
related:
  - label: Entity Framework Core
    slug: entity-framework-core
  - label: LINQ
    slug: linq
  - label: Prepared Statement
    slug: prepared-statement
  - label: Parameterized Query
    slug: parameterized-query
  - label: SQL Injection
    slug: sql-injection
  - label: N+1 Query
    slug: n-plus-1-query
  - label: Database Connection Pool
    slug: database-connection-pool
references:
  - title: "Dapper: a simple object mapper for .NET"
    url: https://github.com/DapperLib/Dapper
---

## 언제 쓰나

- SQL을 손으로 다듬어 둔 뜨거운 읽기 경로에서 꺼냅니다. 특정 인덱스나 윈도 함수나 힌트에 맞춰 모양을 잡아 놓은 쿼리라면, 그것을 뱉어 내도록 ORM을 구슬려서 얻는 것이 없습니다. 문장을 직접 쓰는 편이 짧고, 계획은 우리가 시험한 그 계획이며, 객체로 옮기는 일은 여전히 호출 한 번입니다.
- ORM이 어색하게 번역하는 리포트와 집계에 씁니다. 그룹화 집합과 공통 테이블 식과 피벗과 벤더 고유 함수는 SQL에서 자연스럽고 LINQ에서는 뒤틀립니다. 아무도 고치지 않을 리포트 쿼리에 엔터티의 의미론은 쓸 데가 없습니다.
- EF Core를 대체하는 대신 그 옆에 나란히 둡니다. 한쪽에는 마이그레이션과 변경 추적을 갖춘 도메인 쓰기, 다른 한쪽에는 읽기나 리포트 쿼리 몇 개, 그리고 둘 다 같은 연결 문자열 위. 흔하고 변호할 수 있는 배치입니다.
- 저장 프로시저를 부를 때 꺼냅니다. 매개변수 객체와 함께 쓴 `CommandType.StoredProcedure`가 이야기의 전부이고, 출력 매개변수와 결과 집합 여러 개까지 포함해서 프로시저를 컨텍스트에 먼저 모델링할 필요가 없습니다.

## 주의점

- 값은 예외 없이 전부 매개변수로 넘깁니다. SQL을 우리가 쓰니 문자열 연결도 손에 닿고, 그것이 SQL 인젝션으로 가는 문입니다. 값을 매개변수로 넘기면 값은 데이터로 남고 서버는 계획을 재사용할 수 있으며, 편함은 위험한 쪽과 똑같습니다. 매개변수마다 속성 하나씩 담은 익명 객체면 끝입니다.
- 변경 추적도 작업 단위도 마이그레이션도 없습니다. 갱신은 우리가 쓰는 문장이고 트랜잭션은 우리가 여는 것이며 스키마는 다른 무언가가 관리합니다. 그 규율이 필요한 자리에서는 entity-framework-core가 더 나은 도구이고, 쓰기가 많은 도메인 모델에 Dapper를 고르는 일은 대개 그 기능들을 손으로 다시 만드는 일이 됩니다.
- 반복문 안의 쿼리는 ORM에서와 똑같이 N+1을 다시 만들고, 여기서는 그것이 우리 코드 안에 그대로 보입니다. 목록을 불러온 다음 행마다 자식을 쿼리하면 행마다 왕복 한 번이 듭니다. 다중 매핑을 쓴 `QueryAsync`나 조인이나 `IN` 쿼리 하나가 처방이고, 치르는 값은 ORM판이 치르던 것과 같습니다.
- SQL이 문자열 안에 살기 때문에 컴파일러가 스키마와 맞춰 보지 못합니다. 이름이 바뀐 열은 깨끗하게 컴파일되고 그 열을 읽는 행에서 런타임에 터집니다. 안전망은 빌드가 아니라, 실제 문장을 실제 데이터베이스에 돌리는 통합 테스트에 있어야 합니다.

## .NET에서는

- 매개변수는 익명 객체이고, 매핑은 열 이름으로 이루어지며, 연결은 쿼리가 필요로 하는 만큼만 짧게 풀에서 빌립니다.

```csharp
await using var connection = new SqlConnection(connectionString);

// Values go in as parameters. Never interpolate them into the SQL string.
var orders = await connection.QueryAsync<OrderSummary>(
    """
    SELECT o.Id, o.PlacedAt, o.Total, c.Name AS CustomerName
    FROM Orders o
    JOIN Customers c ON c.Id = o.CustomerId
    WHERE o.PlacedAt >= @since AND o.Status = @status
    ORDER BY o.PlacedAt DESC
    """,
    new { since = DateTime.UtcNow.AddDays(-7), status = "Open" });

// One round trip for parents and children, mapped into a graph by splitOn.
var withLines = await connection.QueryAsync<Order, OrderLine, Order>(
    "SELECT o.*, l.* FROM Orders o JOIN OrderLines l ON l.OrderId = o.Id WHERE o.Id = @id",
    (order, line) => { order.Lines.Add(line); return order; },
    new { id = orderId },
    splitOn: "Id");
```

- 연결 객체를 캐싱하지 마세요. 실제 연결은 풀에서 오기 때문에 `SqlConnection`을 만드는 비용은 싸고, `using` 안에서 열어 메서드 끝에서 닫히게 두면 제때 돌아갑니다. 서비스 수명 내내 붙들고 있는 연결은 다른 누구도 쓸 수 없는 풀의 자리 하나입니다.
- 트랜잭션은 명시적이고 손에서 손으로 넘깁니다. `connection.BeginTransaction()`이 돌려주는 트랜잭션 객체를 `ExecuteAsync` 호출마다 넘겨줍니다. 다른 곳에서 `SaveChangesAsync`가 대신해 주던 작업 단위를 손으로 하는 셈입니다.
- 결과 집합이 여럿인 쿼리는 왕복 한 번으로 여러 질문에 답합니다. `QueryMultipleAsync`가 문장 묶음을 차례로 읽어 주므로, 행 하나와 그 자식들과 전체 개수를 한꺼번에 필요로 하는 화면에 잘 맞습니다.
