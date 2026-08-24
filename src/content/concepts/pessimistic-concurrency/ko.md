---
title: "Pessimistic Concurrency"
summary: "비관적 동시성은 먼저 잠급니다. 트랜잭션이 바꾸려는 행을 미리 차지하고 commit할 때까지 쥐고 있으므로, 두 번째 쓰기는 실패하는 대신 기다립니다. 충돌이 잦고 락을 잡은 뒤 commit까지의 일이 짧을 때 알맞습니다."
category: "트랜잭션과 동시성"
scene: deadlock
sceneStep: 3
related:
  - label: Deadlock
    slug: deadlock
  - label: Lock
    slug: lock
  - label: Optimistic Concurrency
    slug: optimistic-concurrency
  - label: Isolation Level
    slug: isolation-level
  - label: Local Transaction
    slug: local-transaction
  - label: Database Connection Pool
    slug: database-connection-pool
references:
  - title: Transaction locking and row versioning guide (SQL Server)
    url: https://learn.microsoft.com/en-us/sql/relational-databases/sql-server-transaction-locking-and-row-versioning-guide
  - title: Using transactions (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/saving/transactions
---

이름에 이미 판단이 들어 있습니다. 비관적 동시성은 두 번째 쓰기가 올 것이라고 가정하고, 읽는 시점에 배타 락을 잡아 commit까지 놓지 않습니다. 그 사이에는 아무도 그 행을 바꿀 수 없으므로, 트랜잭션이 읽은 값이 곧 지금 갱신하고 있는 값입니다. 낙관적 동시성이 충돌을 나중에 감지한다면, 이쪽은 충돌 자체를 일어나지 않게 합니다.

그래서 유리한 상황은 하나로 좁혀집니다. 충돌이 잦아서 다시 시도하는 비용이 기다리는 비용보다 커질 때입니다. 좌석 예약, 인기 상품의 재고 차감, 모든 요청이 건드리는 카운터가 그렇습니다. 코드도 단순해집니다. 충돌 경로를 따로 쓸 필요가 없고, 다시 읽어서 다시 적용하는 반복문을 정확히 짜야 할 일도 없습니다.

대가는 다른 트랜잭션이 막힌다는 것이고, 막힌 트랜잭션은 자기가 쥔 것을 모두 그대로 붙들고 있습니다. 자기 락도, 풀에서 빌린 연결도 마찬가지입니다. 비관적 트랜잭션 안에 느린 문장이 하나 있으면 그것이 풀 앞의 대기열이 되고 다시 애플리케이션의 Timeout이 되는데, 정작 데이터베이스는 한가해 보입니다. 같은 행들을 서로 다른 순서로 잠그는 두 트랜잭션은 데드락이 됩니다. 두 문제 모두 같은 규율로 묶입니다. 한 가지 순서로 잠그고, 데이터베이스를 한 번 왕복하는 시간 안에 들어갈 만큼 트랜잭션을 짧게 유지합니다.

EF Core에는 비관적 모드가 따로 없어서 락은 SQL로 요청합니다. SQL Server에서는 쿼리 힌트를 쓰고 PostgreSQL에서는 `SELECT ... FOR UPDATE`를 씁니다. 어느 쪽이든 명시적 트랜잭션 안에서 잡아야 락이 작업 단위와 정확히 같은 기간만 살아 있습니다.

```csharp
await using var tx = await db.Database.BeginTransactionAsync(ct);

// SQL Server: claim the row for update before reading it.
var account = await db.Accounts
    .FromSql($"SELECT * FROM Accounts WITH (UPDLOCK, ROWLOCK) WHERE Id = {id}")
    .SingleAsync(ct);

account.Balance -= amount;
await db.SaveChangesAsync(ct);
await tx.CommitAsync(ct);
```
