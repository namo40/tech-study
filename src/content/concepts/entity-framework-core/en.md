---
title: "Entity Framework Core"
summary: "EF Core is .NET's default ORM: it translates LINQ into SQL, tracks what changed on the objects you loaded, and writes the updates for you. The price of that convenience is understanding the translation and the tracking."
category: ".NET data access"
tags: ["ef-core", "database"]
related:
  - label: N+1 Query
    slug: n-plus-1-query
  - label: Change Tracking
    slug: change-tracking
  - label: Database Migration
    slug: database-migration
  - label: LINQ
    slug: linq
  - label: Dapper
    slug: dapper
  - label: Compiled Query
    slug: compiled-query
  - label: Database Connection Pool
    slug: database-connection-pool
references:
  - title: EF Core overview
    url: https://learn.microsoft.com/en-us/ef/core/
  - title: Efficient querying (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/performance/efficient-querying
---

## When to use

- Take it when persistence should follow a domain model rather than a table list. Entities with navigation properties let an order carry its lines and its customer as objects, the mapping between those and the foreign keys is configuration, and the code that expresses a business rule reads as objects rather than as joins.
- Use migrations so the schema travels with the code that needs it. A model change produces a migration file that is reviewed, versioned with the code and applied as a step before the rollout, which is what makes "the schema on this branch" a meaningful phrase instead of a question for whoever owns the database.
- Lean on change tracking when a unit of work covers several entities. Load, mutate the objects, call `SaveChangesAsync` once, and EF Core works out the inserts, updates and deletes, orders them by their dependencies and wraps them in a transaction.
- Choose it when most queries are CRUD and moderate joins. That is the range the translation handles well, and the productivity is real: filtering, projection, paging and related-data loading come out of the same LINQ surface with the types checked at compile time.

## Cautions

- N+1 is a usage pattern, not a framework defect, and it is the most common performance bug in EF Core code. A loop that touches a navigation property runs a query per row; `Include` or a projection asks for it all in one. Read the query log rather than guessing, and treat query count as something a test can assert.
- Read paths should not pay for tracking. `AsNoTracking` skips the snapshot the change tracker keeps for each returned entity, which matters most on list endpoints returning hundreds of rows that nobody will modify. Projecting to a DTO with `Select` gets you the same benefit and sends fewer columns.
- Not every C# expression can become SQL, and the boundary is worth knowing precisely. An unsupported call in a `Where` throws at runtime rather than at compile time, and older habits of forcing evaluation with `AsEnumerable` early move the filter into memory, which pulls the whole table across the wire to discard most of it.
- Bulk work is against the grain of an ORM that loads, tracks and writes objects one at a time. `ExecuteUpdateAsync` and `ExecuteDeleteAsync` issue one set-based statement without loading anything, and for large imports or heavy reporting queries, Dapper or raw SQL is the honest answer rather than a defeat.

## In .NET

- The difference between `Include` and a projection is the difference between "give me the objects" and "give me exactly these columns", and it decides both what travels and what gets tracked.

```csharp
// Include: entities, tracked, all their columns, joined in one round trip.
var orders = await db.Orders
    .Include(o => o.Lines)
    .Where(o => o.CustomerId == customerId)
    .ToListAsync(ct);

// Projection: only the columns the response needs, nothing tracked.
var summaries = await db.Orders
    .AsNoTracking()
    .Where(o => o.CustomerId == customerId)
    .OrderByDescending(o => o.PlacedAt)
    .Select(o => new OrderSummary(o.Id, o.PlacedAt, o.Lines.Count, o.Total))
    .Take(50)
    .ToListAsync(ct);

// Set-based write: one UPDATE statement, no entities loaded, no tracking.
await db.Orders
    .Where(o => o.Status == OrderStatus.Pending && o.PlacedAt < cutoff)
    .ExecuteUpdateAsync(s => s.SetProperty(o => o.Status, OrderStatus.Expired), ct);
```

- `DbContext` is scoped, and that is not an arbitrary convention. It is not thread-safe, it accumulates tracked entities for as long as it lives, and `AddDbContext` registers it per request so each unit of work gets a clean tracker and returns its pooled connection promptly.
- Turn the generated SQL on while you are developing. `LogTo` with `EnableSensitiveDataLogging` in development shows exactly what each LINQ query became, which turns "this endpoint is slow" into a statement you can read and take to a query plan.
- Several `Include` calls on collections multiply rows into a cartesian product. `AsSplitQuery` sends one query per collection instead, trading round trips for a much smaller result set, and a projection often removes the choice entirely.
