---
title: "Dapper"
summary: "Dapper is a micro ORM: you write the SQL, it maps the result rows onto objects, and that is all it does. There is no translation and no change tracking, which is why it is fast and why the discipline stays with you."
category: ".NET data access"
tags: ["database"]
level: 3
related:
  - label: Entity Framework Core
    slug: entity-framework-core
  - label: LINQ
    slug: linq
  - label: Prepared Statement
    slug: prepared-statement
  - label: Parameterized Query
    slug: parameterized-query
  - label: SQL Injection
    slug: sql-injection
  - label: N+1 Query
    slug: n-plus-1-query
  - label: Database Connection Pool
    slug: database-connection-pool
references:
  - title: "Dapper: a simple object mapper for .NET"
    url: https://github.com/DapperLib/Dapper
---

## When to use

- Take it for a hot read path where the SQL has been tuned by hand. When a query has been shaped around a specific index, a window function or a hint, there is no gain in getting an ORM to emit it: writing the statement directly is shorter, the plan is the one you tested, and the mapping to objects is still one call.
- Use it for reports and aggregates that an ORM translates awkwardly. Grouping sets, common table expressions, pivots and vendor-specific functions are natural in SQL and contorted in LINQ, and a report query nobody will mutate has no use for entity semantics.
- Let it live alongside EF Core rather than replacing it. Domain writes with migrations and change tracking on one side, a handful of read or reporting queries on the other, both over the same connection string, is a common and defensible arrangement.
- Reach for it when calling stored procedures. `CommandType.StoredProcedure` with a parameter object is the whole story, including output parameters and multiple result sets, without modelling the procedure in a context first.

## Cautions

- Parameterise every value, without exception. Because you are writing the SQL, string concatenation is available and it is the doorway to SQL injection; passing values as parameters keeps them data, lets the server reuse the plan, and is exactly as convenient as the unsafe version. An anonymous object with a property per parameter is all it takes.
- There is no change tracking, no unit of work and no migrations. Updates are statements you write, transactions are ones you open, and the schema is managed by something else. Where that discipline is what you want, EF Core is the better tool, and choosing Dapper for a write-heavy domain model usually means rebuilding those features by hand.
- A loop of queries recreates N+1 just as an ORM does, and here it is entirely visible in your own code. Loading a list and then querying for each row's children costs a round trip per row; `QueryAsync` with multi-mapping, a join, or a single `IN` query is the fix, and the cost is the same one the ORM version pays.
- The SQL lives in strings, so the compiler cannot check it against the schema. A renamed column compiles cleanly and fails at runtime on the row where it is read, which puts the safety net in integration tests that run the real statements against a real database rather than in the build.

## In .NET

- Parameters are an anonymous object, mapping is by column name, and the connection is borrowed from the pool for as short a time as the query needs.

```csharp
await using var connection = new SqlConnection(connectionString);

// Values go in as parameters. Never interpolate them into the SQL string.
var orders = await connection.QueryAsync<OrderSummary>(
    """
    SELECT o.Id, o.PlacedAt, o.Total, c.Name AS CustomerName
    FROM Orders o
    JOIN Customers c ON c.Id = o.CustomerId
    WHERE o.PlacedAt >= @since AND o.Status = @status
    ORDER BY o.PlacedAt DESC
    """,
    new { since = DateTime.UtcNow.AddDays(-7), status = "Open" });

// One round trip for parents and children. splitOn says where the second
// object starts, but Dapper builds a fresh Order for every row, so the
// lookup is what merges them into one graph.
var lookup = new Dictionary<Guid, Order>();
await connection.QueryAsync<Order, OrderLine, Order>(
    "SELECT o.*, l.* FROM Orders o JOIN OrderLines l ON l.OrderId = o.Id WHERE o.Id = @id",
    (order, line) =>
    {
        if (!lookup.TryGetValue(order.Id, out var parent))
        {
            parent = order;
            parent.Lines = new List<OrderLine>();
            lookup.Add(parent.Id, parent);
        }
        parent.Lines.Add(line);
        return parent;
    },
    new { id = orderId },
    splitOn: "Id");

var withLines = lookup.Values.ToList();
```

- Do not cache the connection object. `SqlConnection` is cheap to construct because the underlying connection comes from the pool, so opening one inside the `using` and letting it close at the end of the method returns it promptly; a connection held for the lifetime of a service is a pool slot nobody else can use.
- Transactions are explicit and are passed along. `connection.BeginTransaction()` produces a transaction object you hand to each `ExecuteAsync` call, which is the manual equivalent of the unit of work that `SaveChangesAsync` performs for you elsewhere.
- Multi-result queries answer several questions in one round trip. `QueryMultipleAsync` reads a batch of statements sequentially, which is a good fit for a page that needs a row, its children and a total count at once.
