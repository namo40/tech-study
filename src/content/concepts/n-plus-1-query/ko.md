---
title: "N+1 Query"
summary: "N+1 Query 문제는 목록을 읽는 쿼리 하나 뒤에, 그 목록의 행마다 쿼리가 하나씩 더 붙는 것입니다. 행이 5건이면 눈에 띄지 않고 5,000건이면 치명적입니다. 비용이 데이터가 아니라 왕복 횟수이기 때문입니다."
category: ".NET 데이터 접근"
scene: n-plus-1-query
steps:
  - title: "N+1"
    text: "쿼리 하나로 목록을 읽고, 그다음 코드가 행마다 customer를 하나씩 따로 묻습니다. 주문 5건에 왕복 6번입니다."
  - title: "N에 비례해 커집니다"
    text: "같은 코드가 행 20건에서는 왕복 21번을 합니다. 개발 데이터는 이것이 드러날 만큼 행이 많지 않고, 운영 데이터는 많습니다."
  - title: "Include"
    text: "연관된 행을 같은 쿼리에서 함께 요청하면 데이터베이스가 JOIN으로 묶어 줍니다. 왕복 한 번에 모든 데이터입니다. 컬렉션을 여러 개 Include할 때는 카테시안 곱 폭발을 조심합니다."
  - title: "필요한 것만 읽습니다"
    text: "Select로 투영해 쓰는 열만 오가게 하거나, 조회를 IN 쿼리 하나로 묶습니다. 그리고 쿼리 로그를 읽으세요. 왕복을 숨기는 ORM이 진짜 문제입니다."
related:
  - label: Entity Framework Core
    slug: entity-framework-core
  - label: LINQ
    slug: linq
  - label: Change Tracking
    slug: change-tracking
  - label: No-Tracking Query
    slug: no-tracking-query
  - label: Compiled Query
    slug: compiled-query
  - label: Query Plan
    slug: query-plan
  - label: Index
    slug: index
  - label: Dapper
    slug: dapper
  - label: DataLoader
    slug: dataloader
  - label: Batching
    slug: batching
references:
  - title: Loading related data (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/querying/related-data/
  - title: Efficient querying (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/performance/efficient-querying
  - title: EF Core overview
    url: https://learn.microsoft.com/en-us/ef/core/
---

## 언제 쓰나

- 탐색 속성을 건드리거나 `Find`를 부르거나 원소마다 쿼리를 실행하는 반복문. 이런 모양을 찾습니다.
- EF Core 로그에서 페이지 크기에 따라 함께 늘어나는 쿼리 수
- 로컬에서는 빠른데 운영에서는 느린 엔드포인트. 이때 데이터베이스의 CPU는 낮고 요청 수는 높습니다.

## 주의점

- `Include`도 공짜는 아닙니다. 컬렉션을 여러 개 Include하면 행이 곱해져 카테시안 곱 폭발이 일어나므로, `AsSplitQuery`를 쓰거나 투영으로 대신합니다.
- 지연 로딩 프록시는 탐색 속성에 접근할 때마다 쿼리를 냅니다. 명시적 로딩을 택해, 비용을 치르는 코드에서 그 비용이 보이게 합니다.
- 읽기 전용 엔드포인트에는 `Select` 투영이 대개 가장 좋은 답입니다. 열이 적고, 변경 추적이 없고, 쿼리가 하나입니다.
- 테스트에서 쿼리를 로그로 남기고 개수를 셉니다. 목록 엔드포인트에는 그 개수를 단언합니다.

## .NET에서는

```csharp
// N+1: one query for the list, then one per row.
var orders = await db.Orders.ToListAsync(ct);
foreach (var order in orders)
{
    var customer = await db.Customers.FindAsync([order.CustomerId], ct); // a round trip per order
    Console.WriteLine($"{order.Id}: {customer!.Name}");
}

// Include: one query with a JOIN.
var orders = await db.Orders
    .Include(o => o.Customer)
    .ToListAsync(ct);

// Select: only the columns you need, no tracking, one query.
var rows = await db.Orders
    .Select(o => new { o.Id, o.Total, Customer = o.Customer.Name })
    .ToListAsync(ct);
```

`optionsBuilder.LogTo(Console.WriteLine, LogLevel.Information)`으로 쿼리 로그를 켜고, 한 쿼리에 컬렉션을 여러 개 Include할 때는 `AsSplitQuery()`를 씁니다. 그러면 EF Core가 거대한 JOIN 하나 대신 컬렉션마다 쿼리를 나눠 보냅니다.
