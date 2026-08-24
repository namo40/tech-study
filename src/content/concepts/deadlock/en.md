---
title: "Deadlock"
summary: "A deadlock is two transactions each holding a lock the other needs, so neither can finish. The database breaks it by killing one of them; the code prevents it by taking locks in one order, keeping transactions short, or not holding a lock across the wait at all."
category: "Transactions and concurrency"
scene: deadlock
steps:
  - title: "Locks serialise"
    text: "Two transactions touching different rows run side by side. When they want the same row, the second one waits for the first to commit. That wait is normal and short."
  - title: "Deadlock"
    text: "T1 holds A and wants B; T2 holds B and wants A. Neither can move. The database notices the cycle, kills one of them, and the survivor finishes. The victim must retry."
  - title: "Take locks in one order"
    text: "If every transaction locks A before B, the second one simply waits for the first; a cycle cannot form. Keep the transaction short so that wait stays short too."
  - title: "Or hold no lock at all"
    text: "Read the row with its version, do the work, and write only if the version is unchanged. A conflict is detected at commit and retried, and no lock is ever held across the wait."
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

## When to use

- Any system with concurrent writers on a relational database will meet deadlocks eventually. They are a property of concurrent locking, not a bug you can remove, so design for them rather than hoping.
- Retry the victim. A deadlock error is transient by definition: the transaction that survived has finished, so the same work usually succeeds the second time.
- Reach for a lock order when the same two tables keep colliding, and for optimistic concurrency when the collision is one row that two users edited from a screen.

## Cautions

- Lock order is the fix that scales. Update rows and tables in the same order in every code path, for example sorted by primary key, and a cycle cannot form no matter how many writers there are.
- Keep transactions short, and never hold one across an HTTP call, a message send, or user think time. Every second a lock is held is a second another transaction can arrive and start a cycle.
- Prefer optimistic concurrency for read-modify-write on a single aggregate; prefer short pessimistic locks when conflicts are frequent enough that retrying would be more expensive than waiting.
- A deadlock retry has to re-run the whole unit of work. The victim was rolled back completely, so replaying only the statement that failed writes into a transaction that no longer exists.
- Turn on deadlock tracing in the database. The deadlock graph names both sessions and both resources, which is the difference between fixing the right two code paths and guessing.

## In .NET

Three things do most of the work in EF Core: touching rows in a consistent order, retrying the whole unit of work through the execution strategy, and letting a `rowversion` column detect the conflicts that a lock would otherwise have to prevent.

```csharp
// 1. Consistent order: touch rows sorted by key, in every code path.
foreach (var id in ids.Order())
{
    var account = await db.Accounts.FindAsync([id], ct);
    account!.Balance += delta;
}

// 2. Retry the whole unit of work on transient failures, including deadlocks (SQL Server error 1205).
builder.Services.AddDbContext<BankDbContext>(o =>
    o.UseSqlServer(cs, sql => sql.EnableRetryOnFailure(maxRetryCount: 3)));

var strategy = db.Database.CreateExecutionStrategy();
await strategy.ExecuteAsync(async () =>
{
    await using var tx = await db.Database.BeginTransactionAsync(ct);
    await TransferAsync(db, from, to, amount, ct);
    await tx.CommitAsync(ct);
});

// 3. Optimistic concurrency: no lock across the think time, conflict detected at SaveChanges.
public sealed class Account
{
    public int Id { get; set; }
    public decimal Balance { get; set; }
    [Timestamp] public byte[] RowVersion { get; set; } = [];
}

try { await db.SaveChangesAsync(ct); }
catch (DbUpdateConcurrencyException ex)
{
    await ex.Entries.Single().ReloadAsync(ct);   // reload, reapply the change, retry
}
```

On SQL Server, turning on `READ_COMMITTED_SNAPSHOT` removes about half the deadlocks a typical application sees, because readers stop blocking writers and take a row version instead of a shared lock. Collect the deadlock graphs themselves with Extended Events, so the two code paths that collided are a fact rather than a theory.
