---
title: "Read Model"
summary: "A read model is data kept in the shape a screen asks for, so a query is a lookup rather than a reconstruction. It is derived, never authoritative, and it can be thrown away and built again."
category: "Application architecture"
tags: ["consistency"]
scene: command-query-responsibility-segregation
sceneStep: 2
related:
  - label: CQRS
    slug: command-query-responsibility-segregation
  - label: Projection
    slug: projection
  - label: Materialized View
    slug: materialized-view
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: No-Tracking Query
    slug: no-tracking-query
  - label: Denormalization
    slug: denormalization
  - label: Event Sourcing
    slug: event-sourcing
references:
  - title: CQRS pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs
  - title: Materialized View pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/materialized-view
  - title: Tracking vs. no-tracking queries
    url: https://learn.microsoft.com/en-us/ef/core/querying/tracking
---

A write model is built around invariants: an order knows what it is allowed to become, and everything on it exists so that a rule can be enforced. A screen wants none of that. It wants an order number, a customer name, a total and a status, on one row, for twenty orders at a time. Serving that from the write model means walking three or four relationships and throwing most of the result away, which is why the same question keeps getting more expensive as the domain gets richer. A read model turns the question round: store the answer in the shape it will be asked for, and the query becomes a lookup.

In practice a read model starts as a database view or a projection in LINQ, and only becomes its own table when the view stops being fast enough. Either way the query side projects straight into a DTO with `Select`, so Entity Framework Core never materialises an entity, never takes a change-tracking snapshot, and never gives anyone an object they might be tempted to mutate; `AsNoTracking()` covers the read queries that do return entity types. That is the point at which the read side stops being a second way into the domain and becomes what it should be: a set of flat rows with a shape decided by the screen.

Two properties matter more than the storage choice. A read model is derived, so it is never the place to enforce a rule and never the source anyone reconciles against; if it disagrees with the write side, the write side is right. And a read model is disposable, so adding a column is a matter of changing its shape and replaying, not a schema migration with a back-fill. Both properties come from the same discipline: nothing writes to a read model except the projection that owns it.
