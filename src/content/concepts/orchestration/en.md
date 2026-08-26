---
title: "Orchestration"
summary: "Orchestration is a saga with a coordinator: one component sends every command, records the state each answer moves the saga to, and issues the compensations itself when a step fails."
category: "Distributed transactions and message consistency"
tags: ["consistency"]
scene: saga
sceneStep: 3
related:
  - label: Saga
    slug: saga
  - label: Choreography
    slug: choreography
  - label: State Machine
    slug: state-machine
  - label: Compensating Transaction
    slug: compensating-transaction
  - label: Correlation ID
    slug: correlation-id
  - label: Transactional Outbox
    slug: transactional-outbox
  - label: MassTransit
    slug: masstransit
references:
  - title: Saga distributed transactions pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/saga
  - title: MassTransit sagas
    url: https://masstransit.io/documentation/patterns/saga
  - title: Durable Functions overview
    url: https://learn.microsoft.com/en-us/azure/azure-functions/durable/durable-functions-overview
---

The coordinator holds the sequence. It sends `Charge` to Payment, waits for the answer, writes down that the saga is now `Paid`, sends `Reserve` to Inventory, and so on. The services no longer subscribe to each other; they expose commands and answer them, which makes them simpler than under choreography, because none of them needs to know what comes next or who to tell when something goes wrong.

The state is the point. One row says where every order is, so "why has order #12 not shipped?" is a query rather than an investigation. Because the sequence lives in one place, changing it is one edit; because failure handling lives there too, the compensation is issued by the component that actually knows which steps completed. Timeouts belong to the coordinator as well: it is the only thing that can notice that a step it sent forty seconds ago has still not answered.

The price is a dependency and a temptation. Nothing moves while the coordinator is down, so its store has to be durable and its restart has to resume from the recorded state rather than from the beginning. The temptation is to let it grow: the coordinator should sequence steps and nothing else, with the domain rules kept in the services, or it slowly becomes the one component that has to change for every feature.

In .NET this is usually a state machine rather than a procedure. MassTransit, Dapr Workflow, Durable Functions and Temporal all do the same three things: they persist the instance, they resume it after a crash, and they turn each answer into a transition. Save the state and publish the next command in one transaction through an outbox, key every handler on the correlation id, and give the saga a timeout on every state, so a step that never answers ends up as an alert instead of a row that sits in `Paid` for a week.
