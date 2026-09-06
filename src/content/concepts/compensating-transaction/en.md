---
title: "Compensating Transaction"
summary: "A compensating transaction is the business action that undoes a step which has already committed. It is not a rollback: the first effect was real and visible, and the compensation is a second fact recorded on top of it."
category: "Distributed transactions and message consistency"
tags: ["consistency"]
level: 7
scene: saga
sceneStep: 2
related:
  - label: Saga
    slug: saga
  - label: Pivot Transaction
    slug: pivot-transaction
  - label: Orchestration
    slug: orchestration
  - label: Two-Phase Commit
    slug: two-phase-commit
  - label: Idempotency
    slug: idempotency
  - label: Optimistic Concurrency
    slug: optimistic-concurrency
references:
  - title: Compensating Transaction pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/compensating-transaction
  - title: Saga distributed transactions pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/saga
---

Once a local transaction commits, its effect is public. The money has left the card, the row says the stock is reserved, the customer has had an email. No database can take that back, because the database was never holding the other two services in the same transaction to begin with. So the undo is not a technical operation but a business one: a refund, a cancellation, a release of stock, each of which is a new local transaction with its own row.

The order matters. Compensations run in reverse, newest first, and each one only has to undo its own step. That keeps them small and testable: the refund handler knows about payments and nothing else. It also means the saga has to remember what it actually completed, because compensating a step that never ran is how a system ends up refunding money it never took.

Compensation is semantic, not physical. After a refund the account has two lines, a charge and a refund, not zero lines, and that is usually what the business wants: an audit trail that says what happened rather than a hole where it used to be. Design the domain so the intermediate state is legal on its own. A row that can be `reserved` and later `released` compensates cleanly; a row that jumps straight to `shipped` does not.

Two things break compensations, so plan for both. Some steps have no compensation at all, and those steps are the pivot: past them the only direction is forward. And a compensation can fail like anything else, but there is no compensation for a compensation, so it has to be retried until it succeeds. That makes repeatability non-negotiable: key every compensation on the saga id, make running it twice the same as running it once, and alert when the attempts run out rather than letting the saga sit half undone.
