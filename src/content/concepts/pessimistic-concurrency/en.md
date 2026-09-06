---
title: "Pessimistic Concurrency"
summary: "Pessimistic concurrency locks first: a transaction claims the rows it is about to change and holds them until it commits, so a second writer waits rather than fails. It fits when conflicts are frequent and the work between the lock and the commit is short."
category: "Transactions and concurrency"
tags: ["database", "consistency"]
level: 5
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

The bet is in the name. Pessimistic concurrency assumes a second writer is coming, so it takes an update lock (or an exclusive one) at read time and keeps it until the commit. An update lock still lets ordinary readers through and blocks only the next transaction that also intends to write, which is why it is the usual choice: claiming it at read time avoids the deadlock two transactions produce when they each try to upgrade a shared lock to an exclusive one. Either way, nobody else can change the row in between, which means the value the transaction read is still the value it is updating. Where optimistic concurrency detects a conflict afterwards, this prevents it from happening at all.

That makes it the better trade in exactly one situation: when conflicts are common enough that retrying would cost more than waiting. A seat reservation, a stock decrement on a popular item, a counter that every request touches. It also makes the code simpler, because there is no conflict path to write and no reload-and-reapply loop to get right.

The price is that other transactions block, and blocked transactions hold on to everything else they have: their own locks, and the connection they borrowed from the pool. A slow statement inside a pessimistic transaction turns into a queue at the pool and then into timeouts in the application, while the database itself looks idle. Two transactions that lock the same rows in different orders turn into a deadlock. Both problems are bounded by the same discipline: lock in one order, and keep the transaction down to a handful of round trips with no external call in between.

EF Core has no built-in pessimistic mode, so the lock is requested in SQL. On SQL Server that is a query hint, and on PostgreSQL it is `SELECT ... FOR UPDATE`; either way, take it inside an explicit transaction so the lock lives exactly as long as the unit of work does.

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
