---
title: "Connection Draining"
summary: "コネクションドレイニングとは、インスタンスがルーティング表から外れる時点と、実際に閉じる時点との間の区間です。新しい仕事はもう回されませんが、すでに受けたものは処理し続け、それが終わってから消えます。この区間があるのは、ルーティング表が写しであり、写しが追いつくのに時間がかかるからです。"
category: "コンテナーとオーケストレーション"
scene: rolling-update
sceneStep: 3
related:
  - label: Rolling Update
    slug: rolling-update
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: Pre-Stop Hook
    slug: pre-stop-hook
  - label: Termination Grace Period
    slug: termination-grace-period
  - label: Load Balancer
    slug: load-balancer
  - label: Health-Based Routing
    slug: health-based-routing
  - label: Sticky Session
    slug: sticky-session
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
references:
  - title: "Kubernetes: EndpointSlices"
    url: https://kubernetes.io/docs/concepts/services-networking/endpoint-slices/
  - title: "Kubernetes: pod termination"
    url: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/
  - title: "ASP.NET Core: host shutdown"
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/host/generic-host
---

3 番目のステップの隙間を見てください。pod は停止を告げられているのに、その pod のチップは endpoints の一覧でもう少しだけ点いたままで、それから暗くなります。その間、壊れているものは何もありません。決定が振り分ける側に届くまでにかかる時間というだけで、その間に届いたリクエストは、すでに出ていけと言われた pod へ今も送られます。

ドレイニングが存在する理由はまるごとこれです。Service も、ロードバランサーも、サイドカーのプロキシも、解決したアドレスをキャッシュするすべてのクライアントも、同じ一覧の写しを持っており、その一覧は伝わっていく通知で更新されます。SIGTERM を受けた瞬間にリスナーを閉じる pod は、まだいくつもの写しが自分の名前を載せている間に閉じているのであり、その写しから振り分けられたリクエストはすべて接続拒否を受けます。この失敗はデプロイの不具合に見えますし実際そうなのですが、不具合はデプロイの側にはありません。削除が即座に終わるという前提の側にあります。

直し方は、必要だと感じるより少しだけ長く応答し続けることです。数秒眠る `preStop` フックがまさにそれを行います。Kubernetes は SIGTERM を送る前にこのフックを実行するので、endpoints からの削除が伝わっている間もコンテナーは聞き続けています。5 秒がよくある出発点ですが、魔法の数字ではありません。実際に観測した伝播時間より長くする必要があり、API サーバーが忙しい大きなクラスターでは、小さなクラスターより長くなります。

リスナーが実際に閉じたあとのドレイニングは、すでに処理中のものについての話になります。HTTP は簡単です。リクエストは届いたか届いていないかのどちらかで、届いたものを終えるには、そのうち最も遅いものと同じだけかかります。keep-alive の接続はそれほど簡単ではありません。接続はリクエストとリクエストの間は遊んでおり、それを丁寧に閉じるとは、途中で切るのではなく次の応答に `Connection: close` を載せるということです。ホストが停止中なら ASP.NET Core がこれを代わりに行います。そのうえで残るのが、リクエストと応答の形にまったく当てはまらないトラフィックです。

長く張り続ける接続は、空になるのではなく期限切れになります。WebSocket も、SignalR のハブ接続も、サーバーストリーミングの gRPC 呼び出しも、開いたままでいるように作られているので、終わるのを待つことは猶予期間を越えて待ち、結局殺されることを意味します。答えは意図的に閉じることです。`ApplicationStopping` でそのプロトコルの別れの挨拶を送り、クライアントに再接続させれば、クライアントはまだ残っている pod へつなぎます。自分から再接続するクライアントがいるかどうかが、ユーザーの気づかないデプロイと、開いていたページがすべて静かになるデプロイとを分けます。

同じ形は HTTP の外にもあります。キューのコンシューマーは先読みをやめ、手元のものを確認応答して空にします。ロードバランサーのターゲットグループは draining 状態へ移り、登録解除の遅延を待って空にします。3 つとも、インスタンスは消える前にまず新しい仕事から見て届かない状態になり、その 2 つの事実の間の区間こそ調整する価値のある部分です。
