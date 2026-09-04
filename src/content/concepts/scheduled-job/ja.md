---
title: "Scheduled Job"
summary: "誰かが頼んだからではなく、時計がそう言ったから始まる作業です。いつ発火するかはスケジュールが持ち、終わったかどうかは別のものが持たなければなりません。"
category: "スケジュールされた作業とワークフロー"
scene: workflow-engine
sceneStep: 1
related:
  - label: Workflow Engine
    slug: workflow-engine
  - label: Background Job
    slug: background-job
  - label: Long-Running Process
    slug: long-running-process
  - label: Durable Workflow
    slug: durable-workflow
  - label: Retryable Step
    slug: retryable-step
  - label: Human Approval
    slug: human-approval
  - label: Leader Election
    slug: leader-election
  - label: Distributed Lock
    slug: distributed-lock
  - label: Competing Consumers
    slug: competing-consumers
  - label: Web Queue Worker
    slug: web-queue-worker
references:
  - title: "Timer trigger for Azure Functions"
    url: https://learn.microsoft.com/en-us/azure/azure-functions/functions-bindings-timer
  - title: "Worker services in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/workers
  - title: "Background tasks with hosted services in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/host/hosted-services
---

シーンの最初のステップには箱が二つあり、二つはまったく違う仕事をしています。Schedule は `daily 02:00` という常設の指示を持っていて、やることは `due` を点け、レーンへ信号を一つ下ろすことだけです。Engine はその信号を受けてインスタンスを開始します。その後のすべては Engine のもので、Schedule が知らせを受けることは二度とありません。この分離がスケジュールされたジョブの核心であり、自分で作るときに潰してしまいがちな部分でもあります。

スケジュールは引き金であって監督ではありません。答える問いはただ一つ、いまがその時刻かどうかで、壁時計で答えます。前回の実行が終わったか、成功で終わったか、まだ走っているか、止まる前にどこまで進んだかは知りません。その答えのどれかが必要なら、レーンの向こう側にある何かがそれを持っていなければなりません。`history` のカードが Schedule の箱ではなく Engine の箱にある理由がそれです。

そのため、スケジュールされたジョブの難しい問いは二つとも重なりについてのものになります。02:00 の実行が 03:00 まで続いて次の発火と重なったらどうなるか。答えを持たないスケジュールは二つ目を始め、いまや二つのプロセスが同じ行を触っています。よくある対処は、二回目の発火を何もしないものにする同時実行ガード、実行中ずっと握るリース、あるいは同時に二つ走っても安全な定義です。どれかを意識して選んでください。多くのスケジューラの既定は「それでも始める」です。

そして、誰も走っていないあいだに予定時刻が過ぎたらどうなるか。デプロイ、ローリング再起動、よりによってその時刻に二十分だけ遮断されたノードといった事情です。遅れてでも発火するスケジューラもあれば、その回をまるごと飛ばすスケジューラもあります。この差は、走った精算と静かに走らなかった精算の差です。知る必要が生じる前に自分のものがどちらかを確かめ、逃した回を取り戻すのか、なかったことにするのかを決めておいてください。

もう半分は、サービスが複数のノードで走るときに一度だけ走らせる問題です。`IHostedService` の中の `PeriodicTimer` はプロセスごとのタイマーなので、レプリカが三つあれば毎晩三回走ります。たいていはジョブを書いた数か月後、三つ目のレプリカを足すときに見つかります。対処は、スケジュールをアプリの外に出すか(スケジューラサービス、cron オブジェクト、タイマートリガーの関数)、タイマーの前段に分散ロックかリーダー選出を置いて、ティックに反応するレプリカを一つに絞ることです。

最後に、スケジュールは記録ではありません。ログ行が残っているのだから「ジョブは 02:00 に走った」で十分だと思いたくなります。しかしログ行が語るのはプロセスが始まったことであって、作業が完了したことではありませんし、Pod が追い出される前に九つのステップのどこまで進んだかはなおさら語りません。このシーンの残りが述べているのはそのことです。時計は何かを始める良い方法です。何が起きたかを知る方法としては最悪です。
