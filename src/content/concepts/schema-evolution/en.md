---
title: "Schema Evolution"
summary: "Schema evolution is treating a schema as something that walks rather than jumps: every change decomposes into steps that are individually deployable and individually reversible, so the shape of a live database can keep moving without any single moment where it has to be right."
category: ".NET data access"
tags: ["database"]
scene: database-migration
sceneStep: 4
related:
  - label: Database Migration
    slug: database-migration
  - label: Backward-Compatible Migration
    slug: backward-compatible-migration
  - label: Expand-Contract Migration
    slug: expand-contract-migration
  - label: Rolling Update
    slug: rolling-update
  - label: Blue-Green Deployment
    slug: blue-green-deployment
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
  - label: Feature Flag
    slug: feature-flag
  - label: Schema Registry
    slug: schema-registry
  - label: Database Index
    slug: database-index
  - label: N+1 Query
    slug: n-plus-1-query
references:
  - title: "EF Core: Migrations overview"
    url: https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/
  - title: "EF Core: Applying migrations"
    url: https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/applying
  - title: "EF Core: Migrations in team environments"
    url: https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/teams
---

By the fourth step the old column has no readers, so dropping it changes nothing anybody can see. That is the point the whole scene has been building to, and it is worth stating as a property rather than as a happy ending: the last step was uneventful because the three before it moved the readers, not because the drop was clever. A schema does not get versioned in leaps. It walks, and each footfall is small enough to be reversed.

The four steps are the general shape rather than a recipe for renames. A type change is a new column with the wider type, dual writes into both, a backfill with the conversion in it, reads moved, old column dropped. Splitting one column into two is the same walk with two new columns. Making a nullable column required is a default, a backfill for the rows that are null, a constraint added as `NOT VALID` and validated afterwards so the table is not locked while it is checked, and only then code that assumes the value is there. Moving a table between services is the same again with a message queue in the middle instead of an `UPDATE`. In every case the destructive change is at the end, after the thing that made it safe.

What makes each step deployable is that it is compatible in both directions at the moment it lands. What makes each step reversible is subtler and easier to lose: the previous state has to still exist. Expand is reversible because the new column is empty and dropping it costs nothing. Backfill is reversible because it only writes a column nobody reads yet. Switch is reversible because the old column is still being maintained by the dual write, so pointing reads back at it finds current data rather than a snapshot from Tuesday. Contract is the one that is not reversible, which is exactly why it goes last and why it waits.

That waiting is the part teams skip, and skipping it is a false economy. The old column costs a little storage and one line in a write path. Keeping it for a week buys a week in which any rollback is a deploy rather than an incident. There is a real decision behind the delay, and it is about evidence: you drop the column when you can show that nothing reads it, from query logs, from a metric on the code path that still could, or from having grepped a codebase you are confident is the whole set of readers. "We think nothing uses it" is how a reporting job that runs on the first of the month discovers the column at the worst possible moment.

The habit generalises past columns, and the same argument appears wherever two versions of something have to agree. An event or a message that other services consume evolves the same way: add fields, never repurpose one, make consumers tolerate fields they do not know, and retire a field only after the consumers that read it are gone. A schema registry is that discipline with a machine enforcing it, which is worth having once the readers are other teams rather than other instances of yourself. An HTTP API is the same shape again, and the reason a new required request field is a breaking change is exactly the reason `NOT NULL` was one.

The last thing the scene is arguing is about what this buys. It is not that the migration became safe; a rename was never unsafe to execute. It is that a change which had to be coordinated became four changes that did not. Coordination is a promise that two things will happen close enough together, and a rollout is precisely the situation in which nobody can make that promise. Trading one coordinated event for four independent ones is the trade, and the price of it is a week of carrying two columns and a few lines of code that write both. Compared to a maintenance window, that is cheap.
