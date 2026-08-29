---
title: "Prepared Statement"
summary: "A prepared statement sends the query as a fixed skeleton and the values as pure data: injection dies because input can no longer become code, and the plan cache warms because one text means one plan — security and speed from the same decision."
category: ".NET data access"
tags: ["database"]
scene: prepared-statement
steps:
  - title: "String concatenation turns values into code"
    text: "The query is assembled by gluing user input into SQL text, and the input arrives wearing quotes: what was meant as a name executes as a condition, and every row walks out. The database did nothing wrong — it ran exactly the sentence it was handed."
  - title: "Parameters separate the sentence from the values"
    text: "The query ships as a skeleton with placeholders; the input travels beside it as pure data. The same attack string arrives — and matches nobody, because it is now a name being compared, not SQL being run. Nothing to escape, nothing to sanitize: the boundary is structural."
  - title: "The same skeleton is also the same plan"
    text: "Every new SQL text costs a parse and a plan before it runs. Concatenated queries are all different texts, so the cache misses forever. Parameterized queries are one text with changing values: one plan, compiled once, reused every call. Security and speed come from the same decision."
  - title: "In practice you rarely call Prepare — you just never concatenate"
    text: "Modern drivers and EF Core parameterize for you and the server caches plans by text; the discipline that remains is keeping the text stable and the values in parameters. One skeleton, one plan, a cache that stays warm — and an attack surface that closed as a side effect."
related:
  - label: Parameterized Query
    slug: parameterized-query
  - label: Query Plan
    slug: query-plan
  - label: SQL Injection
    slug: sql-injection
  - label: Input Validation
    slug: input-validation
  - label: Database Index
    slug: database-index
  - label: N+1 Query
    slug: n-plus-1-query
  - label: Database Connection Pool
    slug: database-connection-pool
  - label: Cursor Pagination
    slug: cursor-pagination
  - label: Keyset Pagination
    slug: keyset-pagination
  - label: Materialized View
    slug: materialized-view
references:
  - title: "SqlCommand.Prepare Method"
    url: https://learn.microsoft.com/en-us/dotnet/api/system.data.sqlclient.sqlcommand.prepare
  - title: "Configuring parameters and parameter data types"
    url: https://learn.microsoft.com/en-us/dotnet/framework/data/adonet/configuring-parameters-and-parameter-data-types
  - title: "SQL Queries (EF Core)"
    url: https://learn.microsoft.com/en-us/ef/core/querying/sql-queries
---

## When to use

- On every query that carries a value from outside the code. User input is the obvious case, but message payloads, configuration, file contents and strings that arrived from another service of your own are all outside the code, and "trusted internal string" is a category that has never survived contact with a refactor. Treat parameterization as the way queries are written rather than as a defence you apply to the risky ones, because the risky ones are only obvious in hindsight.
- On the hot path, where the plan cache is doing real work. A statement that runs thousands of times a minute with one skeleton is compiled once and reused; the same statement built by concatenation is compiled thousands of times, and the compilations show up as CPU on the database rather than as latency in your code.
- In batch loops that run one statement with many values. Prepare once, execute many is the shape the API was built for: the command, its parameter collection and its types are set up outside the loop, and each iteration only assigns values and executes.
- Wherever a value is optional, nullable, or a date. Building those into text means writing your own quoting, escaping and culture-invariant formatting, and every one of those is a bug waiting to be found by a name with an apostrophe in it or a machine in another time zone. A parameter carries the type across, so the question never comes up.

## Cautions

