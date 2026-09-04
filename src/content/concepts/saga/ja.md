---
title: "Saga"
summary: "Saga は、複数のサービスにまたがる業務トランザクションをローカルトランザクションの連なりとして進める方式です。全体を rollback することはできず、あるステップが失敗したら先行するステップを補償アクションで取り消し、pivot を過ぎたあとは前に進むしかありません。"
category: "分散トランザクションとメッセージ一貫性"
scene: saga
steps:
  - title: "Choreography"
    text: "各サービスが自分のローカルトランザクションを commit してイベントを発行し、次のサービスが反応します。指揮者はいません。流れは購読の合計そのものです。"
  - title: "逆順に補償する"
    text: "決済がすでに済んだあとで在庫の確保が失敗します。それを rollback することはできないので、Payment が返金を実行し、Order が取り消します。先行する各ステップには補償アクションがあり、逆順に適用されます。"
  - title: "Orchestration"
    text: "Saga のコーディネーターが各コマンドを送り、状態を記録し、失敗時には自分で補償を指示します。すべての注文がどこまで進んだか見える代わりに、コーディネーターに依存することになります。"
  - title: "pivot"
    text: "元に戻せないステップがあります。確定した決済、送ってしまったメールがそうです。そのステップを pivot と定め、その前では逆向きに補償し、その後では残りが成功するまで前向きに再試行します。すべてのステップは繰り返しても結果が同じでなければなりません。"
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

## いつ使うか

- ひとつの業務が、それぞれ自分のデータを持つ複数のサービスにまたがっていて、全体をひとつの ACID トランザクションで包むことができない、または包みたくない場合。
- 作業を順番に並べられて、各ステップに取り消すための補償アクションがあるか、成功するまで再試行しても安全な場合。
- 処理が長く、その間ロックを保持する代償のほうが、途中の状態を他から見られる代償より大きい場合。

## 注意点

- 補償は rollback ではありません。途中の状態をすでに見た相手がいる可能性があるので、ドメインのほうをそれに合わせて設計します。出荷済みではなく確保済み、配達済みではなく処理中、といった具合です。
- pivot を明示的に決めます。その前では逆向きに補償し、その後では前向きの再試行だけを行います。確定した決済や送信済みのメールに取り消しはないからです。
- メッセージは少なくとも一度は届くので、すべてのステップとすべての補償は saga id をキーにして二度実行されても安全、つまり冪等でなければなりません。
- コーディネーターが流れを進めるならば saga の状態を永続化し、サービス同士でやり取りするならばイベントの流れを観測できるようにします。見えない saga は直すこともできません。
- outbox を使い、ローカルトランザクションの commit とイベントの発行がばらばらにならないようにします。commit だけされて発行が漏れると、反応する相手のいない saga が途中で止まったままになります。
- 規模に合った形を選びます。Choreography はサービスを独立させる代わりに流れを隠し、Orchestration は流れを一か所に集める代わりにコーディネーターをクリティカルパスに置きます。

## .NET では

MassTransit は、コーディネーター型の saga をステートマシンとして表現します。インスタンスが correlation id と現在の状態を持ち、遷移ごとに次のコマンドを送ります。見どころは失敗の分岐です。pivot がコードに現れるのはそこです。

```csharp
public sealed class OrderState : SagaStateMachineInstance
{
    public Guid CorrelationId { get; set; }
    public string CurrentState { get; set; } = "";
    public int Attempts { get; set; }
}

public sealed class OrderSaga : MassTransitStateMachine<OrderState>
{
    public State Paid { get; private set; } = null!;
    public State Reserved { get; private set; } = null!;
    public State Cancelled { get; private set; } = null!;

    public Event<OrderSubmitted> Submitted { get; private set; } = null!;
    public Event<PaymentCompleted> PaymentDone { get; private set; } = null!;
    public Event<StockReserved> StockDone { get; private set; } = null!;
    public Event<ReservationFailed> StockFailed { get; private set; } = null!;

    public OrderSaga()
    {
        InstanceState(x => x.CurrentState);

        Initially(When(Submitted)
            .Send(ctx => new ChargePayment(ctx.Saga.CorrelationId))
            .TransitionTo(Paid));                               // the pivot: money is taken

        During(Paid, When(PaymentDone)
            .Send(ctx => new ReserveStock(ctx.Saga.CorrelationId)));

        During(Paid,
            When(StockDone).Send(ctx => new ConfirmOrder(ctx.Saga.CorrelationId)).TransitionTo(Reserved),
            When(StockFailed)
                .IfElse(ctx => ctx.Message.Transient && ctx.Saga.Attempts++ < 3,
                    retry => retry.Send(ctx => new ReserveStock(ctx.Saga.CorrelationId)),   // forward, past the pivot
                    give => give.Send(ctx => new RefundPayment(ctx.Saga.CorrelationId)).TransitionTo(Cancelled)));
    }
}
```

saga の状態は EF Core や Redis のような実際のストアに置き、コーディネーターが再起動しても止まった地点から続けられるようにします。コマンドは状態を保存するトランザクションと同じトランザクション内で outbox を経由して発行し、各ハンドラーは `CorrelationId` で重複を弾きます。同じコマンドが二度届くことは、いつか必ず起こります。
