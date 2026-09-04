---
title: "Database Connection Pool"
summary: "A connection pool keeps a few open database connections and lends them out, so requests skip the slow handshake. Its size is a concurrency budget: when every connection is busy, the next request waits, and waiting too long fails."
category: "Pools and resources"
tags: ["database"]
scene: database-connection-pool
steps:
  - title: "Opening is slow"
    text: "A new connection means a TCP handshake, TLS, and a login. The pool pays that once per connection and keeps it open."
  - title: "Reuse"
    text: "Every request borrows an open connection and returns it. Two connections serve the whole stream, and the database never sees a new login."
  - title: "Exhausted"
    text: "When every connection is busy, new requests wait in line. The pool's maximum is a concurrency budget for the database, and waiting past the timeout fails."
  - title: "Open late, release early"
    text: "A connection held while the app does other work is a connection nobody else can use: the held slot sits idle while the others do all the work. Borrow it for the query, return it at once."
related:
  - label: ADO.NET Connection Pooling
    slug: ado-net-connection-pooling
  - label: Minimum Pool Size
    slug: minimum-pool-size
  - label: Maximum Pool Size
    slug: maximum-pool-size
  - label: Connection Lifetime
    slug: connection-lifetime
  - label: Idle Timeout
    slug: idle-timeout
  - label: Connection Timeout
    slug: connection-timeout
  - label: Pool Exhaustion
    slug: pool-exhaustion
  - label: DbContext Pool
    slug: dbcontext-pool
  - label: Bulkhead
    slug: bulkhead
  - label: Concurrency Limiter
    slug: concurrency-limiter
  - label: Timeout
    slug: timeout
references:
  - title: SQL Server connection pooling (ADO.NET)
    url: https://learn.microsoft.com/en-us/sql/connect/ado-net/connection-pooling
  - title: EF Core overview
    url: https://learn.microsoft.com/en-us/ef/core/
  - title: Bulkhead pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/bulkhead
---

## When to use

- Always, for any relational database. ADO.NET providers pool by default, and EF Core sits on top of that same pool.
- The question is never whether to pool but how to size it. There is one pool per connection string per process, so the database's total connection budget has to be divided across every instance you run.

## Cautions

- Open late, dispose early. Never hold a connection across a whole request, a long transaction, or an `await` that does no database work.
- `Max Pool Size` is per process. Ten instances on the default of 100 can open 1,000 connections against a database that copes with 200.
- A pool wait shows up as a connect timeout, not as a slow query. Watch wait time and pool usage as metrics in their own right.
- Connection strings that differ only in casing or option order create separate pools.

## In .NET

```csharp
// Pool per connection string, per process. Size it from the database's budget.
const string Cs =
    "Server=db;Database=shop;User Id=app;Password=...;" +
    "Min Pool Size=2;Max Pool Size=20;Connect Timeout=5;Connection Lifetime=300";

public async Task<Order?> FindAsync(int id, CancellationToken ct)
{
    // Open late: the connection is borrowed here...
    await using var connection = new SqlConnection(Cs);
    await connection.OpenAsync(ct);

    await using var command = connection.CreateCommand();
    command.CommandText = "SELECT Id, Total FROM Orders WHERE Id = @id";
    command.Parameters.AddWithValue("@id", id);

    await using var reader = await command.ExecuteReaderAsync(ct);
    return await reader.ReadAsync(ct) ? new Order(reader.GetInt32(0), reader.GetDecimal(1)) : null;
    // ...and returned to the pool here, when the using block ends.
}
```

EF Core's `DbContext` uses this same ADO.NET pool, so keeping a `DbContext` short is keeping a connection short. `AddDbContextPool` is a different thing again: it reuses `DbContext` objects, not connections.
