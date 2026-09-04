---
title: "Leader Election"
summary: "Leader election picks exactly one instance out of many identical ones to hold a named role — not by configuration, but by competing for a lease that expires unless renewed, so the role survives any single machine."
category: "Distributed coordination"
scene: leader-election
steps:
  - title: "Three start, one leads"
    text: "Three identical instances boot and all ask the same lease store for one named lease. The store grants it to exactly one; the winner becomes the leader and starts the work, and the rest stand by as followers."
  - title: "Leadership is a lease, not a title"
    text: "The leader keeps its seat only as long as it renews before the TTL runs out. Stop renewing — a crash, a long pause, a network split — and the seat simply expires. That expiry frees the seat from a dead holder; the epoch keeps it safe."
  - title: "The leader dies; still only one leads"
    text: "The lease runs out, the next follower to look wins it and the one after is refused — the epoch ticks up. When the old leader comes back and tries to renew, its stale epoch is refused too. Split brain is the one thing this machinery prevents."
  - title: "All of it exists so the job runs once"
    text: "Watch the work strip: through boots, deaths and re-elections, the ticks stay in one unbroken lane and the duplicate counter never moves. One seat — sometimes briefly empty, never shared."
related:
  - label: Distributed Lock
    slug: distributed-lock
  - label: Distributed Lease
    slug: distributed-lease
  - label: Fencing Token
    slug: fencing-token
  - label: Lease TTL
    slug: lease-ttl
  - label: Lease Renewal
    slug: lease-renewal
  - label: Kubernetes Lease
    slug: kubernetes-lease
  - label: Split Brain
    slug: split-brain
  - label: Singleton Worker
    slug: singleton-worker
  - label: Health Check
    slug: health-check
  - label: Heartbeat
    slug: heartbeat
  - label: Quorum
    slug: quorum
  - label: Failover
    slug: failover
references:
  - title: Leader Election pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/leader-election
  - title: "Kubernetes: Leases"
    url: https://kubernetes.io/docs/concepts/architecture/leases/
  - title: BackgroundService Class
    url: https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.hosting.backgroundservice
---

## When to use

- Background work that has to happen exactly once across replicas: a scheduled job, an outbox dispatcher, a queue pump, a cache warmer, a nightly reconciliation.
- Any time "just run one copy" stopped being true because the application scaled out, and the second copy started doing the same work as the first.
- Roles that need an owner rather than a schedule: the instance that holds the partition, drives the migration, or answers as the writer.
- Failover you want measured in seconds rather than in pager escalations. The seat moves on its own because the old holder stopped renewing, not because somebody restarted a deployment.

## Cautions

- Renewal has to run on its own loop, independent of the work. A leader that renews between units of work loses its seat the moment one unit runs longer than the TTL, and a garbage collection pause of a few seconds is enough to do it.
- The work must re-check leadership before each unit, and stop as soon as the renewal loop reports the lease lost. Otherwise a leader keeps working for the whole length of the batch it was in the middle of.
- There is always a window between the old leader losing the lease and noticing it has. Nothing inside the process can close that window, which is why anything with side effects has to carry the epoch and be refused by the resource when the epoch is stale.
- The TTL is a dial with a cost on both ends. Short means fast failover and a real chance of a false takeover during a pause; long means no false takeovers and a seat that stays empty for that long after a crash.
- A lease elects one leader per lease, not per universe. A Kubernetes `Lease` is scoped to a namespace in one cluster, so two clusters running the same deployment elect two leaders that know nothing about each other.
- Leader election is not a substitute for idempotent work. It narrows duplicate execution to the handover window; it does not remove it.

## In .NET

The shape is one `BackgroundService` that acquires, renews on its own timer, runs the work under a token it cancels the moment the lease is lost, and goes back to waiting.

```csharp
public sealed class LeaderLoop(ILeaseStore store, ILogger<LeaderLoop> log) : BackgroundService
{
    private static readonly TimeSpan Ttl = TimeSpan.FromSeconds(15);
    private static readonly TimeSpan RenewEvery = TimeSpan.FromSeconds(5);
    private static readonly TimeSpan RetryEvery = TimeSpan.FromSeconds(2);

    private readonly string identity = $"{Environment.MachineName}:{Environment.ProcessId}";

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var lease = await store.TryAcquireAsync(identity, Ttl, stoppingToken);
            if (lease is null)
            {
                // Follower: wait, look again. This is the watch in the scene.
                await Task.Delay(RetryEvery, stoppingToken);
                continue;
            }

            log.LogInformation("leading with epoch {Epoch}", lease.Epoch);
            await LeadAsync(lease, stoppingToken);
        }
    }

    private async Task LeadAsync(Lease lease, CancellationToken stoppingToken)
    {
        using var seat = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
        var work = RunWorkAsync(lease.Epoch, seat.Token);

        try
        {
            while (await store.TryRenewAsync(lease, Ttl, seat.Token))
            {
                await Task.Delay(RenewEvery, seat.Token);
            }
            log.LogWarning("lease {Epoch} lost, standing down", lease.Epoch);
        }
        catch (OperationCanceledException)
        {
            // Shutting down.
        }
        finally
        {
            await seat.CancelAsync();
            try
            {
                await work.WaitAsync(TimeSpan.FromSeconds(5), CancellationToken.None);
            }
            catch (OperationCanceledException)
            {
                // The expected way for cancelled work to end.
            }
            catch (TimeoutException)
            {
                log.LogWarning("work did not stop within the grace period");
            }
            // Anything thrown here would leave ExecuteAsync, and the default
            // BackgroundServiceExceptionBehavior would stop the host.
        }
    }
}
```

Two details in that loop are the whole pattern. The renewal is its own `Task.Delay` cadence rather than something the work calls between items, so a slow unit of work cannot delay it. And `seat` is cancelled the instant a renewal fails, so the work stops on the same signal that the lease vanished on.

The lease primitive itself is whatever the platform already has. In Kubernetes it is a `Lease` object in `coordination.k8s.io`, which the .NET client can create and update, and whose `spec.renewTime` and `spec.leaseTransitions` are roughly the record card and the epoch — though `leaseTransitions` is written by the client that takes the seat rather than minted by the server, so it is an epoch by convention and not by construction. On SQL Server, `sp_getapplock` inside a session held open by the leader gives the exclusion half without another dependency; the epoch still has to come from a row like the one above. On Azure, a blob lease with a fixed duration is a lease in the plainest possible form.

```csharp
// SQL Server: one row, one holder, an expiry, and a number that only goes up.
const string acquire = """
    UPDATE leases
       SET holder = @identity,
           expires_at = DATEADD(SECOND, @ttlSeconds, SYSUTCDATETIME()),
           epoch = epoch + 1
    OUTPUT inserted.epoch
     WHERE name = @name
       AND (holder IS NULL OR expires_at <= SYSUTCDATETIME());
    """;
```

Finally, guard the writes. The leader carries the epoch it was granted, and every write it makes says so, so a leader that lost its seat without noticing is refused by the resource rather than trusted by it.

```csharp
// Refused when a newer leader has already written under a higher epoch.
const string commit = """
    UPDATE outbox_cursor
       SET position = @position, epoch = @epoch
     WHERE name = @name AND epoch <= @epoch;
    """;
```

The clock is the last thing worth saying out loud. Every expiry decision belongs to the store, or, on Kubernetes, to the candidates reading the store's record; never to the holder's own clock, because two machines never agree on the time closely enough to be trusted with a seat. Ask the store whether the lease is still yours and use `TimeProvider` for the delays; never compare a local `DateTime.UtcNow` against an expiry that somebody else wrote.
