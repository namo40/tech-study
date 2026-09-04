---
title: "Lock"
summary: "A lock is how a database makes concurrent statements take turns. A shared lock lets readers in together, an exclusive lock keeps everyone else out, and whoever wants a conflicting lock waits until the holder's transaction ends."
category: "Transactions and concurrency"
tags: ["database"]
scene: deadlock
sceneStep: 1
related:
  - label: Deadlock
    slug: deadlock
  - label: Isolation Level
    slug: isolation-level
  - label: Pessimistic Concurrency
    slug: pessimistic-concurrency
  - label: Optimistic Concurrency
    slug: optimistic-concurrency
  - label: Database Connection Pool
    slug: database-connection-pool
references:
  - title: Transaction locking and row versioning guide (SQL Server)
    url: https://learn.microsoft.com/en-us/sql/relational-databases/sql-server-transaction-locking-and-row-versioning-guide
---

Two lock modes cover most of what an application sees. Under lock-based read committed, which is SQL Server's default, a shared lock is what a read takes, and several readers can hold one on the same row at once. An exclusive lock is what a write takes, and it is compatible with nothing: while it is held, no other transaction may read the row under a shared lock or write it at all. That is the whole mechanism behind "the second writer waits". Where the database answers reads from row versions instead — PostgreSQL always, SQL Server once `READ_COMMITTED_SNAPSHOT` is on — a read takes no shared lock and is never blocked by a writer, and only the write side of that picture is left.

The part that surprises people is how long a lock is held. An exclusive lock is not released when the statement finishes; it is released when the transaction ends. Everything a transaction has written stays locked until it commits or rolls back, which is why a transaction that stays open across an external call blocks other writers for exactly as long as that call takes.

Locks also have a size. A database can lock a row, a page, or a whole table, and SQL Server, for example, escalates from many small locks to one big one when a statement touches enough of them. An update with no supporting index scans, takes locks along the way, and can end up holding far more than the rows it changed, so a missing index shows up as a blocking problem rather than a slow one.

Waiting for a lock is normal and usually brief. What is not normal is two transactions waiting on each other, because that wait has no end: it is a deadlock, and the database has to kill one of them to break it. Watch lock wait time as a metric in its own right, and keep transactions short enough that the wait behind each one stays short too.
