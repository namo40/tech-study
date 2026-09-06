---
title: "Event Replay"
summary: "Playing stored events through a fold, in order, to arrive at a state. It is how an aggregate rebuilds itself after a restart, how a read model is regenerated from scratch, and how you look at what something used to be."
category: "Application architecture"
level: 7
scene: event-sourcing
sceneStep: 2
related:
  - label: Event Sourcing
    slug: event-sourcing
  - label: Snapshot
    slug: snapshot
  - label: Aggregate
    slug: aggregate
  - label: Projection
    slug: projection
  - label: Read Model
    slug: read-model
  - label: Materialized View
    slug: materialized-view
  - label: CQRS
    slug: command-query-responsibility-segregation
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Idempotent Consumer
    slug: idempotent-consumer
  - label: Change Data Capture
    slug: change-data-capture
references:
  - title: "Event Sourcing pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing
  - title: "How to serialize and deserialize JSON in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/how-to
  - title: "CQRS pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs
---

The second step of the scene wipes the aggregate on purpose. `items` drops to zero, the `paid` badge goes out, and for a moment the Order knows nothing at all. Then the reads start coming back across from the log, one event at a time, and the same state grows back in the same order it grew the first time. Nothing was recovered, because nothing was lost: the state was never the record, so deleting it destroyed no information.

That is the whole idea, and it is smaller than it sounds. A replay is `events.Aggregate(seed, Apply)` — a fold, in the functional sense, over an ordered list. The interesting engineering is not in the loop, it is in the two properties the loop needs. The events have to be totally ordered within a stream, which is what the sequence number is for. And `Apply` has to be a pure function of state and event, which is what makes the fold repeatable: the same events in the same order must always give the same answer, whatever time it is, whatever else is running, however many times you have done it before.

The second property is the one that gets broken, and it always gets broken the same way. Somebody puts a side effect in `Apply` — an email, a webhook, a call to a payment provider, a `DateTime.UtcNow` that ends up stored — and the first full rebuild in production sends four thousand confirmation emails for orders placed last year. The rule is absolute and worth writing on the wall: applying an event changes memory and nothing else. Reacting to an event, which is where the emails belong, happens in a subscriber that only ever sees new events and knows its own position in the stream. A replay walks the first kind and never triggers the second.

Stop the fold early and you have time travel, which the scene shows by replaying only as far as `seq 2` and holding the state it reaches. This is not a feature anybody had to build; it is what the log already contains. "What did this order look like before the payment" is a fold over a prefix, and "who changed it and when" is the metadata on the events in between. Systems that store current state answer these questions with a lot of trigger-written history tables that nobody trusts; a log answers them by doing less work than usual.

Replay is also how you fix a read model. Because a projection is a fold too, a bug in it is repaired by deleting its table, resetting its stored position to zero, and letting it run through the log again — no migration, no backfill script, no reasoning about which rows are wrong. That is the property that makes event sourcing worth its cost in systems with many views: derived data becomes disposable, and disposable data cannot rot. It is also the reason to keep a projection's position in the same transaction as the rows it writes, so a subscriber that dies mid-batch resumes without either skipping or double-applying.

What it costs is time, and time grows with the log. A stream with fifty events replays instantly; one with two hundred thousand does not, and an aggregate that must be rehydrated on every command will feel it. That is the pressure snapshots exist to relieve, and it is worth being precise about what they change: a snapshot shortens the replay, it does not remove the need for one. The fold is still the definition of the state, and a rebuild that starts from a snapshot is the same loop with a different seed.
