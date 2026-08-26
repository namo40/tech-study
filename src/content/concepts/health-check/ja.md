---
title: "Health Check"
summary: "health check は、監督役が一定の間隔で呼び出し、その先にあるインスタンスについて何かを決めるための小さなエンドポイントです。仕組みはいつも同じで、尋ね、待ち、答えを数えます。違うのは、そして重要なのは、何を尋ねたかと、呼び出した側がその答えで何をするかです。"
category: "コンテナーとオーケストレーション"
scene: readiness-probe
sceneStep: 1
related:
  - label: Readiness Probe
    slug: readiness-probe
  - label: Liveness Probe
    slug: liveness-probe
  - label: Health-Based Routing
    slug: health-based-routing
  - label: Load Balancer
    slug: load-balancer
  - label: Rolling Update
    slug: rolling-update
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: Horizontal Pod Autoscaler
    slug: horizontal-pod-autoscaler
  - label: Connection Draining
    slug: connection-draining
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
  - label: Resource Limit
    slug: resource-limit
references:
  - title: "Kubernetes: liveness, readiness and startup probes"
    url: https://kubernetes.io/docs/concepts/workloads/pods/probes/
  - title: "ASP.NET Core: health checks"
    url: https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/health-checks
---

シーンの 1 段目は、あらゆる health check が乗っている骨組みを見せています。部品は 4 つだけです。周期、タイムアウト、しきい値、そして判定を受けて動く何かです。監督役が数秒ごとに尋ね、答えが届くまで少し待ち、続けて断られた回数を数え、その数がしきい値に届いたら設定どおりのことをします。この骨組みに Kubernetes 固有のものは 1 つもありません。バックエンドプールをポーリングするロードバランサー、古くなったエントリーを期限切れにするサービスレジストリ、リーダーを見張るクラスターマネージャーは、どれも最後の動詞だけが違う同じループです。

だから面白い問いは、エンドポイントをどう書くかではありません。そのエンドポイントが何に答えるべきか、であり、区別する値打ちのある答えは実質 2 つしかありません。1 つはプロセスについてです。まだそこにいるか、まだコードを動かせるか。もう 1 つはサービスについてです。今この瞬間、リクエストを役に立つ形で処理できるか。この 2 つは絶えず食い違い、深刻なプローブの不具合はどれも、一方を尋ねるべき場所で他方を尋ねた事例です。キャッシュを充填中の pod は生きていますが処理はできません。データベースに届かない pod は、できることとできないことが混ざっているのが普通です。ロックでデッドロックした pod はどちらでもありません。

しきい値は、既定値のまま置いておいて後で驚くことになりがちな部分です。1 回失敗しただけで動く値打ちはほとんどありません。パケットが 1 つ落ちたこと、ガベージコレクションで止まったこと、再デプロイの最中に届いたプローブは、サンプル 1 つで見れば本物の故障とまったく同じ形をしているからです。そこで監督役は数えます。続けて 3 回、5 回、設定した回数です。代償は、反応がしきい値かける周期のぶん遅れることであり、その間、監督役は古い情報のまま動き続けます。シーンでも、その区間のあいだ中トラフィックはその pod に届き続けます。実運用で起きることがまさにそれであり、だからこの数字は受け継ぐのではなく選ぶ値打ちがあります。

タイムアウトも同じだけの注意に値します。タイムアウトがない検査、あるいは周期より長いタイムアウトの検査は、遅い依存先 1 つを重なり合ったプローブの行列に変え、ただ遅かっただけのインスタンスを、自分の監督役に叩かれるインスタンスに変えます。検査には間隔より短い期限を与え、呼び出した側が切ってくれるのを当てにせず、検査自身がその期限を守るようにします。

検査は軽く保ち、何に触れたかについて正直に保ちます。軽く保つのは、すべてのインスタンスで毎秒何度も永遠に走るからです。接続を開き、クエリを流し、レポートを直列化する検査は、台数とともに大きくなる背景の負荷生成器です。正直に保つのは、何も見ずに正常を返す検査が、検査がないことより悪いからです。そういう検査は監督役に、稼いでいない自信を与えます。そして隠された故障は、インスタンスが静かにプールから抜ける形ではなく、利用者へのエラーとして表に出ます。

最後に、検査はデバッグ用のページではなく、契約のあるインターフェイスとして扱います。消費者は 1 つだけ、呼ぶのは機械、語彙の全体はステータスコード 1 つです。詳しい内容は人が読めるログとメトリクスに置き、監督役がポーリングするエンドポイントは、筋道を追えるほど小さく、無視できるほど安く、そして「いいえ」と答えたときに 2 つの質問のどちらに答えたのかが分かるほど明確に保ちます。
