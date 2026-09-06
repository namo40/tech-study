---
title: "Compiled Query"
summary: "A compiled query freezes the preparation step of an EF Core query so that the same LINQ expression does not have to be recognised and looked up again on every call. The SQL does not get faster; the hand that builds the SQL does."
category: ".NET data access"
tags: ["ef-core"]
level: 4
related:
  - label: Entity Framework Core
    slug: entity-framework-core
  - label: LINQ
    slug: linq
  - label: N+1 Query
    slug: n-plus-1-query
  - label: Query Plan
    slug: query-plan
  - label: Prepared Statement
    slug: prepared-statement
references:
  - title: Advanced Performance Topics
    url: https://learn.microsoft.com/en-us/ef/core/performance/advanced-performance-topics
---

## When to use

- The query is short, trivial and called constantly. A lookup-by-id endpoint that serves tens of thousands of requests a minute spends a measurable share of each request inside EF Core rather than inside the database, because the database work is one indexed seek and the framework work is the same on every call. That ratio is what makes the saving visible; on a query that scans a table, the same saving disappears into the noise.
- Profiling has actually shown you the translation and cache-lookup overhead. The honest entry condition is a trace or a benchmark where the time between the call and the command being sent is a real fraction of the total, not a suspicion that ORMs are slow. If the profile shows the time is in the database or in serialisation, a compiled query changes nothing at all.
- You are building for a startup-sensitive process. Moving query preparation into an explicit, statically-rooted delegate makes the work predictable and keeps it out of the first-request path, which matters more for a short-lived function instance than for a server that has been warm for a week. Native AOT is a different mechanism and not this one: EF Core gets there through precompiled queries generated at build time by `dotnet ef dbcontext optimize --precompile-queries`, which is still experimental.

## Cautions

- Measure first, because EF Core already caches query translations. The first execution of a LINQ query translates it and stores the result in EF Core's query cache, which every context built from the same options shares; every later execution recognises the expression tree and reuses the translation. A compiled query removes the recognition and the cache lookup, not the translation, so the gain is on the order of microseconds per call. That is worth having on a hot path taken a hundred thousand times a minute and worth nothing anywhere else.
- The SQL that comes out is identical, which means a slow query stays exactly as slow. If the statement is missing an index, returns too many columns or is being executed once per row in a loop, compiling it hands the database the same text and the same query plan. Fix the shape first: the N+1 Query page describes the loop, the Query Plan page describes the rest, and either fix is worth several orders of magnitude more than this one.
- The `DbContext` and every parameter must be arguments of the lambda, never captured variables. A captured value is baked into the expression at compile time, so the delegate keeps returning results for whichever id happened to be in scope when it was built, and a captured context is a disposed context on the second request. Passing them in is also what makes the delegate safe to share between concurrent requests, since the delegate holds no state of its own.
- It only pays off if the delegate outlives the call, which in practice means a `static readonly` field. Building the compiled query inside the method compiles it on every request, which is strictly more work than the cache lookup you were trying to avoid, and it is an easy mistake to make because the code still runs correctly and simply performs worse than what it replaced.

## In .NET

- `EF.CompileAsyncQuery` returns a delegate that takes the context, the parameters and a cancellation token. Store it in a static field and call it like an ordinary method.

```csharp
// One static delegate per query, built once for the life of the process.
private static readonly Func<ShopDbContext, int, CancellationToken, Task<Product?>> GetProductById =
    EF.CompileAsyncQuery(
        (ShopDbContext db, int id) =>
            db.Products.AsNoTracking().FirstOrDefault(p => p.Id == id));

// A sequence result comes back as IAsyncEnumerable, so it has no CancellationToken parameter.
private static readonly Func<ShopDbContext, int, IAsyncEnumerable<Order>> RecentOrdersFor =
    EF.CompileAsyncQuery(
        (ShopDbContext db, int customerId) =>
            db.Orders.AsNoTracking()
                .Where(o => o.CustomerId == customerId)
                .OrderByDescending(o => o.PlacedAt)
                .Take(20));

// The context and the parameters are arguments. Capturing either one is the bug.
var product = await GetProductById(db, id, ct);
```

- `EF.CompileQuery` is the synchronous twin and follows the same rules. Choose it only where the surrounding code is genuinely synchronous, because a blocking database call on a request thread costs far more than the compilation it saved.
- `AsNoTracking` belongs in the compiled expression for read paths, exactly as it would in an ordinary query. Change tracking on a hot read is usually a larger cost than translation, and it is the first thing to try when the profile pointed you here in the first place.
- Compiled queries and prepared-statement reuse solve different halves of the same journey. This one shortens the work in the .NET process before the command is sent; the parameterised command and the server's plan cache shorten the work after it arrives, and neither one substitutes for the other.
