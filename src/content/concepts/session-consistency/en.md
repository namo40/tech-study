---
title: "Session Consistency"
summary: "Session consistency is the guarantee that one session sees a single, self-consistent view of the data: its own writes, and never a value older than one it has already been shown. It is the level most applications actually want, and the cheapest one that fixes the bug users report."
category: "Data distribution and consistency"
tags: ["consistency"]
scene: eventual-consistency
sceneStep: 3
related:
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Read-Your-Writes
    slug: read-your-writes
  - label: Bounded Staleness
    slug: bounded-staleness
  - label: Replication Lag
    slug: replication-lag
  - label: Read Replica
    slug: read-replica
  - label: Sticky Session
    slug: sticky-session
  - label: Distributed Session
    slug: distributed-session
references:
  - title: Consistency levels in Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/consistency-levels
  - title: Manage consistency levels in Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/nosql/how-to-manage-consistency
---

Eventual consistency makes one promise about the whole system and none about any particular reader, which is why its first visible failure is so personal: a user saves something, the page reloads from a replica that has not applied the change yet, and their own edit is missing. Session consistency scopes the promise to a single client instead. Inside that session, reads see every write the session has made, and never move backwards to a value the session has already been shown past. Outside it, other people's changes may still be missing, which is the whole reason it stays cheap.

Two mechanisms give it to you, and they differ in what they spend. The first is pinning: remember which copy this session wrote to, and send its reads there for as long as it matters. It is easy with a cookie or an entry in a distributed cache, it costs that copy a share of read traffic it was meant to be spared, and it fails quietly if the copy is taken out of rotation and the session is silently moved somewhere further behind. The second is a token: the write hands back a marker of the position it was given, the client carries that marker on later requests, and a read is only answered by a copy that has reached it. Nothing extra lands on the primary, the cost moves into the read's latency, and the marker has to survive every hop between the write and the read.

That last point is what decides whether it holds in practice. A session token kept in a static field, a per-process cache, or a variable on one server is not a session token: the next request goes to another instance, arrives without it, and the guarantee is gone precisely when traffic is high enough to spread requests around. It belongs in a cookie, a claim, or a header, and it has to be threaded through background work that acts on the user's behalf, or the job reads a state the user has already moved past.

Azure Cosmos DB implements exactly this as its default consistency level, and it is worth reading as the reference design: every response carries a session token, the SDK reuses it inside one client instance, and any client that needs the same guarantee across instances has to pass the token itself. Relational setups get the same effect by keeping the position a write was given and comparing it against the replica's position before routing a read, falling back to the primary when the replica is still behind. Either way the shape is the same, and so is the failure: forget to carry the token, and you are back to eventual consistency without noticing.
