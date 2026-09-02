---
title: "Cache Key"
summary: "The cache key decides what counts as the same question. Every distinct key is a separate entry competing for the same space, so cardinality is eviction pressure and the key is where you design it."
category: "Caching"
scene: eviction
sceneStep: 3
related:
  - label: Eviction
    slug: eviction
  - label: LRU
    slug: lru
  - label: Cache-Aside
    slug: cache-aside
  - label: Cache Version
    slug: cache-version
  - label: Cache Invalidation
    slug: cache-invalidation
  - label: TTL
    slug: ttl
  - label: Cache Stampede
    slug: cache-stampede
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
  - title: "Caching in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/caching
  - title: "MemoryCacheEntryOptions Class"
    url: https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.caching.memory.memorycacheentryoptions
---

A cache key is an equivalence class written down. When you choose it you are saying which requests deserve the same answer, and everything else follows from that one claim. Make the key too coarse and two different questions collide, so somebody gets a response that was computed for somebody else — the failure mode that turns a cache into a security incident when the thing you left out of the key was the tenant or the user. Make it too fine and nothing collides, which sounds safe and is the failure in the scene: three spellings of one question become three entries, each holding the same bytes, each occupying a slot that an entry with real readers wanted.

Cardinality is the number that matters, and it is a product rather than a sum. Every dimension you vary by multiplies the entry count by the number of values that dimension takes. Page number and sort order might be twenty combinations. Add a locale and it is four hundred. Add a user id and it is however many users you have, which means the working set is now per-user and no user is warming the cache for anyone else. None of that is visible in the code, because a key built by string concatenation looks the same whether it has three dimensions or six. It becomes visible as a hit ratio that will not rise however large you make the cache, which is the signature of a key space growing faster than the space you are willing to buy.

Normalizing is the cheap half of the work, and it is what the third step of the scene does. The same answer should have exactly one spelling, so the key is built from parsed and canonical values rather than from whatever the caller typed: sort the query parameters, drop the ones that do not change the response, lower-case what is case-insensitive, round the timestamp to the granularity you actually serve, resolve the locale to the small set you have translations for. Build it in one function that takes typed arguments and returns the string, never at the call site, and use a separator that cannot appear inside a component so `user:1` and `2` cannot spell the same key as `user` and `1:2`. Include a short prefix naming the shape and a version segment, because a key with a version in it is a key you can retire without waiting for a TTL.

The other half is deciding what does not belong in the key at all. A request id, a trace id, a cache-busting parameter added by an analytics tag, a full-precision `DateTime`: each of these guarantees a miss and then leaves an entry behind that will never be read, which is the worst possible use of a slot. Vary-by choices in output caching deserve the same scrutiny, because a policy that varies on a header the client controls freely hands the key space to whoever is calling you. And anything in the key that is not also in the answer is a bug in the other direction — if the response depends on the tenant, the tenant must be in the key, and no amount of cache size will save you from having left it out.
