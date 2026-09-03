---
title: "Compiled Query"
summary: "컴파일된 쿼리는 EF Core 쿼리의 준비 단계를 미리 굳혀 두어, 같은 LINQ 식을 호출마다 다시 알아보고 다시 찾아보지 않게 합니다. SQL이 빨라지는 것이 아니라 SQL을 만드는 손이 빨라집니다."
category: ".NET 데이터 접근"
related:
  - label: Entity Framework Core
    slug: entity-framework-core
  - label: LINQ
    slug: linq
  - label: N+1 Query
    slug: n-plus-1-query
  - label: Query Plan
    slug: query-plan
  - label: Prepared Statement
    slug: prepared-statement
references:
  - title: Advanced Performance Topics
    url: https://learn.microsoft.com/en-us/ef/core/performance/advanced-performance-topics
---

## 언제 쓰나

- 쿼리가 짧고 사소하면서 끊임없이 불릴 때 씁니다. 아이디로 하나를 찾아 주는 엔드포인트가 분당 수만 건을 받고 있다면, 각 요청의 눈에 띄는 몫이 데이터베이스가 아니라 EF Core 안에서 흘러갑니다. 데이터베이스가 하는 일은 인덱스 탐색 한 번이고 프레임워크가 하는 일은 호출마다 똑같기 때문입니다. 절약이 보이게 만드는 것은 그 비율입니다. 테이블을 훑는 쿼리에서는 같은 절약이 잡음에 묻혀 사라집니다.
- 프로파일링이 번역과 캐시 조회 오버헤드를 실제로 보여 주었을 때 씁니다. 정직한 진입 조건은 호출부터 명령이 전송되기까지의 시간이 전체에서 실제 몫을 차지한다고 말해 주는 추적이나 벤치마크이지, ORM이 느릴 것 같다는 짐작이 아닙니다. 프로파일이 시간을 데이터베이스나 직렬화에서 쓰고 있다고 말한다면 컴파일된 쿼리는 아무것도 바꾸지 않습니다.
- Native AOT나 시작 시간에 민감한 프로세스를 겨냥할 때 씁니다. 트리밍과 사전 컴파일이 걸린 자리에서는 쿼리 준비를 명시적이고 정적으로 뿌리내린 대리자로 옮겨 두는 편이 작업을 예측 가능하게 만들고 첫 요청 경로에서 빼 줍니다. 일주일째 데워진 서버보다 수명이 짧은 함수 인스턴스에 더 중요한 이야기입니다.

## 주의점

- 먼저 측정합니다. EF Core는 이미 쿼리 번역을 캐시하기 때문입니다. LINQ 쿼리는 처음 실행될 때 번역되어 컨텍스트의 쿼리 캐시에 담기고, 이후 실행은 식 트리를 알아보고 그 번역을 재사용합니다. 컴파일된 쿼리가 없애 주는 것은 번역이 아니라 알아보기와 캐시 조회이므로, 이득은 호출당 수 마이크로초대입니다. 분당 십만 번 지나가는 뜨거운 경로에서는 가질 만한 값이고 그 밖의 어디에서도 가치가 없습니다.
- 나오는 SQL은 동일하고, 그래서 느린 쿼리는 정확히 그대로 느립니다. 문장에 인덱스가 없거나 열을 너무 많이 돌려주거나 반복문 안에서 행마다 실행되고 있다면, 컴파일해도 데이터베이스가 받는 것은 같은 문장과 같은 실행 계획입니다. 모양을 먼저 고치세요. 반복문 이야기는 n-plus-1-query 쪽에, 나머지는 query-plan 쪽에 있고, 어느 쪽 처방이든 여기서 얻는 것보다 몇 자릿수 더 큰 값어치를 합니다.
- `DbContext`와 모든 매개변수는 람다의 인자여야 하고 캡처한 변수여서는 안 됩니다. 캡처한 값은 컴파일 시점에 식 안으로 구워지므로, 대리자는 만들어질 때 마침 범위 안에 있던 그 아이디의 결과를 계속 돌려주게 됩니다. 캡처한 컨텍스트는 두 번째 요청에서 이미 해제된 컨텍스트입니다. 인자로 넘기는 방식은 대리자가 자기 상태를 들고 있지 않게 만들어, 동시에 들어오는 요청들이 하나의 대리자를 함께 써도 안전하게 해 주기도 합니다.
- 대리자가 호출보다 오래 살아야만 값을 하고, 실무에서 그것은 `static readonly` 필드를 뜻합니다. 메서드 안에서 컴파일된 쿼리를 만들면 요청마다 컴파일하게 되는데, 이는 피하려던 캐시 조회보다 분명히 더 많은 일입니다. 코드가 여전히 올바르게 돌아가고 그저 이전보다 느려질 뿐이라 저지르기 쉬운 실수이기도 합니다.

## .NET에서는

- `EF.CompileAsyncQuery`는 컨텍스트와 매개변수와 취소 토큰을 받는 대리자를 돌려줍니다. 정적 필드에 담아 두고 평범한 메서드처럼 부릅니다.

```csharp
// One static delegate per query, built once for the life of the process.
private static readonly Func<ShopDbContext, int, CancellationToken, Task<Product?>> GetProductById =
    EF.CompileAsyncQuery(
        (ShopDbContext db, int id) =>
            db.Products.AsNoTracking().FirstOrDefault(p => p.Id == id));

// A sequence result comes back as IAsyncEnumerable, so it has no CancellationToken parameter.
private static readonly Func<ShopDbContext, int, IAsyncEnumerable<Order>> RecentOrdersFor =
    EF.CompileAsyncQuery(
        (ShopDbContext db, int customerId) =>
            db.Orders.AsNoTracking()
                .Where(o => o.CustomerId == customerId)
                .OrderByDescending(o => o.PlacedAt)
                .Take(20));

// The context and the parameters are arguments. Capturing either one is the bug.
var product = await GetProductById(db, id, ct);
```

- `EF.CompileQuery`는 동기 쪽 쌍둥이이고 규칙은 같습니다. 주변 코드가 정말로 동기일 때만 고르세요. 요청 스레드에서 데이터베이스 호출을 붙들고 기다리는 값은 절약한 컴파일보다 훨씬 큽니다.
- 읽기 경로라면 `AsNoTracking`도 컴파일되는 식 안에 함께 둡니다. 평범한 쿼리에서 그랬을 자리 그대로입니다. 뜨거운 읽기에서 변경 추적은 대개 번역보다 큰 비용이고, 애초에 프로파일이 우리를 여기로 데려왔다면 가장 먼저 시도할 것이기도 합니다.
- 컴파일된 쿼리와 준비된 문장의 재사용은 같은 여정의 서로 다른 절반을 풉니다. 이쪽은 명령이 전송되기 전 .NET 프로세스 안의 일을 줄이고, 매개변수화된 명령과 서버의 계획 캐시는 명령이 도착한 뒤의 일을 줄입니다. 어느 쪽도 다른 쪽을 대신하지 못합니다.
