---
title: "Rollback"
summary: "Rollback is the return journey you prepare before you need it: keep the previous revision warm, make going back a pointer switch instead of a rebuild, and know in advance what cannot go back, because data, schemas and side effects only move forward."
category: "Containers and orchestration"
tags: ["deployment"]
scene: rollback
steps:
  - title: "The way back is built before it is needed"
    text: "The ghost deploys the new version and throws the old one away — so when the new one turns bad, the only road is fixing it under fire and building again, minutes of errors instead of seconds. Keeping the previous revision warm costs almost nothing. Not keeping it prices your worst deploy at the speed of your build."
  - title: "Rollback is a pointer move, not a deployment"
    text: "The bad release stays where it is; the active pointer swings to the previous revision that never left, and traffic follows in seconds. No build, no image pull, no waiting on CI in the middle of an incident. This is why platforms keep revision history — the fastest fix is the one that was already running last week."
  - title: "The code goes back; the data stays forward"
    text: "While the bad release ran, it wrote records in its new shape, and they do not roll back with the pointer. The old code now faces data from the future. This is why schema changes ship compatible-first: neighbouring revisions must read each other's writes, or the return road is closed exactly when you need it."
  - title: "When the world already changed, fix forward"
    text: "Some damage is not in your process: the email went out, the charge posted, the webhook fired. Rolling the code back cannot unsend any of it, so the fix is a corrected release moving forward plus compensation for what escaped. Roll back when the code is wrong and forward when the world is; knowing which you are in is the skill."
related:
  - label: Blue-Green Deployment
    slug: blue-green-deployment
  - label: Canary Release
    slug: canary-release
  - label: Rolling Update
    slug: rolling-update
  - label: Feature Flag
    slug: feature-flag
  - label: Database Migration
    slug: database-migration
  - label: Expand-Contract Migration
    slug: expand-contract-migration
  - label: Backward-Compatible Migration
    slug: backward-compatible-migration
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
  - label: Roll-Forward
    slug: roll-forward
  - label: Compensating Transaction
    slug: compensating-transaction
  - label: Shadow Deployment
    slug: shadow-deployment
references:
  - title: Deployments
    url: https://kubernetes.io/docs/concepts/workloads/controllers/deployment/
  - title: Safe deployment practices
    url: https://learn.microsoft.com/en-us/azure/well-architected/operational-excellence/safe-deployments
  - title: Applying Migrations - EF Core
    url: https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/applying
---

## When to use

- Every deploy should carry one, and it should be arranged before the deploy rather than during the incident. That means the previous revision is still there and still runnable: revision history retained on the platform (`revisionHistoryLimit` on a Kubernetes Deployment, the previous slot in a slot swap), image tags never reused so `v1.4.2` still means what it meant last week, and configuration versioned alongside the code so the old binary meets the settings it was tested with.
- Reach for it the moment a new release is measurably worse and you do not yet know why. Rollback is a triage move, not a diagnosis: it buys back the error budget while you read the logs. The bad revision is still on the shelf afterwards, which is where the diagnosis happens.
- Wire it to the platform where the platform can do it for you. Health-gated rollouts stop a failing release before it reaches the whole fleet and, on some platforms, undo it without a human at all. That is the cheapest possible version of this page: the return road taken automatically, in seconds, by something that was watching.
- Pair it with progressive delivery rather than treating them as alternatives. A canary limits how many people see the bad release; a rollback limits how long anyone does. Together they bound the blast radius on both axes, and neither one substitutes for the other.
- Test it occasionally, the way backups are tested. An untested return road is a hope, not a plan, and the failure you find during a drill is free. Measure the time from decision to traffic served by the old revision and treat that number as a service level objective of its own.

## Cautions

- The data does not roll back. A release that ran for twenty minutes wrote records in whatever shape it wanted, and the pointer moving back does not rewrite them. This is why schema changes ship expand first: add the new column, keep the old one, deploy code that handles both, and only contract once the revision that needed the old shape is gone for good. Neighbouring revisions have to be able to read each other's writes, or the return road is closed at exactly the moment you need it.
- Rolling back the deploy and rolling back the database migration are two different motions, and coupling them into one is how a bad afternoon becomes a bad week. Undo the code first, on its own, and decide about the schema separately with the data in front of you. A tool that offers to do both in one command is offering to make an irreversible decision on your behalf while you are under pressure.
- Some migrations have no honest reverse. Dropping a column, narrowing a type, merging two rows: the down script for those can only recreate the shape, not the values. Say so out loud in review, and when the answer is "we would have to restore from backup", that is the real recovery plan for that migration and it needs to be written down before the migration ships, not discovered afterwards.
- Side effects do not roll back either. An email that went out stayed out; a charge that posted is on somebody's statement; a webhook the downstream system already acted on has changed a world you do not control. What answers that is compensation, which is a new action that offsets the old one, not a reversal that pretends it never happened. The refund is a second transaction, and the customer saw both.
- When the change is behind a feature flag, turning the flag off is the cheaper rollback. It is faster, it is narrower, and it deploys nothing, so the rest of the release keeps its fixes. Reach for the deploy-level rollback when the fault is in code that is not behind a switch, or when the switch itself is what is broken.
- Keep the bad revision. It is the evidence, and overwriting it with a hotfix built in a hurry destroys the only copy of what actually happened. Roll the pointer back, leave the image and the logs alone, and diagnose from a system that is no longer on fire.
- Rolling back is not free of risk either. The old revision has not seen today's data, today's traffic shape, or the schema as it now stands, and it may have its own bug that the new release happened to paper over. It is usually the safer bet, and it is still a change to a production system.

## In .NET

On Kubernetes the return road is a command, and it only works because the platform kept the old ReplicaSet:

```bash
# What is on the shelf. Keep enough history that this list is not empty.
kubectl rollout history deployment/checkout

# The pointer move: no build, no registry pull for an image already on the node.
kubectl rollout undo deployment/checkout

# Or straight to a known-good revision, when the last one is not the one you want.
kubectl rollout undo deployment/checkout --to-revision=7
```

On Azure App Service the same move is a slot swap back, and on both platforms the thing that makes it fast is that nothing is rebuilt. Set `revisionHistoryLimit` deliberately: too low and the shelf is empty when you need it, too high and you are keeping ReplicaSets nobody will ever point at again.

For the database, generate the down script and read it before the migration ever ships:

```bash
# The exact SQL a rollback would run, reviewed while nobody is under pressure.
dotnet ef migrations script AddDiscountColumn PreviousMigration --output down.sql
```

```csharp
// A destructive Down cannot restore what Up deleted. Say so rather than
// pretending, so the recovery plan is a restore and everyone knows it.
protected override void Down(MigrationBuilder migrationBuilder)
{
    throw new NotSupportedException(
        "DropColumn(LegacyTotal) is lossy. Recovery for this migration is a " +
        "point-in-time restore, not a down script.");
}
```

`dotnet ef database update <PreviousMigration>` runs that script, and it is a separate decision from `kubectl rollout undo`. Do the code first. Then look at what the bad revision wrote, and decide about the schema with that in front of you.

The rest is arranging for the road to exist. Gate the rollout on a real readiness probe so a broken release never takes the whole fleet; keep feature flags in front of behaviour changes so the fast path is turning a switch off; and put an alert on the metric that would make you decide, so the decision arrives at the same time as the error rate rather than ten minutes later.
