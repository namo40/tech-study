---
title: "SQL Injection"
summary: "SQL injection is what happens when user input is executed as code: a query built by gluing strings hands the keyboard to the caller. The fix is to keep code and data on separate channels, treat validation as a second line, and cap what any stolen query can reach."
category: "Application security"
tags: ["database", "ef-core"]
level: 4
scene: sql-injection
steps:
  - title: "A query built by gluing strings hands your keyboard to the caller"
    text: "The ghost shows input fused into the code track: the query changes shape, and the database faithfully answers a question you never wrote — every row it has. The caller typed the query; you merely hosted it. The fix is not cleverness. It is keeping code and data on separate channels."
  - title: "A parameter keeps input as data, forever"
    text: "The same spiky input arrives and lands in the data slot; the code track does not move. The database looks for a customer with that absurd name, finds none, and returns zero rows — the attack becomes a wrong answer instead of a breach. This is the primary defense. Everything else in this scene is a second layer."
  - title: "Validation is the filter at the door, not the armor"
    text: "Format, length, range: the obvious garbage is rejected before it costs anything, and honest input passes. But a clever payload can be perfectly well-formed — watch one slip past the check and still land harmlessly in the data slot. Validate to keep noise out. Parameterize because validation will miss."
  - title: "If a query is ever stolen, it reaches exactly as far as the account"
    text: "The app's database role can read and write its own tables — nothing else. The dangerous command bounces off the role, not off luck. Least privilege does not prevent injection; it decides what injection is worth. Defense in depth is just this scene, stacked: separate channels, filtered doors, small accounts."
related:
  - label: Prepared Statement
    slug: prepared-statement
  - label: Input Validation
    slug: input-validation
  - label: Least Privilege
    slug: least-privilege
  - label: Authorization
    slug: authorization
  - label: Cross-Site Scripting
    slug: cross-site-scripting
  - label: Output Encoding
    slug: output-encoding
  - label: Web Application Firewall
    slug: web-application-firewall
  - label: Deserialization Security
    slug: deserialization-security
  - label: Database Index
    slug: database-index
  - label: Repository
    slug: repository
references:
  - title: "SQL Injection"
    url: https://owasp.org/www-community/attacks/SQL_Injection
  - title: "SQL Injection Prevention Cheat Sheet"
    url: https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html
  - title: "SQL Queries - EF Core"
    url: https://learn.microsoft.com/en-us/ef/core/querying/sql-queries
---

## When to use

The heading is a formality here: there is no situation in which you decide against these defenses. What varies is how much of the work the tools have already done for you.

- Parameterize every statement that touches a value you did not write yourself. No exception for an internal admin page, a migration script, a report nobody outside the company can reach, or a field the UI already restricts to digits. The exceptions are where the incidents come from, because they are the code nobody reviews with this in mind.
- Let the ORM do it. EF Core's LINQ translation parameterizes by construction — `Where(c => c.Name == name)` produces a placeholder and a parameter, and there is no way to write it that produces glued text. The overwhelming majority of a codebase gets this defense for free, which is exactly why the small remainder deserves attention.
- Where raw SQL is genuinely the right tool, use the interpolated overloads. `FromSql` and `ExecuteSql` take an interpolated string and turn every `{value}` hole into a parameter; `FromSqlRaw` and `ExecuteSqlRaw` take a plain string and trust you completely. The names are the warning, and the two-character difference is the whole safety property.
- Validate at the boundary, for shape, length and range. An order id is a `Guid`, a page size is between 1 and 100, a country code is two letters. This belongs in the request model, not in the query, and its job is to keep nonsense out of the system rather than to keep SQL out of the parameter.
- Give each service its own database account, holding only the rights it uses. The app that reads and writes four tables does not need to create tables, read other schemas, or run commands that reach outside the database. That decision costs one afternoon and permanently bounds what any future mistake is worth.
- Keep the raw-SQL surface small and in one place. A repository or a small set of query classes gives you a short list of files where this discipline has to hold, instead of a property that every developer has to remember at every call site forever.

## Cautions

