---
title: "Clean Architecture"
summary: "Clean architecture draws the same rule as concentric rings: entities in the middle, use cases around them, adapters and frameworks on the outside, and source-code dependencies that only ever point toward the centre — the hexagon and the onion are the same rule with a different picture."
category: "Application architecture"
tags: ["ef-core"]
scene: hexagonal-architecture
sceneStep: 4
related:
  - label: Hexagonal Architecture
    slug: hexagonal-architecture
  - label: Onion Architecture
    slug: onion-architecture
  - label: Domain-Driven Design
    slug: domain-driven-design
  - label: Adapter
    slug: adapter
  - label: Dependency Injection
    slug: dependency-injection
  - label: Entity
    slug: entity
  - label: Value Object
    slug: value-object
  - label: Repository
    slug: repository
references:
  - title: "Common web application architectures"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures
  - title: "Architectural principles"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/architectural-principles
  - title: "Hexagonal architecture"
    url: https://alistair.cockburn.us/hexagonal-architecture/
---

Clean architecture is the drawing where the layers are rings. The entities sit in the middle and hold the rules that would be true of the business even if there were no software. Around them sit the use cases, which orchestrate those rules for one particular thing the application does. Around those sit the interface adapters that turn the outside world into the shapes the use cases accept, and around everything sits the ring of frameworks, drivers and delivery mechanisms. The one rule attached to the picture is about which way a source-code dependency may point: always inward, never outward, and never mind that the flow of control at run time goes the other way.

That last part is what the rings are really for. A use case has to make the database write something, so control obviously flows from the middle outward; but the reference does not, because the use case calls an interface that it owns and something in an outer ring implements it. Inverting that one dependency is the entire trick, and it is why the picture is drawn with the concrete things on the outside even though they are the things that do the work. If you can point at a `using` statement in the middle that names something in an outer ring, the drawing is decoration.

It is the same rule as the scene you just watched, in a different diagram style. Where the hexagon draws sockets on an edge and calls them ports, the rings draw a boundary between two circles and call it an interface; the onion draws a core with layers around it and calls it the same thing again. All three insist that the middle knows no outside name, all three make the outside implement contracts the middle declared, and all three are checkable in the same way: look at the project references and see whether any of them point the wrong way. Teams have spent a remarkable amount of time arguing about which picture to draw, and almost none of that argument has been about the rule.

Where the drawings differ is in vocabulary and in how many rings they suggest. Clean architecture names four and is explicit that the count is not sacred; hexagonal names none at all and only cares about the boundary; onion tends to be drawn with three or four. The vocabulary difference is worth more than it looks: "use case" is a genuinely useful name for the class that orchestrates one operation, and "entity" pulls in a whole tradition about where invariants live. Borrow the names you find useful and do not treat the ring count as a specification.

The failure modes are also shared, and worth knowing before you adopt any of the three. Rings become folders instead of boundaries, so a project ends up with four assemblies and a reference graph that goes both ways. Interfaces get declared in the outer ring "for convenience" and the inversion quietly disappears. Every ring gets a model of its own and half the codebase becomes mapping code with no rule to protect. And the shape gets applied to a service that has no rules at all, which buys ceremony instead of protection. Pick the drawing your team reads most easily, keep the direction, and spend the argument on something that matters.
