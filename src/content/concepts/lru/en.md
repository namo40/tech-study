---
title: "LRU"
summary: "LRU evicts the entry that has gone longest without a reader. It is the rule that turns access history into a policy: what you touched recently is what you are assumed to want next, and everything else is spending space on a guess that did not pay off."
category: "Caching"
tags: ["memory"]
level: 5
scene: eviction
sceneStep: 2
related:
  - label: Eviction
    slug: eviction
  - label: Cache Key
    slug: cache-key
  - label: Cache-Aside
    slug: cache-aside
  - label: TTL
    slug: ttl
  - label: Cache Invalidation
    slug: cache-invalidation
  - label: Cache Stampede
    slug: cache-stampede
  - label: Cache Version
    slug: cache-version
  - label: Memory Pressure
    slug: memory-pressure
  - label: Object Pool
    slug: object-pool
  - label: Output Cache
    slug: output-cache
  - label: HybridCache
    slug: hybridcache
references:
  - title: "Cache in-memory in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/caching/memory?view=aspnetcore-10.0
  - title: "MemoryCacheEntryOptions Class"
    url: https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.caching.memory.memorycacheentryoptions
  - title: "Caching in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/caching
---

Least Recently Used is a bet about the future made out of the past. The cache cannot know which entry will be asked for next, so it uses the only evidence it has — which entries were asked for recently — and evicts the one whose last reader is furthest behind. That bet is right most of the time because most access patterns are bursty: a page being edited is read again in a minute, a product on the front page is read again in a second, and the row nobody has looked at since this morning is probably not about to become interesting. In the scene, this is why the eviction list is visible before any eviction happens. The brightness under each key is its last read, so the dim end of the row is already the answer to a question nobody has asked yet.

The reason LRU became the default rather than one option among many is that it needs no configuration and no knowledge of the domain. Its competitors all ask for something. Least Frequently Used asks for a counter per entry and then has to decide how to forget old popularity, or it will protect an entry that was hot last week forever. FIFO asks for nothing but ignores reads entirely, so a hot entry ages out on schedule regardless of how many readers it has. Random eviction is genuinely better than its reputation, costs almost nothing, and is impossible to explain to anyone during an incident. LRU sits in the place where good behaviour and a one-sentence explanation overlap, and that is a real engineering property, not a compromise.

Its famous weakness is the scan. LRU treats one read as evidence of interest, and a job that walks a large table reads every row exactly once, which makes every one of those rows look more recently used than the working set your traffic spent all day assembling. The sweep evicts everything valuable, fills the cache with entries that will never be read again, and then evicts itself. The result is a cache that has just been through a lot of work and now holds nothing anyone wants. This is why real implementations rarely stay pure: they add a probationary segment for entries seen only once, keep frequency alongside recency, or let the application mark some entries as not eligible. If you have a nightly report and a hot path sharing one cache, you already have this problem and the fix is separation or priority rather than a bigger limit.

Exact LRU is also more expensive than it looks, which is why most caches you use are only approximately LRU. Keeping a strict ordering means updating a shared structure on every read, so the cheapest operation in the cache — a hit — becomes a write to a data structure that every thread is contending for. Production caches avoid that with sampling, with clock or second-chance schemes that keep one bit per entry instead of a position, or with segmented approximations. `MemoryCache` in .NET is in this family: its compaction sorts a snapshot of entries by priority and then by last access, and it removes a percentage of the cache at once rather than one entry at a time, so what you get is the spirit of LRU applied in batches. Redis samples a handful of keys and evicts the oldest among them. Both are close enough that reasoning in LRU terms is sound, and neither will give you the exact entry the textbook would, which matters only if you were counting on it.
