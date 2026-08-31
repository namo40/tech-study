---
title: "Strong Consistency"
summary: "Strong consistency is the promise that every read sees the most recent completed write, as though the system held one copy instead of several. It is bought twice: with refusals on the minority side of a partition, and with a round trip on every ordinary read."
category: "Data distribution and consistency"
tags: ["consistency"]
scene: cap-theorem
sceneStep: 2
related:
  - label: CAP Theorem
    slug: cap-theorem
  - label: Linearizability
    slug: linearizability
  - label: PACELC
    slug: pacelc
  - label: Quorum
    slug: quorum
  - label: Leader Election
    slug: leader-election
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Consistent Prefix
    slug: consistent-prefix
  - label: Replication
    slug: replication
  - label: Replication Lag
    slug: replication-lag
  - label: Failover
    slug: failover
references:
  - title: Consistency levels in Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/consistency-levels
  - title: Relational vs. NoSQL data
    url: https://learn.microsoft.com/en-us/dotnet/architecture/cloud-native/relational-vs-nosql-data
---

Strong consistency is the C in CAP, and the precise name for it is linearizability: every operation appears to take effect at a single instant between when it was issued and when it returned, so a read that starts after a write finished must see that write. The whole value of the property is that it lets you reason about a distributed store the way you reason about a variable. There is one current value; if you just set it, you will read it back; if somebody else set it a moment ago, you will read theirs and not the one before. Nothing about the number of replicas leaks into the code that uses it.

The second step of the scene is what that promise costs when the network breaks. The `link` is cut, `R1` keeps taking writes, and a read arriving at `R2` gets `wait` rather than a number. `R2` is not broken and its copy is not corrupt; it simply cannot confirm that what it holds is still the latest, and under this rule an answer it cannot vouch for is worse than no answer at all. Notice what does *not* happen: the system does not go down. The side that still has a quorum keeps answering normally throughout. That is what "chose consistency" actually looks like — a fraction of callers, on the wrong side of a cut, getting an error they are expected to retry.

The price you pay far more often is the other one, and the fourth step shows it: with no partition anywhere, a strongly consistent read still has to consult the other replicas before it speaks, and that agreement is a round trip. In the scene the meter reads `ms 150` for the read that consults and `ms 90` for the one that answers from the nearest copy. In a real system the same shape appears as a majority read against a quorum, a read routed to the leader instead of the closest follower, or a Cosmos DB request pinned to `Strong` instead of `Session`. There is no configuration that removes this cost, because the cost is the agreement, and the agreement is the property.

So the useful question is never "should this system be strongly consistent" but "which reads must be". A balance checked before a debit, a stock level checked before a reservation, a uniqueness check before an insert: those feed a decision that cannot be taken back, and they should pay. A profile page, a feed, a dashboard, a count of anything: those are read and forgotten, and paying for linearizability on them buys nothing a user can perceive. Most systems that feel slow and fragile at once are systems where that line was never drawn, and everything ended up on the expensive side of it by default.
