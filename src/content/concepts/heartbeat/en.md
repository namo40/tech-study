---
title: "Heartbeat"
summary: "A periodic signal whose only content is that it arrived. Nothing a heartbeat says is information; the information is in the one that does not come, which is why every detector is really choosing a length of silence."
category: "Data distribution and consistency"
scene: failover
sceneStep: 2
related:
  - label: Failover
    slug: failover
  - label: Quorum
    slug: quorum
  - label: Leader Election
    slug: leader-election
  - label: Lease TTL
    slug: lease-ttl
  - label: Split Brain
    slug: split-brain
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
  - title: "Flexible automatic failover policy for an availability group"
    url: https://learn.microsoft.com/en-us/sql/database-engine/availability-groups/windows/flexible-automatic-failover-policy-availability-group
  - title: "Windows Server Failover Clustering with SQL Server"
    url: https://learn.microsoft.com/en-us/sql/sql-server/failover-clusters/windows/windows-server-failover-clustering-wsfc-with-sql-server
  - title: "Health Endpoint Monitoring pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/health-endpoint-monitoring
---

The second step of the scene is built around a signal that carries no content at all. A heartbeat says nothing except that it arrived. There is no payload worth reading, no status field, no summary of how the machine is feeling; the two dots dropping into the monitor are identical every time, and that is the point. What the monitor learns is not inside the beat. It is in the beat having arrived when it was expected.

That has a consequence people usually meet the hard way: the only information a heartbeat carries is negative. Look at what happens at the instant A stops. Nothing happens. No error is raised, no message is sent, no lamp flickers, because a machine that has stopped cannot tell anybody it has stopped. The event that matters is an absence, and an absence can only be noticed by somebody who was already expecting something. This is why the monitor has to know the cadence before it can know anything at all, and why the lamp goes dark some time after the failure rather than at it.

Which leads to the sentence the second caption puts on the screen: the monitor cannot tell dead from slow. A process paused by a long garbage collection, a machine whose disk has saturated, a database mid-checkpoint, a network that has started dropping packets in one direction only — from the monitor's side every one of these is indistinguishable from a machine that has been unplugged, because every one of them looks like silence. Nobody designing a detector is detecting death. They are choosing a length of silence they are willing to treat as death, and they are choosing it without ever being able to verify the difference.

That makes the timeout the most consequential number in the design, and it is a number with a cost on both sides. Make it short and normal pauses get read as failures, which means promotions that were not needed, connections dropped for nothing, and in the worst case a machine declared dead while it is still happily accepting writes. Make it long and the seat sits empty for exactly that long while users watch requests fail. There is no setting that avoids both, only a setting that puts the risk where you would rather have it.

This is why the lamp in the scene has two dark states rather than one. A single missed beat makes the monitor doubt A; a second one makes it stop counting A at all. The gap between them is deliberate, because the two states cost completely different amounts. Doubt is free and can be withdrawn without anybody noticing, so it can be cheap and early. Dropping a member from the count is what unlocks a promotion, and a promotion is not free and cannot be withdrawn, so it should be slow and expensive. Cheap suspicion, expensive conviction.

Two practical notes are worth more than any amount of tuning. First, a heartbeat should travel the path the real work travels and be produced by the thing that does the real work. A beat answered by a spare thread while the main one is deadlocked, or sent over a management network while the data network is down, is worse than no beat at all, because it actively reports health that is not there. Second, it should be cheap enough to send often and expensive enough to prove something: an endpoint that only proves the process is still running will keep beating steadily while every query behind it times out.
