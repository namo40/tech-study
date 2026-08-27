---
title: "Singleton Worker"
summary: "A singleton worker is background work that runs on exactly one instance out of the whole fleet at any moment, no matter how many replicas are deployed. It is the reason leader election exists, and the work strip is where you check whether it is really working."
category: "Distributed coordination"
tags: ["queue"]
scene: leader-election
sceneStep: 4
related:
  - label: Leader Election
    slug: leader-election
  - label: Background Job
    slug: background-job
  - label: Distributed Lock
    slug: distributed-lock
  - label: Lease TTL
    slug: lease-ttl
  - label: Split Brain
    slug: split-brain
  - label: Fencing Token
    slug: fencing-token
  - label: Transactional Outbox
    slug: transactional-outbox
  - label: Competing Consumers
    slug: competing-consumers
  - label: Idempotency Key
    slug: idempotency-key
  - label: Failover
    slug: failover
references:
  - title: BackgroundService Class
    url: https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.hosting.backgroundservice
  - title: Leader Election pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/leader-election
  - title: "Kubernetes: Leases"
    url: https://kubernetes.io/docs/concepts/architecture/leases/
---

The last step of the scene stops looking at the lease and looks at the work strip instead, because the strip is the only thing any of this was for. Read it left to right and you see one unbroken row of ticks across the whole run: three instances started, one of them died, the seat moved to another, and the row does not care. There is a short gap where nobody held the seat, and the duplicate counter never moves. That row is the definition of a singleton worker, and everything above it, the record card, the countdown, the epoch, exists only to keep the row looking like that.

The problem it solves shows up the day an application is scaled from one replica to three. Nothing in the code changed; the scheduled job that swept expired carts every minute now sweeps them three times a minute, from three processes, racing each other. Most of the time nobody notices, because the work happens to be safe to repeat. Then one day it is not: three copies of the nightly report land in the finance mailbox, or a retry queue is drained by three pumps that each mark the same message as handled, or a cache warmer triples the load on a database at the exact minute it is least able to take it. The scale-out was correct; the assumption that there was one of everything was the thing that broke.

There are two honest ways out, and it is worth knowing which one you are choosing. One is to make the work distributable, so every instance takes a share and no coordination is needed. That is competing consumers, it scales, and it is the better answer whenever the work is a stream of independent items. The other is to make the work singleton, so exactly one instance runs it and the rest wait. That is this pattern, it does not scale at all, and it is the right answer when the work is a sequential position, a global sweep, or anything where two workers would have to agree on an order. Choosing singleton for something that could have been partitioned is a common and expensive mistake, because the ceiling is now one machine forever.

Once you have chosen singleton, the implementation detail that matters most is that leadership is checked inside the loop rather than around it. A worker that acquires a lease and then enters a long `while (true)` is a singleton for as long as its process lives, not for as long as it holds the lease, and those two things stop being the same at the first pause. Check the token before each unit of work, pass the epoch down to whatever writes, and treat a lost lease as a reason to stop mid-batch rather than a reason to log a warning and continue. The step-down path is the part that never gets tested, so it is worth writing it first.

The other detail is timing on the way in. The seat is briefly empty during a handover, which means the new leader inherits work that may be partly done, and it must be able to pick up from wherever the previous one stopped. A cursor in a table, a claim column with a timestamp, or a queue that redelivers unacknowledged messages all give you that; a counter in memory does not. Assume that every unit of work either completed and was recorded, or did not complete and will be seen again by somebody else. Then a leader dying halfway through is uneventful, which is exactly what the unbroken row in the scene is showing.

Finally, watch what the singleton worker is worth measuring on. Not throughput, because there is only one of it. The numbers that matter are how long the seat stayed empty after a failure, whether any unit ran twice across a handover, and how far behind the work fell while nobody held the seat. Those three come straight off the strip: the gap, the duplicate counter, and the distance between the last tick before the handover and the first one after it.
