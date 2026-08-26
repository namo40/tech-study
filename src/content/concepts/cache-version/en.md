---
title: "Cache Version"
summary: "A cache version puts a number in the key and bumps it on write, so old entries are never read again and expire on their own instead of being deleted."
category: "Caching"
tags: ["consistency"]
scene: cache-invalidation
sceneStep: 4
related:
  - label: Cache Invalidation
    slug: cache-invalidation
  - label: Cache Tag
    slug: cache-tag
  - label: Cache Key
    slug: cache-key
references:
  - title: HybridCache in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/caching/hybrid?view=aspnetcore-10.0
---

Instead of `catalog`, the key is `catalog@7`. A write bumps the version to 8, and every reader that builds the key afterwards asks for `catalog@8`, which nobody has cached yet. The old entry is still sitting there, but it is unreachable.

That removes the two hard parts of invalidation. There is no delete to fan out to every instance, so there is no message to lose and no window while it travels. And there is no read-then-write race, because a slow read storing `catalog@7` can never be served to anyone asking for `catalog@8`.

The cost is memory: orphaned entries occupy the cache until their TTL runs out. Keep that TTL modest, and store the version somewhere every instance can read cheaply. Tags are the coarse-grained cousin, one delete for a whole group, and they fit better when the group rather than the key is what changed.
