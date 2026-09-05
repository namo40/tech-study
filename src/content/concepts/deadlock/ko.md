---
title: "Deadlock"
summary: "데드락은 두 트랜잭션이 서로 상대가 필요로 하는 잠금을 쥐고 있어 어느 쪽도 끝나지 못하는 상태입니다. 데이터베이스는 하나를 죽여서 풀고, 코드는 잠금을 한 가지 순서로 잡거나, 트랜잭션을 짧게 유지하거나, 기다리는 동안 잠금을 아예 쥐지 않는 방식으로 막습니다."
category: "트랜잭션과 동시성"
scene: deadlock
steps:
  - title: "잠금은 순서를 만듭니다"
    text: "서로 다른 행을 만지는 두 트랜잭션은 나란히 돕니다. 같은 행을 원하면 둘째가 첫째의 commit을 기다립니다. 그 기다림은 정상이고 짧습니다."
  - title: "데드락"
    text: "T1은 A를 쥐고 B를 원하고, T2는 B를 쥐고 A를 원합니다. 둘 다 움직일 수 없습니다. 데이터베이스가 순환을 발견해 하나를 죽이고, 남은 쪽이 끝냅니다. 희생된 쪽은 다시 시도해야 합니다."
  - title: "잠금은 한 가지 순서로"
    text: "모든 트랜잭션이 A 다음 B를 잡으면 둘째는 그저 첫째를 기다릴 뿐 순환은 생길 수 없습니다. 트랜잭션을 짧게 유지해 그 기다림도 짧게 만듭니다."
  - title: "아예 잠금을 쥐지 않기"
    text: "행을 버전과 함께 읽고, 일을 한 뒤, 버전이 그대로일 때만 씁니다. 충돌은 commit 시점에 감지되어 재시도되고, 기다리는 동안 쥐고 있는 잠금은 없습니다."
related:
  - label: Lock
    slug: lock
  - label: Isolation Level
    slug: isolation-level
  - label: Pessimistic Concurrency
    slug: pessimistic-concurrency
  - label: Optimistic Concurrency
    slug: optimistic-concurrency
  - label: Row Version
    slug: row-version
  - label: Lost Update
    slug: lost-update
  - label: Concurrency Token
    slug: concurrency-token
  - label: Local Transaction
    slug: local-transaction
  - label: Retry
    slug: retry
references:
  - title: SQL Server deadlocks guide
    url: https://learn.microsoft.com/en-us/sql/relational-databases/sql-server-deadlocks-guide
  - title: Handling concurrency conflicts (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/saving/concurrency
  - title: Using transactions (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/saving/transactions
---

## 언제 쓰나

- 관계형 데이터베이스에 여러 쓰기 주체가 동시에 접근하는 시스템이라면 언젠가는 데드락을 만납니다. 없앨 수 있는 버그가 아니라 동시 잠금이 가진 성질이므로, 안 나기를 바라지 말고 처음부터 대비해 설계합니다.
- 희생된 쪽을 다시 실행합니다. 데드락 오류는 정의상 일시적입니다. 살아남은 트랜잭션은 이미 끝났으므로 같은 일을 두 번째로 시도하면 대개 성공합니다.
- 같은 두 테이블이 계속 부딪힌다면 잠금 순서를 정하고, 화면에서 두 사용자가 같은 행 하나를 고친 상황이라면 낙관적 동시성을 씁니다.

## 주의점

- 규모가 커져도 통하는 해법은 잠금 순서입니다. 모든 코드 경로에서 행과 테이블을 같은 순서로(예를 들어 기본 키 순으로) 갱신하면, 쓰기 주체가 아무리 많아도 그 코드 경로들 사이에서는 순환이 생기지 않습니다.
- 트랜잭션을 짧게 유지하고, HTTP 호출이나 메시지 발송, 사용자가 생각하는 시간에 걸쳐 열어 두지 않습니다. 잠금을 쥐고 있는 1초는 다른 트랜잭션이 도착해 순환을 시작할 수 있는 1초이기도 합니다.
- 애그리게이트 하나를 읽고 고쳐서 쓰는 일이라면 낙관적 동시성이 낫고, 충돌이 잦아서 다시 시도하는 비용이 기다리는 비용보다 커진다면 짧은 비관적 잠금이 낫습니다.
- 데드락 재시도는 작업 단위 전체를 다시 실행해야 합니다. 희생된 트랜잭션은 통째로 롤백되었으므로, 실패한 문장 하나만 다시 보내면 이미 존재하지 않는 트랜잭션에 쓰는 셈이 됩니다.
- 데이터베이스의 데드락 추적을 켜 둡니다. 데드락 그래프는 어느 세션 둘이 어느 리소스 둘을 두고 부딪혔는지 알려 주는데, 이것이 있어야 짐작이 아니라 정확한 두 코드 경로를 고칠 수 있습니다.

## .NET에서는

EF Core에서는 세 가지가 대부분의 일을 합니다. 행을 일관된 순서로 만지는 것, 실행 전략으로 작업 단위 전체를 재시도하는 것, 그리고 잠금으로 막아야 했을 충돌을 `rowversion` 컬럼이 대신 감지하게 하는 것입니다.

```csharp
// 1. 일관된 순서: 모든 코드 경로에서 키 순으로 정렬해 행을 만진다.
foreach (var id in ids.Order())
{
    var account = await db.Accounts.FindAsync([id], ct);
    account!.Balance += delta;
}

// 2. 일시적 실패에는 작업 단위 전체를 재시도한다. 데드락(SQL Server 오류 1205)도 여기에 든다.
builder.Services.AddDbContext<BankDbContext>(o =>
    o.UseSqlServer(cs, sql => sql.EnableRetryOnFailure(maxRetryCount: 3)));

var strategy = db.Database.CreateExecutionStrategy();
await strategy.ExecuteAsync(async () =>
{
    await using var tx = await db.Database.BeginTransactionAsync(ct);
    await TransferAsync(db, from, to, amount, ct);
    await tx.CommitAsync(ct);
});

// 3. 낙관적 동시성: 고민하는 시간 동안 잠금을 쥐지 않고, 충돌은 SaveChanges에서 감지한다.
public sealed class Account
{
    public int Id { get; set; }
    public decimal Balance { get; set; }
    [Timestamp] public byte[] RowVersion { get; set; } = [];
}

try { await db.SaveChangesAsync(ct); }
catch (DbUpdateConcurrencyException ex)
{
    await ex.Entries.Single().ReloadAsync(ct);   // 다시 읽고, 변경을 다시 적용하고, 재시도한다
}
```

SQL Server에서 `READ_COMMITTED_SNAPSHOT`을 켜면 읽기-쓰기 데드락이 사라지는데, 보통의 애플리케이션이 겪는 데드락의 큰 몫이 여기에 해당합니다. 읽기가 공유 잠금 대신 행 버전을 가져가면서 쓰기를 막지 않게 되기 때문입니다. 쓰기 둘이 서로 데드락에 빠지는 일은 여전히 있으므로 잠금 순서는 그대로 중요합니다. 데드락 그래프 자체는 Extended Events로 수집해 두어, 어떤 두 코드 경로가 부딪혔는지를 추측이 아니라 사실로 확인합니다.
