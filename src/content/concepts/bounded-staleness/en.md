---
title: "Bounded Staleness"
summary: "Bounded staleness is eventual consistency with a number attached: reads may lag the primary, but never by more than an agreed amount of time or an agreed number of writes. It turns an open-ended window into a budget a router can act on."
category: "Data distribution and consistency"
tags: ["consistency"]
scene: eventual-consistency
sceneStep: 4
related:
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Session Consistency
    slug: session-consistency
  - label: Replication Lag
    slug: replication-lag
  - label: Read Replica
    slug: read-replica
  - label: Health-Based Routing
    slug: health-based-routing
  - label: TTL
    slug: ttl
  - label: Cache Invalidation
    slug: cache-invalidation
references:
  - title: Consistency levels in Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/consistency-levels
  - title: Distributed data in cloud-native applications
    url: https://learn.microsoft.com/en-us/dotnet/architecture/cloud-native/distributed-data
---

The trouble with eventual consistency is not that reads are stale, it is that nothing says how stale. Under a burst the window stretches with nothing to stop it, and a design that was fine at fifty milliseconds behind is suddenly answering with data from two seconds ago. Bounded staleness fixes the number: a read may be behind, by up to so many milliseconds or so many versions, and never more. Everything above that bound stops being a matter of luck and becomes something the system has to do something about.

That something is almost always routing. A replica inside the bound keeps answering reads; a replica outside it is taken out of rotation until it catches up, and its traffic goes to a copy that is still inside. This is the same shape as a health check, with lag as the signal instead of an HTTP status, and it has the same two failure modes. Set the bound too tight and every burst empties the rotation onto the primary, which is exactly the load replicas were bought to remove. Set it too loose and the bound is decorative: it is never breached, so it never protects anyone. It also needs hysteresis, or a replica that hovers around the line flaps in and out of rotation and each flip moves a batch of reads.

Choosing the number is a product decision written in engineering units. Ask what a reader would notice: a price list can be an hour behind without anyone caring, a shared document cannot be a second behind, and an inventory count sits somewhere between and depends on whether being wrong loses a sale or oversells the item. Then check the bound against the lag you actually observe, because a bound below your normal lag is not a guarantee, it is an outage waiting for a busy afternoon.

Azure Cosmos DB offers this directly as a consistency level, configured as both a number of versions K and a time T, with floors of ten writes or five seconds on a single-region account and 100,000 writes or 300 seconds on a multi-region one. It also enforces the bound from the opposite side to the routing above: staleness is only checked between regions, and a region whose lag on a partition passes K or T has its writes to that partition throttled until it catches up, so the writers pay rather than the readers. Elsewhere you assemble it on the read side: read the replica's position or its reported delay, compare it against the budget, and route accordingly, falling back to the primary when nothing qualifies. Caches are the same idea in disguise, since a time to live is a staleness bound with the routing left out, which is why a cached copy of a strong read is only ever as fresh as its expiry.
