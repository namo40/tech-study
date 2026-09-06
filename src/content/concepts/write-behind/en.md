---
title: "Write-Behind"
summary: "Write-behind acknowledges the write at the cache and updates the origin later. It absorbs write latency and collapses repeated updates into one, and in exchange the cache is the record of truth until the flush lands — which is the whole risk, stated plainly."
category: "Caching"
tags: ["consistency"]
level: 6
scene: cache-aside
sceneStep: 4
related:
  - label: Cache-Aside
    slug: cache-aside
  - label: Write-Through
    slug: write-through
  - label: Redis
    slug: redis
  - label: Transactional Outbox
    slug: transactional-outbox
references:
  - title: Caching guidance
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/caching
---

The fourth step of the scene assumes the write reaches the database and the only open question is what to do about the cached copy. Write-behind inverts that assumption. The write lands in the cache, the caller is told it succeeded, and the database learns about it some time afterwards, when a background flush drains the accumulated changes. Write-through pays both latencies before answering; write-behind pays one, and defers the other. Everything good and everything dangerous about the pattern follows from that single deferral.

What it buys is more than the milliseconds. Because the flush happens on its own schedule, updates to the same key can be merged before they leave: a view counter incremented four hundred times in a minute becomes one row update instead of four hundred, and a document edited repeatedly reaches storage once per flush interval rather than once per keystroke. The origin therefore sees a smoothed, batched, far smaller write load, which is often the actual reason the pattern is reached for — not that individual writes were too slow, but that their aggregate rate was more than the database could take. A burst that would have overwhelmed the origin is absorbed by the cache and paid out at a rate the origin can sustain.

The risk has to be stated without softening it. Between the acknowledgement and the flush, the cache holds data that exists nowhere else, which means the component you deliberately built to be evictable, restartable and memory-first is temporarily the record of truth. Everything that is normally harmless about a cache becomes a loss of committed data in that window: an eviction under memory pressure drops the write, a restart or a failover drops everything not yet flushed, and a key expiring on its TTL before its flush drops it too. Nothing reports an error, because the caller was told the write succeeded seconds or minutes earlier, and the origin was never asked. The other half of the exposure is on reads: anything that queries the database directly — a report, an export, another service, an analytics job — sees the state as of the last flush and disagrees with what the application just showed the user. So write-behind belongs on data whose loss you would accept in writing: counters, view and play totals, last-seen timestamps, recommendation signals, session activity. It does not belong on a payment, an order, or anything an auditor will ask about.

Two practical details. The flush must tolerate being repeated, because a relay that crashes mid-batch will retry it, and that is easy when the flush writes the whole current value for a key and awkward when it applies a delta, since replaying an increment moves the number twice. And where the latency shape of write-behind is genuinely wanted for data that must not be lost, the answer is not a more careful cache but a durable buffer: the transactional outbox writes the change into storage that survives a restart, in the same transaction as the work that caused it, and a relay drains it afterwards. It is the same deferral, with the buffer moved somewhere that is allowed to be the record of truth.
