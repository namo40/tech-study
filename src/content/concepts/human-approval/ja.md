---
title: "Human Approval"
summary: "人の承認は、人が決めるまで待つステップです。サービス水準の約束がない外部イベントなので、待つための状態と期限、そして期限が過ぎたときに何をするかが必要になります。"
category: "スケジュールされた作業とワークフロー"
scene: state-machine
sceneStep: 4
related:
  - label: State Machine
    slug: state-machine
  - label: Durable Workflow
    slug: durable-workflow
  - label: Long-Running Process
    slug: long-running-process
  - label: Workflow Engine
    slug: workflow-engine
  - label: Scheduled Job
    slug: scheduled-job
  - label: Timeout
    slug: timeout
  - label: Idempotency
    slug: idempotency
  - label: Saga
    slug: saga
  - label: Azure Durable Functions
    slug: azure-durable-functions
  - label: Temporal
    slug: temporal
references:
  - title: "Durable orchestrations overview"
    url: https://learn.microsoft.com/en-us/azure/durable-task/common/durable-task-orchestrations
  - title: "Wait for external events in durable orchestrations"
    url: https://learn.microsoft.com/en-us/azure/durable-task/common/durable-task-external-events
  - title: "Temporal signals"
    url: https://docs.temporal.io/encyclopedia/workflow-message-passing
---

承認は、名前に値するタイムアウトがないことに気づくまでは、別のサービスの呼び出しのように見えます。サービスは 1 秒で答えるか失敗したかのどちらかですが、人は 1 時間後に答えることもあれば、月曜に答えることも、2 回催促されてから答えることもあります。そのどれも失敗ではありません。承認を呼び出しではなく状態にするのは、この違い 1 つです。

だからプロセスは止まります。何を待っているかを言う状態へ移り、その状態を書き残し、実行をやめます。シーンの 4 番目のステップが見せているとおりで、注文は `Paid` に立ち、エンジンのステップ表示は `wait for approval` です。スレッドも接続も押さえていないので、群のすべてのマシンが再起動しても生き延びる必要があるのはその 1 行だけです。人が結局どうしたかは普通のイベントとして届き、ほかのすべてのイベントと同じ表で引かれ、機械を次へ動かします。

終わりのない待ちは漏れなので、承認には待ちが始まるのと同じ瞬間に仕掛けられる期限が必ず付きます。面白い設計の問いは、その期限が何をするかです。よくある答えはエスカレーションです。2 人目の承認者や最初の承認者の上長に割り当て直し、新しい期限を仕掛けます。自動承認は価値の小さい決定には妥当ですが、それ以外では負債になります。何かを許すかどうかの決定なら、自動却下がいちばん安全です。どれを選ぶにせよ、それは待機状態から `timeout` イベントで出る遷移として表の中にあるべきです。そうしてはじめて、表を掃くバックグラウンドジョブの都合でそうなった偶然ではなくなります。

実務で厄介なのはたいてい 2 つです。1 つ目は、承認が 2 回届くことです。誰かがメールのリンクを押し、携帯からもう一度押します。あるいは決定が済んだあとに催促メールへ答えます。ハンドラーは離れようとしている状態を前提にせず確認しなければなりません。そうでないと、同じ承認がすでに動いた機械をもう一度動かします。2 つ目は、人は去るということです。個人あての承認は、計画よりずっと頻繁にその人のアカウントより長く生き残るので、承認は役割あてにし、通知を送る時点で役割を人に解決してください。

最後に、記録をログではなく機能の一部として扱ってください。誰が、いつ、リクエストのどの版に対して承認し、そのとき何を見ていたかは、あとから必ず出る問いであり、永続ワークフローはすでにその答えとなる history を持っています。ただし承認者が何を見ていたかだけはそれ自体では答えられないので、今の画面が見せているものへのリンクではなく、決定の入力そのものをイベントに入れてください。