- Parameterization is the boundary; validation and escaping are depth behind it. Validate input because it should be a plausible email address, not because you are hoping to catch a quote character. An allowlist is a good idea and a blocklist of dangerous characters is not, because the list of dangerous characters is a property of a dialect you do not control.
- Identifiers cannot be parameters. Table names, column names and the direction of an `ORDER BY` are part of the sentence and there is no placeholder for them, so a sort column that comes from a query string has to be mapped through an allowlist of the columns you are willing to sort by. Anything else is concatenation with extra steps.
- Wildly varying `IN` list sizes fragment the cache. A query with three parameters and the same query with four are different texts, so a list that ranges from one to a thousand produces a thousand plans. Round the size up to a bucket, or pass the set as a table-valued parameter and keep one text.
- Parameter types and lengths are part of the text on some servers. A `varchar(10)` and a `varchar(4000)` holding the same value produce two plans on SQL Server, so let the value decide the size and you get a new plan per distinct length. Specify `DbType` and `Size` explicitly and the statement stays one statement.
- Plan reuse can hurt when the data is skewed. The plan compiled for the first value is reused for the next one, and if the first customer had ten orders and the next has two million, the plan chosen for ten is now being used for two million. That is parameter sniffing, it is a tuning problem with tuning answers — `OPTIMIZE FOR`, `RECOMPILE`, filtered indexes — and it is never a reason to go back to concatenation.
- Interpolation is not parameterization, except where it is. `FromSqlInterpolated` is safe because EF Core turns each hole in the interpolated string into a parameter; the identical-looking string passed to `FromSqlRaw` is the injection, because the string was already assembled before EF ever saw it. The two calls differ by one word, so make the safe one the habit.

## In .NET

`DbParameter` is the whole mechanism. Add a parameter to the command, name it in the text, and the value never touches the SQL: the driver sends the statement and the values as separate things on the wire, and the server compares the value with a column instead of parsing it.

```csharp
using var command = new SqlCommand(
    "SELECT Id, Email FROM Users WHERE Name = @name AND CreatedAt > @since",
    connection);

command.Parameters.Add("@name", SqlDbType.NVarChar, 100).Value = name;
command.Parameters.Add("@since", SqlDbType.DateTime2).Value = since;

using var reader = await command.ExecuteReaderAsync(ct);
```

Giving the type and the length is not ceremony. `Parameters.AddWithValue` infers both from the value, so a six-character name and a twenty-character name produce two different statements and two different plans, and a `decimal` can arrive with a scale nobody intended. Declaring them keeps one statement one statement.

`DbCommand.Prepare` asks the server to compile the statement and hold onto it explicitly, which is worth doing in a tight loop over the same command and rarely worth doing anywhere else — modern servers already cache plans by text, so the ordinary parameterized call gets the same reuse without the extra round trip.

```csharp
using var command = new SqlCommand("INSERT INTO Events (Id, Body) VALUES (@id, @body)", connection);
var id = command.Parameters.Add("@id", SqlDbType.UniqueIdentifier);
var body = command.Parameters.Add("@body", SqlDbType.NVarChar, 4000);
await command.PrepareAsync(ct);

foreach (var e in events)
{
    id.Value = e.Id;
    body.Value = e.Body;
    await command.ExecuteNonQueryAsync(ct);
}
```

EF Core parameterizes on your behalf. A captured variable in a LINQ query becomes a parameter, so the generated SQL is the same text for every value of `name`; a constant written into the expression is folded into the text instead, which is correct but means a different text per constant. When you drop to SQL, `FromSqlInterpolated` and the `SqlQuery` overloads turn the interpolation holes into parameters, and `FromSqlRaw` takes the string exactly as you built it.

```csharp
// parameterized: one text, one plan
var users = await db.Users.Where(u => u.Name == name).ToListAsync(ct);

// also parameterized: the holes become @p0 and @p1
var rows = await db.Users
    .FromSqlInterpolated($"SELECT * FROM Users WHERE Name = {name} AND CreatedAt > {since}")
    .ToListAsync(ct);
```

On SQL Server the result of all this is `sp_executesql`: the statement text, a declaration of the parameters, and the values, sent as three separate arguments. That is worth knowing because it is what you will see in a trace, and seeing the values inline in the statement text instead is the fastest way to find the one place in a codebase that still concatenates.
