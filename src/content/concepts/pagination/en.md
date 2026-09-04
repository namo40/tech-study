---
title: "Pagination"
summary: "Pagination hands out a big result in slices: offset counts from the top and drifts when rows move, while a cursor remembers the row you actually saw and is stable and cheap at any depth but can only go forward. The choice is which promise your list makes."
category: ".NET data access"
tags: ["database", "latency"]
scene: pagination
steps:
  - title: "Nobody needs the whole table — and no phone can hold it"
    text: "One query returns the whole table: the payload balloons, memory swells, and the user reads twenty. Pagination is the deal every list makes: hand out slices, keep a position, and fetch the next when asked. The question is how you remember it."
  - title: "Offset counts from the top — and the top moves"
    text: "\"Page 3\" means \"skip 40 rows\": the database walks past everything it skips, and deep pages get slower. Worse: a row inserted while you read shifts every position after it, so page 4 repeats page 3. The bookmark was a number; the book changed."
  - title: "A cursor remembers the row, not the count"
    text: "\"After key 40\" seeks straight to the position by index and reads the next twenty — same cost on page two and page two thousand. Rows inserted above change nothing, because the bookmark is the row you actually saw. The trade: you can go next, but you cannot jump to page 57 — a cursor is a place, not an address."
  - title: "Choose by the promise the list makes"
    text: "An endless feed never jumps — cursor, always. An admin grid with page numbers promises random access — offset, with its drift accepted and its depth capped. APIs return the cursor as an opaque token so the format stays yours to change. Whatever you choose, the sort key must be unique, or the boundary rows will lie."
related:
  - label: Offset Pagination
    slug: offset-pagination
  - label: Keyset Pagination
    slug: keyset-pagination
  - label: Cursor Pagination
    slug: cursor-pagination
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
    url: https://learn.microsoft.com/en-us/cosmos-db/query/pagination
---

## When to use

- Every list an API or a UI hands back. The question is never whether to paginate but how, because "return everything" is a choice too, and it is the one that fails first and fails worst.
- Numbered pages over a small, slowly changing set: an admin grid, a settings list, a report of a few thousand rows. The reader wants page seven, and the table is never deep enough for the counting to hurt. That is offset, and it is the right answer there.
- Feeds, infinite scroll, sync endpoints, exports, background jobs that walk a live table, and anything either deep or fast moving. That is a cursor, because it is the only addressing scheme that survives writes happening underneath it.
- Decide before the URL ships. The page parameter is part of your public contract, and replacing `?page=3` with `?after=...` later breaks every caller that stored one.

## Cautions

- `OFFSET` walks every row it skips. Skipping is not free and it is not lazy: to know which row is the five thousand and first in a given order, the database has to produce five thousand rows and throw them away. Deep offset is a full scan wearing a page's clothes, so cap the depth and make the cap an explicit error rather than a slow success.
- Drift is not an edge case on an active table, it is the steady state. Any scheme that addresses rows by "how many are in front of this one" is unstable the moment anything is written, and export jobs paging through live data are where it bites hardest.
- The cursor's sort key must be unique and immutable. If it is not unique, two calls for the same boundary can legitimately return different rows; tie-break with the primary key and order by the pair. If it is not immutable, a row that changes value moves out from under the cursor and is either revisited or lost.
- Return cursors as opaque tokens, never raw keys. An encoded token leaves you free to change what is inside it, and it stops a caller from forging a position or reading one customer's identifiers off another's URL.
- `COUNT(*)` for "page N of M" can cost more than the page it labels. Ask whether the reader needs a total at all; an approximate count, a "load more" button, or a plain "next" is usually cheaper and just as honest.
- A cursor built from a mutable column such as `updated_at` inherits that column's instability. Pair it with the primary key at the very least, and prefer a column nothing updates.

## In .NET

```csharp
// Offset: fine while shallow, a trap when deep. EF Core translates
// Skip/Take to OFFSET … FETCH NEXT, and the database pays for the skip.
var page = await db.Orders
    .AsNoTracking()
    .OrderBy(o => o.Id)
    .Skip((pageNumber - 1) * PageSize)
    .Take(PageSize)
    .ToListAsync(ct);

// Keyset: the same index, entered at the last row the caller actually saw.
// The cost is the page, whatever the depth.
var next = await db.Orders
    .AsNoTracking()
    .Where(o => o.Id > afterId)
    .OrderBy(o => o.Id)
    .Take(PageSize)
    .ToListAsync(ct);

// A non-unique sort column needs the key alongside it. SQL can compare the
// two columns as one row value; EF Core has no LINQ translation for that, so
// the OR chain is the form to write here.
var byDate = await db.Orders
    .AsNoTracking()
    .Where(o => o.CreatedAt > afterCreatedAt
        || (o.CreatedAt == afterCreatedAt && o.Id > afterId))
    .OrderBy(o => o.CreatedAt).ThenBy(o => o.Id)
    .Take(PageSize)
    .ToListAsync(ct);
```

Keep the ordering and the index in step: a query ordered by `(CreatedAt, Id)` wants an index on `(CreatedAt, Id)`, or the seek you wrote turns back into the sort you were avoiding. Hand the caller a token rather than the key itself, and read it back on the way in:

```csharp
static string Encode(DateTime at, int id) =>
    WebEncoders.Base64UrlEncode(
        JsonSerializer.SerializeToUtf8Bytes(new Cursor(at, id)));

// Ask for one more row than the page. If it comes back, there is a next page,
// and you learned that without a second query and without COUNT(*).
var rows = await query.Take(PageSize + 1).ToListAsync(ct);
var hasMore = rows.Count > PageSize;
var items = rows.Take(PageSize).ToList();
```

Turn the query log on with `optionsBuilder.LogTo(Console.WriteLine, LogLevel.Information)` and read what the database was actually asked. A deep `Skip` shows up in the plan as the scan it is, and that is a fact you can check rather than a thing to hope for.
