---
title: "Checkpoint"
summary: "An offset written down somewhere durable, so a restart knows where to land. It is what turns a crash into lost time instead of lost work, and how often you write it is a straight trade between storage round trips and how much gets reprocessed."
category: "Messaging and event processing"
tags: ["queue"]
scene: publish-subscribe
sceneStep: 3
related:
  - label: Publish/Subscribe
    slug: publish-subscribe
  - label: Offset
    slug: offset
  - label: Event Stream
    slug: event-stream
  - label: At-Least-Once
    slug: at-least-once
  - label: Event Replay
    slug: event-replay
  - label: Ordering
    slug: ordering
  - label: Competing Consumers
    slug: competing-consumers
  - label: Work Queue
    slug: work-queue
  - label: Event Sourcing
    slug: event-sourcing
  - label: Dead Letter Queue
    slug: dead-letter-queue
references:
  - title: Balance partition load across multiple instances
    url: https://learn.microsoft.com/en-us/azure/event-hubs/event-processor-balance-partition-load
  - title: EventProcessorClient
    url: https://learn.microsoft.com/en-us/dotnet/api/azure.messaging.eventhubs.eventprocessorclient
  - title: EventPosition (Event Hubs)
    url: https://learn.microsoft.com/en-us/dotnet/api/azure.messaging.eventhubs.consumer.eventposition
---

The third step of the scene is the whole argument in one move. B writes `checkpoint 5`, dies, and misses two events. Those events do not vanish and they were never inside B: they are in the log, where they would have been anyway. When B comes back it does not ask anybody what it missed and it does not start over. It reads its own checkpoint, sets its position to 5, and drains 6, 7 and 8. What the crash cost is the time it was down.

That is why a checkpoint is a different thing from an offset even though it holds the same number. An offset lives in the process and disappears with it. A checkpoint lives in storage the process does not own, and it is the only thing a restart is allowed to believe. On Event Hubs it is a blob written by `UpdateCheckpointAsync`; on Kafka it is a committed offset in an internal topic; in a hand-rolled consumer it is a row in your own database. In all three cases the same rule holds: if the position after a restart came from anywhere else, you have not built a checkpoint, you have built a guess.

The ordering is the part that is easy to get backwards. Do the work, make its effects durable, and only then write the checkpoint. Checkpoint first and a crash in the gap loses the work outright, because the position now says an event was handled that was not. Checkpoint last and the same crash reprocesses events that were already handled, which is a duplicate rather than a hole. That asymmetry is what "at-least-once" means in practice, and it is a choice you are making whether you look at it or not, so make the handler safe to run twice: key the work on the event id, or write it in a way where doing it again lands on the same result.

How often to write is the other half, and it is arithmetic rather than taste. Every checkpoint is a round trip to storage, so per-event checkpointing turns a stream into a write-heavy workload and caps throughput at the storage layer. Every checkpoint you skip is an event that will be delivered again after a crash. Pick the interval from the second number: a checkpoint every 100 events, or every few seconds, says that a restart may reprocess up to that much. Then check the shape of the work before settling on it, because 100 cheap projections and 100 outbound emails are not the same bet. And watch the checkpoint itself, not only the handler: a consumer whose position stops moving while the log keeps growing is failing quietly, and lag is the only reading that shows it.
