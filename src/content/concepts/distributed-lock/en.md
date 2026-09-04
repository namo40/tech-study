---
title: "Distributed Lock"
summary: "A distributed lock lets only one instance at a time do some piece of work. It is really a lease with an expiry, so the holder can lose it without knowing, and only a fencing token makes the resource itself refuse the stale holder's writes."
category: "Distributed coordination"
scene: distributed-lock
steps:
  - title: "Two instances, one job"
    text: "The nightly job fires on both instances, both write to the same report, and their writes interleave. Each one thinks it succeeded."
  - title: "A lease, not a lock"
    text: "The first instance claims the key with a time-to-live and keeps renewing it while it works; the second is refused and waits. When the holder releases, the waiter takes over. The TTL is there so a dead holder cannot block everyone forever."
  - title: "The expiry does not ask"
    text: "The holder pauses, a long GC or a network blip, and its lease runs out. The waiter takes the lock and writes. Then the old holder wakes up, still sure it owns the lock, and writes too."
  - title: "Fencing"
    text: "Every acquisition gets a token that only ever increases, and the resource remembers the highest it has seen. The stale holder's write carries an older token and is refused by the storage itself. Before reaching for a lock at all, prefer partitioning, unique constraints, and idempotent operations."
related:
  - label: Distributed Lease
    slug: distributed-lease
  - label: Fencing Token
    slug: fencing-token
  - label: Lease TTL
    slug: lease-ttl
  - label: Lease Renewal
    slug: lease-renewal
  - label: Leader Election
    slug: leader-election
  - label: Split Brain
    slug: split-brain
  - label: Kubernetes Lease
    slug: kubernetes-lease
  - label: Singleton Worker
    slug: singleton-worker
  - label: Partitioning
    slug: partitioning
  - label: Idempotency
    slug: idempotency
  - label: Lock
    slug: lock
  - label: Deadlock
    slug: deadlock
references:
  - title: Distributed locks with Redis
    url: https://redis.io/docs/latest/develop/use/patterns/distributed-locks/
  - title: How to do distributed locking (Martin Kleppmann)
    url: https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html
  - title: Kubernetes Leases
    url: https://kubernetes.io/docs/concepts/architecture/leases/
---

## When to use

- Only after the cheaper answers have been ruled out: partition the work by key so two instances can never touch the same thing, let a database unique constraint reject the second writer, use a conditional update so a stale write cannot land, or make the handler idempotent so running it twice costs nothing.
- A singleton worker, a scheduled job that must not run twice, a migration step that has to happen once. These are the cases where the work genuinely cannot be split by key and genuinely cannot be repeated.
- Never as a substitute for a transaction. A distributed lock coordinates processes; it does not make two writes atomic, and it does not roll anything back when the holder dies halfway through.

## Cautions

- A distributed lock is a lease. It expires whether the holder is done or merely paused, so plan for the holder to be wrong about owning it. Every design that assumes "I hold the lock, therefore nobody else is writing" is wrong under a long garbage collection pause.
- Fence every write with the token from the acquisition, and make the resource reject lower tokens. Without that, the lock is advice the storage never hears; with it, the storage is the one enforcing exclusion and the lock is only an optimisation.
- Set the TTL longer than the work's p99, renew well inside it, and stop working the moment a renewal fails. A renewal that fails means the lease may already be gone, so the correct response is to abandon the work, not to try harder.
- Measure acquisition failures, renewal failures, and hold time. A lock held for minutes is a design smell: it means the critical section grew to include an HTTP call, a queue send, or a report render that should have happened outside it.
- Do not use the lock service's clock as a source of truth. Redis expiry, your process clock, and the resource's clock all drift, and the whole point of the fencing token is that correctness stops depending on any of them.
- A single Redis primary with asynchronous replicas can hand the key out twice across a failover, because the acquisition may not have reached the replica that gets promoted. That is what the Redlock discussion is about, and fencing is what makes it survivable rather than fatal.
- For leader election in Kubernetes use the Lease object rather than building your own. Assume a brief overlap when leadership changes, because the old leader can still be running when the new one starts.

## In .NET

A lease over Redis is three operations: take the key only if it does not exist, renew it only while we still own it, and release it only if it is still ours. Each one runs as a single script, so the check and the write cannot come apart — which is what stops one instance from renewing or deleting a lease that has already moved on, and what keeps the fencing token in step with the grants.

```csharp
public sealed record Lease(string Key, string Owner, long Token, TimeSpan Ttl);

public sealed class RedisLease(IDatabase redis)
{
    // Take the key and mint the token in one script, so the tokens increase in
    // acquisition order. An INCR outside the script can hand a lower token to
    // the instance that ends up acquiring later.
    private const string AcquireScript = """
        if redis.call('exists', KEYS[1]) == 1 then return nil end
        local token = redis.call('incr', KEYS[2])
        redis.call('set', KEYS[1], ARGV[1] .. ':' .. token, 'PX', ARGV[2])
        return token
        """;

    public async Task<Lease?> TryAcquireAsync(string key, TimeSpan ttl)
    {
        var owner = Guid.NewGuid().ToString("N");
        var result = await redis.ScriptEvaluateAsync(AcquireScript,
            [key, $"{key}:fence"], [owner, (long)ttl.TotalMilliseconds]);
        return result.IsNull ? null : new Lease(key, owner, (long)result, ttl);
    }

    // Renew only if we still own it (compare-and-set in Lua).
    private const string RenewScript =
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) end return 0";

    public async Task<bool> RenewAsync(Lease lease) =>
        (long)await redis.ScriptEvaluateAsync(RenewScript, [lease.Key],
            [$"{lease.Owner}:{lease.Token}", (long)lease.Ttl.TotalMilliseconds]) == 1;

    private const string ReleaseScript =
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0";

    public Task ReleaseAsync(Lease lease) =>
        redis.ScriptEvaluateAsync(ReleaseScript, [lease.Key], [$"{lease.Owner}:{lease.Token}"]);
}

// The resource side: refuse anything older than the highest token seen.
// UPDATE reports SET body = @body, last_token = @token WHERE id = @id AND last_token < @token;
// Give last_token a default of 0, or the first write compares against NULL and never lands.
```

The last line is the only part that makes the lock safe, and it is the part that is usually missing. If the resource cannot hold a token column, it cannot fence, and the best the lock can do is make collisions rare rather than impossible.

If you need a single running worker in Kubernetes, do leader election with the Lease object and let the platform hold the state. Leadership still changes with a short overlap, so write the job so that running it twice is harmless, and keep fencing the writes it makes.
