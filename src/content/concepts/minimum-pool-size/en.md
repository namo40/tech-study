---
title: "Minimum Pool Size"
summary: "Minimum pool size is the floor the pool keeps warm: connections it opens and refuses to close no matter how idle they get. It buys away the handshake on a cold start and on the first wave of a spike, and it is paid for on the database, which holds those connections open forever."
category: "Pools and resources"
tags: ["database"]
level: 3
scene: database-connection-pool
sceneStep: 2
related:
  - label: Database Connection Pool
    slug: database-connection-pool
  - label: Maximum Pool Size
    slug: maximum-pool-size
  - label: Connection Lifetime
    slug: connection-lifetime
  - label: ADO.NET Connection Pooling
    slug: ado-net-connection-pooling
references:
  - title: "SQL Server connection pooling (ADO.NET)"
    url: https://learn.microsoft.com/en-us/sql/connect/ado-net/connection-pooling
---

The scene's second step is the happy case: a request borrows an open connection, uses it, and gives it back, and the database never sees a login. Minimum pool size is the setting that decides how many connections are sitting there ready for that to happen. It is the floor of the pool, and its meaning is narrow and literal: the pool will open connections until it holds at least this many, and it will not close them again for being idle. The default in the SQL Server provider is zero, which means a pool that has been quiet long enough is an empty pool, and the next request pays the full cost the scene's first step described.

That is the entire case for raising it. Idle connections above the floor are reclaimed after a few minutes of disuse, so a service with a quiet night starts every morning cold, and the first requests of the day each pay a TCP handshake, a TLS negotiation and a login before any query runs. The same thing happens on every deployment, since a fresh process starts with an empty pool, and on the leading edge of a traffic spike, where the arriving requests outnumber the connections that exist and the pool creates the difference one connection at a time. A floor turns all three from a visible latency spike into nothing at all, which is why the setting shows up most often in services with bursty traffic and strict tail latency, and almost never in ones under steady load.

The floor is not free, and the bill arrives somewhere the setting does not mention. Every connection held below the floor is a session on the database that exists whether or not anyone is using it, consuming its memory allocation and its slot in the server's connection limit, and the number that matters there is the floor multiplied by the number of processes. A floor of twenty looks modest in one appsettings file and is four hundred sessions across a fleet of twenty instances, all of them idle at three in the morning. Size it against the concurrency the service actually sustains between bursts rather than against its peak, keep it well under the maximum so the pool still has room to grow, and remember that this is the only pool setting that costs the database something when nothing at all is happening. The ceiling is a different decision and belongs to maximum pool size; how long a warm connection is allowed to stay warm belongs to connection lifetime; and the layer that actually implements the floor is ADO.NET connection pooling.
