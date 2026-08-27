---
title: "Concurrency Token"
summary: "A concurrency token is a property the data access layer adds to the WHERE clause of every update and delete, so a write lands only if the row still holds the value that was read. It turns a silent lost update into an exception the application can answer, without holding a lock across the time it took to decide."
category: "Transactions and concurrency"
tags: ["ef-core", "database"]
scene: isolation-level
sceneStep: 3
related:
  - label: Isolation Level
    slug: isolation-level
  - label: Row Version
    slug: row-version
  - label: Optimistic Concurrency
    slug: optimistic-concurrency
  - label: Lost Update
    slug: lost-update
  - label: Change Tracking
    slug: change-tracking
  - label: Pessimistic Concurrency
    slug: pessimistic-concurrency
  - label: Local Transaction
    slug: local-transaction
  - label: Retry
    slug: retry
references:
  - title: Concurrency tokens (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/modeling/concurrency
  - title: Handling concurrency conflicts (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/saving/concurrency
  - title: TimestampAttribute Class
    url: https://learn.microsoft.com/en-us/dotnet/api/system.componentmodel.dataannotations.timestampattribute
---

The row version in the third step of the scene is the database's own bookkeeping; a concurrency token is what the application does with it. Marking a property as a token tells the data access layer that the value it read is part of the identity of the row for the purposes of writing, so the update it generates is no longer "set these columns where the key matches" but "set these columns where the key matches and this property still holds what I read". The row either matches or it does not, and the database answers with a number: how many rows were affected. Zero means somebody got there first.

That number is the entire mechanism, and knowing it explains everything else. EF Core counts the rows each statement in a `SaveChanges` batch reported, compares that with what it expected, and throws `DbUpdateConcurrencyException` when they disagree. It cannot tell you what changed, because the update returned nothing but a count; it can only tell you that the row it was working from is stale. That is why every honest handler starts by going back to the database.

Which property to mark is a design decision with real consequences. A database-generated row version is the broad answer: any change to the row invalidates any concurrent write, which is safe, needs no discipline from the write paths, and produces conflicts between edits that could in principle have coexisted. A single business column marked as a token is the narrow answer: two users editing different things stop colliding, but only the marked column is protected and every other column is now a lost update waiting to happen. The broad answer is the right default; the narrow one is worth it only where the conflict rate is high and the fields really are independent.

The handler is where most of the difficulty lives, and the shape depends on whose value should win. Store wins means reload the entry and abandon the attempted change, which is right when the user was only confirming something. Client wins means reload the entry, copy the database's current values into the original values so the next write matches, and save again, which is right when the change is an unconditional command like "mark cancelled". A real merge means presenting both versions and asking, which is right for anything a human typed. Whichever it is, the token itself has to be refreshed as part of the reload, or the retry fails for the same reason as the first attempt.

Two mistakes are common enough to name. The first is retrying only the statement that failed: the transaction it belonged to was rolled back, so replaying one write into a transaction that no longer exists either fails or, worse, succeeds outside the unit of work it was meant to be part of. The retry has to re-run the whole operation, which is what an execution strategy does when you hand it the whole block. The second is trusting a token that made a round trip through a client without being treated as opaque. A `byte[]` row version that a browser turned into a number, or a `DateTime` token that a serializer rounded to milliseconds, compares unequal to itself and produces a conflict on every save.

There is a boundary worth stating plainly, because tokens are often reached for to solve a problem they do not solve. A token protects one row against a concurrent write to the same row. It does nothing about a rule that spans several rows, nothing about rows that did not exist when the query ran, and nothing about work that a second service is doing in a different database. Those need an isolation level that covers the range, a constraint the database can enforce, or a design where the invariant lives inside a single row. The token's job is narrow and it does that job without making anyone wait, which is exactly why it is worth having.
