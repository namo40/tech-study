---
title: "No-Tracking Query"
summary: "추적하지 않는 쿼리는 컨텍스트가 기억하지 않는 엔티티를 돌려줍니다. 스냅샷도 뜨지 않고, 저장할 때 훑지도 않으며, 고쳐서 다시 써넣을 수도 없습니다. 읽기에 필요한 것은 딱 이만큼입니다."
category: ".NET 데이터 접근"
scene: change-tracking
sceneStep: 3
related:
  - label: Change Tracking
    slug: change-tracking
  - label: Projection
    slug: projection
  - label: DbContext
    slug: dbcontext
  - label: N+1 Query
    slug: n-plus-1-query
  - label: Read Model
    slug: read-model
  - label: Materialized View
    slug: materialized-view
references:
  - title: Tracking vs. no-tracking queries
    url: https://learn.microsoft.com/en-us/ef/core/querying/tracking
  - title: Efficient querying (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/performance/efficient-querying
---

추적은 공짜가 아니고, 화면에 뿌리기만 할 목록이 그 값을 고스란히 치릅니다. 추적하는 쿼리가 만들어 낸 엔티티는 하나하나 스냅샷으로 복사되어 요청이 끝날 때까지 컨텍스트에 남고, 그 뒤로 SaveChanges를 부를 때마다 쓰이지도 않을 값을 전부 비교합니다. 천 행짜리 표라면 스냅샷 천 개, 저장 한 번에 비교 천 번인데, 정작 그 화면에는 저장 버튼도 없습니다.

`AsNoTracking()`은 두 비용을 모두 없앱니다. 행은 객체로 만들어져 그대로 넘어가고, 변경 추적기는 그 객체를 보지도 않으며, 코드가 참조를 놓는 순간 메모리도 반환됩니다. 동일성 해석도 사라집니다. 같은 레코드를 가리키는 두 행이 객체 하나가 아니라 둘이 되는데, 그만큼 빠르지만 참조 동일성에 기대고 있었다면 가끔 당황할 수 있습니다.

```csharp
// 읽기: 스냅샷도, 스캔도, 되쓰기도 없습니다.
var page = await db.Orders.AsNoTracking()
    .Where(o => o.CustomerId == customerId)
    .OrderByDescending(o => o.CreatedAt)
    .Take(50)
    .ToListAsync(ct);

// DTO로의 projection(엔티티 인스턴스가 없는 것)은 결코 추적되지 않습니다.
var summaries = await db.Orders
    .Where(o => o.CreatedAt > since)
    .Select(o => new OrderSummary(o.Id, o.Status, o.Total))
    .ToListAsync(ct);

// 서비스가 아예 쓰지 않을 때는 컨텍스트 전체를 읽기 전용으로.
options.UseQueryTrackingBehavior(QueryTrackingBehavior.NoTracking);
```

쓸 수 있는 상황이라면 프로젝션이 더 나은 기본값입니다. DTO로 select하면 따로 부탁하지 않아도 추적되지 않고, 이름을 적은 컬럼만 가져오며, 나중에 실수로 `Update`에 넘길 일도 없습니다. 엔티티 타입 자체가 정말 필요할 때 `AsNoTracking`을 쓰고, 추적은 원하지 않지만 행 하나당 객체 하나는 유지하고 싶은 좁은 경우, 예를 들어 같은 참조가 여러 번 나오는 그래프에는 `AsNoTrackingWithIdentityResolution`을 씁니다.

기억할 규칙은 하나입니다. 추적하지 않고 가져온 엔티티는 값을 고친다고 저장되지 않습니다. 비교할 스냅샷이 없으니 컨텍스트가 감지할 것도 없습니다. 써야 한다면 처음부터 `AsNoTracking` 없이 조회하거나, 객체를 Attach한 뒤 바꾸려는 속성만 표시합니다. HTTP 요청으로 받은 끊어진 엔티티가 안고 있는 문제와 똑같습니다.
