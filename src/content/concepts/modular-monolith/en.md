---
title: "Modular Monolith"
summary: "A modular monolith ships as one deployable and is built out of modules that reach each other only through published contracts. It buys the benefit of boundaries without the network, the operational surface and the partial failures that come with splitting the deployment, and it leaves the split available later."
category: "Application architecture"
tags: ["deployment"]
related:
  - label: Strangler Fig
    slug: strangler-fig
  - label: Anti-Corruption Layer
    slug: anti-corruption-layer
  - label: Bounded Context
    slug: bounded-context
  - label: Database per Service
    slug: database-per-service
  - label: Hexagonal Architecture
    slug: hexagonal-architecture
  - label: Domain-Driven Design
    slug: domain-driven-design
  - label: Vertical Slice Architecture
    slug: vertical-slice-architecture
references:
  - title: "Common web application architectures"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures
  - title: "Pattern: Monolithic Architecture"
    url: https://microservices.io/patterns/monolithic.html
---

## When to use

- When you want boundaries but the network does not yet pay for itself. Separate deployables buy independent release schedules and independent scaling, and they charge for it in serialization, retries, timeouts, distributed tracing, partial failure and an environment that is now several things to run locally. If the boundaries are the part you actually need, taking them without the bill is the better trade for most systems, and a single deployable keeps a stack trace that crosses the whole request.
- As the step before extracting services, when you expect to extract some. Boundaries are guesses until code has been written against them, and a guess is much cheaper to correct while moving a line is a rename rather than a data migration. Run the modules in one process until the seams stop moving, then pull the one that has earned it out behind a facade, which is the strangler fig move applied inside your own codebase.
- When one team, or a small number of them, covers several domains. Modules give each domain a place with an owner and a contract, so a change to billing does not require reading orders, while the team still deploys once and debugs one process. That is a good fit for the size where a service per domain would mean more environments than engineers.

## Cautions

- Boundary enforcement is the whole pattern, and it has to be someone other than the developers remembering. Let the compiler do it: one project per module, only the contract project referenced across a boundary, and everything else `internal` so it is not reachable to be depended on by accident. A module that is merely a folder in a shared project is a naming convention, and naming conventions lose to deadlines.
- Separate the data per module from the first day. Each module owns its tables or its schema, and no other module reads them directly; the store may be shared, the tables may not. Shared tables are the single most common thing that makes a later extraction impossible, because by then the join is load-bearing in code nobody remembers writing. This is the in-process edition of database per service, and it is the part that is expensive to retrofit and nearly free to start with.
- In-process calls are cheap, and that cheapness is the temptation. Nothing stops one module from calling straight into another's implementation and getting an answer in nanoseconds, and every such call is a coupling that a service boundary would have made you think about. Route cross-module work through the published contract, and prefer an event for the cases where a module wants to tell others what happened rather than ask them to do something.
- "We will split it later" is a plan only if the boundaries are tested. Write tests that assert the reference direction and fail the build when a module reaches somewhere it should not, and treat a violation as a build break rather than a review comment. Without that, the modules drift into each other at exactly the speed of ordinary delivery pressure, and the split you were keeping available quietly stops being available.

## In .NET

- The natural spelling of a module is a project, and the natural spelling of a boundary is a project reference. Give each module a contracts project holding the types other modules are allowed to see and an implementation project that no other module references, keep the implementation types `internal`, and let one host project reference every module and compose them at startup. Then the dependency graph in the solution is the architecture diagram, and it is the version that cannot drift from the code.
- Audit the direction of those references the way an onion architecture audits its own: the rule is short enough to state, so it is short enough to test. An architecture test that walks the assemblies and asserts that no module implementation is referenced from outside its own project turns the convention into something the pipeline enforces, which is the difference between a rule and a preference.
- Give each module its own `DbContext` and its own migrations even while the modules share a database. Scope each context to its own schema, name the migration history table per module, and let modules read another module's data only through its contract. When one module is later extracted, its schema and its migration history travel with it and the change at the call site is which implementation of the contract gets registered.
- Compose at the edge. A module contributes its own service registrations and its own endpoints through a small registration type the host calls, so adding a module is one line in the host and removing one is the same line. That also keeps the host free of module internals, which is what lets the host stay small enough to read while the system grows.
