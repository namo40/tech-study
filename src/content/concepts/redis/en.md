---
title: "Redis"
summary: "Redis is an in-memory data structure server that instances share: one fast process holding strings, hashes, sorted sets and streams, which is what makes it the usual answer for a distributed cache, a session store, a rate counter, a lock and a lightweight queue."
category: "Caching"
tags: ["memory"]
level: 3
related:
  - label: Cache-Aside
    slug: cache-aside
  - label: Cache Invalidation
    slug: cache-invalidation
  - label: Distributed Session
    slug: distributed-session
  - label: Sticky Session
    slug: sticky-session
  - label: Distributed Lock
    slug: distributed-lock
  - label: Eviction
    slug: eviction
  - label: HybridCache
    slug: hybridcache
  - label: Session State
    slug: session-state
  - label: IDistributedCache
    slug: idistributedcache
references:
  - title: Redis Docs
    url: https://redis.io/docs/latest/
  - title: Distributed caching in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/caching/distributed?view=aspnetcore-10.0
  - title: StackExchange.Redis
    url: https://seredis.dev/
---

## When to use

- Reach for it when a cache has to be shared rather than per-process. An in-memory cache multiplies by the instance count: ten replicas hold ten copies, warm up ten times and expire independently. One Redis behind `IDistributedCache` gives every replica the same entry, and it is also the L2 that HybridCache promotes to when it is registered.
- Use it to take session state out of the application process. Once the session lives in Redis, any instance can serve any request, which is what lets you drop sticky sessions, scale in without dropping carts, and restart a pod without signing anybody out.
- Put coordination primitives there when there is nowhere better. Distributed locks, rate-limit counters and idempotency records all need one place that every instance agrees on, and single-threaded atomic commands make the increment-and-compare shapes cheap to get right.
- Take it for lightweight messaging when a broker would be overkill. Pub/sub is fire-and-forget fan-out, and streams add consumer groups and acknowledgement; both are useful, and neither is a replacement for a broker when durability is the requirement.

## Cautions

- Memory is the budget, and the eviction policy is a decision you make. Without a `maxmemory` and a policy, the instance grows until the host objects; with them, you have chosen which entries leave first. `allkeys-lru` behaves like a cache, `noeviction` turns a full instance into write errors, and the difference matters most on the day the working set outgrows the box.
- The default posture is a cache, not the record of truth. Persistence exists as RDB snapshots and AOF, and each answers durability differently: a snapshot can lose the minutes since the last write, and append-only logging costs throughput. Anything that must survive a failure belongs in the database, with Redis holding a copy.
- Hot keys and big keys concentrate load on one place. A single key that every request reads pins traffic to one shard no matter how many you add, and a multi-megabyte value blocks the connection while it is transferred. Split the value, shorten the key space, or cache the hot entry locally in front of Redis.
- Command execution is single-threaded, so an O(N) command stops everyone. `KEYS`, a large `SMEMBERS` or a wide range scan runs to completion while every other client waits, which turns a debugging habit into a production incident. Use `SCAN` for iteration and keep collections bounded.

## In .NET

- `ConnectionMultiplexer` is expensive to create and designed to be shared. One instance per application, registered as a singleton and reused for the lifetime of the process: it multiplexes all commands over a small number of connections, and creating one per operation is the classic way to exhaust sockets.
- For caching, register the distributed cache implementation and let the abstractions do the rest.

```csharp
builder.Services.AddStackExchangeRedisCache(options =>
{
    options.Configuration = builder.Configuration.GetConnectionString("redis");
    options.InstanceName = "checkout:";
});

// With an IDistributedCache registered, in any order, HybridCache uses it as L2.
builder.Services.AddHybridCache();
```

- Session and data-protection storage attach the same way. `AddStackExchangeRedisCache` plus `AddSession` moves session state off the instance, and the same Redis can hold the Data Protection key ring, which is the second thing a scaled-out application usually needs to share. They share the multiplexer only if you make them: `AddStackExchangeRedisCache` builds its own unless you hand it a singleton through `ConnectionMultiplexerFactory`, and `PersistKeysToStackExchangeRedis` takes an `IConnectionMultiplexer` of its own.
- Managed offerings change the operational story, not the API. Azure Managed Redis handles patching, failover and TLS, so the application still speaks the same protocol through the same client, and the work moves to sizing, the eviction policy and deciding whether persistence is wanted at all.
