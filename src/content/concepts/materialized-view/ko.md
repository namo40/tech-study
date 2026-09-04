---
title: "Materialized View"
summary: "머티리얼라이즈드 뷰는 비싼 쿼리의 결과를 실제 테이블로 저장해, 읽는 쪽이 스캔 대신 미리 계산된 행을 받게 합니다. 갱신 사이에는 낡은 값이 되므로, 어떻게 언제 갱신할지가 설계의 전부입니다."
category: "데이터 저장소"
scene: materialized-view
steps:
  - title: "매번 백만 행"
    text: "대시보드를 열 때마다 테이블 셋을 JOIN하고 백만 행을 집계해 30행을 만듭니다. 답은 1분 전과 같지만 일은 그대로입니다."
  - title: "답을 구체화한다"
    text: "비싼 쿼리를 한 번 실행해 30행을 테이블로 저장합니다. 이제 대시보드는 30행만 읽고, 데이터베이스는 백만 행짜리 일을 요청마다가 아니라 한 번만 합니다."
  - title: "갱신 사이에는 낡는다"
    text: "새 주문은 기본 테이블에 들어가지만, 뷰는 갱신되기 전까지 마지막으로 받은 행으로 답합니다. 몇 분의 지연이 괜찮으면 일정대로, 아니면 쓰기마다 증분으로 갱신합니다."
  - title: "무엇을 구체화할까"
    text: "뷰는 저장 공간과 갱신 작업을 먹으므로, 끊임없이 반복되고 갱신 지연을 견딜 수 있는 소수의 질문만 구체화합니다. 나머지는 그냥 쿼리로 둡니다."
related:
  - label: Read Model
    slug: read-model
  - label: Projection
    slug: projection
  - label: CQRS
    slug: command-query-responsibility-segregation
  - label: Cache-Aside
    slug: cache-aside
  - label: N+1 Query
    slug: n-plus-1-query
  - label: Data Warehouse
    slug: data-warehouse
  - label: Database Index
    slug: database-index
  - label: Query Plan
    slug: query-plan
  - label: Eventual Consistency
    slug: eventual-consistency
references:
  - title: Materialized View pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/materialized-view
  - title: Keyless entity types (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/modeling/keyless-entity-types
  - title: Create indexed views (SQL Server)
    url: https://learn.microsoft.com/en-us/sql/relational-databases/views/create-indexed-views
---

## 언제 쓰나

- 같은 집계나 JOIN을, 그 입력이 바뀌는 것보다 훨씬 자주 물어볼 때 씁니다. 한 시간에 두 번도 쓰이지 않는 테이블을 열 명이 1분마다 대시보드로 여는 상황이 가장 분명한 예입니다.
- 읽는 쪽이 갱신 지연을 견딜 수 있거나, 데이터베이스가 뷰를 증분으로 유지해 지연이 거의 없을 때 씁니다.
- 미리 계산한 결과를 애플리케이션 캐시가 아니라 데이터베이스 안에서 조회하고 JOIN하고 싶을 때 씁니다. 뷰에는 인덱스를 걸고 JOIN하고 권한을 줄 수 있지만, 캐시 항목은 키로 꺼내는 것밖에 못 합니다.

## 주의점

- 머티리얼라이즈드 뷰는 설계상 낡은 값입니다. 대시보드의 숫자 옆에 갱신 주기를 함께 적으세요. 시각이 붙지 않은 숫자는 실시간 값으로 읽힙니다.
- 갱신은 진짜 일입니다. 한가한 시간대로 돌리고, 갱신 중에도 읽기가 막히지 않도록 concurrent나 증분 갱신을 쓰고, 쿼리를 보듯 갱신 시간도 지켜보세요.
- SQL Server의 indexed view는 기본 테이블에 쓰기가 일어날 때마다 유지됩니다. 그 비용은 이득을 보는 읽는 쪽이 아니라 쓰는 쪽이 부담하는데, 장면의 마지막 단계가 말하는 거래가 바로 이것입니다.
- 전부 구체화하지는 마세요. 쿼리 로그 상위 몇 개부터 시작하고, 나머지 긴 꼬리는 평범한 쿼리로 두세요.
- 뷰는 인덱스의 대체품이 아닙니다. 받쳐 주는 인덱스가 없어서 쿼리가 느린 것이라면 인덱스를 먼저 넣고, 그러고도 구체화할 것이 남는지 보세요.

## .NET에서는

PostgreSQL은 뷰를 인덱스를 걸 수 있는 테이블로 저장하고, `REFRESH MATERIALIZED VIEW CONCURRENTLY`는 읽는 쪽이 옛 행을 계속 읽는 동안 내용을 새로 씁니다. 이 concurrent 형태를 쓰려면 고유 인덱스가 있어야 합니다.

```sql
CREATE MATERIALIZED VIEW sales_by_day AS
SELECT date_trunc('day', o.placed_at) AS day, SUM(i.quantity * i.unit_price) AS total
FROM orders o JOIN order_items i ON i.order_id = o.id
GROUP BY 1;
CREATE UNIQUE INDEX ON sales_by_day (day);   -- required for REFRESH ... CONCURRENTLY
```

EF Core는 이 뷰를 키 없는 엔터티로 매핑하므로, 읽는 쪽은 JOIN이 하나도 없는 30행짜리 평범한 `DbSet`이 됩니다. 갱신은 호스티드 서비스가 대시보드에 적어 둔 주기대로 맡습니다.

```csharp
public sealed class SalesByDay { public DateTime Day { get; init; } public decimal Total { get; init; } }

modelBuilder.Entity<SalesByDay>().HasNoKey().ToView("sales_by_day");

// Readers: thirty rows, no joins.
var rows = await db.Set<SalesByDay>().OrderByDescending(r => r.Day).Take(30).ToListAsync(ct);

// A scheduled job refreshes it; readers keep reading the old rows while it runs.
public sealed class SalesViewRefresher(IServiceScopeFactory scopes) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(5));
        while (await timer.WaitForNextTickAsync(ct))
        {
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ShopDbContext>();
            await db.Database.ExecuteSqlRawAsync("REFRESH MATERIALIZED VIEW CONCURRENTLY sales_by_day", ct);
        }
    }
}
```

SQL Server는 장면의 증분 쪽을 다르게 씁니다. 뷰를 `WITH SCHEMABINDING`으로 만들고 고유 클러스터형 인덱스를 얹으면, 엔진이 기본 테이블에 쓰기가 일어날 때마다 뷰를 유지해 줍니다. 돌릴 갱신 작업도, 설명할 지연도 없습니다. 대신 `orders`에 들어가는 INSERT마다 집계의 일부를 함께 치르게 됩니다.
