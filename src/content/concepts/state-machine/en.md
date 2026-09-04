---
title: "State Machine"
summary: "A state machine names the states a thing can be in and the events that move it between them. Anything not in the table cannot happen, the current state can be stored and resumed, and a long-running process becomes a machine that waits, times out, and retries one step at a time."
category: "Scheduled work and workflows"
scene: state-machine
steps:
  - title: "States and events"
    text: "An order is Draft, Submitted, Paid, Shipped, or Delivered, and only the listed events move it. Shipping an order nobody has paid for is not an error path you have to write; it is simply not in the table."
  - title: "Guards and actions"
    text: "A transition can carry a condition that has to hold and an action that runs on the way through. The table holds what a pile of nested ifs would hide: every state, every allowed event, and what happens on each edge."
  - title: "Persist it"
    text: "The current state is a row in the store, so a restart resumes exactly where it stopped. And time is an event too: a submitted order nobody pays for expires when its timer fires."
  - title: "Long-running"
    text: "A process that waits for an approval, retries a flaky step and survives restarts is a state machine with a durable history. A workflow engine replays that history to rebuild the state, so the code reads like a straight line."
related:
  - label: Durable Workflow
    slug: durable-workflow
  - label: Long-Running Process
    slug: long-running-process
  - label: Human Approval
    slug: human-approval
  - label: Workflow Engine
    slug: workflow-engine
  - label: Retryable Step
    slug: retryable-step
  - label: Scheduled Job
    slug: scheduled-job
  - label: Saga
    slug: saga
  - label: Orchestration
    slug: orchestration
  - label: Idempotency
    slug: idempotency
  - label: Azure Durable Functions
    slug: azure-durable-functions
  - label: Temporal
    slug: temporal
  - label: Dapr Workflow
    slug: dapr-workflow
references:
  - title: "Stateless, a state machine library for .NET"
    url: https://github.com/dotnet-state-machine/stateless
  - title: "Durable Functions overview"
    url: https://learn.microsoft.com/en-us/azure/durable-task/durable-functions/durable-functions-overview
  - title: "Dapr Workflow overview"
    url: https://docs.dapr.io/developing-applications/building-blocks/workflow/workflow-overview/
---

## When to use

- Any entity with a lifecycle: orders, subscriptions, documents, jobs, connections. If the domain already talks about a thing being *in* something, the states are already named and only the table is missing.
- The rules about what may happen next depend on where the thing is now, and those rules are worth reading in one place instead of being scattered across the handlers that enforce them.
- The process has waits, deadlines, retries, or human steps that outlive a single request, so the code cannot simply run to the end on one thread.
- Two people disagree about whether some sequence is legal. A table settles it, and the argument becomes a review of five lines rather than a tour of the call sites.

## Cautions

- Name the states and the events first; the table is the specification. If a transition is missing, that is a decision, not a bug, and it should be as easy to point at as the ones that are there.
- Persist the state and the pending timers. A restart has to rebuild from what was written down, not guess from what is in memory, and a deadline that lives only in a `Timer` object dies with the process holding it.
- Make transitions safe to repeat: the same event delivered twice must not move the machine twice. Deduplicate by event id, or make the handler check the state it expects to be leaving.
- Watch the state count. Seven states with four events is a table; forty states with thirty events is a diagram nobody reads. Split it into a machine per aggregate, or promote the parts that vary into data.
- Changing a workflow's code while instances are in flight needs versioning. An engine that rebuilds state by replaying history will replay the old history through the new code, so the shape of what already happened has to stay understandable to it.
- Choose the tool by scale: a library for in-process lifecycles, a saga for steps that span services, a workflow engine for processes that run for days with waits and retries.

## In .NET

`Stateless` puts the table in code. The machine reads and writes the state through the two functions it is given, so the state itself lives in your entity and goes to the database with the rest of it.

```csharp
public enum OrderState { Draft, Submitted, Paid, Shipped, Delivered, Cancelled, Expired }
public enum OrderTrigger { Submit, Pay, Ship, Deliver, Cancel, Timeout }

var machine = new StateMachine<OrderState, OrderTrigger>(() => order.State, s => order.State = s);

machine.Configure(OrderState.Draft)
    .Permit(OrderTrigger.Submit, OrderState.Submitted);

machine.Configure(OrderState.Submitted)
    .PermitIf(OrderTrigger.Pay, OrderState.Paid, () => payments.IsConfirmed(order.Id))   // guard
    .Permit(OrderTrigger.Cancel, OrderState.Cancelled)
    .Permit(OrderTrigger.Timeout, OrderState.Expired);

machine.Configure(OrderState.Paid)
    .OnEntryAsync(() => mail.SendReceiptAsync(order.Id))                                  // action
    .Permit(OrderTrigger.Ship, OrderState.Shipped)
    .Permit(OrderTrigger.Cancel, OrderState.Cancelled);

machine.Configure(OrderState.Shipped).Permit(OrderTrigger.Deliver, OrderState.Delivered);

if (machine.CanFire(OrderTrigger.Ship)) await machine.FireAsync(OrderTrigger.Ship);
await db.SaveChangesAsync(ct);   // the state is a column; timers are rows with a due time
```

`CanFire` is the whole point of the table: asking whether an event is legal costs nothing and never depends on reading the handler that would run it.

For a process that runs for days, hand the machine to an engine that keeps the history itself. Azure Durable Functions, the Temporal .NET SDK and Dapr Workflow all rebuild an instance's state by replaying what has already happened to it, which is what lets an orchestration be written as ordinary sequential code that awaits a timer or an external event and picks up again on a different machine. Where the steps belong to different services rather than to one process, join them with a saga instead — a MassTransit state machine is the usual .NET shape — and let it hold the coordination.
