---
title: "Backward-Compatible Migration"
summary: "A backward-compatible migration is a schema change both the running version and the next one can live with. Adding is compatible, removing and renaming are not, and the rule is what makes the version-overlap window survivable rather than merely short."
category: ".NET data access"
tags: ["deployment"]
scene: database-migration
sceneStep: 2
related:
  - label: Database Migration
    slug: database-migration
  - label: Schema Evolution
    slug: schema-evolution
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

The second step of the scene turns on one rule, and everything visible follows from it: a change may ship only if both versions of the application can live with the schema afterwards. That is a stronger statement than "the migration succeeded". The migration in the first step also succeeded, in about a millisecond; what it could not do was leave a schema the code that was still running recognised.

Adding a column is the canonical compatible change because of what old code does with it, which is nothing. A `SELECT name, email FROM customers` does not become wrong when a third column appears next to those two, and an `INSERT` that lists its columns does not become wrong either, as long as the new column accepts the absence of a value. That last clause is where compatible changes are usually lost. `ADD COLUMN full_name text NOT NULL` is not additive: it is a demand that every writer already knows about a column that has not been deployed yet, and the version still running does not. Nullable, or nullable with a default, is what makes the addition invisible.

Removing and renaming are the opposite, and a rename is worth naming as the trap it is, because SQL will happily present it as one statement. `ALTER TABLE customers RENAME COLUMN name TO full_name` is a drop and an add pretending to be an edit. It is not that the statement is slow or risky to run; it is that it is instantaneous, and the deployment it is paired with is not. Somewhere between the first instance restarting and the last one restarting, code that says `name` will meet a table that does not have one, and the only question is how many requests fall into the gap.

So the test is not "does this migration apply cleanly" but "if I apply this migration and then deploy nothing at all, does the system still work; and if I deploy the new code and then never apply the migration, does it still work". A change that passes both is deployable on its own, in either order, which is what lets the schema step and the code step be two independent deploys instead of one coordinated event. Coordinated events are where outages live, because coordination is a promise about timing and rollouts do not make promises about timing.

The practical shape of this is a small list. Add columns nullable. Add tables before anything writes to them. Add indexes concurrently where the database offers it, so building one does not lock the table against the traffic. Widen types rather than narrowing them, because every old value has to remain a legal value. Add enum members at the end and make readers tolerate one they do not recognise. Never make an existing column stricter in the same step that introduces it. And when the change you want is genuinely destructive, do not look for a way to make it safe: decompose it, which is what the rest of this scene is about.

The property also runs forwards, and the cost of forgetting that is a rollback that fails. Deploying v2 is a decision you can reverse; the old binary is still in the registry. Applying a migration is much harder to reverse, so v1 has to keep working against the new schema for as long as you might want to go back to it. That is the same rule read from the other end, and it is why the old column stays for days after nothing reads it: not because anyone expects to need it, but because keeping it is what makes the previous version still a deployable artifact.

One tell is worth watching for in review. If a pull request contains a migration and the code change that depends on it, the two are being shipped as one event, and someone has quietly assumed they will land together. They will not: the migration runs once, before the rollout, and the code arrives instance by instance over the next few minutes. Splitting them into two pull requests is not bureaucracy. It is the only way the reviewer can answer the question that matters, which is whether each half is safe on its own.
