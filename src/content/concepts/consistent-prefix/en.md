---
title: "Consistent Prefix"
summary: "Consistent prefix guarantees that a reader sees writes in the order they happened, with nothing skipped and nothing reordered, while saying nothing about how far behind that view is. It is the guarantee that makes a stale answer coherent rather than merely old."
category: "Data distribution and consistency"
tags: ["consistency"]
scene: cap-theorem
sceneStep: 3
related:
  - label: CAP Theorem
    slug: cap-theorem
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Strong Consistency
    slug: strong-consistency
  - label: Bounded Staleness
    slug: bounded-staleness
  - label: Session Consistency
    slug: session-consistency
  - label: Replication Lag
    slug: replication-lag
references:
  - title: Consistency levels in Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/consistency-levels
---

The scene's third step chooses availability and hears yesterday's answer, and the interesting question is why yesterday's answer is usually survivable. Consistent prefix is the reason. It promises that whatever a reader observes is a prefix of the true order of writes: the beginning of the story, complete and in sequence, ending at some point short of the present. If the writer produced values one, two and three, a reader may see one, or one and two, or all three, but never one and three, and never three before one. Freshness is not promised at all. Order is, and order turns out to be the property that most application logic was quietly depending on.

The value shows most clearly in what its absence looks like. Without the guarantee, a reader can observe a later write and then a gap where an earlier one is still missing, which breaks causality in ways that read as bugs rather than as staleness. An answer appears in a thread whose question has not arrived. A shipment notification names an order the reader has never seen created. A counter that only ever increases is observed going down, and code that reasonably assumed monotonicity now behaves in ways nobody has a mental model for. A stale but coherent view produces none of these. A user looking at last minute's data sees a world that was true a minute ago and is internally consistent; a user looking at a reordered view sees a world that was never true at any moment.

On the ladder of consistency levels that a store like Cosmos DB exposes, consistent prefix sits directly above eventual consistency and below the levels that add promises about recency. Eventual consistency alone allows the reordering just described and only says the replicas converge in the end. Consistent prefix adds the ordering constraint without adding any bound on lag, and each stronger level implies it: bounded staleness keeps the prefix and puts a ceiling on how far behind the reader may be, session consistency keeps the prefix and guarantees that a client at least sees its own writes, and strong consistency leaves no gap to talk about. Choosing this level is therefore a statement that ordering is what the application needs and that arbitrary lag is acceptable, which is a much more common combination than it sounds. Read the vendor's own definition before relying on it, though: Cosmos DB's level of that name is narrower than the general guarantee, because updates made as single-document writes see eventual consistency there and the prefix promise covers the writes of one transactional batch.

The mechanism behind it explains both its cheapness and its main surprise. A replica applies the leader's log in order and never skips ahead, so what it holds is by construction a prefix of that log, and serving from it costs no coordination whatsoever. But the log is per partition, and so is the guarantee. Two writes to the same partition are ordered for every reader; two writes to different partitions have no shared order to preserve, and a reader can observe the later one first no matter which level is configured. That is why data whose order matters, such as the events of one aggregate or one conversation, belongs on one partition key, and why cross-partition ordering has to be reconstructed by the application from sequence numbers or timestamps it wrote itself. It is also why the guarantee should be named in a design rather than assumed: the difference between old and incoherent is not visible in a screenshot, only in the incident that follows.
