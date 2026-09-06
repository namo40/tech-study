---
title: "Partition"
summary: "The unit a log is divided into. Each partition is an independent append-only lane, which makes it the thing that carries order, the thing that sets the consumer parallelism ceiling, and a number that is hard to change afterwards."
category: "Messaging and event processing"
tags: ["queue"]
level: 6
scene: ordering
sceneStep: 2
related:
  - label: Ordering
    slug: ordering
  - label: Event Stream
    slug: event-stream
  - label: Message Key
    slug: message-key
  - label: Consumer Group
    slug: consumer-group
  - label: Hot Partition
    slug: hot-partition
  - label: Sharding
    slug: sharding
references:
  - title: Features and terminology in Azure Event Hubs
    url: https://learn.microsoft.com/en-us/azure/event-hubs/event-hubs-features
---

In the scene's second step the lanes that keep each account's events in sequence have a name, and the name is the partition. A partition is the unit a topic is divided into: an append-only sequence with its own end, its own position numbers and, on the reading side, its own reader. A topic is not one thing that happens to be stored in pieces, it is however many of these lanes you asked for, and almost every property people attribute to a topic is really a property of a partition. Order is the first of them. Events appended to one lane keep the order they were appended in, and between two lanes there is no statement at all, which is why the guarantee is per key rather than global.

The second property is the one that decides how fast you can consume, and it is the reason the partition count is a capacity number rather than a storage detail. Within a consumer group, a partition is assigned to exactly one consumer at a time, because that assignment is what keeps the lane's order intact on the reading side. The arithmetic that falls out is blunt: eight partitions can be worked by at most eight consumers, and a ninth instance holds no assignment and does nothing but wait for a rebalance. Adding machines past that point raises the bill and not the throughput. So the count is the ceiling on parallelism for every consumer group that will ever read the topic, and it should be chosen against the peak concurrency you expect to need rather than against today's traffic.

Choosing generously is the usual advice because the count is expensive to change later. A key finds its lane by a hash reduced modulo the count, which makes the count part of the mapping rather than a setting beside it. Grow the number and keys start landing somewhere new: what a key wrote before the change stays where it was while what it writes afterwards goes elsewhere, and anything already on its way during the switch can be picked up in the wrong sequence. Brokers therefore let you add partitions and never remove them, and not all of them even let you add: Kafka grows a topic's count, Event Hubs grows one only on the premium and dedicated tiers, and on the standard tier the count is fixed when the event hub is created. Either way a re-partition is planned as a migration rather than applied as a configuration change. Generosity has its own limits, since each partition costs file handles, broker memory, replication traffic and a slot of per-consumer bookkeeping, and thousands of them slow down failover and rebalancing. The other limit is that even lanes are not even traffic: keys are hashed, not balanced, so one popular key still concentrates on one lane and no count fixes that. Dividing storage by key rather than a log is the same idea under the name sharding, with the same irreversibility in the split.

Practically, that makes three numbers worth writing down before a topic is created. Partitions should be at least the number of consumer instances you expect at peak, with room for growth, because that is the number you cannot exceed. Distinct keys should be far larger than the partition count, so the hash has enough material to spread; a key space of five values across twelve partitions leaves seven of them permanently empty. And a retention window has to be decided, because that, not consumption, is what eventually removes a cell from a lane. Which field to use as the key, and what it promises about order, is the decision that feeds all three.
