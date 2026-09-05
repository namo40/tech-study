---
title: "Termination Grace Period"
summary: "ポッドが止まれと告げられてから、そのまま殺されるまでに与えられる時間です。ゆとりではなく期限です。時間が尽きたときに終わっていないものは、終わる機会を得られません。"
category: "コンテナーとオーケストレーション"
scene: pod-disruption-budget
sceneStep: 3
related:
  - label: Pod Disruption Budget
    slug: pod-disruption-budget
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: SIGTERM
    slug: sigterm
  - label: Pre-Stop Hook
    slug: pre-stop-hook
  - label: Connection Draining
    slug: connection-draining
  - label: Readiness Probe
    slug: readiness-probe
  - label: Rolling Update
    slug: rolling-update
  - label: Blue-Green Deployment
    slug: blue-green-deployment
references:
  - title: "Pod Lifecycle"
    url: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/
  - title: ".NET Generic Host: host shutdown"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/generic-host
  - title: "HostOptions.ShutdownTimeout"
    url: https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.hosting.hostoptions.shutdowntimeout
---

シーンの 3 番目のステップに出てくるリングがこの数で、まず知るべきなのはその時計がいつ始まるかです。SIGTERM が届いたときではなく、ポッドが削除対象になったときに始まります。preStop フックもその中で動き、シグナルもその中で送られ、アプリケーション自身のシャットダウンは残った時間の中で起きます。だから「自分のアプリが止まるのにどれだけかかるか」だけで決めた猶予は、いつもフックの長さのぶん足りません。それが、デプロイのたびにリクエストを 1 つ落とすサービスを作る間違いです。

2 つ目に知るべきなのは、これが期限であって、それより柔らかい何かではないということです。時間が尽きるとコンテナーは SIGKILL を受け取り、それは捕まえられず、プロセスは命令と命令のあいだで止まります。フラッシュも、最後のログ 1 行も、`finally` ブロックも、途中まで処理していたメッセージを ack（確認応答）する機会もありません。期限を越えたシャットダウンは遅いシャットダウンではなく、予定されていたクラッシュです。シーンではポッドが時間を残して終え、`SIGKILL` の印はそのあとに少しだけ現れて、通らなかった道を見せるだけです。

値を決めるのは推測ではなく測定であり、測るべきは平均ではなく最も長い正直なシャットダウン時間です。preStop の停止、進行中の仕事が終わるのに要る時間、抱えているものを返す時間を足し、そのうえで中央値ではなくテールを取ります。これが成り立つかどうかを決めるのは遅いほうのリクエストだからです。p99 が 200 ミリ秒で p999 が 8 秒のワークロードには、8 秒から作った猶予が必要です。既定は 30 秒で、ステートレスな API には十分ですが、長く回るバッチを抱えたコンシューマーにはまるで足りません。

コンテナーの内側では、.NET の `HostOptions.ShutdownTimeout` が一段下の同じ考え方であり、2 つには順序が要ります。ホストのタイムアウトはプラットフォームの猶予時間より確実に小さく、余裕も実際に持たせます。アプリケーションは数秒を残して自分のやり方で片付けを終えるべきで、片付けの途中でプラットフォームに断ち切られてはいけません。5 秒ほどの余裕が出発点として無難で、順序を逆にしたときの症状は「stopping」を残してそのあと何も残さないシャットダウン経路です。

つまずきやすい小さなことが 2 つあります。この値はポッドの属性なので、変えることは即時の編集ではなく新しいロールアウトです。そして削除の側からこの値を無視できます。`kubectl delete --grace-period=0 --force` は儀式全体を飛ばし、プロセスが止まったかどうかにかかわらず API サーバーからオブジェクトを消します。それは固まったノードのための道具であって、デプロイを速くする方法ではありません。
