---
title: "Negative Cache"
summary: "A negative cache stores the answer \"there is nothing here\" as well as the answers that have something in them, so a flood of lookups for a key that does not exist is served from memory instead of reaching the database every single time."
category: "Caching"
level: 5
scene: cache-stampede
sceneStep: 4
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
  - label: Stale-While-Revalidate
    slug: stale-while-revalidate
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Spike Test
    slug: spike-test
  - label: Rate Limiter
    slug: rate-limiter
  - label: Distributed Lock
    slug: distributed-lock
references:
  - title: Cache in-memory in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/caching/memory?view=aspnetcore-10.0
  - title: HybridCache in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/caching/hybrid?view=aspnetcore-10.0
  - title: MemoryCacheEntryOptions Class
    url: https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.caching.memory.memorycacheentryoptions
---

The last step of the scene sends a burst of requests for a key that was never there, and the reason it is worth showing is that an ordinary cache has no defence against it at all. A cache stores what it found. A lookup that finds nothing stores nothing, so the next lookup for the same missing key also finds nothing in the cache, also goes to the database, and also comes back empty. Every request for a key that does not exist is a guaranteed miss, forever, at whatever rate the caller cares to send. Caching the answer "not found" is the one thing that closes it, and in the scene it shows up as the same reflection a hit gets.

This is less exotic than it sounds, because missing keys arrive in bulk far more often than you would guess. Identifiers in a URL are enumerable, so a scanner walking `/products/1` upward hits thousands of gaps in a row. A client with a retry loop that does not treat 404 as final will ask for the same absent thing until somebody stops it. A join key that is null in one system and looked up in another produces a steady trickle of lookups for nothing. And a deleted item keeps being requested by every page that still links to it, sometimes for months. In all four cases the database is answering the cheapest possible question thousands of times, and the answer never changes.

The one rule that makes negative caching safe is a much shorter life than the positive entries beside it. The cost of a stale negative is not a wrong number, it is invisibility: an item that has just been created stays missing for everybody until the negative entry expires. Cache a product for ten minutes and a "not found" for thirty seconds, and you have bought most of the protection while keeping the window between "created" and "visible" short enough that nobody files a bug. If your write path can invalidate on create, do that as well and the window closes entirely, but keep the short TTL anyway, because it is the safety net for the invalidation you miss.

There is one representation trap, and it is the reason a naive implementation quietly does nothing. Storing `null` for a missing key means the cache cannot tell "I have not looked this up" from "I looked, and there is nothing", because both read back as `null`. `IMemoryCache` and `HybridCache` will happily store that `null`, so the ambiguity is not theoretical: a `Get<T>` or `GetOrCreateAsync` read hands back `null` either way, and only a `TryGetValue`-shaped read can see the difference at all. `IDistributedCache` fails in the other direction and rejects a null payload outright, so the negative entry is never written. Store a sentinel instead: a wrapper such as `record Cached<T>(T? Value, bool Found)`, or a well-known empty instance. Whatever you use has to be something the read path can recognise as a definite answer, not as an absence.

The last thing to bound is memory. A negative cache is a cache whose keys are chosen by whoever is calling you, which is exactly the shape an attacker wants: send a million distinct nonexistent identifiers and watch the cache fill with entries for things that will never exist. Give the negative entries a size limit of their own, or a separate cache instance with `SizeLimit` set, so evicting them can never push out the real values they were meant to protect. Where the key space is enormous and the misses are hostile rather than accidental, the usual next step is a membership filter in front of the cache, which answers "definitely not present" in constant memory and lets everything else through to the normal path.
