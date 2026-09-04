---
title: "Retryable Step"
summary: "A step an engine is allowed to run again: running it twice leaves the world in the same state as running it once, which is what makes both retry after a failure and resume after a crash safe."
category: "Scheduled work and workflows"
tags: ["duplicates"]
scene: workflow-engine
sceneStep: 3
related:
  - label: Workflow Engine
    slug: workflow-engine
  - label: Retry
    slug: retry
  - label: Exponential Backoff
    slug: exponential-backoff
  - label: Idempotency Key
    slug: idempotency-key
  - label: At-Least-Once
    slug: at-least-once
  - label: Dead Letter Queue
    slug: dead-letter-queue
  - label: Durable Workflow
    slug: durable-workflow
  - label: Saga
    slug: saga
  - label: Scheduled Job
    slug: scheduled-job
  - label: Transactional Outbox
    slug: transactional-outbox
references:
  - title: Retry pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/retry
  - title: "Error handling in Durable Functions"
    url: https://learn.microsoft.com/en-us/azure/durable-task/common/durable-task-error-handling
  - title: "Implement retries with exponential backoff"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/microservices/implement-resilient-applications/implement-retries-exponential-backoff
---

In the third step of the scene, step three fails, the engine backs off, and runs it again. `attempt 2` appears, the second try succeeds, and the history gains one line. One line, for two executions. That is the whole definition: a retryable step is one where the second execution left nothing extra behind, so the record can honestly say the step happened once.

The reason this matters more than it looks is that a workflow engine assumes it in two separate places, and only one of them is obvious. The obvious one is the retry: a step failed, the engine tries it again. The other one is the resume. When the engine dies between doing the work and writing the line, the record says the step is unfinished, so the restarted engine runs it again — even though it may in fact have completed. There is no way to close that window, because the work and the record cannot be committed together when they live in different systems. An engine is a machine for turning "at least once" into "once, as far as anyone can tell", and it can only do that if the steps cooperate.

So the practical question for every step you write is: if this runs twice, what is duplicated? Sometimes the answer is nothing, and the step is already safe. Setting a field to a value, deleting by id, writing a file whose name is derived from its contents, calling an API that only reads: all of these can be repeated without a second thought. It is worth noticing how many steps are already in this category, because it means the effort belongs to the few that are not.

When the answer is not nothing, the fix is almost always a key. Give the operation a name the far end can recognise — derived from the workflow instance and the step, never generated fresh on each attempt — and let the far end reject the second arrival. That is what an `Idempotency-Key` header is for on an outbound call, what a unique constraint is for on an insert, and what a `where status = 'pending'` is for on an update. The key has to be stable across attempts, which is why the engine hands the step a deterministic instance id rather than letting it call `Guid.NewGuid()`.

Two things resist that treatment and need naming. Sending mail, or anything else where the far end has no notion of a duplicate and no way to take it back: the usual answer is to record the intent in your own store first, key that record, and let a separate delivery step read from it. And appending rather than setting — `balance = balance + 10` is the classic step that is wrong the second time, where `balance = 60` would have been fine. Rewriting a relative change as an absolute one is often the cheapest fix available.

Finally, retrying is not free and not always right. A step that fails because the input is invalid will fail identically on attempt five, so distinguish the errors worth repeating from the ones that are answers: retry the timeout, the 503 and the deadlock; do not retry the 400 or the validation failure. Bound the attempts, back off between them so the retry is not the thing keeping the far end down, and decide where an instance goes when the attempts run out — because "retried forever" and "failed silently" are the same outcome to everyone downstream.
