---
title: "PACELC"
summary: "PACELC extends the CAP theorem with the half you meet every day: if there is a Partition, the choice is Availability against Consistency, Else the choice is Latency against Consistency. Since most days have no partition, the Else branch is where a system's real character lives."
category: "Data distribution and consistency"
tags: ["consistency", "latency"]
scene: cap-theorem
sceneStep: 4
related:
  - label: CAP Theorem
    slug: cap-theorem
  - label: Strong Consistency
    slug: strong-consistency
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Linearizability
    slug: linearizability
  - label: Consistent Prefix
    slug: consistent-prefix
  - label: Replication Lag
    slug: replication-lag
  - label: Replication
    slug: replication
  - label: Quorum
    slug: quorum
  - label: Conflict Resolution
    slug: conflict-resolution
  - label: Failover
    slug: failover
references:
  - title: Consistency levels in Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/consistency-levels
  - title: Data partitioning guidance
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/data-partitioning
---

PACELC reads as a sentence with two branches: if there is a Partition, you are choosing between Availability and Consistency; Else, you are choosing between Latency and Consistency. Daniel Abadi proposed it because the CAP theorem, taken alone, describes a rare emergency and says nothing about the ordinary Tuesday afternoon that makes up the rest of a system's life. The second half is the more useful one precisely because it is always running. A replicated store is making the latency-versus-consistency trade on every single read, partition or no partition, and that is the trade your users actually experience.

The fourth step of the scene is that sentence with the emergency removed. The `link` is whole, nothing is cut, and two reads still cost different amounts. The strongly consistent one has to reach the other replica and come back before it will answer, so the meter reads `ms 150`. The relaxed one answers from the copy nearest the caller, so it reads `ms 90`. Nothing failed; nobody chose anything in a crisis. The difference is simply what agreement costs when agreement has to cross a network, and it is charged on every read that asks for it.

Written out, systems get a two-letter description: PC/EC pays for consistency in both branches, PA/EL gives it up in both, and PC/EL — consistent when the network breaks, fast the rest of the time — describes a great many real deployments, including most quorum stores run at their defaults. The point of the notation is not to file products into boxes; it is to make you say the Else branch out loud. Two teams can agree completely on what happens during a partition and still be building different products, because one of them is paying a cross-region round trip on every read and the other is not.

The uncomfortable part of PACELC is that you have already answered it. Every default in your stack is a position on this line: a Cosmos DB account set to `Session`, a Mongo `readPreference` of `secondaryPreferred`, an availability group running asynchronous commit, a cache in front of a query with no invalidation story. None of those were a design meeting, and all of them are choices about how stale an answer may be in exchange for how fast. Reading PACELC properly means going back through those defaults, deciding which datasets deserve to be moved, and writing down why the others stay where they are.
