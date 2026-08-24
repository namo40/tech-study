---
title: "Fencing Token"
summary: "A fencing token is a number handed out with every lock acquisition that only ever increases. The holder attaches it to each write, and the resource refuses anything carrying a token lower than the highest it has already accepted."
category: "Distributed coordination"
scene: distributed-lock
sceneStep: 4
related:
  - label: Distributed Lock
    slug: distributed-lock
  - label: Distributed Lease
    slug: distributed-lease
  - label: Lease TTL
    slug: lease-ttl
  - label: Split Brain
    slug: split-brain
  - label: Leader Election
    slug: leader-election
  - label: Optimistic Concurrency
    slug: optimistic-concurrency
  - label: Lost Update
    slug: lost-update
  - label: Idempotency
    slug: idempotency
references:
  - title: How to do distributed locking (Martin Kleppmann)
    url: https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html
  - title: Distributed locks with Redis
    url: https://redis.io/docs/latest/develop/use/patterns/distributed-locks/
  - title: Kubernetes Leases
    url: https://kubernetes.io/docs/concepts/architecture/leases/
---

The problem a fencing token solves is the one the third step of the scene shows: a holder that was paused long enough to lose its lease, and that wakes up with no idea anything happened. It has no way to detect the gap from the inside. Its own clock moved forward by a few milliseconds of thread time, its lock object still says it holds the key, and its next write looks exactly like the one before. Asking the lock service again does not help either, because by the time the answer comes back the lease could have expired again.

So the check moves to the only party that can make it: the resource being written to. Every acquisition is stamped with a number that never repeats and never goes backwards, usually an atomic counter next to the key. The holder carries that number on every write. The resource keeps the highest number it has accepted, and any write arriving with something lower is refused. The old holder's write turns up carrying token 37, the storage has already accepted 38 from the new holder, and 37 is now meaningless.

What makes this work is that the ordering is decided by the lock service, which is the only component that knows the true sequence of grants, and it is checked by the resource, which is the only component that sees the writes. Neither of them has to trust a clock, and neither has to trust the holder's opinion of itself. The token turns a lock, which is advisory, into exclusion the storage actually enforces, and the lock becomes an optimisation that keeps contention low rather than the thing correctness rests on.

Implementing it costs one column and one predicate. In a relational database it is `WHERE last_token < @token` on the update, which is the same shape as an optimistic concurrency check but keyed on the lease rather than on the row's own version. In a document store it is a conditional write on the same field. In an object store it is a precondition header. The pattern only breaks down when the resource cannot express a condition at all, and that is worth knowing before the design depends on a lock: if the destination cannot refuse a stale write, nothing downstream of it can either.

Two details are easy to get wrong. The token must come from the acquisition, not from the writer's own counter, or two writers can mint the same value. And the resource must store the token durably next to the data it guards, because a token remembered only in memory is forgotten by the restart that a stale holder is most likely to survive.
