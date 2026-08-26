---
title: "Projection"
summary: "A projection is the code that keeps a read model up to date from the write side, one change at a time. It runs behind the write, which is where the lag comes from, and it has to be replayable from nothing."
category: "Application architecture"
tags: ["consistency"]
scene: command-query-responsibility-segregation
sceneStep: 3
related:
  - label: CQRS
    slug: command-query-responsibility-segregation
  - label: Read Model
    slug: read-model
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Transactional Outbox
    slug: transactional-outbox
  - label: Change Data Capture
    slug: change-data-capture
  - label: Event Sourcing
    slug: event-sourcing
  - label: Replication Lag
    slug: replication-lag
  - label: BackgroundService
    slug: background-service
references:
  - title: CQRS pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs
  - title: Transactional Outbox pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/transactional-outbox
  - title: Worker services in .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/workers
---

A projection reads what the write side has done and writes the read model that answers questions about it. Its input is a stream of changes, in order: rows from an outbox table written in the same transaction as the business data, a change feed from the database itself, or an event stream when the write side is event sourced. Its output is an update to one row of one read model. Nothing else writes to that read model, which is what makes it safe to delete.

The gap between the write landing and the projection catching up is the lag, and it is the number to instrument. Publish the age of the change that was just applied, alert on it, and design the screen around what it can be: after a write, show the result the command already returned rather than going back to the query side for it, or poll until the version you wrote appears. A projection running behind is normal. A projection whose lag climbs and never comes back down is a projector that has stopped, or one that cannot keep up with the write rate, and only the metric tells you which.

Two properties keep a projection maintainable. It must be safe to apply the same change twice, because delivery is at least once and a replay repeats everything: key each update on the row and the version it is moving to, so a repeat is a call that changes nothing rather than one that counts a total twice. And it must be replayable from empty, because that is what makes the read model's shape a thing you can change: truncate the table, run the projector from the first change, and the new shape fills in. Give the projector a command that does exactly that, and test it, because the day you need it is the day the shape is already wrong in production.
