---
title: "No-Tracking Query"
summary: "A no-tracking query returns entities the context does not remember. Nothing is snapshotted, nothing is scanned on save, and nothing can be written back, which is exactly what a read wants."
category: ".NET data access"
tags: ["ef-core"]
scene: change-tracking
sceneStep: 3
related:
  - label: Change Tracking
    slug: change-tracking
  - label: Projection
    slug: projection
  - label: DbContext
    slug: dbcontext
  - label: N+1 Query
    slug: n-plus-1-query
  - label: Read Model
    slug: read-model
  - label: Materialized View
    slug: materialized-view
references:
  - title: Tracking vs. no-tracking queries
    url: https://learn.microsoft.com/en-us/ef/core/querying/tracking
  - title: Efficient querying (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/performance/efficient-querying
---

Tracking is not free, and a list you are about to render pays for all of it. Every entity a tracked query materialises is copied into a snapshot the context keeps for the lifetime of the request, and every subsequent SaveChanges walks the whole set comparing values it will never need. A grid of a thousand rows means a thousand snapshots and a thousand comparisons per save, for a screen that has no save button on it.

`AsNoTracking()` removes both costs. The rows are materialised into objects and handed straight back, the change tracker never sees them, and the memory they occupy is released as soon as your code lets go of them. It also removes identity resolution: two rows that refer to the same underlying record become two objects rather than one, which is faster and occasionally surprising if you were relying on reference equality.

```csharp
// Reads: no snapshot, no scan, no write-back.
var page = await db.Orders.AsNoTracking()
    .Where(o => o.CustomerId == customerId)
    .OrderByDescending(o => o.CreatedAt)
    .Take(50)
    .ToListAsync(ct);

// A projection is never tracked, even without AsNoTracking.
var summaries = await db.Orders
    .Where(o => o.CreatedAt > since)
    .Select(o => new OrderSummary(o.Id, o.Status, o.Total))
    .ToListAsync(ct);

// Whole read-only context, when a service never writes.
options.UseQueryTrackingBehavior(QueryTrackingBehavior.NoTracking);
```

A projection is the better default when you can use one. Selecting into a DTO is never tracked whether or not you asked, it fetches only the columns you named, and it cannot accidentally be handed to `Update` later. Reach for `AsNoTracking` when you genuinely need the entity type back, and for `AsNoTrackingWithIdentityResolution` in the narrow case where you want no tracking but still want one object per row, such as a graph with repeated references.

The one rule to keep is that a no-tracking entity cannot be saved by modifying it. There is no snapshot to compare against, so the context has nothing to detect. If you have to write, either query without `AsNoTracking` in the first place, or attach the object and mark the specific properties you mean to change, which is the same problem a detached entity from an HTTP request has.
