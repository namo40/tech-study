---
title: "Saga"
summary: "A saga is a business transaction spread across services as a sequence of local transactions. There is no rollback across them: when a step fails, the earlier steps are undone by compensating actions, and past the pivot the only way is forward."
category: "Distributed transactions and message consistency"
tags: ["consistency"]
scene: saga
steps:
  - title: "Choreography"
    text: "Each service commits its own local transaction and publishes an event; the next service reacts. Nobody is in charge. The flow is whatever the subscriptions add up to."
  - title: "Compensate, in reverse"
    text: "Inventory fails after payment has already been taken. Nothing can roll that back, so Payment runs a refund and Order cancels: each earlier step has a compensating action, applied in reverse order."
  - title: "Orchestration"
    text: "A saga coordinator sends each command, records the state, and on failure issues the compensations itself. You can see where every order is; you also depend on the coordinator being there."
  - title: "The pivot"
    text: "Some steps cannot be undone, or you decide not to undo them: a sent email, a captured payment you will not refund. Mark that step as the pivot; before it compensate backwards, after it retry forwards. Every step must be safe to repeat."
related:
  - label: Choreography
    slug: choreography
  - label: Orchestration
    slug: orchestration
  - label: Compensating Transaction
    slug: compensating-transaction
  - label: Pivot Transaction
    slug: pivot-transaction
  - label: Transactional Outbox
    slug: transactional-outbox
  - label: Idempotency
    slug: idempotency
  - label: Correlation ID
    slug: correlation-id
  - label: Two-Phase Commit
    slug: two-phase-commit
  - label: State Machine
    slug: state-machine
  - label: MassTransit
    slug: masstransit
references:
  - title: Saga distributed transactions pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/saga
  - title: Compensating Transaction pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/compensating-transaction
  - title: MassTransit sagas
    url: https://masstransit.massient.com/concepts/saga-state-machines
---

## When to use

- A business operation spans services that each own their data, and a single ACID transaction across all of them is not available or not wanted.
- The work can be put in order, and every step either has a compensating action that undoes it or is safe to retry until it succeeds.
- The operation runs long enough that holding a lock across it would cost more than living with an intermediate state other readers can see.

## Cautions

- Compensation is not rollback. Other readers may already have seen the intermediate state, so the domain has to be designed for it: reserved rather than shipped, pending rather than delivered.
- Identify the pivot explicitly, and put it as late in the order as you can. Before it, compensate backwards; after it, only retry forwards, because a sent email, or a captured payment you have chosen not to refund, has no undo.
- Every step and every compensation must be safe to run twice, keyed by the saga id, because messages are delivered at least once.
- Persist the saga state when a coordinator runs the flow, and make the event flow observable when the services run it between themselves. A saga you cannot see is a saga you cannot repair.
- Use an outbox so that committing the local transaction and publishing the event cannot come apart. A step that commits without publishing leaves a saga stuck halfway with nothing to react to.
- Choose the shape by size. Choreography keeps services independent and hides the flow; orchestration puts the flow in one place and puts the coordinator on the critical path.

## In .NET

MassTransit models an orchestrated saga as a state machine: the instance holds the correlation id and the current state, and each transition sends the next command. The interesting part is the failure branch, which is where the pivot shows up in code.

```csharp
public sealed class OrderState : SagaStateMachineInstance
{
    public Guid CorrelationId { get; set; }
    public string CurrentState { get; set; } = "";
    public int Attempts { get; set; }
}

public sealed class OrderSaga : MassTransitStateMachine<OrderState>
{
    public State Reserving { get; private set; } = null!;
    public State Charging { get; private set; } = null!;
    public State Paid { get; private set; } = null!;
    public State Cancelled { get; private set; } = null!;

    public Event<OrderSubmitted> Submitted { get; private set; } = null!;
    public Event<StockReserved> StockDone { get; private set; } = null!;
    public Event<ReservationFailed> StockFailed { get; private set; } = null!;
    public Event<PaymentCompleted> PaymentDone { get; private set; } = null!;
    public Event<PaymentDeclined> PaymentRefused { get; private set; } = null!;
    public Event<ConfirmationFailed> ConfirmFailed { get; private set; } = null!;

    public OrderSaga()
    {
        InstanceState(x => x.CurrentState);

        // A Send with no address resolves through the endpoint conventions, so
        // EndpointConvention.Map<ReserveStock>(new Uri("queue:inventory")) has to
        // have run at startup; otherwise use the Send(Uri, ...) overload.
        Initially(When(Submitted)
            .Send(ctx => new ReserveStock(ctx.Saga.CorrelationId))
            .TransitionTo(Reserving));

        // The reversible step goes first, so a failure here costs nothing.
        During(Reserving,
            When(StockDone).Send(ctx => new ChargePayment(ctx.Saga.CorrelationId)).TransitionTo(Charging),
            When(StockFailed).TransitionTo(Cancelled));

        // Still before the pivot: a declined card is compensated by giving the
        // reservation back, and the saga ends without owing anyone anything.
        During(Charging,
            When(PaymentRefused)
                .Send(ctx => new ReleaseStock(ctx.Saga.CorrelationId))
                .TransitionTo(Cancelled),
            When(PaymentDone)
                .TransitionTo(Paid)                             // the pivot: money is taken
                .Send(ctx => new ConfirmOrder(ctx.Saga.CorrelationId)));

        // Past the pivot there is nothing left to compensate, so the only branch
        // is forward: retry inside a budget, then hand it to a person.
        During(Paid,
            When(ConfirmFailed)
                .IfElse(ctx => ctx.Saga.Attempts++ < 3,
                    retry => retry.Send(ctx => new ConfirmOrder(ctx.Saga.CorrelationId)),
                    give => give.Publish(ctx => new OrderNeedsAttention(ctx.Saga.CorrelationId))));
    }
}
```

Keep the saga state in a real store, EF Core or Redis, so a coordinator that restarts picks the flow back up where it stopped. Publish commands through an outbox in the same transaction that saves the state, and filter duplicates in every handler by `CorrelationId`, because the same command will arrive twice sooner or later.
