---
title: "Liveness Probe"
summary: "liveness probe は、答えが再起動である検査です。このプロセスがそもそも存在し続けてよいかを問い、続けて十分な回数断られると kubelet がコンテナーを殺して起動し直します。乱暴な処方なので、尋ねる相手はプロセス自身だけに限るべきです。"
category: "コンテナーとオーケストレーション"
scene: readiness-probe
sceneStep: 3
related:
  - label: Readiness Probe
    slug: readiness-probe
  - label: Health Check
    slug: health-check
  - label: Health-Based Routing
    slug: health-based-routing
  - label: Rolling Update
    slug: rolling-update
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: Horizontal Pod Autoscaler
    slug: horizontal-pod-autoscaler
  - label: Resource Limit
    slug: resource-limit
  - label: Load Balancer
    slug: load-balancer
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
  - label: Connection Draining
    slug: connection-draining
references:
  - title: "Kubernetes: liveness, readiness and startup probes"
    url: https://kubernetes.io/docs/concepts/workloads/pods/probes/
  - title: "Kubernetes: configure liveness, readiness and startup probes"
    url: https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/
  - title: "ASP.NET Core: health checks"
    url: https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/health-checks
---

シーンの 3 番目のステップがこの概念のすべてです。プロセスが答えなくなり、liveness のレーンが拒否で埋まり、続けて 3 回目のところで kubelet がコンテナーを殺して起動し直します。再起動カウンターが増え、ポッドは `restarting` と言い、次に `starting` と言い、readiness は新しいインスタンスが一度通るまでトラフィックを止めておきます。この流れはどこも読む値打ちがありますが、大事なのは最初の部分です。liveness が下す結論はいつも 1 つだけ、このプロセスは待っても助からない、ということです。

これから書く liveness の検査には、そこから出てくる試験を当てます。この検査が報告しようとしている状態を、再起動は直してくれるか。スレッドプールのデッドロック、ロックで動かなくなったイベントループ、回復不能なまで壊れたネイティブヒープ、抜け出せない状態に達したステートマシンは、いずれもプロセスが動いていて、これからも動き続け、二度と前へ進まない状態です。こういうときは殺すのが本当に最短の復帰路です。接続を断っているデータベースはそこには入りません。長くなったキューも、遅くなった下流サービスも、期限切れの証明書も同じです。どの場合もプロセスは無事で、再起動はコールドスタート以外に何も達成しません。

シーンの 4 番目のステップは、その線を越えたときに何が起きるかを見せます。役に立たないどころではなく、それより悪い結果になります。liveness を共有の依存先に向けた時点で、すべてのレプリカが同じ引き金につながります。依存先が一度揺れると、すべてのポッドが同時に liveness に失敗し、全体が一斉に再起動します。処理能力は 0 になり、キャッシュはすべて冷え、コネクションプールはすべて、すでに苦しんでいたその依存先へ開き直され、依存先が回復しないかぎり再起動は続きます。プラットフォームが小さな揺れから作り出した障害です。配線を readiness へ移したあとの同じ揺れは、いくつかのポッドが静かにローテーションから外れている以上のことを何も起こしません。

起動の遅さは、この概念を取り違えるもう 1 つの典型です。起動に 90 秒かかるプロセスは、定常状態に合わせた liveness probe に殺され、次の試行でも殺され、ポッドはイメージが壊れているように見えるクラッシュループに座り込みます。起動が収まるまで liveness probe を緩めたくなりますが、90 秒の起動に耐えられるほど寛容なプローブは、本当に固まったプロセスを 90 秒放置するにも十分寛容です。答えは startup probe です。自分専用の潤沢な予算を持ち、それが通るまで liveness は始まらず、それぞれのプローブが自分に合った設定を保てます。

エンドポイントはごく単純に保ちます。`/healthz/live` はプロセス以外に何も触らないようにします。データベースもキャッシュも、外向きの呼び出しも、詰まる可能性のある依存性注入のグラフも通しません。ASP.NET Core では、liveness のタグを付けた検査が無条件に正常を返すか、何らかのバックグラウンド部品が自分で行き詰まったと判断したときに立てるフラグを読む程度です。そうした検査が報告する内容に価値はありません。価値は、リクエストが処理されたという事実そのものにあります。ホストがまだ接続を受け付け、まだコードを動かしている証拠だからです。

最後に、再起動カウンターそのものを 1 つの信号として見ます。着実に増えていく再起動は、効いていない処方をプラットフォームが試し続けているという合図であり、しきい値を伸ばすのが解決になることはまずありません。プロセスが本当に固まっているなら、不具合はプローブより上流にあります。そうでなければ、プローブはもともと liveness ではなかった質問に答えています。シーンはカウンターが止まり、ポッドが生きたまま終わります。配線を移したあとは、以前ならすべてを再起動させていた同じ障害がポッドをローテーションから外すだけになり、依存先が戻った瞬間にポッドも戻ってきます。
