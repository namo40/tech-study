---
title: "Isolation Level"
summary: "격리 수준은 동시에 도는 두 트랜잭션이 서로의 무엇을 볼 수 있는가에 대한 데이터베이스의 답이며, 그 대가로 얼마나 자주 기다려야 하는지가 함께 정해집니다. 각 수준은 이름 붙은 이상 현상의 집합을 허용하므로, 하나를 고른다는 것은 당신 코드가 어떤 이상 현상을 만날 준비가 되어 있는지를 고르는 일입니다."
category: "트랜잭션과 동시성"
scene: isolation-level
steps:
  - title: "커밋된 것 아니면 아무것도"
    text: "두 트랜잭션이 한 행을 공유합니다. 첫 번째가 고치는 도중에 두 번째가 읽으면, 마지막으로 커밋된 값만 보이고 반쯤 바뀐 값은 절대 보이지 않습니다. 그 바닥이 read committed이고, 거의 모든 데이터베이스가 여기서 시작하게 합니다."
  - title: "같은 쿼리를 두 번, 답은 두 개"
    text: "한 트랜잭션 안에서 두 번 읽는 사이에 다른 쪽이 변경을 커밋하면, 두 번째 읽기가 첫 번째와 어긋납니다. 수준을 올리면 두 읽기가 다시 일치합니다. 대가는 이제 쓰는 쪽이 당신을 기다리게 된다는 것입니다."
  - title: "잠금 대신 버전"
    text: "스냅샷은 시작하던 순간의 세계를 읽습니다. 아무도 기다리지 않습니다. 쓰기는 여전히 충돌합니다. 두 트랜잭션이 같은 행을 고치면 버전 번호가 진 쪽을 가려내고, 한쪽은 롤백하고 다시 시도합니다. 낙관은 비용을 기다림에서 재시도로 옮깁니다."
  - title: "형용사가 아니라 이상 현상을 고릅니다"
    text: "각 수준은 표의 한 행입니다. 어떤 이상 현상을 허용하는지, 남을 얼마나 기다리게 하는지. serializable은 아무것도 허용하지 않는 대신 모두를 줄 세우고, read committed는 가장 덜 기다리게 하는 대신 가장 많이 보여 줍니다. 당신 코드가 실제로 견딜 수 있는 이상 현상을 기준으로 고릅니다."
related:
  - label: Local Transaction
    slug: local-transaction
  - label: Row Version
    slug: row-version
  - label: Concurrency Token
    slug: concurrency-token
  - label: Lock
    slug: lock
  - label: Deadlock
    slug: deadlock
  - label: Lost Update
    slug: lost-update
  - label: Optimistic Concurrency
    slug: optimistic-concurrency
  - label: Pessimistic Concurrency
    slug: pessimistic-concurrency
  - label: Read-Your-Writes
    slug: read-your-writes
  - label: Replication
    slug: replication
