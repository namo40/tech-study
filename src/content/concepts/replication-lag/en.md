---
title: "Replication Lag"
summary: "Replication lag is the delay between a write landing on the primary and the same change appearing on a replica. A read served by the replica inside that window sees the past, and the fix is routing rather than hoping the lag stays small."
category: "Data distribution and consistency"
scene: replication-lag
steps:
  - title: "Primary and replica"
    text: "Writes go to the primary; reads go to a replica that receives every change a little later. Most of the time that little later is harmless."
  - title: "Read your own write?"
    text: "Under load the lag stretches to seconds. The user saves a change, reloads, and sees the old value, because the read went to a replica that has not caught up. Then it catches up and the change appears."
  - title: "Route by what the session needs"
    text: "After a write, send that session's reads to the primary for a few seconds, or make them wait until the replica has reached the write's position. Everyone else keeps reading the replica."
  - title: "Measure it, and know the cost"
    text: "Alert on lag before users do. When the primary fails, the replica is promoted, and any change still in flight is lost: that is your RPO. Synchronous replication removes the loss and adds it to every write's latency."
related:
  - label: Replication
    slug: replication
  - label: Read Replica
    slug: read-replica
  - label: Read-Your-Writes
    slug: read-your-writes
  - label: Session Consistency
    slug: session-consistency
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Bounded Staleness
    slug: bounded-staleness
  - label: Failover
    slug: failover
  - label: RPO
    slug: rpo
  - label: Materialized View
    slug: materialized-view
  - label: Read Model
    slug: read-model
references:
  - title: Distributed data in cloud-native applications
    url: https://learn.microsoft.com/en-us/dotnet/architecture/cloud-native/distributed-data
  - title: Consistency levels in Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/consistency-levels
  - title: Data store selection (Azure Architecture Center)
    url: https://learn.microsoft.com/en-us/azure/architecture/guide/technology-choices/data-stores-getting-started
---

## When to use

- Any setup with a read replica has lag. It is a property of copying data between machines, not a defect you fix once, so the question is never how to remove it but which reads can live with it.
- A replica is eventually consistent by construction: it ends up holding every change, just not at the moment you asked for it. Design around that sentence rather than against it.
- Decide per endpoint. A read may be allowed to be stale, may have to see the caller's own writes, or may have to be current for everyone; those are three different routes, and only the first one is free.
- Reach for replicas when reads outnumber writes and most of those reads are of data that was already a few seconds old when the page asked for it: dashboards, listings, search results, anything a human is browsing.
- Keep the primary for reads that feed a decision: a balance check before a debit, a stock level before a reservation, a uniqueness check before an insert.

## Cautions

- Read-your-writes is the failure users report. The same person, seconds after saving, reloads and sees the old value. Route that session's reads to the primary for a few seconds, or hold them until the replica has reached the position the write was given.
- Lag grows with write bursts, long transactions, replica CPU pressure, and schema migrations, and it grows fastest when the replica applies changes on a single thread. Alert on it before a user does, and alert on the trend rather than on one spike.
- Asynchronous replication trades durability for latency. Promotion during a failover keeps only what the replica had applied, so anything still in flight is gone: that is a non-zero RPO, and it is a business decision rather than a database setting.
- Synchronous replication removes that loss and puts it on every write instead, because a commit now waits for a second machine. It also couples availability: a replica that stops answering can stop the primary from committing.
- Never use a replica for a read that feeds a write. Read-modify-write on stale data replaces a change nobody has seen yet, and no error is raised.
- Watch for lag between a write and an event that depends on it. A message published on commit can reach a consumer that reads the replica before the change has arrived there, which looks like a message about a row that does not exist yet.

## In .NET

Routing is the whole of the work: two contexts over the same model, a note of what this session has just written, and a rule for reads.

```csharp
// Two contexts over the same model: one to the primary, one to the read-only replica.
builder.Services.AddDbContext<PrimaryDbContext>(o => o.UseSqlServer(primaryConnection));
builder.Services.AddDbContext<ReplicaDbContext>(o =>
    o.UseSqlServer(replicaConnection + ";ApplicationIntent=ReadOnly"));

// Remember a recent write per session, in a cookie or a distributed cache, then route by it.
public sealed class ReadRouter(
    PrimaryDbContext primary,
    ReplicaDbContext replica,
    IHttpContextAccessor http)
{
    private const string Cookie = "recently-wrote";
    private static readonly TimeSpan Window = TimeSpan.FromSeconds(5);

    public DbContext ForRead()
    {
        var wrote = http.HttpContext?.Request.Cookies[Cookie];
        if (wrote is not null
            && DateTimeOffset.TryParse(wrote, out var at)
            && DateTimeOffset.UtcNow - at < Window)
        {
            return primary;                       // read your own write
        }

        return replica;
    }

    public void MarkWrote() =>
        http.HttpContext?.Response.Cookies.Append(
            Cookie,
            DateTimeOffset.UtcNow.ToString("O"),
            new CookieOptions { HttpOnly = true, MaxAge = Window });
}
```

On SQL Server, an availability group does the routing for you once the connection string says `ApplicationIntent=ReadOnly`: the listener sends that connection to a readable secondary, so the split is configuration rather than code. On PostgreSQL, `pg_last_wal_replay_lsn()` tells you where the replica has got to, which is what a "wait until the replica has reached this position" policy is built from: keep the position the write returned, compare, and fall back to the primary when the wait would be longer than the request can afford. Whichever you use, expose the lag as a metric next to request latency, because the two numbers explain each other during an incident.
