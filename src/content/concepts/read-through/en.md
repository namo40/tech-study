---
title: "Read-Through"
summary: "Read-through moves the fill onto the cache. The application asks for a key and gets a value; whether that value came from memory or from the database on the way through is the cache layer's business, not the call site's."
category: "Caching"
scene: cache-aside
sceneStep: 1
related:
  - label: Cache-Aside
    slug: cache-aside
  - label: HybridCache
    slug: hybridcache
  - label: IDistributedCache
    slug: idistributedcache
  - label: Write-Through
    slug: write-through
  - label: Cache Stampede
    slug: cache-stampede
references:
  - title: Cache-Aside pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside
  - title: Caching guidance
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/caching
---

The scene's first step shows a miss being repaired: the cache is empty, the application reads the database, and it stores the result on the way back. Read-through changes exactly one thing about that picture, and it is not the sequence but the actor. The application no longer notices the miss. It calls the cache with a key and receives a value, and the cache is the component that discovers there is nothing stored, calls a loader it was given in advance, keeps the answer, and returns it. Cache-aside and read-through fill the cache with the same data in the same order; they differ over who holds the code that does the filling.

Moving that code has consequences worth more than the tidier call site. When every miss is repaired by one component rather than by every reader, the miss path becomes a single place to make decisions in. Concurrent misses for the same key can be collapsed there, so ten readers arriving together produce one database call rather than ten, which is the stampede protection a hand-written miss branch has to be given deliberately and usually is not. Expiration policy, key construction and serialization live in the same place, so the entry a background job writes and the entry a request handler writes are shaped identically. The mistakes cache-aside invites are mostly mistakes of omission at one call site out of thirty: the fill that was forgotten, the TTL that was different, the key that was assembled with a slightly different separator.

In .NET this is what `HybridCache.GetOrCreateAsync` gives you, and it is worth being precise about the shape rather than the label. You hand over the key and a factory that can produce the value, and the lookup, the decision that nothing was there, the load and the write back all happen inside that one call; the hybridcache page covers what sits behind it. What you will rarely find is read-through implemented inside the cache server itself, where Redis would hold a connection to your database and load rows on its own. `IDistributedCache` deliberately offers no such hook, so in practice read-through in .NET is a library shape wrapped around a store, not a feature of the store. The distinction matters when something fails: the loader runs in your process, on your thread, under your cancellation token, and an exception in it is your exception rather than a cache error to interpret.

The cost of the arrangement is that the cache is now on the read path in a stronger sense than before. Under cache-aside a reader that finds the cache unavailable can decide, at that call site, to go to the database anyway; under read-through the fallback belongs to the layer, and if it does not offer one you inherit its failure. The other thing to keep in view is how narrow the pattern is. Read-through settles who repairs a miss and says nothing whatsoever about what happens when a value changes: the fourth step of the scene, where a write has to reach both the record of truth and the cache, is a separate decision that write-through and write-behind answer differently.
