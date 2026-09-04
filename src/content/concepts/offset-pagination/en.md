---
title: "Offset Pagination"
summary: "Ask for page five hundred and the database counts past the first five thousand rows in order to discard them. The page you get is right; the cost grows with how deep you are, and the rows can shift under you between pages."
category: ".NET data access"
tags: ["database", "latency"]
scene: database-index
sceneStep: 4
related:
  - label: Database Index
    slug: database-index
  - label: Keyset Pagination
    slug: keyset-pagination
  - label: Cursor Pagination
    slug: cursor-pagination
  - label: N+1 Query
    slug: n-plus-1-query
  - label: Materialized View
    slug: materialized-view
  - label: No-Tracking Query
    slug: no-tracking-query
  - label: Unique Constraint
    slug: unique-constraint
  - label: Prepared Statement
    slug: prepared-statement
  - label: Database Migration
    slug: database-migration
  - label: Idempotency Key
    slug: idempotency-key
references:
  - title: Pagination (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/querying/pagination
  - title: SELECT - ORDER BY clause (Transact-SQL)
    url: https://learn.microsoft.com/en-us/sql/t-sql/queries/select-order-by-clause-transact-sql
  - title: Efficient querying (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/performance/efficient-querying
---

`OFFSET 5000 ROWS FETCH NEXT 20 ROWS ONLY` in SQL Server, `OFFSET 5000 LIMIT 20` in PostgreSQL, reads as "skip five thousand and give me twenty", and the word "skip" is doing a lot of hiding. A database cannot skip a row it has not produced. To know which row is the five thousand and first in a given order, it has to walk the order from the beginning, count five thousand rows, throw every one of them away, and only then start collecting. The twenty rows you asked for are cheap. The five thousand you did not ask for are the whole bill, and it is the one part of the query that grows every time the reader clicks "next".

That is why offset pagination is fine and then suddenly is not. Page one is free, page ten is unnoticeable, and page five hundred is a query that touches five thousand and twenty rows to return twenty. Nothing in the code changed between those pages, and nothing in the plan did either, which is what makes the problem so easy to miss in development: a test table with four hundred rows can never reach the depth where the cost lives. The symptom in production is an endpoint whose p99 is fine and whose p999 is terrible, and the slow requests all have a large `page` parameter.

The second problem is not about speed at all. Offset addresses rows by position in a result, and positions move. If a new row is inserted near the front while a reader is between page three and page four, every row shifts down one place and the row that was last on page three is now first on page four, so the reader sees it twice. Delete a row instead and one row is skipped entirely. This is not a bug you can fix by paging faster: any addressing scheme built on "how many rows are before this one" is unstable the moment writes are happening, and export jobs that page through a live table are where it bites hardest.

Offset is still the right answer in two places, and it is worth being clear about them. When the reader genuinely needs to jump to an arbitrary page number, offset is the only thing that can do it, because a keyset needs a key from the previous page and page 500 has no previous page in hand. And when the whole set is small and bounded — a settings list, an admin table of a few thousand rows — the depth never gets far enough for any of this to matter, and `Skip`/`Take` is the simplest thing that works. Add `AsNoTracking()` for read endpoints, always pair the query with a total-count query you actually need rather than one you compute out of habit, and make sure the `ORDER BY` is a total order: with ties, two calls for the same page can legitimately return different rows.
