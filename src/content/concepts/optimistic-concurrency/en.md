---
title: "Optimistic Concurrency"
summary: "Optimistic concurrency takes no lock. It reads the row together with a version, does the work, and writes only if the version has not moved; a conflict is found at save time and the whole unit of work is run again."
category: "Transactions and concurrency"
tags: ["database", "consistency"]
scene: deadlock
sceneStep: 4
related:
  - label: Deadlock
    slug: deadlock
  - label: Lost Update
    slug: lost-update
  - label: Pessimistic Concurrency
    slug: pessimistic-concurrency
  - label: Row Version
    slug: row-version
  - label: Concurrency Token
    slug: concurrency-token
  - label: Retry
    slug: retry
references:
  - title: Handling concurrency conflicts (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/saving/concurrency
  - title: rowversion (Transact-SQL)
    url: https://learn.microsoft.com/en-us/sql/t-sql/data-types/rowversion-transact-sql
---

The mechanism is one extra column and one extra clause. The row carries a version that the database changes on every write, the application reads that version along with the data, and the update says `WHERE Id = @id AND RowVersion = @versionIRead`. If somebody else wrote the row in the meantime the version has moved, the `WHERE` matches nothing, and zero rows are affected. That zero is the conflict signal, and it costs nothing when there is no conflict.

What makes it worth doing is what happens between the read and the write. A user opens an edit screen, thinks for two minutes, and clicks save. Under a pessimistic lock that is two minutes of an exclusive lock on a row and, in many stacks, two minutes of a borrowed connection. Under a version check nothing is held: the request that reads and the request that writes are separate, short, and independent, and the second one finds out at save time whether the world moved.

Handling the conflict is the part worth designing rather than catching. Reload the current row, decide what "reapply" means for this field, and try again. For a balance, reapplying means recomputing from the value you just reloaded, not writing back the total you computed from the stale one. For a document a user edited, reapplying may mean showing them what changed and asking. The retry has to re-run the whole unit of work, because the failed save left nothing behind.

In EF Core the version is a concurrency token, and `[Timestamp]` on a `byte[]` maps it to a SQL Server `rowversion` the database maintains itself. A failed save raises `DbUpdateConcurrencyException`, which carries the entries that lost.

```csharp
public sealed class Account
{
    public int Id { get; set; }
    public decimal Balance { get; set; }
    [Timestamp] public byte[] RowVersion { get; set; } = [];
}

for (var attempt = 0; attempt < 3; attempt++)
{
    var account = await db.Accounts.FindAsync([id], ct);
    account!.Balance += delta;
    try
    {
        await db.SaveChangesAsync(ct);
        break;
    }
    catch (DbUpdateConcurrencyException)
    {
        // Nothing was written. Drop the stale tracking so the loop's FindAsync
        // reads the current row and reapplies `delta` to that one.
        db.ChangeTracker.Clear();
    }
}
```

It is not a cure for everything. Optimistic concurrency protects one row against a competing write; it does not make two rows consistent with each other, and it does not help when the conflicting change is an insert rather than an update. When conflicts are constant rather than occasional, the retries become the cost, and a short pessimistic lock is cheaper.
