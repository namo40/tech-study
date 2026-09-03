---
title: "Lease Renewal"
summary: "Lease renewal is the loop that keeps refilling a countdown the leader would otherwise lose. Its two rules are how often it runs relative to the TTL, and what the holder does the moment a renewal fails — which has to be standing down, not trying harder."
category: "Distributed coordination"
scene: leader-election
sceneStep: 2
related:
  - label: Leader Election
    slug: leader-election
  - label: Lease TTL
    slug: lease-ttl
  - label: Kubernetes Lease
    slug: kubernetes-lease
  - label: Distributed Lock
    slug: distributed-lock
  - label: Heartbeat
    slug: heartbeat
references:
  - title: "Kubernetes: Leases"
    url: https://kubernetes.io/docs/concepts/architecture/leases/
---

The scene's second step shows a ring draining and being refilled, and this page is about the thing doing the refilling. Three pages divide that picture between them. Lease TTL owns the number: what the countdown means, and the trade you make when you choose how long it is. Kubernetes Lease owns the object the claim is written into, with its fields and its optimistic concurrency. This page owns the loop that runs between them — how often it fires, what it does when a call to the store fails, and what the process must do about its own work when it can no longer prove it holds the seat.

The interval is a ratio, not a duration. Whatever the TTL is, the renewal has to fit several attempts inside one life of the lease, because a renewal is a network round trip to a store that is allowed to be slow, drop a packet, or be mid-failover, and a single failure must not cost the leadership. Firing at roughly a third of the TTL leaves room for two attempts to fail before the seat is at risk, which is the cheapest insurance in the whole design. Two details make that arithmetic honest. The deadline should be computed from the moment the request was sent rather than the moment its answer came back, since the store began counting at the write and a slow reply has already spent part of the life. And the loop needs its own thread of execution, isolated from the work being done under the lease: a renewal that runs between units of work inherits the duration of the slowest unit, so a batch that takes longer than the TTL silently ends the leadership before the loop gets another turn.

The rule for failure is the harder half, and it is a discipline rather than a mechanism. Expiry is not judged by the holder; the store's clock decides, and on Kubernetes it is the other candidates reading the object who decide. That asymmetry means a leader whose renewals are failing is not in a position to know whether it still leads, so the safe assumption is that it does not. The discipline is to stop acting as leader before the TTL would have expired, leaving a margin for the two clocks disagreeing and for the write that may already be in flight: keep retrying inside the remaining budget, and when that budget runs out with a margin still on the clock, cancel the work, drop the claim in memory, and go back to being a follower. Standing down early costs a brief empty seat. Standing down late means two processes believing they lead at the same moment, which is the failure the whole arrangement exists to prevent. Releasing the lease deliberately when the process shuts down cleanly is the same discipline applied to the easy case, and it turns a full TTL of waiting into an immediate handover.

What breaks the loop in practice is almost never a bug in the loop. It is a pause that stops the whole process: a blocking garbage collection over a large heap, a thread pool starved by synchronous calls so the renewal task never gets scheduled, a container throttled to a fraction of a core, a virtual machine paused for live migration. From the store's side each of these is indistinguishable from a crash, and the seat moves while the process is still holding a lease object that says otherwise. That is why the recovery path deserves as much attention as the acquisition path, and why the work started under the lease has to be cancellable rather than merely interruptible at convenient points. Watch the two signals that tell you whether the loop is healthy: the observed gap between successive successful renewals, which should sit near the interval and never near the TTL, and the count of leadership transitions, which should be flat when nothing has crashed.
