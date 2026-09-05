---
title: "Parameterized Query"
summary: "A parameterized query sends the statement and the values as two separate things, so the value is bound after the text has already been parsed. The boundary is structural rather than a list of characters to be careful about."
category: ".NET data access"
tags: ["database"]
scene: prepared-statement
sceneStep: 2
related:
  - label: Prepared Statement
    slug: prepared-statement
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
  - title: "Configuring parameters and parameter data types"
    url: https://learn.microsoft.com/en-us/dotnet/framework/data/adonet/configuring-parameters-and-parameter-data-types
  - title: "SqlCommand.Prepare Method"
    url: https://learn.microsoft.com/en-us/dotnet/api/microsoft.data.sqlclient.sqlcommand.prepare
  - title: "SQL Queries (EF Core)"
    url: https://learn.microsoft.com/en-us/ef/core/querying/sql-queries
---

Watch the second step of the scene and notice how little actually changed. It is the same input, still coloured red, and it reaches the same database. Nothing was filtered and nothing was stripped. What changed is the shape of what left the App: in the first step the input was welded onto the end of the statement and the whole thing travelled as one piece, and in the second there is a placeholder where the value used to be and the value rides beside the statement as a plate of its own. The gap between them is drawn as a gap because the gap is the mechanism.

What the gap buys is an ordering. The server receives the statement text, parses it into a tree and works out what it means, and only then binds the values into the holes the tree already has. By the time your input exists as far as the parser is concerned, parsing is finished. A quote inside the value cannot end a string literal because the value is not inside a string literal; it is a bound argument sitting in a slot that the grammar has already closed. That is why the same attack string in the second step is neither dangerous nor sanitized. It is just a name that nobody happens to be called.

This is stronger than escaping, and the difference is worth being precise about. Escaping is a claim about a dialect: that you know every quoting rule, every escape sequence, every encoding in which a byte can turn into a quote after you have inspected it, and every context in which the value will land. Numbers are usually not quoted at all, so an escape routine that only handles quotes protects a string column and leaves an integer one wide open. Parameterization does not make that claim. It moves the value out of the grammar entirely, and there is nothing left to be clever about.

There are places a parameter cannot go, and they are the places worth watching. A parameter is a value, so it can stand where a value can stand: in a comparison, in an `IN` list, in a `VALUES` clause. It cannot be a table name, a column name, or the `ASC` in an `ORDER BY`, because those are part of the sentence rather than data in it. When a sort column or a table has to come from outside, map the incoming string through an allowlist of the ones you are willing to serve and reject everything else. That mapping is small, it is testable, and it is the only concatenation left in a codebase that has done this properly.

The other thing that travels through the gap is the type. A date sent as a parameter is a date, not a string that has to be formatted in a culture-invariant way and parsed back; a decimal keeps its scale; a null is `DBNull.Value` rather than the four characters that spell it. Every one of those is a class of bug that never comes up, which is easy to miss because bugs that never happen leave no trace.

In practice the whole thing comes down to a habit. `FromSql` and `FromSqlRaw` accept what looks like the same string and do opposite things with it, and a `SqlCommand` built with `+` looks almost exactly like one built with parameters. Make the safe form the one your fingers type, and give code review a single question to ask of any SQL in a diff: where did the values get in.
