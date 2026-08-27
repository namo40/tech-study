---
title: "Local Transaction"
summary: "A local transaction is a unit of work that begins and ends inside one resource, usually one database on one connection, so a single commit decides the fate of everything in it. That single decision point is what makes atomicity cheap, and it is the stage every isolation level is played on."
category: "Transactions and concurrency"
tags: ["database"]
scene: isolation-level
sceneStep: 1
related:
  - label: Isolation Level
    slug: isolation-level
  - label: Lock
    slug: lock
  - label: Deadlock
    slug: deadlock
  - label: Unit of Work
    slug: unit-of-work
  - label: Change Tracking
    slug: change-tracking
  - label: Saga
    slug: saga
  - label: Transactional Outbox
    slug: transactional-outbox
  - label: Optimistic Concurrency
    slug: optimistic-concurrency
references:
  - title: Using transactions (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/saving/transactions
  - title: DbTransaction Class
    url: https://learn.microsoft.com/en-us/dotnet/api/system.data.common.dbtransaction
  - title: TransactionScope Class
    url: https://learn.microsoft.com/en-us/dotnet/api/system.transactions.transactionscope
---

The first step of the scene shows two transactions and one row, and it is worth naming what makes that picture possible at all. Both transactions live inside the same database, on their own connections, and each one ends with a single instruction that either publishes everything it did or discards everything it did. That is a local transaction, and its defining property is not that it is small but that exactly one participant has to agree. There is nothing to coordinate, no second system that could say yes after the first said no, and therefore no window in which half the work is visible.

That single decision point is where atomicity, consistency and durability stop being expensive. The database already has the write-ahead log it needs to undo a rollback and redo a crash, and a commit is one record in it. Isolation is the odd one out of the four, because it is the only property that costs other transactions something rather than costing you something: the level you choose decides how much of your unfinished work your neighbours may see, and how long they wait to not see it. Every isolation level in the scene is a rule about the inside of one local transaction.

The shape most applications actually run is smaller than the shape they think they run. A single `SaveChanges` in EF Core is already a transaction: the framework opens one, sends every tracked insert, update and delete, and commits, so a hundred changes to a hundred entities land together or not at all. An explicit `BeginTransaction` is only needed when the unit of work spans more than one `SaveChanges`, when the level has to be something other than the default, or when a read has to be pinned to the same snapshot as a later write. Wrapping a single `SaveChanges` in an explicit transaction adds a round trip and nothing else.

The boundary matters more than the contents. A transaction is held open from `BEGIN` to `COMMIT`, and every lock it acquires along the way is held for that whole stretch regardless of when it was taken, so a transaction that spends four hundred milliseconds waiting on an HTTP call is a transaction that made everybody else wait four hundred milliseconds too. The rule that follows is simple and often broken: do the talking to other systems before you begin or after you commit, never in between. The same rule rules out user think time, message sends that block, and lazily evaluated queries whose consumer wanders off.

The moment a second resource joins, the local transaction is gone and the guarantees change shape. Writing to the database and publishing to a message broker in the same operation cannot be atomic through a local transaction, because two systems now have to agree. Distributed transactions can force the agreement at a cost most systems refuse to pay, which is why the common answers avoid the question instead: write the message into the same database as a row and let a separate process deliver it, or accept that the two steps are separate and make the second one safe to repeat. Both answers work by keeping the atomic part local.

There is one more boundary that hides in plain sight, and it is the connection. The transaction belongs to the connection, not to the request, not to the ambient context, and not to the repository object. Code that opens a second connection inside a transaction is running that work outside the transaction, on the default level, invisible to the uncommitted changes and unprotected by the rollback. In EF Core this shows up as a second `DbContext` created inside a transaction on the first, and the symptom is a query that cannot see a row the caller just wrote. `DbContext.Database.UseTransaction` exists for exactly this case: it lets a second context join the transaction that is already running rather than starting a new one beside it.
