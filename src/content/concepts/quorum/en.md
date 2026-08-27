---
title: "Quorum"
summary: "The smallest group that cannot exist twice. Requiring a majority before anything is decided is not a formality; it is arithmetic that makes two simultaneous primaries impossible, at the price of stopping when the majority cannot be reached."
category: "Data distribution and consistency"
tags: ["consistency"]
scene: failover
sceneStep: 3
related:
  - label: Failover
    slug: failover
  - label: Split Brain
    slug: split-brain
  - label: Leader Election
    slug: leader-election
  - label: Heartbeat
    slug: heartbeat
  - label: Lease TTL
    slug: lease-ttl
  - label: Primary-Replica
    slug: primary-replica
  - label: Replication
    slug: replication
  - label: Replication Lag
    slug: replication-lag
  - label: Singleton Worker
    slug: singleton-worker
  - label: Eventual Consistency
    slug: eventual-consistency
references:
  - title: "Configure and manage quorum (Failover Clustering)"
    url: https://learn.microsoft.com/en-us/windows-server/failover-clustering/manage-cluster-quorum
  - title: "Windows Server Failover Clustering with SQL Server"
    url: https://learn.microsoft.com/en-us/sql/sql-server/failover-clusters/windows/windows-server-failover-clustering-wsfc-with-sql-server
  - title: "Overview of Always On availability groups"
    url: https://learn.microsoft.com/en-us/sql/database-engine/availability-groups/windows/overview-of-always-on-availability-groups-sql-server
---

The third step of the scene turns on a number that looks like bookkeeping and is in fact the safety property of the whole design. The monitor writes `votes 2/3` and only then does anything move. Two out of three is not a ceremony performed before a decision that had already been made; it is the smallest group that cannot exist twice. Take any set of members, split it however you like, and only one of the pieces can hold more than half. That single sentence is the entire reason failover is allowed to be automatic.

To see why one opinion is not enough, imagine giving the monitor the authority to promote on its own judgement. Now cut the network between the monitor and A while A is perfectly healthy and still answering the app. From where the monitor stands, this looks exactly like the scene's second step: the beats stopped. It promotes B, the connection moves, and A carries on taking writes from every client that can still reach it. Two primaries, two divergent histories, and nothing anywhere that knows it. A single observer's verdict is a verdict about what it can see, and what it can see is not the same thing as what is true.

A majority fixes this not by being wiser but by arithmetic. Partition three members and one side gets at most one; one is not a majority, so that side cannot act, no matter what it believes. That is the part worth admiring: the isolated member does not have to work out that it is isolated, and it does not have to be honest, careful or well-implemented. It simply fails to reach the threshold. The rule stays safe even for a member with completely wrong beliefs about the state of the world, which is exactly the kind of member a network partition produces.

This is why quorum members are counted rather than ranked, and why the count wants to be odd. A group of two has no useful majority at all, because a majority of two is two, so either machine going away stops everything and you have bought yourself nothing. Adding a third vote is what turns a pair into something that survives one loss, and the third vote does not have to be a third database: a witness, an arbiter, a share on a file server, a small process in another zone. It has to be able to say yes, and it has to be able to fail separately from the other two.

The price is stated plainly by the same arithmetic. A system that requires a majority stops when it cannot get one. Lose two of three and you have not merely lost capacity, you have lost the ability to decide anything at all, including the ability to decide who should take over. That is availability traded away for the guarantee of never having two primaries, and it is worth saying out loud before an incident rather than during one, because a cluster that has correctly refused to act looks identical to a cluster that is broken, and the person paged at three in the morning will not enjoy discovering the difference from first principles.

Two practical points follow. The votes must fail independently: three members in the same rack, on the same hypervisor, or behind the same power feed are one failure wearing three costumes, and the majority they form is imaginary. And the vote is only ever about liveness, never about data. Deciding that A is gone is a different question from deciding which surviving replica is furthest ahead and should therefore be promoted, and a design that answers the first and forgets the second will happily promote the machine with the shortest history it could have chosen.
