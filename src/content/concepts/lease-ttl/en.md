---
title: "Lease TTL"
summary: "A lease TTL is how long a held lease stays valid without being renewed. It is the one number that decides both how fast a dead leader's seat frees up and how easily a living one loses its seat to a pause, which is why it is a trade rather than a setting."
category: "Distributed coordination"
scene: leader-election
sceneStep: 2
related:
  - label: Leader Election
    slug: leader-election
  - label: Distributed Lease
    slug: distributed-lease
  - label: Distributed Lock
    slug: distributed-lock
  - label: Fencing Token
    slug: fencing-token
  - label: Split Brain
    slug: split-brain
  - label: Singleton Worker
    slug: singleton-worker
  - label: TTL
    slug: ttl
  - label: Health Check
    slug: health-check
  - label: Heartbeat
    slug: heartbeat
  - label: Failover
    slug: failover
references:
  - title: "Kubernetes: Leases"
    url: https://kubernetes.io/docs/concepts/architecture/leases/
  - title: Leader Election pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/leader-election
  - title: BackgroundService Class
    url: https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.hosting.backgroundservice
---

The second step of the scene is the ring emptying and filling again, and the thing worth noticing is that nothing else in the picture changes while it does. The leader is not doing anything to prove it is alive. It is simply refilling a countdown that would otherwise reach zero, and the seat belongs to it for exactly as long as that countdown lasts. That is the whole definition. A lease TTL is not a timeout on a request, not a health check interval, and not a retry budget; it is the length of time the store will keep believing a holder that has gone quiet.

Which means the TTL is a promise made in both directions at once. To the holder it says: you may stop talking to me for this long and still be the leader. To everybody else it says: if the holder stops talking to me for this long, you may take the seat. Those are the same sentence read from two sides, and every consequence of the number falls out of that symmetry. Shorten it and a dead leader's work resumes sooner, because the seat frees up sooner; lengthen it and a living leader survives a longer pause, because the store waits longer before giving up on it. There is no setting that gives you both, and any argument about the right TTL is really an argument about which of those two failures you would rather have.

The failure people forget is the second one. A leader does not have to crash to lose its seat; it only has to go quiet for longer than the TTL, and processes go quiet for all sorts of ordinary reasons. A garbage collection pause, a thread pool starved by synchronous work, a virtual machine that was live migrated, a DNS lookup that took eight seconds, a container that got throttled to a fraction of a CPU. From the store's point of view all of these look exactly like death, and the seat moves. Then the old leader wakes up, still holding a lease object in memory that says it is the leader, and carries on. This is not a rare corner: on any TTL short enough to give quick failover, it will happen, and the entire design has to assume it does.

That is why the renewal interval matters as much as the TTL, and why it belongs on its own loop. The usual rule is to renew somewhere between a third and a half of the way through the life, which leaves room for a renewal to fail once and be retried before the seat is gone. Renew too close to the expiry and a single slow round trip costs the leadership; renew far too often and the store carries the traffic of every candidate for no benefit. What breaks this rule most often is not the interval but the placement, because renewing between units of work is easy to write and quietly ties the leader's survival to the slowest thing it does. If one batch runs longer than the TTL, the seat is gone before the loop comes back around to renew it.

The other half of the design is what happens in the gap. However you tune it, there is a stretch between the moment a leader stops renewing and the moment it finds out, and during that stretch the old leader believes one thing and the store believes another. The scene shows this as the returning instance being refused, and the refusal is the point: nothing in the old leader can detect the gap from the inside, so the resource it writes to has to detect it from the outside. Give the lease a number that only goes up, carry that number on every write, and let the resource refuse anything stamped with an older one. Then the TTL stops being a correctness setting and becomes what it should be, a dial for how quickly the work resumes, with the correctness handled somewhere the clock cannot reach.

A last practical note on where the clock lives. Expiry has to be judged by the store, using the store's own time, because two machines do not agree closely enough about the current instant to hand a seat over on their word. A leader that computes `expiresAt - DateTime.UtcNow` locally and concludes it is still safe has learned nothing, since a clock that drifted a few seconds is exactly the case the lease exists to survive. Ask the store, treat a failed renewal as a lost lease rather than something to retry indefinitely, and keep the TTL comfortably larger than the worst round trip you are prepared to see.
