---
title: "Connection Timeout"
summary: "A connection timeout bounds getting to the dependency rather than getting an answer out of it, which is why it is a separate setting from the one covering the call."
category: "Resilience"
scene: request-timeout
sceneStep: 2
related:
  - label: Request Timeout
    slug: request-timeout
  - label: Timeout
    slug: timeout
  - label: Deadline
    slug: deadline
  - label: Database Connection Pool
    slug: database-connection-pool
  - label: Pool Exhaustion
    slug: pool-exhaustion
  - label: Maximum Pool Size
    slug: maximum-pool-size
  - label: Idle Timeout
    slug: idle-timeout
  - label: Retry
    slug: retry
references:
  - title: SocketsHttpHandler.ConnectTimeout
    url: https://learn.microsoft.com/en-us/dotnet/api/system.net.http.socketshttphandler.connecttimeout
  - title: Build resilient HTTP apps with .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience
  - title: SqlConnection connection string keywords
    url: https://learn.microsoft.com/en-us/sql/connect/ado-net/connection-string-syntax
---

Opening a connection and using one fail in different ways, so they are bounded separately. A connect attempt is a DNS lookup, a TCP handshake and usually a TLS handshake, none of which the dependency's application code is involved in. When a host is gone, a route is black-holed or a firewall is dropping packets rather than refusing them, the connect does not fail: it hangs, for as long as the operating system's own retry schedule takes, which on some platforms is well over a minute. That is the case a connect timeout exists for, and the reason a generous per-call timeout does not cover it. `SocketsHttpHandler.ConnectTimeout` is where it lives for `HttpClient`; `Connect Timeout` in the connection string is where it lives for SQL Server.

Because it covers a phase rather than a call, a connect timeout should be short. Reaching a healthy host on the same network takes single digit milliseconds, and reaching one across a region takes tens. A connect that has not completed within a second or two is not slow, it is broken, and the useful response is to fail immediately so the caller can try another endpoint or shed the request. This is also the one ceiling where retrying is usually safe: nothing was sent, so nothing can have been half-applied.

Where this gets confused is a pooled client, because two very different waits look alike from the outside. Waiting for a connection to be established is a connect timeout. Waiting for a connection to become free, because the pool is at its maximum size and every connection is busy, is pool queue time, and it is a different setting with a different fix. If calls start failing with what looks like a connection error while the database is idle and healthy, the pool is the thing to look at, not the network: raising the connect timeout will only make the queue longer.
