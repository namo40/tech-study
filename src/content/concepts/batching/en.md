---
title: "Batching"
summary: "Collecting several items and handling them in one trip. It buys throughput with latency, so the batch needs a size cap and a delay cap — and it is the fix a queue can never be."
category: "Resilience"
tags: ["queue"]
scene: backpressure
sceneStep: 4
related:
  - label: Backpressure
    slug: backpressure
  - label: Queue-Based Load Leveling
    slug: queue-based-load-leveling
  - label: Bounded Concurrency
    slug: bounded-concurrency
  - label: Work Queue
    slug: work-queue
  - label: Competing Consumers
    slug: competing-consumers
  - label: Web-Queue-Worker
    slug: web-queue-worker
  - label: Thread Pool
    slug: thread-pool
  - label: Rate Limiter
    slug: rate-limiter
  - label: Bulkhead
    slug: bulkhead
  - label: Spike Test
    slug: spike-test
references:
  - title: "System.Threading.Channels"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/channels
  - title: "Queue-Based Load Leveling pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/queue-based-load-leveling
  - title: "BoundedChannelOptions class"
    url: https://learn.microsoft.com/en-us/dotnet/api/system.threading.channels.boundedchanneloptions
---

The fourth step of the scene is the only move that changes the arithmetic. The consumer starts taking four at a time, the drain rate doubles, the same spike arrives, and the depth barely lifts off the floor. Nothing else about the system changed: the producer offers exactly what it offered before, the buffer is the same eight cells, and the earlier steps replay identically. What is different is that the side that was slower is no longer as slow, and every problem in the previous three steps was a restatement of that one fact.

The reason batching wins is that most per-item cost is not per item at all. A round trip has a fixed price — a network hop, a TLS record, a command parse, a transaction begin and commit, a lock taken and released, a log line written — and that price is paid once whether the payload holds one row or five hundred. Sending five hundred rows in one `SqlBulkCopy`, or one `SendMessagesAsync`, or one bulk index request, moves the fixed cost from five hundred payments to one. The per-item work is still there and still real; the overhead is what collapses, and in most systems the overhead was the majority.

The price is latency, and it is paid by the earliest item in the batch. An item that arrives when the batch is empty waits for the batch to fill, which is why a batch needs two limits and not one: a maximum size and a maximum delay, whichever comes first. Without the delay cap, a quiet period turns into a stall — three items arrive, the fourth never does, and the three sit there until traffic picks up, which is exactly when nobody is watching. With it, a slow minute costs each item the window and no more, and the window is a number you can put next to your latency budget and defend.

Batch size is not free above a point either. Bigger batches mean more memory held, longer transactions, longer locks, bigger retries and coarser failure: when one item in a batch of five hundred is malformed, something has to decide whether all five hundred fail, whether the batch is bisected, or whether the bad one is quarantined. Decide that before the first bad row rather than during, because the tempting answer — retry the whole batch — is how a single poison message becomes an infinite loop that also takes four hundred and ninety-nine innocent items down with it every time round.

Batching also interacts with idempotency, because a partially applied batch is the normal case rather than an edge case. A process that dies halfway through committing four hundred items has to be safe to run again, which means the items need keys and the sink needs to tolerate a repeat. This is the same requirement any at-least-once pipeline has, but batching makes it louder: the window between "some of this is durable" and "all of this is durable" is now four hundred items wide instead of one.

The reason the scene puts this step last is that it is the honest fix and the other one is not. Faced with a queue that keeps filling, the tempting change is to make the queue bigger, and it works — the badge stops lighting, the alerts stop firing, and nothing else improves. The wait gets longer, the memory gets larger, and the moment of truth is postponed rather than avoided. Batching, more consumers, a faster consumer: those change the rate, and the rate is the only thing that was ever wrong. A bigger queue is just a longer lie.
