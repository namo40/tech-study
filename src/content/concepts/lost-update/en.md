---
title: "Lost Update"
summary: "A lost update is two transactions reading the same row, each computing a new value from what it read, and the second write quietly replacing the first. Nothing fails and nothing is logged: the first change is simply gone."
category: "Transactions and concurrency"
scene: deadlock
sceneStep: 4
related:
  - label: Optimistic Concurrency
    slug: optimistic-concurrency
  - label: Row Version
    slug: row-version
  - label: Concurrency Token
    slug: concurrency-token
  - label: Deadlock
    slug: deadlock
  - label: Lock
    slug: lock
  - label: Isolation Level
    slug: isolation-level
references:
  - title: Handling concurrency conflicts (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/saving/concurrency
  - title: Transaction locking and row versioning guide (SQL Server)
    url: https://learn.microsoft.com/en-us/sql/relational-databases/sql-server-transaction-locking-and-row-versioning-guide
---

The shape is always the same: read a value, work out a new one from it in application code, write the new one back. Two requests do that at once, both read 10, one writes 11 and the other writes 12, and the row ends on 12. One of the two increments has vanished. Nobody gets an error, so the only evidence is a total that does not match the events that produced it.

It hides well because the default behaviour of a write is last-writer-wins, and last-writer-wins is what you want almost everywhere else. Read committed does not prevent it either: both reads were of committed data, and both writes were legal. The window is exactly the gap between the read and the write, which is why the bug is rare in a test and common under load, and why it gets worse the longer a user is allowed to sit on an edit screen.

There are three fixes and they suit different work. If the new value is a function of the old one, do the arithmetic in the database and skip the read entirely: `UPDATE Accounts SET Balance = Balance + @delta WHERE Id = @id` is one statement and cannot lose anything. If the value depends on a decision the application has to make, either take a lock for the duration or attach a version to the row and make the update conditional on it. The version check is the usual default for anything that goes through a screen, because it holds nothing across the think time and turns a silent overwrite into a conflict you can handle.

Whatever you pick, write down which rows are protected. The counting bug that a version column fixes is the visible one, but the same read-modify-write shape sits behind stock levels going negative, statuses moving backwards, and audit trails with a step missing.
