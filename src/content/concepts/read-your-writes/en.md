---
title: "Read-Your-Writes"
summary: "Read-your-writes is the guarantee that a session always sees at least its own changes, whatever else it may miss. It is what makes a replica safe to read from after a user has just saved something."
category: "Data distribution and consistency"
tags: ["consistency"]
level: 6
scene: replication-lag
sceneStep: 3
related:
  - label: Replication Lag
    slug: replication-lag
  - label: Read Replica
    slug: read-replica
  - label: Session Consistency
    slug: session-consistency
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Sticky Session
    slug: sticky-session
  - label: Cache Invalidation
    slug: cache-invalidation
references:
  - title: Consistency levels in Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/consistency-levels
  - title: Distributed data in cloud-native applications
    url: https://learn.microsoft.com/en-us/dotnet/architecture/cloud-native/distributed-data
---

The bug report is always the same. A user edits their profile, saves it, lands back on the page, and sees the name they just replaced. Nothing failed: the write went to the primary and the reload went to a replica that had not applied it yet. Read-your-writes is the guarantee that removes this one case without pretending the copy is current. Other people's changes may still be missing from what this session sees; its own never are.

There are two ways to keep it, and they differ in what they spend. The first is to route: remember that this session wrote something, and send its reads to the primary for a few seconds afterwards. It is easy to implement with a cookie or an entry in a distributed cache, it costs the primary a little of the read traffic it was meant to be spared, and the window has to be longer than the lag or the guarantee quietly stops holding. The second is to wait: keep the position the write was given, and let the read go to the replica only once the replica has reached that position. Nothing extra lands on the primary, and the cost moves into the read's latency, which is why the wait needs a timeout and a fallback to the primary.

Which one fits depends on the endpoint. Routing is the right default for a page a user lands on straight after saving, because it is bounded, obvious, and easy to reason about. Waiting suits background work and API clients that can afford a few hundred milliseconds and cannot afford the primary. Some databases offer this directly: Azure Cosmos DB's session consistency level does exactly the second, keeping a session token per client, and other managed services expose the replica's position for you to compare against.

Two details decide whether it holds in practice. The session has to be identified across the write and the read, which is a cookie, a claim or a header rather than a variable on one server, or the second request lands somewhere that has never heard of the first. And the window has to be measured, not guessed: if the lag stretches past the few seconds you chose, the guarantee is gone precisely when the system is under the load that made you want replicas in the first place.
