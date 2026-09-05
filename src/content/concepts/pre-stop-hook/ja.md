---
title: "Pre-Stop Hook"
summary: "SIGTERM の直前にプラットフォームがコンテナーの中で実行するコマンドです。このポッドをまだ指しているルーティングテーブルが追いつくあいだ、ポッドをじっと止めておくためにあり、それはアプリケーションが自分ではできない唯一のことです。"
category: "コンテナーとオーケストレーション"
scene: pod-disruption-budget
sceneStep: 2
related:
  - label: Pod Disruption Budget
    slug: pod-disruption-budget
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: SIGTERM
    slug: sigterm
  - label: Termination Grace Period
    slug: termination-grace-period
  - label: Readiness Probe
    slug: readiness-probe
  - label: Connection Draining
    slug: connection-draining
  - label: Rolling Update
    slug: rolling-update
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
references:
  - title: "Container Lifecycle Hooks"
    url: https://kubernetes.io/docs/concepts/containers/container-lifecycle-hooks/
  - title: "Attach Handlers to Container Lifecycle Events"
    url: https://kubernetes.io/docs/tasks/configure-pod-container/attach-handler-lifecycle-event/
  - title: "Pod Lifecycle"
    url: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/
---

フックはシグナルより先に動き、儀式の中でアプリケーションが自分では行わない唯一の部分です。ポッドが削除対象になると 2 つのことが同時に始まりますが、終わる速さは同じではありません。このノードの kubelet がコンテナーの終了を始め、エンドポイントコントローラーがこのポッドを指すすべての Service からポッドを外し始めます。2 つ目はクラスターのすべてのノードへの一斉通知で、それが届くまでは、どこかの kube-proxy や Ingress がこのポッドをまだリクエストの送り先として良い場所だと信じています。

フックは、その一斉通知に競走を勝たせるための停止です。シーンでは、ポッドのバッジが `preStop` を示し `req` の数が落ちていく区間です。削除によってこのポッドのエンドポイントにはすでに terminating の印が付き、ルーティングテーブルが 1 つずつポッドを外しているので新しい仕事は届かず、すでに受けたリクエストは抜けていきます。その中で気の利いたことは何も起きません。圧倒的に多い実装は sleep ですが、それは足りない機能の回避策ではなく、それ自体が機能です。「もうすべてのルーティングテーブルが私のことを聞いた」と教えてくれるイベントをポッドが購読する方法はないので、伝播を覆うだけ長い停止が正直な答えです。

時間について書き留めておくことが 2 つあります。フックは同期的です。フックが戻るまで SIGTERM は送られないので、フックが使う時間はそのあとのすべてと同じ予算から出ていきます。`terminationGracePeriodSeconds` はフックとシャットダウンの両方を覆う必要があり、猶予期間いっぱい眠るフックはアプリケーションに時間を少しも残さず、正常終了を SIGKILL に変えてしまいます。そしてフックの時計は SIGTERM ではなく削除の時点で始まるので、アプリが仕上げるのにかかる時間だけで計算した猶予は、いつも少し足りません。

フックは SIGTERM の処理の代わりでもありませんし、仕事をする場所でもありません。コンテナーの中で動くので `sleep` にはシェルかそれを提供するバイナリーが要りますが、distroless イメージにはそれがないことで有名です。`sleep` はそれ自体が独立したフックの種類で、Kubernetes 1.30 からベータとして既定で有効になり、1.32 で安定版になりました。シェルもバイナリーも要りません。失敗はイベントとして記録されたあと無視されるので、0 以外で終わるフックは静かに「フックなし」へと落ちます。フックの中でバッファーを流したりサービスレジストリーから登録を外したりしているなら、エラーが見える `ApplicationStopping` へ移してください。フックには、プラットフォームの順序だけが可能にするその 1 つの仕事だけを残します。じっと立っていることです。
