---
title: "Connection Lifetime"
summary: "Connection lifetime is the retirement age of a pooled connection: on return, one older than the limit is destroyed instead of being put back. Its reason for existing is redistribution, because a connection that never retires stays bound to the server node it was opened against."
category: "Pools and resources"
tags: ["database"]
level: 4
scene: database-connection-pool
related:
  - label: Database Connection Pool
    slug: database-connection-pool
  - label: Connection Timeout
    slug: connection-timeout
  - label: Idle Timeout
    slug: idle-timeout
  - label: Failover
    slug: failover
  - label: Minimum Pool Size
    slug: minimum-pool-size
references:
  - title: "SQL Server connection pooling (ADO.NET)"
    url: https://learn.microsoft.com/en-us/sql/connect/ado-net/connection-pooling
---

The scene's fourth step is about the moment of return: borrow for the query, give it back at once, and the same four connections serve far more traffic. Connection lifetime is the rule applied at that exact moment. When a connection comes back, the pool compares its age, measured from when it was created, against the configured limit; if it is older, the connection is destroyed rather than returned to the pool, and the next request that needs one opens a fresh connection. Because the check happens only on return, an expiring lifetime never interrupts work in progress, and a connection in the middle of a long query is in no danger from it. The default is zero, which does not mean "expire immediately" but the opposite: no age limit at all, so a connection created at startup can still be in the pool a week later. The scene above shows the pool returning connections, not retiring them, so the retirement this page describes is the one moment the animation leaves out.

A week-old connection is fine until the thing on the other end of it moves, and that is the whole reason the setting exists. A connection is a TCP session to one specific server, chosen when it was opened. If the database fails over to a replica, if a read-scale cluster gains a node, or if a proxy in front of it is rebalanced, existing pooled connections keep talking to the endpoint they were assigned at open time. The new node gets no traffic and the old one keeps it all, and nothing in the pool notices, because from its point of view every connection is healthy and reusable. An age limit is what makes the fleet drift back into balance: connections retire a few at a time, each replacement is routed by whatever is doing the routing today, and within one lifetime the distribution reflects the current topology rather than the one that existed at startup. This is why the SQL Server provider's alias for the setting is Load Balance Timeout, a name that describes the purpose better than the one people usually type.

The failure mode on the other side is throwing away the pooling. Every retirement is a handshake, a TLS negotiation and a login paid by whichever request happens to need the replacement, so a lifetime short enough to retire connections faster than the service reuses them hands back the saving the pool exists to make. A value close to a typical request duration is the pathological case; a few minutes is usually the low end of sensible, and values in the tens of minutes are common where rebalancing after failover is the only goal. Two neighbouring settings are often confused with this one and are worth keeping distinct: connection timeout is how long a caller waits to get a connection at all, and idle timeout is about disuse rather than age, since lifetime counts from creation and applies to a connection that has been busy every second of its life. Minimum pool size interacts with all of this in one specific way, because the pool refills the floor rather than letting it shrink, so a warm pool with a short lifetime is a steady background of new logins on the database.
