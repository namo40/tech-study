---
title: "State Machine"
summary: "状態機械は、あるものが取りうる状態と、その間を動かすイベントに名前を付けて表にしたものです。表にないことは起こりえず、現在の状態は保存して再開でき、長く走るプロセスは待ち、期限切れになり、一歩ずつ再試行する機械になります。"
category: "スケジュールされた作業とワークフロー"
scene: state-machine
steps:
  - title: "状態とイベント"
    text: "注文は Draft、Submitted、Paid、Shipped、Delivered のいずれかで、表に書かれたイベントだけが状態を動かします。誰も支払っていない注文を発送することは、書くべきエラー経路ではなく、単に表にないことです。"
  - title: "guard と action"
    text: "遷移には満たすべき条件と、通過時に実行する動作を付けられます。表は、入れ子の if の山が隠してしまうものを示します。すべての状態、許されたすべてのイベント、各辺で起きることです。"
  - title: "保存する"
    text: "現在の状態はストアの 1 行なので、再起動しても止まったまさにその場所から続きます。時間もイベントです。誰も支払わない提出済みの注文は、タイマーが鳴ると期限切れになります。"
  - title: "長く走るプロセス"
    text: "承認を何日も待ち、不安定なステップを再試行し、再起動に耐えるプロセスは、耐久性のある history を持つ状態機械です。ワークフローエンジンはその history を再生して状態を組み立て直すので、コードは何日にもわたって断片的に実行されても一本の線のように読めます。"
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

## いつ使うか

- ライフサイクルを持つあらゆる対象。注文、サブスクリプション、文書、ジョブ、接続がそうです。ドメインがすでに「どの状態にある」という言い方をしているなら、状態の名前はすでに決まっており、足りないのは表だけです。
- 次に何が許されるかが今どこにいるかで決まり、その規則を複数のハンドラーに散らすのではなく 1 か所で読みたいとき。
- 待ち、期限、再試行、人の判断を挟むステップがあり、1 つのリクエストより長く生きるプロセスであるとき。こうした処理は 1 つのスレッドで最後まで走らせることができません。
- ある順序が許されるかどうかで 2 人の意見が割れるとき。表があれば、議論は呼び出し箇所を巡ることではなく 5 行をレビューすることになります。

## 注意点

- 状態とイベントを先に決めます。表がそのまま仕様です。ある遷移がないことはバグではなく決定であり、ある遷移と同じくらい簡単に指し示せるべきです。
- 状態と待機中のタイマーをいっしょに保存します。再起動は書き残されたものから組み立て直すべきで、メモリに残ったもので推測してはいけません。`Timer` オブジェクトの中にしかない期限は、そのプロセスとともに消えます。
- 遷移は繰り返しても安全でなければなりません。同じイベントが 2 回届いても機械が 2 回動いてはいけません。イベント id で重複を除くか、ハンドラーが離れようとしている状態を確認するようにします。
- 状態の数に注意します。状態 7 つにイベント 4 つなら表ですが、状態 40 にイベント 30 では誰も読まない図です。集約ごとに機械を分けるか、変わる部分をデータに引き上げてください。
- インスタンスが動いている最中にワークフローのコードを変えるにはバージョン管理が必要です。history を再生して状態を組み立てるエンジンは、古い history を新しいコードに流し直すので、すでに起きたことの形が新しいコードにも理解できるまま残っている必要があります。
- 規模で道具を選びます。プロセス内のライフサイクルにはライブラリ、サービスをまたぐステップにはサガ、何日も待ちと再試行が続くプロセスにはワークフローエンジンです。

## .NET では

`Stateless` は表をコードに移します。機械は渡された 2 つの関数を通して状態を読み書きするので、状態そのものはエンティティの中に残り、ほかのフィールドとともにデータベースへ行きます。

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

`CanFire` こそ表を置く理由そのものです。あるイベントが許されるかを尋ねるのに費用はかからず、その答えは実際に走るはずのハンドラーを読むことに依存しません。

何日も続くプロセスなら、history を自分で保持するエンジンに機械を預けます。Azure Durable Functions、Temporal .NET SDK、Dapr Workflow はいずれも、インスタンスにすでに起きたことを再生して状態を組み立て直します。だからこそオーケストレーションを、タイマーや外部イベントを await する普通の逐次コードとして書きながら、別のマシンで続きを実行できます。ステップが 1 つのプロセスではなく複数のサービスにまたがるなら、サガでつなぎ、調整は MassTransit の状態機械に任せてください。
