---
title: "Durable Workflow"
summary: "耐久性ワークフローは、進み具合を起きた端から書き残しておくプロセスです。だから障害のあとでも組み立て直せ、止まった場所から続けられます。コードは順に読めますが、エンジンはそれを記録に変えます。"
category: "スケジュールされた作業とワークフロー"
scene: state-machine
sceneStep: 4
related:
  - label: State Machine
    slug: state-machine
  - label: Long-Running Process
    slug: long-running-process
  - label: Human Approval
    slug: human-approval
  - label: Workflow Engine
    slug: workflow-engine
  - label: Retryable Step
    slug: retryable-step
  - label: Idempotency
    slug: idempotency
  - label: Saga
    slug: saga
  - label: Azure Durable Functions
    slug: azure-durable-functions
  - label: Temporal
    slug: temporal
  - label: Dapr Workflow
    slug: dapr-workflow
references:
  - title: "Durable Functions overview"
    url: https://learn.microsoft.com/en-us/azure/durable-task/durable-functions/durable-functions-overview
  - title: "Durable orchestrations: code constraints"
    url: https://learn.microsoft.com/en-us/azure/durable-task/common/durable-task-code-constraints
  - title: "Temporal .NET SDK"
    url: https://docs.temporal.io/develop/dotnet
---

シーンの 4 番目のステップは、機械の下に history の帯と、その上を掃くバーを置きます。あの帯がこの考え方のすべてです。耐久性ワークフローは進み具合を呼び出しスタックに置きません。呼び出しスタックは、それを抱えているプロセスより長くは生きられないからです。代わりに、すでに起きたことを追記するだけの一覧として保ちます。このステップが予約された、このステップがこの値を返した、このタイマーが仕掛けられた、この外部イベントが届いた。

その一覧を走っているプロセスに戻すのが再生です。インスタンスを再開する必要があるとき、エンジンはオーケストレーションのコードを先頭から実行し直しますが、コードが行うすべての呼び出しは実際に実行される代わりに history から答えを受け取ります。すでに値を返したステップは記録された結果をただちに返し、すでに鳴ったタイマーはすぐに完了し、すでに届いたイベントを待つ箇所はそれをそのまま受け取ります。コードはすでに済ませたことを一気に走り抜け、まだ起きていない最初の地点にたどり着いてそこで止まります。外から見れば再開であり、中から見れば過去を手渡されて実行し直されただけです。

この仕組みはそのまま制約になります。再生が同じ順序を生むにはコードが決定的でなければならないので、オーケストレーションは時計を読んだり、乱数や新しい識別子を作ったり、外部を直接呼び出したりできません。決定的でないものはすべてエンジンを通し、エンジンが一度だけ実行して答えを記録します。`Task.Delay` ではなく耐久性タイマー、`HttpClient` の呼び出しではなくアクティビティ、`Guid.NewGuid()` ではなくエンジンが与える識別子です。ほかの場所なら何の問題もない普通のコードが、ここでは誤りになります。しかもその誤りは、何日か後にインスタンスが再生されるまで表に出ません。

2 つ目の帰結はバージョン管理です。先週始まったインスタンスは先週のコードに合わせて書かれた history であり、新しいコードが違うステップを違う順で予約するなら、その history を新しいコードで再生したときに食い違います。エンジンはこれを検出し、インスタンスを壊す代わりに停止します。逃げ道はどれも意図して選ぶものです。新しい版を配る前に既存のインスタンスを流し切る、エンジンが与えるバージョン印でオーケストレーションの中を分岐させる、新しいワークフロー型を作って古いほうは使われなくなるまで動かし続ける、のいずれかです。

その手間と引き換えに得られるのは、history そのものを失わない限り何にでも耐えるプロセスです。2 日間の待ちの最中の配置換えは事故ではありません。落ちたワーカーの仕事は別のワーカーが拾います。そして history は何が起きたかについてのログ文ではなく、起きたことそのものの記録なので、動いているすべてのインスタンスの状態を問い合わせられます。どの注文が承認を待ち、どれだけ待っているかを、追跡用のコードを足さずに尋ねられます。
