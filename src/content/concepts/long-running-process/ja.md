---
title: "Long-Running Process"
summary: "長時間実行プロセスは、自分を始めたリクエストより、たいていは自分を始めたプロセスよりも長く生きる仕事です。状態はメモリーの外に置く必要があり、待ちは止まったスレッドではなく期限でなければならず、すべてのステップはもう一度実行しても安全でなければなりません。"
category: "スケジュールされた作業とワークフロー"
scene: state-machine
sceneStep: 4
related:
  - label: State Machine
    slug: state-machine
  - label: Durable Workflow
    slug: durable-workflow
  - label: Human Approval
    slug: human-approval
  - label: Workflow Engine
    slug: workflow-engine
  - label: Retryable Step
    slug: retryable-step
  - label: Scheduled Job
    slug: scheduled-job
  - label: Background Job
    slug: background-job
  - label: Idempotency
    slug: idempotency
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: Saga
    slug: saga
references:
  - title: "Web-Queue-Worker architecture style"
    url: https://learn.microsoft.com/en-us/azure/architecture/guide/architecture-styles/web-queue-worker
  - title: "Implement background tasks in microservices with IHostedService"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/microservices/multi-container-microservice-net-applications/background-tasks-with-ihostedservice
  - title: "Durable Functions overview"
    url: https://learn.microsoft.com/en-us/azure/durable-task/durable-functions/durable-functions-overview
---

ただ時間がかかる仕事と長時間実行プロセスを分けるものが 3 つあります。自分の外にある何かを待つので、かかる時間はコードの速さでは決まりません。デプロイをまたいで生きるので、コードのどの版も最初から最後まで所有できません。そして常識的なタイムアウトのどれよりも長いので、上流の誰も答えを待って接続を開いたままにはできません。

3 つはそれぞれ何かを強制します。外の世界を待つので、待ちは止まったスレッドではなく保存された期限でなければなりません。リクエストハンドラーの中の `Task.Delay` ではなく、スケジューラーが気づく満了時刻を持った行です。2 日間止めたスレッドは最初の再起動で失われるスレッドであり、再起動は必ず来ます。デプロイをまたぐので、状態はそれより長く残る場所に書き残す必要があり、現在のステップはプログラムカウンターではなくストアの値でなければなりません。回線で待っている人がいないので、呼び出し側には仕事が始まった時点で受領証を、あとで結果を知る手段を渡す必要があります。だからプロセスは最初の瞬間から自分の識別子を持たなければなりません。

シーンのステートマシンは、それを実際の形にしたものです。プロセスが止まりうるすべての地点が名前の付いた状態で、それを次へ動かすすべてがイベントで、現在の状態は 1 行です。イベントが別のサービスからのメッセージでも、人が承認を押したことでも、タイマーが満了したことでも変わりません。どれも同じ経路で届き、同じ表で引かれます。プロセスがどのステップにいるかは、コードが今どこにいるかに暗黙のうちに含まれてはいません。ほとんどの時間、走っているコードはそもそも存在しないからです。

見くびられがちなのは、すべてのステップが 2 回実行されても安全でなければならない点です。ワーカーは仕事をコミットしたあと、それを記録する前に落ちることがあり、そうなると次のワーカーが同じステップをもう一度拾います。答えは障害の窓を狭めることではありません。その窓は閉じられないからです。繰り返しを無害にすることです。インスタンスとステップから導いた鍵をステップごとに与え、ステップが最初にする仕事を、その効果がすでにあるかどうかの確認にしてください。

ツールの選択は待ちの形に従います。キューに載ったメッセージが大きな間隔なくつながる鎖なら、キューを読むバックグラウンドサービスで足ります。待ちが日単位で、ステップごとに再試行があり、何千ものインスタンスについて「今どこまで進んだか」を同時に答える必要があるなら、それがワークフローエンジンの存在理由です。その仕掛けを自分で作るとは、history と再生、タイマー、バージョン管理まで自分で作るということです。
