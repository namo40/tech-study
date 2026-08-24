---
title: "Choreography"
summary: "Choreography is a saga with no coordinator: each service commits its own local transaction, publishes an event, and whoever subscribed to that event runs the next step. The flow is not written down anywhere; it is the sum of the subscriptions."
category: "Distributed transactions and message consistency"
scene: saga
sceneStep: 1
related:
  - label: Saga
    slug: saga
  - label: Orchestration
    slug: orchestration
  - label: Competing Consumers
    slug: competing-consumers
  - label: Idempotent Consumer
    slug: idempotent-consumer
  - label: Transactional Outbox
    slug: transactional-outbox
  - label: Correlation ID
    slug: correlation-id
references:
  - title: Saga distributed transactions pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/saga
  - title: Event-driven architecture style
    url: https://learn.microsoft.com/en-us/azure/architecture/guide/architecture-styles/event-driven
  - title: MassTransit sagas
    url: https://masstransit.io/documentation/patterns/saga
---

Order commits its row and publishes `OrderPlaced`. Payment subscribes to that event, takes the money, and publishes `PaymentCompleted`. Inventory subscribes to that one and reserves the stock. No service is told what the whole sequence is, and none of them calls the next one: each knows only which event it reacts to and which event it publishes. Adding a step means adding a subscriber, which is why choreography feels so cheap at the start.

What it buys is independence. There is no component that has to be up for the flow to move, no shared deployment, and no place where a change to one service forces a change to another. A team can add a fraud check to the same event without asking anyone, and the services stay small: each one is a handler and a publisher.

What it costs is the flow itself. Nowhere in the code does the sequence appear, so answering "where is order #12 and why has it stopped?" means reading logs in three services and reconstructing the chain by hand. Failure handling spreads too: when Inventory cannot reserve, it has to know that Payment is the one to tell, so a piece of the saga's knowledge ends up in a service that should not need it. Cycles are easy to create by accident, and a reordering of the steps is a change to several subscriptions at once.

Make it survivable with three habits. Publish through an outbox in the same transaction that commits the row, so a step never commits without its event. Put a correlation id on every message and log it everywhere, so the chain can be reassembled after the fact. Make every consumer safe to run twice, because the broker delivers at least once. When the flow grows past a handful of steps, or grows branches, that is the moment to move it into an orchestrator instead of adding one more subscription.
