---
title: "Bounded Context"
summary: "The border of a model, drawn where the language changes. Inside it one word means exactly one thing, and outside it the same word belongs to somebody else's model."
category: "Application architecture"
tags: ["consistency"]
scene: domain-driven-design
sceneStep: 2
related:
  - label: Domain-Driven Design
    slug: domain-driven-design
  - label: Aggregate Root
    slug: aggregate-root
  - label: Anti-Corruption Layer
    slug: anti-corruption-layer
  - label: Aggregate
    slug: aggregate
  - label: Event Sourcing
    slug: event-sourcing
  - label: CQRS
    slug: command-query-responsibility-segregation
  - label: Repository
    slug: repository
  - label: Entity
    slug: entity
  - label: Value Object
    slug: value-object
  - label: Hexagonal Architecture
    slug: hexagonal-architecture
  - label: Transactional Outbox
    slug: transactional-outbox
references:
  - title: "Using domain analysis to model microservices"
    url: https://learn.microsoft.com/en-us/azure/architecture/microservices/model/domain-analysis
  - title: "Design a DDD-oriented microservice"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/ddd-oriented-microservice
  - title: "Anti-corruption Layer pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/anti-corruption-layer
---

The second step of the scene draws the same word twice. Sales has an Order with a price and a total; Shipping has an Order with an address and a count of boxes. Neither card is a subset of the other, neither is waiting to be merged into the other, and neither is wrong. That is a bounded context: the region inside which one word means exactly one thing, together with the promise that outside it the word belongs to somebody else.

The border is drawn where the language changes, and the language is the evidence. When the sales team says "order" they mean a thing with a price, a discount and a customer who might still cancel. When the warehouse says "order" they mean a thing with a weight, a destination and a picking sequence. Neither is a partial view of some truer Order that nobody has written down yet. They are two models of the same real-world event, each shaped by the questions its owner has to answer, and the attempt to merge them produces an object that answers neither set of questions well. The first step of the scene is that merged object, growing a field at a time until every change to it has to be negotiated with four departments.

What the border actually buys is the right to be small. Inside a context you can say `Order.Total` and mean one thing, write a validation rule and know where it applies, and delete a field without asking anybody, because everything that depends on it is inside the border with you. Outside the border nobody is holding your classes, so their release schedule is not your release schedule. That independence is the whole return on the modelling work, and it is why the border is about ownership before it is about anything technical.

It is worth being precise about what a border is not. It is not a deployment boundary: a modular monolith with two contexts that never read each other's tables honours the border completely, and a fleet of services sharing one `Entities` assembly violates it while looking like the modern thing. It is not a namespace: a namespace nobody enforces is a naming convention with good intentions. And it is not a wall against people, which is the reading that makes teams resist it. Two contexts talk constantly; what they do not do is share a class.

Where two contexts meet you write down the relationship rather than leaving it to habit. The comfortable case is a published contract — Evans's *published language*, served by an *open host service*: the upstream context publishes events in its own language and the downstream one translates them into its own model, which is what the fourth step of the scene shows. The uncomfortable case is a model you do not control leaking in, and the answer there is an anti-corruption layer: one small class whose entire job is to turn their shape into yours, so that a rename in their code is a compile error in one file rather than a change to your domain. Both are drawn on the same map, and that map has a name worth knowing: the *context map*, the contexts and the translations between them, is the architecture. The code is downstream of it.

The practical test for whether you have found a real border is the glossary. Take a word that matters and ask two people from different parts of the business to define it. If the definitions differ in a way that matters, the border runs between them, and the honest move is to give each side its own model and a translation rather than a shared table and a long argument. If the definitions agree, there is one context there, and drawing a border through it will cost you a translation layer that buys nothing.
