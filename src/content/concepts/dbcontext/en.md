---
title: "DbContext"
summary: "A DbContext is one session with the database: the connection it borrows, the entities it is tracking, and the unit of work it will commit. It is cheap to create, not thread-safe, and meant to live for one request."
category: ".NET data access"
tags: ["ef-core", "database"]
scene: change-tracking
sceneStep: 3
related:
  - label: Change Tracking
    slug: change-tracking
  - label: Unit of Work
    slug: unit-of-work
  - label: No-Tracking Query
    slug: no-tracking-query
  - label: Database Connection Pool
    slug: database-connection-pool
  - label: Repository
    slug: repository
  - label: Transaction
    slug: transaction
references:
  - title: DbContext lifetime, configuration and initialization
    url: https://learn.microsoft.com/en-us/ef/core/dbcontext-configuration/
  - title: Change tracking in EF Core
    url: https://learn.microsoft.com/en-us/ef/core/change-tracking/
---

A DbContext is three things at once, and most of the advice about it follows from that. It is the query surface, so it holds the model and the connection it borrows from the pool. It is the change tracker, so it holds a snapshot of every entity it has handed you. And it is the unit of work, so it holds the changes that will be committed together the next time you call SaveChanges. Everything it keeps is scoped to itself and nothing is shared between two of them.

That is why it is scoped to a request. `AddDbContext` registers it that way by default: each request resolves its own context, gets an empty tracker, borrows a connection while a query is running, and is disposed at the end. Creating one is deliberately cheap, because the expensive parts are the model, which is built once and cached, and the connection, which comes from the pool.

The failure mode of a longer lifetime is not a crash, it is a slow leak. A context registered as a singleton accumulates the tracked entities of every request that ever used it, so the tracker grows without bound, every SaveChanges scans a set that keeps getting larger, and the memory is never released. The other failure mode is concurrency: a DbContext supports exactly one operation at a time, so two parallel `await`s on the same instance throw rather than interleave.

```csharp
// Scoped by default: one context per request, empty tracker, disposed at the end.
builder.Services.AddDbContext<ShopDbContext>(o => o.UseNpgsql(cs));

// Background work has no request to scope to, so make one per unit of work.
builder.Services.AddDbContextFactory<ShopDbContext>(o => o.UseNpgsql(cs));

public sealed class NightlyJob(IDbContextFactory<ShopDbContext> factory)
{
    public async Task RunAsync(CancellationToken ct)
    {
        await using var db = await factory.CreateDbContextAsync(ct);
        // ... one unit of work, then this context goes away
    }
}
```

Two habits keep it healthy. Do not hold a context across anything slow that is not a database call, because the connection and the transaction go with it. And do not let a long-running loop share one context across thousands of iterations: either create one per batch, or call `ChangeTracker.Clear()` between batches so the tracker does not carry work that is already finished.
