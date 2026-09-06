---
title: "Consumer Group"
summary: "A consumer group is Kafka's form of competing consumers, with the partition rather than the message as the unit that is competed for: each partition is assigned to exactly one member, so order survives per key and parallelism stops at the partition count."
category: "Messaging and event processing"
tags: ["queue"]
level: 6
scene: competing-consumers
sceneStep: 4
related:
  - label: Competing Consumers
    slug: competing-consumers
  - label: Partition
    slug: partition
  - label: Message Key
    slug: message-key
  - label: Consumer Acknowledgement
    slug: consumer-acknowledgement
  - label: Idempotent Consumer
    slug: idempotent-consumer
  - label: At-Least-Once
    slug: at-least-once
  - label: Work Queue
    slug: work-queue
references:
  - title: Kafka consumer group protocol
    url: https://kafka.apache.org/documentation/#consumer_rebalance_protocol
  - title: Confluent consumer group basics
    url: https://developer.confluent.io/courses/architecture/consumer-group-protocol/
  - title: Competing Consumers pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/competing-consumers
---

A Kafka topic is a set of partitions decided when the topic is created, and a consumer group is a set of processes that share the same `group.id` and between them read all of them. The broker assigns each partition to exactly one member of the group, so a message is handled once per group in the same way a queue message is handled once, but the thing handed out is a partition rather than a message. Two consequences follow immediately. Messages with the same key are in the same partition and therefore go to the same member in order, which is the per-key ordering competing consumers otherwise give up. And a group can never have more useful members than the topic has partitions: the eleventh member of a group reading ten partitions gets nothing and waits.

Assignments are not permanent. When a member joins, leaves, or stops sending heartbeats, the group rebalances and the partitions are handed out again, and whoever inherits a partition resumes from the last committed offset for that group. That offset is the acknowledgement in this design, so committing before the work is done loses messages and committing after it is done replays them: at-least-once, arrived at by a different route. A rebalance is also a pause, and the settings that decide how disruptive it is are worth knowing: `max.poll.interval.ms` is how long a member may spend inside one batch before the group decides it is gone, static membership keeps a restarting pod's assignment instead of shuffling everyone, and a cooperative assignor moves only the partitions that have to move. That last one belongs to the classic protocol: Kafka 4.0's new consumer group protocol, selected with `group.protocol=consumer`, computes the assignment on the broker and rebalances incrementally by default, so the assignor stops being a client setting while static membership stays.

What the group buys you is decided almost entirely by the key. The key chooses the partition, the partition chooses the member, and so the key chooses both the ordering guarantee and the balance of load: one busy customer on a topic keyed by customer id is one hot partition and one saturated consumer while the rest idle. Partitions can be added but not removed, and adding them re-maps existing keys, so the count is close to a permanent decision and is usually set higher than the traffic needs. Groups are also independent of each other: a second group on the same topic reads every message again from its own offsets, which is how one event stream feeds several services without any of them competing with the others.
