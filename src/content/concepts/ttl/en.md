---
title: "TTL"
summary: "A TTL is the longest a cached entry may disagree with the truth, and the backstop that repairs every invalidation you miss."
category: "Caching"
scene: cache-invalidation
sceneStep: 1
related:
  - label: Cache Invalidation
    slug: cache-invalidation
  - label: Cache-Aside
    slug: cache-aside
  - label: Cache Stampede
    slug: cache-stampede
references:
  - title: Caching guidance
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/caching
---

A TTL is the one invalidation that cannot fail. Messages get lost, a process restarts halfway through publishing, a write path forgets to call remove. None of that matters for longer than the TTL, because the entry expires on its own and the next read fetches the truth.

Choose the length from how much staleness the reader can tolerate, not from how expensive the source is. If a price may be five minutes out of date, the TTL is five minutes. Stretching it to an hour to save database calls trades correctness for cost without saying so.

Give TTLs a random spread. Entries written together expire together, and a whole cohort expiring at once sends a wave of misses at the source. A few percent of jitter on each expiry breaks that synchronization for free.
