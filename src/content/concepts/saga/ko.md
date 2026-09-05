---
title: "Saga"
summary: "Saga는 여러 서비스에 걸친 업무 트랜잭션을 로컬 트랜잭션의 연속으로 처리하는 방식입니다. 전체를 rollback할 수는 없어서, 한 단계가 실패하면 앞선 단계들을 보상 동작으로 되돌리고, pivot을 지난 뒤에는 앞으로 나아가는 길밖에 없습니다."
category: "분산 트랜잭션과 메시지 일관성"
scene: saga
steps:
  - title: "Choreography"
    text: "각 서비스가 자기 로컬 트랜잭션을 commit하고 이벤트를 발행하면 다음 서비스가 반응합니다. 지휘자는 없습니다. 흐름은 구독들을 합친 결과입니다."
  - title: "거꾸로 보상합니다"
    text: "결제가 이미 끝난 뒤에 재고 확보가 실패합니다. 그것을 rollback할 수는 없으므로 Payment가 환불을 실행하고 Order가 취소합니다. 앞선 단계마다 보상 동작이 있고, 역순으로 적용됩니다."
  - title: "Orchestration"
    text: "Saga 조정자가 명령을 하나씩 보내고, 상태를 기록하고, 실패하면 보상을 직접 지시합니다. 모든 주문이 어디까지 왔는지 보이는 대신 조정자에 의존하게 됩니다."
  - title: "pivot"
    text: "되돌릴 수 없는 단계, 또는 되돌리지 않기로 정한 단계가 있습니다. 이미 보낸 이메일, 환불하지 않을 확정된 결제가 그렇습니다. 그 단계를 pivot으로 표시하고, 그 앞에서는 거꾸로 보상하고 그 뒤에서는 앞으로 재시도합니다. 모든 단계는 반복해도 결과가 같아야 합니다."
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

## 언제 쓰나

- 업무 하나가 각자 데이터를 소유한 여러 서비스에 걸쳐 있고, 그 전체를 묶는 ACID 트랜잭션을 쓸 수 없거나 쓰고 싶지 않을 때.
- 일을 순서대로 늘어놓을 수 있고, 각 단계마다 그것을 되돌리는 보상 동작이 있거나 성공할 때까지 재시도해도 안전할 때.
- 작업이 충분히 길어서, 그동안 잠금을 잡고 있는 비용이 중간 상태를 남들이 보는 비용보다 클 때.

## 주의점

- 보상은 rollback이 아닙니다. 중간 상태를 이미 본 쪽이 있을 수 있으므로 도메인 자체를 그에 맞게 설계해야 합니다. 배송 완료가 아니라 확보, 전달 완료가 아니라 진행 중처럼 말입니다.
- pivot을 명시적으로 정하고, 순서에서 최대한 뒤에 둡니다. 그 앞에서는 거꾸로 보상하고, 그 뒤에서는 앞으로 재시도만 합니다. 이미 보낸 이메일이나 환불하지 않기로 한 확정된 결제에는 되돌리기가 없기 때문입니다.
- 메시지는 최소 한 번 전달되므로, 모든 단계와 모든 보상은 saga id를 키로 삼아 두 번 실행돼도 안전해야 합니다. 반복해도 결과가 같게(idempotent) 만들어야 한다는 뜻입니다.
- 조정자가 흐름을 이끄는 경우에는 saga 상태를 저장하고, 서비스끼리 주고받는 경우에는 이벤트 흐름을 관측할 수 있게 합니다. 보이지 않는 saga는 고칠 수도 없습니다.
- outbox를 써서 로컬 트랜잭션을 commit하는 일과 이벤트를 발행하는 일이 서로 어긋나지 않게 합니다. commit만 되고 발행이 빠지면 반응할 상대가 없는 saga가 중간에 멈춰 있게 됩니다.
- 규모에 맞는 모양을 고릅니다. Choreography는 서비스를 독립적으로 두는 대신 흐름을 감추고, Orchestration은 흐름을 한곳에 모으는 대신 조정자를 임계 경로에 올립니다.

## .NET에서는

MassTransit은 조정자가 이끄는 saga를 상태 머신으로 표현합니다. 인스턴스가 correlation id와 현재 상태를 들고 있고, 전이마다 다음 명령을 보냅니다. 눈여겨볼 곳은 실패 분기입니다. pivot이 코드에 드러나는 자리가 거기입니다.

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

        // 주소 없는 Send는 엔드포인트 관례로 해석되므로,
        // EndpointConvention.Map<ReserveStock>(new Uri("queue:inventory"))가
        // 시작 시점에 돌아 있어야 합니다. 아니면 Send(Uri, ...) 오버로드를 씁니다.
        Initially(When(Submitted)
            .Send(ctx => new ReserveStock(ctx.Saga.CorrelationId))
            .TransitionTo(Reserving));

        // 되돌릴 수 있는 단계가 먼저 갑니다. 그래서 여기서 실패해도 치를 것이 없습니다.
        During(Reserving,
            When(StockDone).Send(ctx => new ChargePayment(ctx.Saga.CorrelationId)).TransitionTo(Charging),
            When(StockFailed).TransitionTo(Cancelled));

        // 아직 pivot 앞입니다. 거절된 카드는 예약을 돌려주는 것으로 보상되고,
        // saga는 누구에게도 빚지지 않은 채 끝납니다.
        During(Charging,
            When(PaymentRefused)
                .Send(ctx => new ReleaseStock(ctx.Saga.CorrelationId))
                .TransitionTo(Cancelled),
            When(PaymentDone)
                .TransitionTo(Paid)                             // pivot입니다. 돈이 빠져나갑니다
                .Send(ctx => new ConfirmOrder(ctx.Saga.CorrelationId)));

        // pivot을 지나면 보상할 것이 남아 있지 않으므로 갈 길은 앞으로뿐입니다.
        // 예산 안에서 재시도하고, 그다음에는 사람에게 넘깁니다.
        During(Paid,
            When(ConfirmFailed)
                .IfElse(ctx => ctx.Saga.Attempts++ < 3,
                    retry => retry.Send(ctx => new ConfirmOrder(ctx.Saga.CorrelationId)),
                    give => give.Publish(ctx => new OrderNeedsAttention(ctx.Saga.CorrelationId))));
    }
}
```

saga 상태는 EF Core나 Redis 같은 실제 저장소에 두어, 조정자가 재시작해도 멈춘 지점부터 이어가게 합니다. 명령은 상태를 저장하는 트랜잭션과 같은 트랜잭션 안에서 outbox를 거쳐 발행하고, 각 핸들러는 `CorrelationId`로 중복을 걸러 냅니다. 같은 명령이 두 번 도착하는 일은 언젠가 반드시 일어납니다.
