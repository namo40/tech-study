---
title: "Message Key"
summary: "A message key is the value that says which sequence a message belongs to: the broker hashes it onto a partition, so the same key always lands in the same place and is handled in order. Choosing it is one decision that fixes both the unit of ordering and the distribution of load."
category: "Messaging and event processing"
tags: ["queue"]
scene: competing-consumers
sceneStep: 4
related:
  - label: Competing Consumers
    slug: competing-consumers
  - label: Consumer Group
    slug: consumer-group
  - label: Ordering
    slug: ordering
  - label: Partition
    slug: partition
  - label: Hot Partition
    slug: hot-partition
  - label: Event Stream
    slug: event-stream
references:
  - title: "Event Hubs features and terminology"
    url: https://learn.microsoft.com/en-us/azure/event-hubs/event-hubs-features
  - title: "Competing Consumers pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/competing-consumers
---

The scene's fourth step gives up global order and partitions by a key instead, so that one consumer handles that key in sequence while the rest run in parallel. The message key is that value: a field carried alongside the payload which declares nothing except which sequence this message belongs to. An order id, a customer id, a device id. The broker hashes the key and maps the hash onto a partition, and every property people attribute to keys follows from that single mapping. Same key, same partition; same partition, same consumer; same consumer, one at a time in the order they arrived.

Choosing the key is therefore two decisions taken together, and they pull in opposite directions. It fixes the unit of ordering, because messages sharing a key are ordered relative to each other and relative to nothing else in the topic. It also fixes the distribution of load, because a key is confined to one partition and so to the throughput of one consumer. Key by customer and a single large customer becomes one saturated partition while its neighbours idle. Key by order id and the spread is even, while the ordering that actually mattered, the events of one order, is still intact. The rule that survives contact with production is to key by the smallest thing whose order you genuinely need, since every level of ordering above that is paid for in parallelism you cannot buy back later.

Two mechanical details decide whether that works. The mapping is a hash modulo the partition count, so it depends on the count: adding partitions re-maps existing keys, a key's history splits across the old partition and the new one, and messages in flight across the change can be handled out of order. That is why partition counts are set generously at the start, why they can usually be added but not removed, and why a re-partition is treated as a migration rather than a config change. The other detail is that the hash has to be identical for every producer. Kafka's default partitioner hashes the key's bytes with murmur2, and a second client library with a different default will write what looks like the same key into a different partition, which surfaces as ordering that breaks only for the traffic from one service. `Confluent.Kafka` is that second library for a .NET reader: librdkafka underneath defaults to `consistent_random`, a CRC32 hash, so a producer that has to agree with a Java one needs `ProducerConfig.Partitioner = Partitioner.Murmur2Random` set explicitly. Event Hubs presents the same idea under the name partition key.

A message with no key is not an omission; it is a statement that order does not matter for it, and the producer is then free to spread messages across partitions for throughput. Modern Kafka producers do that by sticking to one partition per batch rather than rotating on every message, but the effect is the one you want: even spread, full parallelism, no ordering promised. Two habits keep the rest out of trouble. A key is not an identifier, and many messages sharing one is the normal case rather than a bug, so nothing downstream should assume uniqueness. And on a compacted topic the key is the identity that compaction retains the newest value for, which is why such a topic rejects a record with no key outright rather than compacting it badly, and why an over-specific key is a way to keep everything forever. How a partition then reaches a particular process, and what happens when members come and go, belongs to the consumer group; the key is only the part you get to choose.
