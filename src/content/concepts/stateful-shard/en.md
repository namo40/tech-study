---
title: "Stateful Shard"
summary: "A shard that owns state cannot be moved by pointing at another node: a replica has to be filled, the writes that happened while it was filling have to be replayed, and only then does ownership flip. What callers feel is the length of the switch, not the length of the copy."
category: "Data distribution and consistency"
tags: ["database"]
scene: rebalancing
sceneStep: 4
related:
  - label: Rebalancing
    slug: rebalancing
  - label: Sharding
    slug: sharding
  - label: Partitioning
    slug: partitioning
  - label: Cross-Shard Query
    slug: cross-shard-query
  - label: Replication
    slug: replication
  - label: Replication Lag
    slug: replication-lag
  - label: Failover
    slug: failover
  - label: Leader Election
    slug: leader-election
  - label: Eventual Consistency
    slug: eventual-consistency
references:
  - title: Partitioning and horizontal scaling in Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/partitioning-overview
  - title: Sharding pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/sharding
  - title: Partition Service Fabric reliable services
    url: https://learn.microsoft.com/en-us/azure/service-fabric/service-fabric-concepts-partitioning
---

A stateless shard moves by editing one line in a map. A stateful one owns bytes, so moving it is a data migration that happens to be measured in minutes rather than in months, and the interesting question is not how long it takes but how much of that time the callers can see. The answer is the reason the move is broken into three beats instead of being done in one: the copy is long and invisible, the catch-up is short and invisible, and the switch is the only part anybody feels.

The copy runs against a shard that is still open for business. The origin keeps answering reads and accepting writes while a replica on the target node fills from a snapshot, which is what makes the length of the copy irrelevant to availability — a hundred gigabytes and a hundred megabytes cost the same to the caller, because the caller is being served by the original the whole time. The price is that the replica is out of date before it finishes: every write the origin accepted during the copy is a change the replica has never seen. Throttle this phase deliberately. It is competing with production traffic for the same disks and the same network, and the fastest copy is very often the one that causes the incident.

Catch-up closes that gap. The origin has been recording its writes since the snapshot was taken, and those records are replayed onto the replica until the two are close enough that the remainder can be drained in one short pause. Close enough is a real threshold rather than a feeling: the replay has to be applying changes faster than new ones arrive, or the gap never shrinks and the move never converges. If it does not converge, that is the signal to stop and try again at a quieter hour rather than to push harder.

The switch is the only moment with a cost. Writes to the shard are paused or queued, the last few changes drain onto the replica, the map is rewritten to name the new owner, and traffic resumes. Everything about that sequence should be short: the pause is bounded by how much lag the catch-up left, which is why the previous phase exists. Callers experience it as a brief stall or a redirect, and the ones holding an old copy of the map arrive at the origin and are sent onward, which is why the origin has to keep the redirect alive for a while after it stops owning the data.

Two rules make the whole thing safe. There is exactly one owner at every instant, and the map is what says who it is — never the node, and never the client's memory of the node. And a move that fails is a move that leaves the origin owning the shard, with the half-built replica thrown away: an abandoned copy is garbage, not a second opinion. Keep the switch idempotent and fenced with a version so a delayed message from before the move cannot be applied after it, and the worst outcome of a failed migration is wasted bandwidth.
