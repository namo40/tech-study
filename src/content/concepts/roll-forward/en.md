---
title: "Roll-Forward"
summary: "Rolling forward is fixing with a new release instead of an old one: the answer when the damage has already left your process, when the previous revision cannot read what the bad one wrote, or when the schema has moved on and the way back is no longer a way back at all."
category: "Containers and orchestration"
tags: ["deployment"]
scene: rollback
sceneStep: 4
related:
  - label: Rollback
    slug: rollback
  - label: Compensating Transaction
    slug: compensating-transaction
  - label: Feature Flag
    slug: feature-flag
  - label: Database Migration
    slug: database-migration
  - label: Expand-Contract Migration
    slug: expand-contract-migration
  - label: Blue-Green Deployment
    slug: blue-green-deployment
  - label: Canary Release
    slug: canary-release
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
  - label: Idempotency-Key
    slug: idempotency-key
references:
  - title: Safe deployment practices
    url: https://learn.microsoft.com/en-us/azure/well-architected/operational-excellence/safe-deployments
  - title: Deployments
    url: https://kubernetes.io/docs/concepts/workloads/controllers/deployment/
  - title: Applying Migrations - EF Core
    url: https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/applying
---

Rolling forward is the other half of the same skill. Rollback puts the pointer back on a revision that is still standing; rolling forward builds a corrected release and points at that instead. The first is faster and should be the reflex, so rolling forward is not the brave option or the professional one. It is what you are left with when going back would not actually help, and the whole art is telling those two situations apart while an incident is running.

Three things push you forward. The first is damage that has already left the process. The confirmation email went out, the card was charged, the webhook fired and the partner system acted on it. No deploy reaches any of those. What answers them is compensation, which is a new action that offsets the old one rather than a reversal that pretends it never happened, and compensation ships in a release, which means the release has to move forward. The second is data the old code cannot read. If the bad revision wrote records in a shape it invented, and the schema was not kept wide enough for the previous revision to read them, then the pointer moving back produces a second outage on top of the first. The third is a migration that has already run and cannot be honestly undone, which turns the return road into a restore and makes a small forward fix the cheaper decision.

The discipline is what keeps a forward fix from becoming a second incident. Bound the change to the fault: a corrected release during an incident is not the moment for the refactor that was going in next week, and a one-line fix reviewed by two people beats a clean rewrite nobody has read. Ship it through the same gates the bad release went through rather than around them, because the reason to trust the fix is the same pipeline that would have caught it. Make the compensating action safe to run twice, because you will run it twice: an idempotency key on the refund, a marker on the record you have already corrected, a list of exactly which entities were touched by the bad window. And write down the window itself, from the deploy to the pointer move, since everything the compensation has to cover was produced inside it.

The decision, then, is short. If the code is wrong and the previous revision can still serve today's data, go back, because it is the fastest thing you can do and it is already tested by having been in production. If the world outside the process has changed, or the data has moved past what the old code understands, go forward and carry the compensation with you. And if you are unsure, go back first anyway when the return road is open: it stops the bleeding, and it costs you nothing you cannot spend again on a forward fix an hour later, from a system that is no longer failing.
