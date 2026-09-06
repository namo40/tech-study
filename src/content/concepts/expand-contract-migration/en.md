---
title: "Expand-Contract Migration"
summary: "An expand-contract migration splits a schema change into two releases with a period of coexistence between them: expand adds the new shape while the old one still works, and contract removes the old shape only once nothing is left that reads it."
category: "Containers and orchestration"
tags: ["deployment", "database"]
level: 5
scene: blue-green-deployment
sceneStep: 4
related:
  - label: Blue-Green Deployment
    slug: blue-green-deployment
  - label: Rolling Update
    slug: rolling-update
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
  - label: Canary Release
    slug: canary-release
  - label: Readiness Probe
    slug: readiness-probe
  - label: Health Check
    slug: health-check
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: Strangler Fig
    slug: strangler-fig
  - label: Feature Flag
    slug: feature-flag
  - label: Pod Disruption Budget
    slug: pod-disruption-budget
references:
  - title: "EF Core: Migrations overview"
    url: https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/
  - title: "EF Core: Applying migrations"
    url: https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/applying
  - title: "EF Core: Migrations in team environments"
    url: https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/teams
---

The last step of the scene is the one that explains why the first three were possible. Blue and Green are two of everything, but there is only one database under them, and it does not get a copy. Whatever is true of that schema is true for both versions at once, which means a change that only the new version understands is not a schema change at all: it is a decision to stop being able to go back.

So the change is made in two moves with a gap in the middle. Expand adds. The new column arrives nullable, the new table arrives empty, the new enum value arrives unused, and everything the old version reads is still exactly where it was. Nothing about the expand release breaks anything, which is what lets it ship on its own, ahead of the code that needs it and ahead of any cutover. Then, in the window the scene marks with the `v1` and `v2` tags, both shapes exist and both versions are correct against the same rows.

Contract is the other move, and its precondition is the whole point: it ships only when nothing that could still be running reads the old shape. Not when the new version is deployed. Not when the traffic has moved. When you have decided you will not be rolling back to anything that needs the old column. In the scene the contract chip appears after Blue goes `idle`, and the order is not decorative: the moment you contract, the rollback from step 2 stops existing, because the version you would roll back to can no longer read its own data.

Between the two sits the part people skip, which is a release that writes both shapes. While it is deployed, the application populates the old column and the new one on every write, backfills the rows that predate the change, and reads whichever one it now trusts. That release is what makes the expand real: without it, the new column exists but is empty for every row the old version wrote, so the "compatible" schema is compatible only in the shape of its columns and not in the content.

Renames are where this goes wrong most often, because a rename looks like one change and is actually five. Add the new column, write both, backfill, read the new one, drop the old one — and each of those has to be safely interruptible on its own, because a deployment can stop halfway. The same is true of narrowing a type, adding a constraint that existing rows may violate, or making a nullable column required. If a step cannot survive being the last one you completed, it is not a step.

Two operational details do most of the damage in practice. The first is applying migrations at application startup: with two environments up at once, both will try, and the one that loses either blocks or fails on a schema that is already half changed. Generate a script or run the migration from the pipeline as a step of its own, before the code that depends on it. The second is that an expand on a large table is not free — adding an indexed column or backfilling millions of rows takes locks and time — so treat the backfill as a batched background job rather than a line in a migration, and let the expand release sit in production for as long as it needs to.

Which leaves a simple rule that survives every deployment strategy on this site. Old code must be able to run against the new schema, and new code must be able to run against the old data, for as long as both could plausibly be running. Blue-green needs it because rollback is the product. Rolling updates need it because the two versions genuinely overlap. Canaries need it most of all, because there the overlap is not a transitional accident, it is the design.
