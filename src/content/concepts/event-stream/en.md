---
title: "Event Stream"
summary: "A partitioned log that events keep being appended to: each partition is an ordered sequence nothing is ever taken out of, so a stream is not a queue that empties but a history that grows — and the partition is where per-key order physically lives."
category: "Messaging and event processing"
tags: ["queue"]
level: 6
scene: ordering
sceneStep: 2
related:
  - label: Ordering
    slug: ordering
  - label: Hot Partition
    slug: hot-partition
  - label: Offset
    slug: offset
  - label: Publish/Subscribe
    slug: publish-subscribe
  - label: Event Sourcing
    slug: event-sourcing
  - label: Event Replay
    slug: event-replay
  - label: Competing Consumers
    slug: competing-consumers
  - label: Sharding
    slug: sharding
  - label: Consistent Hashing
    slug: consistent-hashing
  - label: At-Least-Once
    slug: at-least-once
references:
  - title: Features and terminology in Azure Event Hubs
    url: https://learn.microsoft.com/en-us/azure/event-hubs/event-hubs-features
  - title: What is Azure Event Hubs
    url: https://learn.microsoft.com/en-us/azure/event-hubs/event-hubs-about
  - title: Scaling with Event Hubs
    url: https://learn.microsoft.com/en-us/azure/event-hubs/event-hubs-scalability
---

An event stream is a log that is appended to and never taken from, and the scene's second step is drawn to make that physical rather than conceptual. When an `acct 7` event reaches P0 it becomes a cell on the right-hand end of P0's row, and it stays there after a consumer has processed it. Nothing about consuming an event changes the row; what changes is which cells the consumer has been past. That is the difference from a queue, where a message is a unit of work the broker holds until somebody takes it away, and it is why two consumers can read the same stream without one of them getting less.

The partition is the unit that actually carries the order. A stream is not one sequence, it is several: P0's row is ordered with respect to itself and P1's row is ordered with respect to itself, and there is no statement at all about a cell in one row and a cell in the other. Watch the second step and neither row ever waits for the other — they are two sequences that happen to arrive through one producer. This is why "is the stream ordered" is not a question with an answer. Ordered within a partition, yes, by construction. Ordered across partitions, no, and no configuration changes that.

What puts an event in a partition is the key, and that makes the key the most consequential field on the message. A partition key is hashed, so the same key always resolves to the same partition and its events append to one row in the order the broker accepted them. An event sent with no key is spread instead: Event Hubs assigns it round-robin, and a Kafka producer sticks to one partition per batch, which comes to the same thing over any useful number of events. Either way it is exactly the first step's picture: fast, evenly loaded, and carrying no promise about sequence. The decision between those two is made at send time, one property at a time, and the consumer has no way to recover the order the producer failed to ask for.

The append-only shape is also what makes a stream re-readable. Because nothing is removed on consumption, a consumer that wants to start over sets its position back and reads the same cells again, and a second consumer group reads them concurrently without either one noticing. The limit is retention rather than delivery: the log keeps a window, and what has aged out of that window is gone for every reader at once. So a stream gives you two things a queue does not — history you can replay and multiple independent readers — and asks in exchange that you decide how far back "history" goes, and that you accept order only inside the lane you chose.
