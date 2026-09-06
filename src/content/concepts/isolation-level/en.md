---
title: "Isolation Level"
summary: "An isolation level is the database's answer to what two concurrent transactions may see of each other, traded against how often they must wait. Each level permits a named set of anomalies; picking one is choosing which anomalies your code is prepared to meet."
category: "Transactions and concurrency"
tags: ["database"]
level: 7
scene: isolation-level
steps:
  - title: "Committed or nothing"
    text: "Two transactions share one row. While the first is mid-change, the second reads — held a moment while the lock is checked — and sees only what was last committed, never the half-done value. That is read committed, the usual starting point."
  - title: "The same query, twice, two answers"
    text: "Between two reads inside one transaction, someone else commits a change, and the second read disagrees with the first. Raise the level and the reads agree again; the price is that the writer now waits for you."
  - title: "Versions instead of locks"
    text: "Snapshot reads the world as it was when you began, so readers never wait. Writes still collide: when two transactions change the same row, the version number betrays the loser, one rolls back and retries. Optimism trades waiting for retrying."
  - title: "Pick anomalies, not adjectives"
    text: "Each level is a row in a table: which anomalies it permits, how long it makes others wait. Serializable permits none and queues everyone; read committed waits least and shows the most. Choose by which anomaly your code can actually survive."
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

## When to use

- Any transaction that reads a row and then writes it has an isolation level, whether or not anybody chose one. The read-modify-write on an inventory count, a balance, a seat, a coupon: those are the paths where the level stops being a footnote.
- Reports that have to be self-consistent need a level that keeps their reads still. A monthly summary that runs twelve queries at read committed can disagree with itself because the twelfth query saw a commit the first one did not.
- Learn your database's default before you tune anything. On-premises SQL Server ships read committed with shared locks, Azure SQL Database turns `READ_COMMITTED_SNAPSHOT` on by default, PostgreSQL ships read committed with row versions, and flipping that setting in SQL Server changes what read committed means without changing a line of your code.
- Reach for snapshot when reads are getting stuck behind writers and you can afford to retry a conflict, and for a higher locking level only where the wait is cheaper than the retry.

## Cautions

- Levels are about visibility, not correctness. Even serializable will not save you from a lost update if you read a row into memory, close the transaction, think for two minutes, and write back what you computed. That gap needs a version or a lock held across it, and no level reaches that far.
- Raising the level globally trades throughput for anomalies nobody was hitting. Serializable makes every transaction queue for the sake of the one path that needed it, so set the level on the transaction that needs it and leave the rest alone.
- Snapshot does not remove the conflict, it moves it. Reads stop waiting and writes start failing at commit, which means every snapshot transaction that writes needs a retry loop, and the retry has to re-run the whole unit of work rather than the one statement that failed.
- Phantom rows survive further than most people expect. Under SQL Server's locking repeatable read, the level protects the rows you already touched, not the rows that arrive afterwards, so a `COUNT` inside a repeatable-read transaction can still grow. Closing that needs serializable or an explicit range lock. PostgreSQL is the exception rather than the rule here, because its `REPEATABLE READ` is snapshot isolation and has no phantoms to begin with.
- The level does not travel. It applies to the connection rather than to the operation, and on SQL Server it outlives the transaction on that session until the connection is closed or disposed, so code that opens a second connection inside the same logical operation is running at the default there, and code that returns a lazy sequence has usually closed the transaction before the caller finishes reading.
- Longer transactions make every level more expensive. A level decides who waits; the length of your transaction decides how long. Never hold one across an HTTP call, a message send, or user think time.

## In .NET

EF Core and ADO.NET both take the level on the transaction rather than on the query, and EF Core adds the version check that makes optimistic concurrency work at any level.

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
//    The built-in execution strategy re-runs the block for transient database
//    errors only, so a concurrency conflict needs a loop of your own.
for (var attempt = 0; attempt < 3; attempt++)
{
    await using var tx = await db.Database.BeginTransactionAsync(ct);
    try
    {
        await SellAsync(db, id, ct);
        await tx.CommitAsync(ct);
        break;
    }
    catch (DbUpdateConcurrencyException)
    {
        db.ChangeTracker.Clear();   // nothing committed; read again next time round
    }
}
```

On SQL Server, `ALTER DATABASE … SET READ_COMMITTED_SNAPSHOT ON` is usually the highest-value change available: readers stop taking shared locks and read a version instead, which removes a large share of the blocking and the deadlocks a typical application sees, at the cost of version store space in `tempdb`. `IsolationLevel.Snapshot` is a different thing again and needs `ALLOW_SNAPSHOT_ISOLATION` turned on separately, and it is the one that raises error 3960 on an update conflict. On PostgreSQL, `REPEATABLE READ` is already snapshot isolation and `SERIALIZABLE` adds predicate tracking that can abort a transaction with a serialization failure, so both of them need the same retry loop.
