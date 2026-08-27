---
title: "Split Brain"
summary: "A split brain is two nodes that both believe they hold the same exclusive role, and both act on it. Leader election does not prevent it by making the belief impossible; it prevents the damage by making the resource refuse the writes of whichever node is wrong."
category: "Distributed coordination"
tags: ["consistency"]
scene: leader-election
sceneStep: 3
related:
  - label: Leader Election
    slug: leader-election
  - label: Fencing Token
    slug: fencing-token
  - label: Distributed Lock
    slug: distributed-lock
  - label: Distributed Lease
    slug: distributed-lease
  - label: Lease TTL
    slug: lease-ttl
  - label: Singleton Worker
    slug: singleton-worker
  - label: Quorum
    slug: quorum
  - label: Failover
    slug: failover
  - label: Health Check
    slug: health-check
  - label: Eventual Consistency
    slug: eventual-consistency
references:
  - title: Leader Election pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/leader-election
  - title: "Kubernetes: Leases"
    url: https://kubernetes.io/docs/concepts/architecture/leases/
  - title: BackgroundService Class
    url: https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.hosting.backgroundservice
---

The third step of the scene is the only place where anything goes wrong, and it is worth being precise about what actually happens. The leader does not hand its seat over. It stops answering, the countdown reaches zero without it, the store frees the record, and a follower takes the seat with a higher epoch. All of that is orderly. What is not orderly is the state of the dead node afterwards: it still has a lease object in memory saying it is the leader, and nothing has told it otherwise. When it comes back it does the only thing its code knows how to do, which is carry on leading. For a moment there are two instances in the system that both believe they hold the same exclusive role. That is a split brain, and no amount of care inside either process can prevent it.

The reason it cannot be prevented from the inside is that the old leader has no way to distinguish "I was slow" from "I was replaced". Both look identical from where it stands: some time passed, and now it is running again. A pause caused by garbage collection, by a live migration, by a network partition that healed, by a container throttled down to a sliver of CPU, all produce exactly the same experience. The node can check the clock and find that more than a TTL elapsed, but that check happens after it has already resumed, and in a real process the resumption and the check are separated by however much work sat between them. The window is narrow, it is unavoidable, and it is precisely wide enough to write something.

So the design does not try to close the window. It arranges for the write to be refused. The lease carries a number that only ever goes up, handed out by the store when it grants the seat, and the scene shows it as the epoch on the record card. Every write the leader makes carries the epoch it was granted under, and the resource keeps the highest epoch it has accepted and refuses anything stamped lower. Now the old leader's write does not corrupt anything; it fails. This is what fencing means, and it is the difference between a system where a split brain is a nuisance in the logs and one where it is a corrupted report nobody notices for a week.

The distinction that matters here is between exclusion and protection. A lease gives exclusion: at any instant the store believes exactly one node holds the seat, and it will tell you which. Fencing gives protection: the resource itself will not accept work from a node whose belief is out of date. Exclusion alone is not enough, because the seat can move while the old holder is not listening, and exclusion says nothing about what that holder does next. Protection alone is not enough either, because without a seat you have no way to decide who should be working. The pair is what makes exactly-once work possible across a fleet, and either one on its own leaves a hole.

Two practical notes about where this bites. First, the resource has to be something that can enforce the check, which usually means a database row, a conditional write with an ETag, or an append with an expected version. If the side effect is an email, a payment, or a call to somebody else's API, there is no place to put the fence, and the honest answer is to make the operation safe to repeat rather than to pretend leadership prevented the repeat. Second, a lease elects one leader per lease, not per world. Two clusters running the same deployment against the same database each elect a leader that knows nothing about the other, and the split brain that results is not a failure of the election but a failure to notice that there were two of them. The fence catches that one too, which is another reason to have it.

Finally, watch the boundary in the scene: the ticks never overlap. The seat is briefly empty during the re-election, and the work strip shows the gap, but no two instances ever add to it at once. A short gap is the cost of the whole arrangement, and it is the right cost. A system that never leaves the seat empty is a system that hands it over before the old holder has certainly let go, and that is the trade split brain is the name of.