references:
  - title: SET TRANSACTION ISOLATION LEVEL (Transact-SQL)
    url: https://learn.microsoft.com/en-us/sql/t-sql/statements/set-transaction-isolation-level-transact-sql
  - title: PostgreSQL transaction isolation
    url: https://www.postgresql.org/docs/current/transaction-iso.html
  - title: Handling concurrency conflicts (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/saving/concurrency
  - title: Using transactions (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/saving/transactions
  - title: Transaction locking and row versioning guide (SQL Server)
    url: https://learn.microsoft.com/en-us/sql/relational-databases/sql-server-transaction-locking-and-row-versioning-guide
---

## 언제 쓰나

- 행을 읽고 나서 그 행을 쓰는 트랜잭션에는 누가 고르든 고르지 않든 격리 수준이 붙어 있습니다. 재고 수량, 잔액, 좌석, 쿠폰처럼 읽고 고쳐서 다시 쓰는 경로가 바로 수준이 각주이기를 그만두는 자리입니다.
- 스스로 앞뒤가 맞아야 하는 보고서에는 읽기를 붙들어 두는 수준이 필요합니다. read committed에서 열두 개의 쿼리로 만드는 월간 집계는, 열두 번째 쿼리가 첫 번째 쿼리는 못 본 커밋을 봤다는 이유로 자기 자신과 어긋날 수 있습니다.
- 무언가를 조정하기 전에 쓰는 데이터베이스의 기본값부터 확인합니다. SQL Server는 공유 잠금을 쓰는 read committed로 출고되고, PostgreSQL은 행 버전을 쓰는 read committed로 출고됩니다. SQL Server에서 `READ_COMMITTED_SNAPSHOT`을 켜면 코드는 한 줄도 바뀌지 않은 채 read committed의 뜻이 바뀝니다.
- 읽기가 쓰는 쪽 뒤에 자꾸 막히고 충돌을 재시도할 여유가 있다면 스냅샷을 집어 듭니다. 잠금을 쓰는 더 높은 수준은 기다림이 재시도보다 싼 자리에서만 씁니다.

## 주의점

- 수준은 가시성에 관한 것이지 정확성에 관한 것이 아닙니다. 행을 메모리로 읽고 트랜잭션을 닫고 2분을 고민한 뒤 계산한 값을 되쓴다면 serializable조차 lost update에서 당신을 구해 주지 못합니다. 그 틈에는 그 틈을 가로질러 유지되는 버전이나 잠금이 필요하고, 거기까지 닿는 수준은 없습니다.
- 수준을 전역으로 올리면 아무도 겪지 않던 이상 현상을 막는 대가로 처리량을 내줍니다. serializable은 그것이 필요했던 한 경로를 위해 모든 트랜잭션을 줄 세우므로, 수준은 그것이 필요한 트랜잭션에 걸고 나머지는 건드리지 마세요.
- 스냅샷은 충돌을 없애지 않고 옮깁니다. 읽기는 기다리지 않게 되고 쓰기는 커밋 시점에 실패하기 시작하므로, 쓰기를 하는 스냅샷 트랜잭션에는 전부 재시도 루프가 필요합니다. 그리고 그 재시도는 실패한 문장 하나가 아니라 작업 단위 전체를 다시 돌려야 합니다.
- phantom 행은 대부분의 예상보다 멀리까지 살아남습니다. repeatable read는 이미 만진 행을 지키지 나중에 도착하는 행을 지키지 않으므로, repeatable read 트랜잭션 안의 `COUNT`는 여전히 늘어날 수 있습니다. 그것까지 닫으려면 serializable이나 명시적인 범위 잠금이 필요합니다.
- 수준은 따라다니지 않습니다. 트랜잭션이 사는 동안 그 연결에 적용되므로, 같은 논리적 작업 안에서 두 번째 연결을 여는 코드는 거기서는 기본값으로 돌고 있습니다. 지연 평가되는 시퀀스를 돌려주는 코드는 호출한 쪽이 다 읽기도 전에 트랜잭션을 이미 닫아 놓은 경우가 많습니다.
- 트랜잭션이 길어질수록 모든 수준이 비싸집니다. 수준은 누가 기다릴지를 정하고, 트랜잭션의 길이는 얼마나 기다릴지를 정합니다. HTTP 호출, 메시지 발송, 사용자가 고민하는 시간을 가로질러 트랜잭션을 붙들지 마세요.

## .NET에서는

EF Core와 ADO.NET은 둘 다 수준을 쿼리가 아니라 트랜잭션에서 받습니다. 여기에 EF Core는 어느 수준에서든 낙관적 동시성이 동작하게 만드는 버전 검사를 더해 줍니다.

```csharp
// 1. The level is a property of the transaction, not of the query.
await using var tx = await db.Database.BeginTransactionAsync(
    IsolationLevel.Snapshot, ct);

var item = await db.Stock.SingleAsync(s => s.Id == id, ct);
item.Count -= 1;
await db.SaveChangesAsync(ct);
await tx.CommitAsync(ct);

// 2. A concurrency token makes the write conditional on the version it read,
//    so a conflict is detected even at read committed.
public sealed class StockItem
{
    public int Id { get; set; }
    public int Count { get; set; }
    [Timestamp] public byte[] RowVersion { get; set; } = [];
}

// 3. Retry the whole unit of work, because the failed one was rolled back.
var strategy = db.Database.CreateExecutionStrategy();
await strategy.ExecuteAsync(async () =>
{
    await using var tx = await db.Database.BeginTransactionAsync(ct);
    try
    {
        await SellAsync(db, id, ct);
        await tx.CommitAsync(ct);
    }
    catch (DbUpdateConcurrencyException ex)
    {
        await ex.Entries.Single().ReloadAsync(ct);   // reload, reapply, run again
        throw;
    }
});
```

SQL Server에서는 `ALTER DATABASE … SET READ_COMMITTED_SNAPSHOT ON`이 대개 가장 값어치가 큰 변경입니다. 읽는 쪽이 공유 잠금을 잡는 대신 버전을 읽게 되어, 보통의 애플리케이션이 겪는 블로킹과 데드락이 상당 부분 사라집니다. 대신 `tempdb`의 버전 저장소 공간을 씁니다. `IsolationLevel.Snapshot`은 또 다른 것이라 `ALLOW_SNAPSHOT_ISOLATION`을 따로 켜야 하고, 갱신 충돌에서 3960 오류를 올리는 쪽이 이것입니다. PostgreSQL에서는 `REPEATABLE READ`가 이미 스냅샷 격리이고 `SERIALIZABLE`은 여기에 술어 추적을 더해 직렬화 실패로 트랜잭션을 중단시킬 수 있으므로, 둘 다 같은 재시도 루프를 필요로 합니다.
