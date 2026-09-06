---
title: "Hot Partition"
summary: "One shard taking most of the traffic while its neighbours idle: the key distribution, not the cluster size, sets the ceiling — and when the key is also the thing guaranteeing order, no number of consumers can be added to the lane that is behind."
category: "Messaging and event processing"
tags: ["queue", "overload"]
level: 7
scene: ordering
sceneStep: 3
related:
  - label: Ordering
    slug: ordering
  - label: Event Stream
    slug: event-stream
  - label: Sharding
    slug: sharding
  - label: Consistent Hashing
    slug: consistent-hashing
  - label: Competing Consumers
    slug: competing-consumers
  - label: Publish/Subscribe
    slug: publish-subscribe
  - label: Offset
    slug: offset
  - label: Backpressure
    slug: backpressure
  - label: Dead Letter Queue
    slug: dead-letter-queue
  - label: Load Balancer
    slug: load-balancer
references:
  - title: Scaling with Event Hubs
    url: https://learn.microsoft.com/en-us/azure/event-hubs/event-hubs-scalability
  - title: Partitioning and horizontal scaling in Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/partitioning
  - title: Sharding pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/sharding
---

A hot partition is what a skewed key distribution looks like from the inside, and the scene's third step is the whole of it: six `acct 7` events arrive inside a second, P0's backlog climbs past the gauge's last level, and P1 sits with an empty row the entire time. Nothing is broken. The routing rule is doing exactly what it was asked to do, the consumers are running at the same speed they ran at in the second step, and the system is still only half busy. The bottleneck is not capacity, it is the shape of the traffic.

What makes this different from ordinary overload is that the usual remedy does not apply. Adding consumers is how you drain a queue, but a partition is owned by one consumer at a time — that ownership *is* the order guarantee — so a second consumer on P0 either does nothing or breaks the property you partitioned for. Adding partitions does not help either while the key stays the same, because the hash of one key resolves to one lane no matter how many lanes there are. The scene shows both facts at once: P1 is available, and it is unusable, because the promise pins `acct 7` to P0.

The cause is almost always a key with a long tail. Tenant id when one tenant is ten times the others, region when one region is the home market, device type when most devices are one model, and the classic case: a naturally skewed entity — the celebrity account, the flagship product, the one warehouse everything ships from. A uniform hash does not fix a non-uniform key; hashing spreads *keys* evenly across partitions, and does nothing whatever about one key carrying most of the events.

So the fix is upstream of the infrastructure, in what the key is. If the ordering requirement is per-account, the key is the account and a busy account is a busy lane you must plan for. If the requirement is weaker than you assumed — most events on a stream do not actually need mutual order — narrow the key until the traffic spreads, which is the scene's fourth step. If it is genuinely per-account and one account is genuinely too big, the remaining moves are a compound key that splits the hot one into sub-lanes and re-serializes downstream, or accepting a lower ceiling for that key and isolating it so its backlog is not everyone else's latency. What none of these is, is a slider. Watch skew as a first-class metric — per-partition lag and per-partition throughput, not the aggregate — because the average hides exactly the failure this page is about.
