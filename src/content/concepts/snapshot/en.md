---
title: "Snapshot"
summary: "A stored copy of the state as of one sequence number, kept so a rebuild can start there and replay only what came after. It is a cache over the log, never a second source of truth, and it can always be deleted and made again."
category: "Application architecture"
level: 6
scene: event-sourcing
sceneStep: 3
related:
  - label: Event Sourcing
    slug: event-sourcing
  - label: Event Replay
    slug: event-replay
  - label: Aggregate
    slug: aggregate
  - label: Materialized View
    slug: materialized-view
  - label: Projection
    slug: projection
  - label: Cache-Aside
    slug: cache-aside
  - label: Cache Invalidation
    slug: cache-invalidation
  - label: CQRS
    slug: command-query-responsibility-segregation
  - label: Row Version
    slug: row-version
  - label: Eventual Consistency
    slug: eventual-consistency
references:
  - title: "Event Sourcing pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing
  - title: "Creating and configuring a model in EF Core"
    url: https://learn.microsoft.com/en-us/ef/core/modeling/
  - title: "How to serialize and deserialize JSON in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/how-to
---

The third step of the scene is an admission: replaying works, and replaying gets slower. Five events is nothing, five thousand is a page that takes a second to load, and the honest fix is not to make the log smaller. It is to write down the answer so far. `snap @ 5` is the state of the order as of the fifth event, stored beside the log, and the rebuild after it starts from there and replays what came later — which in the scene is one row rather than six, so the rebuild is over in a beat and the five rows it did not have to read are drawn as the work it skipped.

The important word is *derived*. A snapshot contains no information the log does not already contain; it is arithmetic somebody has done in advance. That single property decides everything else about how to treat one. It never has to be migrated, because it can be thrown away and made again from the log. It never has to be backed up separately. It is never consulted about what actually happened. And if the code that folds events changes, every snapshot taken by the old code is wrong and must be discarded — which is fine, because discarding is a delete and a rebuild, not a data-loss incident.

Store it keyed by stream and version, and keep it versioned in a second sense too. The row holds the serialized state, the sequence number it covers, and the schema version of the *state shape*; the load path takes the newest snapshot at or below the version it wants and replays forward from there. When you change the aggregate's fields, bump the state schema version and let the loader ignore snapshots written under the old one. A snapshot the loader cannot safely read is not an error, it is a cache miss.

How often to take one is a throughput question with a boring answer: measure the replay, not the calendar. Every N events is the usual rule, with N chosen so the worst rehydrate stays inside whatever the command path can afford, and it is fine for N to be large. Taking one after every event is a current-state table with extra steps and destroys the reason for the log. Taking one only when somebody notices the page is slow is a load test you did not schedule. Snapshotting asynchronously, on a background worker that walks streams past a threshold, keeps the cost off the write path entirely and is what most systems settle on.

The failure mode to guard against is drift in status rather than in value. A snapshot goes wrong the moment somebody treats it as the state: a query that reads the snapshot table because it is convenient, a report built from snapshots because they are smaller, a repair job that edits a snapshot instead of appending a correcting event. Each of those quietly promotes a cache to a record, and from then on the system has two answers and no way to tell which is older. The test is the one the scene keeps repeating in every step: delete every snapshot in the database and everything must still be exactly true, only slower. If that is not the case, what you have is not a snapshot.

Note also what a snapshot does not fix. It bounds rebuild time; it does nothing about the log's size on disk, nothing about the cost of a projection rebuild that must read the whole stream anyway, and nothing about event versioning. Those need archival, subscriber checkpoints and upcasters respectively. A snapshot is a small, cheap, deletable answer to exactly one question — how long does it take to get an aggregate back into memory — and it is at its best when it is not asked to answer any of the others.
