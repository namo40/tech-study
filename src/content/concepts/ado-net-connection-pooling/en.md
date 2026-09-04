---
title: "ADO.NET Connection Pooling"
summary: "ADO.NET connection pooling is the layer that actually implements the pool in .NET: Open rents a connection and Dispose returns it, pools are keyed by the exact connection string, and everything above it, Dapper and EF Core included, inherits that machinery whether or not it mentions it."
category: "Pools and resources"
tags: ["database"]
scene: database-connection-pool
sceneStep: 2
related:
  - label: Database Connection Pool
    slug: database-connection-pool
  - label: Entity Framework Core
    slug: entity-framework-core
  - label: Dapper
    slug: dapper
  - label: Minimum Pool Size
    slug: minimum-pool-size
  - label: Connection Lifetime
    slug: connection-lifetime
  - label: Maximum Pool Size
    slug: maximum-pool-size
references:
  - title: "SQL Server connection pooling (ADO.NET)"
    url: https://learn.microsoft.com/en-us/sql/connect/ado-net/connection-pooling
---

The scene's second step shows a request borrowing an open connection and handing it back. In .NET that picture is not a metaphor for what the code does; it is a literal description of it. Constructing a `SqlConnection` touches no network at all. `Open` asks the provider's pool for a connection and gets a live one back if any is free, doing the handshake only when there is nothing to hand over. `Dispose`, which the `using` gives you, does not close the socket: it resets the session and puts the connection back on the free list, which is why the borrow-and-return discipline is nothing more exotic than opening late and disposing promptly.

```csharp
// One string, one pool. Change a single character and there are two.
const string cs =
    "Server=db;Database=orders;Encrypt=True;Application Name=orders-api;" +
    "Min Pool Size=5;Max Pool Size=100;Connection Lifetime=600";

// Rent from the pool for this string. Disposal returns it, it is not closed.
await using var connection = new SqlConnection(cs);
await connection.OpenAsync(ct);

// Dapper takes the cancellation token through CommandDefinition; its positional
// third argument is the transaction, not a token.
var orders = await connection.QueryAsync<Order>(
    new CommandDefinition(sql, new { id }, cancellationToken: ct));
```

The detail that surprises people is how pools are identified. There is one pool per distinct connection string within a process, and the string is compared exactly as you passed it rather than as parsed options: the same keywords supplied in a different order are pooled separately. Two strings differing by an `Application Name`, by a rewrite that only moved the whitespace, or by a credential therefore produce two independent pools, each with its own minimum, maximum and lifetime. Under integrated authentication the identity is part of the key as well. This is what turns a per-tenant connection string into a per-tenant pool, and a hundred tenants into a hundred maximums the database has to satisfy at once, so building connection strings at runtime is worth treating as a pooling decision rather than a formatting one. The pool itself lives in the provider inside the process, which is also why every limit in it is per process and has to be multiplied by the instance count before it can be compared with anything on the server.

Two escape hatches exist and are used rarely and deliberately. `SqlConnection.ClearPool` and `ClearAllPools` mark the pooled connections as invalid so the next `Open` builds new ones, which is occasionally what you want immediately after a failover or a credential rotation, and is otherwise a way to convert a warm service into a cold one; routine rebalancing belongs to connection lifetime instead. Everything above this layer inherits it silently. Dapper is extension methods on the same `IDbConnection`, and EF Core opens and closes provider connections around its work, so a `DbContext` that lives for one request holds a pooled connection only while it is executing something. `AddDbContextPool` is a second, unrelated pool of context objects sitting above this one, and disabling pooling in the connection string, `Pooling=false`, turns the scene's second step back into its first for every layer at once.
