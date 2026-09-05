---
title: "LINQ"
summary: "LINQ는 C#에 들어 있는 쿼리 표면입니다. 같은 연산자가 메모리의 리스트도 데이터베이스의 테이블도 거릅니다. 그 둘 중 무엇이 벌어지는지를 정하는 것은 지연 실행과 IQueryable 경계입니다."
category: ".NET 데이터 접근"
related:
  - label: Entity Framework Core
    slug: entity-framework-core
  - label: N+1 Query
    slug: n-plus-1-query
  - label: Dapper
    slug: dapper
  - label: Pagination
    slug: pagination
references:
  - title: Language Integrated Query (LINQ)
    url: https://learn.microsoft.com/en-us/dotnet/csharp/linq/
  - title: Introduction to LINQ queries (deferred execution)
    url: https://learn.microsoft.com/en-us/dotnet/csharp/linq/get-started/introduction-to-linq-queries
---

## 언제 쓰나

- 변환을 어떻게 돌지가 아니라 무엇을 원하는지로 적을 때 씁니다. `Where`와 `Select`와 `GroupBy`와 `OrderBy`는 거르고 프로젝션하고 묶고 정렬한다고 말하고, 읽는 사람은 인덱스 변수와 값이 바뀌는 누적 변수에서 의도를 복원하지 않고도 의도를 받습니다.
- EF Core 쿼리를 쓰는 언어가 이것입니다. `List<T>`에 쓰던 연산자와 같은 것이 SQL이 되는 식 트리를 만듭니다. 연산자를 한 번 익혀 두면 컬렉션에도 데이터베이스에도 다른 쿼리 가능한 소스에도 똑같이 통하는 이유입니다.
- 쿼리의 모양이 요청에 따라 달라질 때 파이프라인을 조각으로 조립합니다. 연산자마다 결과가 아니라 새 쿼리를 돌려주므로, 메서드가 조건에 따라 필터를 더해서 쿼리를 그대로 돌려주고 호출한 쪽이 페이징을 얹은 다음에야 실행이 시작되게 할 수 있습니다.
- 같은 모양의 질문을 서로 다른 소스에 던질 때 꺼냅니다. 메모리의 컬렉션도, 공급자를 통한 데이터베이스도, 다른 쿼리 가능한 소스도 같은 연산자 이름에 답하므로, 아래의 저장소가 바뀔 때 읽는 코드는 훨씬 덜 바뀝니다.

## 주의점

- 가장 먼저 몸에 익힐 것은 지연 실행입니다. 쿼리는 정의이지 결과가 아닙니다. 무언가가 열거하기 전에는 아무것도 돌지 않으므로, 같은 쿼리 변수를 `foreach`로 두 번 돌면 쿼리가 두 번 돕니다. 데이터베이스를 상대로는 왕복 두 번이고, 두 번의 답이 서로 다를 수도 있습니다. 결과를 두 번 이상 쓴다면 `ToListAsync`로 한 번만 구체화합니다.
- `IEnumerable`과 `IQueryable`의 경계가 일이 어디에서 벌어지는지를 정합니다. `IQueryable`은 공급자가 SQL로 번역하는 식 트리를 만들고, `IEnumerable`은 이미 메모리에 있는 객체 위에서 대리자를 돌립니다. 쿼리를 `IEnumerable<T>`로 캐스팅하거나 대입하거나 `AsEnumerable`을 부르면 그 뒤의 모든 것이 우리 프로세스 안으로 옮겨 옵니다.
- 그 경계의 어느 쪽에 `Where` 하나가 놓이느냐가 선을 타고 오는 양을 바꿉니다. 아직 `IQueryable`일 때 놓으면 `WHERE` 절이 되어 데이터베이스가 맞는 행만 돌려주고, 구체화한 뒤에 놓으면 테이블 전체가 애플리케이션까지 와서 거기서 걸러집니다. 코드도 비슷해 보이고 결과도 같습니다.
- `ToList`를 부르는 자리가 곧 구체화 시점이라, 그것을 너무 일찍 부르면 페이징 버그가 메모리 문제로 자랍니다. `ToList().Skip(900).Take(20)`은 전부 가져와서 대부분을 버리고, `Skip(900).Take(20).ToListAsync()`는 데이터베이스에 스무 행을 달라고 합니다. 체인 끝에서 집계를 되풀이하는 것도 같은 모양입니다. `Count`나 `Sum`을 부를 때마다 다시 열거합니다.

## .NET에서는

- 같은 두 줄이 경계의 어느 쪽에 있느냐에 따라 다른 뜻이 되고, 눈에 보이는 단서는 변수의 타입뿐입니다.

```csharp
// 아직 IQueryable입니다. 두 연산자 모두 SQL이 되고, 데이터베이스는 20행을 돌려줍니다.
var page = await db.Orders
    .Where(o => o.Status == OrderStatus.Open)   // -> WHERE Status = @p0
    .OrderByDescending(o => o.PlacedAt)
    .Skip(pageIndex * 20).Take(20)              // -> OFFSET/FETCH
    .ToListAsync(ct);

// AsEnumerable이 번역을 끝냅니다. 그 뒤의 모든 것은 이 프로세스에서 돌므로,
// Orders 테이블 전체를 가져온 다음 여기서 걸러 냅니다.
var accidental = db.Orders
    .AsEnumerable()
    .Where(o => o.Status == OrderStatus.Open)
    .ToList();

// 지연됩니다. 아직 아무것도 돌지 않았습니다. 두 번 열거하면 쿼리도 두 번 돕니다.
var open = db.Orders.Where(o => o.Status == OrderStatus.Open);
var count = await open.CountAsync(ct);          // 왕복 1
var rows  = await open.Take(20).ToListAsync(ct); // 왕복 2
```

- 파이프라인을 조건에 따라 쌓아 올릴 수 있는 이유가 합성입니다. `if` 안의 `query = query.Where(...)`는 실행하지 않고 식 트리에 더하기만 하므로, 선택 필터가 여럿인 엔드포인트가 분기 네 개가 아니라 단계적으로 만들어진 쿼리 하나가 됩니다.
- 실제로 쿼리를 돌리는 것은 `foreach`와 `ToList`와 `ToArray`와 `First`와 `Count`, 그리고 비동기 스트림 위의 `await foreach`입니다. 나머지는 전부 새 쿼리를 돌려주고, 어느 쪽이 어느 쪽인지 아는 것이 실무에서 지연 실행이 요구하는 것의 대부분입니다.
- 데이터베이스를 상대로는 객체를 나중에 다듬는 대신 쿼리 안에서 프로젝션하는 편이 낫습니다. 아직 `IQueryable`일 때 `Select`로 DTO에 담으면 컬럼이 적게 오고, 구체화한 뒤의 같은 `Select`는 테이블의 모든 컬럼 값을 이미 치른 뒤입니다.
