---
title: "Failover"
summary: "Failover moves a role, not a machine: when the primary stops answering, the beats stop, a majority agrees it is gone, and the replica is promoted — trading the last unreplicated moments for the service staying up."
category: "Data distribution and consistency"
tags: ["database"]
level: 6
scene: failover
steps:
  - title: "One writes, one follows"
    text: "The app writes to A, the primary, and every write is copied over to B, the replica, a moment later. Down in the monitor both hearts beat on time, and the vote stands at three of three."
  - title: "The beats stop"
    text: "A heartbeat is how a database says it is alive. A stops answering and its lamp goes dark. The monitor cannot tell dead from slow; it only knows the beats stopped. Writes fail, and one write that replication never carried is now the difference between the two machines."
  - title: "Two of three agree"
    text: "A majority says A is gone, so one machine is promoted. B becomes the primary, the connection string follows it, and writes resume — minus the one write replication never carried. Failover trades the last few moments of data for the service staying up."
  - title: "The old primary comes back a follower"
    text: "A returns, but the role has moved on. It rejoins as a replica, catches up from B, and the pair is whole again — pointing the other way. Roles float between machines; that is the whole trick."
related:
  - label: Replication
    slug: replication
  - label: Replication Lag
    slug: replication-lag
  - label: RPO
    slug: rpo
  - label: Primary-Replica
    slug: primary-replica
  - label: Heartbeat
    slug: heartbeat
  - label: Quorum
    slug: quorum
  - label: Leader Election
    slug: leader-election
  - label: Split Brain
    slug: split-brain
  - label: Lease TTL
    slug: lease-ttl
  - label: Singleton Worker
    slug: singleton-worker
  - label: Eventual Consistency
    slug: eventual-consistency
references:
  - title: "Auto-failover groups (Azure SQL Database)"
    url: https://learn.microsoft.com/en-us/azure/azure-sql/database/failover-group-sql-db
  - title: "Overview of Always On availability groups"
    url: https://learn.microsoft.com/en-us/sql/database-engine/availability-groups/windows/overview-of-always-on-availability-groups-sql-server
  - title: "Failover and load balancing (Npgsql)"
    url: https://www.npgsql.org/doc/failover-and-load-balancing.html
---

## When to use

- Any stateful service whose downtime is measured in seconds rather than deploys. Databases first, because a database is the one component you cannot simply run more copies of and call it a day, but the same machinery carries caches, brokers and search clusters.
- Decide two numbers before you decide anything else. RPO is how much of the tail you can afford to lose, measured in writes or in seconds of writes; RTO is how long the seat may sit empty. Everything else — synchronous or asynchronous replication, how long the detection timeout is, whether a human approves the promotion — is downstream of those two.
- Reach for it when the alternative is worse. A pair with automatic failover is more moving parts than a single machine, and the extra parts have their own failure modes; it earns its keep when an outage costs more than a wrong promotion does.
- Use it when a replica is already there. If you are running a read replica for capacity, the promotion path is nearly free and the argument becomes about detection and routing rather than about hardware.
- Do not use it as a substitute for backups. Failover protects you from a machine that stopped. It does nothing about a bad migration or a deleted table, because the replica applied that change too, faithfully and immediately.

## Cautions

- Asynchronous replication means promotion loses the tail. Whatever the replica had not yet applied is gone the moment the role moves, and that is your RPO in the flesh rather than on a slide. Measure the backlog continuously, alert on it, and know what a normal value looks like so an abnormal one means something.
- Detection is a timeout, so every failover design contains a false-positive risk. A primary that is merely slow — a long checkpoint, a saturated disk, a garbage collection pause — looks exactly like a primary that is dead, because the only evidence either way is silence. That is why the decision needs a majority rather than one opinion, and why the timeout should be long enough to survive the pauses your system actually has.
- Clients have to re-resolve. A connection string pinned to a hostname with a long DNS TTL will keep pointing at a machine that no longer holds the role, and no amount of correctness inside the database will help. Use a listener endpoint that redirects, or a driver that knows about several hosts, and retry on failure so the first request after a switch is the one that discovers it.
- The returned old primary must never accept writes. If it comes back still believing it is the primary and something can still reach it, you have two machines taking writes and no way to reconcile them afterwards. It rejoins as a replica, or it stays down until a human looks at it.
- Failing back on a schedule is a second outage you scheduled yourself. Once the role has moved and the pair is healthy again, there is usually no reason to move it back; do it during a quiet window, if at all, and for a reason you can name.
- Test it. A failover path that has never been exercised is a hypothesis, and the parts that break are rarely the database: they are the connection pools that cached a dead endpoint, the migration that only ever ran against the old primary, and the alert that fired into a channel nobody reads.

## In .NET

The database side is configuration; the application side is a connection string and a retry policy that expects to be interrupted.

```csharp
// Npgsql: name both hosts and say what kind of session you need. The driver
// probes them, keeps the one that answers as primary, and moves after a switch.
var connection =
    "Host=db-a.example.com,db-b.example.com;Database=orders;" +
    "Target Session Attributes=primary;" +
    "Timeout=5;Cancellation Timeout=2000";   // seconds, then milliseconds

builder.Services.AddDbContext<OrdersDbContext>(options =>
    options.UseNpgsql(connection, npgsql =>
    {
        // A failover looks like a transient fault to everything above it, so the
        // first call after a promotion has to be allowed to fail and be retried.
        npgsql.EnableRetryOnFailure(
            maxRetryCount: 5,
            maxRetryDelay: TimeSpan.FromSeconds(10),
            errorCodesToAdd: null);
    }));

// Reads that may be a little stale can be routed to whoever is standing, which
// keeps the reporting side alive through a promotion it does not care about.
var readOnly = connection.Replace(
    "Target Session Attributes=primary",
    "Target Session Attributes=prefer-standby");
```

On Azure SQL Database, an auto-failover group gives you two endpoints whose names never change: the read-write listener always resolves to whichever server currently holds the primary, and the read-only listener to a secondary. The application keeps one connection string for the life of the system and the group moves the name, which is exactly the substitution the scene draws. On SQL Server, an Always On availability group listener does the same job inside your own network, and `MultiSubnetFailover=True` in the connection string tells the client to try every address at once instead of walking them in order, which is the difference between a switch that takes seconds and one that takes a TCP timeout per address.

Whatever the platform, put the two numbers on a dashboard: the replica's backlog, and the age of the last successful heartbeat. The first tells you what a promotion would cost right now, and the second tells you how close you are to being asked to pay it. `Microsoft.Extensions.Diagnostics.HealthChecks` is the natural place to expose them, because a health check that already knows the database is reachable is one query away from knowing how far behind its replica is.
