---
title: "Database Index"
summary: "데이터베이스 인덱스는 한 칼럼의 정렬된 사본에 행을 가리키는 포인터가 붙은 것입니다. 읽기는 훑는 대신 찾아가고, 쓰기는 정렬을 지키느라 조금 더 냅니다. 그리고 같은 구조가 고유성과 빠른 페이지네이션까지 조용히 떠받칩니다."
category: ".NET 데이터 접근"
scene: database-index
steps:
  - title: "스캔은 세고, 시크는 찾아갑니다"
    text: "같은 질문을 두 번 던집니다. 테이블에 대고는 하나를 찾으려고 여덟 행을 전부 읽습니다. 그 칼럼의 정렬된 사본에 행 포인터가 붙은 인덱스에 대고는 두 걸음과 점프 한 번이면 됩니다. 차이는 속도가 아니라 산수입니다."
  - title: "속도는 읽기가 샀고, 청구서는 쓰기가 냅니다"
    text: "삽입은 테이블 끝에 값싸게 붙고, 그다음 인덱스의 정렬을 지키느라 조금 더 냅니다. 인덱스를 하나 더 두면 모든 쓰기가 두 번 냅니다. 인덱스는 공짜가 아니라 쓰기마다 청구되는 구독입니다."
  - title: "인덱스에 규칙을 주면 보장이 됩니다"
    text: "unique의 뜻은 이렇습니다. 끼워 넣다가 정렬 위치가 이미 차 있으면 거절하라. 검사와 선점이 하나의 구조 안 한 걸음이므로 경쟁하는 두 삽입도 둘 다 이길 수는 없습니다. 이 거절이 중복 방지가 딛고 서는 바닥입니다."
  - title: "500번째 페이지로 가는 두 가지 길입니다"
    text: "offset은 버리려고 5천 개의 키를 세며 인덱스를 걷습니다. 다음 페이지로 갈수록 값이 비싸집니다. keyset은 마지막으로 본 키로 시크해 다음 20개만 읽습니다. 같은 페이지, 같은 인덱스인데 한쪽은 세고 한쪽은 찾아갑니다."
related:
  - label: N+1 Query
    slug: n-plus-1-query
  - label: Unique Constraint
    slug: unique-constraint
  - label: Offset Pagination
    slug: offset-pagination
  - label: Keyset Pagination
    slug: keyset-pagination
  - label: Cursor Pagination
    slug: cursor-pagination
  - label: Materialized View
    slug: materialized-view
  - label: No-Tracking Query
    slug: no-tracking-query
  - label: Prepared Statement
    slug: prepared-statement
  - label: Database Migration
    slug: database-migration
  - label: Idempotency Key
    slug: idempotency-key
references:
  - title: SQL Server index architecture and design guide
    url: https://learn.microsoft.com/en-us/sql/relational-databases/sql-server-index-design-guide
  - title: Indexes (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/modeling/indexes
  - title: Pagination (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/querying/pagination
---

## 언제 쓰나

- 쿼리가 실제로 거르고, 잇고, 정렬하는 칼럼입니다. `WHERE`, `JOIN … ON`, `ORDER BY`에 이름이 오르는 칼럼이지 그냥 존재하는 칼럼이 아닙니다.
- 외래 키입니다. 조인에 끊임없이 쓰이는데도 대부분의 데이터베이스는 선언했다는 이유만으로 인덱스를 만들어 주지 않습니다.
- 인덱스를 더하기 전에 실행 계획을 읽습니다. seek이면 인덱스를 타고 있는 것이고 scan이면 타지 않는 것입니다. 이것은 바라는 일이 아니라 확인하는 일입니다.

## 주의점

- 인덱스는 모든 쓰기에 세금을 매기고 저장 공간을 씁니다. 가진 것을 전부가 아니라 조회하는 것만 인덱싱합니다.
- 복합 인덱스의 칼럼 순서가 그 인덱스로 무엇을 할 수 있는지를 정합니다. 쓸 수 있는 것은 맨 왼쪽 접두사뿐이라서, `(TenantId, CreatedAt)`은 테넌트로 거르는 쿼리와 둘 다로 거르는 쿼리를 돕지만 날짜로만 거르는 쿼리에는 아무 도움이 되지 않습니다.
- 선택도가 낮은 칼럼은 별로 도움이 되지 않습니다. 테이블의 절반이 참인 플래그에 건 인덱스는 절반을 읽는 더 느린 방법일 뿐입니다.
- 누락 인덱스 힌트와 `EXPLAIN`이 직관보다 낫습니다. 다만 힌트는 쿼리 하나의 의견이지 테이블 전체의 설계가 아닙니다. 겹치는 힌트 셋은 보통 새 인덱스 세 개가 아니라 복합 인덱스 하나를 뜻합니다.
- 인덱스는 단편화되고 통계는 낡습니다. 지난 분기에 맞던 계획이 오늘은 틀릴 수 있고, 그 이유는 코드와 아무 상관이 없습니다.

## .NET에서는

```csharp
protected override void OnModelCreating(ModelBuilder builder)
{
    // 규칙이면서 동시에 조회 경로입니다.
    builder.Entity<User>().HasIndex(u => u.Email).IsUnique();

    // 맨 왼쪽 접두사: TenantId 단독과 TenantId + CreatedAt을 함께 받습니다.
    builder.Entity<Order>().HasIndex(o => new { o.TenantId, o.CreatedAt });
}

// 삽입이 곧 검사입니다. 둘 사이에 놓칠 틈이 없습니다.
try
{
    db.Users.Add(new User { Email = email });
    await db.SaveChangesAsync(ct);
}
catch (DbUpdateException ex) when (ex.InnerException is SqlException { Number: 2601 or 2627 })
{
    return Results.Conflict();
}

// offset: 데이터베이스가 5020행을 정렬해 놓고 5000행을 버립니다.
var page = await db.Orders
    .OrderBy(o => o.Id)
    .Skip(5000)
    .Take(20)
    .ToListAsync(ct);

// keyset: 같은 인덱스를, 호출자가 마지막으로 본 키에서 들어갑니다.
var next = await db.Orders
    .Where(o => o.Id > lastSeenId)
    .OrderBy(o => o.Id)
    .Take(20)
    .ToListAsync(ct);
```

`optionsBuilder.LogTo(Console.WriteLine, LogLevel.Information)`으로 쿼리 로그를 켜고 데이터베이스가 고른 계획을 읽으세요. 모델 설정은 인덱스를 요청할 뿐이고 그것을 쓸지 말지는 옵티마이저가 정합니다. 그리고 keyset의 정렬과 인덱스를 나란히 맞춰 두세요. `(CreatedAt, Id)`로 정렬하는 쿼리에는 `(CreatedAt, Id)` 인덱스가 필요하고, 그러지 않으면 애써 쓴 시크가 피하려던 정렬로 되돌아갑니다.
