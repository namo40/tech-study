---
title: "Change Tracking"
summary: "변경 추적은 DbContext가 내어준 모든 엔티티를 기억해 두었다가, SaveChanges를 부를 때 스냅샷과 비교해서 달라진 것만 트랜잭션 하나로 쓰는 방식입니다. 동시에 고칠 생각이 없던 쿼리에까지 값을 치르게 되는 부분이기도 합니다."
category: ".NET 데이터 접근"
scene: change-tracking
steps:
  - title: "기억하고, 비교하고, 차이만 씁니다"
    text: "쿼리가 돌려주는 모든 엔티티는 값의 스냅샷과 함께 추적됩니다. 속성을 바꿔도 아직 아무 일도 일어나지 않습니다. SaveChanges가 비교해서 엔티티를 Modified로 표시하고, 바뀐 열 하나만 UPDATE로 보냅니다."
  - title: "작업 단위 하나"
    text: "원하는 만큼 추가하고, 지우고, 고치세요. SaveChanges 전에는 아무것도 데이터베이스에 닿지 않고, SaveChanges는 모든 문장을 트랜잭션 하나 안에서 보냅니다. 하나라도 실패하면 어느 것도 반영되지 않고, tracker는 변경 내용을 그대로 갖고 있습니다."
  - title: "바꿀 것만 추적합니다"
    text: "천 행을 돌려주는 읽기 전용 쿼리는 tracker를 스냅샷 천 개로 채우고, SaveChanges마다 그것들을 훑습니다. AsNoTracking은 tracker를 아예 건너뜁니다. 그리고 DbContext의 수명은 요청 하나입니다. 오래 사는 컨텍스트는 아무것도 잊지 않습니다."
  - title: "끊어진 엔티티와 잃어버린 갱신"
    text: "밖에서 온 엔티티에는 스냅샷이 없어서 Update는 모든 열을 Modified로 표시합니다. Attach한 뒤 의도한 속성만 표시하세요. 그리고 동시성 토큰을 더하면 UPDATE가 읽었던 버전을 확인하고, 영향받은 행이 0이면 다른 누군가가 먼저 저장했다는 뜻입니다."
related:
  - label: No-Tracking Query
    slug: no-tracking-query
  - label: Unit of Work
    slug: unit-of-work
  - label: DbContext
    slug: dbcontext
  - label: Optimistic Concurrency
    slug: optimistic-concurrency
  - label: Repository
    slug: repository
  - label: Projection
    slug: projection
  - label: N+1 Query
    slug: n-plus-1-query
  - label: Transaction
    slug: local-transaction
  - label: Lost Update
    slug: lost-update
references:
  - title: Change tracking in EF Core
    url: https://learn.microsoft.com/en-us/ef/core/change-tracking/
  - title: Tracking vs. no-tracking queries
    url: https://learn.microsoft.com/en-us/ef/core/querying/tracking
  - title: Handling concurrency conflicts (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/saving/concurrency
---

## 언제 쓰나

- EF Core에서 읽고 고치고 저장하는 흐름의 기본값입니다. 엔티티를 읽고, 속성을 바꾸고, 작업 단위마다 SaveChanges를 한 번 부릅니다.
- 읽기 전용 쿼리에는 쓰지 않습니다. `AsNoTracking`을 쓰거나 DTO로 프로젝션하세요. 프로젝션은 어느 쪽이든 추적되지 않습니다.
- 여러 변경이 함께 성공하거나 함께 실패해야 할 때 씁니다. SaveChanges 자체가 이미 트랜잭션이라서 작업 단위를 만드는 데 추가 비용이 들지 않습니다.

## 주의점

- 요청 하나, 또는 작업 단위 하나마다 DbContext 하나를 씁니다. 스레드 안전하지 않고, 한 번 추적한 것을 스스로 잊지 않습니다.
- SaveChanges는 변경마다 부르지 말고 마지막에 한 번만 부릅니다. 호출 하나가 곧 트랜잭션 하나이고 왕복 하나입니다.
- 끊어진 엔티티에 `Update()`를 쓰면 모든 열을 씁니다. 클라이언트가 건드리지도 않은 필드에 다른 사람이 넣은 값까지 덮어쓸 수 있습니다. Attach한 뒤 특정 속성만 표시하거나, 행을 읽어 와서 고치세요.
- 두 사용자가 함께 편집할 수 있는 대상에는 `rowversion` 같은 동시성 토큰을 더하고, `DbUpdateConcurrencyException`은 다시 읽어서 재시도하거나 병합해서 처리합니다.
- 추적하는 결과 집합이 커지면 `DetectChanges`가 느려집니다. 저장할 때마다 추적 중인 엔티티 하나당 한 번씩 훑기 때문입니다. 대량 작업에는 `AsNoTracking`, 프로젝션, 또는 `ChangeTracker.AutoDetectChangesEnabled = false`를 쓰세요.
- 추적되는 엔티티는 컨텍스트 하나 안에서의 식별자입니다. 같은 행을 두 번 조회하면 같은 객체가 돌아오는데, 이 성질이 컨텍스트를 넘어서도 유지된다고 가정하는 순간 문제가 됩니다.

## .NET에서는

EF Core는 기본적으로 추적합니다. 쿼리가 엔티티를 만들어 낼 때 떠 두는 스냅샷이 `SaveChanges`의 비교 대상이고, 그 차이가 곧 UPDATE입니다.

```csharp
// Tracked: load, modify, save the difference.
var order = await db.Orders.FindAsync([12], ct);
order!.Status = OrderStatus.Paid;
await db.SaveChangesAsync(ct);          // UPDATE orders SET status = @p0 WHERE id = 12 AND rowversion = @p1

// Read-only: skip the tracker.
var recent = await db.Orders.AsNoTracking()
    .Where(o => o.CreatedAt > since)
    .Select(o => new OrderSummary(o.Id, o.Status, o.Total))   // a projection is never tracked
    .ToListAsync(ct);

// Detached entity from an API request: mark only what the client may change.
db.Orders.Attach(incoming);
db.Entry(incoming).Property(o => o.Note).IsModified = true;
try
{
    await db.SaveChangesAsync(ct);
}
catch (DbUpdateConcurrencyException)
{
    // someone saved first: reload, merge, or tell the user
}

// The concurrency token, in the model.
modelBuilder.Entity<Order>().Property(o => o.RowVersion).IsRowVersion();
```

`AddDbContext`는 scoped 수명으로 등록하므로 요청마다 새 컨텍스트가 만들어지고 tracker도 비어 있는 상태로 시작합니다. 백그라운드 작업에는 수명을 걸어 둘 요청이 없으니, 오래 사는 컨텍스트를 붙들고 있지 말고 `IDbContextFactory<T>`로 작업 단위마다 하나씩 만들어 쓰세요.
