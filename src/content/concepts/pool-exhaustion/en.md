---
title: "Pool Exhaustion"
summary: "Pool exhaustion is when every connection is borrowed and requests queue for one, so the application slows down and starts failing while the database itself is barely working."
category: "Pools and resources"
scene: database-connection-pool
sceneStep: 3
related:
  - label: Database Connection Pool
    slug: database-connection-pool
  - label: Maximum Pool Size
    slug: maximum-pool-size
  - label: Connection Timeout
    slug: connection-timeout
  - label: Bulkhead
    slug: bulkhead
references:
  - title: SQL Server connection pooling (ADO.NET)
    url: https://learn.microsoft.com/en-us/sql/connect/ado-net/connection-pooling
---

The symptom is a connect timeout, not a slow query. Requests fail with a message about obtaining a connection from the pool, latency climbs in a step rather than a curve, and every dashboard on the database side looks calm: low CPU, few active sessions, nothing blocking.

The causes are almost always on the application side. A transaction held open across business logic, a connection that was never disposed because an exception skipped the block, a query that got slower after an index changed, or a fleet that autoscaled and multiplied a per-process pool by the new instance count.

Watch two numbers: connections in use as a fraction of the maximum, and time spent waiting for one. Both saturate before any error appears, which makes them the earliest warning available. Pair the pool with a short connect timeout so a saturated pool fails fast instead of piling requests up behind it.
