---
title: "Write-Through"
summary: "A write-through write is not finished until both the cache and the record of truth have it. The caller waits for both, which buys an entry that is never stale by omission and costs two latencies on every write, including writes nobody will ever read."
category: "Caching"
tags: ["consistency"]
level: 5
scene: cache-aside
sceneStep: 4
related:
  - label: Cache-Aside
    slug: cache-aside
  - label: Write-Behind
    slug: write-behind
  - label: Read-Through
    slug: read-through
  - label: Cache Invalidation
    slug: cache-invalidation
  - label: TTL
    slug: ttl
references:
  - title: Caching guidance
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/caching
---

The scene's fourth step is about a write that only touched the database and left the cache holding the previous value. Write-through is one of the two answers that put the write itself through the cache instead of cleaning up after it. The write goes to the cache and to the record of truth synchronously, inside the same call, and the caller is not told the write succeeded until both have it. Where cache-aside removes the entry and lets the next reader rebuild it, write-through leaves the entry present and correct, so the first read after a write is a hit rather than the miss that invalidation guarantees.

The consistency argument is straightforward and mostly true. There is no window in which the cache disagrees with the origin because somebody forgot the second call, and there is no key that goes stale because a new write path shipped without its invalidation. That is a real gain, because a forgotten invalidation is silent: nothing fails, a stale value is served until the TTL expires, and the bug is found by a user rather than by a test. What write-through cannot do is make two independent operations atomic. The origin write and the cache write can still be interrupted between them, and the honest ordering is origin first: a crash after the origin succeeds leaves a stale entry that the TTL eventually clears, while a crash after the cache succeeds leaves the cache asserting a value the database never accepted. Which is why a TTL stays mandatory here for the same reason it does under cache-aside, and why the parent page's caution about racing writers has not gone away — two writers updating the same key can still land their cache writes in the opposite order from their origin writes unless something serializes them per key.

The cost lands on every write, in two places. The caller now waits for the slower of two systems in sequence rather than for one, so a write that took eight milliseconds takes eight plus however long the cache round trip and the serialization take. And the cache's availability becomes part of the write path's availability: a cache that is down either fails the write or forces you to decide, in advance and in writing, that the write may proceed with the cache left inconsistent. That decision is the whole pattern's fine print, and it is worth making deliberately rather than discovering it in an incident.

The second cost is quieter and more often the one that decides against it. Write-through caches everything that is written, whether or not anyone will read it. That is exactly right for a small set of hot keys read many times per write, and wasteful for an audit trail, an event log, or a tenant whose records are written continuously and queried once a quarter: the cache fills with entries that are only ever evicted, crowding out the keys that were earning their space. Cache-aside populates on reads and therefore caches only what has been asked for at least once, which is a form of admission control you give up here. The alternative that keeps the post-write read a hit but changes the risk is write-behind, which acknowledges the write at the cache and lets the origin catch up afterwards.
