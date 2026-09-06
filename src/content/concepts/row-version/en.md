---
title: "Row Version"
summary: "A row version is a value the database changes every time the row changes, so two reads of the same row can be compared without comparing the row itself. It is what lets a writer ask whether the thing it read is still the thing on disk, and what lets a reader be served a consistent past instead of waiting for the present."
category: "Transactions and concurrency"
tags: ["database", "consistency"]
level: 6
scene: isolation-level
sceneStep: 3
related:
  - label: Isolation Level
    slug: isolation-level
  - label: Concurrency Token
    slug: concurrency-token
  - label: Optimistic Concurrency
    slug: optimistic-concurrency
  - label: Lost Update
    slug: lost-update
  - label: Deadlock
    slug: deadlock
  - label: Lock
    slug: lock
  - label: Local Transaction
    slug: local-transaction
  - label: Change Tracking
    slug: change-tracking
references:
  - title: rowversion (Transact-SQL)
    url: https://learn.microsoft.com/en-us/sql/t-sql/data-types/rowversion-transact-sql
  - title: Transaction locking and row versioning guide (SQL Server)
    url: https://learn.microsoft.com/en-us/sql/relational-databases/sql-server-transaction-locking-and-row-versioning-guide
  - title: PostgreSQL transaction isolation
    url: https://www.postgresql.org/docs/current/transaction-iso.html
---

The third step of the scene puts a number beside the row and everything else in the step follows from it. A version is not a timestamp and not a hash of the contents; it is a value the database itself moves forward on every write, monotonically, without asking anybody. Once the row carries one, two questions that were awkward become arithmetic: whether the row changed since you looked at it, and which of two versions of the row is older.

The first question is what makes optimistic concurrency possible. A writer reads the row along with its version, goes away and does whatever the business logic requires, and then writes with the version in the condition rather than in the payload. If the version on disk is the one it read, nothing happened in between and the write lands. If it is not, somebody else committed first, the write matches nothing, and the writer finds out at the moment it can still do something about it. The cost has moved: instead of holding a lock through the thinking time and making everybody wait, the writer risks having to think again.

The second question is what makes snapshot isolation possible, and it is the same mechanism seen from the other end. When a transaction first reads, the database records which versions were committed at that instant. A read inside that transaction is then answered from the newest version that was already committed at that point, which means the answer is stable for the whole transaction and no reader ever has to wait for a writer. Old versions have to live somewhere until nobody can still be reading them, which is why snapshot isolation is not free: it trades lock waits for storage and for the housekeeping that reclaims it.

Where the version physically lives differs and the difference leaks. SQL Server's `rowversion` is a database-wide counter stamped into an eight-byte column on the row, so it is visible, indexable and comparable across tables, and it changes on any update including one that writes the same value back. PostgreSQL keeps its versions in the row header rather than in a column of its own, and exposes the id of the transaction that wrote the current version as the system column `xmin`, which Npgsql can map as a concurrency token; the visible consequence is that dead versions accumulate until vacuum removes them. Both are the same idea, but only one of them is a column you can put in a `WHERE` clause without asking for it specially.

The failure modes are worth knowing because they are all quiet. A version compared with `!=` rather than used as a condition on the update itself is a race, because between the check and the write another transaction fits. A version read in one request and posted back by a browser is fine only if the value survives the round trip byte for byte, which for SQL Server's eight-byte value means base64 rather than a number, and which for a browser means the value has to be treated as opaque. And a version that the application maintains itself, incremented in code rather than by the database, is only as reliable as the least careful write path in the codebase, because one `UPDATE` that forgets to bump it silently unmakes the guarantee for everybody.

The last thing to hold on to is what a version does not do. It tells you the row changed; it does not tell you whether the change matters. Two users editing different fields of the same record will collide on the version even though their edits could have been merged, which feels like a false alarm and is the usual reason teams reach for a narrower token or a field-level merge. And it says nothing about rows that were not there when you looked, so a version protects the row you read and never the set you queried.
