---
title: "Keyset Pagination"
summary: "Instead of asking for the five thousand and first row, ask for the rows after the last key you saw. The index seeks straight to that key and reads forward, so every page costs the same and nothing shifts underneath the reader."
category: ".NET data access"
tags: ["database", "latency"]
scene: database-index
sceneStep: 4
related:
  - label: Database Index
    slug: database-index
  - label: Offset Pagination
    slug: offset-pagination
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
  - title: SQL Server index architecture and design guide
    url: https://learn.microsoft.com/en-us/sql/relational-databases/sql-server-index-design-guide
  - title: Efficient querying (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/performance/efficient-querying
---

Keyset pagination changes the question, and that is the whole trick. Offset asks "which rows are at positions 5001 to 5020", which no index can answer without counting. Keyset asks "which rows come after this key", which is the one question a sorted structure answers for free: descend to the key, then read forward. Twenty rows read, no rows discarded, and the same twenty whether the reader is on page two or page five hundred. In the scene it is the difference between lighting up every block of the index and lighting up one.

The mechanism is a `WHERE` clause, not a feature. `.Where(o => o.Id > lastSeenId).OrderBy(o => o.Id).Take(20)` is the whole of it, and the last row of each page carries the key the next page will start from. That is also the constraint: you can only go to the page after one you have already seen. There is no jumping to page 500, because "page 500" is a position and keyset does not deal in positions. For infinite scroll, "load more", background export jobs and any API where the client walks forward, that constraint costs nothing. For a page-number control with a jump box, it is fatal, and offset is the honest answer.

The ordering key has to be unique, or the seek slices through the middle of a run of ties and rows go missing. Order by something like `CreatedAt` alone and every row sharing a timestamp with the page boundary is at risk. The fix is to make the order total by appending the primary key, and then the comparison has to treat the two columns as one rather than as two separate conditions. In hand-written SQL, on a database that supports row values (PostgreSQL, MySQL and SQLite do; SQL Server does not), that is `WHERE (CreatedAt, Id) > (@lastCreated, @lastId)`. In LINQ that is `.Where(o => o.CreatedAt > last.CreatedAt || (o.CreatedAt == last.CreatedAt && o.Id > last.Id))` — verbose, but it is the only form that is right on both sides of the boundary. Descending order flips every comparison, so write the two directions as separate, tested queries rather than one clever one.

The index has to match the ordering exactly, including direction, or the seek quietly becomes a sort of the whole table and you have paid for nothing: order by `(CreatedAt, Id)` and index `(CreatedAt, Id)`. Two smaller notes are worth carrying. Because keyset is stable against inserts and deletes, a reader paging through a live table sees each row at most once, which is why export and sync jobs should use it even when they are not slow. And do not hand the raw key to a client if it leaks something — an opaque, signed cursor holding the same values is the same mechanism with a better surface, which is what cursor pagination is.
