---
title: "Onion Architecture"
summary: "Onion architecture draws the application as concentric circles with the domain model at the centre and infrastructure at the rim, and states one rule: all coupling points inward. Its particular emphasis is that the domain model is a first-class citizen rather than a layer above the database."
category: "Application architecture"
tags: ["ef-core"]
scene: hexagonal-architecture
sceneStep: 4
related:
  - label: Hexagonal Architecture
    slug: hexagonal-architecture
  - label: Clean Architecture
    slug: clean-architecture
  - label: Adapter
    slug: adapter
  - label: Domain-Driven Design
    slug: domain-driven-design
  - label: Repository
    slug: repository
references:
  - title: "The Onion Architecture: part 1"
    url: https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/
  - title: "Common web application architectures"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures
---

The scene's fourth step puts three drawings side by side, and the onion is the one drawn as circles around a core. Jeffrey Palermo named it in 2008, and the picture is literal: the domain model sits at the centre, domain services surround it, application services surround those, and the outermost ring holds everything that touches the world, meaning the user interface, the infrastructure and the tests. The rule attached to the picture is a single sentence about direction. All coupling points toward the centre, so an inner ring may never name anything in an outer one. Read that as a constraint on source-code references rather than on run-time control flow, which goes outward as freely as it ever did.

The proposal was a response to a specific arrangement, not a complaint about layering as such. In the traditional layered application each layer depends on the one beneath it, and the bottom layer is data access, which means every layer above it ultimately depends on the database. That arrangement is perfectly serviceable and remains the right shape for a great many applications, particularly those whose behaviour really is reading and writing rows. The narrower observation onion makes is about what happens when the rules are the interesting part: if the foundation of the building is the schema, then the vocabulary of the schema seeps upward, the domain classes take the shape of tables, and the code that expresses the business rules inherits the change schedule of the persistence technology. Turning the stack inside out puts the rules at the bottom of nothing and the infrastructure at the rim, where it depends on the centre instead of the centre depending on it.

Which is why the emphasis in this drawing falls on the domain model being a first-class citizen. The centre is not a collection of data structures waiting for a service layer to operate on them; it is where the behaviour lives, and it is written in the language of the business with no framework vocabulary in it at all. The interfaces the domain needs are declared there too, which is the mechanism that makes the direction possible: a repository interface is part of the model, phrased as the model would phrase it, and the class that implements it with EF Core lives out at the rim among the other details. Domain-driven design supplies most of the vocabulary for what belongs in that centre, and the two are usually found together, though the direction rule stands on its own without any of it.

In a solution the rule is unusually easy to audit, which is the practical reason to adopt it. The domain project references nothing: no ORM package, no web framework, no mapping attributes on entities, and if a reference has appeared, something has been placed in the wrong ring. Composition happens at the outermost edge, where the host wires implementations to the interfaces the centre declared. The characteristic failures are worth watching for. A centre that holds only properties while every rule lives in an application service is a layered application with more projects, and it will feel like ceremony because it is. A separate model per ring turns half the codebase into mapping. And an application with no real rules gains nothing from any of this, so the honest first question is whether there is a domain worth protecting.
