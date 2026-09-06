---
title: "Database per Service"
summary: "Database per service is the rule that every service owns its own store and reaches another service's data only through that service's API. It is where a service boundary stops being a diagram and becomes something the schema enforces, because data ownership is the part of a boundary that is hard to talk your way around."
category: "Application architecture"
tags: ["database"]
level: 6
related:
  - label: Anti-Corruption Layer
    slug: anti-corruption-layer
  - label: Strangler Fig
    slug: strangler-fig
  - label: Bounded Context
    slug: bounded-context
  - label: Saga
    slug: saga
  - label: Transactional Outbox
    slug: transactional-outbox
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Data Warehouse
    slug: data-warehouse
  - label: Modular Monolith
    slug: modular-monolith
references:
  - title: "Data Considerations for Microservices"
    url: https://learn.microsoft.com/en-us/azure/architecture/microservices/design/data-considerations
  - title: "Pattern: Database per service"
    url: https://microservices.io/patterns/data/database-per-service.html
---

## When to use

- When services genuinely have to deploy and evolve on their own schedules. A shared database is the last chain of deployment coupling to survive after the services themselves have been split: a column rename becomes a coordinated release across every team that reads the table, and the independence the split was supposed to buy quietly never arrives. Giving each service its own store is what makes a schema change a local decision again, which is the property most of the rest of a service architecture is standing on.
- When different parts of the system want different storage. One service's data is a small set of documents read whole, another's is relational with constraints worth enforcing in the engine, a third is a cache with a lifetime measured in minutes. Once each service owns its store, that choice is made per service against its own read and write profile instead of once for everyone, and a team that was making the wrong trade-off can change it without asking permission.
- When you already have a bounded context you believe in. This pattern is the physical form of that boundary: the context's model gets a store nobody else writes to, and the translation into another context's vocabulary becomes an explicit thing at the edge — an API, an event, an anti-corruption layer — rather than a join somebody wrote against your tables. The boundary comes first and the databases follow, never the other way round.

## Cautions

- Cross-service joins disappear, and something has to replace them. The usual answer is that a service keeps its own copy of the small slice of another service's data it actually needs, fed by events and accepted as slightly behind. That is eventual consistency arriving as a design obligation rather than a surprise: decide per query how stale an answer may be, and be honest that "join across the two databases" is not on the menu once the stores are separate.
- Transactions across services become sagas. A single commit that spanned two tables becomes a sequence of local commits with compensating steps for the parts that already succeeded, and the message that starts the next step has to be published in the same transaction that wrote the state, which is what a transactional outbox is for. This is real work and it is the actual price of the pattern, so count it before splitting rather than after.
- Company-wide reporting needs a different home. Questions that cross every service — revenue by category by month, a funnel from signup to first order — cannot be asked of any one store any more, and answering them by querying several services in a loop is neither fast nor correct. Move the extracts into a data warehouse where they can be conformed and joined, and let the operational stores stay shaped for the traffic they serve.
- If the boundaries are wrong, this pattern amplifies the mistake rather than revealing it. Two services that constantly need each other's rows were probably one service, and separate stores turn a cheap refactoring into a data migration. Validating the boundary while the code is still one deployable — the modular monolith position, where module data is already separated but moving a line is still a rename — is the cheaper order of operations.

## In .NET

- The unit of ownership is a `DbContext` and its migration history, both living inside the owning service. Migrations run from that service's own pipeline against that service's own store, and nothing outside it is allowed to have an opinion about the tables. The clearest evidence that the discipline is holding is negative: no other service's connection string appears anywhere in this service's configuration, and no other service's entity types appear in this project's references.
- Separate stores do not have to mean separate servers. Sharing a physical instance for cost is fine; what breaks the pattern is sharing a schema or a set of tables. If services do share an instance, give each one its own schema and its own login with rights to that schema only, so the boundary is enforced by permissions rather than by everyone remembering. A grant is a boundary test that runs on every query.
- The copies other services need are fed by events, and publishing them reliably is the part worth designing. Write the state change and the outgoing message in one local transaction, then let a separate process relay the message, so a crash between the two cannot leave a service that changed its mind without telling anyone. Consumers must expect duplicates and out-of-order arrival, which means the handler that applies the copy is written to be safe to run twice.
- Give each service its own schema-change pipeline and its own backup and restore story. Independence at deployment time is not real if a restore has to be coordinated across every store to make the system consistent again, so decide in advance which service is the source of truth for each fact, and rebuild the copies from that source rather than trying to restore them all to the same instant.
