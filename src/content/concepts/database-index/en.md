---
title: "Database Index"
summary: "A database index is a sorted copy of one or more columns with pointers back to the rows: reads stop scanning and start seeking, writes pay a little extra to keep it sorted, and the same structure quietly powers uniqueness and fast pagination."
category: ".NET data access"
tags: ["database", "latency"]
level: 4
scene: database-index
steps:
  - title: "Scanning counts; seeking navigates"
    text: "The same question twice: against the table it reads all eight rows to find one. Against the index — a sorted copy of that column with pointers back — it takes two steps and one jump. The difference is not speed; it is arithmetic."
  - title: "Reads bought the speed; writes pay the bill"
    text: "The insert lands cheaply at the end of the table, then pays a little more to keep the index sorted. Add a second index and every write pays twice. Indexes are not free — they are a subscription, billed per write."
  - title: "Give the index a rule and it becomes a guarantee"
    text: "Unique means: while inserting, if the sorted position is already taken, refuse. The check and the claim are one step in one structure, so a second insert with the same key cannot win either. This refusal is what deduplication builds on."
  - title: "Page 500, two ways"
    text: "Offset walks the index counting five thousand keys just to discard them — every next page costs more than the last. Keyset seeks to the last key you saw and reads the next twenty. Same page, same index; one counts, the other navigates."
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

## When to use

- Columns a query actually filters, joins or sorts by: the ones named in `WHERE`, in `JOIN … ON` and in `ORDER BY`. Not the ones that merely exist.
- Foreign keys, which are joined constantly and, in most databases, are not indexed for you just because they are declared. EF Core does create one for each foreign key by convention, so read the migration before adding your own.
- Before adding one, read the plan. A seek says the index is being used and a scan says it is not, and that is a fact you can check rather than a thing to hope for.

## Cautions

- Every index taxes every write and takes storage. Index what you query, not everything you have.
- Column order in a composite index decides what it can serve. Only a leftmost prefix is usable, so `(TenantId, CreatedAt)` helps a query filtering on the tenant and one filtering on both, and cannot be seeked for one filtering only on the date — at best it is scanned.
- Low-selectivity columns barely help. An index on a flag that is true for half the table is a slower way of reading half the table.
- Missing-index hints and `EXPLAIN` beat intuition, but a hint is one query's opinion, not a plan for the table. Three overlapping hints usually mean one composite index, not three new ones.
- Indexes fragment and statistics go stale. A plan that was right last quarter can be wrong today for reasons that have nothing to do with your code.

## In .NET

```csharp
protected override void OnModelCreating(ModelBuilder builder)
{
    // A rule and a lookup path at the same time.
    builder.Entity<User>().HasIndex(u => u.Email).IsUnique();

    // Leftmost prefix: this serves TenantId, and TenantId + CreatedAt.
    builder.Entity<Order>().HasIndex(o => new { o.TenantId, o.CreatedAt });
}

// The insert is the check. There is no window between them to lose.
try
{
    db.Users.Add(new User { Email = email });
    await db.SaveChangesAsync(ct);
}
catch (DbUpdateException ex) when (ex.InnerException is SqlException { Number: 2601 or 2627 })
{
    return Results.Conflict();
}

// Offset: the database orders 5020 rows and throws 5000 of them away.
var page = await db.Orders
    .OrderBy(o => o.Id)
    .Skip(5000)
    .Take(20)
    .ToListAsync(ct);

// Keyset: the same index, entered at the last key the caller saw.
var next = await db.Orders
    .Where(o => o.Id > lastSeenId)
    .OrderBy(o => o.Id)
    .Take(20)
    .ToListAsync(ct);
```

Turn the query log on with `optionsBuilder.LogTo(Console.WriteLine, LogLevel.Information)` and read the plan the database chose, because the model configuration only asks for an index — the optimiser decides whether to use it. And keep the keyset ordering and the index in step: a query ordered by `(CreatedAt, Id)` needs an index on `(CreatedAt, Id)`, or the seek you wrote turns back into the sort you were avoiding.
