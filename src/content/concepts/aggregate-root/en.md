---
title: "Aggregate Root"
summary: "The one door into a consistency boundary. Every change goes through it, it checks the invariant on the way through, and everything outside holds its id rather than a reference to anything inside."
category: "Application architecture"
tags: ["consistency"]
scene: domain-driven-design
sceneStep: 3
related:
  - label: Domain-Driven Design
    slug: domain-driven-design
  - label: Bounded Context
    slug: bounded-context
  - label: Aggregate
    slug: aggregate
  - label: Repository
    slug: repository
  - label: Entity
    slug: entity
  - label: Value Object
    slug: value-object
  - label: Unit of Work
    slug: unit-of-work
  - label: Optimistic Concurrency
    slug: optimistic-concurrency
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Saga
    slug: saga
  - label: Event Sourcing
    slug: event-sourcing
references:
  - title: "Designing a microservice domain model"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/microservice-domain-model
  - title: "Design a DDD-oriented microservice"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/ddd-oriented-microservice
  - title: "Creating and configuring a model in EF Core"
    url: https://learn.microsoft.com/en-us/ef/core/modeling/
---

The third step of the scene puts a guard on a door and sends two kinds of write at it. One comes through the Order and is checked against the invariant, the total against the sum of the lines, and passes. One tries to reach a line directly, and is refused before it can touch anything. That refusal is the aggregate root's entire job description: it is the only way in, so the rule it enforces cannot be enforced in two places and therefore cannot be enforced in one of them only.

The word "root" is doing real work there. An aggregate is a small group of objects that has to be consistent as a unit, and the root is the member of that group that outsiders are allowed to name. Everything else inside is reachable only through it. That is what makes the invariant checkable at all: if a caller could load a line and save it, the sentence "the total must match the sum of the lines" would have no place to live, because the code that could break it would not be the code that knows about it. One door is not a stylistic preference, it is the precondition for having a rule.

The rule the root owns is also what tells you how big the aggregate should be. Draw the boundary around exactly the data one invariant needs to read in order to answer yes or no, and stop there. If the rule is about an order's total, the order and its lines are one aggregate. If somebody suggests adding the customer, ask which invariant needs the customer inside the same transaction; usually there is none, and adding it means a lock on the customer every time anybody buys anything. Where there is no invariant at all, there is no aggregate, and a root over a group of unrelated entities is ceremony that costs you contention and buys you nothing.

Outside the boundary, references are by id. Sales' Order holds a `CustomerId`, not a `Customer`, and nothing outside the order holds an `OrderLine`. This looks like an inconvenience for about a week and then starts paying: an id cannot be lazily loaded into a surprise query, cannot drag a second aggregate into your transaction, and cannot let a caller mutate something that belongs to another root. When you genuinely need both, you load both explicitly and you can see the cost in the code.

The other half of that rule is what it forbids. One transaction covers one aggregate. When a change genuinely needs two aggregates to agree, you are not allowed to open a transaction across both of them, and the design has to say what happens instead: a saga with compensations, an eventually consistent read that tolerates being a moment behind, or a redraw of the boundary because the two things were really one. That refusal is the most useful thing the pattern does, because it makes the distributed part of the problem visible while you are still drawing boxes.

The neighbouring page on the aggregate looks at the same object through event sourcing, where the interesting question is how a command becomes an event and how a log becomes state. Here the question is narrower and older: where does the boundary go, who is allowed to knock, and what is always true when the door closes. Concurrency then falls out of the same boundary rather than being bolted on, because the aggregate is the unit a version number belongs to. A write carries the version it was decided against, the store refuses it if somebody else has moved on, and the honest response is to reload, re-decide and retry.
