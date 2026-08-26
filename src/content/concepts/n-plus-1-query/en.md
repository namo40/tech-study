---
title: "N+1 Query"
summary: "The N+1 query problem is one query for a list followed by one more query per row in it. It is invisible with five rows and fatal with five thousand, because the cost is round trips, not data."
category: ".NET data access"
tags: ["ef-core", "database", "latency"]
scene: n-plus-1-query
steps:
  - title: "N+1"
    text: "One query loads the list, then the code asks for each row's customer one at a time. Five orders cost six round trips."
  - title: "It scales with N"
    text: "The same code with twenty rows makes twenty-one round trips. Development data never has enough rows to show it, and production data does."
  - title: "Include"
    text: "Ask for the related rows in the same query and the database joins them: one round trip, all the data. Watch for cartesian blow-up when you include several collections."
  - title: "Load what you need"
    text: "Project with Select so only the columns you use travel, or batch the lookups into a single IN query. And read the query log: an ORM that hides round trips is the real problem."
related:
  - label: Entity Framework Core
    slug: entity-framework-core
  - label: LINQ
    slug: linq
  - label: Change Tracking
    slug: change-tracking
  - label: No-Tracking Query
    slug: no-tracking-query
  - label: Compiled Query
    slug: compiled-query
  - label: Query Plan
    slug: query-plan
  - label: Index
    slug: database-index
  - label: Dapper
    slug: dapper
  - label: DataLoader
    slug: dataloader
  - label: Batching
    slug: batching
references:
  - title: Loading related data (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/querying/related-data/
  - title: Efficient querying (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/performance/efficient-querying
  - title: EF Core overview
    url: https://learn.microsoft.com/en-us/ef/core/
---

## When to use

- A loop that touches a navigation property, calls `Find`, or runs a query per element is the shape to look for.
- A query count in the EF Core log that grows with the page size.
- Endpoints that are fast locally and slow in production, with the database CPU low and its request count high.

## Cautions

- `Include` is not free either. Several collection includes multiply rows into a cartesian explosion, so use `AsSplitQuery` or project instead.
- Lazy-loading proxies turn every navigation access into a query. Prefer explicit loading, so the cost is visible in the code that pays it.
- Projection with `Select` is usually the best answer for read endpoints: fewer columns, no change tracking, one query.
- Log and count queries in tests, and assert the count for list endpoints.

## In .NET

```csharp
// N+1: one query for the list, then one per row.
var orders = await db.Orders.ToListAsync(ct);
foreach (var order in orders)
{
    var customer = await db.Customers.FindAsync([order.CustomerId], ct); // a round trip per order
    Console.WriteLine($"{order.Id}: {customer!.Name}");
}

// Include: one query with a JOIN.
var orders = await db.Orders
    .Include(o => o.Customer)
    .ToListAsync(ct);

// Select: only the columns you need, no tracking, one query.
var rows = await db.Orders
    .Select(o => new { o.Id, o.Total, Customer = o.Customer.Name })
    .ToListAsync(ct);
```

Turn the query log on with `optionsBuilder.LogTo(Console.WriteLine, LogLevel.Information)`, and when one query includes several collections use `AsSplitQuery()` so EF Core sends one query per collection instead of a single enormous join.
