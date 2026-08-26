---
title: "Pivot Transaction"
summary: "The pivot is the step of a saga after which going back is no longer possible. Before it a failure is compensated backwards; after it a failure is retried forwards until the rest of the saga succeeds."
category: "Distributed transactions and message consistency"
tags: ["consistency"]
scene: saga
sceneStep: 4
related:
  - label: Saga
    slug: saga
  - label: Compensating Transaction
    slug: compensating-transaction
  - label: Orchestration
    slug: orchestration
  - label: Idempotency Key
    slug: idempotency-key
  - label: Retry
    slug: retry
  - label: Exponential Backoff
    slug: exponential-backoff
  - label: Dead Letter Queue
    slug: dead-letter-queue
references:
  - title: Saga distributed transactions pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/saga
  - title: Compensating Transaction pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/compensating-transaction
  - title: Transient fault handling
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/transient-faults
---

Every saga has a step that cannot be taken back, or one that you decide not to take back: the payment you captured, the email you sent, the parcel that left the building. That step is the pivot, and it cuts the saga in two. Everything before it is reversible, so a failure there is answered with compensations in reverse order. Everything after it is not, so a failure there has only one honest answer, which is to keep trying until the remaining steps are done.

That makes the steps after the pivot a different kind of code. They need bounded attempts with backoff between them, they need to distinguish a passing failure from a permanent one, and they have to be safe to run again, because a retry that charges twice is worse than the failure it was fixing. A passing failure, a timeout or a locked row, is what retrying is for. A permanent one, no stock at any warehouse, is not: no amount of retrying invents inventory, so the saga escalates to a human or takes an alternative route forward, rather than quietly refunding money it has already promised elsewhere.

The best way to survive a pivot is to move it. Put the reversible steps first and the irreversible ones as late as you can: reserve the stock before you capture the payment, and a failure to reserve costs nothing but a release. Charge first and you have made payment the pivot by accident, which is how a system ends up refunding a third of its orders. When two steps are both irreversible, the one that is cheaper to repeat should go last.

Mark the pivot in the code rather than in a comment. In a state machine it is a named transition, so the failure branch for a state past it can only send retries and never send a compensation. Count the attempts on the saga instance, key every message on the saga id so the third delivery of `Reserve` is the same as the first, and route the give-up path somewhere a person will see it. A saga that stops past the pivot is not a bug in the pattern; it is the pattern telling you that this one needs a decision.
