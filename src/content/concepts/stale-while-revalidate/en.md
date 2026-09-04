---
title: "Stale-While-Revalidate"
summary: "Stale-while-revalidate answers the request that arrives just after an entry expires with the old value, and refreshes the entry in the background instead of making anybody wait. It turns a latency spike into a bounded window of staleness, and the length of that window is the whole decision."
category: "Caching"
tags: ["consistency"]
scene: cache-stampede
sceneStep: 3
related:
  - label: Cache Stampede
    slug: cache-stampede
  - label: Cache-Aside
    slug: cache-aside
  - label: TTL
    slug: ttl
  - label: Cache Invalidation
    slug: cache-invalidation
  - label: Cache Version
    slug: cache-version
  - label: Negative Cache
    slug: negative-cache
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Spike Test
    slug: spike-test
  - label: Rate Limiter
    slug: rate-limiter
  - label: Distributed Lock
    slug: distributed-lock
references:
  - title: "RFC 5861: HTTP Cache-Control Extensions for Stale Content"
    url: https://www.rfc-editor.org/rfc/rfc5861
  - title: HybridCache in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/caching/hybrid?view=aspnetcore-10.0
  - title: Output caching middleware in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/caching/output?view=aspnetcore-10.0
---

The third step of the scene sends one request down to the origin and hands everybody else the value that has just expired, and it is worth being precise about what changed. Without it, an expired entry means a miss, and a miss means waiting: the reader who happened to arrive at the wrong millisecond pays the full recomputation, and so does everybody who arrives while it runs. With it, expiry stops being an event the reader can feel. The old value goes out immediately, one background refresh replaces it, and the next reader gets the new one. Nobody waited, and the origin saw one call instead of a crowd.

The name comes from HTTP, where it is spelled out as two numbers rather than one. `Cache-Control: max-age=60, stale-while-revalidate=30` says the value is fresh for sixty seconds and may be served for thirty seconds more while a refresh runs underneath. RFC 5861 adds a sibling worth knowing, `stale-if-error`, which says the same thing about failure: keep serving the old copy for this long if the origin is not answering. Both of them are the cache being told, in the response itself, how much staleness the owner of the data is prepared to sell.

That is the part people skip. Stale-while-revalidate is not a performance trick with no downside; it is an eventual-consistency decision written as a duration. A price cached for sixty seconds with a thirty second revalidate window can be up to ninety seconds behind the database, and a change made during the window is invisible for the rest of it. Say the number out loud when you set it, and check that the business can live with it. For a product description, ninety seconds is nothing. For a balance shown next to a "transfer" button, it is a support ticket.

In code the pattern is two expiries rather than one. The entry carries a soft expiry, which is when it stops being fresh, and a hard expiry, which is when it stops existing. A read past the soft expiry returns the value and schedules a refresh; a read past the hard expiry has to wait, exactly as before. `HybridCache` gives you the hard side with `Expiration`, so the soft side is usually a timestamp stored inside the cached object itself, which the reader compares against `TimeProvider.GetUtcNow()`. Whatever you use to run the refresh, do not run it on the request's `CancellationToken`: the reader's response is already on its way, the token is about to be cancelled, and the refresh you thought you kicked off dies with it. ASP.NET Core's output caching middleware has no soft expiry to offer either, so an expired response is a plain miss for whichever request refills it, which is why this pattern belongs at the data layer rather than in the middleware.

One warning closes the loop back to the stampede. The background refresh has to be single-flighted too. If every reader past the soft expiry starts its own refresh, you have not removed the crowd, you have made it permanent, because the entry is stale for the whole revalidate window and every request inside it launches a call. Coalesce the refresh on the key, or take a short lock around it, so the picture stays what the scene shows: one request to the origin, however many readers are watching.
