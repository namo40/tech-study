---
title: "Query Plan"
summary: "A query plan is the compiled program the server builds from a statement, cached against the exact text it came from. Reuse is where the speed is, and keeping the text stable is the price of admission."
category: ".NET data access"
tags: ["database"]
scene: prepared-statement
sceneStep: 3
related:
  - label: Prepared Statement
    slug: prepared-statement
  - label: Parameterized Query
    slug: parameterized-query
  - label: Database Index
    slug: database-index
  - label: N+1 Query
    slug: n-plus-1-query
  - label: Database Connection Pool
    slug: database-connection-pool
  - label: Keyset Pagination
    slug: keyset-pagination
  - label: Cursor Pagination
    slug: cursor-pagination
  - label: Materialized View
    slug: materialized-view
  - label: SQL Injection
    slug: sql-injection
  - label: Input Validation
    slug: input-validation
references:
  - title: "Query processing architecture guide"
    url: https://learn.microsoft.com/en-us/sql/relational-databases/query-processing-architecture-guide
  - title: "SqlCommand.Prepare Method"
    url: https://learn.microsoft.com/en-us/dotnet/api/microsoft.data.sqlclient.sqlcommand.prepare
  - title: "SQL Queries (EF Core)"
    url: https://learn.microsoft.com/en-us/ef/core/querying/sql-queries
---

The third step of the scene is the same decision seen from the other side. The cache in the middle band holds three plans and is keyed by the text of the statement, so when the replay of the concatenated world starts, every value produces a text nobody has seen and the two lamps light again for each one. Watch what that costs: three new texts is three compilations, three slots taken, and the oldest thing in the cache thrown out to make room each time. The plan that was worth keeping is evicted by queries that will never be run again, and nothing in the scene arranged that. It falls out of a cache with a size.

What a compilation actually buys is worth knowing, because it explains why it is expensive. The server parses the text, resolves the names against the catalogue, and then hands the result to an optimizer that searches for a way to execute it: which index to use, which join order, whether to sort or to stream, how much memory to ask for. That search considers a large number of candidate plans and prices each one against statistics, and it is the search rather than the parsing that dominates. Reuse skips all of it. A hit is not a faster compile; it is no compile.

The cache key is the text, and it is the text more exactly than people expect. Two statements that differ by a space, by the case of a keyword, by a comment, or by whether the table was written as `Users` or `dbo.Users` are two texts and therefore two plans. On SQL Server the session's `SET` options are part of the key too, which is why the same statement issued from two clients with different connection settings can be compiled twice. None of this matters when the text comes from one place in your code, which is the ordinary reason a parameterized codebase has a small, warm cache and a concatenating one has a large, cold one.

The things that fragment a cache in real systems are worth naming, because each of them looks harmless. An `IN` list whose length follows the data gives you one plan per length, so bucket the sizes or pass a table-valued parameter. `AddWithValue` infers the length of a string parameter from the string, so a six-character search term and a seven-character one are different statements; declaring the size fixes it. Literals written into the SQL by a report builder or an ad hoc query produce a plan each, and a server full of single-use plans is spending memory to remember things it will never be asked again.

Reuse has a cost of its own, and it is the honest counterweight. One plan is compiled for whichever value arrived first, and the optimizer chose it using that value's statistics. If the first customer had ten orders and the next has two million, the plan that seeks and loops is now looping two million times. That is parameter sniffing, and the answers are tuning answers: `OPTIMIZE FOR` a representative value, `RECOMPILE` on the statement that really is bimodal, better statistics, or splitting the query in two. Going back to concatenation would fix the plan and reopen the injection, which is a trade nobody should make.

`Prepare` sits above all this and does less than its name suggests. It asks the server to compile the statement and keep it under a handle, which saves a lookup in a tight loop over one command; the ordinary parameterized call already gets plan reuse from the text-keyed cache without it. Some servers also offer to parameterize literals for you, which rescues a legacy application without a rewrite and is a fallback rather than a design. The rule that survives all of it is the one the fourth step ends on: keep the text stable and put the values in parameters, and the cache takes care of itself.
