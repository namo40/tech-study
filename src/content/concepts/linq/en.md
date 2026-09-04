---
title: "LINQ"
summary: "LINQ is the query surface built into C#: the same operators filter a list in memory and a table in a database. Deferred execution and the IQueryable boundary are what decide which of those two is happening."
category: ".NET data access"
related:
  - label: Entity Framework Core
    slug: entity-framework-core
  - label: N+1 Query
    slug: n-plus-1-query
  - label: Dapper
    slug: dapper
  - label: Pagination
    slug: pagination
references:
  - title: Language Integrated Query (LINQ)
    url: https://learn.microsoft.com/en-us/dotnet/csharp/linq/
  - title: Introduction to LINQ queries (deferred execution)
    url: https://learn.microsoft.com/en-us/dotnet/csharp/linq/get-started/introduction-to-linq-queries
---

## When to use

- Use it to express a transformation as what you want rather than as how to loop. `Where`, `Select`, `GroupBy` and `OrderBy` say filter, project, group and sort, and the reader gets the intent without reconstructing it from an index variable and a mutable accumulator.
- It is the language you write EF Core queries in. The same operators you use on a `List<T>` build the expression tree that becomes SQL, which is why learning the operators once pays off against collections, databases and other queryable sources alike.
- Compose pipelines in pieces when the shape of a query depends on the request. Because each operator returns a new query rather than a result, a method can add a filter conditionally, hand the query back, and let the caller add paging before anything runs.
- Reach for it when the same shape of question is asked of different sources. In-memory collections, a database through a provider, and other queryable sources answer the same operator names, so the reading code changes far less than the storage underneath it.

## Cautions

- Deferred execution is the first thing to internalise: a query is a definition, not a result. Nothing runs until something enumerates it, which means a `foreach` over the same query variable twice runs the query twice, and against a database that is two round trips producing two possibly different answers. Materialise once with `ToListAsync` when the result is used more than once.
- The `IEnumerable` and `IQueryable` boundary decides where the work happens. `IQueryable` builds an expression tree the provider translates into SQL; `IEnumerable` runs delegates over objects already in memory. Casting or assigning a query to `IEnumerable<T>`, or calling `AsEnumerable`, moves everything after that point into your process.
- One `Where` on the wrong side of that boundary changes what crosses the wire. Placed while the query is still `IQueryable`, it becomes a `WHERE` clause and the database returns the matching rows; placed after materialising, the whole table travels to the application and is filtered there, with identical-looking code and identical results.
- Where you call `ToList` is where materialisation happens, so calling it early is how a paging bug becomes a memory problem. `ToList().Skip(900).Take(20)` fetches everything and throws most of it away, while `Skip(900).Take(20).ToListAsync()` asks the database for twenty rows. Repeating an aggregate at the end of a chain has the same shape: each `Count` or `Sum` enumerates again.

## In .NET

- The same two lines mean different things on either side of the boundary, and the type of the variable is the only visible clue.

```csharp
// Still IQueryable: both operators become SQL, and the database returns 20 rows.
var page = await db.Orders
    .Where(o => o.Status == OrderStatus.Open)   // -> WHERE Status = @p0
    .OrderByDescending(o => o.PlacedAt)
    .Skip(pageIndex * 20).Take(20)              // -> OFFSET/FETCH
    .ToListAsync(ct);

// AsEnumerable ends the translation: everything after it runs in this process,
// so the whole Orders table is fetched and then filtered here.
var accidental = db.Orders
    .AsEnumerable()
    .Where(o => o.Status == OrderStatus.Open)
    .ToList();

// Deferred: nothing has run yet. Enumerating twice runs the query twice.
var open = db.Orders.Where(o => o.Status == OrderStatus.Open);
var count = await open.CountAsync(ct);          // round trip 1
var rows  = await open.Take(20).ToListAsync(ct); // round trip 2
```

- Composition is why the pipeline can be built up conditionally. `query = query.Where(...)` inside an `if` adds to the expression tree without executing it, so an endpoint with optional filters is one query built in steps rather than four branches.
- `foreach`, `ToList`, `ToArray`, `First`, `Count` and the `await foreach` over an async stream are the operators that actually run the query. Everything else returns a new query, and knowing which is which is most of what deferred execution demands in practice.
- Against a database, prefer projecting inside the query rather than shaping objects afterwards. `Select` into a DTO while the query is still `IQueryable` sends fewer columns, whereas the same `Select` after materialising has already paid for every column in the table.
