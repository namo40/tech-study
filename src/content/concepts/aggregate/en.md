---
title: "Aggregate"
summary: "The unit one transaction is allowed to cover. It takes a command, checks the rules it alone is responsible for, and produces the events that follow — which is why consistency is guaranteed inside it and negotiated outside it."
category: "Application architecture"
level: 7
scene: event-sourcing
sceneStep: 1
related:
  - label: Event Sourcing
    slug: event-sourcing
  - label: Event Replay
    slug: event-replay
  - label: Snapshot
    slug: snapshot
  - label: Domain-Driven Design
    slug: domain-driven-design
  - label: Aggregate Root
    slug: aggregate-root
  - label: CQRS
    slug: command-query-responsibility-segregation
  - label: Saga
    slug: saga
  - label: Unit of Work
    slug: unit-of-work
  - label: Optimistic Concurrency
    slug: optimistic-concurrency
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Local Transaction
    slug: local-transaction
references:
  - title: "Event Sourcing pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing
  - title: "Apply simplified CQRS and DDD patterns in a microservice"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/apply-simplified-microservice-cqrs-ddd-patterns
  - title: "Creating and configuring a model in EF Core"
    url: https://learn.microsoft.com/en-us/ef/core/modeling/
---

The first step of the scene has three moving parts and only one of them decides anything. A command comes down from the App, the Order looks at it, and an event goes out to the log. The Order is the aggregate, and the reason it sits between the two is that somebody has to be responsible for the rules — `you cannot add an item to an order that is already paid` is a sentence with a subject, and the aggregate is that subject.

The definition worth memorising is narrow: an aggregate is the boundary one transaction may cover. Everything inside it is consistent the instant a command returns, because one lock, one version check and one commit protect the whole of it. Everything outside it is consistent later, through events, sagas, retries and apologies. That single sentence is doing most of the design work in any system built this way, because it turns "which entities belong together" from a taste question into an arithmetic one: draw the boundary around exactly the data a single rule needs to read in order to say yes or no.

Which is why aggregates should be small, and why the instinct to make them large is usually wrong. A big aggregate looks safer because more invariants sit inside a transaction, but it also means more commands contend for the same version number, and a queue forms behind whichever one is slowest. An `Order` that owns its lines is right if the rule is about the order's total. An `Order` that also owns the customer, their address book and their loyalty points is a lock on the customer every time anybody buys anything. If two pieces of data never appear together in the same rule, they do not belong in the same boundary, however natural the noun sounds.

The aggregate is also the only thing allowed to produce events, and that is what keeps the log trustworthy. In the scene, nothing writes to the Log except by going through the Order first. If some other piece of code could append an `ItemAdded` directly, the invariant would live in two places and it would eventually be enforced in one of them only. So the shape is always the same: the command asks, the aggregate validates against state it rebuilt from its own events, and if the answer is yes it raises an event, applies it to itself, and hands it to the store. The state on the card is a consequence of that event, never a separate assignment.

Concurrency falls out of the boundary rather than being bolted on. Each aggregate has a version, which is the sequence number of its last event; an append carries the version the command was decided against, and the store refuses it if somebody else has moved on. That is optimistic concurrency with no extra column: the check is the primary key. When it fails, the honest move is usually to reload, re-decide and retry, because the command was expressed as an intention (`add this item`) rather than as a result (`set items to 3`), and an intention can be reapplied to a newer state without asking a human.

The last thing an aggregate is good for is deciding what a transaction should *not* cover. Once a command needs two aggregates to agree, you are not allowed to open one transaction over both of them, and the design has to say what happens instead: a saga that coordinates them with compensations, an eventually consistent read that tolerates being a moment behind, or a redraw of the boundary because the rule was telling you the two things are really one. That refusal is the aggregate's most useful property. It makes the distributed part of the problem visible at design time, rather than at three in the morning when a lock has spanned two services.
