---
title: "Cursor Pagination"
summary: "A cursor names the last row the reader actually saw, so the next page is a seek to the row after it: the same cost at any depth, and immune to rows appearing above. The price is that it goes next, never to page 57."
category: ".NET data access"
tags: ["database"]
scene: pagination
sceneStep: 3
related:
  - label: Pagination
    slug: pagination
  - label: Offset Pagination
    slug: offset-pagination
  - label: Keyset Pagination
    slug: keyset-pagination
  - label: Database Index
    slug: database-index
  - label: Query Plan
    slug: query-plan
  - label: Prepared Statement
    slug: prepared-statement
  - label: N+1 Query
    slug: n-plus-1-query
  - label: Materialized View
    slug: materialized-view
  - label: Batching
    slug: batching
  - label: Backpressure
    slug: backpressure
references:
  - title: Pagination (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/querying/pagination
  - title: RESTful web API design
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/api-design
  - title: Pagination in Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/nosql/query/pagination
---

A cursor is a bookmark made of a row rather than of a count. Instead of "give me the fourth page", the reader says "give me what comes after the row I last saw", and the database turns that into `WHERE key > @after ORDER BY key LIMIT 20`. Because the ordering column is indexed and the comparison is a range, the engine seeks straight to that position and reads twenty rows. It does not produce the rows in front of the page, so it does not pay for them: the second page and the two thousandth page cost the same, and the query plan is the same shape for both. That flatness is the first of the two reasons to reach for a cursor, and on any endpoint whose depth is unbounded it is the decisive one.

The second reason is that the bookmark does not move. Positions in a result shift the moment anything is written above them, so a numbered page hands back rows the reader has already seen, or silently skips rows nobody saw. A key does not shift. If ten rows are inserted at the top while the reader is between pages, the row they last saw still has the same key, so the next page still begins immediately after it, and the ten new rows simply sit above the window where they belong. This is why exports, sync endpoints and any job that walks a live table should be written with cursors and not with offsets: those are exactly the readers that are slow enough for the table to change underneath them.

The bill for both of those is that a cursor is a place, not an address. You can go next, and with a reversed comparison you can go back, but there is no expression that means "page 57" because a cursor has to be handed to you by the page before it. An endless feed does not care, and a user who genuinely needs arbitrary page numbers is telling you they want offset. There is a second, quieter condition too: the ordering has to be a total order. A cursor on a non-unique column cannot say which of the tied rows it stopped on, so the boundary either repeats rows or loses them. Pair the column with the primary key, compare the pair as a tuple, and index the pair in the same order.

Return the cursor as an opaque token rather than as the key itself. Encoding it, typically as base64url over a small JSON or binary payload, buys three things: callers stop depending on a format you may want to change, they cannot forge a position into rows they should not see, and internal identifiers stop leaking into URLs, logs and referrer headers. Keep the token self-describing enough to validate on the way in, reject one that does not match the current sort order rather than silently paging by something else, and consider fetching one row more than the page so "is there a next page" is answered by the same query instead of by a second one.
