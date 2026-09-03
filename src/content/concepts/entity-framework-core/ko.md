---
title: "Entity Framework Core"
summary: "EF Core는 .NET의 기본 ORM입니다. LINQ를 SQL로 번역하고, 불러온 객체에서 무엇이 바뀌었는지 추적하고, 갱신문을 대신 써 줍니다. 그 편리함의 값은 번역과 추적을 이해하는 일입니다."
category: ".NET 데이터 접근"
related:
  - label: N+1 Query
    slug: n-plus-1-query
  - label: Change Tracking
    slug: change-tracking
  - label: Database Migration
    slug: database-migration
  - label: LINQ
    slug: linq
  - label: Dapper
    slug: dapper
  - label: Compiled Query
    slug: compiled-query
  - label: Database Connection Pool
    slug: database-connection-pool
references:
  - title: EF Core overview
    url: https://learn.microsoft.com/en-us/ef/core/
  - title: Efficient querying (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/performance/efficient-querying
---

## 언제 쓰나

- 영속화가 테이블 목록이 아니라 도메인 모델을 따라가야 할 때 꺼냅니다. 탐색 속성을 가진 엔터티 덕분에 주문이 자기 품목과 고객을 객체로 데리고 다니고, 그것과 외래 키 사이의 매핑은 설정이 되며, 업무 규칙을 표현하는 코드가 조인이 아니라 객체로 읽힙니다.
- 스키마가 그것을 필요로 하는 코드와 함께 움직이도록 마이그레이션을 씁니다. 모델을 고치면 마이그레이션 파일이 나오고, 그 파일이 코드와 같은 배포에서 검토되고 커밋되고 적용됩니다. "이 브랜치의 스키마"라는 말이 데이터베이스 담당자에게 물어볼 질문이 아니라 뜻이 통하는 표현이 되는 이유입니다.
- 작업 단위가 엔터티 여러 개에 걸칠 때 변경 추적에 기댑니다. 불러오고, 객체를 고치고, `SaveChangesAsync`를 한 번 부르면 EF Core가 삽입과 갱신과 삭제를 알아내고 의존 순서대로 늘어놓고 트랜잭션으로 감쌉니다.
- 쿼리의 대부분이 CRUD와 중간 정도의 조인일 때 고릅니다. 번역이 잘 감당하는 범위가 그 언저리이고, 생산성은 실제로 얻는 것입니다. 필터와 투영과 페이징과 연관 데이터 로딩이 같은 LINQ 표면에서 나오고 타입은 컴파일 시점에 검사됩니다.

## 주의점

- N+1은 프레임워크의 결함이 아니라 사용 패턴이고, EF Core 코드에서 가장 흔한 성능 버그입니다. 탐색 속성을 건드리는 반복문은 행마다 쿼리를 한 번씩 돌리고, `Include`나 투영은 그것을 한 번에 요청합니다. 짐작하는 대신 쿼리 로그를 읽고, 쿼리 개수를 테스트가 단언할 수 있는 값으로 다루세요.
- 읽기 경로가 추적 비용을 낼 이유는 없습니다. `AsNoTracking`은 변경 추적기가 반환된 엔터티마다 남기는 스냅숏을 건너뜁니다. 아무도 고치지 않을 행 수백 개를 돌려주는 목록 엔드포인트에서 가장 크게 차이가 납니다. `Select`로 DTO에 투영하면 같은 이득에 더해 열도 적게 보냅니다.
- 모든 C# 식이 SQL이 되지는 않고, 그 경계는 정확히 알아 둘 값어치가 있습니다. `Where` 안의 지원되지 않는 호출은 컴파일 시점이 아니라 런타임에 예외로 터지고, `AsEnumerable`로 평가를 일찍 강제하던 옛 습관은 필터를 메모리로 옮겨 놓습니다. 테이블 전체를 선으로 끌어와서 대부분을 버리는 일이 됩니다.
- 대량 작업은 객체를 하나씩 불러오고 추적하고 쓰는 ORM의 결에 맞지 않습니다. `ExecuteUpdateAsync`와 `ExecuteDeleteAsync`는 아무것도 불러오지 않고 집합 단위 문장 하나를 보내고, 큰 적재나 무거운 리포트 쿼리라면 dapper나 원 SQL이 패배가 아니라 정직한 답입니다.

## .NET에서는

- `Include`와 투영의 차이는 "객체를 달라"와 "정확히 이 열들을 달라"의 차이이고, 무엇이 선을 타고 오는지와 무엇이 추적되는지를 둘 다 결정합니다.

```csharp
// Include: entities, tracked, all their columns, joined in one round trip.
var orders = await db.Orders
    .Include(o => o.Lines)
    .Where(o => o.CustomerId == customerId)
    .ToListAsync(ct);

// Projection: only the columns the response needs, nothing tracked.
var summaries = await db.Orders
    .AsNoTracking()
    .Where(o => o.CustomerId == customerId)
    .OrderByDescending(o => o.PlacedAt)
    .Select(o => new OrderSummary(o.Id, o.PlacedAt, o.Lines.Count, o.Total))
    .Take(50)
    .ToListAsync(ct);

// Set-based write: one UPDATE statement, no entities loaded, no tracking.
await db.Orders
    .Where(o => o.Status == OrderStatus.Pending && o.PlacedAt < cutoff)
    .ExecuteUpdateAsync(s => s.SetProperty(o => o.Status, OrderStatus.Expired), ct);
```

- `DbContext`가 스코프 수명인 데에는 이유가 있습니다. 스레드 안전하지 않고, 살아 있는 동안 추적하는 엔터티가 계속 쌓이며, `AddDbContext`는 요청마다 하나씩 등록해 각 작업 단위가 깨끗한 추적기를 받고 풀에서 빌린 연결을 제때 돌려주게 합니다.
- 개발 중에는 생성되는 SQL을 켜 두세요. 개발 환경에서 `LogTo`와 `EnableSensitiveDataLogging`을 함께 쓰면 각 LINQ 쿼리가 무엇이 되었는지 그대로 보여 줍니다. "이 엔드포인트가 느리다"가 읽을 수 있고 쿼리 계획으로 가져갈 수 있는 문장으로 바뀝니다.
- 컬렉션에 `Include`를 여러 번 걸면 행이 곱해져 카티션 곱이 됩니다. `AsSplitQuery`는 대신 컬렉션마다 쿼리를 하나씩 보내서 왕복 횟수와 훨씬 작은 결과 집합을 맞바꾸고, 투영을 쓰면 그 선택 자체가 사라지는 경우가 많습니다.
