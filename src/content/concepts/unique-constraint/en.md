---
title: "Unique Constraint"
summary: "A rule hung off a sorted index: while inserting, if the position this value belongs in is already taken, refuse. The check and the claim happen at one point inside one structure, which is why two racing inserts cannot both win."
category: ".NET data access"
tags: ["database", "duplicates"]
level: 5
scene: database-index
sceneStep: 3
related:
  - label: Database Index
    slug: database-index
  - label: Idempotency Key
    slug: idempotency-key
  - label: N+1 Query
    slug: n-plus-1-query
  - label: Prepared Statement
    slug: prepared-statement
  - label: Database Migration
    slug: database-migration
  - label: Materialized View
    slug: materialized-view
  - label: No-Tracking Query
    slug: no-tracking-query
  - label: Offset Pagination
    slug: offset-pagination
  - label: Keyset Pagination
    slug: keyset-pagination
  - label: Cursor Pagination
    slug: cursor-pagination
references:
  - title: Unique constraints and check constraints
    url: https://learn.microsoft.com/en-us/sql/relational-databases/tables/unique-constraints-and-check-constraints
  - title: Indexes (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/modeling/indexes
  - title: CREATE INDEX (Transact-SQL)
    url: https://learn.microsoft.com/en-us/sql/t-sql/statements/create-index-transact-sql
---

A unique constraint is almost free, and the reason is the scene's third step. The index is already sorted, so an insert already has to find the position the new value belongs in before it can put it there. Adding "and if something is already sitting in that position, refuse" costs no extra descent, no extra read and no extra structure. That is why databases implement the constraint as an index rather than as a separate rulebook: the work of enforcing it is work the write was doing anyway.

What you get for it is the one thing application code cannot build for itself. The obvious implementation of "do not allow duplicates" is to look first and insert if nothing came back, and that is wrong on every database in the world, because two requests can both look, both find nothing, and both insert. The window between the check and the write is where the duplicate is created. A unique index closes the window by not having one: the descent that finds the slot and the write that claims it are a single step at a single point, so of two arrivals at the same value, exactly one leaves with it. In the scene the table is never even touched — the index answers on its own, before any row is written.

So the right shape in code is not to look before you leap. It is to insert and let the failure be the answer. `SaveChangesAsync` throws `DbUpdateException`; underneath it is a provider error with a number that says "unique violation" specifically — 2601 or 2627 on SQL Server, `23505` on PostgreSQL — and that is the signal to return `409 Conflict`, or to load the row that already exists and carry on with it. Catching every `DbUpdateException` alike is the common mistake: a foreign key violation and a timeout arrive wearing the same coat, and swallowing them as "already there" hides real bugs. Match on the inner exception, not on the outer one.

Three details are worth knowing before you declare one. `NULL` is not equal to itself, so PostgreSQL, MySQL and SQLite let several rows hold `NULL` in a unique column, while SQL Server treats two `NULL`s as equal and allows exactly one — on SQL Server a filtered unique index (`HasFilter("[Email] IS NOT NULL")`) is how you get the other behaviour, and if neither is what you want the column should not be nullable. Uniqueness across more than one column is a different rule from uniqueness on each of them, so `HasIndex(x => new { x.TenantId, x.Email }).IsUnique()` says one email per tenant and nothing about emails globally. And the comparison is the column's, not yours: whether `Ann@example.com` collides with `ann@example.com` is decided by the collation, so normalise the value on the way in rather than hoping. If rows are soft-deleted, add a filter (`HasFilter("[DeletedAt] IS NULL")`) so a deleted row does not keep its value reserved forever.
