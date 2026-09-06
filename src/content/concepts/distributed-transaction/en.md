---
title: "Distributed Transaction"
summary: "One unit of work that has to commit or roll back across more than one store. The ambition is ordinary; what is hard is that no single store can decide the outcome on its own."
category: "Transactions and concurrency"
tags: ["database"]
level: 8
scene: two-phase-commit
sceneStep: 1
related:
  - label: Two-Phase Commit
    slug: two-phase-commit
  - label: Local Transaction
    slug: local-transaction
  - label: Saga
    slug: saga
  - label: Compensating Transaction
    slug: compensating-transaction
  - label: Transactional Outbox
    slug: transactional-outbox
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Isolation Level
    slug: isolation-level
  - label: Idempotency Key
    slug: idempotency-key
  - label: Distributed Lock
    slug: distributed-lock
  - label: Deadlock
    slug: deadlock
references:
  - title: "Transaction Fundamentals"
    url: https://learn.microsoft.com/en-us/dotnet/framework/data/transactions/transaction-fundamentals
  - title: "Enlisting Resources as Participants in a Transaction"
    url: https://learn.microsoft.com/en-us/dotnet/framework/data/transactions/enlisting-resources-as-participants-in-a-transaction
  - title: "TransactionManager.ImplicitDistributedTransactions Property"
    url: https://learn.microsoft.com/en-us/dotnet/api/system.transactions.transactionmanager.implicitdistributedtransactions
  - title: "Distributed data in cloud-native applications"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/cloud-native/distributed-data
---

The first step of the scene shows the thing everybody wants and the thing that makes it hard, in the same picture. Orders and Payments are two stores. The order and the charge are one business fact. For a moment the diagram shows what happens when you commit them separately: Orders says `committed`, Payments says `aborted`, and the customer is holding an order nobody was paid for. That ghost is the whole problem statement.

A local transaction solves this completely inside one store. The database has one log, one lock manager and one moment where the commit record is written, so atomicity is not a protocol at all — it is a property of the machine. Ask two machines for the same guarantee and there is no shared moment to write it in. Each of them can commit its own part. Neither of them can promise anything about the other one, because each is going to find out about the other over a network that is free to be slow, to be down, or to deliver the message after the decision has already been made.

What that leaves is a coordination problem with no purely local answer. Somebody has to hold the outcome for the whole set of stores, and every store has to agree to be bound by what that somebody says — which means agreeing to give up the right to decide for itself, and holding whatever it has staged until it is told. That is the deal two-phase commit writes down, and everything expensive about the protocol comes from it: the extra round trip that collects the promises, the locks each store keeps while it is promising, and the window where a store has promised and cannot yet be told what the promise was for.

It is worth being precise about what "distributed" means here, because it is not about how many machines are involved. Two connections, even to two databases on the same server, are two resource managers and still need the protocol; ten tables reached over one connection are one transaction and need nothing. What splits a transaction is the number of things that own a commit, not the number of hosts, and this is exactly where the accidental version comes from. A `TransactionScope` around two connections looks like one transaction in the code and is one transaction in a demo; the second connection enlists, the runtime promotes it, and the shape of the thing has changed without anybody deciding.

Which means most of the design work happens before you pick a protocol at all. Some of what looks like a distributed transaction is a store that was split for the wrong reason and belongs back together. Some of it is a write that only needs to be atomic with the message that announces it, which a transactional outbox does with one local transaction and no coordinator. Some of it genuinely spans owners, and then the choice is between holding locks across the network for the length of the decision, or committing each part as you go and undoing the finished ones when a later one fails. The first is two-phase commit and buys the guarantee that nobody ever observes the half-state. The second is a saga and accepts that somebody will.

The one answer that is never available is the one the ghost in the scene shows: two independent commits and a hope that the second one succeeds. It works in every test, because in every test both succeed. What it does not have is a story for the interval between them, and that interval is where real systems live.
