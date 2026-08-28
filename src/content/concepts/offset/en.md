---
title: "Offset"
summary: "A bookmark in a shared log: the position one subscription has read up to. It belongs to the reader, not to the log, which is why two readers can be at two different places in the same events and neither one holds the other up."
category: "Messaging and event processing"
tags: ["queue"]
scene: publish-subscribe
sceneStep: 2
related:
  - label: Publish/Subscribe
    slug: publish-subscribe
  - label: Checkpoint
    slug: checkpoint
  - label: Event Stream
    slug: event-stream
  - label: Ordering
    slug: ordering
  - label: Event Replay
    slug: event-replay
  - label: Competing Consumers
    slug: competing-consumers
  - label: Work Queue
    slug: work-queue
  - label: Event Sourcing
    slug: event-sourcing
  - label: At-Least-Once
    slug: at-least-once
  - label: Dead Letter Queue
    slug: dead-letter-queue
references:
  - title: Features and terminology in Azure Event Hubs
    url: https://learn.microsoft.com/en-us/azure/event-hubs/event-hubs-features
  - title: EventPosition (Event Hubs)
    url: https://learn.microsoft.com/en-us/dotnet/api/azure.messaging.eventhubs.consumer.eventposition
  - title: Scaling with Event Hubs
    url: https://learn.microsoft.com/en-us/azure/event-hubs/event-hubs-scalability
---

An offset is a bookmark, and the scene's second step is about who owns it. The log holds eight events and hands none of them away; what changes when a subscription reads is not the log, it is the number under that subscription's name and the bar sitting under one of the cells. A stays level with the newest event, B falls two behind, and the two bookmarks are in the same log at different places at the same time. That is only possible because a delivery takes nothing out.

This is the line between a topic and a queue, and it is worth being precise about it. In a work queue the broker holds the state: a message is locked while somebody works on it and removed when they acknowledge it, so the queue's contents are a function of what the consumers have done. In a log the broker holds only the events, and each consumer holds its own position. Nothing about B's position appears in the log, and nothing about A's position appears in B's, so the interesting failure of queues — one slow consumer making everyone else wait behind a lock — has no place to happen. The cost is that the broker can no longer tell you what is left to do; you find that out by subtracting an offset from the head, which is the number worth alerting on.

An offset also decides what "start" means. A subscription with no stored position has to be told one, and the choice is not a default worth taking blind: `EventPosition.Earliest` replays everything the retention window still holds, `EventPosition.Latest` takes only what arrives from now on, and there is also a position derived from a sequence number or an enqueue time when you want to reprocess a specific window. On Kafka the same decision wears the name `auto.offset.reset`. Getting it wrong is not subtle in either direction: `Earliest` on a service that is not ready to reprocess history floods it, and `Latest` on a new projection quietly leaves a hole where the past should have been.

Two properties are what make the bookmark useful rather than merely descriptive. It only moves forward, so a delivery is always the next event and never a jump, and a reader that has moved past something has moved past it for good unless somebody deliberately rewinds. And it is cheap to move, because moving it is arithmetic rather than a message to the broker. What is not cheap is making it survive a restart, and that is a different thing with a different name: a checkpoint is an offset that has been written down somewhere durable. In the scene the two are drawn apart on purpose, because B's offset is in B's memory and its checkpoint is not, and the difference is exactly what the third step is about.
