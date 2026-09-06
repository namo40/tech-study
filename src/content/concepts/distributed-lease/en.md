---
title: "Distributed Lease"
summary: "A distributed lease is a lock with an expiry attached. The holder gets the key for a fixed time and has to keep asking for more; if it stops asking, for any reason at all, the key goes back to whoever wants it next."
category: "Distributed coordination"
level: 7
scene: distributed-lock
sceneStep: 2
related:
  - label: Distributed Lock
    slug: distributed-lock
  - label: Fencing Token
    slug: fencing-token
  - label: Lease TTL
    slug: lease-ttl
  - label: Lease Renewal
    slug: lease-renewal
  - label: Leader Election
    slug: leader-election
  - label: Kubernetes Lease
    slug: kubernetes-lease
  - label: Split Brain
    slug: split-brain
  - label: Lock
    slug: lock
references:
  - title: Distributed locks with Redis
    url: https://redis.io/docs/latest/develop/use/patterns/distributed-locks/
  - title: Kubernetes Leases
    url: https://kubernetes.io/docs/concepts/architecture/leases/
  - title: How to do distributed locking (Martin Kleppmann)
    url: https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html
---

A lock in a single process is held until the code releases it, and if the thread dies the runtime cleans up. Nothing does that across a network. If one instance takes a key and then loses power, the key would stay taken forever, and every other instance would wait forever with it. The expiry is the answer to that, and it is why a distributed lock is really a lease: the key is granted for a fixed time, not until the work is finished.

That makes the TTL a real design decision rather than a default to copy. Too short and a holder that is merely slow loses the key in the middle of its work. Too long and a crashed holder blocks everyone for the whole window. The usual rule is to set the TTL comfortably above the p99 duration of the critical section, then renew at a fraction of it, so that several renewals can fail before the lease is actually at risk. In the scene the TTL is drawn as an arc that drains and a renewal refills it; renewing every quarter of the window means two ticks can be lost before the key is in danger.

Renewal has to be conditional. "Set the expiry on this key" is the wrong operation, because the key may already belong to somebody else by the time the request arrives, and extending their lease is worse than doing nothing. The right operation is "extend this key only if its value is still my owner id", which Redis expresses as a small Lua script and Kubernetes expresses through the resource version on the Lease object. Release is the same shape: delete only if it is still mine.

The failure that matters is the one where a renewal does not come back. It does not tell you the lease is gone, only that you cannot prove you still hold it, and those are the same thing from the resource's point of view. The safe response is to stop the work immediately and treat everything after that point as unowned. Code that logs the failed renewal and carries on is the code that produces two writers, because the lease may have expired seconds ago and somebody else may already be working.

None of this makes the lease safe on its own. An expiry bounds how long a dead holder can block the system, which is a liveness property; it does nothing about a live holder that is wrong about owning the key. That gap is what a fencing token closes, and a lease without one is a lease that only reduces the odds of two writers rather than removing them. The token is the safety property that the expiry's liveness one leaves open: the resource refuses any write carrying a number below the highest it has already accepted, so a holder that is wrong about owning the key is stopped by the resource rather than trusted by it.
