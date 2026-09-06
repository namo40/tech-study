---
title: "Materialized View"
summary: "A materialized view stores the result of an expensive query as a real table, so readers get precomputed rows instead of a scan. It is stale between refreshes, and choosing how and when to refresh is the whole design."
category: "Data storage"
tags: ["database", "consistency"]
level: 4
scene: materialized-view
steps:
  - title: "A million rows"
    text: "Each dashboard load joins three tables and aggregates a million rows to produce thirty. The answer is the same as a minute ago; the work is not."
  - title: "Materialise it"
    text: "Run the expensive query once and store its thirty rows as a table. Every dashboard load now reads thirty rows, and the database does the million-row work once instead of on every request."
  - title: "Stale between refreshes"
    text: "New orders land in the base table, and the view keeps answering with the rows it was last given until it is refreshed. Refresh on a schedule when minutes of lag are fine, or incrementally on each write when they are not."
  - title: "What to materialise"
    text: "A view costs storage and refresh work, so materialise the few queries that are asked constantly and can tolerate their refresh lag. Everything else stays a query."
related:
  - label: Read Model
    slug: read-model
  - label: Projection
    slug: projection
  - label: CQRS
    slug: command-query-responsibility-segregation
  - label: Cache-Aside
    slug: cache-aside
  - label: N+1 Query
    slug: n-plus-1-query
  - label: Data Warehouse
    slug: data-warehouse
  - label: Database Index
    slug: database-index
  - label: Query Plan
    slug: query-plan
  - label: Eventual Consistency
    slug: eventual-consistency
references:
  - title: Materialized View pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/materialized-view
  - title: Keyless entity types (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/modeling/keyless-entity-types
  - title: Create indexed views (SQL Server)
    url: https://learn.microsoft.com/en-us/sql/relational-databases/views/create-indexed-views
---

## When to use

- The same expensive aggregate or join is requested far more often than its inputs change. A dashboard that ten people open every minute over a table nobody writes to twice an hour is the clearest case.
- Readers can tolerate the refresh lag, or the database can maintain the view incrementally so that there is barely any.
- You want the precomputed result queryable and joinable inside the database, not just cached in the application. A view can be indexed, joined to and granted on; a cache entry can only be fetched by its key.

## Cautions

- A materialized view is stale by design. State the refresh interval next to the number on the dashboard, because a figure with no timestamp will be read as live.
- Refresh is real work. Schedule it off-peak, use concurrent or incremental refresh so readers are not blocked while it runs, and watch its duration the way you watch a query's.
- Indexed views in SQL Server are maintained on every write to the base tables. That cost lands on the writers, not on the readers who benefit, which is the trade the scene's last step is about.
- Do not materialise everything. Start from the top few entries in the query log, and leave the long tail as ordinary queries.
- A view is not a substitute for an index. If the query is slow because it has no supporting index, add the index first and see whether anything is left to materialise.

## In .NET

PostgreSQL stores the view as a table you can index, and `REFRESH MATERIALIZED VIEW CONCURRENTLY` rewrites it while readers keep reading the old rows. The unique index is what makes the concurrent form legal.

```sql
CREATE MATERIALIZED VIEW sales_by_day AS
SELECT date_trunc('day', o.placed_at) AS day, SUM(i.quantity * i.unit_price) AS total
FROM orders o JOIN order_items i ON i.order_id = o.id
GROUP BY 1;
CREATE UNIQUE INDEX ON sales_by_day (day);   -- required for REFRESH ... CONCURRENTLY
```

EF Core maps it as a keyless entity, so the read side is an ordinary `DbSet` over thirty rows with no joins in it, and a hosted service does the refreshing on the interval the dashboard advertises.

```csharp
public sealed class SalesByDay { public DateTime Day { get; init; } public decimal Total { get; init; } }

modelBuilder.Entity<SalesByDay>().HasNoKey().ToView("sales_by_day");

// Readers: thirty rows, no joins.
var rows = await db.Set<SalesByDay>().OrderByDescending(r => r.Day).Take(30).ToListAsync(ct);

// A scheduled job refreshes it; readers keep reading the old rows while it runs.
public sealed class SalesViewRefresher(IServiceScopeFactory scopes) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(5));
        while (await timer.WaitForNextTickAsync(ct))
        {
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ShopDbContext>();
            await db.Database.ExecuteSqlRawAsync("REFRESH MATERIALIZED VIEW CONCURRENTLY sales_by_day", ct);
        }
    }
}
```

SQL Server spells the incremental half of the scene differently: build the view `WITH SCHEMABINDING`, add a unique clustered index to it, and the engine maintains it on every write to the base tables. There is no refresh job to run and no lag to explain, and in exchange every insert into `orders` does a little of the aggregate's work on its way in. Two rules come attached: a view that groups has to carry `COUNT_BIG(*)` and cannot use `HAVING`, and the optimizer only substitutes the view automatically on Enterprise edition and on Azure SQL Database or Managed Instance — on Standard the query has to name the view with `WITH (NOEXPAND)`.
