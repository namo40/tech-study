---
title: "Change Tracking"
summary: "Change tracking is how a DbContext remembers every entity it handed you, compares it with a snapshot when you call SaveChanges, and writes only what changed, in one transaction. It is also the part you pay for on every query you never meant to modify."
category: ".NET data access"
tags: ["ef-core"]
scene: change-tracking
steps:
  - title: "Remember, compare, write the difference"
    text: "Every entity a query returns is tracked with a snapshot of its values. You change a property; nothing happens yet. SaveChanges compares, marks the entity Modified, and sends an UPDATE for the one column that changed."
  - title: "One unit of work"
    text: "Add, remove, and modify as much as you like; nothing reaches the database until SaveChanges, which sends every statement inside one transaction. If any of them fails, none of them count, and the tracker still holds your changes."
  - title: "Track only what you will change"
    text: "A read-only query that returns a thousand rows fills the tracker with a thousand snapshots, and every SaveChanges scans them. AsNoTracking skips the tracker entirely. And a DbContext lives for one request; a long-lived one never forgets anything."
  - title: "Detached entities and lost updates"
    text: "An entity from outside has no snapshot, so Update marks every column modified; attach it and mark the properties you mean. And add a concurrency token: the UPDATE then checks the version it read, and zero rows affected means someone else saved first."
related:
  - label: No-Tracking Query
    slug: no-tracking-query
  - label: Unit of Work
    slug: unit-of-work
  - label: DbContext
    slug: dbcontext
  - label: Optimistic Concurrency
    slug: optimistic-concurrency
  - label: Repository
    slug: repository
  - label: Projection
    slug: projection
  - label: N+1 Query
    slug: n-plus-1-query
  - label: Local Transaction
    slug: local-transaction
  - label: Lost Update
    slug: lost-update
references:
  - title: Change tracking in EF Core
    url: https://learn.microsoft.com/en-us/ef/core/change-tracking/
  - title: Tracking vs. no-tracking queries
    url: https://learn.microsoft.com/en-us/ef/core/querying/tracking
  - title: Handling concurrency conflicts (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/saving/concurrency
---

## When to use

- The default for load-modify-save flows in EF Core: read the entity, change properties, call SaveChanges once per unit of work.
- Never for read-only queries. Use `AsNoTracking`, or a projection to a DTO, which is never tracked either way.
- Whenever more than one change has to succeed or fail together. SaveChanges is already a transaction, so a unit of work costs you nothing extra.

## Cautions

- One DbContext per request or per unit of work. It is not thread-safe, and it never forgets what it tracked.
- Call SaveChanges once at the end, not after every change. Each call is its own transaction and its own round trip.
- `Update()` on a detached entity writes every column, which can overwrite a change somebody else made to a field your client never touched. Attach it and mark specific properties, or load the row and modify that.
- Add a concurrency token such as `rowversion` to anything two users can edit, and handle `DbUpdateConcurrencyException` with a reload and a retry, or a merge.
- Large tracked result sets make `DetectChanges` slow, because it is one pass per tracked entity on every save. Use `AsNoTracking`, projections, or `ChangeTracker.AutoDetectChangesEnabled = false` for bulk work.
- Tracked entities are identities within one context: the same row queried twice gives you the same object, which is convenient until you assume it holds across contexts.

## In .NET

EF Core tracks by default. The snapshot it takes when a query materialises an entity is what `SaveChanges` compares against, and the difference is the UPDATE.

```csharp
// Tracked: load, modify, save the difference.
var order = await db.Orders.FindAsync([12], ct);
order!.Status = OrderStatus.Paid;
await db.SaveChangesAsync(ct);          // UPDATE orders SET status = @p0 WHERE id = 12 AND rowversion = @p1

// Read-only: skip the tracker.
var recent = await db.Orders.AsNoTracking()
    .Where(o => o.CreatedAt > since)
    .Select(o => new OrderSummary(o.Id, o.Status, o.Total))   // a projection is never tracked
    .ToListAsync(ct);

// Detached entity from an API request: mark only what the client may change.
db.Orders.Attach(incoming);
db.Entry(incoming).Property(o => o.Note).IsModified = true;
try
{
    await db.SaveChangesAsync(ct);
}
catch (DbUpdateConcurrencyException)
{
    // someone saved first: reload, merge, or tell the user
}

// The concurrency token, in the model.
modelBuilder.Entity<Order>().Property(o => o.RowVersion).IsRowVersion();
```

`AddDbContext` registers a scoped lifetime, so every request gets a fresh context and the tracker starts empty. Background work has no request to scope to, so resolve `IDbContextFactory<T>` and create one context per unit of work instead of holding a long-lived one.