- String concatenation hides in the places parameters cannot reach. A column name, a table name and an `ORDER BY` direction are not values, so no driver will parameterize them. The answer is an allow-list: map the caller's `sort=name` to a constant string you wrote, and reject anything that is not in the map. Never pass the caller's text through, escaped or otherwise.
- A dynamic `IN` list wants one parameter per element, not a joined string. Building `IN (@p0, @p1, @p2)` from the array length and binding each element is the safe shape; joining the values with commas puts the caller back inside the sentence. Table-valued parameters and `WHERE id = ANY(@ids)` do the same job with one parameter.
- Stored procedures are not automatically safe. A procedure that assembles a statement internally and runs it through dynamic execution has exactly the same problem one layer down, where it is harder to see. Parameterize inside the procedure too, or use `sp_executesql` with parameters rather than an assembled string.
- Escaping by hand is not a strategy. The cheat sheets list it as a last resort for legacy code precisely because it depends on getting the character set, the quoting mode and every edge case right, forever, in every branch. A parameter has none of those failure modes, because the value never enters the parser.
- Do not let error pages hand back the map. A stack trace containing the failing statement tells a stranger your table names, your column types and which inputs reach the database. Log the detail where you can read it and return something dull; the same rule applies to timing and row-count differences that answer questions the caller was not supposed to be able to ask.
- Validation is not the defense, and treating it as one is how the third step of the scene ends badly. Format rules are written against the inputs you imagined. Parameterization is a structural property that does not care what the value contains, which is why it belongs first and validation belongs second.
- Client-side validation is a user-experience feature. It reduces round trips and it stops nothing, because the request that matters never went through your form.

## In .NET

ADO.NET parameters are the baseline everything else is built on. The value travels beside the statement rather than inside it, and typing the parameter also keeps the database from doing an implicit conversion that quietly ruins an index.

```csharp
const string sql = "SELECT Id, Name FROM Customers WHERE Name = @name AND Region = @region";

await using var command = new SqlCommand(sql, connection);
command.Parameters.Add("@name", SqlDbType.NVarChar, 128).Value = name;
command.Parameters.Add("@region", SqlDbType.Char, 2).Value = region;

await using var reader = await command.ExecuteReaderAsync(ct);
```

Dapper takes an anonymous object and does the same thing, which is why the safe version is also the shorter one.

```csharp
var customers = await connection.QueryAsync<Customer>(
    "SELECT Id, Name FROM Customers WHERE Region = @Region",
    new { Region = region });
```

In EF Core, LINQ is already the answer. The comparison below compiles to a placeholder and a parameter, and there is no spelling of it that produces glued SQL.

```csharp
var customers = await db.Customers
    .Where(c => c.Name == name && c.Region == region)
    .ToListAsync(ct);
```

When raw SQL is genuinely warranted, the interpolated overloads are the ones to reach for. `FromSql` reads like string interpolation and behaves like parameter binding: each hole becomes a `DbParameter`, never text.

```csharp
var customers = await db.Customers
    .FromSql($"SELECT * FROM Customers WHERE Region = {region}")
    .ToListAsync(ct);

await db.Database.ExecuteSqlAsync(
    $"UPDATE Customers SET Region = {region} WHERE Id = {id}");
```

Never build the statement as text first. This one line is the entire bug, and it is the shape to recognise in review:

```csharp
// Never. The value becomes part of the sentence, and the sentence is now the caller's.
var sql = "SELECT * FROM Customers WHERE Name = '" + name + "'";
```

The `Raw` variants exist for the cases that need them, and they take a format string plus arguments, so the value can still be a parameter even there.

```csharp
// Parameterized despite the name: {0} is bound, not pasted.
var customers = await db.Customers
    .FromSqlRaw("SELECT * FROM Customers WHERE Region = {0}", region)
    .ToListAsync(ct);
```

Identifiers still cannot be parameters, so sorting is an allow-list rather than a string. The caller picks a key; you pick the SQL.

```csharp
static readonly Dictionary<string, string> SortColumns = new(StringComparer.OrdinalIgnoreCase)
{
    ["name"] = "Name",
    ["created"] = "CreatedUtc",
};

if (!SortColumns.TryGetValue(request.Sort ?? "name", out var column))
    return Results.BadRequest("unknown sort key");

var sql = $"SELECT * FROM Customers ORDER BY {column}";   // column came from the map, not the caller
```

Validation sits at the API boundary, in the request model, where it can reject nonsense before any of this runs.

```csharp
public sealed record CustomerQuery(
    [property: StringLength(128, MinimumLength = 1)] string Name,
    [property: RegularExpression("^[A-Z]{2}$")] string Region,
    [property: Range(1, 100)] int PageSize);
```

The last piece is the account. The app logs in as itself, with the rights it actually uses and nothing more, so that a mistake anywhere above is bounded by what this login can do.

```sql
CREATE USER app_orders WITH PASSWORD = '...';
GRANT SELECT, INSERT, UPDATE ON SCHEMA::orders TO app_orders;
-- no DDL, no other schema, no server-level rights
```

Read that list back in order and it is the scene: the value never becomes part of the sentence, the obvious nonsense never gets in, and whatever does get in reaches exactly as far as one login is allowed to reach.
