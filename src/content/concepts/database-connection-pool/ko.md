---
title: "Database Connection Pool"
summary: "Connection Pool은 열어 둔 데이터베이스 연결 몇 개를 빌려주어 요청이 느린 핸드셰이크를 건너뛰게 합니다. 풀의 크기는 곧 동시성 예산입니다. 모든 연결이 사용 중이면 다음 요청은 기다리고, 너무 오래 기다리면 실패합니다."
category: "Pool과 자원 관리"
scene: database-connection-pool
steps:
  - title: "여는 것은 느립니다"
    text: "새 연결에는 TCP 핸드셰이크, TLS, 로그인이 따릅니다. 풀은 그 비용을 한 번만 치르고 연결을 열어 둡니다."
  - title: "재사용"
    text: "모든 요청이 열린 연결을 빌려 쓰고 돌려줍니다. 연결 둘이 흐름 전체를 감당하고, 데이터베이스는 새 로그인을 한 번도 보지 않습니다."
  - title: "고갈"
    text: "모든 연결이 사용 중이면 새 요청은 줄을 섭니다. 풀의 최대치는 데이터베이스에 대한 동시성 예산이고, Timeout을 넘겨 기다리면 실패합니다."
  - title: "늦게 열고 빨리 돌려줍니다"
    text: "애플리케이션이 다른 일을 하는 동안 쥐고 있는 연결은 아무도 못 쓰는 연결입니다. 쿼리 동안만 빌리고 곧바로 돌려주면 같은 넷으로 훨씬 많이 처리합니다."
related:
  - label: ADO.NET Connection Pooling
    slug: ado-net-connection-pooling
  - label: Minimum Pool Size
    slug: minimum-pool-size
  - label: Maximum Pool Size
    slug: maximum-pool-size
  - label: Connection Lifetime
    slug: connection-lifetime
  - label: Connection Timeout
    slug: connection-timeout
  - label: Pool Exhaustion
    slug: pool-exhaustion
  - label: DbContext Pool
    slug: dbcontext-pool
  - label: Bulkhead
    slug: bulkhead
  - label: Concurrency Limiter
    slug: concurrency-limiter
  - label: Timeout
    slug: timeout
references:
  - title: SQL Server connection pooling (ADO.NET)
    url: https://learn.microsoft.com/en-us/sql/connect/ado-net/connection-pooling
  - title: EF Core overview
    url: https://learn.microsoft.com/en-us/ef/core/
  - title: Bulkhead pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/bulkhead
---

## 언제 쓰나

- 관계형 데이터베이스를 쓴다면 언제나 씁니다. ADO.NET 공급자는 기본으로 풀을 쓰고, EF Core도 그 위에 얹혀 같은 풀을 씁니다.
- 문제는 풀을 쓸지가 아니라 크기를 어떻게 정할지입니다. 풀은 프로세스마다, 연결 문자열마다 하나씩 생기므로, 데이터베이스의 전체 연결 예산을 띄우는 인스턴스 수만큼 나눠 주어야 합니다.

## 주의점

- 늦게 열고 빨리 반납합니다. 요청 하나가 끝날 때까지, 긴 트랜잭션 동안, 데이터베이스와 무관한 `await` 동안 연결을 쥐고 있지 않습니다.
- `Max Pool Size`는 프로세스 단위입니다. 기본값 100인 인스턴스 10개는 200을 감당하는 데이터베이스에 연결 1,000개를 열 수 있습니다.
- 풀에서 기다린 시간은 느린 쿼리가 아니라 연결 Timeout으로 나타납니다. 대기 시간과 풀 사용률을 그 자체로 하나의 지표로 지켜봅니다.
- 대소문자나 옵션 순서만 다른 연결 문자열은 서로 다른 풀을 만듭니다.

## .NET에서는

```csharp
// Pool per connection string, per process. Size it from the database's budget.
const string Cs =
    "Server=db;Database=shop;User Id=app;Password=...;" +
    "Min Pool Size=2;Max Pool Size=20;Connect Timeout=5;Connection Lifetime=300";

public async Task<Order?> FindAsync(int id, CancellationToken ct)
{
    // Open late: the connection is borrowed here...
    await using var connection = new SqlConnection(Cs);
    await connection.OpenAsync(ct);

    await using var command = connection.CreateCommand();
    command.CommandText = "SELECT Id, Total FROM Orders WHERE Id = @id";
    command.Parameters.AddWithValue("@id", id);

    await using var reader = await command.ExecuteReaderAsync(ct);
    return await reader.ReadAsync(ct) ? new Order(reader.GetInt32(0), reader.GetDecimal(1)) : null;
    // ...and returned to the pool here, when the using block ends.
}
```

EF Core의 `DbContext`도 이 ADO.NET 풀을 그대로 쓰므로, `DbContext`를 짧게 쓰는 것이 곧 연결을 짧게 쓰는 것입니다. `AddDbContextPool`은 또 다른 이야기입니다. 연결이 아니라 `DbContext` 객체를 재사용합니다.
