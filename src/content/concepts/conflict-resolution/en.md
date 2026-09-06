---
title: "Conflict Resolution"
summary: "Conflict resolution is what a system does with two writes that were both accepted and disagree. Convergence is not a property replicas have; it is a rule somebody chose, and every rule either discards a write or asks the domain what the combination means."
category: "Data distribution and consistency"
tags: ["consistency"]
level: 8
scene: cap-theorem
sceneStep: 3
related:
  - label: CAP Theorem
    slug: cap-theorem
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Consistent Prefix
    slug: consistent-prefix
  - label: Strong Consistency
    slug: strong-consistency
  - label: Replication
    slug: replication
references:
  - title: Consistency levels in Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/consistency-levels
  - title: Manage conflicts between regions in Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/how-to-manage-conflicts
---

The scene's third step keeps both sides answering under the cut and ends with a single line: when the network heals, they converge. This page is that line taken apart. If only one side took writes, healing is replay and nothing is in question. If both took writes to the same item, healing arrives at a moment where two values exist, both were accepted, both were acknowledged to a caller who has gone away, and the system must produce one. Nothing in the network decides that. Consistent prefix governs what an observer is allowed to see and in what order; this page is about what the stored value becomes.

The default is last-write-wins, and the parent page already says the honest thing about it: two edits, one clock, one survivor, no error anywhere. It is the default for good reasons. It needs one extra field, it terminates without asking anybody anything, it gives the same answer on every replica, and for values that are genuinely a snapshot of an independent fact — a device's last reported temperature, a cached rendering — losing the loser costs nothing. What it is not is resolution. It is a rule for choosing which write to throw away, and the throwing away is silent: the client that lost was told its write succeeded, and no log line anywhere says otherwise. Worse, "last" is usually decided by a wall clock on the machine that took the write, so a region whose clock runs two seconds fast wins every close race, and clock skew quietly becomes business logic. Using it is defensible. Using it without writing down which writes you are willing to lose is not.

The alternative starts by refusing to guess at ordering. A version vector gives each replica a counter and stamps every write with what the writer had seen, so comparing two versions answers a question a timestamp cannot: were these sequential, or concurrent? Sequential means one write knew about the other and simply supersedes it, with no conflict to resolve. Concurrent means neither saw the other, and that is the only case that needs a decision. Detection is worth having on its own, because the count of genuine conflicts is usually far smaller than people fear and far larger than zero, and you cannot reason about a number nobody measures. Once a pair is known to be concurrent, the system either keeps both as siblings and hands them to the next reader, or runs a merge function that folds them into one. Conflict-free replicated data types are the special case where the merge is built into the type — sets, counters and registers designed so that any order of merging reaches the same result — which removes the decision for the shapes they cover and does not cover the shapes they do not.

Which leaves the part that no storage setting can supply: what the merge should be. Two writes to a shopping cart are almost never a conflict — the union of the items is the answer a customer expects, and discarding one loses a real intention. Two writes to a seat reservation cannot be merged at all, and the right resolution is to keep one and compensate the other with a refund and an apology. Two writes to a document belong at field granularity, where a change of title and a change of body combine cleanly and two changes of title do not. Those are product decisions about meaning, made by people who know what the data is for, and they belong in code you can read and test rather than in a store's configuration page. Cosmos DB makes this concrete for accounts with multi-region writes, which is where a conflict can arise in the first place: the default is last-write-wins on the item's own `_ts` timestamp, or on a numeric property you nominate, the alternative is a custom merge stored procedure, and unresolved cases are parked in a conflicts feed so nothing is lost while a human decides. The cheapest resolution policy remains the one that avoids the question: route every write for a given key through one place, and the divergence the rest of this page is about never happens.
